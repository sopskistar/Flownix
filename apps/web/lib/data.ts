import "server-only";
import { requireAccess } from "./auth";
import { sqlClient } from "@flownix/db";
export type { DbRows } from "@flownix/db";
export type RadarToken = {
  id: string;
  symbol: string;
  name: string;
  chain_id: string;
  chain_name: string;
  contract: string;
  alpha_id: string | null;
  status: string;
  research_state: string;
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
  chains: {
    chain_id: string;
    chain_name: string;
    tokens: number;
    deep: number;
    scanned: number;
    last_scan: string | null;
  }[];
  changes: Record<string, string[]> | null;
};
export async function health(): Promise<Health> {
  await requireAccess();
  try {
    const sql = sqlClient();
    const [settings, providers, jobs, chains, snapshots] = await Promise.all([
      sql`SELECT key,value FROM settings WHERE key IN ('registry_sync','worker_heartbeat')`,
      sql`SELECT provider,max(started_at) AS last_attempt,max(started_at) FILTER(WHERE ok) AS last_ok,count(*)::int AS calls,count(*) FILTER(WHERE NOT ok)::int AS failures,sum(cost_usd)::text AS cost FROM provider_runs WHERE started_at>now()-interval '24 hours' GROUP BY provider ORDER BY provider`,
      sql`SELECT key,kind,status,run_after,last_error,attempts FROM worker_jobs ORDER BY run_after LIMIT 30`,
      sql`SELECT t.chain_id,max(t.metadata->>'chainName') AS chain_name,count(*)::int AS tokens,count(*) FILTER(WHERE t.deep_selected)::int AS deep,count(c.token_id)::int AS scanned,max(c.scanned_at) AS last_scan FROM alpha_tokens t LEFT JOIN block_cursors c ON c.token_id=t.id WHERE t.status<>'removed' GROUP BY t.chain_id ORDER BY tokens DESC`,
      sql`SELECT changes FROM alpha_membership_snapshots ORDER BY observed_at DESC LIMIT 1`,
    ]);
    const s = Object.fromEntries(settings.map((s) => [s.key, s.value]));
    return JSON.parse(
      JSON.stringify({
        database: true,
        error: null,
        registry: s.registry_sync ?? null,
        heartbeat: s.worker_heartbeat ?? null,
        providers,
        jobs,
        chains,
        changes: snapshots[0]?.changes ?? null,
      }),
    );
  } catch {
    return {
      database: false,
      error:
        "Database unavailable. Configure DATABASE_URL and run pnpm db:migrate.",
      registry: null,
      heartbeat: null,
      providers: [],
      jobs: [],
      chains: [],
      changes: null,
    };
  }
}
export async function radar(): Promise<RadarToken[]> {
  await requireAccess();
  const sql = sqlClient();
  const rows =
    await sql`SELECT t.id,t.symbol,t.name,t.chain_id,t.metadata->>'chainName' AS chain_name,t.contract,t.alpha_id,t.status,t.research_state,t.deep_selected,t.first_seen,t.last_seen,(w.token_id IS NOT NULL AND NOT w.archived) AS watchlisted,
  m.price::text,m.quote_asset,m.source_kind AS price_source,m.observed_at AS price_at,m.change_24h::text,m.volume_24h::text,
  t.metadata->>'liquidity' AS liquidity,t.metadata->>'marketCap' AS market_cap,c.scanned_at AS last_scan,
  (SELECT min(first_detected_at) FROM signal_events s WHERE s.token_id=t.id) AS first_signal,
  (SELECT count(*)::int FROM signal_events s WHERE s.token_id=t.id AND s.status='active') AS signal_count,
  (SELECT value->>'reason' FROM settings WHERE key='trace:'||t.id) AS baseline_trace
 FROM alpha_tokens t LEFT JOIN watchlists w ON w.token_id=t.id LEFT JOIN block_cursors c ON c.token_id=t.id
 LEFT JOIN LATERAL (SELECT price,quote_asset,source_kind,observed_at,change_24h,volume_24h FROM market_snapshots WHERE token_id=t.id AND source_kind='alpha_market' ORDER BY observed_at DESC LIMIT 1) m ON true
 ORDER BY t.symbol,t.chain_id,t.id`;
  return JSON.parse(JSON.stringify(rows));
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
