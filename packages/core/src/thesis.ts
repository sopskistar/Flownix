import type { ResearchState } from "./accumulation";
export const thesisDefaults = {
  earlyObservedDays: 7,
  sustainedObservedDays: 30,
  minBuyDays: 3,
  sustainedBuyDays: 7,
  minRetainingAddresses: 3,
  minRetentionPct: 80,
  minCoverage: 0.9,
  maxQuietPriceChangePct: 20,
  extendedPriceChangePct: 50,
};
export type ThesisEvidence = {
  observedDays: number;
  buyDays: number;
  retainingAddresses: number;
  retentionPct: number | null;
  coverage: number;
  marketFresh: boolean;
  membershipCurrent: boolean;
  priceChangePct: number | null;
  verifiedDistribution: boolean;
  distributionEvidenceIds: string[];
  independenceVerified: boolean;
  possibleIncentiveTrading?: boolean;
  txIds: string[];
  availableAt: string;
};
export function evaluateAccumulationThesis(
  current: ResearchState,
  input: ThesisEvidence,
  asOf: string,
  thresholds = thesisDefaults,
) {
  const risks: string[] = [];
  const suppressionReasons = [
    ...(!input.marketFresh
      ? ["Market or transfer/pool source time is stale or unavailable"]
      : []),
    ...(!input.membershipCurrent
      ? ["Official membership observation is stale"]
      : []),
    ...(input.coverage < thresholds.minCoverage
      ? ["Joint transfer and pool history coverage below threshold"]
      : []),
    ...(input.observedDays < thresholds.earlyObservedDays
      ? ["Fewer than seven actually covered days"]
      : []),
    ...(input.buyDays < thresholds.minBuyDays
      ? ["Fewer than three days of verified attributed purchases"]
      : []),
    ...(input.retainingAddresses < thresholds.minRetainingAddresses ||
    input.retentionPct === null ||
    input.retentionPct < thresholds.minRetentionPct
      ? ["Reconciled retained purchase balances insufficient"]
      : []),
    ...(input.priceChangePct === null
      ? ["Quiet-price comparison unavailable"]
      : []),
    ...(input.availableAt > asOf ? ["Evidence not yet locally available"] : []),
    ...(input.possibleIncentiveTrading
      ? ["Possible incentive round trips"]
      : []),
  ];
  const ready =
    input.availableAt <= asOf &&
    input.marketFresh &&
    input.membershipCurrent &&
    input.coverage >= thresholds.minCoverage;
  const usable = ready && !input.possibleIncentiveTrading;
  if (input.possibleIncentiveTrading)
    risks.push(
      "Repeated short holding-period round trips undermine an accumulation interpretation",
    );
  if (!input.independenceVerified)
    risks.push(
      "Distinct addresses do not establish independent beneficial owners",
    );
  if (!ready)
    risks.push(
      "Fresh membership, market observations and sufficient known collection coverage are required",
    );
  if (["THESIS INVALIDATED", "DISTRIBUTION RISK"].includes(current))
    return {
      state: current,
      confidence: "insufficient",
      reason:
        "Retain the recorded invalidation/risk state until its contradictory evidence is explicitly reviewed; a new quiet-price observation does not clear it",
      risks,
      suppressionReasons,
      evidenceIds: input.txIds,
      ruleVersion: "long-term-thesis/1",
      thresholds,
    };
  const supportedBefore = [
    "EARLY ACCUMULATION",
    "SUSTAINED ACCUMULATION",
    "SUPPLY CONCENTRATION",
    "STRENGTHENING SETUP",
    "PRICE EXPANSION",
  ].includes(current);
  if (
    ready &&
    supportedBefore &&
    input.verifiedDistribution &&
    input.distributionEvidenceIds.length
  )
    return {
      state: "DISTRIBUTION RISK" as ResearchState,
      confidence: "limited",
      reason:
        "Verified sell/holding-reduction evidence contradicts the prior thesis; no assertion about intent",
      risks,
      suppressionReasons,
      evidenceIds: input.distributionEvidenceIds,
      ruleVersion: "long-term-thesis/1",
      thresholds,
    };
  if (
    ready &&
    supportedBefore &&
    input.priceChangePct !== null &&
    input.priceChangePct >= thresholds.extendedPriceChangePct
  )
    return {
      state: "PRICE EXPANSION" as ResearchState,
      confidence: "limited",
      reason:
        "Price expansion after a previously recorded thesis; marked extended rather than an early opportunity",
      risks,
      suppressionReasons,
      evidenceIds: input.txIds,
      ruleVersion: "long-term-thesis/1",
      thresholds,
    };
  const quiet =
    input.priceChangePct !== null &&
    Math.abs(input.priceChangePct) <= thresholds.maxQuietPriceChangePct;
  const qualified =
    usable &&
    quiet &&
    input.txIds.length > 0 &&
    input.retainingAddresses >= thresholds.minRetainingAddresses &&
    input.retentionPct !== null &&
    input.retentionPct >= thresholds.minRetentionPct;
  if (
    qualified &&
    input.observedDays >= thresholds.sustainedObservedDays &&
    input.buyDays >= thresholds.sustainedBuyDays
  )
    return {
      state: "SUSTAINED ACCUMULATION" as ResearchState,
      confidence: input.independenceVerified ? "supported" : "provisional",
      reason:
        "Repeated verified purchases and conservative retained quantities across a multiweek observed period; venue and wallet-identity coverage remain explicit",
      risks,
      suppressionReasons,
      evidenceIds: input.txIds,
      ruleVersion: "long-term-thesis/1",
      thresholds,
    };
  if (
    qualified &&
    input.observedDays >= thresholds.earlyObservedDays &&
    input.buyDays >= thresholds.minBuyDays
  )
    return {
      state: "EARLY ACCUMULATION" as ResearchState,
      confidence: "provisional",
      reason:
        "Repeated purchase evidence with measured retention and quiet price behavior; investigate, not a prediction",
      risks,
      suppressionReasons,
      evidenceIds: input.txIds,
      ruleVersion: "long-term-thesis/1",
      thresholds,
    };
  return {
    state: supportedBefore
      ? current
      : ("INSUFFICIENT EVIDENCE" as ResearchState),
    confidence: "insufficient",
    reason: supportedBefore
      ? "No new qualifying transition; preserve the research thesis and flag gaps or counter-evidence. Flat price alone never invalidates a thesis"
      : "Long-term verified buying, retention, price context or coverage is insufficient",
    risks,
    suppressionReasons,
    evidenceIds: input.txIds,
    ruleVersion: "long-term-thesis/1",
    thresholds,
  };
}
