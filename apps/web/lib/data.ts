import "server-only";
import { requireAccess } from "./auth";
import { sqlClient } from "@flownix/db";
import { tokenVisual, type TokenVisual } from "@flownix/core";
export type { DbRows } from "@flownix/db";
export type RadarToken = {
  visual: TokenVisual;
  id: string;
  symbol: string;
  name: string;
  chain_id: string;
  chain_name: string;
  contract: string;
  alpha_id: string | null;
  status: string;
  research_state: string;
  classification: string;
  deep_selected: boolean;
  first_seen: string;
  last_seen: string;
  watchlisted: boolean;
  price: string | null;
  quote_asset: string | null;
  price_source: string | null;
  price_at: string | null;
  change_24h: string | null;
  volume_24h: string | null;
  liquidity: string | null;
  market_cap: string | null;
  last_scan: string | null;
  first_signal: string | null;
  signal_count: number;
  baseline_trace: string | null;
};
export type Health = {
  database: boolean;
  error: string | null;
  registry: { at: string; count: number; source: string; hash: string } | null;
  market: {
    at: string | null;
    online: number;
    eligiblePairs: number;
    freshPrices: number;
    stalePrices: number;
    missingPair: number;
    errors: number;
    pending: number;
    registryPrices: number;
    lastCycle: Record<string, unknown> | null;
  };
  heartbeat: { at: string; stopped?: boolean } | null;
  providers: {
    provider: string;
    last_ok: string | null;
    last_attempt: string;
    calls: number;
    failures: number;
    cost: string;
  }[];
  jobs: {
    key: string;
    kind: string;
    status: string;
    run_after: string;
    last_error: string | null;
    attempts: number;
  }[];
  scanCoverage: {
    eligible: number;
    scheduled: number;
    missingJobs: number;
    due: number;
    retrying: number;
    oldestDue: string | null;
    unsupported: number;
    intensive: number;
    intensiveWaiting: number;
  };
  chains: {
    chain_id: string;
    chain_name: string;
    tokens: number;
    active: number;
    deep: number;
    scanned: number;
    last_scan: string | null;
    coverage_gap: boolean;
  }[];
  changes: Record<string, string[]> | null;
};
export async function health(): Promise<Health> {
  await requireAccess();
  try {
    const sql = sqlClient();
    const [settings, providers, jobs, chains, snapshots, market, scanCoverage] =
      await Promise.all([
        sql`SELECT key,value FROM settings WHERE key IN ('registry_sync','worker_heartbeat','market_coverage_sync')`,
        sql`SELECT provider,max(started_at) AS last_attempt,max(started_at) FILTER(WHERE ok) AS last_ok,count(*)::int AS calls,count(*) FILTER(WHERE NOT ok)::int AS failures,sum(cost_usd)::text AS cost FROM provider_runs WHERE started_at>now()-interval '24 hours' GROUP BY provider ORDER BY provider`,
        sql`SELECT key,kind,status,run_after,last_error,attempts FROM worker_jobs ORDER BY run_after LIMIT 30`,
        sql`SELECT t.chain_id,max(t.metadata->>'chainName') AS chain_name,count(*)::int AS tokens,count(*) FILTER(WHERE t.status='current')::int AS active,count(*) FILTER(WHERE t.deep_selected)::int AS deep,count(DISTINCT coalesce(c.token_id,sc.token_id))::int AS scanned,max(coalesce(c.scanned_at,sc.scanned_at)) AS last_scan,coalesce(bool_or(sc.coverage_gap),false) AS coverage_gap FROM alpha_tokens t LEFT JOIN block_cursors c ON c.token_id=t.id LEFT JOIN (SELECT token_id,max(scanned_at) AS scanned_at,bool_or(coverage_gap) AS coverage_gap FROM solana_account_cursors GROUP BY token_id) sc ON sc.token_id=t.id WHERE t.status<>'removed' GROUP BY t.chain_id ORDER BY tokens DESC`,
        sql`SELECT changes FROM alpha_membership_snapshots ORDER BY observed_at DESC LIMIT 1`,
        sql`SELECT count(*) FILTER(WHERE t.status='current')::int AS online,
        count(*) FILTER(WHERE t.status='current' AND s.token_id IS NOT NULL)::int AS eligible_pairs,
        count(*) FILTER(WHERE t.status='current' AND m.status='observed' AND m.observed_at>now()-interval '15 minutes')::int AS fresh_prices,
        count(*) FILTER(WHERE t.status='current' AND m.status='observed' AND m.observed_at<=now()-interval '15 minutes')::int AS stale_prices,
        count(*) FILTER(WHERE t.status='current' AND m.status='no_pair')::int AS missing_pair,
        count(*) FILTER(WHERE t.status='current' AND m.status='error')::int AS errors,
        count(*) FILTER(WHERE t.status='current' AND s.token_id IS NOT NULL AND m.token_id IS NULL)::int AS pending,
        (SELECT count(DISTINCT token_id)::int FROM market_snapshots WHERE source_kind='alpha_registry' AND price IS NOT NULL AND observed_at=(SELECT max(observed_at) FROM market_snapshots WHERE source_kind='alpha_registry')) AS registry_prices,
        max(m.observed_at) AS latest
        FROM alpha_tokens t LEFT JOIN market_coverage m ON m.token_id=t.id
        LEFT JOIN LATERAL (SELECT 1 AS token_id FROM market_symbols s WHERE s.alpha_id=t.alpha_id AND s.active AND (s.status='TRADING' OR s.status IS NULL) LIMIT 1) s ON true`,
        sql`SELECT
        (SELECT count(*)::int FROM alpha_tokens WHERE status='current' AND chain_id IN ('56','1','8453','42161','CT_501')) AS eligible,
        (SELECT count(*)::int FROM worker_jobs j JOIN alpha_tokens t ON j.key='scan:'||t.id WHERE j.kind='scan' AND t.status='current' AND t.chain_id IN ('56','1','8453','42161','CT_501')) AS scheduled,
        (SELECT count(*)::int FROM alpha_tokens t WHERE t.status='current' AND t.chain_id IN ('56','1','8453','42161','CT_501') AND NOT EXISTS(SELECT 1 FROM worker_jobs j WHERE j.key='scan:'||t.id AND j.kind='scan')) AS missing_jobs,
        (SELECT count(*)::int FROM worker_jobs j JOIN alpha_tokens t ON j.key='scan:'||t.id WHERE j.kind='scan' AND t.status='current' AND t.chain_id IN ('56','1','8453','42161','CT_501') AND j.run_after<=now()) AS due,
        (SELECT count(*)::int FROM worker_jobs j JOIN alpha_tokens t ON j.key='scan:'||t.id WHERE j.kind='scan' AND t.status='current' AND t.chain_id IN ('56','1','8453','42161','CT_501') AND j.status='retry') AS retrying,
        (SELECT min(j.run_after) FROM worker_jobs j JOIN alpha_tokens t ON j.key='scan:'||t.id WHERE j.kind='scan' AND t.status='current' AND t.chain_id IN ('56','1','8453','42161','CT_501') AND j.run_after<=now()) AS oldest_due,
        (SELECT count(*)::int FROM alpha_tokens WHERE status='current' AND chain_id NOT IN ('56','1','8453','42161','CT_501')) AS unsupported,
        (SELECT count(*)::int FROM token_investigation_queue WHERE active) AS intensive,
        (SELECT count(*)::int FROM token_investigation_queue WHERE active AND next_investigation_at<=now()) AS intensive_waiting`,
      ]);
    const s = Object.fromEntries(settings.map((s) => [s.key, s.value]));
    return JSON.parse(
      JSON.stringify({
        database: true,
        error: null,
        registry: s.registry_sync ?? null,
        market: {
          at: market[0]?.latest ?? null,
          online: Number(market[0]?.online ?? 0),
          eligiblePairs: Number(market[0]?.eligible_pairs ?? 0),
          freshPrices: Number(market[0]?.fresh_prices ?? 0),
          stalePrices: Number(market[0]?.stale_prices ?? 0),
          missingPair: Number(market[0]?.missing_pair ?? 0),
          errors: Number(market[0]?.errors ?? 0),
          pending: Number(market[0]?.pending ?? 0),
          registryPrices: Number(market[0]?.registry_prices ?? 0),
          lastCycle: s.market_coverage_sync ?? null,
        },
        heartbeat: s.worker_heartbeat ?? null,
        providers,
        jobs,
        scanCoverage: {
          eligible: Number(scanCoverage[0]?.eligible ?? 0),
          scheduled: Number(scanCoverage[0]?.scheduled ?? 0),
          missingJobs: Number(scanCoverage[0]?.missing_jobs ?? 0),
          due: Number(scanCoverage[0]?.due ?? 0),
          retrying: Number(scanCoverage[0]?.retrying ?? 0),
          oldestDue: scanCoverage[0]?.oldest_due ?? null,
          unsupported: Number(scanCoverage[0]?.unsupported ?? 0),
          intensive: Number(scanCoverage[0]?.intensive ?? 0),
          intensiveWaiting: Number(scanCoverage[0]?.intensive_waiting ?? 0),
        },
        chains: chains.map((ch) => ({
          ...ch,
          chain_name:
            String(ch.chain_id) === "4663" ? "Robinhood Chain" : ch.chain_name,
        })),
        changes: snapshots[0]?.changes ?? null,
      }),
    );
  } catch {
    return {
      database: false,
      error:
        "Database unavailable. Configure DATABASE_URL and run pnpm db:migrate.",
      registry: null,
      market: {
        at: null,
        online: 0,
        eligiblePairs: 0,
        freshPrices: 0,
        stalePrices: 0,
        missingPair: 0,
        errors: 0,
        pending: 0,
        registryPrices: 0,
        lastCycle: null,
      },
      heartbeat: null,
      providers: [],
      jobs: [],
      scanCoverage: {
        eligible: 0,
        scheduled: 0,
        missingJobs: 0,
        due: 0,
        retrying: 0,
        oldestDue: null,
        unsupported: 0,
        intensive: 0,
        intensiveWaiting: 0,
      },
      chains: [],
      changes: null,
    };
  }
}
export async function radar(): Promise<RadarToken[]> {
  await requireAccess();
  const sql = sqlClient();
  const rows =
    await sql`SELECT t.id,t.symbol,t.name,t.chain_id,t.metadata->>'chainName' AS chain_name,t.metadata,t.source,t.response_hash,t.contract,t.alpha_id,t.status,t.research_state,coalesce(rc.classification,'unclassified') AS classification,t.deep_selected,t.first_seen,t.last_seen,(w.token_id IS NOT NULL AND NOT w.archived) AS watchlisted,
  m.price::text,m.quote_asset,m.source_kind AS price_source,m.observed_at AS price_at,m.change_24h::text,m.volume_24h::text,
  t.metadata->>'liquidity' AS liquidity,t.metadata->>'marketCap' AS market_cap,c.scanned_at AS last_scan,
  (SELECT min(first_detected_at) FROM signal_events s WHERE s.token_id=t.id) AS first_signal,
  (SELECT count(*)::int FROM signal_events s WHERE s.token_id=t.id AND s.status='active') AS signal_count,
  (SELECT value->>'reason' FROM settings WHERE key='trace:'||t.id) AS baseline_trace
 FROM alpha_tokens t LEFT JOIN watchlists w ON w.token_id=t.id LEFT JOIN block_cursors c ON c.token_id=t.id LEFT JOIN token_project_classifications rc ON rc.token_id=t.id
 LEFT JOIN LATERAL (SELECT price,quote_asset,source_kind,observed_at,change_24h,volume_24h FROM market_snapshots WHERE token_id=t.id AND source_kind IN ('alpha_market','alpha_registry') AND price IS NOT NULL ORDER BY CASE source_kind WHEN 'alpha_market' THEN 0 ELSE 1 END,observed_at DESC LIMIT 1) m ON true
 ORDER BY t.symbol,t.chain_id,t.id`;
  return JSON.parse(
    JSON.stringify(
      rows.map((t) => {
        const {
          metadata: _metadata,
          source: _source,
          response_hash: _hash,
          ...row
        } = t;
        return { ...row, visual: tokenVisual(t) };
      }),
    ),
  );
}
export async function safeRadar() {
  try {
    return await radar();
  } catch {
    return [];
  }
}
export const iso = (s: unknown) =>
  s
    ? new Date(String(s))
        .toISOString()
        .replace("T", " ")
        .replace(".000Z", " UTC")
    : "Unavailable";
