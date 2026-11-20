import { randomUUID } from "node:crypto";
import { startWorkerProfile } from "./profile";
import {
  config,
  ProviderError,
  networkErrorCode,
  closeProviderNetwork,
  stopProviderRequests,
} from "@flownix/core";
import { jsonParam, sqlClient, closeDb, setSetting } from "@flownix/db";
import { registrySync, marketSync, scanToken } from "./ingest";
import { reconcileScanJobs, SUPPORTED_BASELINE_CHAINS } from "./scheduler";
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
const profile = startWorkerProfile();
function failureCode(error: unknown) {
  if (
    error instanceof Error &&
    ["COLLECTOR_BUSY", "COLLECTOR_LOCK_LOST"].includes(error.message)
  )
    return error.message;
  if (error instanceof ProviderError) return error.code;
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String(error.code)
      : "";
  return /^[0-9A-Z]{5}$/.test(code)
    ? `SQLSTATE_${code}`
    : networkErrorCode(error);
}
let stopping = false;
let ownsLock = false;
let collectorLock: Awaited<ReturnType<typeof sql.reserve>> | undefined;
let activeJob: string | null = null;
let drainScanAfterRegistry = false;
let pulsing = false;
const platform = ["oracle", "digitalocean", "gcp", "aws", "linux"].includes(
  process.env.WORKER_PLATFORM ?? "",
)
  ? process.env.WORKER_PLATFORM
  : process.env.RAILWAY_SERVICE_ID
    ? "railway"
    : process.env.RENDER_SERVICE_ID
      ? "render"
      : "local";
async function pulse() {
  if (!ownsLock || !collectorLock || pulsing) return;
  pulsing = true;
  try {
    const lock =
      await collectorLock`SELECT EXISTS(SELECT 1 FROM pg_locks WHERE pid=pg_backend_pid() AND locktype='advisory' AND objid=726032) AS held`;
    if (!lock[0].held) throw Error("COLLECTOR_LOCK_LOST");
    await setSetting("worker_heartbeat", {
      at: new Date().toISOString(),
      owner,
      job: activeJob,
      platform,
      mode: process.argv.includes("--once") ? "one-shot" : "continuous",
      rssBytes: process.memoryUsage().rss,
      release: /^[a-f0-9]{40}$/.test(process.env.WORKER_RELEASE_SHA ?? "")
        ? process.env.WORKER_RELEASE_SHA
        : null,
    });
  } catch {
    stopping = true;
    ownsLock = false;
    process.exitCode = 1;
    await closeDb();
  } finally {
    pulsing = false;
  }
}
// Native database/HTTP timers may be unreferenced; the persistent collector owns its lifecycle.
const lifecycle = setInterval(() => {
  void pulse();
}, 30000);
const duration = Number(process.env.WORKER_RUN_SECONDS ?? 0);
const stopTimer =
  duration > 0
    ? setTimeout(() => {
        stopping = true;
        // A bounded invocation may finish its current provider call. If the
        // time budget expires during membership refresh, permit one baseline
        // scan afterward so a successful refresh does not consume the whole
        // run without producing any token observation.
        if (
          activeJob === "registry" &&
          (
            process.env.WORKER_JOB_KINDS?.split(",") ?? Object.keys(intervals)
          ).includes("scan")
        )
          drainScanAfterRegistry = true;
      }, duration * 1000)
    : undefined;
