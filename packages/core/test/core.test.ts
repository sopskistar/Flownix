import { describe, it, expect } from "vitest";
import fixture from "../../../tests/fixtures/alpha-doc-example.json";
import {
  parseRegistry,
  normalizeRegistry,
  eligiblePairs,
  tokenKey,
  contractIdentity,
  tokenUnits,
  decodeTransfer,
  TRANSFER_TOPIC,
  detectTransferActivity,
  defaultSignalConfig,
  observedAttributedExchangeFlow,
  localAccessAllowed,
  safeCsv,
  paidCallAllowed,
  freshness,
  accumulationPersistence,
  persistenceDefaults,
  simulateOutcome,
  defaultPaperAssumptions,
  chronologicalSplit,
  type Transfer,
  type TransferWindow,
} from "../src/index";
const zero = "0x" + "0".repeat(40),
  a = "0x" + "1".repeat(40),
  b = "0x" + "2".repeat(40),
  hash = "0x" + "a".repeat(64);
const now = "2026-11-15T12:00:00.000Z";
const transfer = (i = 0): Transfer => ({
  chain: "56",
  tokenId: "synthetic",
  txHash: "0x" + i.toString(16).padStart(64, "0"),
  logIndex: 0,
  blockNumber: 1300 + (i % 100),
  blockHash: hash,
  eventTime: now,
  from: a,
  to: b,
  rawQuantity: "1000000000000000001",
  decimals: 18,
  kind: "unknown_transfer",
  source: "synthetic:test-only",
  availableAt: now,
});
const window: TransferWindow = {
  fromBlock: 1300,
  toBlock: 1399,
  startTime: "2026-11-15T11:59:00.000Z",
  endTime: now,
  availableAt: now,
  complete: true,
  count: 30,
};
const baseline = Array.from({ length: 12 }, (_, i) => ({
  ...window,
  fromBlock: 100 + i * 100,
  toBlock: 199 + i * 100,
  startTime: "2026-11-15T11:00:00.000Z",
  endTime: "2026-11-15T11:58:00.000Z",
  count: 2,
}));
const signalInput = () => ({
  now,
  membershipFirstSeen: "2026-11-14T00:00:00.000Z",
  membershipStatus: "current",
  marketObservedAt: now,
  price: "0.05",
  quoteAsset: "USDT",
  liquidity: "1000000",
  transfers: Array.from({ length: 30 }, (_, i) => transfer(i)),
  window,
  baseline,
});
describe("Official documentation schema and Alpha-only identity", () => {
  it("maps alphaId, never tokenId or ticker concatenation", () => {
    const row = parseRegistry(fixture.registry)[0];
    expect(row.tokenId).not.toBe(row.alphaId);
    expect(eligiblePairs(row.alphaId, fixture.exchange.symbols)).toHaveLength(
      2,
    );
    expect(eligiblePairs(row.tokenId, fixture.exchange.symbols)).toEqual([]);
  });
  it("separates ticker collisions by chain/contract and preserves case-sensitive addresses", () => {
    expect(tokenKey("56", a)).not.toBe(tokenKey("1", a));
    expect(contractIdentity("solana", "AbC").contract).toBe("AbC");
    expect(tokenKey("56", "0x" + "A".repeat(40))).toBe(
      tokenKey("56", "0x" + "a".repeat(40)),
    );
  });
  it("deduplicates identical identities and rejects conflicting alpha IDs", () => {
    const e = parseRegistry(fixture.registry)[0];
    expect(normalizeRegistry([e, e])).toHaveLength(1);
    expect(() =>
      normalizeRegistry([e, { ...e, alphaId: "ALPHA_999" }]),
    ).toThrow("CONFLICTING");
  });
  it("keeps unknown status distinct from offline and no-pair metadata", () => {
    const e = parseRegistry(fixture.registry)[0];
    expect(normalizeRegistry([{ ...e, offline: undefined }])[0].status).toBe(
      "unknown",
    );
    expect(normalizeRegistry([{ ...e, offline: true }])[0].status).toBe(
      "offline",
    );
    expect(eligiblePairs("ALPHA_99", fixture.exchange.symbols)).toEqual([]);
  });
  it("processes 450 synthetic Alpha identities without admitting exchange symbols", () => {
    const e = parseRegistry(fixture.registry)[0];
    const rows = Array.from({ length: 450 }, (_, i) => ({
      ...e,
      contractAddress: "0x" + (i + 1).toString(16).padStart(40, "0"),
      alphaId: `ALPHA_${i}`,
    }));
    const registry = normalizeRegistry(rows);
    const symbols = [
      ...fixture.exchange.symbols,
      {
        baseAsset: "BTC",
        quoteAsset: "USDT",
        symbol: "BTCUSDT",
        status: "TRADING",
      },
    ];
    expect(registry).toHaveLength(450);
    expect(
      registry
        .flatMap((t) => eligiblePairs(t.alphaId, symbols))
        .every((s) => s.symbol.startsWith("ALPHA_")),
    ).toBe(true);
  });
  it("rejects empty provider responses before membership can be erased", () => {
    expect(() => parseRegistry({ code: "000000", data: [] })).toThrow();
    expect(() => parseRegistry({ code: "403", data: [] })).toThrow();
  });
});
describe("Ledger semantics", () => {
  const log = {
    address: a,
    topics: [
      TRANSFER_TOPIC,
      "0x" + a.slice(2).padStart(64, "0"),
      "0x" + b.slice(2).padStart(64, "0"),
    ],
    data: "0x" + (10n ** 30n + 1n).toString(16).padStart(64, "0"),
    blockNumber: "0x514",
    blockHash: hash,
    transactionHash: hash,
    logIndex: "0x0",
  };
  it("never treats transfers as buys; atomic quantities are exact", () => {
    const e = decodeTransfer(
      log,
      "56",
      "synthetic",
      18,
      now,
      "synthetic",
      now,
    )!;
    expect(e.kind).toBe("unknown_transfer");
    expect(e.rawQuantity).toBe("1000000000000000000000000000001");
    expect(tokenUnits(e.rawQuantity, 18)).toBe(
      "1000000000000.000000000000000001",
    );
  });
  it("handles removed logs, mints, burns and self-transfers separately", () => {
    expect(
      decodeTransfer(
        { ...log, removed: true },
        "56",
        "x",
        18,
        now,
        "test",
        now,
      ),
    ).toBeNull();
    const decode = (from: string, to: string) =>
      decodeTransfer(
        {
          ...log,
          topics: [
            TRANSFER_TOPIC,
            "0x" + from.slice(2).padStart(64, "0"),
            "0x" + to.slice(2).padStart(64, "0"),
          ],
        },
        "56",
        "x",
        18,
        now,
        "test",
        now,
      )!.kind;
    expect(decode(zero, b)).toBe("mint");
    expect(decode(a, zero)).toBe("burn");
    expect(decode(a, a)).toBe("self_transfer");
  });
  it("excludes same-entity transfers from attributed exchange flows", () => {
    const labels = new Map([
      [a, "exchange"],
      [b, "exchange"],
    ]);
    expect(
      observedAttributedExchangeFlow([transfer()], labels).netOutflow,
    ).toBe("0");
    expect(
      observedAttributedExchangeFlow([transfer()], new Map([[a, "exchange"]]))
        .coverage,
    ).toBe("partial");
  });
});
describe("Reproducible synthetic detection replay — not live proof", () => {
  it("emits a versioned evidence-backed transfer event with no opportunity score", () => {
    const r = detectTransferActivity(signalInput());
    expect(r.signal?.kind).toBe("UNUSUAL_TRANSFER_ACTIVITY");
    expect(r.signal?.evidence).toHaveLength(30);
    expect(r.signal?.opportunityScore).toBeNull();
    expect(r.signal?.firstDetectedAt).toBe(now);
  });
  it.each([
    "market",
    "scan",
    "incomplete",
    "baseline",
    "membership",
    "liquidity",
    "future",
  ] as const)("suppresses misleading alerts for %s gaps", (kind) => {
    const i = signalInput();
    if (kind === "market") i.marketObservedAt = "2025-01-01";
    if (kind === "scan") i.window = { ...window, endTime: "2025-01-01" };
    if (kind === "incomplete") i.window = { ...window, complete: false };
    if (kind === "baseline") i.baseline = [];
    if (kind === "membership") i.membershipFirstSeen = now;
    if (kind === "liquidity") i.liquidity = "1";
    if (kind === "future")
      i.transfers = i.transfers.map((t) => ({
        ...t,
        availableAt: "2027-01-01",
      }));
    expect(detectTransferActivity(i).signal).toBeNull();
  });
  it("deduplicates replayed event IDs and rejects low activity", () => {
    const i = signalInput();
    i.transfers = Array(30).fill(transfer());
    expect(detectTransferActivity(i).signal).toBeNull();
    expect(defaultSignalConfig.multiplier).toBe(3);
  });
});
describe("Long-term persistence", () => {
  it("missing purchase history stays unknown over 90 days", () => {
    const r = accumulationPersistence([], "2026-08-01", "2026-11-01", now);
    expect(r.state).toBe("INSUFFICIENT EVIDENCE");
    expect(r.netBuyUnits).toBeNull();
  });
  it("requires independent purchase evidence and retention", () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({
      day: new Date(Date.parse("2026-10-01") + i * 86400000)
        .toISOString()
        .slice(0, 10),
      availableAt: "2026-11-01",
      verifiedBuyUnits: "10",
      verifiedSellUnits: "1",
      retainedUnits: "9",
      independentBuyers: 4,
      complete: true,
      txIds: [`synthetic:${i}`],
    }));
    expect(
      accumulationPersistence(rows, "2026-10-01", "2026-10-31", now).state,
    ).toBe("SUSTAINED ACCUMULATION");
    expect(
      accumulationPersistence(
        rows.map((r) => ({ ...r, retainedUnits: null })),
        "2026-10-01",
        "2026-10-31",
        now,
      ).state,
    ).toBe("INSUFFICIENT EVIDENCE");
    expect(persistenceDefaults.minCoveredDays).toBe(14);
  });
});
describe("Security and statistical honesty", () => {
  it("local access fails closed for remote, forwarded and production requests", () => {
    expect(localAccessAllowed("127.0.0.1:3000", false, "local", false)).toBe(
      true,
    );
    for (const [host, forwarded, production] of [
      ["evil.com", false, false],
      ["localhost:3000", true, false],
      ["127.0.0.1:3000", false, true],
    ] as const)
      expect(localAccessAllowed(host, forwarded, "local", production)).toBe(
        false,
      );
  });
  it("guards paid calls, CSV formulas, stale and future observations", () => {
    expect(paidCallAllowed(false, "10", "0", "1")).toBe(false);
    expect(paidCallAllowed(true, "10", "9", "2")).toBe(false);
    expect(safeCsv("=cmd()")).toBe('"\'=cmd()"');
    expect(freshness("2027-01-01", Date.parse(now))).toBe("stale");
  });
  it("chronological split is explicit", () => {
    expect(
      chronologicalSplit(
        [{ at: "2026-01-01" }, { at: "2026-02-01" }],
        "2026-02-01",
      ).train,
    ).toHaveLength(1);
  });
  it("paper outcome is deterministic, uses costs and rejects lookahead", () => {
    const entry = {
      openAt: "2026-11-15T13:00:00Z",
      closeAt: "2026-11-15T13:59:59Z",
      availableAt: "2026-11-15T14:00:00Z",
      open: "1",
      high: "1.1",
      low: ".9",
      close: "1.05",
      volume: "100",
    };
    const exit = {
      ...entry,
      openAt: "2026-11-15T14:00:00Z",
      closeAt: "2026-11-15T14:59:59Z",
      availableAt: "2026-11-15T15:00:00Z",
      close: "1.1",
    };
    const input = {
      signalAt: now,
      membershipFirstSeen: "2026-11-14",
      entry,
      exit,
      path: [entry, exit],
      entryQuote: {
        bid: "0.99",
        bidQuantity: "1000000",
        ask: "1",
        askQuantity: "1000000",
        observedAt: entry.openAt,
        providerTime: entry.openAt,
        source: "synthetic-book-test-only",
        hash: "entry-fixture",
      },
      exitQuote: {
        bid: "1.1",
        bidQuantity: "1000000",
        ask: "1.11",
        askQuantity: "1000000",
        observedAt: exit.closeAt,
        providerTime: exit.closeAt,
        source: "synthetic-book-test-only",
        hash: "exit-fixture",
      },
      assumptions: defaultPaperAssumptions,
    };
    expect(() => simulateOutcome({ ...input, entryQuote: undefined })).toThrow(
      "quotes unavailable",
    );
    expect(simulateOutcome(input)).toEqual(simulateOutcome(input));
    expect(Number(simulateOutcome(input).netReturnPct)).toBeLessThan(10);
    expect(() =>
      simulateOutcome({ ...input, signalAt: "2026-11-15T13:00:00Z" }),
    ).toThrow("delay");
    expect(() =>
      simulateOutcome({ ...input, membershipFirstSeen: "2026-12-01" }),
    ).toThrow("Membership");
  });
});