export const num = (s: unknown, digits = 2) =>
  s !== null && s !== undefined && s !== "" && Number.isFinite(Number(s))
    ? Intl.NumberFormat("en-US", {
        maximumFractionDigits: digits,
        notation: Math.abs(Number(s)) >= 1e6 ? "compact" : "standard",
      }).format(Number(s))
    : "—";
export function range(search: Record<string, string | string[] | undefined>) {
  if (search.days === "all")
    return {
      start: "1970-01-01T00:00:00.000Z",
      end: new Date().toISOString(),
      days: 0,
    };
  const days = Math.min(180, Math.max(1, Number(search.days) || 30));
  let start =
    typeof search.from === "string" && /^\d{4}-\d{2}-\d{2}$/.test(search.from)
      ? new Date(search.from + "T00:00:00Z")
      : new Date(Date.now() - days * 86400000);
  let end =
    typeof search.to === "string" && /^\d{4}-\d{2}-\d{2}$/.test(search.to)
      ? new Date(search.to + "T23:59:59Z")
      : new Date();
  if (
    !Number.isFinite(start.getTime()) ||
    !Number.isFinite(end.getTime()) ||
    start > end
  ) {
    start = new Date(Date.now() - 30 * 86400000);
    end = new Date();
  }
  return { start: start.toISOString(), end: end.toISOString(), days };
}
