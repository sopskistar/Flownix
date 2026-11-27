import {
  AlphaProvider,
  HttpClient,
  preferredAlphaPair,
  withRequestPolicy,
  hashResponse,
} from "@flownix/core";
import {
  sqlClient,
  jsonParam,
  auditRequest,
  workerRequestPolicy,
} from "@flownix/db";

/** Explicit owner quote refresh only. No RPC, background loop, depth or history. */
export async function refreshMarketQuote(tokenId: string) {
  const sql = sqlClient();
  const [token] =
    await sql`SELECT * FROM alpha_tokens WHERE id=${tokenId} AND status='current'
    AND last_seen>now()-interval '12 hours'`;
  if (!token?.alpha_id)
    throw Error(
      "Recent official registry identity required; wait for the next duty window.",
    );
  const pairs =
    await sql`SELECT symbol,alpha_id AS "baseAsset",quote_asset AS "quoteAsset",status FROM market_symbols
    WHERE alpha_id=${token.alpha_id} AND active AND observed_at>now()-interval '12 hours'`;
  const pair = preferredAlphaPair(
    token.alpha_id,
    pairs as unknown as Parameters<typeof preferredAlphaPair>[1],
  );
  if (!pair)
    throw Error(
      "No recently verified official Alpha pair; no substitute price used.",
    );
  const reservation = await sql.begin(async (tx) => {
    // Serializes all Vercel instances. Reservations survive crashes and are not refunded.
    await tx`SELECT pg_advisory_xact_lock(726034)`;
    const recent =
      await tx`SELECT id FROM market_snapshots WHERE token_id=${tokenId} AND source_kind='alpha_market'
      AND observed_at>now()-interval '5 minutes' AND provider_time>now()-interval '5 minutes' AND provider_time<=now()+interval '30 seconds' LIMIT 1`;
    if (recent.length) return false;
    const locks = await tx`SELECT key FROM api_rate_limits WHERE
      (key='owner:quote:global' AND window_start>now()-interval '1 minute') OR
      (key=${`owner:quote:${tokenId}`} AND window_start>now()-interval '5 minutes')`;
    if (locks.length)
      throw Error("Quote refresh cooling down; try again later.");
    const day =
      await tx`INSERT INTO api_rate_limits(key,window_start,hits) VALUES('owner:quote:day',date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC',1)
      ON CONFLICT(key) DO UPDATE SET hits=CASE WHEN api_rate_limits.window_start<date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' THEN 1 ELSE api_rate_limits.hits+1 END,
      window_start=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' RETURNING hits`;
    const month =
      await tx`INSERT INTO api_rate_limits(key,window_start,hits) VALUES('owner:quote:month',date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC',1)
      ON CONFLICT(key) DO UPDATE SET hits=CASE WHEN api_rate_limits.window_start<date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' THEN 1 ELSE api_rate_limits.hits+1 END,
      window_start=date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' RETURNING hits`;
    if (month[0].hits > 24)
      throw Error(
        "Monthly owner quote budget reached (24); wait for a worker quote.",
      );
    if (day[0].hits > 6)
      throw Error(
        "Daily owner quote budget reached (6); wait for the next duty window.",
      );
    for (const key of ["owner:quote:global", `owner:quote:${tokenId}`])
      await tx`INSERT INTO api_rate_limits(key,window_start,hits) VALUES(${key},now(),1) ON CONFLICT(key) DO UPDATE SET window_start=excluded.window_start,hits=1`;
    return true;
  });
  if (!reservation)
    return "A verified quote was already collected within five minutes.";
  const ticker = await withRequestPolicy(workerRequestPolicy(), () =>
    new AlphaProvider(
      new HttpClient(
        "binance_alpha",
        30,
        auditRequest,
        undefined,
        undefined,
        1,
      ),
    ).ticker(pair.symbol),
  );
  if (
    ticker.data.symbol !== pair.symbol ||
    !/^\d+(\.\d+)?$/.test(ticker.data.lastPrice) ||
    Number(ticker.data.lastPrice) <= 0 ||
    !Number.isFinite(ticker.data.closeTime)
  )
    throw Error(
      "Official quote identity or price invalid; earlier observations preserved.",
    );
  const providerTime = new Date(ticker.data.closeTime).toISOString();
  await sql.begin(async (tx) => {
    await tx`INSERT INTO source_responses(hash,provider,source,observed_at,server_date,payload,raw_text)
      VALUES(${hashResponse(ticker.raw)},'binance_alpha',${ticker.source},${ticker.observedAt},${ticker.serverDate},${jsonParam(JSON.parse(ticker.raw))}::jsonb,${ticker.raw}) ON CONFLICT(hash) DO NOTHING`;
    await tx`INSERT INTO market_snapshots(token_id,symbol,source,source_kind,quote_asset,observed_at,provider_time,price,change_24h,volume_24h,response_hash,raw)
      VALUES(${tokenId},${pair.symbol},${ticker.source},'alpha_market',${pair.quoteAsset},${ticker.observedAt},${providerTime},${ticker.data.lastPrice},${ticker.data.priceChangePercent},${ticker.data.quoteVolume},${ticker.hash},${jsonParam(JSON.parse(ticker.raw))}::jsonb)`;
    await tx`INSERT INTO market_coverage(token_id,pair_symbol,quote_asset,status,provider,checked_at,observed_at,raw)
      VALUES(${tokenId},${pair.symbol},${pair.quoteAsset},'observed','binance_alpha',${ticker.observedAt},${ticker.observedAt},${jsonParam({ responseHash: ticker.hash, trigger: "explicit_owner_quote" })}::jsonb)
      ON CONFLICT(token_id) DO UPDATE SET pair_symbol=excluded.pair_symbol,quote_asset=excluded.quote_asset,status='observed',checked_at=excluded.checked_at,observed_at=excluded.observed_at,error_code=null,raw=excluded.raw`;
  });
  return `Official ${pair.symbol} quote collected. Provider ${providerTime}; local ${ticker.observedAt}. Blockchain coverage unchanged.`;
}
