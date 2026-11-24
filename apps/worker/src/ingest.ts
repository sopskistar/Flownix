import { randomUUID } from "node:crypto";
import { collectPassiveSwaps } from "./passive-swaps";
import { scanSolanaToken } from "./solana";
import { collectEvmSupply } from "./supply";
import {
  AlphaProvider,
  bookQuote,
  HttpClient,
  ProviderError,
  providerReads,
  config,
  normalizeRegistry,
  preferredAlphaPair,
  evmChains,
  configuredEvmRpc,
  EvmProvider,
  decodeTransfer,
  detectTransferActivity,
  recentScanWindow,
  withRequestWorkload,
  defaultSignalConfig,
  type TransferWindow,
  type Transfer,
} from "@flownix/core";
import {
  jsonParam,
  sqlClient,
  auditRequest,
  saveSource,
  setSetting,
  settingsValue,
} from "@flownix/db";
const alpha = new AlphaProvider(
  new HttpClient(
    "binance_alpha",
    config().ALPHA_REQUESTS_PER_MINUTE,
    auditRequest,
  ),
);
const decimal = (v: unknown) =>
  typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v) ? v : null;
export async function registrySync(
  provided?: Awaited<ReturnType<AlphaProvider["registry"]>>,
) {
  const o = provided ?? (await alpha.registry());
  const tokens = normalizeRegistry(o.data);
  const sql = sqlClient();
  await saveSource("binance_alpha", o);
  await sql.begin(async (tx) => {
    const existing = await tx`SELECT id,status FROM alpha_tokens`;
    const old = new Map(existing.map((r) => [r.id, r.status]));
    const ids = tokens.map((t) => t.id);
    const changes = {
      added: tokens.filter((t) => !old.has(t.id)).map((t) => t.id),
      removed: existing.filter((t) => !ids.includes(t.id)).map((t) => t.id),
      offline: tokens.filter((t) => t.status === "offline").map((t) => t.id),
      unknown: tokens.filter((t) => t.status === "unknown").map((t) => t.id),
    };
    const records = tokens.map((t) => {
      const listing =
        t.listingTime &&
        /^\d+$/.test(t.listingTime) &&
        Number(t.listingTime) > 0
          ? new Date(Number(t.listingTime)).toISOString()
          : null;
      return {
        id: t.id,
        chain_id: t.chainId,
        contract: t.contractAddress,
        symbol: t.symbol,
        name: t.name,
        token_id: t.tokenId,
        alpha_id: t.alphaId ?? null,
        status: t.status,
        listing_time: listing,
        first_seen: o.observedAt,
        last_seen: o.observedAt,
        source: o.source,
        response_hash: o.hash,
        metadata: t,
      };
    });
    await tx`INSERT INTO alpha_tokens(id,chain_id,contract,symbol,name,token_id,alpha_id,status,listing_time,first_seen,last_seen,source,response_hash,metadata)
    SELECT id,chain_id,contract,symbol,name,token_id,alpha_id,status,listing_time,first_seen,last_seen,source,response_hash,metadata
    FROM jsonb_to_recordset(${jsonParam(records)}::jsonb) AS r(id text,chain_id text,contract text,symbol text,name text,token_id text,alpha_id text,status text,listing_time timestamptz,first_seen timestamptz,last_seen timestamptz,source text,response_hash text,metadata jsonb) WHERE true
    ON CONFLICT(id) DO UPDATE SET symbol=excluded.symbol,name=excluded.name,token_id=excluded.token_id,alpha_id=excluded.alpha_id,status=excluded.status,listing_time=excluded.listing_time,last_seen=excluded.last_seen,source=excluded.source,response_hash=excluded.response_hash,metadata=excluded.metadata`;
    // Offline identities remain in the exact registry source/membership evidence.
    // Only current eligible identities need a new periodic market metric row.
    const metrics = tokens
      .filter((t) => t.status === "current")
      .map((t) => ({
        token_id: t.id,
        price: decimal(t.price),
        change_24h: decimal(t.percentChange24h),
        volume_24h: decimal(t.volume24h),
        liquidity: decimal(t.liquidity),
        market_cap: decimal(t.marketCap),
        // Full exact registry bytes are retained once in source_responses and in
        // the membership snapshot. Avoid repeating every token's full metadata in
        // each 15-minute price row; this reference preserves reprocessing provenance.
        raw: { registryResponseHash: o.hash, identity: t.id },
      }));
    await tx`INSERT INTO market_snapshots(token_id,source,source_kind,observed_at,price,change_24h,volume_24h,liquidity,market_cap,response_hash,raw)
    SELECT token_id,${o.source},'alpha_registry',${o.observedAt}::timestamptz,price,change_24h,volume_24h,liquidity,market_cap,${o.hash},raw FROM jsonb_to_recordset(${jsonParam(metrics)}::jsonb) AS r(token_id text,price numeric,change_24h numeric,volume_24h numeric,liquidity numeric,market_cap numeric,raw jsonb)`;
    const discovered = tokens.filter((t) => !old.has(t.id)).map((t) => t.id);
    if (discovered.length)
      await tx`INSERT INTO research_state_history(token_id,to_state,observed_at,rule_version,evidence,reason) SELECT unnest(${discovered}::text[]),'DISCOVERY',${o.observedAt}::timestamptz,'membership/1',${jsonParam({ responseHash: o.hash })}::jsonb,'First provable local registry observation; listingTime is a separate provider claim.'`;
    await tx`UPDATE alpha_tokens SET status='removed',deep_selected=false WHERE NOT (id=ANY(${ids}))`;
    // Exact bytes already persisted in source_responses before this transaction.
    // Reference them rather than duplicating the full universe every refresh.
    await tx`INSERT INTO alpha_membership_snapshots(observed_at,source,response_hash,raw,token_count,changes) VALUES(${o.observedAt},${o.source},${o.hash},${jsonParam({ format: "source_reference/1", registryResponseHash: o.hash })}::jsonb,${tokens.length},${jsonParam(changes)}::jsonb)`;
  });
  // Do not build a top-N research universe. Intensive work is driven by
  // manually pinned tokens and the persistent anomaly queue; baseline scans
  // are scheduled for every supported online Alpha identity.
  const candidates =
    await sql`SELECT count(*)::int AS n FROM alpha_tokens WHERE deep_selected AND status='current'`;
  await setSetting("registry_sync", {
    at: o.observedAt,
    count: tokens.length,
    source: o.source,
    hash: o.hash,
  });
  console.log(
    JSON.stringify({
      event: "registry_sync",
      count: tokens.length,
      chains: Object.fromEntries(
        [...new Set(tokens.map((t) => t.chainId))].map((c) => [
          c,
          tokens.filter((t) => t.chainId === c).length,
        ]),
      ),
      manuallyPrioritized: candidates[0]?.n ?? 0,
    }),
  );
}
export async function marketSync() {
  const o = await alpha.exchange();
  await saveSource("binance_alpha", o);
  const sql = sqlClient();
  await sql.begin(async (tx) => {
    await tx`UPDATE market_symbols SET active=false`;
    const records = o.data.symbols.map((s) => ({
      symbol: s.symbol,
      alpha_id: s.baseAsset,
      quote_asset: s.quoteAsset,
      status: s.status ?? null,
      raw: s,
    }));
    await tx`INSERT INTO market_symbols(symbol,alpha_id,quote_asset,status,observed_at,raw) SELECT symbol,alpha_id,quote_asset,status,${o.observedAt}::timestamptz,raw FROM jsonb_to_recordset(${jsonParam(records)}::jsonb) AS r(symbol text,alpha_id text,quote_asset text,status text,raw jsonb) WHERE true ON CONFLICT(symbol) DO UPDATE SET alpha_id=excluded.alpha_id,quote_asset=excluded.quote_asset,status=excluded.status,active=true,observed_at=excluded.observed_at,raw=excluded.raw`;
  });
  await setSetting("exchange_info", {
    at: o.observedAt,
    rateLimits: o.data.rateLimits ?? null,
    serverTime: o.data.serverTime ?? null,
    timezone: o.data.timezone ?? null,
  });
  // Market prices cover every online Alpha identity independently from deep
  // wallet research. A durable per-token cursor spreads ticker calls across
  // cycles and records missing-pair/provider-error reasons explicitly.
  const tokens = await sql`
    SELECT t.*,(t.deep_selected OR EXISTS(SELECT 1 FROM token_investigation_queue q WHERE q.token_id=t.id AND q.active) OR EXISTS(SELECT 1 FROM watchlists w WHERE w.token_id=t.id AND NOT w.archived)) AS intensive FROM alpha_tokens t
    LEFT JOIN market_coverage mc ON mc.token_id=t.id
    WHERE t.status='current'
      AND (mc.checked_at IS NULL OR mc.checked_at < now() - CASE WHEN mc.status='no_pair' THEN interval '6 hours' ELSE interval '5 minutes' END
        OR (mc.status='no_pair' AND EXISTS(SELECT 1 FROM market_symbols s WHERE s.alpha_id=t.alpha_id AND s.active AND (s.status='TRADING' OR s.status IS NULL))))
    ORDER BY mc.checked_at NULLS FIRST, t.deep_selected DESC, t.id
    LIMIT ${config().MARKET_TOKEN_LIMIT}`;
  let failures = 0,
    observed = 0,
    noPair = 0;
  const collectToken = async (token: (typeof tokens)[number]) => {
    // Pair preference is display-only; the actual quote asset remains attached.
    const pair = preferredAlphaPair(token.alpha_id, o.data.symbols);
    if (!pair) {
      noPair++;
      await sql`INSERT INTO market_coverage(token_id,pair_symbol,quote_asset,status,provider,checked_at,observed_at,error_code,raw) VALUES(${token.id},NULL,NULL,'no_pair','binance_alpha',now(),NULL,'NO_ACTIVE_ALPHA_PAIR',${jsonParam({ alphaId: token.alpha_id, exchangeInfoAt: o.observedAt })}::jsonb) ON CONFLICT(token_id) DO UPDATE SET pair_symbol=NULL,quote_asset=NULL,status='no_pair',provider='binance_alpha',checked_at=excluded.checked_at,observed_at=NULL,error_code=excluded.error_code,raw=excluded.raw`;
      return;
    }
    try {
      const ticker = await alpha.ticker(pair.symbol);
      if (ticker.data.symbol !== pair.symbol)
        throw Error("SYMBOL_RESPONSE_MISMATCH");
      // Commit provenance, observation and coverage together in one round trip.
      // A coverage row must never advertise a ticker whose evidence failed to persist.
      await sql`WITH source AS (
        INSERT INTO source_responses(hash,provider,source,observed_at,server_date,payload,raw_text)
        VALUES(${ticker.hash},'binance_alpha',${ticker.source},${ticker.observedAt},${ticker.serverDate},${jsonParam(JSON.parse(ticker.raw))}::jsonb,${ticker.raw}) ON CONFLICT(hash) DO NOTHING
      ), snapshot AS (
        INSERT INTO market_snapshots(token_id,symbol,source,source_kind,quote_asset,observed_at,provider_time,price,change_24h,volume_24h,liquidity,market_cap,response_hash,raw) VALUES(${token.id},${pair.symbol},${ticker.source},'alpha_market',${pair.quoteAsset},${ticker.observedAt},${new Date(ticker.data.closeTime).toISOString()},${decimal(ticker.data.lastPrice)},${decimal(ticker.data.priceChangePercent)},${decimal(ticker.data.quoteVolume)},${decimal(token.metadata.liquidity)},${decimal(token.metadata.marketCap)},${ticker.hash},${jsonParam(JSON.parse(ticker.raw))}::jsonb)
      ) INSERT INTO market_coverage(token_id,pair_symbol,quote_asset,status,provider,checked_at,observed_at,error_code,raw) VALUES(${token.id},${pair.symbol},${pair.quoteAsset},'observed','binance_alpha',${ticker.observedAt},${ticker.observedAt},NULL,${jsonParam({ responseHash: ticker.hash, exchangeInfoAt: o.observedAt })}::jsonb) ON CONFLICT(token_id) DO UPDATE SET pair_symbol=excluded.pair_symbol,quote_asset=excluded.quote_asset,status='observed',provider=excluded.provider,checked_at=excluded.checked_at,observed_at=excluded.observed_at,error_code=NULL,raw=excluded.raw`;
      observed++;
      if (token.intensive) {
        try {
          const depth = await alpha.depth(pair.symbol);
          if (depth.data.symbol !== pair.symbol)
            throw Error("DEPTH_SYMBOL_MISMATCH");
          await saveSource("binance_alpha", depth);
          const book = bookQuote(
            depth.data,
            depth.observedAt,
            depth.source,
            depth.hash,
          );
          if (book)
            await sql`UPDATE market_snapshots SET book=${jsonParam(book)}::jsonb WHERE token_id=${token.id} AND response_hash=${ticker.hash} AND observed_at=${ticker.observedAt}`;
        } catch {
          await sql`INSERT INTO data_quality_issues(token_id,provider,kind,detail) VALUES(${token.id},'binance_alpha','depth_unavailable','No verified fresh book quote; paper fills and outcomes remain unavailable.')`;
        }
      }
      if (token.intensive) {
        const newest = (
          await sql`SELECT max(close_at) AS at FROM ohlcv_candles WHERE symbol=${pair.symbol}`
        )[0]?.at;
        const completedHourEnd = Math.floor(Date.now() / 3600000) * 3600000 - 1;
        if (!newest || new Date(newest).getTime() < completedHourEnd) {
          const candles = await alpha.klines(
            pair.symbol,
            undefined,
            newest ? new Date(newest).getTime() + 1 : undefined,
          );
          await storeCandles(pair.symbol, candles);
        }
        // One older page per run; bounded backfill to 180 days, never before locally proven membership for signals.
        const oldest =
          await sql`SELECT min(open_at) AS at FROM ohlcv_candles WHERE symbol=${pair.symbol}`;
        if (
          config().MARKET_HISTORY_BACKFILL_ENABLED &&
          oldest[0]?.at &&
          Date.now() - new Date(oldest[0].at).getTime() < 180 * 86400000 &&
          !(await settingsValue(`history_end:${pair.symbol}`, false)) &&
          Date.now() -
            Date.parse(
              await settingsValue(
                `history_backfill_at:${pair.symbol}`,
                "1970-01-01T00:00:00Z",
              ),
            ) >
            6 * 3600000
        ) {
          const older = await alpha.klines(
            pair.symbol,
            new Date(oldest[0].at).getTime() - 1,
          );
          await storeCandles(pair.symbol, older);
          await setSetting(
            `history_backfill_at:${pair.symbol}`,
            older.observedAt,
          );
          if (!older.data.length)
            await setSetting(`history_end:${pair.symbol}`, true);
        }
      }
      console.log(
        JSON.stringify({
          event: "market_snapshot",
          token: token.id,
          symbol: pair.symbol,
          source: "binance_alpha",
        }),
      );
    } catch (error) {
      failures++;
      const code = errorCode(error);
      if (
        error instanceof ProviderError &&
        (error.retryAt ||
          ["PROCESS_REQUEST_BUDGET_EXHAUSTED", "COLLECTION_STOPPED"].includes(
            code,
          ))
      )
        throw error;
      await sql`INSERT INTO market_coverage(token_id,pair_symbol,quote_asset,status,provider,checked_at,observed_at,error_code,raw) VALUES(${token.id},${pair.symbol},${pair.quoteAsset},'error','binance_alpha',now(),NULL,${code},${jsonParam({ exchangeInfoAt: o.observedAt })}::jsonb) ON CONFLICT(token_id) DO UPDATE SET pair_symbol=excluded.pair_symbol,quote_asset=excluded.quote_asset,status='error',provider=excluded.provider,checked_at=excluded.checked_at,error_code=excluded.error_code,raw=excluded.raw`;
      await sql`INSERT INTO data_quality_issues(token_id,provider,kind,detail) VALUES(${token.id},'binance_alpha','market_gap','Market collection failed; earlier observations preserved.')`;
    }
  };
  // Two bounded consumers overlap ticker persistence with provider pacing.
  // HttpClient still reserves every call against the shared configured rate cap.
  let nextToken = 0,
    aborted = false;
  const collectLane = async () => {
    while (!aborted) {
      const token = tokens[nextToken++];
      if (!token) return;
      try {
        await collectToken(token);
      } catch (error) {
        aborted = true;
        throw error;
      }
    }
  };
  const lanes = await Promise.allSettled([collectLane(), collectLane()]);
  for (const lane of lanes) if (lane.status === "rejected") throw lane.reason;
  const pending = await sql`SELECT count(*)::int AS due FROM alpha_tokens t
    LEFT JOIN market_coverage mc ON mc.token_id=t.id
    WHERE t.status='current' AND (mc.checked_at IS NULL OR mc.checked_at < now() - CASE WHEN mc.status='no_pair' THEN interval '6 hours' ELSE interval '5 minutes' END
      OR (mc.status='no_pair' AND EXISTS(SELECT 1 FROM market_symbols s WHERE s.alpha_id=t.alpha_id AND s.active AND (s.status='TRADING' OR s.status IS NULL))))`;
  const remainingDue = Number(pending[0].due);
  await setSetting("market_coverage_sync", {
    at: new Date().toISOString(),
    exchangeInfoAt: o.observedAt,
    requested: tokens.length,
    observed,
    noPair,
    failures,
    requestCap: config().MARKET_TOKEN_LIMIT,
    remainingDue,
  });
  console.log(
    JSON.stringify({
      event: "alpha_market_cycle",
      requested: tokens.length,
      observed,
      noPair,
      failures,
    }),
  );
  return { remainingDue };
}

