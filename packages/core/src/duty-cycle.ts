/** Conservative worker-only awake envelope, not a Neon billing meter. */
export function dutyCycleModel(
  activeSeconds: number,
  intervalSeconds: number,
  maxCU: number,
  days = 31,
) {
  if (
    !Number.isInteger(activeSeconds) ||
    activeSeconds < 120 ||
    activeSeconds > 1800 ||
    !Number.isInteger(intervalSeconds) ||
    intervalSeconds < 3600 ||
    intervalSeconds > 86400 ||
    intervalSeconds <= activeSeconds + 300 ||
    !Number.isFinite(maxCU) ||
    maxCU < 0.25 ||
    maxCU > 2 ||
    !Number.isInteger(days) ||
    days < 1 ||
    days > 31
  )
    throw Error("INVALID_DUTY_ENVELOPE");
  const awakeSeconds = activeSeconds + 300; // Include Neon's documented five-minute suspension tail.
  const maxCycles = Math.ceil((days * 86400) / intervalSeconds);
  const microCUPerCycle = Math.ceil(((awakeSeconds * maxCU) / 3600) * 1000000);
  return {
    activeSeconds,
    intervalSeconds,
    suspendTailSeconds: 300,
    awakeSeconds,
    maxCycles,
    maxCU,
    microCUPerCycle,
    workerCUHoursUpperModel: (microCUPerCycle * maxCycles) / 1000000,
    accountUsageMeasured: false,
    excludes:
      "Web traffic, other branches, deployment/restart probes and suspension not occurring as expected",
  };
}
export const budgetWorkerDefaults: Record<string, string> = {
  WORKER_EXECUTION_MODE: "duty_cycle",
  WORKER_DUTY_INTERVAL_SECONDS: "43200",
  WORKER_DUTY_ACTIVE_SECONDS: "1500",
  WORKER_DUTY_NEON_MAX_CU: "2",
  WORKER_DUTY_MONTHLY_CU_LIMIT: "70",
  DATABASE_STORAGE_LIMIT_MB: "750",
  MARKET_TOKEN_LIMIT: "25",
  ALPHA_REQUESTS_PER_MINUTE: "30",
  BASELINE_SCAN_INTERVAL_SECONDS: "21600",
  SOLANA_BASELINE_INTERVAL_SECONDS: "21600",
  SCAN_BLOCKS: "10",
  WORKER_MARKET_OVERLAP: "true",
  MARKET_HISTORY_BACKFILL_ENABLED: "false",
  ALCHEMY_MONTHLY_CU_LIMIT: "27000000",
  ALCHEMY_DAILY_CU_LIMIT: "900000",
  ALCHEMY_ENRICHMENT_DAILY_CU_LIMIT: "5000",
  ALCHEMY_HISTORICAL_DAILY_CU_LIMIT: "1000",
  TELEGRAM_ENABLED: "false",
  PAID_ENRICHMENT_ENABLED: "false",
  PAID_DAILY_BUDGET_USD: "0",
};
