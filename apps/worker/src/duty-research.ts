import { closeDb, jsonParam, sqlClient } from "@flownix/db";
import { closeProviderNetwork } from "@flownix/core";
import { persistObservedResearch } from "./observed-research";
import { flushObservedDigest } from "./telegram";

/** The collector has exited. Hold the same lock through finalization so a
 * parallel scheduler cannot reserve another cycle while we use its remainder. */
export async function finalizeDutyResearch(owner: string, sql = sqlClient()) {
  const lock = await sql.reserve();
  let held = false;
  try {
    held = (await lock`SELECT pg_try_advisory_lock(726032) AS held`)[0].held;
    if (!held) return;
    const [cycle] = await sql`SELECT value->>'at' AS started,now() AS ended
      FROM settings WHERE key='worker_duty_cycle'
      AND value->>'owner'=${owner} AND value->>'phase'='allocated'`;
    if (!cycle) return;
    const from = new Date(cycle.started),
      until = new Date(cycle.ended);
    if (!Number.isFinite(+from) || +from >= +until) return;
    const count = await persistObservedResearch(from, until, sql);
    await sql`INSERT INTO settings(key,value) VALUES('observed_research_cycle',
      ${jsonParam({ from, until, count })}::jsonb)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=now()`;
    await flushObservedDigest(owner, from, until);
  } finally {
    if (held) await lock`SELECT pg_advisory_unlock(726032)`;
    lock.release();
  }
}

export async function closeDutyResearchResources() {
  await closeDb();
  await closeProviderNetwork();
}
