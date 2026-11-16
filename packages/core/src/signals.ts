import type { Transfer } from "./evm";
export const RULE_VERSION = "transfer-activity/1.0.0";
export type SignalConfig = {
  minEvents: number;
  multiplier: number;
  baselineWindows: number;
  maxAgeSeconds: number;
  minLiquidity: number;
};
export const defaultSignalConfig: SignalConfig = {
  minEvents: 25,
  multiplier: 3,
  baselineWindows: 12,
  maxAgeSeconds: 900,
  minLiquidity: 100000,
};
export type TransferWindow = {
  fromBlock: number;
  toBlock: number;
  startTime: string;
  endTime: string;
  availableAt: string;
  complete: boolean;
  count: number;
};
export type SignalInput = {
  now: string;
  membershipFirstSeen: string;
  membershipStatus: string;
  marketObservedAt: string | null;
  price: string | null;
  quoteAsset: string | null;
  liquidity: string | null;
  transfers: Transfer[];
  window: TransferWindow;
  baseline: TransferWindow[];
};
export function detectTransferActivity(
  i: SignalInput,
  c: SignalConfig = defaultSignalConfig,
) {
  const unknowns = [
    "Transfer events do not establish a buy, beneficial ownership, accumulation, or intent.",
    "Bridge, LP, custody and treasury operations may explain activity.",
    "Partial addresses and block window; no top-holder census or verified swap decoder.",
  ];
  const age = (s: string) => Date.parse(i.now) - Date.parse(s);
  const baseline = i.baseline
    .filter(
      (w) =>
        w.complete &&
        w.toBlock < i.window.fromBlock &&
        w.endTime <= i.window.startTime &&
        w.availableAt <= i.now,
    )
    .slice(-c.baselineWindows);
  const usable = i.transfers.filter(
    (t) =>
      t.kind === "unknown_transfer" &&
      t.blockNumber >= i.window.fromBlock &&
      t.blockNumber <= i.window.toBlock &&
      t.availableAt <= i.now,
  );
  const unique = [
    ...new Map(
      usable.map((t) => [`${t.chain}:${t.txHash}:${t.logIndex}`, t]),
    ).values(),
  ];
  if (
    i.membershipStatus !== "current" ||
    Date.parse(i.membershipFirstSeen) > Date.parse(i.window.startTime)
  )
    return { signal: null, reason: "Membership not proven at start of window" };
  if (
    !i.window.complete ||
    age(i.window.availableAt) > c.maxAgeSeconds * 1000 ||
    age(i.window.availableAt) < 0 ||
    age(i.window.endTime) > c.maxAgeSeconds * 1000 ||
    age(i.window.endTime) < 0
  )
    return { signal: null, reason: "Incomplete or stale scan" };
  if (
    !i.marketObservedAt ||
    age(i.marketObservedAt) > c.maxAgeSeconds * 1000 ||
    age(i.marketObservedAt) < 0 ||
    !i.price ||
    Number(i.price) <= 0 ||
    !i.liquidity ||
    Number(i.liquidity) < c.minLiquidity
  )
    return {
      signal: null,
      reason: "Fresh market price and minimum liquidity required",
    };
  if (baseline.length < c.baselineWindows)
    return { signal: null, reason: "Insufficient baseline windows" };
  // Equal block windows only. Irregular/missing windows never count as zero activity.
  const ordered = baseline.toSorted((a, b) => a.fromBlock - b.fromBlock);
  if (
    ordered.some(
      (w, n) => n > 0 && ordered[n - 1].toBlock + 1 !== w.fromBlock,
    ) ||
    ordered.at(-1)!.toBlock + 1 !== i.window.fromBlock
  )
    return { signal: null, reason: "Baseline contains scan gaps" };
  if (
    baseline.some(
      (w) => w.toBlock - w.fromBlock !== i.window.toBlock - i.window.fromBlock,
    )
  )
    return { signal: null, reason: "Unequal scan windows" };
  const mean = baseline.reduce((s, w) => s + w.count, 0) / baseline.length;
  if (
    unique.length < c.minEvents ||
    unique.length < c.multiplier * Math.max(1, mean)
  )
    return { signal: null, reason: "Threshold not met" };
  return {
    reason: "Transfer count exceeds configured baseline",
    signal: {
      kind: "UNUSUAL_TRANSFER_ACTIVITY" as const,
      ruleVersion: RULE_VERSION,
      stage: "INVESTIGATE" as const,
      opportunityScore: null,
      evidenceConfidence: "limited" as const,
      firstDetectedAt: i.now,
      computedAt: i.now,
      dataAvailableAt: i.now,
      priceAtDetection: i.price,
      quoteAsset: i.quoteAsset,
      thresholds: c,
      observed: { events: unique.length, baselineMean: mean, window: i.window },
      unknowns,
      evidence: unique.map((t) => ({
        chain: t.chain,
        txHash: t.txHash,
        logIndex: t.logIndex,
      })),
      counterEvidence: unknowns,
    },
  };
}
// Separate flow accounting helper; labels must be time-valid and are never inferred from transfers.
export function observedAttributedExchangeFlow(
  transfers: Transfer[],
  addresses: Map<string, string>,
) {
  let inflow = 0n,
    outflow = 0n;
  for (const t of transfers) {
    if (t.kind !== "unknown_transfer") continue;
    const from = addresses.get(t.from),
      to = addresses.get(t.to);
    if (from && to && from === to) continue;
    if (from && !to) outflow += BigInt(t.rawQuantity);
    if (to && !from) inflow += BigInt(t.rawQuantity);
  }
  return {
    inflow: inflow.toString(),
    outflow: outflow.toString(),
    netOutflow: (outflow - inflow).toString(),
    coverage: "partial" as const,
  };
}
