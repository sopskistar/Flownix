import {
  FuturesProvider,
  HttpClient,
  exactFuturesAssociation,
  providerReads,
  type FuturesAssociation,
} from "@flownix/core";
import {
  sqlClient,
  auditRequest,
  saveSource,
  jsonParam,
  setSetting,
} from "@flownix/db";

export async function derivativesSync() {
  const sql = sqlClient();
  const rows =
    await sql`SELECT a.*,t.chain_id,t.contract,t.status FROM futures_associations a JOIN alpha_tokens t ON t.id=a.token_id
    WHERE t.status='current' AND t.last_seen>now()-interval '15 minutes' AND a.verified_at<=now() AND (a.valid_to IS NULL OR a.valid_to>now())
    AND NOT EXISTS(SELECT 1 FROM derivatives_observations o WHERE o.token_id=a.token_id AND o.symbol=a.symbol AND o.observed_at>now()-interval '30 minutes')
    ORDER BY (SELECT max(observed_at) FROM derivatives_observations o WHERE o.token_id=a.token_id AND o.symbol=a.symbol) NULLS FIRST,a.token_id LIMIT 2`;
  if (!rows.length)
    return {
      collected: 0,
      reason: "No due independently associated current Alpha instruments",
    };
  const api = new FuturesProvider(
    new HttpClient("binance_futures", 20, auditRequest),
  );
  const exchange = await api.exchange();
  await saveSource("binance_futures", exchange);
  let collected = 0;
  for (const row of rows) {
    const asOf = new Date().toISOString();
    const association: FuturesAssociation = {
      tokenId: row.token_id,
      chain: row.chain_id,
      contract: row.contract,
      symbol: row.symbol,
      baseAsset: row.base_asset,
      contractType: row.contract_type,
      multiplier: String(row.multiplier),
      verified:
        row.evidence.independentlyVerified === true &&
        row.evidence.chain === row.chain_id &&
        row.evidence.contract === row.contract &&
        row.evidence.symbol === row.symbol,
      tokenSource: row.token_source,
      instrumentSource: row.instrument_source,
      projectLinkSource: row.evidence.projectLinkSource,
      verifiedAt: new Date(row.verified_at).toISOString(),
      validFrom: new Date(row.valid_from).toISOString(),
      validTo: row.valid_to ? new Date(row.valid_to).toISOString() : null,
    };
    const instrument = exchange.data.symbols.find(
      (i) => i.symbol === row.symbol,
    );
    if (
      !instrument ||
      !exactFuturesAssociation(
        { id: row.token_id, chain: row.chain_id, contract: row.contract },
        association,
        instrument,
        asOf,
      )
    )
      continue;
    const [oi, premium, history, ratio, ticker] = await providerReads([
      api.openInterest(row.symbol),
      api.premium(row.symbol),
      api.history(row.symbol),
      api.ratio(row.symbol),
      api.ticker(row.symbol),
    ]);
    if (
      [oi.data, premium.data, ticker.data, ...history.data, ...ratio.data].some(
        (d) => d.symbol !== row.symbol,
      )
    )
      throw Error("FUTURES_IDENTITY_MISMATCH");
    for (const observation of [oi, premium, history, ratio, ticker])
      await saveSource<unknown>("binance_futures", observation);
    const evidence = {
      association,
      instrument,
      openInterest: oi.data,
      funding: premium.data,
      history: history.data,
      longShortRatio: ratio.data,
      ticker: ticker.data,
      exchangeInfoHash: exchange.hash,
      hashes: [oi.hash, premium.hash, history.hash, ratio.hash, ticker.hash],
      caveats: [
        "OI measures outstanding derivative positions, not spot/DEX buying",
        "Account ratios are not notional-weighted ownership",
        "No liquidation attribution without liquidation evidence",
        "Historical endpoints expose limited recent history",
      ],
    };
    await sql`INSERT INTO derivatives_observations(token_id,symbol,observed_at,provider_time,evidence) VALUES(${row.token_id},${row.symbol},${new Date().toISOString()},${new Date(oi.data.time).toISOString()},${jsonParam(evidence)}::jsonb) ON CONFLICT DO NOTHING`;
    collected++;
  }
  await setSetting("derivatives_sync", {
    at: new Date().toISOString(),
    collected,
    source: "Binance public USD-M market data",
    batchLimit: 2,
    requiresAssociation: true,
  });
  return { collected };
}
