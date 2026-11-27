import { spawn, type ChildProcess } from "node:child_process";
import { writeFileSync } from "node:fs";
import {
  config,
  networkErrorCode,
  closeProviderNetwork,
  dutyCycleModel,
  validateWorkerDatabaseTarget,
  validateWorkerLaunchEnvironment,
} from "../packages/core/src/index";
import { closeDb, sqlClient } from "../packages/db/src/index";
import {
  reserveDutyCycle,
  finishDutyCycle,
} from "../apps/worker/src/duty-cycle";
import {
  finalizeDutyResearch,
  closeDutyResearchResources,
} from "../apps/worker/src/duty-research";
const c = config();
if (c.WORKER_EXECUTION_MODE !== "duty_cycle") throw Error("DUTY_MODE_REQUIRED");
dutyCycleModel(
  c.WORKER_DUTY_ACTIVE_SECONDS,
  c.WORKER_DUTY_INTERVAL_SECONDS,
  c.WORKER_DUTY_NEON_MAX_CU,
);
process.env.DATABASE_URL = c.DATABASE_URL_WORKER ?? c.DATABASE_URL;
let stopping = false,
  child: ChildProcess | undefined,
  phase = "starting",
  lastFailure: string | null = null,
  nextAt = new Date().toISOString(),
  cycleDeadline: NodeJS.Timeout | undefined;
let wake: () => void = () => {};
const localHealth = () =>
  writeFileSync(
    "/tmp/flownix-worker-health.json",
    JSON.stringify({
      pid: process.pid,
      at: new Date().toISOString(),
      supervisor: true,
      phase,
      nextAt,
      lastFailure,
    }),
    { mode: 0o600 },
  );
const life = setInterval(() => {
  if (phase !== "collecting") localHealth();
}, 30000);
const stop = () => {
  stopping = true;
  wake();
  child?.kill("SIGTERM");
  setTimeout(() => {
    child?.kill("SIGKILL");
    process.exit(1);
  }, 75000).unref();
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
async function subprocess(
  path: string,
  env: NodeJS.ProcessEnv,
  timeoutSeconds?: number,
) {
  if (stopping) return 1;
  return new Promise<number>((resolve) => {
    const p = spawn(process.execPath, ["--import", "tsx", path], {
      env,
      stdio: "inherit",
    });
    child = p;
    const timeout = timeoutSeconds
      ? setTimeout(() => p.kill("SIGTERM"), timeoutSeconds * 1000)
      : undefined;
    p.once("error", () => {
      if (timeout) clearTimeout(timeout);
      child = undefined;
      resolve(1);
    });
    p.once("exit", (code) => {
      if (timeout) clearTimeout(timeout);
      child = undefined;
      resolve(code ?? 1);
    });
  });
}
async function sleepUntil(at: string) {
  phase = "sleeping";
  nextAt = at;
  localHealth();
  if (stopping) return;
  while (!stopping && Date.parse(at) > Date.now())
    await new Promise<void>((r) => {
      const timer = setTimeout(
        r,
        Math.min(2147483647, Math.max(0, Date.parse(at) - Date.now())),
      );
      wake = () => {
        clearTimeout(timer);
        r();
      };
    });
}
try {
  do {
    const start = Date.now();
    phase = "starting";
    localHealth();
    // All gate/preflight/work/cleanup SQL lies inside this hard wall. Never rely
    // on WORKER_RUN_SECONDS alone: a draining provider job can exceed that timer.
    cycleDeadline = setTimeout(() => {
      child?.kill("SIGKILL");
      console.error(JSON.stringify({ event: "duty_wall_deadline" }));
      process.exit(1);
    }, c.WORKER_DUTY_ACTIVE_SECONDS * 1000);
    let planned = new Date(
      start + c.WORKER_DUTY_INTERVAL_SECONDS * 1000,
    ).toISOString();
    try {
      validateWorkerDatabaseTarget(c, true);
      const reservation = await reserveDutyCycle(sqlClient(), () =>
        validateWorkerLaunchEnvironment(c, process.env),
      );
      planned = reservation.nextAt;
      lastFailure =
        reservation.reason === "collector_busy"
          ? "COLLECTOR_BUSY"
          : reservation.lastExitCode
            ? `PREVIOUS_CYCLE_EXIT_${reservation.lastExitCode}`
            : null;
      await closeDb(); // Release advisory/session/query connections BEFORE sleeping or spawning.
      console.log(
        JSON.stringify({ event: "duty_reservation", ...reservation }),
      );
      if (reservation.run && reservation.owner && !stopping) {
        phase = "preflight";
        localHealth();
        let code = await subprocess(
          "scripts/worker-preflight.ts",
          process.env,
          90,
        );
        if (code === 0 && !stopping) {
          phase = "collecting";
          const left = Math.max(
            1,
            Math.floor(
              (start + c.WORKER_DUTY_ACTIVE_SECONDS * 1000 - Date.now()) / 1000,
            ),
          );
          const terminate = setTimeout(
            () => child?.kill("SIGTERM"),
            Math.max(1, left - 75) * 1000,
          );
          try {
            code = await subprocess("apps/worker/src/index.ts", {
              ...process.env,
              WORKER_RUN_SECONDS: String(Math.max(1, left - 90)),
            });
          } finally {
            clearTimeout(terminate);
          }
        }
        // Use the existing shutdown allowance, before sleeping closes SQL.
        if (code === 0 && !stopping) {
          try {
            await finalizeDutyResearch(reservation.owner);
          } catch (error) {
            console.error(
              JSON.stringify({
                event: "duty_research_failed",
                error: networkErrorCode(error),
              }),
            );
          }
        }
        await finishDutyCycle(reservation.owner, code, sqlClient());
        lastFailure = code === 0 ? null : `CYCLE_EXIT_${code}`;
        await closeDb();
        console.log(
          JSON.stringify({
            event: "duty_cycle_finished",
            exitCode: code,
            elapsedSeconds: (Date.now() - start) / 1000,
            nextAt: planned,
          }),
        );
      }
    } catch (error) {
      lastFailure =
        error instanceof Error && /^[A-Z_]+$/.test(error.message)
          ? error.message
          : networkErrorCode(error);
      console.error(
        JSON.stringify({
          event: "duty_cycle_failed",
          error: lastFailure,
          nextAt: planned,
        }),
      );
    } finally {
      await closeDutyResearchResources();
      await closeDb();
      await closeProviderNetwork();
      if (cycleDeadline) clearTimeout(cycleDeadline);
    }
    if (process.argv.includes("--once") || stopping) break;
    await sleepUntil(planned); // No DB reads, leases, probes or heartbeat writes here.
  } while (!stopping);
} finally {
  clearInterval(life);
  if (cycleDeadline) clearTimeout(cycleDeadline);
  phase = "stopped";
  localHealth();
  await closeDb();
  await closeProviderNetwork();
}