function errorCode(error: unknown) {
  return error && typeof error === "object" && "code" in error
    ? String(error.code).slice(0, 80)
    : error instanceof Error
      ? error.name
      : "PROVIDER_ERROR";
}
export async function storeCandles(
  symbol: string,
  o: Awaited<ReturnType<AlphaProvider["klines"]>>,
  interval: "1h" | "1m" = "1h",
  provider: "binance_alpha" | "binance_futures" = "binance_alpha",
) {
  await saveSource(provider, o);
  const sql = sqlClient();
  const records: Record<string, unknown>[] = [];
  for (const k of o.data) {
    const open = Number(k[0]),
      close = Number(k[6]);
    if (
      !Number.isFinite(open) ||
      !Number.isFinite(close) ||
      close >= Date.parse(o.observedAt)
    )
      continue;
    if (
      ![k[1], k[2], k[3], k[4], k[5]].every((v) => decimal(String(v)) !== null)
    )
      throw Error("INVALID_CANDLE");
    records.push({
      symbol,
      interval,
      open_at: new Date(open).toISOString(),
      close_at: new Date(close).toISOString(),
      available_at: o.observedAt,
      open: String(k[1]),
      high: String(k[2]),
      low: String(k[3]),
      close: String(k[4]),
      volume: String(k[5]),
      quote_volume: decimal(String(k[7] ?? "")),
      source: o.source,
      response_hash: o.hash,
    });
  }
  if (!records.length) return;
  await sql.begin(async (tx) => {
    // One parameterized batch, rather than thousands of network round trips to Neon.
    await tx`INSERT INTO ohlcv_candles ${tx(records, "symbol", "interval", "open_at", "close_at", "available_at", "open", "high", "low", "close", "volume", "quote_volume", "source", "response_hash")} ON CONFLICT(symbol,interval,open_at) DO NOTHING`;
  });
}
function windowFromRow(r: Record<string, unknown>): TransferWindow {
  return {
    fromBlock: Number(r.from_block),
    toBlock: Number(r.to_block),
    startTime: new Date(r.start_time as string).toISOString(),
    endTime: new Date(r.end_time as string).toISOString(),
    availableAt: new Date(r.available_at as string).toISOString(),
    complete: Boolean(r.complete),
    count: Number(r.count),
  };
}
export async function scanToken(
  id: string,
  replay?: { from: number; to: number },
  mode: "sequential" | "near_head" = "sequential",
) {
  const sql = sqlClient();
  const rows = await sql`SELECT t.*,c.block_number,c.block_hash,
      EXISTS(SELECT 1 FROM wallet_monitoring m WHERE m.token_id=t.id AND m.chain_id=t.chain_id AND m.active) AS has_monitors,
      (t.deep_selected OR EXISTS(SELECT 1 FROM token_investigation_queue q WHERE q.token_id=t.id AND q.active) OR EXISTS(SELECT 1 FROM watchlists w WHERE w.token_id=t.id AND NOT w.archived)) AS intensive
      FROM alpha_tokens t LEFT JOIN block_cursors c ON c.token_id=t.id
      WHERE t.id=${id} AND t.status='current'`;
  const t = rows[0];
  if (!t) return;
  if (t.chain_id === "CT_501")
    return scanSolanaToken(
      t as {
        id: string;
        chain_id: string;
        contract: string;
        last_seen: string;
      },
    );
  const recent = mode === "near_head" && !replay;
  const live = recent
    ? (await sql`SELECT * FROM live_scan_checkpoints WHERE token_id=${id}`)[0]
    : null;
  const intensive = Boolean(t.intensive);
  const c = config();
  if (
    Date.now() - new Date(t.last_seen).getTime() >
    c.MAX_DATA_AGE_SECONDS * 1000
  )
    throw Error("STALE_MEMBERSHIP");
  const chain = evmChains[t.chain_id];
  if (!chain) return;
  const rpcUrl = configuredEvmRpc(t.chain_id);
  // Alchemy's documented free-tier eth_getLogs span is ten blocks. Clamp
  // larger local settings so baseline jobs do not silently fail with range errors.
  const blockLimit =
    new URL(rpcUrl).hostname.endsWith("alchemy.com") ||
    ["146", "4663"].includes(t.chain_id)
      ? Math.min(c.SCAN_BLOCKS, 10)
      : c.SCAN_BLOCKS;
  const rpc = new EvmProvider(
    t.chain_id,
    rpcUrl,
    new HttpClient(
      `rpc:${t.chain_id}`,
      ["146", "4663"].includes(t.chain_id) ? 20 : 60,
      auditRequest,
    ),
  );
  const head = await rpc.head();
  const target = head - c.SCAN_CONFIRMATIONS;
  const cursor =
    (recent ? live?.block_number : t.block_number) == null
      ? undefined
      : {
          block_number: recent ? live!.block_number : t.block_number,
          block_hash: recent ? live!.block_hash : t.block_hash,
        };
  if (cursor) {
    const b = await rpc.block(Number(cursor.block_number));
    if (b.data.hash.toLowerCase() !== cursor.block_hash) {
      // Deep reorg: invalidate token ledger and dependent detections, then explicitly rebuild bounded coverage.
      await sql.begin(async (tx) => {
        await tx`UPDATE token_transfers SET canonical=false WHERE token_id=${id}`;
        await tx`UPDATE wallet_balance_snapshots SET canonical=false WHERE token_id=${id}`;
        await tx`UPDATE holder_metrics SET canonical=false WHERE token_id=${id}`;
        await tx`UPDATE pool_liquidity_observations SET canonical=false WHERE token_id=${id}`;
        await tx`UPDATE signal_events SET status='reorg_invalidated' WHERE token_id=${id}`;
        await tx`UPDATE receipt_evidence SET canonical=false WHERE token_id=${id}`;
        await tx`UPDATE verified_swaps SET canonical=false WHERE token_id=${id}`;
        await tx`DELETE FROM swap_scan_windows WHERE token_id=${id}`;
        await tx`UPDATE notification_deliveries SET status='cancelled' WHERE signal_id IN (SELECT id FROM signal_events WHERE token_id=${id}) AND status='queued'`;
        await tx`DELETE FROM scan_windows WHERE token_id=${id}`;
        await tx`DELETE FROM block_cursors WHERE token_id=${id}`;
        await tx`DELETE FROM live_scan_checkpoints WHERE token_id=${id}`;
        await tx`INSERT INTO data_quality_issues(token_id,provider,kind,detail) VALUES(${id},${"rpc:" + t.chain_id},'reorg','Cursor hash changed. Ledger marked noncanonical; signals invalidated; bounded rescan required.')`;
      });
      return;
    }
  }
  const plan = recent
    ? recentScanWindow(
        target,
        blockLimit,
        cursor
          ? Number(cursor.block_number)
          : t.block_number == null
            ? null
            : Number(t.block_number),
      )
    : null;
  const from =
    plan?.from ??
    replay?.from ??
    (cursor
      ? Number(cursor.block_number) + 1
      : Math.max(0, target - blockLimit + 1));
  const to =
    plan?.to ??
    (replay
      ? Math.min(replay.to, from + blockLimit - 1)
      : Math.min(target, from + blockLimit - 1));
  if (
    !Number.isSafeInteger(from) ||
    !Number.isSafeInteger(to) ||
    from < 0 ||
    to > target ||
    to - from >= blockLimit
  )
    throw Error("INVALID_SCAN_WINDOW");
  if (to < from) return;
  // Independent reads share the same provider pacing and request budget.
  // Overlap network latency without increasing the configured RPC rate.
  const [logs, code, decimals] = await providerReads([
    rpc.logs(t.contract, from, to),
    rpc.code(t.contract, to),
    rpc.decimals(t.contract, to),
  ]);
  if (code.data === "0x") throw Error("NO_CONTRACT_CODE");
  const blocks = new Map<number, Awaited<ReturnType<EvmProvider["block"]>>>();
  for (const n of [
    ...new Set([
      from,
      to,
      ...logs.data.map((l) => parseInt(l.blockNumber, 16)),
    ]),
  ])
    blocks.set(n, await rpc.block(n));
  const transfers: Transfer[] = [];
  const seenEvents = new Map<string, Transfer>();
  for (const log of logs.data) {
    if (log.address.toLowerCase() !== t.contract)
      throw Error("LOG_CONTRACT_MISMATCH");
    const n = parseInt(log.blockNumber, 16);
    if (n < from || n > to) throw Error("LOG_RANGE_MISMATCH");
    const b = blocks.get(n)!;
    if (log.blockHash.toLowerCase() !== b.data.hash.toLowerCase())
      throw Error("REORG_DURING_SCAN");
    const eventTime = new Date(
      parseInt(b.data.timestamp, 16) * 1000,
    ).toISOString();
    const decoded = decodeTransfer(
      log,
      t.chain_id,
      id,
      decimals,
      eventTime,
      logs.source,
      logs.observedAt,
    );
    if (decoded) {
      const key = `${decoded.chain}:${decoded.txHash}:${decoded.logIndex}`;
      const previous = seenEvents.get(key);
      if (
        previous &&
        (previous.rawQuantity !== decoded.rawQuantity ||
          previous.blockHash !== decoded.blockHash ||
          previous.from !== decoded.from ||
          previous.to !== decoded.to)
      )
        throw Error("CONFLICTING_EVENT_REPLAY");
      if (!previous) {
        seenEvents.set(key, decoded);
        transfers.push(decoded);
      }
    }
  }
  const startTime = new Date(
      parseInt(blocks.get(from)!.data.timestamp, 16) * 1000,
    ).toISOString(),
    endTime = new Date(
      parseInt(blocks.get(to)!.data.timestamp, 16) * 1000,
    ).toISOString();
  const observedAt = new Date().toISOString();
  await saveSource(`rpc:${t.chain_id}`, logs);
  await sql.begin(async (tx) => {
    if (transfers.length) {
      const rows = transfers.map((e) => ({
        chain_id: e.chain,
        tx_hash: e.txHash,
        log_index: e.logIndex,
        token_id: id,
        block_number: e.blockNumber,
        block_hash: e.blockHash,
        event_time: e.eventTime,
        available_at: e.availableAt,
        from_address: e.from,
        to_address: e.to,
        raw_quantity: e.rawQuantity,
        decimals: e.decimals,
        kind: e.kind,
        source: e.source,
      }));
      await tx`INSERT INTO token_transfers(chain_id,tx_hash,log_index,token_id,block_number,block_hash,event_time,available_at,from_address,to_address,raw_quantity,decimals,kind,source) SELECT * FROM jsonb_to_recordset(${jsonParam(rows)}::jsonb) AS r(chain_id text,tx_hash text,log_index integer,token_id text,block_number bigint,block_hash text,event_time timestamptz,available_at timestamptz,from_address text,to_address text,raw_quantity numeric,decimals integer,kind text,source text) WHERE true ON CONFLICT(chain_id,tx_hash,log_index) DO UPDATE SET canonical=true,block_hash=excluded.block_hash,block_number=excluded.block_number,event_time=excluded.event_time`;
      const wallets = [
        ...new Set(transfers.flatMap((e) => [e.from, e.to])),
      ].map((address) => ({ chain_id: t.chain_id, address }));
      await tx`INSERT INTO wallets(chain_id,address) SELECT * FROM jsonb_to_recordset(${jsonParam(wallets)}::jsonb) AS r(chain_id text,address text) WHERE true ON CONFLICT DO NOTHING`;
    }
    if (recent) {
      await tx`INSERT INTO live_scan_checkpoints(token_id,chain_id,block_number,block_hash,source_time,observed_at,window_from,head_at_scan) VALUES(${id},${t.chain_id},${to},${blocks.get(to)!.data.hash.toLowerCase()},${endTime},${observedAt},${from},${head}) ON CONFLICT(token_id) DO UPDATE SET block_number=excluded.block_number,block_hash=excluded.block_hash,source_time=excluded.source_time,observed_at=excluded.observed_at,window_from=excluded.window_from,head_at_scan=excluded.head_at_scan WHERE live_scan_checkpoints.block_number<=excluded.block_number`;
      if (plan?.gap)
        await tx`INSERT INTO scan_gap_observations(token_id,from_block,to_block,reason) VALUES(${id},${plan.gap.from},${plan.gap.to},'Near-head sampling gap; historical cursor retained; not continuous transfer or retention coverage') ON CONFLICT DO NOTHING`;
    } else
      await tx`INSERT INTO block_cursors(token_id,chain_id,block_number,block_hash,scanned_at) VALUES(${id},${t.chain_id},${to},${blocks.get(to)!.data.hash.toLowerCase()},${observedAt}) ON CONFLICT(token_id) DO UPDATE SET block_number=excluded.block_number,block_hash=excluded.block_hash,scanned_at=excluded.scanned_at WHERE block_cursors.block_number<=excluded.block_number`;
    await tx`INSERT INTO scan_windows(token_id,from_block,to_block,start_time,end_time,available_at,count,complete) VALUES(${id},${from},${to},${startTime},${endTime},${observedAt},${transfers.filter((t) => t.kind === "unknown_transfer").length},true) ON CONFLICT DO NOTHING`;
  });
  // Explicit case monitors keep accumulating balance evidence independently
  // of intensive selection. Baseline monitors add no DEX/history backfill.
  if (intensive || t.has_monitors) {
    await withRequestWorkload("enrichment", async () => {
      const monitors =
        await sql`SELECT address FROM wallet_monitoring WHERE token_id=${id} AND chain_id=${t.chain_id} AND active ORDER BY (added_by='owner') DESC,added_at LIMIT 20`;
      const addresses = [
        ...new Set([
          ...monitors.map((m) => String(m.address)),
          ...(intensive ? transfers.flatMap((t) => [t.from, t.to]) : []),
        ]),
      ].filter((a) => !/^0x0{40}$/.test(a));
      for (const a of addresses.slice(0, c.ENRICHMENT_WALLETS_PER_WINDOW)) {
        try {
          const b = await rpc.balance(a, t.contract, to);
          await sql`INSERT INTO wallet_balance_snapshots(chain_id,address,token_id,block_number,block_hash,raw_quantity,observed_at,source,block_time,decimals) VALUES(${t.chain_id},${a},${id},${to},${blocks.get(to)!.data.hash},${b.data},${b.observedAt},${b.source},${endTime},${decimals}) ON CONFLICT DO NOTHING`;
        } catch (error) {
          await sql`INSERT INTO data_quality_issues(token_id,provider,kind,detail) VALUES(${id},${"rpc:" + t.chain_id},'balance_unavailable','Historic balance call failed; transfer evidence remains available.')`;
          if (
            error instanceof ProviderError &&
            error.code === "WORKLOAD_BUDGET_EXHAUSTED"
          )
            break;
        }
      }
      if (intensive)
        await collectPassiveSwaps(
          t as { id: string; chain_id: string; contract: string },
          rpc,
          from,
          to,
        );
    });
  }
  const market = (
    await sql`SELECT * FROM market_snapshots WHERE token_id=${id} AND source_kind='alpha_market' ORDER BY observed_at DESC LIMIT 1`
  )[0];
  const baseline =
    await sql`SELECT * FROM scan_windows WHERE token_id=${id} AND to_block<${from} ORDER BY from_block DESC LIMIT ${c.TRANSFER_BASELINE_WINDOWS}`;
  const thresholds = await settingsValue("transfer_thresholds", {
    ...defaultSignalConfig,
    minEvents: c.TRANSFER_MIN_EVENTS,
    multiplier: c.TRANSFER_BASELINE_MULTIPLIER,
    baselineWindows: c.TRANSFER_BASELINE_WINDOWS,
    maxAgeSeconds: c.MAX_DATA_AGE_SECONDS,
    minLiquidity: c.MIN_LIQUIDITY_USD,
  });
  const result = detectTransferActivity(
    {
      now: observedAt,
      membershipFirstSeen: new Date(t.first_seen).toISOString(),
      membershipStatus: t.status,
      marketObservedAt: market
        ? new Date(
            Math.min(
              new Date(market.observed_at).getTime(),
              new Date(market.provider_time).getTime(),
            ),
          ).toISOString()
        : null,
      price: market?.price ?? null,
      quoteAsset: market?.quote_asset ?? null,
      liquidity: market?.liquidity ?? null,
      transfers,
      window: {
        fromBlock: from,
        toBlock: to,
        startTime,
        endTime,
        availableAt: observedAt,
        count: transfers.length,
        complete: true,
      },
      baseline: baseline.map(windowFromRow),
    },
    thresholds,
  );
  await setSetting(`trace:${id}`, {
    at: observedAt,
    from,
    to,
    events: transfers.length,
    reason: result.reason,
    rule: "transfer-activity/1.0.0",
  });
  await sql`INSERT INTO detection_traces(token_id,from_block,to_block,computed_at,rule_version,reason,evidence) VALUES(${id},${from},${to},${observedAt},'transfer-activity/1.0.0',${result.reason},${jsonParam({ sourceHash: logs.hash, events: transfers.length, baselineWindows: baseline.length, signalEmitted: !!result.signal, classification: "Transfers are not purchases" })}::jsonb)`;
  if (result.signal) {
    const s = result.signal;
    const signalId = randomUUID();
    await sql.begin(async (tx) => {
      await tx`INSERT INTO signal_events(id,token_id,kind,rule_version,stage,first_detected_at,computed_at,data_available_at,price_at_detection,quote_asset,market_snapshot_id,evidence_confidence,thresholds,observed,counter_evidence,message) VALUES(${signalId},${id},${s.kind},${s.ruleVersion},${s.stage},${s.firstDetectedAt},${s.computedAt},${s.dataAvailableAt},${s.priceAtDetection},${s.quoteAsset},${market.id},${s.evidenceConfidence},${jsonParam(s.thresholds)}::jsonb,${jsonParam(s.observed)}::jsonb,${jsonParam(s.counterEvidence)}::jsonb,'Unusual confirmed transfer count relative to this token’s prior equal-block windows. Not evidence of buying or accumulation.')`;
      for (const e of s.evidence)
        await tx`INSERT INTO signal_evidence(signal_id,chain_id,tx_hash,log_index) VALUES(${signalId},${e.chain},${e.txHash},${e.logIndex}) ON CONFLICT DO NOTHING`;
      await tx`INSERT INTO notification_deliveries(id,signal_id,channel,status,payload) VALUES(${randomUUID()},${signalId},'in_app','delivered',${jsonParam({ kind: s.kind, token: t.symbol, at: observedAt })}::jsonb)`;
      await tx`INSERT INTO token_investigation_queue(token_id,priority,reasons,last_queued_at,next_investigation_at,active,resolved_at) VALUES(${id},50,jsonb_build_array(${jsonParam({ kind: s.kind, detectedAt: observedAt, rule: s.ruleVersion })}::jsonb),now(),now(),true,NULL) ON CONFLICT(token_id) DO UPDATE SET priority=least(token_investigation_queue.priority,excluded.priority),reasons=token_investigation_queue.reasons||excluded.reasons,last_queued_at=now(),next_investigation_at=least(token_investigation_queue.next_investigation_at,now()),active=true,resolved_at=NULL`;
    });
  }
  console.log(
    JSON.stringify({
      event: "scan",
      token: t.symbol,
      chain: t.chain_id,
      coverage: recent ? "bounded_recent_sample" : "sequential_window",
      from,
      to,
      events: transfers.length,
      detection: result.reason,
    }),
  );
  await collectEvmSupply(
    t as { id: string; chain_id: string; contract: string },
    rpc,
    to,
    blocks.get(to)!.data.hash.toLowerCase(),
    endTime,
    decimals,
  );
}
