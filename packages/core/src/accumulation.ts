import Decimal from "decimal.js";
export const researchWindows = [1, 3, 7, 14, 30, 60, 90, 180] as const;
export const researchStates = [
  "DISCOVERY",
  "EARLY ACCUMULATION",
  "SUSTAINED ACCUMULATION",
  "SUPPLY CONCENTRATION",
  "STRENGTHENING SETUP",
  "PRICE EXPANSION",
  "DISTRIBUTION RISK",
  "THESIS INVALIDATED",
  "INSUFFICIENT EVIDENCE",
] as const;
export type ResearchState = (typeof researchStates)[number];
export type DailyPurchaseEvidence = {
  day: string;
  availableAt: string;
  verifiedBuyUnits: string;
  verifiedSellUnits: string;
  // Retained units from this day’s disjoint purchase lots, never repeated total balance snapshots.
  retainedUnits: string | null;
  independentBuyers: number | null;
  complete: boolean;
  txIds: string[];
};
export type PersistenceThresholds = {
  minCoveredDays: number;
  earlyDays: number;
  sustainedDays: number;
  minRetainedPct: number;
  maxQuietPriceChangePct: number;
  minIndependentBuyers: number;
};
export const persistenceDefaults: PersistenceThresholds = {
  minCoveredDays: 14,
  earlyDays: 3,
  sustainedDays: 14,
  minRetainedPct: 80,
  maxQuietPriceChangePct: 20,
  minIndependentBuyers: 3,
};
export function accumulationPersistence(
  rows: DailyPurchaseEvidence[],
  start: string,
  end: string,
  now: string,
  thresholds = persistenceDefaults,
) {
  const days = rows
    .filter(
      (r) =>
        r.day >= start.slice(0, 10) &&
        r.day < end.slice(0, 10) &&
        r.availableAt <= now,
    )
    .sort((a, b) => a.day.localeCompare(b.day));
  if (new Set(days.map((d) => d.day)).size !== days.length)
    throw Error("Duplicate daily evidence");
  const expected = Math.max(
    1,
    Math.round((Date.parse(end) - Date.parse(start)) / 86400000),
  );
  for (const d of days) {
    const buy = new Decimal(d.verifiedBuyUnits),
      sell = new Decimal(d.verifiedSellUnits);
    if (
      buy.lt(0) ||
      sell.lt(0) ||
      (d.retainedUnits !== null &&
        (new Decimal(d.retainedUnits).lt(0) ||
          new Decimal(d.retainedUnits).gt(buy)))
    )
      throw Error("Invalid purchase lot quantities");
  }
  const transactionIds = days.flatMap((d) => d.txIds);
  if (new Set(transactionIds).size !== transactionIds.length)
    throw Error("Purchase evidence counted more than once");
  const complete = days.filter((d) => d.complete && d.txIds.length > 0);
  const coverage = complete.length / expected;
  if (complete.length < thresholds.minCoveredDays || coverage < 0.9)
    return {
      state: "INSUFFICIENT EVIDENCE" as ResearchState,
      coverage,
      coveredDays: complete.length,
      consecutiveNetBuyDays: null,
      netBuyUnits: null,
      retentionPct: null,
      reason:
        "Verified purchase history and retention coverage are insufficient; transfers cannot substitute.",
    };
  let streak = 0,
    last: string | null = null;
  let buys = new Decimal(0),
    sells = new Decimal(0),
    retained = new Decimal(0);
  let retentionKnown = true;
  for (const d of complete) {
    const net = new Decimal(d.verifiedBuyUnits).minus(d.verifiedSellUnits);
    const consecutive =
      last !== null && Date.parse(d.day) - Date.parse(last) === 86400000;
    streak = net.gt(0) ? (consecutive ? streak + 1 : 1) : 0;
    last = d.day;
    buys = buys.plus(d.verifiedBuyUnits);
    sells = sells.plus(d.verifiedSellUnits);
    if (d.retainedUnits === null) retentionKnown = false;
    else retained = retained.plus(d.retainedUnits);
  }
  const retention =
    retentionKnown && buys.gt(0)
      ? Decimal.min(100, retained.div(buys).mul(100)).toNumber()
      : null;
  const lastRequestedDay = new Date(Date.parse(end.slice(0, 10)) - 86400000)
    .toISOString()
    .slice(0, 10);
  if (last !== lastRequestedDay) streak = 0;
  const independence = complete.every(
    (d) =>
      d.independentBuyers !== null &&
      d.independentBuyers >= thresholds.minIndependentBuyers,
  );
  const state: ResearchState =
    retention !== null && retention >= thresholds.minRetainedPct && independence
      ? streak >= thresholds.sustainedDays
        ? "SUSTAINED ACCUMULATION"
        : streak >= thresholds.earlyDays
          ? "EARLY ACCUMULATION"
          : "INSUFFICIENT EVIDENCE"
      : "INSUFFICIENT EVIDENCE";
  return {
    state,
    coverage,
    coveredDays: complete.length,
    consecutiveNetBuyDays: streak,
    netBuyUnits: buys.minus(sells).toFixed(),
    retentionPct: retention,
    reason:
      "Experimental purchase-ledger rule; no probability of a price increase.",
  };
}
