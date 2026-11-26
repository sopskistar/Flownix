import { tokenKey, isChainAddress, evmChains } from "./identity";
import { decodeTransfer, type Transfer } from "./evm";
import { validEvidenceLabel, type EvidenceLabel } from "./wallet-intelligence";

export const exchangeAccountRoles = [
  "hot",
  "cold",
  "deposit",
  "withdrawal",
  "operational",
  "unknown",
] as const;
export type ExchangeWalletLabel = EvidenceLabel & {
  chain: string;
  accountRole: string;
};
export function walletReceiptTransfers(input: {
  token: { id: string; chain: string; contract: string };
  address: string;
  txHash: string;
  decimals: number;
  availableAt: string;
  receipt: {
    transactionHash: string;
    status: string;
    blockHash: string;
    blockNumber: string;
    logs: Array<{
      address: string;
      blockHash: string;
      blockNumber: string;
      transactionHash: string;
    }>;
  };
  header: { hash: string; number: string; timestamp: string };
}) {
  const { token, receipt, header } = input;
  if (
    !evmChains[token.chain] ||
    tokenKey(token.chain, token.contract) !== token.id
  )
    throw Error("EXACT_ALPHA_IDENTITY_REQUIRED");
  if (
    receipt.transactionHash.toLowerCase() !== input.txHash.toLowerCase() ||
    BigInt(receipt.status) !== 1n ||
    receipt.blockHash.toLowerCase() !== header.hash.toLowerCase() ||
    BigInt(receipt.blockNumber) !== BigInt(header.number)
  )
    throw Error("NONCANONICAL_CASE_RECEIPT");
  const time = new Date(Number(BigInt(header.timestamp)) * 1000).toISOString();
  return receipt.logs
    .filter((l) => l.address.toLowerCase() === token.contract.toLowerCase())
    .flatMap((log) => {
      if (
        log.blockHash.toLowerCase() !== receipt.blockHash.toLowerCase() ||
        BigInt(log.blockNumber) !== BigInt(receipt.blockNumber) ||
        log.transactionHash.toLowerCase() !==
          receipt.transactionHash.toLowerCase()
      )
        throw Error("RECEIPT_LOG_MISMATCH");
      const transfer = decodeTransfer(
        log,
        token.chain,
        token.id,
        input.decimals,
        time,
        `configured_rpc:${token.chain}`,
        input.availableAt,
      );
      return transfer &&
        [transfer.from, transfer.to].includes(input.address.toLowerCase())
        ? [transfer]
        : [];
    });
}
/** Existing labels remain append-only assertions; review and availability are
 * separate from an asserted validity period. Structured notes are optional. */
export function exchangeLabelFromRow(
  row: Record<string, unknown>,
): ExchangeWalletLabel {
  let detail: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(String(row.notes));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
      detail = parsed;
  } catch {
    /* legacy prose */
  }
  const at = (value: unknown) =>
    value ? new Date(value as string).toISOString() : "";
  return {
    chain: String(row.chain_id),
    address: String(row.address).toLowerCase(),
    entity: String(row.entity ?? ""),
    role: String(row.role),
    verified:
      !!row.reviewed_by &&
      !/unverified|manual|third.party/i.test(String(row.confidence)),
    source: String(row.source_url),
    validFrom: at(row.valid_from),
    validTo: row.valid_to ? at(row.valid_to) : null,
    availableAt: at(row.created_at),
    accountRole: exchangeAccountRoles.includes(
      detail.accountRole as (typeof exchangeAccountRoles)[number],
    )
      ? String(detail.accountRole)
      : "unknown",
  };
}

/** Address-level flows only. No inference about exchange trades, cost basis,
 * beneficial ownership or retained purchases. Inputs must be canonical rows. */
