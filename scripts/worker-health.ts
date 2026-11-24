import { sqlClient, closeDb } from "../packages/db/src/index";
import { readFileSync } from "node:fs";
process.env.DATABASE_URL =
  process.env.DATABASE_URL_WORKER ?? process.env.DATABASE_URL;
try {
  if (!process.argv.includes("--remote")) {
    // Container-local liveness: no extra Neon wakeup or acceptance of another worker's heartbeat.
    const h = JSON.parse(
      readFileSync("/tmp/flownix-worker-health.json", "utf8"),
    );
    if (
      !Number.isInteger(h.pid) ||
      h.phase === "stopped" ||
      (h.supervisor && !!h.lastFailure) ||
      !Number.isFinite(Date.parse(h.at)) ||
      Date.now() - Date.parse(h.at) > 90000 ||
      Date.parse(h.at) > Date.now() + 5000
    )
      throw Error("STALE_HEARTBEAT");
    if (
      h.supervisor &&
      h.phase === "sleeping" &&
      (!Number.isFinite(Date.parse(h.nextAt)) ||
        Date.parse(h.nextAt) < Date.now() - 90000 ||
        Date.parse(h.nextAt) > Date.now() + 32 * 86400000)
    )
      throw Error("INVALID_SLEEP_WINDOW");
    process.kill(h.pid, 0);
  } else {
    const rows =
      await sqlClient()`SELECT value FROM settings WHERE key='worker_heartbeat'`;
    const h = rows[0]?.value;
    if (
      !h ||
      h.stopped ||
      !Number.isFinite(Date.parse(h.at)) ||
      Date.now() - Date.parse(h.at) > 90000 ||
      Date.parse(h.at) > Date.now() + 5000
    )
      process.exitCode = 1;
    if (process.argv.includes("--strict")) {
      const alerts =
        await sqlClient()`SELECT code FROM worker_operational_alerts WHERE resolved_at IS NULL AND severity='critical'`;
      if (alerts.length) process.exitCode = 1;
    }
  }
} catch {
  process.exitCode = 1;
} finally {
  await closeDb();
}
