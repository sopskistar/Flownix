import { mkdir, writeFile } from "node:fs/promises";
import { registrySync, marketSync, scanToken } from "./ingest";
import {
  EvmProvider,
  HttpClient,
  config,
  configuredEvmRpc,
  decodeTransfer,
  explorerUrl,
  networkErrorCode,
  ProviderError,
  closeProviderNetwork,
} from "@flownix/core";
import {
  sqlClient,
  closeDb,
  saveSource,
  jsonParam,
  setSetting,
  auditRequest,
} from "@flownix/db";

let phase = "starting";
function codeFor(error: unknown) {
  if (error instanceof ProviderError) return error.code;
  const known = new Set([
    "INVALID_GATE_COMMAND",
    "COLLECTOR_BUSY",
    "PARTIAL_MARKET_FAILURE",
    "STALE_MEMBERSHIP",
    "NO_CONTRACT_CODE",
    "INVALID_SCAN_WINDOW",
    "CONFLICTING_EVENT_REPLAY",
    "NO_LIVE_WINDOWS_TO_REPLAY",
    "REPLAY_IDEMPOTENCY_FAILED",
    "FEWER_THAN_THREE_LIVE_TOKEN_EVENTS",
    "NONCANONICAL_RECEIPT",
    "RECEIPT_EVENT_MISMATCH",
  ]);
  return error instanceof Error && known.has(error.message)
    ? error.message
    : networkErrorCode(error);
}
async function main() {
  process.env.DATABASE_URL =
    process.env.DATABASE_URL_WORKER ?? process.env.DATABASE_URL;
  const sql = sqlClient();
  const command = process.argv[2] ?? "report";
  const stageErrors: { stage: string; code: string }[] = [];
  if (
    ![
      "collect",
      "scan",
      "markets",
      "replay",
      "verify",
      "report",
      "registry",
    ].includes(command)
  )
    throw Error("INVALID_GATE_COMMAND");
  const lock = await sql.reserve();
  try {
    const r = await lock`SELECT pg_try_advisory_lock(726032) AS acquired`;
    if (!r[0].acquired) throw Error("COLLECTOR_BUSY");
    phase = "registry";
    if (["collect", "scan", "replay", "registry"].includes(command))
      await registrySync();
    if (["collect", "markets"].includes(command)) {
      phase = "markets";
      try {
        await marketSync();
      } catch (error) {
        stageErrors.push({ stage: "markets", code: codeFor(error) });
      }
    }
    if (["collect", "scan"].includes(command)) {
      const tokens =
        await sql`SELECT id FROM alpha_tokens WHERE deep_selected AND status='current' ORDER BY id`;
      let refreshedAt = Date.now();
      for (const token of tokens) {
        phase = `scan:${token.id}`;
        if (Date.now() - refreshedAt > 600000) {
          await registrySync();
          refreshedAt = Date.now();
        }
        try {
          await scanToken(token.id);
        } catch (error) {
          console.log(
            JSON.stringify({
              token: token.id,
              scan: false,
              error: codeFor(error),
            }),
          );
        }
      }
    }
    if (command === "replay") {
      const samples =
        await sql`SELECT DISTINCT ON(s.token_id) s.* FROM scan_windows s JOIN alpha_tokens t ON t.id=s.token_id WHERE t.status='current' ORDER BY s.token_id,s.from_block DESC LIMIT 3`;
      if (!samples.length) throw Error("NO_LIVE_WINDOWS_TO_REPLAY");
      for (const sample of samples) {
        phase = `replay:${sample.token_id}`;
        const before = (
          await sql`SELECT count(*)::int AS count,min(available_at) AS first FROM token_transfers WHERE token_id=${sample.token_id}`
        )[0];
        const cursor = (
          await sql`SELECT block_number::text AS block FROM block_cursors WHERE token_id=${sample.token_id}`
        )[0];
        const endpoint = configuredEvmRpc(sample.chain_id);
        const blockLimit = new URL(endpoint).hostname.endsWith("alchemy.com")
          ? Math.min(config().SCAN_BLOCKS, 10)
          : config().SCAN_BLOCKS;
        for (
          let from = Number(sample.from_block);
          from <= Number(sample.to_block);
          from += blockLimit
        )
          await scanToken(sample.token_id, {
            from,
            to: Math.min(Number(sample.to_block), from + blockLimit - 1),
          });
        const after = (
          await sql`SELECT count(*)::int AS count,min(available_at) AS first FROM token_transfers WHERE token_id=${sample.token_id}`
        )[0];
        const resumed = (
          await sql`SELECT block_number::text AS block FROM block_cursors WHERE token_id=${sample.token_id}`
        )[0];
        if (
          before.count !== after.count ||
          String(before.first) !== String(after.first) ||
          cursor.block !== resumed.block
        )
          throw Error("REPLAY_IDEMPOTENCY_FAILED");
      }
      await setSetting("live_replay_verification", {
        at: new Date().toISOString(),
        windows: samples.length,
        duplicateEventsAdded: 0,
        firstAvailabilityPreserved: true,
        cursorPreserved: true,
      });
    }
    if (command === "verify") {
      const events =
        await sql`SELECT DISTINCT ON(e.token_id) e.*,t.contract,t.symbol FROM token_transfers e JOIN alpha_tokens t ON t.id=e.token_id WHERE e.canonical AND t.deep_selected ORDER BY e.token_id,e.event_time DESC LIMIT 3`;
      if (events.length < 3) throw Error("FEWER_THAN_THREE_LIVE_TOKEN_EVENTS");
      for (const event of events) {
        const rpc = new EvmProvider(
          event.chain_id,
          configuredEvmRpc(event.chain_id),
          new HttpClient(`rpc:${event.chain_id}`, 30, auditRequest),
        );
        await rpc.head();
        const receipt = await rpc.receipt(event.tx_hash);
        const block = await rpc.block(Number(event.block_number));
        if (
          receipt.data.blockHash.toLowerCase() !== event.block_hash ||
          block.data.hash.toLowerCase() !== event.block_hash
        )
          throw Error("NONCANONICAL_RECEIPT");
        const log = receipt.data.logs.find(
          (log) =>
            Number(BigInt(log.logIndex)) === event.log_index &&
            log.address.toLowerCase() === event.contract,
        );
        const at = new Date(
          Number(BigInt(block.data.timestamp)) * 1000,
        ).toISOString();
        const decoded =
          log &&
          decodeTransfer(
            log,
            event.chain_id,
            event.token_id,
            event.decimals,
            at,
            receipt.source,
            receipt.observedAt,
          );
        if (
          !decoded ||
          decoded.rawQuantity !== event.raw_quantity ||
          decoded.from !== event.from_address ||
          decoded.to !== event.to_address ||
          at !== new Date(event.event_time).toISOString()
        )
          throw Error("RECEIPT_EVENT_MISMATCH");
        await saveSource(`rpc:${event.chain_id}`, receipt);
        await saveSource(`rpc:${event.chain_id}`, block);
        await sql`INSERT INTO receipt_evidence(chain_id,tx_hash,block_hash,token_id,block_number,observed_at,response_hash,source,evidence) VALUES(${event.chain_id},${event.tx_hash},${event.block_hash},${event.token_id},${event.block_number},${receipt.observedAt},${receipt.hash},${receipt.source},${jsonParam({ logIndex: event.log_index, eventTime: at, rawQuantity: event.raw_quantity, classification: decoded.kind, explorer: explorerUrl(event.chain_id, "tx", event.tx_hash), blockResponseHash: block.hash })}::jsonb) ON CONFLICT DO NOTHING`;
      }
    }
    phase = "report";
    const [
      tokens,
      markets,
      scans,
      tx,
      receipts,
      traces,
      history,
      replay,
      bytes,
    ] = await Promise.all([
      sql`SELECT status,chain_id,count(*)::int AS count FROM alpha_tokens GROUP BY status,chain_id ORDER BY status,chain_id`,
      sql`SELECT source_kind,count(DISTINCT token_id)::int AS tokens,count(*)::int AS observations,max(observed_at) AS latest FROM market_snapshots GROUP BY source_kind`,
      sql`SELECT t.id,t.symbol,t.chain_id,c.block_number::text,c.scanned_at FROM alpha_tokens t LEFT JOIN block_cursors c ON c.token_id=t.id WHERE t.deep_selected ORDER BY t.chain_id,t.symbol`,
      sql`SELECT chain_id,count(*)::int AS events,min(event_time) AS first_event,max(event_time) AS last_event FROM token_transfers WHERE canonical GROUP BY chain_id`,
      sql`SELECT chain_id,tx_hash,block_hash,block_number::text,observed_at,evidence FROM receipt_evidence WHERE canonical ORDER BY observed_at DESC LIMIT 3`,
      sql`SELECT token_id,rule_version,reason,computed_at,evidence FROM detection_traces ORDER BY id DESC LIMIT 3`,
      sql`SELECT symbol,count(*)::int AS candles,min(open_at) AS first,max(close_at) AS last,min(available_at) AS first_available FROM ohlcv_candles GROUP BY symbol ORDER BY symbol`,
      sql`SELECT value FROM settings WHERE key='live_replay_verification'`,
      sql`SELECT pg_database_size(current_database())::text AS bytes`,
    ]);
    const count = tokens.reduce((sum, row) => sum + row.count, 0),
      current = tokens
        .filter((row) => row.status === "current")
        .reduce((sum, row) => sum + row.count, 0);
    const covered = scans.filter((row) => row.scanned_at).length;
    const passed =
      count > 0 &&
      markets.some(
        (row) => row.source_kind === "alpha_market" && row.tokens >= 10,
      ) &&
      covered >= 10 &&
      receipts.length >= 3 &&
      traces.length > 0 &&
      !!replay[0];
    const report = {
      checkedAt: new Date().toISOString(),
      command,
      stageErrors,
      passed,
      universe: { observed: count, current, byStatusAndChain: tokens },
      markets,
      deepTokens: scans,
      canonicalTransfers: tx,
      verifiedReceipts: receipts,
      detectionTraces: traces,
      candleHistory: history,
      replay: replay[0]?.value ?? null,
      databaseBytes: bytes[0].bytes,
      limitations: [
        "Bounded observed windows are not complete holder history",
        "Transfer events are not verified purchases",
        "Only locally proven Alpha membership is point-in-time evidence",
        "This CLI run is not an always-on hosted worker",
      ],
    };
    await setSetting("live_acceptance_report", report);
    await mkdir("artifacts/live", { recursive: true });
    await writeFile(
      "artifacts/live/acceptance.json",
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report, null, 2));
    if (!passed && ["verify", "report"].includes(command)) process.exitCode = 1;
    if (stageErrors.length) process.exitCode = 1;
  } finally {
    await lock`SELECT pg_advisory_unlock(726032)`;
    lock.release();
  }
}
// Keep the one-shot process alive while native client timers/sockets are unreferenced.
const keepAlive = setInterval(
  () =>
    console.log(
      JSON.stringify({
        event: "acceptance_progress",
        phase,
        at: new Date().toISOString(),
      }),
    ),
  30000,
);
main()
  .catch((error) => {
    console.error(
      JSON.stringify({
        error: codeFor(error),
        gate: "not passed; inspect recorded diagnostics",
      }),
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb();
    await closeProviderNetwork();
    clearInterval(keepAlive);
  });
