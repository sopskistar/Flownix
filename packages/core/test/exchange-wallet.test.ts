import { it, expect } from "vitest";
import {
  tokenKey,
  TRANSFER_TOPIC,
  walletExchangeResearch,
  walletReceiptTransfers,
  exchangeLabelFromRow,
  type Transfer,
  type ExchangeWalletLabel,
} from "../src/index";
const address = (n: number) => "0x" + n.toString(16).padStart(40, "0"),
  hash = (n: number) => "0x" + n.toString(16).padStart(64, "0");
const token = {
    id: tokenKey("56", address(1)),
    chain: "56",
    contract: address(1),
  },
  wallet = address(2),
  exchange = address(3);
const label: ExchangeWalletLabel = {
  chain: "56",
  address: exchange,
  entity: "Fixture Exchange",
  role: "verified_exchange",
  verified: true,
  source: "https://fixture.invalid/official",
  validFrom: "2026-01-01T00:00:00.000Z",
  validTo: null,
  availableAt: "2026-01-01T00:00:00.000Z",
  accountRole: "operational",
};
const transfer = (n: number, incoming = true, raw = "100"): Transfer => ({
  chain: "56",
  tokenId: token.id,
  txHash: hash(n),
  logIndex: 0,
  blockNumber: n,
  blockHash: hash(n),
  eventTime: `2026-02-${String(n).padStart(2, "0")}T00:00:00.000Z`,
  availableAt: "2026-03-01T00:00:00.000Z",
  from: incoming ? exchange : wallet,
  to: incoming ? wallet : exchange,
  rawQuantity: raw,
  decimals: 18,
  kind: "unknown_transfer",
  source: "fixture-only",
});
const run = (
  transfers: Transfer[],
  labels = [label],
  asOf = "2026-04-01T00:00:00.000Z",
) =>
  walletExchangeResearch({ token, address: wallet, transfers, labels, asOf });
