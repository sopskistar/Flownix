import { type Transfer } from "./evm";
import { purchaseRetentionLowerBound } from "./swaps";

export type ResearchBalance = {
  block: number;
  blockHash: string;
  raw: string;
  at: string;
  availableAt: string;
};
export type ResearchSwap = {
  eventId: string;
  actor: string | null;
  side: "buy" | "sell";
  raw: string;
  block: number;
  at: string;
  availableAt: string;
  txHash: string;
};
export type LedgerWindow = {
  from: number;
  to: number;
  complete: boolean;
  availableAt: string;
};
export type EvidenceLabel = {
  address: string;
  entity: string;
  role: string;
  verified: boolean;
  source: string;
  validFrom: string;
  validTo: string | null;
  availableAt: string;
};

export function continuousLedger(
  windows: LedgerWindow[],
  from: number,
  to: number,
  asOf: string,
) {
  let cursor = from;
  for (const window of windows
    .filter(
      (w) =>
        w.complete && w.availableAt <= asOf && w.to >= from && w.from <= to,
    )
    .toSorted((a, b) => a.from - b.from)) {
    if (window.from > cursor) return false;
    cursor = Math.max(cursor, window.to + 1);
    if (cursor > to) return true;
  }
  return false;
}
export function walletResearch(input: {
  address: string;
  start: string;
  end: string;
  asOf: string;
  balances: ResearchBalance[];
  transfers: Transfer[];
  swaps: ResearchSwap[];
  windows: LedgerWindow[];
}) {
  const { address, start, end, asOf } = input;
  const snapshots = input.balances
    .filter((b) => b.availableAt <= asOf && b.at <= end)
    .toSorted((a, b) => a.block - b.block);
  const opening = snapshots.filter((b) => b.at <= start).at(-1) ?? null,
    closing = snapshots.at(-1) ?? null;
  const swaps = [
    ...new Map(
      input.swaps
        .filter(
          (s) =>
            s.actor === address &&
            s.at >= start &&
            s.at <= end &&
            s.availableAt <= asOf,
        )
        .map((s) => [s.eventId, s]),
    ).values(),
  ];
  const buys = swaps.filter((s) => s.side === "buy"),
    sells = swaps.filter((s) => s.side === "sell");
  const sum = (rows: ResearchSwap[]) =>
    rows.reduce((n, row) => n + BigInt(row.raw), 0n);
  const first = buys.toSorted((a, b) => a.block - b.block)[0];
  const transfers = input.transfers.filter(
    (t) =>
      t.availableAt <= asOf &&
      t.eventTime <= end &&
      (!closing || t.blockNumber <= closing.block),
  );
  const covered = !!(
    closing &&
    first &&
    continuousLedger(input.windows, first.block, closing.block, asOf)
  );
  const priorToPurchase = first
    ? snapshots.filter((b) => b.block < first.block).at(-1)
    : undefined;
  const reconciling =
    priorToPurchase && closing
      ? transfers.filter(
          (t) =>
            t.blockNumber > priorToPurchase.block &&
            t.blockNumber <= closing.block,
        )
      : [];
  const netLedger = reconciling.reduce(
    (sum, t) =>
      sum +
      (t.to === address ? BigInt(t.rawQuantity) : 0n) -
      (t.from === address ? BigInt(t.rawQuantity) : 0n),
    0n,
  );
  const reconciled =
    priorToPurchase && closing
      ? BigInt(priorToPurchase.raw) + netLedger === BigInt(closing.raw)
      : null;
  const eligibleBuys = buys.filter(
    (s) => !!closing && s.block <= closing.block,
  );
  const retained = purchaseRetentionLowerBound(
    eligibleBuys.map((s) => ({
      eventId: s.eventId,
      rawQuantity: s.raw,
      at: s.at,
    })),
    transfers,
    address,
    closing?.raw ?? null,
    covered && reconciled === true,
  );
  return {
    address,
    requestedStart: start,
    requestedEnd: end,
    computedAt: asOf,
    currentObservedBalanceRaw: closing?.raw ?? null,
    balanceObservedAt: closing?.at ?? null,
    balanceBlock: closing?.block ?? null,
    balanceDeltaRaw:
      opening && closing
        ? (BigInt(closing.raw) - BigInt(opening.raw)).toString()
        : null,
    actualBalanceStart: opening?.at ?? null,
    actualBalanceEnd: closing?.at ?? null,
    verifiedBuyRaw: buys.length ? sum(buys).toString() : null,
    verifiedSellRaw: sells.length ? sum(sells).toString() : null,
    observedSwapNetRaw: swaps.length
      ? (sum(buys) - sum(sells)).toString()
      : null,
    firstObservedPurchase: first?.at ?? null,
    buyDays: new Set(buys.map((s) => s.at.slice(0, 10))).size,
    retainedPurchaseLowerBoundRaw: retained.retainedRaw,
    retentionLowerBoundPct: retained.retentionPct,
    observedHoldingDays:
      first &&
      closing &&
      retained.retainedRaw &&
      BigInt(retained.retainedRaw) > 0n
        ? Math.max(
            0,
            (Date.parse(closing.at) - Date.parse(first.at)) / 86400000,
          )
        : null,
    transferLedgerContinuous: covered,
    transferBalanceReconciled: reconciled,
    costBasis: null,
    independentWallets: null,
    swapEvidenceIds: swaps.slice(0, 100).map((s) => s.eventId),
    swapEvidenceCount: swaps.length,
    evidenceSampleLimit: 100,
    txHashes: [...new Set(swaps.map((s) => s.txHash))].slice(0, 100),
    caveats: [
      "Observed swap sample and address-level balances; not complete market buying or beneficial ownership",
      retained.method,
      "Unknown or missing history remains unavailable; received transfers and allocations do not count as verified purchases",
    ],
  };
}
export function validEvidenceLabel(
  label: EvidenceLabel,
  eventTime: string,
  asOf: string,
) {
  return (
    label.verified &&
    !!label.entity &&
    /^https:\/\//.test(label.source) &&
    [
      label.availableAt,
      label.validFrom,
      eventTime,
      asOf,
      ...(label.validTo ? [label.validTo] : []),
    ].every((at) => Number.isFinite(Date.parse(at))) &&
    Date.parse(label.availableAt) <= Date.parse(asOf) &&
    Date.parse(label.validFrom) <= Date.parse(eventTime) &&
    (!label.validTo || Date.parse(eventTime) < Date.parse(label.validTo))
  );
}
export function exchangeResearch(
  transfers: Transfer[],
  labels: EvidenceLabel[],
  asOf: string,
) {
  const verified = labels.filter(
    (l) =>
      l.role === "verified_exchange" && l.verified && l.availableAt <= asOf,
  );
  if (!verified.length)
    return {
      entities: [],
      coverage: "unavailable",
      reason:
        "No independently reviewed, time-valid exchange labels; no zero-flow assumption",
    };
  const entities = new Map<
    string,
    {
      entity: string;
      inRaw: bigint;
      outRaw: bigint;
      internalRaw: bigint;
      venueToVenueRaw: bigint;
      txHashes: string[];
      sources: Set<string>;
    }
  >();
  const labelAt = (address: string, time: string) => {
    const rows = verified.filter(
      (l) => l.address === address && validEvidenceLabel(l, time, asOf),
    );
    return new Set(rows.map((l) => l.entity)).size === 1 ? rows[0] : undefined;
  };
  for (const t of new Map(
    transfers
      .filter((t) => t.availableAt <= asOf && t.eventTime <= asOf)
      .map((t) => [`${t.chain}:${t.txHash}:${t.logIndex}`, t]),
  ).values()) {
    if (t.kind !== "unknown_transfer") continue;
    const from = labelAt(t.from, t.eventTime),
      to = labelAt(t.to, t.eventTime),
      amount = BigInt(t.rawQuantity);
    for (const label of [from, to].filter((l): l is EvidenceLabel => !!l))
      if (!entities.has(label.entity))
        entities.set(label.entity, {
          entity: label.entity,
          inRaw: 0n,
          outRaw: 0n,
          internalRaw: 0n,
          venueToVenueRaw: 0n,
          txHashes: [],
          sources: new Set(),
        });
    if (from && to) {
      const a = entities.get(from.entity)!;
      a.sources.add(from.source);
      a.txHashes.push(t.txHash);
      if (from.entity === to.entity) a.internalRaw += amount;
      else {
        a.venueToVenueRaw += amount;
        const b = entities.get(to.entity)!;
        b.venueToVenueRaw += amount;
        b.sources.add(to.source);
        b.txHashes.push(t.txHash);
      }
      continue;
    }
    if (from) {
      const row = entities.get(from.entity)!;
      row.outRaw += amount;
      row.txHashes.push(t.txHash);
      row.sources.add(from.source);
    }
    if (to) {
      const row = entities.get(to.entity)!;
      row.inRaw += amount;
      row.txHashes.push(t.txHash);
      row.sources.add(to.source);
    }
  }
  return {
    coverage: "partial",
    reason:
      "Observed movements involving attributed exchange addresses; internal and known venue-to-venue transfers separated; no claim about internal CEX accounts or selling",
    entities: [...entities.values()].map((e) => ({
      entity: e.entity,
      inflowRaw: e.inRaw.toString(),
      outflowRaw: e.outRaw.toString(),
      netExternalOutflowRaw: (e.outRaw - e.inRaw).toString(),
      excludedInternalRaw: e.internalRaw.toString(),
      separateVenueRoutingRaw: e.venueToVenueRaw.toString(),
      txHashes: [...new Set(e.txHashes)].slice(0, 100),
      transactionCount: new Set(e.txHashes).size,
      evidenceSampleLimit: 100,
      sources: [...e.sources],
    })),
  };
}
export function possibleRoundTrips(
  swaps: ResearchSwap[],
  asOf: string,
  maxMinutes = 30,
  minTrips = 3,
) {
  const rows = [
    ...new Map(
      swaps
        .filter((s) => s.actor && s.availableAt <= asOf && s.at <= asOf)
        .map((s) => [s.eventId, s]),
    ).values(),
  ].toSorted((a, b) => a.at.localeCompare(b.at));
  const lots = new Map<string, { swap: ResearchSwap; remaining: bigint }[]>(),
    trips: { actor: string; buy: string; sell: string; matchedRaw: string }[] =
      [];
  for (const swap of rows) {
    if (swap.side === "buy") {
      const q = lots.get(swap.actor!) ?? [];
      q.push({ swap, remaining: BigInt(swap.raw) });
      lots.set(swap.actor!, q);
      continue;
    }
    let remaining = BigInt(swap.raw);
    for (const lot of lots.get(swap.actor!) ?? []) {
      if (remaining === 0n) break;
      if (
        lot.remaining === 0n ||
        Date.parse(swap.at) - Date.parse(lot.swap.at) > maxMinutes * 60000
      )
        continue;
      const matched = remaining < lot.remaining ? remaining : lot.remaining;
      remaining -= matched;
      lot.remaining -= matched;
      trips.push({
        actor: swap.actor!,
        buy: lot.swap.eventId,
        sell: swap.eventId,
        matchedRaw: matched.toString(),
      });
    }
  }
  // Distinct sell transactions, rather than split lots, determine the repetition count.
  const repeatedActors = [...new Set(trips.map((t) => t.actor))].filter(
    (actor) =>
      new Set(trips.filter((t) => t.actor === actor).map((t) => t.sell)).size >=
      minTrips,
  );
  const repeated = repeatedActors.length > 0;
  return {
    kind: repeated ? "POSSIBLE_INCENTIVE_DRIVEN_TURNOVER" : null,
    repeatedActors,
    trips: trips.slice(0, 100),
    matchedLotCount: trips.length,
    distinctSellEventCount: new Set(trips.map((t) => t.sell)).size,
    evidenceSampleLimit: 100,
    thresholds: { maxMinutes, minTrips },
    caveat:
      "Verified short holding-period round trips are observable; farming incentives, recycled funding and manipulation are not established",
  };
}
