import { freshness } from "@flownix/core/browser";

/** A durable sleep plan explains an old child heartbeat. It cannot prove that
 * the Render supervisor is still alive, or that old market data is current. */
export function collectorState(
  heartbeat: { at: string; stopped?: boolean } | null,
  duty: Record<string, unknown> | null | undefined,
  now = Date.now(),
) {
  if (
    heartbeat &&
    !heartbeat.stopped &&
    freshness(heartbeat.at, now, 90) === "current"
  )
    return { state: "active", active: true, label: "Collector running" };
  const at = Date.parse(String(duty?.at ?? "")),
    next = Date.parse(String(duty?.nextAt ?? "")),
    finished = Date.parse(String(duty?.lastFinishedAt ?? "")),
    model = duty?.model as Record<string, unknown> | undefined,
    interval = Number(model?.intervalSeconds),
    active = Number(model?.activeSeconds);
  const validPlan =
    [at, next, finished].every(Number.isFinite) &&
    at <= now + 30000 &&
    finished >= at &&
    finished <= now + 30000 &&
    Number.isInteger(interval) &&
    interval >= 3600 &&
    interval <= 86400 &&
    Number.isInteger(active) &&
    active >= 120 &&
    active <= 1800 &&
    finished <= at + active * 1000 &&
    Math.abs(next - at - interval * 1000) < 1000;
  if (duty?.phase === "idle" && duty.lastExitCode === 0 && validPlan) {
    if (next > now)
      return {
        state: "scheduled_idle",
        active: false,
        label: "Scheduled idle / host unverified",
      };
    return {
      state: "overdue",
      active: false,
      label: "Collector overdue / unverified",
    };
  }
  if (duty && typeof duty.lastExitCode === "number" && duty.lastExitCode !== 0)
    return {
      state: "failed",
      active: false,
      label: "Last collection failed / host unverified",
    };
  return {
    state: "unknown",
    active: false,
    label: "Collector offline / unverified",
  };
}
