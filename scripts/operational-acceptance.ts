import { writeFile, mkdir } from "node:fs/promises";
import { sqlClient, closeDb } from "../packages/db/src/index";
import { networkErrorCode, config } from "../packages/core/src/index";
import { SUPPORTED_BASELINE_CHAINS } from "../apps/worker/src/scheduler";
process.env.DATABASE_URL =
  process.env.DATABASE_URL_WORKER ?? process.env.DATABASE_URL;
const timer = setInterval(() => {}, 1000);
const deadline = setTimeout(() => {
  console.error("ACCEPTANCE_DATABASE_DEADLINE");
  process.exit(1);
}, 90000);
try {
  const sql = sqlClient(),
    since = new Date(
      process.argv.slice(2).find((a) => !a.startsWith("--")) ??
        Date.now() - 86400000,
    ).toISOString(),
    c = config();
  const [
    chains,
    markets,
    jobs,
    storage,
    usage,
    locks,
    notifications,
    heartbeat,
    sourceSpans,
  ] = await Promise.all([
    sql`SELECT t.chain_id,count(*)::int AS eligible,count(*) FILTER(WHERE t.chain_id=ANY(${[...SUPPORTED_BASELINE_CHAINS]}))::int AS adapter_eligible,count(*) FILTER(WHERE coalesce(l.observed_at,(s.value->>'at')::timestamptz)>=${since}::timestamptz)::int AS sampled_since,min(l.source_time) AS oldest_evm_source,max(l.source_time) AS newest_evm_source,count(*) FILTER(WHERE l.source_time>now()-interval '15 minutes')::int AS source_fresh_15m FROM alpha_tokens t LEFT JOIN live_scan_checkpoints l ON l.token_id=t.id LEFT JOIN settings s ON s.key='solana_coverage:'||t.id WHERE t.status='current' GROUP BY t.chain_id ORDER BY t.chain_id`,
    sql`SELECT count(*)::int AS eligible,count(*) FILTER(WHERE mc.status='no_pair')::int AS no_pair,count(*) FILTER(WHERE mc.status='observed' AND m.observed_at>now()-interval '15 minutes' AND m.provider_time>now()-interval '15 minutes' AND m.provider_time<=now()+interval '30 seconds')::int AS source_fresh FROM alpha_tokens t LEFT JOIN market_coverage mc ON mc.token_id=t.id LEFT JOIN LATERAL(SELECT observed_at,provider_time FROM market_snapshots WHERE token_id=t.id AND source_kind='alpha_market' ORDER BY observed_at DESC LIMIT 1) m ON true WHERE t.status='current'`,
    sql`SELECT job_kind,chain_id,status,count(*)::int AS jobs,avg(extract(epoch FROM finished_at-started_at)) AS mean_seconds,max((measurements->>'rssBytes')::bigint)::text AS peak_sampled_rss_bytes,avg((measurements->>'cpuMicros')::numeric / greatest(1,extract(epoch FROM finished_at-started_at)) / 10000) AS process_cpu_pct FROM worker_job_observations WHERE finished_at>=${since}::timestamptz GROUP BY job_kind,chain_id,status ORDER BY job_kind,chain_id,status`,
    sql`SELECT pg_database_size(current_database())::text AS bytes,(SELECT value FROM settings WHERE key='worker_storage_sample') AS last_storage_sample`,
    sql`SELECT scope,period_start,used::text FROM worker_budget_usage WHERE period_start>=date_trunc('month',now()) ORDER BY period_start,scope`,
    sql`SELECT count(*)::int AS collectors FROM pg_locks WHERE locktype='advisory' AND objid=726032 AND granted`,
    sql`SELECT channel,status,count(*)::int AS count FROM notification_deliveries GROUP BY channel,status ORDER BY channel,status`,
    sql`SELECT value FROM settings WHERE key='worker_heartbeat'`,
    sql`SELECT t.chain_id,avg(extract(epoch FROM w.end_time-w.start_time)) AS mean_sample_source_seconds,count(*)::int AS windows FROM scan_windows w JOIN alpha_tokens t ON t.id=w.token_id WHERE w.available_at>=${since}::timestamptz AND w.complete GROUP BY t.chain_id`,
  ]);
  const supported = chains.reduce((n, r) => n + r.adapter_eligible, 0),
    sampled = chains
      .filter((r) => r.adapter_eligible)
      .reduce((n, r) => n + r.sampled_since, 0);
  const report = {
    at: new Date().toISOString(),
    since,
    chains,
    markets: markets[0],
    jobs,
    storage: storage[0],
    usage,
    collectors: locks[0].collectors,
    heartbeat: heartbeat[0]?.value ?? null,
    notifications,
    sourceSpans,
    acceptance: {
      supportedUniverse: supported,
      sampledSince: sampled,
      fullSupportedCycleObserved: sampled === supported && supported > 0,
      fullMarketFreshness:
        markets[0].source_fresh + markets[0].no_pair === markets[0].eligible,
      continuousTransferCoverage: false,
      hostedSoakPassed: false,
    },
    costs: {
      alchemyModelPerOrdinaryEvmScanCU: 202,
      configuredMonthlyCap: c.ALCHEMY_MONTHLY_CU_LIMIT,
      untrackedMonthlyCU: c.ALCHEMY_MONTHLY_UNTRACKED_CU,
      neonComputeUsageMeasured: false,
      minimumContinuousCUHours30d: 180,
      freeNeonCUHours: 100,
    },
    limitations: [
      "Recent block samples preserve historical cursors and explicitly record intervening unknown coverage; they are not a continuous ledger.",
      "Process metrics include overlapping market work; do not sum job CU deltas as exclusive billing.",
      "No billing-dashboard credentials are available; SQL activity and database size are not Neon billed compute.",
      "A partial cycle cannot establish complete-universe throughput or a freshness SLA.",
    ],
  };
  if (!process.argv.includes("--stdout-only")) {
    await mkdir("artifacts/live", { recursive: true });
    await writeFile(
      "artifacts/live/operational-acceptance.json",
      JSON.stringify(report, null, 2),
    );
  }
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  console.error(networkErrorCode(error));
  process.exitCode = 1;
} finally {
  await closeDb();
  clearInterval(timer);
  clearTimeout(deadline);
}
