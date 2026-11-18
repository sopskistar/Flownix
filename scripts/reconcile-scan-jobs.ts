export {};
process.env.DATABASE_URL = process.env.DATABASE_URL_WORKER ?? process.env.DATABASE_URL;
const { reconcileScanJobs } = await import("../apps/worker/src/scheduler");
const { sqlClient, closeDb } = await import("../packages/db/src/index");
try {
  const result = await reconcileScanJobs();
  const sql = sqlClient();
  const coverage = await sql`
    SELECT count(*) FILTER(WHERE t.status='current' AND t.chain_id=ANY(${["56", "1", "8453", "42161", "CT_501"]}))::int AS eligible,
      count(*) FILTER(WHERE t.status='current' AND t.chain_id=ANY(${["56", "1", "8453", "42161", "CT_501"]}) AND j.key IS NOT NULL)::int AS scheduled,
      count(*) FILTER(WHERE t.status='current' AND t.chain_id=ANY(${["56", "1", "8453", "42161", "CT_501"]}) AND j.run_after<=now())::int AS due,
      count(*) FILTER(WHERE t.status='current' AND t.chain_id=ANY(${["56", "1", "8453", "42161", "CT_501"]}) AND j.status='retry')::int AS retrying
    FROM alpha_tokens t LEFT JOIN worker_jobs j ON j.key='scan:'||t.id AND j.kind='scan'
  `;
  const [universe, markets, retryErrors, events, notices, lag] = await Promise.all([
    sql`SELECT count(*)::int AS identities,count(*) FILTER(WHERE status='current')::int AS online,count(*) FILTER(WHERE status='offline')::int AS offline FROM alpha_tokens`,
    sql`SELECT count(*) FILTER(WHERE t.status='current' AND m.status='observed' AND m.observed_at>now()-interval '15 minutes')::int AS fresh,count(*) FILTER(WHERE t.status='current' AND m.status='observed' AND m.observed_at<=now()-interval '15 minutes')::int AS stale,count(*) FILTER(WHERE t.status='current' AND m.status='no_pair')::int AS no_pair,count(*) FILTER(WHERE t.status='current' AND m.status='error')::int AS errors,count(*) FILTER(WHERE t.status='current' AND s.token_id IS NOT NULL AND m.token_id IS NULL)::int AS not_checked FROM alpha_tokens t LEFT JOIN market_coverage m ON m.token_id=t.id LEFT JOIN LATERAL(SELECT 1 AS token_id FROM market_symbols x WHERE x.alpha_id=t.alpha_id AND x.active AND (x.status='TRADING' OR x.status IS NULL) LIMIT 1)s ON true`,
    sql`SELECT coalesce(last_error,'NO_ERROR') AS code,count(*)::int AS jobs,min(run_after) AS earliest_retry FROM worker_jobs j JOIN alpha_tokens t ON j.key='scan:'||t.id WHERE j.kind='scan' AND j.status='retry' AND t.status='current' GROUP BY last_error ORDER BY jobs DESC`,
    sql`SELECT kind,count(*)::int AS events FROM signal_events GROUP BY kind ORDER BY kind`,
    sql`SELECT channel,status,count(*)::int AS deliveries FROM notification_deliveries GROUP BY channel,status ORDER BY channel,status`,
    sql`SELECT t.chain_id,count(*) FILTER(WHERE c.scanned_at IS NOT NULL)::int AS with_cursor,min(c.scanned_at) AS oldest_scan,max(c.scanned_at) AS latest_scan,min(c.block_number)::text AS lowest_cursor,max(c.block_number)::text AS highest_cursor FROM alpha_tokens t LEFT JOIN block_cursors c ON c.token_id=t.id WHERE t.status='current' AND t.chain_id IN ('56','1','8453','42161') GROUP BY t.chain_id ORDER BY t.chain_id`,
  ]);
  console.log(JSON.stringify({ at: new Date().toISOString(), ...result, queue: coverage[0], universe: universe[0], marketCoverage: markets[0], retryErrors, signalEvents: events, notificationDeliveries: notices, evmCursorCoverage: lag }, null, 2));
} catch (error) {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "SCHEDULE_RECONCILE_FAILED";
  console.error(code);
  process.exitCode = 1;
} finally {
  await closeDb();
}
