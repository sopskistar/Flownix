import { it, expect } from "vitest";
import { collectorState } from "../lib/collector-state";
import { evmChains } from "@flownix/core";
import { SUPPORTED_BASELINE_CHAINS } from "../../worker/src/scheduler";
const at = "2026-11-26T03:55:01.209Z",
  nextAt = "2026-11-26T15:55:01.209Z",
  now = Date.parse("2026-11-26T09:11:15Z"),
  duty = {
    at,
    nextAt,
    lastFinishedAt: "2026-11-26T04:18:48.198Z",
    lastExitCode: 0,
    phase: "idle",
    model: { activeSeconds: 1500, intervalSeconds: 43200 },
  };
it("distinguishes recorded scheduled sleep from current collection without claiming host liveness", () => {
  expect(
    collectorState({ at: duty.lastFinishedAt, stopped: true }, duty, now),
  ).toEqual({
    state: "scheduled_idle",
    active: false,
    label: "Scheduled idle / host unverified",
  });
  expect(
    collectorState({ at: new Date(now).toISOString() }, duty, now).state,
  ).toBe("active");
  expect(
    collectorState(
      { at: new Date(now).toISOString(), stopped: true },
      null,
      now,
    ).state,
  ).toBe("unknown");
});
it("does not hide failed, overdue or malformed duty records", () => {
  expect(collectorState(null, duty, Date.parse(nextAt)).state).toBe("overdue");
  expect(
    collectorState(null, { ...duty, lastExitCode: 78, phase: "blocked" }, now)
      .state,
  ).toBe("failed");
  for (const record of [
    { ...duty, lastFinishedAt: "2027-01-01T00:00:00Z" },
    { ...duty, nextAt: "2026-12-26T15:55:01Z" },
    { ...duty, model: null },
    { ...duty, lastExitCode: null },
  ])
    expect(collectorState(null, record, now).state).toBe("unknown");
});
it("matches dashboard adapter totals to the worker's seven supported baseline networks", () => {
  expect([...Object.keys(evmChains), "CT_501"].sort()).toEqual(
    [...SUPPORTED_BASELINE_CHAINS].sort(),
  );
});
