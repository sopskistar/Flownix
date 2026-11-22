import { closeDb, sqlClient } from "../packages/db/src/index";
import { networkErrorCode } from "../packages/core/src/index";
process.env.DATABASE_URL =
  process.env.DATABASE_URL_WORKER ?? process.env.DATABASE_URL;
const timer = setInterval(() => {}, 1000);
try {
  const sql = sqlClient();
  const [
    usage,
    providers,
    alerts,
    storage,
    tables,
    heartbeat,
    chains,
    activity,
    sources,
  ] = await Promise.all([
    sql`SELECT scope,period_start,used::text,updated_at FROM worker_budget_usage ORDER BY period_start DESC,scope LIMIT 100`,
    sql`SELECT * FROM worker_provider_state ORDER BY provider`,
    sql`SELECT * FROM worker_operational_alerts ORDER BY code`,
    sql`SELECT pg_database_size(current_database())::text AS bytes`,
    sql`SELECT relname,n_live_tup::text AS estimated_rows,pg_total_relation_size(relid)::text AS bytes FROM pg_stat_user_tables ORDER BY pg_total_relation_size(relid) DESC LIMIT 15`,
    sql`SELECT value FROM settings WHERE key='worker_heartbeat'`,
    sql`SELECT t.chain_id,count(*)::int AS current_tokens,count(c.token_id)::int AS evm_checkpoints,count(*) FILTER(WHERE j.run_after<=now())::int AS due,count(*) FILTER(WHERE j.status='retry')::int AS retrying,min(c.scanned_at) AS oldest_evm_collection,min(w.end_time) AS oldest_evm_source_time,max(c.scanned_at) AS latest_evm_collection FROM alpha_tokens t LEFT JOIN block_cursors c ON c.token_id=t.id LEFT JOIN worker_jobs j ON j.key='scan:'||t.id LEFT JOIN LATERAL(SELECT end_time FROM scan_windows s WHERE s.token_id=t.id AND s.complete ORDER BY to_block DESC LIMIT 1) w ON true WHERE t.status='current' GROUP BY t.chain_id ORDER BY t.chain_id`,
    sql`SELECT provider,count(*)::int AS attempts,count(*) FILTER(WHERE NOT ok)::int AS failures,max(started_at) FILTER(WHERE ok) AS latest_success FROM provider_runs WHERE started_at>now()-interval '24 hours' GROUP BY provider ORDER BY provider`,
    sql`SELECT provider,count(*)::int AS responses,avg(pg_column_size(s))::int AS mean_logical_row_bytes,min(observed_at) AS first,max(observed_at) AS last FROM source_responses s GROUP BY provider`,
  ]);
  console.log(
    JSON.stringify(
      {
        at: new Date().toISOString(),
        usage,
        providers,
        alerts,
        databaseBytes: storage[0].bytes,
        tables,
        heartbeat: heartbeat[0]?.value ?? null,
        chains,
        providerAttempts24h: activity,
        sources,
        billing:
          "Local ledger and PostgreSQL sizes only. Account-wide Alchemy and Neon billing/compute usage require their dashboards. SQL counts are not Neon CU-hours.",
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: networkErrorCode(error) }));
  process.exitCode = 1;
} finally {
  await closeDb();
  clearInterval(timer);
}
