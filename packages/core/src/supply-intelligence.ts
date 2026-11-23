import Decimal from "decimal.js";
import { contractIdentity, evmChains, tokenKey } from "./identity";
import type { Transfer } from "./evm";
import type { EvidenceLabel, ResearchSwap } from "./wallet-intelligence";
import { validEvidenceLabel, possibleRoundTrips } from "./wallet-intelligence";

export const operationalRoles = new Set([
  "verified_exchange",
  "DEX_pool",
  "router",
  "burn",
  "vesting",
  "bridge",
]);
export type ChainLabel = EvidenceLabel & { chain: string };
export type HolderSnapshot = {
  chain: string;
  contract: string;
  checkpoint: string;
  at: string;
  availableAt: string;
  totalRaw: string | null;
  circulatingRaw: string | null;
  coverage: "complete_holder_census" | "observed_sample" | "top_token_accounts";
  supplyVerified: boolean;
  source: string;
  responseHashes: string[];
  circulatingVerified?: boolean;
  circulatingSource?: string;
  circulatingAvailableAt?: string;
  holders: { address: string; raw: string; checkpoint: string }[];
};
const available = (at: string, asOf: string) =>
  Number.isFinite(Date.parse(at)) && Date.parse(at) <= Date.parse(asOf);
const rawAmount = (raw: string) =>
  /^\d+$/.test(raw)
    ? BigInt(raw)
    : (() => {
        throw Error("INVALID_RAW_AMOUNT");
      })();
export function supportedResearchChain(chain: string) {
  return !!evmChains[chain] || chain === "CT_501";
}

/** A sampled address list cannot certify top holders, independent ownership or circulating supply. */
export function supplyConcentration(
  snapshot: HolderSnapshot,
  labels: ChainLabel[],
  asOf: string,
) {
  if (
    !supportedResearchChain(snapshot.chain) ||
    !available(snapshot.availableAt, asOf) ||
    !available(snapshot.at, asOf)
  )
    return {
      status: "unavailable" as const,
      reason:
        "Unsupported network or evidence not available at the research cutoff",
      top: null,
      excludedRaw: null,
      unknownRaw: null,
      totalRaw: null,
      circulatingRaw: null,
      contradictions: [] as string[],
    };
  const holders = snapshot.holders.map((h) => ({
    ...h,
    address: contractIdentity(snapshot.chain, h.address).contract,
    amount: rawAmount(h.raw),
  }));
  const unique = new Set(holders.map((h) => h.address)).size === holders.length;
  const total =
    snapshot.totalRaw === null ? null : rawAmount(snapshot.totalRaw);
  const synchronized = holders.every(
    (h) => h.checkpoint === snapshot.checkpoint,
  );
  const sum = holders.reduce((n, h) => n + h.amount, 0n);
  const provedSupply =
    snapshot.supplyVerified &&
    !!snapshot.source &&
    snapshot.responseHashes.length > 0 &&
    total !== null &&
    total > 0n;
  const full =
    provedSupply &&
    snapshot.coverage === "complete_holder_census" &&
    unique &&
    synchronized &&
    sum === total;
  const contradictions: string[] = [];
  if (!unique || !synchronized || (total !== null && sum > total))
    contradictions.push(
      "Duplicate accounts, mixed checkpoints or balances exceeding supply; concentration withheld",
    );
  let excluded = 0n,
    unknown = 0n;
  for (const h of holders) {
    const matching = labels.filter(
      (l) =>
        l.chain === snapshot.chain &&
        contractIdentity(l.chain, l.address).contract === h.address &&
        validEvidenceLabel(l, snapshot.at, asOf),
    );
    const claims = new Set(matching.map((l) => `${l.entity}:${l.role}`));
    if (claims.size > 1)
      contradictions.push(`Conflicting time-valid labels for ${h.address}`);
    if (claims.size === 1 && operationalRoles.has(matching[0].role))
      excluded += h.amount;
    else unknown += h.amount;
  }
  const pct = (n: bigint) =>
    new Decimal(n.toString()).div(total!.toString()).mul(100).toFixed(6);
  const sorted = holders.toSorted((a, b) =>
    a.amount === b.amount
      ? a.address.localeCompare(b.address)
      : a.amount > b.amount
        ? -1
        : 1,
  );
  return {
    status: full ? ("complete" as const) : ("partial" as const),
    reason: full
      ? "Complete address census reconciles to checkpoint supply; addresses are not beneficial owners"
      : "Observed sample only; top-holder percentages are unavailable",
    top: full
      ? Object.fromEntries(
          [10, 20, 50].map((n) => [
            String(n),
            pct(sorted.slice(0, n).reduce((sum, h) => sum + h.amount, 0n)),
          ]),
        )
      : null,
    totalRaw: provedSupply ? snapshot.totalRaw : null,
    circulatingRaw:
      provedSupply &&
      snapshot.circulatingVerified &&
      snapshot.circulatingSource?.startsWith("https://") &&
      snapshot.circulatingAvailableAt &&
      available(snapshot.circulatingAvailableAt, asOf) &&
      snapshot.circulatingRaw !== null &&
      rawAmount(snapshot.circulatingRaw) <= total!
        ? snapshot.circulatingRaw
        : null,
    excludedRaw:
      holders.length && unique && synchronized ? excluded.toString() : null,
    unknownRaw:
      holders.length && unique && synchronized ? unknown.toString() : null,
    excludedPct: full ? pct(excluded) : null,
    contradictions,
    checkpoint: snapshot.checkpoint,
    availableAt: snapshot.availableAt,
    caveat:
      "Operational exclusions describe observed custody/pools/locks, not removal from circulating supply; unknown custody is not independent ownership",
  };
}

