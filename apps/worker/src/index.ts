import { randomUUID } from "node:crypto";
import { config } from "@flownix/core";
import { jsonParam, sqlClient, closeDb, setSetting } from "@flownix/db";
import { registrySync, marketSync, scanToken } from "./ingest";
import {
  queueResearchAlerts,
  deliverNotifications,
  outcomesSync,
  persistenceSync,
} from "./services";
const conf = config();
if (conf.DATABASE_URL_WORKER)
  process.env.DATABASE_URL = conf.DATABASE_URL_WORKER;
const sql = sqlClient(),
  owner = randomUUID();
let stopping = false;
process.on("SIGINT", () => {
  stopping = true;
});
process.on("SIGTERM", () => {
  stopping = true;
});
const intervals: Record<string, number> = {
  registry: 900,
  market: 300,
  scan: 60,
  notifications: 30,
  outcomes: 3600,
  persistence: 3600,
};
async function schedule() {
  for (const kind of [
    "registry",
    "market",
    "notifications",
    "outcomes",
    "persistence",
  ])
    await sql`INSERT INTO worker_jobs(key,kind) VALUES(${kind},${kind}) ON CONFLICT DO NOTHING`;
  const tokens =
    await sql`SELECT id FROM alpha_tokens WHERE deep_selected AND status='current'`;
  for (const t of tokens)
    await sql`INSERT INTO worker_jobs(key,kind,payload) VALUES(${"scan:" + t.id},'scan',${jsonParam({ tokenId: t.id })}::jsonb) ON CONFLICT DO NOTHING`;
}
async function next(excluded: string[] = []) {
  return sql.begin(async (tx) => {
    const rows =
      await tx`SELECT * FROM worker_jobs WHERE run_after<=now() AND NOT(key=ANY(${excluded})) AND (status IN ('queued','done','retry') OR (status='running' AND lease_until<now())) ORDER BY CASE kind WHEN 'registry' THEN 0 WHEN 'market' THEN 1 ELSE 2 END,run_after,key FOR UPDATE SKIP LOCKED LIMIT 1`;
    if (!rows.length) return null;
    const job = rows[0];
    await tx`UPDATE worker_jobs SET status='running',owner=${owner},lease_until=now()+interval '30 minutes',updated_at=now() WHERE key=${job.key}`;
    return job;
  });
}
async function runJob(job: NonNullable<Awaited<ReturnType<typeof next>>>) {
  const heartbeat = setInterval(() => {
    void Promise.all([
      setSetting("worker_heartbeat", {
        at: new Date().toISOString(),
        owner,
        job: job.kind,
      }),
      sql`UPDATE worker_jobs SET lease_until=now()+interval '30 minutes' WHERE key=${job.key} AND owner=${owner}`,
    ]).catch(() => {});
  }, 15000);
  try {
    if (job.kind === "registry") await registrySync();
    else if (job.kind === "market") await marketSync();
    else if (job.kind === "scan") await scanToken(job.payload.tokenId);
    else if (job.kind === "notifications") {
      await queueResearchAlerts();
      await deliverNotifications();
    } else if (job.kind === "outcomes") await outcomesSync();
    else if (job.kind === "persistence") await persistenceSync();
    await sql`UPDATE worker_jobs SET status='done',attempts=0,lease_until=null,owner=null,last_error=null,run_after=now()+(${intervals[job.kind] ?? 300}*interval '1 second'),updated_at=now() WHERE key=${job.key} AND owner=${owner}`;
    return true;
  } catch {
    const delay = Math.min(3600, 30 * 2 ** Math.min(Number(job.attempts), 7));
    await sql`UPDATE worker_jobs SET status='retry',attempts=attempts+1,lease_until=null,owner=null,last_error='JOB_FAILED: inspect provider_runs and data_quality_issues',run_after=now()+(${delay}*interval '1 second'),updated_at=now() WHERE key=${job.key} AND owner=${owner}`;
    console.error(
      JSON.stringify({
        event: "job_failed",
        kind: job.kind,
        key: job.key,
        retryInSeconds: delay,
      }),
    );
    return false;
  } finally {
    clearInterval(heartbeat);
  }
}
async function main() {
  // Reserve a dedicated session for advisory locking; use the direct URL, not transaction pooling.
  const lock = await sql.reserve();
  try {
    const acquired =
      await lock`SELECT pg_try_advisory_lock(726032) AS acquired`;
    if (!acquired[0].acquired)
      throw Error("Another worker owns the collector lock");
    const once = process.argv.includes("--once");
    const seen = new Set<string>();
    let failed = false;
    while (!stopping) {
      await setSetting("worker_heartbeat", {
        at: new Date().toISOString(),
        owner,
      });
      await schedule();
      const job = await next(once ? [...seen] : []);
      if (!job) {
        if (once) break;
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }
      seen.add(job.key);
      if (!(await runJob(job))) failed = true;
    }
    if (once && failed) process.exitCode = 1;
  } finally {
    await lock`SELECT pg_advisory_unlock(726032)`;
    lock.release();
    await setSetting("worker_heartbeat", {
      at: new Date().toISOString(),
      owner,
      stopped: true,
    });
    await closeDb();
  }
}
main().catch(async () => {
  console.error(
    "Worker failed. Check database connectivity, migrations and direct worker connection.",
  );
  await closeDb();
  process.exitCode = 1;
});
