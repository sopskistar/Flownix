import { config } from "@flownix/core";
import { jsonParam, sqlClient } from "@flownix/db";
import { randomUUID } from "node:crypto";

export async function monitorWorker(sql = sqlClient()) {
  const c = config();
  const [rows, usage, providers, growth] = await Promise.all([
    sql`SELECT pg_database_size(current_database())::text AS database_bytes,
      (SELECT max(at) FROM (SELECT scanned_at AS at FROM block_cursors UNION ALL SELECT observed_at FROM live_scan_checkpoints) p) AS last_evm_progress,
      (SELECT max(scanned_at) FROM solana_account_cursors) AS last_solana_progress,
      (SELECT count(*)::int FROM worker_jobs j JOIN alpha_tokens t ON t.id=j.payload->>'tokenId' WHERE j.kind='scan' AND t.status='current' AND j.run_after<now()-interval '24 hours') AS overdue_day,
      (SELECT count(*)::int FROM worker_jobs WHERE status='running' AND lease_until<now()) AS expired_leases,
      (SELECT count(*)::int FROM alpha_tokens t LEFT JOIN market_coverage mc ON t.id=mc.token_id LEFT JOIN LATERAL(SELECT provider_time FROM market_snapshots m WHERE m.token_id=t.id AND m.source_kind='alpha_market' ORDER BY observed_at DESC LIMIT 1) m ON true WHERE t.status='current' AND (mc.status IS NULL OR mc.status<>'no_pair') AND (mc.observed_at IS NULL OR mc.observed_at<now()-interval '15 minutes' OR m.provider_time IS NULL OR m.provider_time<now()-interval '15 minutes' OR m.provider_time>now()+interval '30 seconds')) AS stale_market,
      (SELECT count(*)::int FROM alpha_tokens t LEFT JOIN live_scan_checkpoints l ON l.token_id=t.id WHERE t.status='current' AND t.chain_id IN ('1','56','8453','42161','146','4663') AND (l.source_time IS NULL OR l.source_time<now()-interval '12 hours')) AS source_overdue,
      (SELECT max(updated_at) FROM settings WHERE key='registry_sync') AS registry_at`,
    sql`SELECT scope,period_start,used::text FROM worker_budget_usage WHERE period_start>=date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' ORDER BY scope,period_start`,
    sql`SELECT provider,blocked_until,reason,failures FROM worker_provider_state WHERE blocked_until>now()`,
    sql`SELECT value FROM settings WHERE key='worker_storage_sample'`,
  ]);
  const now = Date.now(),
    row = rows[0],
    previous = growth[0]?.value;
  const bytes = Number(row.database_bytes);
  const bytesPerDay =
    previous && now > Date.parse(previous.at) + 60000
      ? (bytes - previous.bytes) / ((now - Date.parse(previous.at)) / 86400000)
      : null;
  const checks = new Map<
    string,
    { severity: "warning" | "critical"; detail: Record<string, unknown> }
  >();
  const add = (
    code: string,
    active: boolean,
    detail: Record<string, unknown>,
    severity: "warning" | "critical" = "warning",
  ) => {
    if (active) checks.set(code, { severity, detail });
  };
  add(
    "storage",
    bytes >= c.DATABASE_STORAGE_LIMIT_MB * 1048576 * 0.8,
    { bytes, stopAtBytes: c.DATABASE_STORAGE_LIMIT_MB * 1048576 },
    "critical",
  );
  add(
    "registry_stale",
    !row.registry_at ||
      now - +new Date(row.registry_at) > c.MAX_DATA_AGE_SECONDS * 1000,
    { at: row.registry_at },
    "critical",
  );
  add("market_stale", row.stale_market > 0, { tokens: row.stale_market });
  add("recent_source_overdue", row.source_overdue > 0, {
    tokens: row.source_overdue,
    coverage: "Bounded recent samples, not continuous history",
  });
  add("scans_overdue", row.overdue_day > 0, { tokens: row.overdue_day });
  add("leases_expired", row.expired_leases > 0, { jobs: row.expired_leases });
  add(
    "evm_stalled",
    !row.last_evm_progress ||
      now - +new Date(row.last_evm_progress) >
        2 * c.BASELINE_SCAN_INTERVAL_SECONDS * 1000,
    { at: row.last_evm_progress },
    "critical",
  );
  add(
    "solana_stalled",
    !row.last_solana_progress ||
      now - +new Date(row.last_solana_progress) >
        2 * c.SOLANA_BASELINE_INTERVAL_SECONDS * 1000,
    { at: row.last_solana_progress },
  );
  add("providers_deferred", providers.length > 0, { providers });
  const p = new Date();
  const today = new Date(
    Date.UTC(p.getUTCFullYear(), p.getUTCMonth(), p.getUTCDate()),
  ).toISOString();
  for (const scope of ["alchemy:day", "alchemy:month"]) {
    const current = usage.find(
      (u) =>
        u.scope === scope &&
        (scope.endsWith("month") ||
          new Date(u.period_start).toISOString() === today),
    );
    const used =
      Number(current?.used ?? 0) +
      (scope.endsWith("month") ? c.ALCHEMY_MONTHLY_UNTRACKED_CU : 0);
    const limit = scope.endsWith("month")
      ? c.ALCHEMY_MONTHLY_CU_LIMIT
      : c.ALCHEMY_DAILY_CU_LIMIT;
    add(scope, used >= limit * 0.8, { used, limit });
  }
  for (const [scope, limit] of [
    ["alchemy:enrichment:day", c.ALCHEMY_ENRICHMENT_DAILY_CU_LIMIT],
    ["alchemy:historical:day", c.ALCHEMY_HISTORICAL_DAILY_CU_LIMIT],
  ] as const) {
    const used = Number(
      usage.find(
        (u) =>
          u.scope === scope && new Date(u.period_start).toISOString() === today,
      )?.used ?? 0,
    );
    add(scope, used >= limit * 0.8, {
      used,
      limit,
      action:
        "Defer optional workload; baseline remains eligible within shared quota",
    });
  }
  const codes = [...checks.keys()];
  await sql`UPDATE worker_operational_alerts SET resolved_at=now() WHERE resolved_at IS NULL AND NOT(code=ANY(${codes}))`;
  for (const [code, alert] of checks) {
    const notify =
      await sql`INSERT INTO worker_operational_alerts(code,severity,detail) VALUES(${code},${alert.severity},${jsonParam(alert.detail)}::jsonb)
      ON CONFLICT(code) DO UPDATE SET severity=excluded.severity,detail=excluded.detail,last_seen=now(),resolved_at=NULL,
        notified_at=CASE WHEN worker_operational_alerts.resolved_at IS NOT NULL THEN NULL ELSE worker_operational_alerts.notified_at END
      RETURNING notified_at`;
    if (
      !notify[0].notified_at ||
      now - +new Date(notify[0].notified_at) >= 21600000
    ) {
      await sql.begin(async (tx) => {
        await tx`INSERT INTO notification_deliveries(id,channel,status,payload,delivered_at) VALUES(${randomUUID()},'in_app','delivered',${jsonParam({ operational: true, code, text: `Worker ${alert.severity}: ${code}. Inspect worker:status for measured operational evidence.`, ...alert.detail })}::jsonb,now())`;
        await tx`UPDATE worker_operational_alerts SET notified_at=now() WHERE code=${code}`;
      });
      console.error(
        JSON.stringify({ event: "operational_alert", code, ...alert }),
      );
    }
  }
  await sql`INSERT INTO settings(key,value) VALUES('worker_storage_sample',${jsonParam({ at: new Date().toISOString(), bytes, bytesPerDay })}::jsonb) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=now()`;
  return { ...row, bytesPerDay, usage, providers, activeAlerts: codes };
}
