import { sqlClient, closeDb } from "../packages/db/src/index";
import {
  closeProviderNetwork,
  networkErrorCode,
} from "../packages/core/src/index";

// Read-only, reproducible inventory. Tickers enumerate leads; every match retains
// its exact registry identity and is not admitted as a verified historical winner.
process.env.DATABASE_URL =
  process.env.DATABASE_URL_WORKER ?? process.env.DATABASE_URL;
try {
  const sql = sqlClient();
  const [
    migrations,
    membership,
    markets,
    candles,
    evidence,
    notifications,
    cases,
    sources,
    queue,
    provenance,
  ] = await Promise.all([
    sql`SELECT name,applied_at FROM schema_migrations ORDER BY name`,
    sql`SELECT count(*)::int AS snapshots,min(observed_at) AS first_observed,max(observed_at) AS latest_observed FROM alpha_membership_snapshots`,
    sql`SELECT source_kind,count(*)::int AS rows,count(DISTINCT token_id)::int AS identities,min(observed_at) AS first_observed,max(observed_at) AS latest_observed,count(*) FILTER(WHERE observed_at>now()-interval '15 minutes')::int AS recent_rows,count(*) FILTER(WHERE book IS NOT NULL)::int AS book_rows FROM market_snapshots GROUP BY source_kind`,
    sql`SELECT count(*)::int AS rows,count(DISTINCT symbol)::int AS pairs,min(open_at) AS earliest_event,max(close_at) AS latest_event,min(available_at) AS earliest_available FROM ohlcv_candles`,
    sql`SELECT (SELECT count(*) FROM token_transfers WHERE canonical)::int AS canonical_transfers,(SELECT count(*) FROM verified_swaps WHERE canonical)::int AS swap_interpretations,(SELECT count(*) FROM swap_scan_windows WHERE complete)::int AS complete_swap_windows,(SELECT count(*) FROM wallet_balance_snapshots WHERE canonical)::int AS balance_samples,(SELECT count(*) FROM wallet_labels)::int AS label_assertions,(SELECT count(*) FROM wallet_labels WHERE role='verified_exchange')::int AS verified_exchange_labels,(SELECT count(*) FROM holder_metrics)::int AS holder_metrics,(SELECT count(*) FROM entity_flows)::int AS entity_flows,(SELECT count(*) FROM wallet_relationships)::int AS relationships,(SELECT count(*) FROM signal_events)::int AS signals,(SELECT count(*) FROM signal_outcomes)::int AS outcomes,(SELECT count(*) FROM paper_trades)::int AS paper_trades,(SELECT count(*) FROM research_case_candidates)::int AS case_candidates`,
    sql`SELECT channel,status,count(*)::int AS rows,max(delivered_at) AS latest_delivery FROM notification_deliveries GROUP BY channel,status ORDER BY channel,status`,
    sql`SELECT id,chain_id,contract,alpha_id,symbol,name,status,first_seen,last_seen,response_hash FROM alpha_tokens WHERE upper(symbol)=ANY(${["LAB", "BTW", "BITWAY", "AKE", "EVAA", "CAP", "JCT", "PIEVERSE", "AGT", "Q", "RAVE", "JELLYJELLY", "TAG", "BLESS"]}) ORDER BY symbol,chain_id,contract`,
    sql`SELECT provider,count(*)::int AS rows,min(observed_at) AS earliest,max(observed_at) AS latest FROM source_responses GROUP BY provider`,
    sql`SELECT kind,status,last_error,count(*)::int AS jobs FROM worker_jobs GROUP BY kind,status,last_error ORDER BY kind,status,last_error`,
    sql`SELECT count(*)::int AS identities,count(*) FILTER(WHERE metadata->>'iconUrl' IS NOT NULL)::int AS token_logo_urls,count(*) FILTER(WHERE metadata->>'chainIconUrl' IS NOT NULL)::int AS chain_logo_urls,count(*) FILTER(WHERE EXISTS(SELECT 1 FROM source_responses s WHERE s.hash=t.response_hash))::int AS source_linked FROM alpha_tokens t`,
  ]);
  console.log(
    JSON.stringify(
      {
        at: new Date().toISOString(),
        migrations,
        membership: membership[0],
        markets,
        candles: candles[0],
        evidence: evidence[0],
        notifications,
        cases,
        sources,
        queue,
        logoProvenance: provenance[0],
        limitations: [
          "Present registry matches are not proof of membership before first_observed.",
          "Counts do not establish complete coverage, predictive value, paid quotas or beneficial ownership.",
          "No private notes, endpoint credentials or notification destinations are exported.",
        ],
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
