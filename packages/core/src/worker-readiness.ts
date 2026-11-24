import type { Config } from "./config";
import { dutyCycleModel } from "./duty-cycle";
/** Read-only inspection may use the existing local test database. Launches
 * always require TLS; external gate connections must also require TLS. */
export function validateWorkerDatabaseTarget(c: Config, readOnly = false) {
  if (!c.DATABASE_URL_WORKER) throw Error("DIRECT_DATABASE_URL_REQUIRED");
  const direct = new URL(c.DATABASE_URL_WORKER),
    pooled = new URL(c.DATABASE_URL ?? "");
  if (
    !/^postgres(ql)?:$/.test(direct.protocol) ||
    !/^postgres(ql)?:$/.test(pooled.protocol) ||
    direct.hostname.includes("-pooler") ||
    direct.hostname !== pooled.hostname.replace("-pooler", "") ||
    direct.pathname !== pooled.pathname ||
    direct.username !== pooled.username
  )
    throw Error("DATABASE_TARGET_MISMATCH");
  const local =
    readOnly && ["localhost", "127.0.0.1"].includes(direct.hostname);
  if (
    !local &&
    (direct.searchParams.get("sslmode") !== "require" ||
      pooled.searchParams.get("sslmode") !== "require")
  )
    throw Error("DATABASE_TLS_REQUIRED");
}
/** Shared pure checks run before allocation writes and again in preflight. */
export function validateWorkerLaunchEnvironment(
  c: Config,
  env: Record<string, string | undefined>,
) {
  validateWorkerDatabaseTarget(c);
  if (
    c.WORKER_EXECUTION_MODE === "duty_cycle" &&
    dutyCycleModel(
      c.WORKER_DUTY_ACTIVE_SECONDS,
      c.WORKER_DUTY_INTERVAL_SECONDS,
      c.WORKER_DUTY_NEON_MAX_CU,
    ).workerCUHoursUpperModel > c.WORKER_DUTY_MONTHLY_CU_LIMIT
  )
    throw Error("DUTY_PLAN_EXCEEDS_MODELED_BUDGET");
  if (c.PAID_ENRICHMENT_ENABLED || c.PAID_DAILY_BUDGET_USD !== 0)
    throw Error("PAID_ENRICHMENT_MUST_REMAIN_DISABLED");
  if (!/^\d+$/.test(env.ALCHEMY_MONTHLY_UNTRACKED_CU ?? ""))
    throw Error("UNTRACKED_CU_RECONCILIATION_REQUIRED");
  if (
    env.WORKER_JOB_KINDS ||
    c.WORKER_RUN_SECONDS ||
    c.PROVIDER_PROCESS_REQUEST_BUDGET
  )
    throw Error("REMOVE_DIAGNOSTIC_WORKER_LIMITS");
  for (const key of [
    "BSC_RPC_URL",
    "ETH_RPC_URL",
    "BASE_RPC_URL",
    "ARBITRUM_RPC_URL",
    "SOLANA_RPC_URL",
  ] as const)
    if (!env[key] || new URL(c[key]).protocol !== "https:")
      throw Error("EXPLICIT_HTTPS_RPC_REQUIRED");
  for (const key of ["SONIC_RPC_URL", "ROBINHOOD_RPC_URL"] as const)
    if (new URL(c[key]).protocol !== "https:")
      throw Error("EXPLICIT_HTTPS_RPC_REQUIRED");
}
