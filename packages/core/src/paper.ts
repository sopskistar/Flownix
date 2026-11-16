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
