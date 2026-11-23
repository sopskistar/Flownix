import Decimal from "decimal.js";
import { quoteUsable, type BookQuote } from "./quotes";
Decimal.set({ precision: 100 });
export type Candle = {
  openAt: string;
  closeAt: string;
  availableAt: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
};
export type PaperAssumptions = {
  budget: string;
  notional: string;
  maxExposurePct: number;
  liquidity: string;
  minLiquidity: string;
  maxDisplayedShareBps: number;
  feeBps: number;
  slippageBps: number;
  gasQuote: string;
  entryDelaySeconds: number;
};
export const defaultPaperAssumptions: PaperAssumptions = {
  budget: "10000",
  notional: "100",
  maxExposurePct: 10,
  liquidity: "100000",
  minLiquidity: "100000",
  maxDisplayedShareBps: 10,
  feeBps: 30,
  slippageBps: 100,
  gasQuote: "2",
  entryDelaySeconds: 60,
};
export function simulateOutcome(input: {
  signalAt: string;
  membershipFirstSeen: string;
  entry: Candle;
  exit: Candle;
  path: Candle[];
  assumptions: PaperAssumptions;
  entryQuote?: BookQuote;
  exitQuote?: BookQuote;
}) {
  const { entry, exit, path, assumptions: a } = input;
  if (Date.parse(input.signalAt) < Date.parse(input.membershipFirstSeen))
    throw Error("Membership not yet proven");
  if (
    Date.parse(entry.openAt) <
    Date.parse(input.signalAt) + a.entryDelaySeconds * 1000
  )
    throw Error("Entry must follow signal and delay");
  if (
    Date.parse(exit.closeAt) <= Date.parse(entry.openAt) ||
    Date.parse(exit.availableAt) < Date.parse(exit.closeAt)
  )
    throw Error("Invalid outcome timestamps");
  if (
    new Decimal(a.notional).lte(0) ||
    new Decimal(a.budget).lte(0) ||
    new Decimal(a.liquidity).lt(a.minLiquidity)
  )
    throw Error("Insufficient budget or liquidity");
  if (
    new Decimal(a.notional).gt(
      new Decimal(a.budget).mul(a.maxExposurePct / 100),
    )
  )
    throw Error("Exposure exceeds limits");
  if (a.feeBps < 0 || a.slippageBps < 0 || new Decimal(a.gasQuote).lt(0))
    throw Error("Negative costs");
  if (
    !quoteUsable(input.entryQuote, entry.openAt) ||
    !quoteUsable(input.exitQuote, exit.availableAt)
  )
    throw Error("Observed executable-side quotes unavailable");
  const entryQuote = input.entryQuote!,
    exitQuote = input.exitQuote!;
  if (
    new Decimal(a.notional).gt(
      new Decimal(entryQuote.ask).mul(entryQuote.askQuantity),
    )
  )
    throw Error("Insufficient observed ask depth");
  if (
    new Decimal(a.notional).gt(
      new Decimal(entryQuote.ask)
        .mul(entryQuote.askQuantity)
        .mul(a.maxDisplayedShareBps / 10000),
    )
  )
    throw Error("Exposure exceeds observed quote depth");
  const p = new Decimal(entryQuote.ask),
    end = new Decimal(exitQuote.bid);
  if (p.lte(0) || end.lte(0)) throw Error("Invalid price");
  const fill = p.mul(1 + a.slippageBps / 10000);
  const quantity = new Decimal(a.notional)
    .minus(a.gasQuote)
    .div(1 + a.feeBps / 10000)
    .div(fill);
  if (quantity.lte(0)) throw Error("Costs exceed capital");
  if (quantity.gt(exitQuote.bidQuantity))
    throw Error("Insufficient observed bid depth");
  const proceeds = quantity
    .mul(end)
    .mul(1 - a.slippageBps / 10000)
    .mul(1 - a.feeBps / 10000)
    .minus(a.gasQuote);
  const observed = path.filter(
    (c) => c.openAt >= entry.openAt && c.closeAt <= exit.closeAt,
  );
  return {
    entryPrice: fill.toFixed(),
    quantity: quantity.toFixed(),
    grossReturnPct: end.div(p).minus(1).mul(100).toFixed(4),
    netPnl: proceeds.minus(a.notional).toFixed(6),
    netReturnPct: proceeds.div(a.notional).minus(1).mul(100).toFixed(4),
    mfePct: observed.length
      ? Decimal.max(...observed.map((c) => new Decimal(c.high)))
          .div(p)
          .minus(1)
          .mul(100)
          .toFixed(4)
      : null,
    maePct: observed.length
      ? Decimal.min(...observed.map((c) => new Decimal(c.low)))
          .div(p)
          .minus(1)
          .mul(100)
          .toFixed(4)
      : null,
    assumptions: a,
    warning:
      "Observed-book scenario estimate; displayed quotes may disappear. Quote units; no stablecoin-to-USD assumption.",
  };
}
export const outcomeWindows = [
  1, 4, 24, 72, 168, 336, 720, 1440, 2160,
] as const;
export function chronologicalSplit<T extends { at: string }>(
  rows: T[],
  cutoff: string,
) {
  return {
    train: rows.filter((r) => r.at < cutoff),
    test: rows.filter((r) => r.at >= cutoff),
  };
}

