import { it, expect } from "vitest";
import { dutyCycleModel, budgetWorkerDefaults } from "../src/duty-cycle";
import { envSchema } from "../src/config";
it("includes the full five-minute suspend tail and worst free autoscaling size", () => {
  expect(dutyCycleModel(600, 21600, 2)).toMatchObject({
    maxCycles: 124,
    microCUPerCycle: 500000,
    workerCUHoursUpperModel: 62,
    accountUsageMeasured: false,
  });
  expect(dutyCycleModel(600, 21600, 0.25, 30).workerCUHoursUpperModel).toBe(
    7.5,
  );
});
it("rejects overlapping, unbounded and out-of-plan assumptions", () => {
  for (const [a, i, c] of [
    [60, 21600, 2],
    [1801, 21600, 2],
    [600, 360, 2],
    [600, 21600, 3],
    [NaN, 21600, 2],
  ])
    expect(() => dutyCycleModel(a, i, c)).toThrow("INVALID_DUTY_ENVELOPE");
});
it("keeps complete eligibility and paid providers off in the budget profile", () => {
  const c = envSchema.parse(budgetWorkerDefaults);
  expect(c.WORKER_EXECUTION_MODE).toBe("duty_cycle");
  expect(c.WORKER_DUTY_MONTHLY_CU_LIMIT).toBe(70);
  expect(c.MARKET_HISTORY_BACKFILL_ENABLED).toBe(false);
  expect(c.PAID_ENRICHMENT_ENABLED).toBe(false);
  expect(c.TELEGRAM_ENABLED).toBe(false);
  expect(budgetWorkerDefaults).not.toHaveProperty("WORKER_JOB_KINDS");
  expect(budgetWorkerDefaults).not.toHaveProperty(
    "ALCHEMY_MONTHLY_UNTRACKED_CU",
  );
});