export function concentrationChange(
  before: HolderSnapshot | null,
  after: HolderSnapshot,
  labels: ChainLabel[],
  asOf: string,
) {
  if (
    !before ||
    tokenKey(before.chain, before.contract) !==
      tokenKey(after.chain, after.contract) ||
    Date.parse(before.at) >= Date.parse(after.at)
  )
    return null;
  const a = supplyConcentration(before, labels, asOf),
    b = supplyConcentration(after, labels, asOf);
  if (!a.top || !b.top) return null;
  return Object.fromEntries(
    ["10", "20", "50"].map((n) => [
      n,
      new Decimal(b.top![n]).minus(a.top![n]).toFixed(6),
    ]),
  );
}

export type WalletConnection = {
  chain: string;
  tokenId: string;
  a: string;
  b: string;
  source: string;
  rule: "shared_token_source" | "synchronized_verified_buys";
  txIds: string[];
  firstEventAt: string;
  availableAt: string;
  confidence: "observed_connection";
  commonOwnership: false;
  alternatives: string[];
};
/** Shared target-token receipts are graph evidence, never a native-gas funding or ownership claim. */
export function sharedTokenSources(
  transfers: Transfer[],
  labels: ChainLabel[],
  asOf: string,
  maxPairs = 1000,
) {
  const groups = new Map<string, Transfer[]>();
  for (const t of new Map(
    transfers.map((t) => [
      `${t.chain}:${t.txHash}:${t.logIndex}:${t.tokenId}`,
      t,
    ]),
  ).values()) {
    if (
      !supportedResearchChain(t.chain) ||
      !available(t.availableAt, asOf) ||
      !available(t.eventTime, asOf) ||
      t.kind !== "unknown_transfer" ||
      t.from === t.to ||
      rawAmount(t.rawQuantity) === 0n
    )
      continue;
    if (
      [t.from, t.to].some((address) =>
        labels.some(
          (l) =>
            l.chain === t.chain &&
            l.address === address &&
            operationalRoles.has(l.role) &&
            validEvidenceLabel(l, t.eventTime, asOf),
        ),
      )
    )
      continue;
    const key = `${t.chain}:${t.tokenId}:${t.from}`;
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }
  const result: WalletConnection[] = [];
  for (const rows of groups.values()) {
    const recipients = [...new Set(rows.map((t) => t.to))].sort();
    // Pair expansion is bounded by the input cohort, never used as a token-universe cap.
    for (let i = 0; i < recipients.length; i++)
      for (let j = i + 1; j < recipients.length; j++) {
        if (result.length >= maxPairs)
          return { connections: result, truncated: true };
        const evidence = rows.filter(
          (t) => t.to === recipients[i] || t.to === recipients[j],
        );
        result.push({
          chain: rows[0].chain,
          tokenId: rows[0].tokenId,
          a: recipients[i],
          b: recipients[j],
          source: rows[0].from,
          rule: "shared_token_source",
          txIds: evidence.map((t) => `${t.txHash}:${t.logIndex}`),
          firstEventAt: evidence.map((t) => t.eventTime).sort()[0],
          availableAt: evidence
            .map((t) => t.availableAt)
            .sort()
            .at(-1)!,
          confidence: "observed_connection",
          commonOwnership: false,
          alternatives: [
            "Independent customers of an unlabelled service",
            "Airdrop or allocation distribution",
            "Treasury payments or market-making routing",
            "Native gas funding and beneficial ownership are unverified",
          ],
        });
      }
  }
  return { connections: result, truncated: false };
}

