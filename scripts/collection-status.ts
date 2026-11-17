import { sqlClient, closeDb } from "../packages/db/src/index";
import {
  networkErrorCode,
  closeProviderNetwork,
} from "../packages/core/src/index";
process.env.DATABASE_URL =
  process.env.DATABASE_URL_WORKER ?? process.env.DATABASE_URL;
try {
  const sql = sqlClient();
  const [counts, work, scans, storage, latestRegistryStorage] =
    await Promise.all([
      sql`SELECT (SELECT count(*) FROM alpha_tokens)::int AS identities,(SELECT count(*) FROM market_symbols)::int AS symbols,(SELECT count(DISTINCT token_id) FROM market_snapshots WHERE source_kind='alpha_market')::int AS quoted_tokens,(SELECT count(*) FROM ohlcv_candles)::int AS candles,(SELECT count(*) FROM token_transfers WHERE canonical)::int AS transfers,(SELECT count(*) FROM verified_swaps WHERE canonical)::int AS swap_interpretations,pg_database_size(current_database())::text AS database_bytes`,
      sql`SELECT state,wait_event_type,wait_event,count(*)::int,max(extract(epoch FROM now()-query_start))::integer AS longest_query_seconds FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() GROUP BY state,wait_event_type,wait_event`,
      sql`SELECT t.id,t.symbol,t.chain_id,c.block_number::text,c.scanned_at FROM alpha_tokens t LEFT JOIN block_cursors c ON c.token_id=t.id WHERE deep_selected ORDER BY t.symbol`,
      sql`SELECT source_kind,count(*)::int AS rows,avg(pg_column_size(m))::int AS mean_row_bytes FROM market_snapshots m GROUP BY source_kind`,
      sql`SELECT count(*)::int AS rows,avg(pg_column_size(m))::int AS mean_row_bytes,count(*) FILTER(WHERE raw->>'registryResponseHash'=response_hash AND EXISTS(SELECT 1 FROM source_responses r WHERE r.hash=m.response_hash))::int AS verified_source_references FROM market_snapshots m WHERE source_kind='alpha_registry' AND observed_at=(SELECT max(observed_at) FROM market_snapshots WHERE source_kind='alpha_registry')`,
    ]);
  console.log(
    JSON.stringify(
      {
        at: new Date().toISOString(),
        counts: counts[0],
        databaseActivity: work,
        marketStorage: storage,
        latestRegistryStorage: latestRegistryStorage[0],
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