process.on("SIGINT", () => {
  stopping = true;
});
process.on("SIGTERM", () => {
  stopping = true;
});
const intervals: Record<string, number> = {
  registry: 900,
  market: 300,
  scan: config().BASELINE_SCAN_INTERVAL_SECONDS,
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
  // Full current supported-chain universe; jobs persist independently and are fairly due-time scheduled.
  await reconcileScanJobs();
}
async function next(excluded: string[] = []) {
  const kinds =
    process.env.WORKER_JOB_KINDS?.split(",") ?? Object.keys(intervals);
  if (kinds.some((kind) => !Object.hasOwn(intervals, kind)))
    throw Error("INVALID_JOB_KINDS");
  return sql.begin(async (tx) => {
    const rows =
      await tx`SELECT * FROM worker_jobs WHERE run_after<=now() AND kind=ANY(${kinds}) AND NOT(key=ANY(${excluded})) AND (kind<>'scan' OR EXISTS(SELECT 1 FROM alpha_tokens t WHERE t.id=worker_jobs.payload->>'tokenId' AND t.status='current' AND t.chain_id=ANY(${[...SUPPORTED_BASELINE_CHAINS]}))) AND (status IN ('queued','done','retry') OR (status='running' AND lease_until<now())) ORDER BY CASE kind WHEN 'registry' THEN 0 WHEN 'market' THEN 1 ELSE 2 END,run_after,CASE WHEN kind='scan' AND EXISTS(SELECT 1 FROM token_investigation_queue q WHERE q.token_id=worker_jobs.payload->>'tokenId' AND q.active) THEN 0 ELSE 1 END,key FOR UPDATE SKIP LOCKED LIMIT 1`;
    if (!rows.length) return null;
    const job = rows[0];
    await tx`UPDATE worker_jobs SET status='running',owner=${owner},lease_until=now()+interval '2 minutes',updated_at=now() WHERE key=${job.key}`;
    return job;
  });
}
async function runJob(job: NonNullable<Awaited<ReturnType<typeof next>>>) {
  activeJob = job.kind;
  let forceStop: NodeJS.Timeout | undefined;
  const deadline = setTimeout(() => {
    console.error(
      JSON.stringify({
        event: "job_deadline_exceeded",
        kind: job.kind,
        recovery:
          "Stop collector; preserve committed checkpoints; expired lease is recoverable",
      }),
    );
    stopping = true;
    process.exitCode = 1;
    stopProviderRequests();
    // A failed native connection must not keep an apparently alive collector
    // hanging forever. Open transactions roll back; committed evidence survives.
    forceStop = setTimeout(() => process.exit(1), 30000);
  }, conf.WORKER_JOB_TIMEOUT_SECONDS * 1000);
  profile.phase(job.kind);
  console.log(
    JSON.stringify({ event: "job_started", kind: job.kind, key: job.key }),
  );
  const heartbeat = setInterval(() => {
    void Promise.all([
      pulse(),
      sql`UPDATE worker_jobs SET lease_until=now()+interval '2 minutes' WHERE key=${job.key} AND owner=${owner}`,
    ]).catch(() => {});
  }, 15000);
  try {
    if (job.kind === "registry") {
      await registrySync();
      // Registry refresh can add identities. Reconcile immediately rather
      // than waiting for the next scheduler tick before scans become eligible.
      await reconcileScanJobs();
    } else if (job.kind === "market") await marketSync();
    else if (job.kind === "scan") await scanToken(job.payload.tokenId);
    else if (job.kind === "notifications") {
      await queueResearchAlerts();
      await deliverNotifications();
    } else if (job.kind === "outcomes") await outcomesSync();
    else if (job.kind === "persistence") await persistenceSync();
    const delay =
      job.kind === "scan" && job.payload?.chainId === "CT_501"
        ? conf.SOLANA_BASELINE_INTERVAL_SECONDS
        : (intervals[job.kind] ?? 300);
    await sql`UPDATE worker_jobs SET status='done',attempts=0,lease_until=null,owner=null,last_error=null,run_after=now()+(${delay}*interval '1 second'),updated_at=now() WHERE key=${job.key} AND owner=${owner}`;
    if (job.kind === "scan" && job.payload?.tokenId) {
      await sql`UPDATE token_investigation_queue SET last_investigated_at=now(),next_investigation_at=now()+(${delay}*interval '1 second') WHERE token_id=${job.payload.tokenId} AND active`;
    }
    return true;
  } catch (error) {
    const code = failureCode(error);
    const delay = Math.min(3600, 30 * 2 ** Math.min(Number(job.attempts), 7));
    await sql`UPDATE worker_jobs SET status='retry',attempts=attempts+1,lease_until=null,owner=null,last_error=${code},run_after=now()+(${delay}*interval '1 second'),updated_at=now() WHERE key=${job.key} AND owner=${owner}`;
    console.error(
      JSON.stringify({
        event: "job_failed",
        kind: job.kind,
        key: job.key,
        retryInSeconds: delay,
        error: code,
      }),
    );
    return false;
  } finally {
    clearTimeout(deadline);
    if (forceStop) clearTimeout(forceStop);
    console.log(
      JSON.stringify({ event: "job_finished", kind: job.kind, key: job.key }),
    );
    profile.phase("idle");
    activeJob = null;
    clearInterval(heartbeat);
  }
}
async function main() {
  // Reserve a dedicated session for advisory locking; use the direct URL, not transaction pooling.
  const lock = await sql.reserve();
  collectorLock = lock;
  try {
    const acquired =
      await lock`SELECT pg_try_advisory_lock(726032) AS acquired`;
    if (!acquired[0].acquired) throw Error("COLLECTOR_BUSY");
    ownsLock = true;
    await pulse();
    const once = process.argv.includes("--once");
    const seen = new Set<string>();
    let failed = false;
    let scheduledAt = 0;
    while (!stopping || drainScanAfterRegistry) {
      if (process.argv.includes("--idle")) {
        profile.phase("idle");
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }
      if (Date.now() - scheduledAt > 30000) {
        await schedule();
        scheduledAt = Date.now();
      }
      const size =
        await sql`SELECT pg_database_size(current_database())::text AS bytes`;
      if (
        BigInt(size[0].bytes) >
        BigInt(conf.DATABASE_STORAGE_LIMIT_MB) * 1024n * 1024n
      ) {
        await sql`INSERT INTO data_quality_issues(provider,kind,detail) VALUES('database','storage_guard','Configured storage guard halted ingestion; existing research was retained. Check account storage and compute quotas before resuming.')`;
        stopping = true;
        break;
      }
      const job = await next(once ? [...seen] : []);
      if (!job) {
        if (once || stopping) break;
        await new Promise((r) => setTimeout(r, 30000));
        continue;
      }
      if (stopping && drainScanAfterRegistry && job.kind === "scan")
        drainScanAfterRegistry = false;
      seen.add(job.key);
      if (!(await runJob(job))) failed = true;
    }
    if (once && failed) process.exitCode = 1;
  } finally {
    if (ownsLock) await lock`SELECT pg_advisory_unlock(726032)`;
    ownsLock = false;
    lock.release();
    await sql`UPDATE settings SET value=${jsonParam({ at: new Date().toISOString(), owner, platform, stopped: true })}::jsonb,updated_at=now() WHERE key='worker_heartbeat' AND value->>'owner'=${owner}`;
    await closeDb();
  }
}
main()
  .catch(async (error) => {
    console.error(
      `Worker failed: ${failureCode(error)}. Check database connectivity, migrations and direct worker connection.`,
    );
    await closeDb();
    process.exitCode = 1;
  })
  .finally(async () => {
    clearInterval(lifecycle);
    if (stopTimer) clearTimeout(stopTimer);
    await closeDb();
    await closeProviderNetwork();
    profile.stop();
  });
