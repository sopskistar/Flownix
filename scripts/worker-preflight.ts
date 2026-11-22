import { config, networkErrorCode } from "../packages/core/src/index";
import { closeDb, sqlClient } from "../packages/db/src/index";

try {
  const c = config();
  if (!c.DATABASE_URL_WORKER) throw Error("DIRECT_DATABASE_URL_REQUIRED");
  const direct = new URL(c.DATABASE_URL_WORKER),
    pooled = new URL(c.DATABASE_URL ?? "");
  if (
    direct.hostname.includes("-pooler") ||
    direct.hostname !== pooled.hostname.replace("-pooler", "") ||
    direct.pathname !== pooled.pathname ||
    direct.username !== pooled.username
  )
    throw Error("DATABASE_TARGET_MISMATCH");
  if (direct.searchParams.get("sslmode") !== "require")
    throw Error("DATABASE_TLS_REQUIRED");
  if (c.PAID_ENRICHMENT_ENABLED || c.PAID_DAILY_BUDGET_USD !== 0)
    throw Error("PAID_ENRICHMENT_MUST_REMAIN_DISABLED");
  if (
    process.env.WORKER_JOB_KINDS ||
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
  ] as const) {
    if (!process.env[key] || new URL(c[key]).protocol !== "https:")
      throw Error("EXPLICIT_HTTPS_RPC_REQUIRED");
  }
  process.env.DATABASE_URL = c.DATABASE_URL_WORKER;
  const sql = sqlClient();
  const migrated =
    await sql`SELECT name FROM schema_migrations WHERE name='0014_worker_operations.sql'`;
  if (!migrated.length) throw Error("OPERATIONS_MIGRATION_REQUIRED");
  const space =
    await sql`SELECT pg_database_size(current_database())::text AS bytes`;
  if (Number(space[0].bytes) >= c.DATABASE_STORAGE_LIMIT_MB * 1048576)
    throw Error("DATABASE_STORAGE_GUARD");
  console.log(
    JSON.stringify({
      event: "worker_preflight",
      ok: true,
      schema: "0014",
      databaseBytes: space[0].bytes,
      billingVerified: false,
      note: "Check account-wide Neon/Alchemy remaining quotas before activation. No billing change was made.",
    }),
  );
} catch (error) {
  const message =
    error instanceof Error && /^[A-Z_]+$/.test(error.message)
      ? error.message
      : networkErrorCode(error);
  console.error(
    JSON.stringify({ event: "worker_preflight", ok: false, error: message }),
  );
  process.exitCode = 78;
} finally {
  await closeDb();
}
