import { sqlClient, closeDb } from "../packages/db/src/index";
process.env.DATABASE_URL =
  process.env.DATABASE_URL_WORKER ?? process.env.DATABASE_URL;
try {
  const rows =
    await sqlClient()`SELECT value FROM settings WHERE key='worker_heartbeat'`;
  const h = rows[0]?.value;
  if (!h || h.stopped || Date.now() - Date.parse(h.at) > 90000)
    process.exitCode = 1;
} catch {
  process.exitCode = 1;
} finally {
  await closeDb();
}
