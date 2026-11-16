import { randomUUID } from "node:crypto";
import {
  sqlClient,
  closeDb,
  setSetting,
  settingsValue,
} from "../packages/db/src/index";

// Each invocation opens a fresh connection. Never log connection strings or SQL errors.
const mode = process.argv[2];
const connection = process.argv[3];
const probe = process.argv[4];
if (
  !["write", "read"].includes(mode) ||
  !["pooled", "direct"].includes(connection) ||
  !probe ||
  !/^[a-zA-Z0-9-]{8,80}$/.test(probe)
) {
  console.error(
    "Usage: pnpm db:verify <write|read> <pooled|direct> <unique-probe-id>",
  );
  process.exit(1);
}
try {
  const value =
    connection === "direct"
      ? process.env.DATABASE_URL_WORKER
      : process.env.DATABASE_URL;
  if (!value) throw new Error("Missing connection variable");
  const url = new URL(value);
  if (!["postgres:", "postgresql:"].includes(url.protocol))
    throw new Error("Invalid connection protocol");
  process.env.DATABASE_URL = value;
  const sql = sqlClient();
  await sql`SELECT 1`;
  const migrations =
    await sql`SELECT name FROM schema_migrations ORDER BY name`;
  if (migrations.length !== 6)
    throw new Error("Expected six applied migrations");
  const key = `deployment_probe:${probe}:${connection}`;
  if (mode === "write") {
    await setSetting(key, {
      probe,
      connection,
      nonce: randomUUID(),
      writtenAt: new Date().toISOString(),
    });
  } else {
    const saved = await settingsValue<{ probe?: string; nonce?: string }>(
      key,
      {},
    );
    if (saved.probe !== probe || !saved.nonce)
      throw new Error("Persistence probe not found");
  }
  console.log(
    JSON.stringify({
      connection,
      operation: mode,
      connected: true,
      migrations: migrations.length,
      persistenceVerified: mode === "read",
    }),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      connection,
      operation: mode,
      ok: false,
      error:
        "Database verification failed; check connection, TLS and migration configuration securely.",
      code:
        typeof error === "object" && error !== null && "code" in error
          ? String(error.code)
              .replace(/[^a-zA-Z0-9_]/g, "")
              .slice(0, 40)
          : undefined,
    }),
  );
  process.exitCode = 1;
} finally {
  await closeDb();
}