export type PatternExample = {
  tokenId: string;
  projectKey?: string;
  setupAt: string;
  membershipAvailableAt: string;
  featureAvailableAt: string;
  outcomeAvailableAt: string;
  featurePresent: boolean;
  netReturnPct: string;
  baselineNetReturnPct: string;
  maxDrawdownPct: string;
  costsAndCoverageComplete: boolean;
};
/** Descriptive candidate audit, never an automatic validation or confidence score. */
export function researchPatternComparison(
  rows: PatternExample[],
  cutoff: string,
  asOf: string,
  multipliers = [2, 3, 5, 10, 20, 50, 100],
  embargoDays = 0,
) {
  if (!Number.isFinite(embargoDays) || embargoDays < 0)
    throw Error("INVALID_EMBARGO");
  if (multipliers.some((m) => !Number.isFinite(m) || m < 2))
    throw Error("INVALID_RETURN_MULTIPLIER");
  const eligible = rows
    .filter(
      (r) =>
        r.costsAndCoverageComplete &&
        /^[a-f0-9]{32}$/.test(r.tokenId) &&
        [
          r.setupAt,
          r.membershipAvailableAt,
          r.featureAvailableAt,
          r.outcomeAvailableAt,
        ].every((at) => Number.isFinite(Date.parse(at))) &&
        Date.parse(r.membershipAvailableAt) <= Date.parse(r.setupAt) &&
        Date.parse(r.featureAvailableAt) <= Date.parse(r.setupAt) &&
        Date.parse(r.setupAt) < Date.parse(r.outcomeAvailableAt) &&
        Date.parse(r.outcomeAvailableAt) <= Date.parse(asOf) &&
        [r.netReturnPct, r.baselineNetReturnPct, r.maxDrawdownPct].every((s) =>
          /^-?\d+(\.\d+)?$/.test(s),
        ),
    )
    .map((r) => ({ ...r, at: new Date(r.setupAt).toISOString() }));
  const unique = [
    ...new Map(eligible.map((r) => [`${r.tokenId}:${r.at}`, r])).values(),
  ];
  const split = chronologicalSplit(unique, new Date(cutoff).toISOString());
  const purged = split.train.filter(
    (r) =>
      Date.parse(r.outcomeAvailableAt) >
      Date.parse(cutoff) - embargoDays * 86400000,
  );
  split.train = split.train.filter(
    (r) =>
      Date.parse(r.outcomeAvailableAt) <=
      Date.parse(cutoff) - embargoDays * 86400000,
  );
  const testGroups = new Set(split.test.map((r) => r.projectKey ?? r.tokenId));
  const sharedGroups = split.train.filter((r) =>
    testGroups.has(r.projectKey ?? r.tokenId),
  );
  split.train = split.train.filter(
    (r) => !testGroups.has(r.projectKey ?? r.tokenId),
  );
  const summarize = (examples: typeof unique) => ({
    examples: examples.length,
    independentTokenExamples: new Set(examples.map((r) => r.tokenId)).size,
    featurePresent: examples.filter((r) => r.featurePresent).length,
    featureAbsent: examples.filter((r) => !r.featurePresent).length,
    outcomes: multipliers.map((multiple) => ({
      multiple,
      withFeature: examples.filter(
        (r) =>
          r.featurePresent &&
          new Decimal(r.netReturnPct).gte((multiple - 1) * 100),
      ).length,
      featureWithoutThisReturn: examples.filter(
        (r) =>
          r.featurePresent &&
          new Decimal(r.netReturnPct).lt((multiple - 1) * 100),
      ).length,
      withoutFeature: examples.filter(
        (r) =>
          !r.featurePresent &&
          new Decimal(r.netReturnPct).gte((multiple - 1) * 100),
      ).length,
    })),
    meanIncrementalNetReturnPct: examples.length
      ? examples
          .reduce(
            (n, r) =>
              n.plus(new Decimal(r.netReturnPct).minus(r.baselineNetReturnPct)),
            new Decimal(0),
          )
          .div(examples.length)
          .toFixed(6)
      : null,
    worstObservedDrawdownPct: examples.length
      ? Decimal.min(
          ...examples.map((r) => new Decimal(r.maxDrawdownPct)),
        ).toFixed(6)
      : null,
  });
  return {
    stage: "candidate_hypothesis",
    validated: false,
    forwardTested: false,
    rejectedForCoverageOrTiming: rows.length - unique.length,
    purgedOverlappingOutcomes: purged.length,
    purgedSharedProjectExamples: sharedGroups.length,
    embargoDays,
    multipleTestingAdjusted: false,
    train: summarize(split.train),
    unseenPeriod: summarize(split.test),
    caveat:
      "Winner/non-winner counts and baseline differences are descriptive. Repeated setups on one token are not independent token examples; out-of-sample and forward evidence must precede strategy validation.",
  };
}
