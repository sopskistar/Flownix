import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { sqlClient, closeDb } from "./index";
if (process.env.DATABASE_URL_WORKER)
  process.env.DATABASE_URL = process.env.DATABASE_URL_WORKER;
const sql = sqlClient();
try {
  await sql`CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now())`;
  const dir = fileURLToPath(new URL("../migrations/", import.meta.url));
  for (const name of (await readdir(dir))
    .filter((s) => s.endsWith(".sql"))
    .sort()) {
    const query = await readFile(`${dir}/${name}`, "utf8");
    await sql.begin(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock(726031)`;
      if (
        (await tx`SELECT name FROM schema_migrations WHERE name=${name}`).length
      )
        return;
      await tx.unsafe(query);
      await tx`INSERT INTO schema_migrations(name) VALUES(${name})`;
      console.log(`Applied ${name}`);
    });
  }
} catch (error) {
  const code =
    typeof error === "object" && error !== null && "code" in error &&
    /^[A-Z0-9_]{2,32}$/.test(String(error.code))
      ? String(error.code)
      : "UNKNOWN";
  console.error(
    `Migration failed (${code}). Check direct database connectivity and migration state securely; no reset was attempted.`,
  );
  process.exitCode = 1;
} finally {
  await closeDb();
}
