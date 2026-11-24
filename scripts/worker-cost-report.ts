import { readdir, readFile, writeFile } from "node:fs/promises";
import {
  budgetWorkerDefaults,
  dutyCycleModel,
} from "../packages/core/src/duty-cycle";

const runs = [];
for (const name of (await readdir("artifacts/profiles"))
  .filter((n) => /^worker-2026-11-(21|22|23)/.test(n))
  .sort()) {
  const profile = JSON.parse(
    await readFile(`artifacts/profiles/${name}`, "utf8"),
  );
  const first = profile.samples[0],
    last = profile.samples.at(-1);
  if (!last || !last.counters.alchemyEstimatedComputeUnits) continue;
  const seconds = last.elapsedSeconds - first.elapsedSeconds;
  runs.push({
    file: name,
    seconds,
    alchemyEstimatedCU: last.counters.alchemyEstimatedComputeUnits,
    projected30DayCU: Math.round(
      (last.counters.alchemyEstimatedComputeUnits / seconds) * 2592000,
    ),
    meanRssMiB:
      profile.samples.reduce(
        (n: number, s: { rss: number }) => n + s.rss / 1048576,
        0,
      ) / profile.samples.length,
    peakRssMiB: Math.max(
      ...profile.samples.map((s: { rss: number }) => s.rss / 1048576),
    ),
    meanCpuPercent: last.cpuMicros / seconds / 10000,
    sqlStatements: last.counters.postgresQueries,
  });
}
const baseline = JSON.parse(
  await readFile(
    process.argv.slice(2).find((a) => !a.startsWith("--")) ??
      "/tmp/flownix-before.json",
    "utf8",
  ),
);
const evm = baseline.baselineCoverage
  .filter((c: { chain_id: string }) =>
    ["1", "56", "8453", "42161"].includes(c.chain_id),
  )
  .reduce((n: number, c: { online: number }) => n + c.online, 0);
const solana =
  baseline.baselineCoverage.find(
    (c: { chain_id: string }) => c.chain_id === "CT_501",
  )?.online ?? 0;
const scenarios = [1, 2, 3, 4, 6].map((hours) => {
  const units = Math.round(evm * (720 / hours) * 202 + solana * 120 * 1870);
  return {
    evmIntervalHours: hours,
    solanaIntervalHours: 6,
    evmTokens: evm,
    solanaTokens: solana,
    monthlyCU: units,
    free30MHeadroomCU: 30000000 - units,
    configured27MHeadroomCU: 27000000 - units,
    paygTotalUSD: (units / 1000000) * 0.52,
    withOptionalDailyCapsMonthlyCU: units + 30 * (150000 + 25000),
  };
});
const report = {
  generatedAt: new Date().toISOString(),
  assumptions:
    "30 days/720 hours. EVM bounded sample 202 CU including checkpoint totalSupply (prior 176 + 26); extra event blocks, receipts and retries add cost. Optional enrichment capped at 150000 CU/day, historical Alchemy at 25000 CU/day, both also charged to shared daily/monthly caps. Solana upper ordinary 20-account sample 1870 CU; mint/holder snapshot reuses responses. New Sonic/Robinhood public RPCs add no Alchemy CU but consume database/host resources. Local graph research makes no external requests. Public Binance price/derivatives history uses no Alchemy. Methods checked 2026-11-22; PAYG advertised $0.52/M checked 2026-11-23 (supersedes earlier $0.45 model; billing FAQ may round differently). Profiles include stalls and bounded runs; projections are not sustained throughput, continuous ledger coverage or account billing. PAYG replaces free allowance and charges every CU.",
  measuredRuns: runs,
  cadenceScenarios: scenarios,
  neon: {
    freeMonthlyCUHours: 100,
    minimumAssumedComputeCU: 0.25,
    continuous30DayCUHours: 180,
    freeDeficitCUHours: 80,
    maximumActiveHoursAtQuarterCU: 400,
    launchComputeUSD30Days: 180 * 0.106,
    launchComputeUSD31Days: 186 * 0.106,
    launchStorageUSDPerGBMonth: 0.35,
    launchHistoryUSDPerChangedGBMonth: 0.2,
    freeStorageGB: 1,
    freeEgressGB: 5,
    measuredDatabaseBytes: Number(baseline.counts.database_bytes),
    accountUsageVerified: false,
  },
  host: {
    renderStarterUSDMonthly: 7,
    railwayHobbyMinimumUSDMonthly: 5,
    railwayFormula:
      "max(5, mean RAM GB*10 + mean vCPU*20 + egress GB*0.05). Node profiles exclude loader/container overhead.",
  },
  dutyCycle: {
    profile: budgetWorkerDefaults,
    estimates: [0.25, 0.5, 1, 2].map((cu) =>
      dutyCycleModel(
        Number(budgetWorkerDefaults.WORKER_DUTY_ACTIVE_SECONDS),
        Number(budgetWorkerDefaults.WORKER_DUTY_INTERVAL_SECONDS),
        cu,
      ),
    ),
    guardCUHours: 70,
    freeMonthlyCUHours: 100,
    modeledWorstWorkerHeadroomCUHours: 38,
    coverage:
      "Every supported eligible identity remains scheduled; partial rotations span multiple windows. Neither complete-universe 12h cadence nor sustained freshness has passed acceptance.",
    alchemyFullUniverse12hOrdinaryCU: Math.round(
      (evm * 202 + solana * 1870) * 60,
    ),
    alchemyActualForecast:
      "Throughput-limited; derive from measured active runs. Full-universe formula is a counterfactual load requirement, not achieved coverage. Extra RPC operations/retries also consume durable budgets.",
    billingMeter: false,
    condition:
      "Neon must actually suspend after each window; web traffic, other branches and restart probes consume the remaining project allowance. Account usage requires dashboard verification.",
  },
};
await writeFile(
  process.argv.includes("--budget")
    ? "docs/WORKER_BUDGET_MODEL.json"
    : "docs/WORKER_COST_MODEL.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report, null, 2));