describe("Long-term gaps and non-overlapping evidence", () => {
  it("does not carry an old purchase streak through missing recent days", () => {
    const rows = Array.from({ length: 29 }, (_, i) => ({
      day: new Date(Date.parse("2026-10-01") + i * 86400000)
        .toISOString()
        .slice(0, 10),
      availableAt: "2026-11-01",
      verifiedBuyUnits: "10",
      verifiedSellUnits: "1",
      retainedUnits: "9",
      independentBuyers: 4,
      complete: true,
      txIds: [`synthetic-lot:${i}`],
    }));
    const result = accumulationPersistence(
      rows,
      "2026-10-01",
      "2026-10-31",
      now,
    );
    expect(result.consecutiveNetBuyDays).toBe(0);
    expect(result.state).toBe("INSUFFICIENT EVIDENCE");
    expect(() =>
      accumulationPersistence(
        rows.map((r) => ({ ...r, txIds: ["duplicate-purchase"] })),
        "2026-10-01",
        "2026-10-31",
        now,
      ),
    ).toThrow("more than once");
  });
  it("suppresses a signal when prior scan windows have a missing range", () => {
    const input = signalInput();
    input.baseline = input.baseline.map((w, i) =>
      i === 3
        ? { ...w, fromBlock: w.fromBlock + 1, toBlock: w.toBlock + 1 }
        : w,
    );
    expect(detectTransferActivity(input).reason).toBe(
      "Baseline contains scan gaps",
    );
  });
});
