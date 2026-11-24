import { randomUUID } from "node:crypto";
import { config, dutyCycleModel } from "@flownix/core";
import { sqlClient } from "@flownix/db";
/** Same collector lock as the worker; reservation and next wake survive crashes. */
export async function reserveDutyCycle(
  sql = sqlClient(),
  authorizeAllocation: () => void = () => {},
) {
  const c = config(),
    model = dutyCycleModel(
      c.WORKER_DUTY_ACTIVE_SECONDS,
      c.WORKER_DUTY_INTERVAL_SECONDS,
      c.WORKER_DUTY_NEON_MAX_CU,
    );
  const lock = await sql.reserve();
  let held = false;
  try {
    held = (await lock`SELECT pg_try_advisory_lock(726032) AS held`)[0].held;
    if (!held)
      return {
        run: false,
        reason: "collector_busy",
        nextAt: new Date(
          Date.now() + model.intervalSeconds * 1000,
        ).toISOString(),
        owner: null,
        lastExitCode: null,
      };
    return await sql.begin(async (tx) => {
      const now = new Date((await tx`SELECT now() AS at`)[0].at),
        month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
        nextMonth = new Date(
          Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
        );
      const previous = (
        await tx`SELECT value FROM settings WHERE key='worker_duty_cycle' FOR UPDATE`
      )[0]?.value;
      if (previous?.nextAt) {
        const next = Date.parse(previous.nextAt);
        if (!Number.isFinite(next)) throw Error("INVALID_PERSISTED_DUTY_TIME");
        if (next > +now)
          return {
            run: false,
            reason: "planned_idle",
            nextAt: previous.nextAt as string,
            owner: null,
            lastExitCode:
              typeof previous.lastExitCode === "number"
                ? previous.lastExitCode
                : null,
          };
      }
      authorizeAllocation(); // No writes before static launch safety has passed.
      const debit =
        await tx`INSERT INTO worker_budget_usage(scope,period_start,used) SELECT 'neon:worker-estimated-microcu:month',${month},${model.microCUPerCycle}::bigint WHERE ${model.microCUPerCycle}::bigint<=${Math.floor(c.WORKER_DUTY_MONTHLY_CU_LIMIT * 1000000)}::bigint ON CONFLICT(scope,period_start) DO UPDATE SET used=worker_budget_usage.used+excluded.used,updated_at=now() WHERE worker_budget_usage.used+excluded.used<=${Math.floor(c.WORKER_DUTY_MONTHLY_CU_LIMIT * 1000000)}::bigint RETURNING used::text`;
      const owner = randomUUID(),
        nextAt = debit.length
          ? new Date(+now + model.intervalSeconds * 1000).toISOString()
          : nextMonth.toISOString();
      const state = {
        owner,
        at: now.toISOString(),
        nextAt,
        phase: debit.length ? "allocated" : "budget_exhausted",
        model,
        estimatedMonthlyMicroCU: debit[0]?.used ?? null,
        accountUsageMeasured: false,
      };
      await tx`INSERT INTO settings(key,value) VALUES('worker_duty_cycle',${tx.json(state)}) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=now()`;
      if (!debit.length)
        await tx`INSERT INTO worker_operational_alerts(code,severity,detail) VALUES('neon_worker_model_budget','warning',${tx.json({ pausedUntil: nextAt, modeledLimitCUHours: c.WORKER_DUTY_MONTHLY_CU_LIMIT, accountUsageMeasured: false })}) ON CONFLICT(code) DO UPDATE SET detail=excluded.detail,last_seen=now(),resolved_at=NULL`;
      return {
        run: debit.length > 0,
        reason: state.phase,
        nextAt,
        owner,
        lastExitCode: null,
      };
    });
  } finally {
    if (held) await lock`SELECT pg_advisory_unlock(726032)`;
    lock.release();
  }
}
export async function finishDutyCycle(
  owner: string,
  exitCode: number | null,
  sql = sqlClient(),
) {
  await sql`UPDATE settings SET value=value||jsonb_build_object('lastFinishedAt',now(),'lastExitCode',${exitCode}::int,'phase',${exitCode === 0 ? "idle" : exitCode === 78 ? "blocked" : "degraded_idle"}::text),updated_at=now() WHERE key='worker_duty_cycle' AND value->>'owner'=${owner}`;
}