it("requires exact chain/contract IDs and ignores same-symbol identities and foreign networks", () => {
  expect(() =>
    walletExchangeResearch({
      token: { ...token, chain: "1" },
      address: wallet,
      transfers: [],
      labels: [],
      asOf: "2026-04-01T00:00:00Z",
    }),
  ).toThrow("EXACT_ALPHA");
  expect(
    run([
      { ...transfer(1), chain: "1" },
      { ...transfer(2), tokenId: tokenKey("56", address(99)) },
    ]).events,
  ).toHaveLength(0);
  expect(
    run([transfer(1)], [{ ...label, chain: "1" }]).observedWithdrawalRaw,
  ).toBeNull();
});
it("keeps unreviewed exchange attribution provisional and never calls transfers buys or sales", () => {
  const report = run(
    [transfer(1), transfer(2, false)],
    [{ ...label, verified: false }],
  );
  expect(report.observedWithdrawalRaw).toBeNull();
  expect(report.events[0].attribution).toBe("provisional");
  expect(report.events[0].exchangeDirection).toBe("exchange_withdrawal");
  expect(report.realizedProfit).toBeNull();
  expect(report.retainedPurchaseRaw).toBeNull();
  expect(report.roundTrips).toEqual([]);
});
it("does not leak later labels into historical cutoffs and marks retrospective associations", () => {
  const later = { ...label, availableAt: "2026-03-15T00:00:00.000Z" };
  expect(
    run([transfer(1)], [later], "2026-03-10T00:00:00.000Z")
      .observedWithdrawalRaw,
  ).toBeNull();
  expect(run([transfer(1)], [later]).events[0].labelKnownAtEvent).toBe(false);
  expect(
    run([transfer(1)], [{ ...label, validTo: "2026-02-01T00:00:00.000Z" }])
      .observedWithdrawalRaw,
  ).toBeNull();
});
it("suppresses conflicting labels, pool/router roles and known exchange operational routing", () => {
  for (const other of [
    { ...label, entity: "Other Exchange" },
    { ...label, role: "DEX_pool" },
    { ...label, role: "router" },
  ]) {
    const report = run([transfer(1)], [label, other]);
    expect(report.events[0].attribution).toBe("conflicting");
    expect(report.observedWithdrawalRaw).toBeNull();
  }
  const report = run([transfer(1)], [label, { ...label, address: wallet }]);
  expect(report.events[0].direction).toBe("custody_routing");
  expect(report.observedWithdrawalRaw).toBeNull();
});
it("matches repeated exchange returns without reusing lots or treating split lots as extra transactions", () => {
  const report = run([
    transfer(1),
    transfer(2, false, "80"),
    transfer(3, false, "80"),
    transfer(4, true, "50"),
    transfer(5, false, "50"),
    transfer(1),
  ]);
  expect(report.observedWithdrawalRaw).toBe("150");
  expect(report.observedDepositRaw).toBe("210");
  expect(report.observedNetReceivedRaw).toBe("-60");
  expect(report.roundTrips.map((t) => t.matchedRaw)).toEqual([
    "80",
    "20",
    "50",
  ]);
  expect(report.distinctReturnTransactions).toBe(3);
  expect(report.realizedProfit).toBeNull();
});
it("does not match same-transaction routing or transfers to different exchanges as a return", () => {
  const sell = { ...transfer(2, false), txHash: transfer(1).txHash };
  expect(run([transfer(1), sell]).roundTrips).toHaveLength(0);
  const other = { ...label, address: address(4), entity: "Other Exchange" };
  expect(
    run(
      [transfer(1), { ...transfer(2, false), to: address(4) }],
      [label, other],
    ).roundTrips,
  ).toHaveLength(0);
});
it("retains unavailable/partial coverage and omits unavailable transfers, mint and self movements", () => {
  const report = walletExchangeResearch({
    token,
    address: wallet,
    labels: [label],
    asOf: "2026-04-01T00:00:00Z",
    truncated: true,
    transfers: [
      { ...transfer(1), kind: "mint" },
      { ...transfer(2), availableAt: "2027-01-01T00:00:00Z" },
    ],
  });
  expect(report.coverage).toBe("truncated_sample");
  expect(report.observedWithdrawalRaw).toBeNull();
  expect(report.events).toEqual([]);
});
it("maps legacy/versioned labels without promoting a manually selected verified role", () => {
  const row = {
    chain_id: "56",
    address: exchange,
    entity: "Exchange",
    role: "verified_exchange",
    source_url: label.source,
    confidence: "manual — independently unverified",
    reviewed_by: "reviewer",
    valid_from: label.validFrom,
    created_at: label.availableAt,
    notes: "null",
  };
  expect(exchangeLabelFromRow(row).verified).toBe(false);
  expect(exchangeLabelFromRow(row).accountRole).toBe("unknown");
  expect(
    exchangeLabelFromRow({
      ...row,
      notes: JSON.stringify({ accountRole: "deposit" }),
    }).accountRole,
  ).toBe("deposit");
});
it("verifies receipt canonicality, exact log contract and wallet involvement", () => {
  const log = {
    address: token.contract,
    blockHash: hash(1),
    blockNumber: "0x1",
    transactionHash: hash(2),
    logIndex: "0x0",
    data: hash(100),
    topics: [TRANSFER_TOPIC, hash(3), hash(2)],
  };
  const input = {
    token,
    address: wallet,
    txHash: hash(2),
    decimals: 18,
    availableAt: "2026-03-01T00:00:00Z",
    receipt: {
      transactionHash: hash(2),
      status: "0x1",
      blockHash: hash(1),
      blockNumber: "0x1",
      logs: [log],
    },
    header: { hash: hash(1), number: "0x1", timestamp: "0x1" },
  };
  expect(walletReceiptTransfers(input)[0].rawQuantity).toBe("100");
  expect(
    walletReceiptTransfers({
      ...input,
      receipt: { ...input.receipt, logs: [{ ...log, address: address(99) }] },
    }),
  ).toEqual([]);
  expect(() =>
    walletReceiptTransfers({
      ...input,
      header: { ...input.header, hash: hash(99) },
    }),
  ).toThrow("NONCANONICAL");
  expect(() =>
    walletReceiptTransfers({
      ...input,
      receipt: {
        ...input.receipt,
        logs: [{ ...log, transactionHash: hash(99) }],
      },
    }),
  ).toThrow("LOG_MISMATCH");
});
