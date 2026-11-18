import {
  config,
  AlphaProvider,
  HttpClient,
  EvmProvider,
  evmChains,
  configuredEvmRpc,
  normalizeRegistry,
  freshness,
  ProviderError,
  networkErrorCode,
  closeProviderNetwork,
} from "../packages/core/src/index";
import { sqlClient, closeDb } from "../packages/db/src/index";
const c = config();
const report: Record<string, unknown> = {
  checkedAt: new Date().toISOString(),
  database: { ok: false },
  alpha: { ok: false, count: null },
  chains: [],
  telegram: {
    enabled: c.TELEGRAM_ENABLED,
    credentialsPresent: !!(c.TELEGRAM_BOT_TOKEN && c.TELEGRAM_CHAT_ID),
    deliveryVerified: false,
  },
  paid: {
    implemented: false,
    enabled: false,
    dailyBudgetUsd: c.PAID_DAILY_BUDGET_USD,
    spentUsd: 0,
  },
};
try {
  const sql = sqlClient();
  await sql`SELECT 1`;
  const [counts, cursors, settings, calls, jobs, market] = await Promise.all([
    sql`SELECT status,count(*)::int AS count FROM alpha_tokens GROUP BY status`,
    sql`SELECT chain_id,count(*)::int AS tokens,max(block_number)::text AS block,max(scanned_at) AS last_scan FROM block_cursors GROUP BY chain_id`,
    sql`SELECT key,value FROM settings WHERE key IN ('registry_sync','worker_heartbeat','exchange_info')`,
    sql`SELECT provider,count(*)::int AS calls,count(*) FILTER(WHERE http_status=429)::int AS throttles,sum(cost_usd)::text AS cost FROM provider_runs WHERE started_at>now()-interval '24 hours' GROUP BY provider`,
    sql`SELECT kind,status,count(*)::int FROM worker_jobs GROUP BY kind,status`,
    sql`SELECT max(observed_at) AS last_observed FROM market_snapshots WHERE source_kind='alpha_market'`,
  ]);
  report.database = {
    ok: true,
    counts,
    cursors,
    settings,
    calls,
    jobs,
    marketFreshness: freshness(market[0]?.last_observed),
  };
} catch (error) {
  report.database = { ok: false, error: networkErrorCode(error) };
}
try {
  const p = new AlphaProvider(new HttpClient("binance_alpha", 30));
  const r = await p.registry();
  const normalized = normalizeRegistry(r.data);
  report.alpha = {
    ok: true,
    count: normalized.length,
    responseCount: r.data.length,
    current: normalized.filter((t) => t.status === "current").length,
    source: r.source,
    at: r.observedAt,
    hash: r.hash,
    networks: Object.fromEntries(
      [...new Set(normalized.map((t) => t.chainId))].map((id) => [
        id,
        normalized.filter((t) => t.chainId === id).length,
      ]),
    ),
  };
} catch (error) {
  report.alpha = {
    ok: false,
    count: null,
    error:
      error instanceof ProviderError ? error.code : networkErrorCode(error),
    hint: "Run pnpm providers:smoke. No sample universe is substituted.",
  };
}
if (process.argv.includes("--rpc")) {
  for (const [chain, info] of Object.entries(evmChains)) {
    try {
      const url = process.env[info.env] ?? configuredEvmRpc(chain);
      const rpc = new EvmProvider(
        chain,
        url,
        new HttpClient(`rpc:${chain}`, 30),
      );
      const head = await rpc.head();
      (report.chains as unknown[]).push({
        chain,
        name: info.name,
        head,
        rpc: true,
        transferIngestion: "Verify per-token cursor and logs in database",
      });
    } catch (error) {
      (report.chains as unknown[]).push({
        chain,
        name: info.name,
        rpc: false,
        error:
          error instanceof ProviderError ? error.code : networkErrorCode(error),
      });
    }
  }
}
console.log(JSON.stringify(report, null, 2));
await closeDb();
await closeProviderNetwork();
if (
  !(report.database as { ok: boolean }).ok ||
  !(report.alpha as { ok: boolean }).ok
)
  process.exitCode = 1;
