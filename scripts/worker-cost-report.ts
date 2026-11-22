import { readdir, readFile, writeFile } from "node:fs/promises";

const runs = [];
for (const name of (await readdir("artifacts/profiles"))
  .filter(
    (n) =>
      n.startsWith("worker-2026-11-21") || n.startsWith("worker-2026-11-22"),
  )
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
  await readFile(process.argv[2] ?? "/tmp/flownix-before.json", "utf8"),
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
  const units = Math.round(evm * (720 / hours) * 176 + solana * 120 * 1870);
  return {
    evmIntervalHours: hours,
    solanaIntervalHours: 6,
    evmTokens: evm,
    solanaTokens: solana,
    monthlyCU: units,
    free30MHeadroomCU: 30000000 - units,
    configured27MHeadroomCU: 27000000 - units,
    paygTotalUSD: (units / 1000000) * 0.45,
  };
});
const report = {
  generatedAt: new Date().toISOString(),
  assumptions:
    "30 days/720 hours. EVM cursor scan 176 CU (chain identity 0, head 10, logs 60, code 20, decimals 26, prior/from/to blocks 60); extra event blocks/balances/receipts/retries add cost. Solana upper ordinary 20-account sample 1870 CU (70 setup +20*(10 account+40 signatures+40 transaction)); not an all-holder census. All methods priced from official Alchemy table checked 2026-11-22. Existing profiles include stalls and bounded runs; projections are not sustained-throughput measurements or account billing. PAYG replaces the free allowance and charges every CU.",
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
};
await writeFile(
  "docs/WORKER_COST_MODEL.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report, null, 2));