export function synchronizedBuys(
  chain: string,
  tokenId: string,
  swaps: ResearchSwap[],
  labels: ChainLabel[],
  asOf: string,
  seconds = 60,
  tolerancePct = 5,
  maxPairs = 1000,
) {
  const rows = [
    ...new Map(
      swaps
        .filter(
          (s) =>
            supportedResearchChain(chain) &&
            s.side === "buy" &&
            s.actor &&
            rawAmount(s.raw) > 0n &&
            available(s.at, asOf) &&
            available(s.availableAt, asOf) &&
            !labels.some(
              (l) =>
                l.chain === chain &&
                l.address === s.actor &&
                operationalRoles.has(l.role) &&
                validEvidenceLabel(l, s.at, asOf),
            ),
        )
        .map((s) => [s.eventId, s]),
    ).values(),
  ].toSorted((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const pairs = new Map<string, WalletConnection>();
  for (let i = 0; i < rows.length; i++)
    for (
      let j = i + 1;
      j < rows.length &&
      Date.parse(rows[j].at) - Date.parse(rows[i].at) <= seconds * 1000;
      j++
    ) {
      const a = rows[i],
        b = rows[j];
      if (
        a.actor === b.actor ||
        a.txHash === b.txHash ||
        new Decimal(a.raw).div(b.raw).minus(1).abs().mul(100).gt(tolerancePct)
      )
        continue;
      const [x, y] = [a.actor!, b.actor!].sort(),
        key = `${x}:${y}`;
      if (!pairs.has(key) && pairs.size >= maxPairs)
        return { connections: [...pairs.values()], truncated: true };
      const previous = pairs.get(key);
      pairs.set(key, {
        chain,
        tokenId,
        a: x,
        b: y,
        source: "verified-swap timing/amount sample",
        rule: "synchronized_verified_buys",
        txIds: [
          ...new Set([
            ...(previous?.txIds ?? []),
            `${a.txHash}:${a.eventId.split(":").at(-1)}`,
            `${b.txHash}:${b.eventId.split(":").at(-1)}`,
          ]),
        ],
        firstEventAt: previous?.firstEventAt ?? a.at,
        availableAt: [
          previous?.availableAt ?? a.availableAt,
          a.availableAt,
          b.availableAt,
        ]
          .sort()
          .at(-1)!,
        confidence: "observed_connection",
        commonOwnership: false,
        alternatives: [
          `Configured coincidence window ${seconds}s and amount tolerance ${tolerancePct}% are research parameters, not a probability`,
          "Independent reaction to news, market making or arbitrage",
          "Retention, beneficial ownership and coordination are unverified",
        ],
      });
    }
  return { connections: [...pairs.values()], truncated: false };
}

export function repeatedWalletPairs(connections: WalletConnection[]) {
  const groups = new Map<string, Set<string>>();
  for (const c of connections) {
    const key = `${c.chain}:${c.a}:${c.b}`;
    groups.set(key, new Set([...(groups.get(key) ?? []), c.tokenId]));
  }
  return [...groups]
    .filter(([, tokens]) => tokens.size > 1)
    .map(([pair, tokens]) => ({
      pair,
      tokenIds: [...tokens],
      commonOwnership: false,
    }));
}

export function volumeQuality(
  swaps: ResearchSwap[],
  address: string,
  asOf: string,
) {
  const rows = [
    ...new Map(
      swaps
        .filter(
          (s) =>
            s.actor === address &&
            available(s.at, asOf) &&
            available(s.availableAt, asOf),
        )
        .map((s) => [s.eventId, s]),
    ).values(),
  ];
  const buys = rows
    .filter((s) => s.side === "buy")
    .reduce((n, s) => n + rawAmount(s.raw), 0n);
  const sells = rows
    .filter((s) => s.side === "sell")
    .reduce((n, s) => n + rawAmount(s.raw), 0n);
  return {
    grossBuyRaw: buys.toString(),
    grossSellRaw: sells.toString(),
    observedSwapNetRaw: (buys - sells).toString(),
    netPositionIncreaseRaw: null,
    turnover: possibleRoundTrips(rows, asOf),
    interpretation:
      "Observed settlement sample; gross volume is not retained acquisition. Transfers, missing venues, market making and arbitrage can change the interpretation.",
  };
}

/** V3 pool token balances cannot be used in a constant-product price-impact formula. */
export function hypotheticalImpact(
  input: {
    kind: "constant_product" | "concentrated_liquidity";
    baseRaw: string | null;
    quoteRaw: string | null;
    quoteOrderRaw: string;
    observedAt: string | null;
    availableAt: string;
    identityVerified: boolean;
  },
  asOf: string,
) {
  if (
    input.kind !== "constant_product" ||
    !input.identityVerified ||
    !input.observedAt ||
    !available(input.availableAt, asOf) ||
    !available(input.observedAt, asOf) ||
    Date.parse(asOf) - Date.parse(input.observedAt) > 900000 ||
    input.baseRaw === null ||
    input.quoteRaw === null
  )
    return null;
  const base = new Decimal(input.baseRaw),
    quote = new Decimal(input.quoteRaw),
    order = new Decimal(input.quoteOrderRaw);
  if (!base.gt(0) || !quote.gt(0) || !order.gt(0)) return null;
  const acquired = base.mul(order).div(quote.plus(order));
  return {
    acquiredRaw: acquired.toFixed(0, Decimal.ROUND_DOWN),
    averagePriceImpactPct: order.div(quote).mul(100).toFixed(6),
    model:
      "Verified constant-product reserves, before fees; hypothetical, not executable depth",
  };
}
