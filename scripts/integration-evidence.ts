import { sqlClient, closeDb } from "../packages/db/src/index";
import { writeFile } from "node:fs/promises";
process.env.DATABASE_URL =
  process.env.DATABASE_URL_WORKER ?? process.env.DATABASE_URL;
const keep = setInterval(() => {}, 1000);
try {
  const sql = sqlClient();
  const result = await sql.begin("read only", async (tx) => {
    const identities =
      await tx`SELECT id,symbol,chain_id,contract,alpha_id,source,last_seen FROM alpha_tokens WHERE upper(symbol)='EVAA'`;
    const ids = identities.map((t) => t.id);
    return {
      at: new Date().toISOString(),
      identities,
      evaaSnapshots:
        await tx`SELECT m.id,m.token_id,m.symbol,m.source_kind,m.source,m.quote_asset,m.price::text,m.observed_at,m.provider_time,m.response_hash,m.raw FROM market_snapshots m WHERE token_id=ANY(${ids}) ORDER BY observed_at DESC LIMIT 25`,
      evaaPairs:
        await tx`SELECT symbol,alpha_id,quote_asset,status,observed_at FROM market_symbols WHERE alpha_id IN (SELECT alpha_id FROM alpha_tokens WHERE id=ANY(${ids}))`,
      evaaRawTicker:
        await tx`SELECT r.hash,r.raw_text,r.observed_at FROM source_responses r WHERE r.hash=(SELECT response_hash FROM market_snapshots WHERE token_id=ANY(${ids}) AND source_kind='alpha_market' ORDER BY observed_at DESC LIMIT 1)`,
      cycleTotals:
        await tx`SELECT CASE WHEN started_at<'2026-11-26T15:55Z' THEN 'first' ELSE 'second' END AS cycle,chain_id,count(*)::int AS jobs,count(DISTINCT token_id)::int AS unique_tokens FROM worker_job_observations WHERE job_kind='scan' AND status='completed' AND started_at>'2026-11-26T03:55Z' AND started_at<'2026-11-27T03:55Z' GROUP BY 1,2 ORDER BY 1,2`,
      cycleQuotes:
        await tx`SELECT CASE WHEN observed_at<'2026-11-26T15:55Z' THEN 'first' ELSE 'second' END AS cycle,count(*)::int AS rows,count(DISTINCT token_id)::int AS unique_tokens FROM market_snapshots WHERE source_kind='alpha_market' AND observed_at>'2026-11-26T03:55Z' AND observed_at<'2026-11-27T03:55Z' GROUP BY 1 ORDER BY 1`,
      marketJobs:
        await tx`SELECT j.started_at,j.finished_at,j.status,j.error_code,j.measurements->'counters' AS counters,(SELECT count(*)::int FROM market_snapshots m WHERE m.source_kind='alpha_market' AND m.observed_at BETWEEN j.started_at AND j.finished_at) AS quotes,(SELECT count(*)::int FROM market_coverage c WHERE c.status='no_pair' AND c.checked_at BETWEEN j.started_at AND j.finished_at) AS still_recorded_no_pairs FROM worker_job_observations j WHERE j.job_kind='market' AND j.started_at>'2026-11-26T03:55Z' ORDER BY started_at`,
      settings:
        await tx`SELECT key,value FROM settings WHERE key IN ('worker_duty_cycle','worker_heartbeat','market_coverage_sync','persistence_sync')`,
      batches:
        await tx`SELECT date_trunc('hour',observed_at) AS hour,count(*)::int AS rows,count(DISTINCT token_id)::int AS identities FROM market_snapshots WHERE source_kind='alpha_market' AND observed_at>'2026-11-26' GROUP BY 1 ORDER BY 1`,
      jobs: await tx`SELECT date_trunc('hour',started_at) AS hour,job_kind,chain_id,status,error_code,count(*)::int AS jobs,count(DISTINCT token_id)::int AS unique_jobs,max((measurements->>'rssBytes')::bigint)::text AS max_rss FROM worker_job_observations WHERE started_at>'2026-11-26' GROUP BY 1,2,3,4,5 ORDER BY 1,2,3`,
      coverage:
        await tx`SELECT t.chain_id,count(*)::int AS current,count(l.token_id)::int AS sampled,min(l.observed_at) AS oldest_collection,max(l.observed_at) AS latest_collection,min(l.source_time) AS oldest_source,count(*) FILTER(WHERE j.run_after<=now())::int AS due FROM alpha_tokens t LEFT JOIN live_scan_checkpoints l ON l.token_id=t.id LEFT JOIN worker_jobs j ON j.key='scan:'||t.id WHERE t.status='current' GROUP BY t.chain_id ORDER BY t.chain_id`,
      research:
        await tx`SELECT (SELECT count(*) FROM alpha_tokens WHERE deep_selected)::int AS manually_selected,(SELECT count(*) FROM token_investigation_queue WHERE active)::int AS active_investigations,(SELECT count(*) FROM token_transfers WHERE canonical)::int AS transfers,(SELECT count(*) FROM verified_swaps WHERE canonical)::int AS swaps,(SELECT count(*) FROM wallet_balance_snapshots WHERE canonical)::int AS balances,(SELECT count(*) FROM solana_balance_observations)::int AS solana_balances,(SELECT count(*) FROM accumulation_observations)::int AS research_rows,(SELECT count(*) FROM wallet_relationships)::int AS relationships,(SELECT count(*) FROM scan_windows WHERE complete)::int AS complete_small_windows,(SELECT count(*) FROM worker_jobs WHERE kind='persistence')::int AS research_jobs`,
      researchReasons:
        await tx`SELECT metrics->'thesis'->>'reason' AS reason,count(*)::int AS rows FROM accumulation_observations GROUP BY 1`,
      traceReasons:
        await tx`SELECT value->>'reason' AS reason,count(*)::int AS tokens FROM settings WHERE key LIKE 'trace:%' GROUP BY 1`,
      budgets:
        await tx`SELECT scope,period_start,used::text FROM worker_budget_usage ORDER BY period_start DESC,scope LIMIT 50`,
      providers: await tx`SELECT * FROM worker_provider_state`,
      leases:
        await tx`SELECT status,count(*)::int AS jobs,count(*) FILTER(WHERE lease_until<now())::int AS expired FROM worker_jobs GROUP BY status`,
      telegram:
        await tx`SELECT status,count(*)::int AS rows FROM notification_deliveries WHERE channel='telegram' GROUP BY status`,
      storage:
        await tx`SELECT pg_database_size(current_database())::text AS bytes,(SELECT count(*) FROM pg_locks WHERE locktype='advisory' AND objid=726032 AND granted)::int AS collector_locks`,
    };
  });
  await writeFile(
    "artifacts/integration-evidence.json",
    JSON.stringify(result, null, 2),
  );
  console.log(
    JSON.stringify(
      {
        ...result,
        evaaSnapshots: result.evaaSnapshots.map(({ raw: _raw, ...r }) => r),
      },
      null,
      2,
    ),
  );
} catch {
  console.error("EVIDENCE_READ_FAILED");
  process.exitCode = 1;
} finally {
  await closeDb();
  clearInterval(keep);
}