export function walletExchangeResearch(input: {
  token: { id: string; chain: string; contract: string };
  address: string;
  transfers: Transfer[];
  labels: ExchangeWalletLabel[];
  asOf: string;
  truncated?: boolean;
}) {
  const { token, asOf } = input,
    address = input.address.toLowerCase();
  if (
    !evmChains[token.chain] ||
    tokenKey(token.chain, token.contract) !== token.id ||
    !isChainAddress(token.chain, token.contract) ||
    !isChainAddress(token.chain, address)
  )
    throw Error("EXACT_ALPHA_IDENTITY_REQUIRED");
  if (!Number.isFinite(Date.parse(asOf)))
    throw Error("INVALID_RESEARCH_CUTOFF");
  const labelsAt = (wallet: string, time: string) =>
    input.labels.filter(
      (l) =>
        l.chain === token.chain &&
        l.address.toLowerCase() === wallet &&
        validEvidenceLabel({ ...l, verified: true }, time, asOf),
    );
  const resolve = (wallet: string, time: string) => {
    const labels = labelsAt(wallet, time),
      exchanges = labels.filter((l) =>
        ["verified_exchange", "possible_exchange"].includes(l.role),
      );
    if (!exchanges.length) return { status: "unknown" as const, label: null };
    if (
      new Set(exchanges.map((l) => l.entity)).size !== 1 ||
      labels.some((l) =>
        ["DEX_pool", "router", "bridge", "burn"].includes(l.role),
      )
    )
      return { status: "conflicting" as const, label: null };
    const label =
      exchanges.find((l) => l.role === "verified_exchange" && l.verified) ??
      exchanges[0];
    return {
      status:
        label.role === "verified_exchange" && label.verified
          ? ("reviewed" as const)
          : ("provisional" as const),
      label,
    };
  };
  const rows = [
    ...new Map(
      input.transfers
        .filter(
          (t) =>
            t.chain === token.chain &&
            t.tokenId === token.id &&
            t.kind === "unknown_transfer" &&
            [t.from.toLowerCase(), t.to.toLowerCase()].includes(address) &&
            /^\d+$/.test(t.rawQuantity) &&
            BigInt(t.rawQuantity) > 0n &&
            [t.eventTime, t.availableAt].every((at) =>
              Number.isFinite(Date.parse(at)),
            ) &&
            Date.parse(t.availableAt) <= Date.parse(asOf) &&
            Date.parse(t.eventTime) <= Date.parse(asOf),
        )
        .map((t) => [`${t.chain}:${t.txHash}:${t.logIndex}`, t]),
    ).values(),
  ].toSorted(
    (a, b) =>
      a.blockNumber - b.blockNumber ||
      a.logIndex - b.logIndex ||
      a.txHash.localeCompare(b.txHash),
  );
  const events = rows.map((t) => {
    const incoming = t.to.toLowerCase() === address,
      counterparty = (incoming ? t.from : t.to).toLowerCase(),
      attribution = resolve(counterparty, t.eventTime),
      operationalWallet = resolve(address, t.eventTime).status !== "unknown";
    return {
      eventId: `${t.chain}:${t.txHash}:${t.logIndex}`,
      txHash: t.txHash,
      block: t.blockNumber,
      at: t.eventTime,
      availableAt: t.availableAt,
      counterparty,
      raw: t.rawQuantity,
      decimals: t.decimals,
      direction: operationalWallet
        ? "custody_routing"
        : incoming
          ? "received"
          : "sent",
      exchangeDirection:
        !operationalWallet && attribution.label
          ? incoming
            ? "exchange_withdrawal"
            : "exchange_deposit"
          : null,
      attribution: attribution.status,
      entity: attribution.label?.entity ?? null,
      source: attribution.label?.source ?? null,
      accountRole: attribution.label?.accountRole ?? "unknown",
      labelAvailableAt: attribution.label?.availableAt ?? null,
      labelKnownAtEvent:
        !!attribution.label &&
        Date.parse(attribution.label.availableAt) <= Date.parse(t.eventTime),
    };
  });
  const sum = (direction: string) =>
    events
      .filter(
        (e) =>
          e.attribution === "reviewed" && e.exchangeDirection === direction,
      )
      .reduce((n, e) => n + BigInt(e.raw), 0n);
  const reviewed = events.some(
    (e) => e.attribution === "reviewed" && e.exchangeDirection,
  );
  const lots = new Map<
      string,
      { event: (typeof events)[number]; remaining: bigint }[]
    >(),
    trips: {
      entity: string;
      withdrawal: string;
      deposit: string;
      matchedRaw: string;
    }[] = [];
  for (const event of events) {
    if (
      event.attribution !== "reviewed" ||
      !event.entity ||
      !event.exchangeDirection
    )
      continue;
    if (event.exchangeDirection === "exchange_withdrawal") {
      const queue = lots.get(event.entity) ?? [];
      queue.push({ event, remaining: BigInt(event.raw) });
      lots.set(event.entity, queue);
    } else {
      let remaining = BigInt(event.raw);
      for (const lot of lots.get(event.entity) ?? []) {
        if (!remaining) break;
        if (!lot.remaining || lot.event.txHash === event.txHash) continue;
        const matched = remaining < lot.remaining ? remaining : lot.remaining;
        remaining -= matched;
        lot.remaining -= matched;
        trips.push({
          entity: event.entity,
          withdrawal: lot.event.eventId,
          deposit: event.eventId,
          matchedRaw: matched.toString(),
        });
      }
    }
  }
  return {
    version: "wallet-exchange/1",
    tokenId: token.id,
    chain: token.chain,
    address,
    computedAt: asOf,
    coverage: input.truncated
      ? "truncated_sample"
      : "partial_observed_transfers",
    observedWithdrawalRaw: reviewed
      ? sum("exchange_withdrawal").toString()
      : null,
    observedDepositRaw: reviewed ? sum("exchange_deposit").toString() : null,
    observedNetReceivedRaw: reviewed
      ? (sum("exchange_withdrawal") - sum("exchange_deposit")).toString()
      : null,
    events,
    roundTrips: trips,
    distinctReturnTransactions: new Set(
      trips.map((t) => t.deposit.split(":").slice(0, 2).join(":")),
    ).size,
    costBasis: null,
    realizedProfit: null,
    retainedPurchaseRaw: null,
    caveats: [
      "Transfers are not purchases or sales; FIFO flow matching does not establish the same coins, ownership or intent",
      "Partial history cannot establish full balance retention or lifetime net acquisition",
      "Labels acquired later are retrospective context, never contemporaneous historical signals",
      "Budget mode cannot deliver real-time wallet alerts between collection windows",
    ],
  };
}
