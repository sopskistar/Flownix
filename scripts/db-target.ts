import { sqlClient, closeDb } from "../packages/db/src/index";
import { closeProviderNetwork } from "../packages/core/src/index";
const timer = setInterval(() => {}, 1000);
try {
  const pooled = new URL(process.env.DATABASE_URL ?? ""),
    direct = new URL(process.env.DATABASE_URL_WORKER ?? "");
  if (
    pooled.hostname.replace("-pooler", "") !== direct.hostname ||
    pooled.pathname !== direct.pathname ||
    pooled.username !== direct.username
  )
    throw Error("TARGET_MISMATCH");
  for (const url of [pooled, direct]) {
    if (
      !["postgres:", "postgresql:"].includes(url.protocol) ||
      !["require", "verify-full"].includes(
        url.searchParams.get("sslmode") ?? "",
      )
    )
      throw Error("TLS_REQUIRED");
    process.env.DATABASE_URL = url.toString();
    const sql = sqlClient(),
      rows =
        await sql`SELECT current_database() AS database,current_user AS role`;
    if (
      rows[0].database !== decodeURIComponent(url.pathname.slice(1)) ||
      rows[0].role !== decodeURIComponent(url.username)
    )
      throw Error("TARGET_MISMATCH");
    const migrations = await sql`SELECT name FROM schema_migrations`;
    if (
      !migrations.some((r) => r.name === "0001_initial.sql") ||
      migrations.length < 6
    )
      throw Error("EXISTING_FLOWNIX_SCHEMA_REQUIRED");
    await closeDb();
  }
  console.log(
    JSON.stringify({
      existingFlownixTargetVerified: true,
      pooledAndDirectMatch: true,
      readOnly: true,
    }),
  );
} catch {
  console.error(
    "Existing database target verification failed; no migration or reset attempted.",
  );
  process.exitCode = 1;
} finally {
  await closeDb();
  await closeProviderNetwork();
  clearInterval(timer);
}
