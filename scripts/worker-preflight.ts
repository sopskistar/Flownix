import {
  config,
  networkErrorCode,
  validateWorkerLaunchEnvironment,
} from "../packages/core/src/index";
import { closeDb, sqlClient } from "../packages/db/src/index";

try {
  const c = config();
  validateWorkerLaunchEnvironment(c, process.env);
  process.env.DATABASE_URL = c.DATABASE_URL_WORKER;
  const sql = sqlClient();
  const migrated =
    await sql`SELECT name FROM schema_migrations WHERE name='0016_operational_event_studies.sql'`;
  if (!migrated.length) throw Error("OPERATIONS_MIGRATION_REQUIRED");
  const space =
    await sql`SELECT pg_database_size(current_database())::text AS bytes`;
  if (Number(space[0].bytes) >= c.DATABASE_STORAGE_LIMIT_MB * 1048576)
    throw Error("DATABASE_STORAGE_GUARD");
  console.log(
    JSON.stringify({
      event: "worker_preflight",
      ok: true,
      schema: "0016",
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
