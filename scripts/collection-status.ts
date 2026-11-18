import { sqlClient, closeDb } from "../packages/db/src/index";
import {
  networkErrorCode,
  closeProviderNetwork,
} from "../packages/core/src/index";
process.env.DATABASE_URL =
  process.env.DATABASE_URL_WORKER ?? process.env.DATABASE_URL;
try {
  const sql = sqlClient();
  const [counts, work, scans, scanQueue, storage, latestRegistryStorage, marketCoverage, classification, marketCycle, heartbeat, locks] =
    await Promise.all([
      sql`SELECT (SELECT count(*) FROM alpha_tokens)::int AS identities,(SELECT count(DISTINCT alpha_id) FROM alpha_tokens WHERE alpha_id IS NOT NULL)::int AS alpha_ids,(SELECT count(DISTINCT alpha_id) FROM alpha_tokens WHERE status='current' AND alpha_id IS NOT NULL)::int AS online_alpha_ids,(SELECT count(*) FROM alpha_tokens WHERE status='current')::int AS online,(SELECT count(*) FROM alpha_tokens WHERE status='offline')::int AS offline,(SELECT count(*) FROM alpha_tokens WHERE status='unknown')::int AS unknown,(SELECT count(*) FROM alpha_tokens WHERE status='current' AND EXISTS(SELECT 1 FROM market_symbols s WHERE s.alpha_id=alpha_tokens.alpha_id AND s.active AND (s.status='TRADING' OR s.status IS NULL)))::int AS online_with_active_pair,(SELECT count(*) FROM alpha_tokens WHERE status='current' AND metadata->>'price' IS NOT NULL)::int AS registry_metadata_prices,(SELECT count(*) FROM market_symbols)::int AS symbols,(SELECT count(DISTINCT token_id) FROM market_snapshots WHERE source_kind='alpha_market')::int AS quoted_tokens,(SELECT count(*) FROM ohlcv_candles)::int AS candles,(SELECT count(*) FROM token_transfers WHERE canonical)::int AS transfers,(SELECT count(*) FROM verified_swaps WHERE canonical)::int AS swap_interpretations,pg_database_size(current_database())::text AS database_bytes`,
      sql`SELECT state,wait_event_type,wait_event,count(*)::int,max(extract(epoch FROM now()-query_start))::integer AS longest_query_seconds FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() GROUP BY state,wait_event_type,wait_event`,
      sql`SELECT t.id,t.symbol,t.chain_id,j.status,j.run_after,j.last_error,j.attempts,c.block_number::text,c.scanned_at,q.active AS intensive,q.priority FROM alpha_tokens t LEFT JOIN worker_jobs j ON j.key='scan:'||t.id LEFT JOIN block_cursors c ON c.token_id=t.id LEFT JOIN token_investigation_queue q ON q.token_id=t.id WHERE t.status='current' AND t.chain_id IN ('56','1','8453','42161','CT_501') ORDER BY j.run_after NULLS FIRST,t.chain_id,t.id`,
      sql`SELECT count(*) FILTER(WHERE t.status='current' AND t.chain_id IN ('56','1','8453','42161','CT_501'))::int AS supported_online,count(*) FILTER(WHERE t.status='current' AND t.chain_id IN ('56','1','8453','42161','CT_501') AND j.key IS NOT NULL)::int AS scheduled,count(*) FILTER(WHERE t.status='current' AND t.chain_id IN ('56','1','8453','42161','CT_501') AND j.run_after<=now())::int AS due,count(*) FILTER(WHERE t.status='current' AND t.chain_id IN ('56','1','8453','42161','CT_501') AND j.status='retry')::int AS retrying,count(*) FILTER(WHERE t.status='current' AND t.chain_id NOT IN ('56','1','8453','42161','CT_501'))::int AS unsupported,(SELECT count(*)::int FROM token_investigation_queue WHERE active) AS intensive FROM alpha_tokens t LEFT JOIN worker_jobs j ON j.key='scan:'||t.id AND j.kind='scan'`,
      sql`SELECT source_kind,count(*)::int AS rows,avg(pg_column_size(m))::int AS mean_row_bytes FROM market_snapshots m GROUP BY source_kind`,
      sql`SELECT count(*)::int AS rows,avg(pg_column_size(m))::int AS mean_row_bytes,count(*) FILTER(WHERE raw->>'registryResponseHash'=response_hash AND EXISTS(SELECT 1 FROM source_responses r WHERE r.hash=m.response_hash))::int AS verified_source_references FROM market_snapshots m WHERE source_kind='alpha_registry' AND observed_at=(SELECT max(observed_at) FROM market_snapshots WHERE source_kind='alpha_registry')`,
      sql`SELECT status,count(*)::int AS tokens,count(*) FILTER(WHERE checked_at>now()-interval '15 minutes')::int AS checked_fresh,max(checked_at) AS latest FROM market_coverage GROUP BY status ORDER BY status`,
      sql`SELECT classification,count(*)::int AS tokens FROM token_project_classifications GROUP BY classification ORDER BY classification`,
      sql`SELECT value FROM settings WHERE key='market_coverage_sync'`,
      sql`SELECT value FROM settings WHERE key='worker_heartbeat'`,
      sql`SELECT l.pid,a.application_name,a.state,a.backend_start,a.xact_start,a.query_start,a.client_addr FROM pg_locks l LEFT JOIN pg_stat_activity a ON a.pid=l.pid WHERE l.locktype='advisory' AND l.objid=726032 AND l.granted`,
    ]);
  console.log(
    JSON.stringify(
      {
        at: new Date().toISOString(),
        counts: counts[0],
        databaseActivity: work,
        marketStorage: storage,
        latestRegistryStorage: latestRegistryStorage[0],
        marketCoverage,
        classification,
        marketCycle: marketCycle[0]?.value ?? null,
        scanQueue: scanQueue[0] ?? null,
        heartbeat: heartbeat[0]?.value ?? null,
        collectorLocks: locks,
        selected: scans,
      },
      null,
      2,
    ),
  );
} catch (e) {
  console.error(JSON.stringify({ ok: false, error: networkErrorCode(e) }));
  process.exitCode = 1;
} finally {
  await closeDb();
  await closeProviderNetwork();
}
