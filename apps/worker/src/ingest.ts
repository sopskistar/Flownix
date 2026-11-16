import { randomUUID } from "node:crypto";
import {
  AlphaProvider,
  bookQuote,
  HttpClient,
  config,
  normalizeRegistry,
  eligiblePairs,
  evmChains,
  EvmProvider,
  decodeTransfer,
  detectTransferActivity,
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
export async function registrySync() {
  const o = await alpha.registry();
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
    for (const t of tokens) {
      const listing =
        t.listingTime &&
        /^\d+$/.test(t.listingTime) &&
        Number(t.listingTime) > 0
          ? new Date(Number(t.listingTime)).toISOString()
          : null;
      await tx`INSERT INTO alpha_tokens(id,chain_id,contract,symbol,name,token_id,alpha_id,status,listing_time,first_seen,last_seen,source,response_hash,metadata)
    VALUES(${t.id},${t.chainId},${t.contractAddress},${t.symbol},${t.name},${t.tokenId},${t.alphaId ?? null},${t.status},${listing},${o.observedAt},${o.observedAt},${o.source},${o.hash},${jsonParam(t)}::jsonb)
    ON CONFLICT(id) DO UPDATE SET symbol=excluded.symbol,name=excluded.name,token_id=excluded.token_id,alpha_id=excluded.alpha_id,status=excluded.status,listing_time=excluded.listing_time,last_seen=excluded.last_seen,source=excluded.source,response_hash=excluded.response_hash,metadata=excluded.metadata`;
      await tx`INSERT INTO market_snapshots(token_id,source,source_kind,observed_at,price,change_24h,volume_24h,liquidity,market_cap,response_hash,raw)
    VALUES(${t.id},${o.source},'alpha_registry',${o.observedAt},${decimal(t.price)},${decimal(t.percentChange24h)},${decimal(t.volume24h)},${decimal(t.liquidity)},${decimal(t.marketCap)},${o.hash},${jsonParam(t)}::jsonb)`;
      if (!old.has(t.id))
        await tx`INSERT INTO research_state_history(token_id,to_state,observed_at,rule_version,evidence,reason) VALUES(${t.id},'DISCOVERY',${o.observedAt},'membership/1',${jsonParam({ responseHash: o.hash })}::jsonb,'First provable local registry observation; listingTime is a separate provider claim.')`;
    }
    await tx`UPDATE alpha_tokens SET status='removed',deep_selected=false WHERE NOT (id=ANY(${ids}))`;
    await tx`INSERT INTO alpha_membership_snapshots(observed_at,source,response_hash,raw,token_count,changes) VALUES(${o.observedAt},${o.source},${o.hash},${jsonParam(JSON.parse(o.raw))}::jsonb,${tokens.length},${jsonParam(changes)}::jsonb)`;
  });
  const candidates =
    await sql`SELECT t.id,t.symbol,t.chain_id,t.metadata FROM alpha_tokens t LEFT JOIN watchlists w ON w.token_id=t.id WHERE t.status='current' AND t.chain_id IN ('56','1','8453') AND (t.metadata->>'liquidity') ~ '^[0-9]+([.][0-9]+)?$' AND (t.metadata->>'liquidity')::numeric>=${config().MIN_LIQUIDITY_USD} ORDER BY (w.token_id IS NOT NULL AND NOT w.archived) DESC,(t.metadata->>'liquidity')::numeric DESC,t.id LIMIT ${config().DEEP_TOKEN_LIMIT}`;
  await sql.begin(async (tx) => {
    await tx`UPDATE alpha_tokens SET deep_selected=false`;
    if (candidates.length)
      await tx`UPDATE alpha_tokens SET deep_selected=true WHERE id=ANY(${candidates.map((t) => t.id)})`;
  });
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
      deepSelected: candidates.length,
    }),
  );
}
export async function marketSync() {
  const o = await alpha.exchange();
  await saveSource("binance_alpha", o);
  const sql = sqlClient();
  await sql.begin(async (tx) => {
    await tx`UPDATE market_symbols SET active=false`;
    for (const s of o.data.symbols)
      await tx`INSERT INTO market_symbols(symbol,alpha_id,quote_asset,status,observed_at,raw) VALUES(${s.symbol},${s.baseAsset},${s.quoteAsset},${s.status ?? null},${o.observedAt},${jsonParam(s)}::jsonb) ON CONFLICT(symbol) DO UPDATE SET alpha_id=excluded.alpha_id,quote_asset=excluded.quote_asset,status=excluded.status,active=true,observed_at=excluded.observed_at,raw=excluded.raw`;
  });
  await setSetting("exchange_info", {
    at: o.observedAt,
    rateLimits: o.data.rateLimits ?? null,
    serverTime: o.data.serverTime ?? null,
    timezone: o.data.timezone ?? null,
  });
  const tokens =
    await sql`SELECT * FROM alpha_tokens WHERE status='current' ORDER BY deep_selected DESC,last_seen DESC,id LIMIT ${config().MARKET_TOKEN_LIMIT}`;
  let failures = 0;
  for (const token of tokens) {
    const pairs = eligiblePairs(token.alpha_id, o.data.symbols).sort(
      (a, b) =>
        Number(b.quoteAsset === "USDT") - Number(a.quoteAsset === "USDT") ||
        a.symbol.localeCompare(b.symbol),
    );
    if (!pairs.length) continue;
    const pair = pairs[0];
    try {
      const ticker = await alpha.ticker(pair.symbol);
      if (ticker.data.symbol !== pair.symbol)
        throw Error("SYMBOL_RESPONSE_MISMATCH");
      await saveSource("binance_alpha", ticker);
      await sql`INSERT INTO market_snapshots(token_id,symbol,source,source_kind,quote_asset,observed_at,provider_time,price,change_24h,volume_24h,liquidity,market_cap,response_hash,raw) VALUES(${token.id},${pair.symbol},${ticker.source},'alpha_market',${pair.quoteAsset},${ticker.observedAt},${new Date(ticker.data.closeTime).toISOString()},${decimal(ticker.data.lastPrice)},${decimal(ticker.data.priceChangePercent)},${decimal(ticker.data.quoteVolume)},${decimal(token.metadata.liquidity)},${decimal(token.metadata.marketCap)},${ticker.hash},${jsonParam(JSON.parse(ticker.raw))}::jsonb)`;
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
      const candles = await alpha.klines(pair.symbol);
      await storeCandles(pair.symbol, candles);
      // One older page per run; bounded backfill to 180 days, never before locally proven membership for signals.
      const oldest =
        await sql`SELECT min(open_at) AS at FROM ohlcv_candles WHERE symbol=${pair.symbol}`;
      if (
        oldest[0]?.at &&
        Date.now() - new Date(oldest[0].at).getTime() < 180 * 86400000 &&
        !(await settingsValue(`history_end:${pair.symbol}`, false))
      ) {
        const older = await alpha.klines(
          pair.symbol,
          new Date(oldest[0].at).getTime() - 1,
        );
        await storeCandles(pair.symbol, older);
        if (!older.data.length)
          await setSetting(`history_end:${pair.symbol}`, true);
      }
    } catch {
      failures++;
      await sql`INSERT INTO data_quality_issues(token_id,provider,kind,detail) VALUES(${token.id},'binance_alpha','market_gap','Market collection failed; earlier observations preserved.')`;
    }
  }
  if (failures) throw Error("PARTIAL_MARKET_FAILURE");
}
async function storeCandles(
  symbol: string,
  o: Awaited<ReturnType<AlphaProvider["klines"]>>,
) {
  await saveSource("binance_alpha", o);
  const sql = sqlClient();
  await sql.begin(async (tx) => {
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
        ![k[1], k[2], k[3], k[4], k[5]].every(
          (v) => decimal(String(v)) !== null,
        )
      )
        throw Error("INVALID_CANDLE");
      await tx`INSERT INTO ohlcv_candles(symbol,interval,open_at,close_at,available_at,open,high,low,close,volume,quote_volume,source,response_hash) VALUES(${symbol},'1h',${new Date(open).toISOString()},${new Date(close).toISOString()},${o.observedAt},${String(k[1])},${String(k[2])},${String(k[3])},${String(k[4])},${String(k[5])},${decimal(String(k[7] ?? ""))},${o.source},${o.hash}) ON CONFLICT(symbol,interval,open_at) DO NOTHING`;
    }
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
export async function scanToken(id: string) {
  const sql = sqlClient();
  const rows =
    await sql`SELECT * FROM alpha_tokens WHERE id=${id} AND status='current'`;
  const t = rows[0];
  if (!t) return;
  const c = config();
  if (
    Date.now() - new Date(t.last_seen).getTime() >
    c.MAX_DATA_AGE_SECONDS * 1000
  )
    throw Error("STALE_MEMBERSHIP");
  const chain = evmChains[t.chain_id];
  if (!chain) return;
  const rpc = new EvmProvider(
    t.chain_id,
    process.env[chain.env] ??
      (t.chain_id === "56"
        ? c.BSC_RPC_URL
        : t.chain_id === "1"
          ? c.ETH_RPC_URL
          : c.BASE_RPC_URL),
    new HttpClient(`rpc:${t.chain_id}`, 60, auditRequest),
  );
  const head = await rpc.head();
  const target = head - c.SCAN_CONFIRMATIONS;
  const cursor = (
    await sql`SELECT * FROM block_cursors WHERE token_id=${id}`
  )[0];
  if (cursor) {
    const b = await rpc.block(Number(cursor.block_number));
    if (b.data.hash.toLowerCase() !== cursor.block_hash) {
      // Deep reorg: invalidate token ledger and dependent detections, then explicitly rebuild bounded coverage.
      await sql.begin(async (tx) => {
        await tx`UPDATE token_transfers SET canonical=false WHERE token_id=${id}`;
        await tx`UPDATE wallet_balance_snapshots SET canonical=false WHERE token_id=${id}`;
        await tx`UPDATE signal_events SET status='reorg_invalidated' WHERE token_id=${id}`;
        await tx`UPDATE notification_deliveries SET status='cancelled' WHERE signal_id IN (SELECT id FROM signal_events WHERE token_id=${id}) AND status='queued'`;
        await tx`DELETE FROM scan_windows WHERE token_id=${id}`;
        await tx`DELETE FROM block_cursors WHERE token_id=${id}`;
        await tx`INSERT INTO data_quality_issues(token_id,provider,kind,detail) VALUES(${id},${"rpc:" + t.chain_id},'reorg','Cursor hash changed. Ledger marked noncanonical; signals invalidated; bounded rescan required.')`;
      });
      return;
    }
  }
  const from = cursor
    ? Number(cursor.block_number) + 1
    : Math.max(0, target - c.SCAN_BLOCKS + 1);
  const to = Math.min(target, from + c.SCAN_BLOCKS - 1);
  if (to < from) return;
  const logs = await rpc.logs(t.contract, from, to);
  const decimals = await rpc.decimals(t.contract);
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
    if (decoded) transfers.push(decoded);
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
    for (const e of transfers) {
      await tx`INSERT INTO token_transfers(chain_id,tx_hash,log_index,token_id,block_number,block_hash,event_time,available_at,from_address,to_address,raw_quantity,decimals,kind,source) VALUES(${e.chain},${e.txHash},${e.logIndex},${id},${e.blockNumber},${e.blockHash},${e.eventTime},${e.availableAt},${e.from},${e.to},${e.rawQuantity},${e.decimals},${e.kind},${e.source}) ON CONFLICT(chain_id,tx_hash,log_index) DO UPDATE SET canonical=true,block_hash=excluded.block_hash,block_number=excluded.block_number,event_time=excluded.event_time`;
      for (const a of [e.from, e.to])
        await tx`INSERT INTO wallets(chain_id,address) VALUES(${e.chain},${a}) ON CONFLICT DO NOTHING`;
    }
    await tx`INSERT INTO block_cursors(token_id,chain_id,block_number,block_hash,scanned_at) VALUES(${id},${t.chain_id},${to},${blocks.get(to)!.data.hash.toLowerCase()},${observedAt}) ON CONFLICT(token_id) DO UPDATE SET block_number=excluded.block_number,block_hash=excluded.block_hash,scanned_at=excluded.scanned_at`;
    await tx`INSERT INTO scan_windows(token_id,from_block,to_block,start_time,end_time,available_at,count,complete) VALUES(${id},${from},${to},${startTime},${endTime},${observedAt},${transfers.filter((t) => t.kind === "unknown_transfer").length},true) ON CONFLICT DO NOTHING`;
  });
  // Bounded balance samples of observed addresses, not a holder leaderboard.
  const addresses = [...new Set(transfers.flatMap((t) => [t.from, t.to]))]
    .filter((a) => !/^0x0{40}$/.test(a))
    .slice(0, 3);
  for (const a of addresses) {
    try {
      const b = await rpc.balance(a, t.contract, to);
      await sql`INSERT INTO wallet_balance_snapshots(chain_id,address,token_id,block_number,block_hash,raw_quantity,observed_at,source) VALUES(${t.chain_id},${a},${id},${to},${blocks.get(to)!.data.hash},${b.data},${b.observedAt},${b.source}) ON CONFLICT DO NOTHING`;
    } catch {
      await sql`INSERT INTO data_quality_issues(token_id,provider,kind,detail) VALUES(${id},${"rpc:" + t.chain_id},'balance_unavailable','Historic balance call failed; transfer evidence remains available.')`;
    }
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
  if (result.signal) {
    const s = result.signal;
    const previous =
      await sql`SELECT id FROM signal_events WHERE token_id=${id} AND kind=${s.kind} AND first_detected_at>now()-(${c.SIGNAL_COOLDOWN_MINUTES} * interval '1 minute')`;
    if (previous.length) return;
    const signalId = randomUUID();
    await sql.begin(async (tx) => {
      await tx`INSERT INTO signal_events(id,token_id,kind,rule_version,stage,first_detected_at,computed_at,data_available_at,price_at_detection,quote_asset,market_snapshot_id,evidence_confidence,thresholds,observed,counter_evidence,message) VALUES(${signalId},${id},${s.kind},${s.ruleVersion},${s.stage},${s.firstDetectedAt},${s.computedAt},${s.dataAvailableAt},${s.priceAtDetection},${s.quoteAsset},${market.id},${s.evidenceConfidence},${jsonParam(s.thresholds)}::jsonb,${jsonParam(s.observed)}::jsonb,${jsonParam(s.counterEvidence)}::jsonb,'Unusual confirmed transfer count relative to this token’s prior equal-block windows. Not evidence of buying or accumulation.')`;
      for (const e of s.evidence)
        await tx`INSERT INTO signal_evidence(signal_id,chain_id,tx_hash,log_index) VALUES(${signalId},${e.chain},${e.txHash},${e.logIndex}) ON CONFLICT DO NOTHING`;
      await tx`INSERT INTO notification_deliveries(id,signal_id,channel,status,payload) VALUES(${randomUUID()},${signalId},'in_app','delivered',${jsonParam({ kind: s.kind, token: t.symbol, at: observedAt })}::jsonb)`;
    });
  }
  console.log(
    JSON.stringify({
      event: "scan",
      token: t.symbol,
      chain: t.chain_id,
      from,
      to,
      events: transfers.length,
      detection: result.reason,
    }),
  );
}
