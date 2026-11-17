import { sqlClient, closeDb } from "../packages/db/src/index";
import {
  closeProviderNetwork,
  networkErrorCode,
} from "../packages/core/src/index";
process.env.DATABASE_URL =
  process.env.DATABASE_URL_WORKER ?? process.env.DATABASE_URL;
const keepAlive = setInterval(() => {}, 1000);
try {
  const sql = sqlClient();
  const [errors, swaps, coverage, research, heartbeat, replay, locks] =
    await Promise.all([
      sql`SELECT provider,error,count(*)::int AS requests,max(started_at) AS last FROM provider_runs WHERE NOT ok AND started_at>now()-interval '6 hours' GROUP BY provider,error ORDER BY last DESC LIMIT 20`,
      sql`SELECT chain_id,classification,side,(actor IS NOT NULL) AS attributed,count(*)::int AS events,min(event_time) AS first,max(event_time) AS last FROM verified_swaps WHERE canonical GROUP BY chain_id,classification,side,(actor IS NOT NULL)`,
      sql`SELECT t.symbol,t.chain_id,min(w.start_time) AS first,max(w.end_time) AS last,sum(w.to_block-w.from_block+1)::text AS blocks,count(*)::int AS windows FROM scan_windows w JOIN alpha_tokens t ON t.id=w.token_id GROUP BY t.symbol,t.chain_id ORDER BY t.symbol`,
      sql`SELECT (SELECT count(*) FROM wallet_balance_snapshots WHERE canonical)::int AS balances,(SELECT count(*) FROM wallet_research_observations)::int AS wallet_reports,(SELECT count(*) FROM signal_events)::int AS signals`,
      sql`SELECT value FROM settings WHERE key='worker_heartbeat'`,
      sql`SELECT value FROM settings WHERE key='live_replay_verification'`,
      sql`SELECT count(*)::int AS collector_locks FROM pg_locks WHERE locktype='advisory' AND objid=726032`,
    ]);
  console.log(
    JSON.stringify(
      {
        at: new Date().toISOString(),
        errors,
        swaps,
        coverage,
        research,
        heartbeat: heartbeat[0]?.value ?? null,
        replay: replay[0]?.value ?? null,
        locks,
      },
      null,
      2,
    ),
  );
} catch (e) {
  console.error(networkErrorCode(e));
  process.exitCode = 1;
} finally {
  await closeDb();
  await closeProviderNetwork();
  clearInterval(keepAlive);
}
