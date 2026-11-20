import { describe, it, expect, vi } from "vitest";
import { readFile } from "node:fs/promises";
import {
  TRANSFER_TOPIC,
  signatureHash,
  PANCAKE_V3_SWAP,
  pancakeV3Factory,
  interpretPancakeSwap,
  purchaseRetentionLowerBound,
  abiWord,
  continuousLedger,
  walletResearch,
  exchangeResearch,
  possibleRoundTrips,
  dnsServers,
  networkErrorCode,
  HttpClient,
  parseRegistry,
  evaluateAccumulationThesis,
  logSchema,
  boundedResponseText,
  type PoolIdentity,
  type Transfer,
  type ResearchSwap,
} from "../src/index";
const address = (n: number) => "0x" + n.toString(16).padStart(40, "0"),
  hash = (n: number) => "0x" + n.toString(16).padStart(64, "0");
const actor = address(1),
  target = address(2),
  quote = address(3),
  poolAddress = address(4);
const pool: PoolIdentity = {
  chain: "56",
  address: poolAddress,
  factory: pancakeV3Factory,
  token0: target,
  token1: quote,
  fee: 2500,
  verifiedBlock: 100,
  proofHashes: [hash(9)],
};
const signed = (n: bigint) => abiWord(n < 0n ? (1n << 256n) + n : n);
const transferLog = (from: string, to: string, amount: bigint, index = 1) => ({
  address: target,
  topics: [
    TRANSFER_TOPIC,
    "0x" + from.slice(2).padStart(64, "0"),
    "0x" + to.slice(2).padStart(64, "0"),
  ],
  data: "0x" + abiWord(amount),
  blockNumber: "0x64",
  blockHash: hash(1),
  transactionHash: hash(2),
  logIndex: "0x" + index.toString(16),
});
const swapLog = (amount: bigint) => ({
  ...transferLog(poolAddress, actor, 1n, 2),
  address: poolAddress,
  topics: [PANCAKE_V3_SWAP, hash(8), "0x" + actor.slice(2).padStart(64, "0")],
  data:
    "0x" +
    signed(amount) +
    signed(amount < 0n ? 10n : -10n) +
    abiWord(1n) +
    abiWord(1n) +
    abiWord(0n) +
    abiWord(0n) +
    abiWord(0n),
});
const evidence = (quantity = "10", to = address(8), index = 0): Transfer => ({
  chain: "56",
  tokenId: "fixture",
  txHash: hash(20),
  logIndex: index,
  blockNumber: 101,
  blockHash: hash(1),
  eventTime: "2026-01-02T00:00:00.000Z",
  availableAt: "2026-01-02T00:01:00.000Z",
  from: actor,
  to,
  rawQuantity: quantity,
  decimals: 18,
  kind: "unknown_transfer",
  source: "synthetic-test-only",
});
describe("Passive on-chain trade interpretation", () => {
  it("uses Ethereum Keccak and the exact Pancake V3 event signature", () => {
    expect(signatureHash("Transfer(address,address,uint256)")).toBe(
      TRANSFER_TOPIC,
    );
    expect(PANCAKE_V3_SWAP).not.toBe(
      signatureHash(
        "Swap(address,address,int256,int256,uint160,uint128,int24)",
      ),
    );
  });
  it("attributes a purchase only when the receipt verifies direct target settlement", () => {
    const swap = swapLog(-100n),
      settlement = transferLog(poolAddress, actor, 100n);
    const receipt = {
      from: actor,
      transactionHash: hash(2),
      blockHash: hash(1),
      status: "0x1",
      logs: [settlement, swap],
    };
    expect(interpretPancakeSwap(pool, target, swap, receipt)).toMatchObject({
      side: "buy",
      actor,
      classification: "verified_swap_buy",
      rawQuantity: "100",
      rawQuote: "10",
    });
    expect(
      interpretPancakeSwap(pool, target, swap, {
        ...receipt,
        blockHash: hash(5),
      }),
    ).toBeNull();
    expect(
      interpretPancakeSwap(pool, target, swap, { ...receipt, status: "0x0" }),
    ).toBeNull();
    expect(
      interpretPancakeSwap(
        { ...pool, factory: address(99) },
        target,
        swap,
        receipt,
      ),
    ).toBeNull();
  });
  it("does not turn router recipients, fee discrepancies or ordinary transfers into wallet buys", () => {
    const swap = swapLog(-100n),
      receipt = {
        from: actor,
        transactionHash: hash(2),
        blockHash: hash(1),
        status: "0x1",
        logs: [transferLog(poolAddress, address(9), 100n), swap],
      };
    expect(interpretPancakeSwap(pool, target, swap, receipt)?.actor).toBeNull();
    expect(
      interpretPancakeSwap(pool, target, swap, {
        ...receipt,
        logs: [transferLog(poolAddress, actor, 90n), swap],
      })?.classification,
    ).toBe("verified_pool_swap_unattributed");
    expect(
      interpretPancakeSwap(
        pool,
        target,
        transferLog(poolAddress, actor, 100n),
        receipt,
      ),
    ).toBeNull();
    const sell = swapLog(50n),
      sellReceipt = {
        ...receipt,
        logs: [transferLog(actor, poolAddress, 50n), sell],
      };
    expect(interpretPancakeSwap(pool, target, sell, sellReceipt)).toMatchObject(
      { side: "sell", actor, classification: "verified_swap_sell" },
    );
  });
  it("uses all outgoing movements for conservative retention and never adds ordinary receipts", () => {
    const buys = [
      {
        eventId: "a",
        rawQuantity: "100000000000000000001",
        at: "2026-01-01T00:00:00.000Z",
      },
    ];
    const out = evidence("1"),
      incoming = {
        ...out,
        from: address(8),
        to: actor,
        rawQuantity: "999999999999999999999999",
        logIndex: 2,
      };
    expect(
      purchaseRetentionLowerBound(
        buys,
        [out, out, incoming],
        actor,
        "100000000000000000000",
        true,
      ).retainedRaw,
    ).toBe("100000000000000000000");
    expect(
      purchaseRetentionLowerBound(buys, [out], actor, "100", false).retainedRaw,
    ).toBeNull();
  });
});
describe("Long-term wallet and entity evidence", () => {
  it("does not resurrect an invalidated or unresolved distribution thesis from quiet-price inputs", () => {
    for (const state of ["THESIS INVALIDATED", "DISTRIBUTION RISK"] as const)
      expect(
        evaluateAccumulationThesis(state, thesis, "2026-02-01").state,
      ).toBe(state);
  });
  const thesis = {
    observedDays: 35,
    buyDays: 10,
    retainingAddresses: 3,
    retentionPct: 90,
    coverage: 1,
    marketFresh: true,
    membershipCurrent: true,
    priceChangePct: 0,
    verifiedDistribution: false,
    distributionEvidenceIds: [],
    independenceVerified: false,
    txIds: [hash(1)],
    availableAt: "2026-02-01",
  };
  it("preserves a supported multiweek thesis during flat prices and data outages", () => {
    expect(
      evaluateAccumulationThesis(
        "SUSTAINED ACCUMULATION",
        { ...thesis, marketFresh: false },
        "2026-02-01",
      ),
    ).toMatchObject({
      state: "SUSTAINED ACCUMULATION",
      confidence: "insufficient",
    });
    expect(
      evaluateAccumulationThesis("DISCOVERY", thesis, "2026-02-01"),
    ).toMatchObject({
      state: "SUSTAINED ACCUMULATION",
      confidence: "provisional",
    });
  });
  it("suppresses new bullish states for stale, future or incentive-like observations", () => {
    for (const override of [
      { marketFresh: false },
      { membershipCurrent: false },
      { availableAt: "2026-02-02" },
      { possibleIncentiveTrading: true },
    ])
      expect(
        evaluateAccumulationThesis(
          "DISCOVERY",
          { ...thesis, ...override },
          "2026-02-01",
        ).confidence,
      ).toBe("insufficient");
  });
  it("requires purchase and retention evidence beyond quiet price action", () => {
    for (const override of [
      { buyDays: 0 },
      { retentionPct: null },
      { retainingAddresses: 0 },
      { txIds: [] },
    ])
      expect(
        evaluateAccumulationThesis(
          "DISCOVERY",
          { ...thesis, ...override },
          "2026-02-01",
        ).state,
      ).toBe("INSUFFICIENT EVIDENCE");
  });
  it("distinguishes observed expansion and evidence-backed distribution from early accumulation", () => {
    expect(
      evaluateAccumulationThesis(
        "SUSTAINED ACCUMULATION",
        { ...thesis, priceChangePct: 80 },
        "2026-02-01",
      ).state,
    ).toBe("PRICE EXPANSION");
    expect(
      evaluateAccumulationThesis(
        "SUSTAINED ACCUMULATION",
        {
          ...thesis,
          verifiedDistribution: true,
          distributionEvidenceIds: [hash(2)],
        },
        "2026-02-01",
      ).state,
    ).toBe("DISTRIBUTION RISK");
  });
  it("accepts valid empty-data receipt logs without calling them ERC-20 transfers", () => {
    expect(
      logSchema.parse({ ...transferLog(actor, target, 1n), data: "0x" }).data,
    ).toBe("0x");
  });
  it("requires continuous known ledger windows and respects availability time", () => {
    const windows = [
      { from: 100, to: 150, complete: true, availableAt: "2026-01-01" },
      { from: 151, to: 200, complete: true, availableAt: "2026-01-02" },
    ];
    expect(continuousLedger(windows, 100, 200, "2026-01-03")).toBe(true);
    expect(continuousLedger(windows, 100, 200, "2026-01-01")).toBe(false);
    expect(
      continuousLedger(
        [{ ...windows[0], to: 149 }, windows[1]],
        100,
        200,
        "2026-01-03",
      ),
    ).toBe(false);
  });
  it("shows a missing 30-day balance delta as unknown and excludes future purchase knowledge", () => {
    const result = walletResearch({
      address: actor,
      start: "2026-01-01",
      end: "2026-01-31",
      asOf: "2026-01-31",
      balances: [
        {
          block: 100,
          blockHash: hash(1),
          raw: "999",
          at: "2026-01-30",
          availableAt: "2026-01-30",
        },
      ],
      transfers: [],
      windows: [],
      swaps: [
        {
          eventId: "future",
          actor,
          side: "buy",
          raw: "100",
          block: 100,
          at: "2026-01-30",
          availableAt: "2026-02-01",
          txHash: hash(2),
        },
      ],
    });
    expect(result.balanceDeltaRaw).toBeNull();
    expect(result.currentObservedBalanceRaw).toBe("999");
    expect(result.verifiedBuyRaw).toBeNull();
    expect(result.costBasis).toBeNull();
  });
  it("does not upgrade manual labels, counts internal transfers separately, and deduplicates", () => {
    const label = {
      address: actor,
      entity: "Exchange A",
      role: "verified_exchange",
      verified: true,
      source: "https://example.test/official-proof",
      validFrom: "2025-01-01",
      validTo: null,
      availableAt: "2025-01-01",
    };
    expect(
      exchangeResearch(
        [evidence()],
        [{ ...label, verified: false }],
        "2026-01-03",
      ).coverage,
    ).toBe("unavailable");
    expect(
      exchangeResearch(
        [evidence()],
        [{ ...label, availableAt: "2026-02-01" }],
        "2026-01-03",
      ).coverage,
    ).toBe("unavailable");
    const result = exchangeResearch(
      [evidence(), evidence(), evidence("5", address(9), 1)],
      [label, { ...label, address: address(9) }],
      "2026-01-03",
    );
    expect(result.entities[0]).toMatchObject({
      outflowRaw: "10",
      netExternalOutflowRaw: "10",
      excludedInternalRaw: "5",
    });
  });
  it("flags repeated verified round trips cautiously without double-counting split lots", () => {
    const rows: ResearchSwap[] = Array.from({ length: 3 }, (_, i) => [
      {
        eventId: `buy${i}`,
        actor,
        side: "buy" as const,
        raw: "10",
        block: 100 + i,
        at: `2026-01-01T0${i}:00:00.000Z`,
        availableAt: "2026-01-02",
        txHash: hash(i + 1),
      },
      {
        eventId: `sell${i}`,
        actor,
        side: "sell" as const,
        raw: "10",
        block: 110 + i,
        at: `2026-01-01T0${i}:05:00.000Z`,
        availableAt: "2026-01-02",
        txHash: hash(i + 11),
      },
    ]).flat();
    expect(possibleRoundTrips(rows, "2026-01-03").kind).toBe(
      "POSSIBLE_INCENTIVE_DRIVEN_TURNOVER",
    );
    const split = rows
      .filter((r) => r.side === "buy")
      .map((r) => ({ ...r, at: "2026-01-01T00:00:00.000Z" }));
    expect(
      possibleRoundTrips([...split, { ...rows[1], raw: "30" }], "2026-01-03")
        .kind,
    ).toBeNull();
  });
});
describe("Provider diagnostic safety", () => {
  it("bounds streamed response allocation before parsing large provider output", async () => {
    await expect(
      boundedResponseText(new Response("x".repeat(33)), 32),
    ).rejects.toMatchObject({ code: "RESPONSE_TOO_LARGE" });
    expect(await boundedResponseText(new Response('{"ok":true}'), 32)).toBe(
      '{"ok":true}',
    );
  });
  it("accepts only explicit DNS server IPs and returns secret-free nested codes", () => {
    expect(dnsServers("")).toEqual([]);
    expect(dnsServers("1.1.1.1, 8.8.8.8")).toHaveLength(2);
    expect(() => dnsServers("https://proxy.example.test/key-secret")).toThrow();
    expect(
      networkErrorCode(
        new Error("https://rpc/key-secret", {
          cause: Object.assign(Error("secret"), { code: "EAI_AGAIN" }),
        }),
      ),
    ).toBe("EAI_AGAIN");
    expect(networkErrorCode(new Error("STALE_MEMBERSHIP"))).toBe(
      "STALE_MEMBERSHIP",
    );
    expect(
      networkErrorCode(
        Object.assign(new Error("connect failed"), { code: "EHOSTUNREACH" }),
      ),
    ).toBe("EHOSTUNREACH");
    expect(
      networkErrorCode(new Error("https://provider.invalid/private-key")),
    ).toBe("NETWORK_OR_PARSE_ERROR");
  });
  it("does not retry a successful API when storing its audit fails", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('{"ok":true}'));
    const client = new HttpClient(
      "synthetic",
      120,
      async () => {
        throw Error("private-db-url");
      },
      fetcher,
      async () => {},
    );
    await expect(
      client.json("https://example.test", (x) => x),
    ).rejects.toMatchObject({ code: "AUDIT_PERSISTENCE_FAILED", status: 200 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("validates a dated real-provider sample as a fixture, never a production universe", async () => {
    const recorded = JSON.parse(
      await readFile("tests/fixtures/alpha-live-2026-11-16.json", "utf8"),
    );
    const rows = parseRegistry(recorded.response);
    expect(rows.length).toBeGreaterThan(0);
    expect(recorded.manifest.fixtureOnly).toBe(true);
    expect(recorded.manifest.parentResponseHash).toMatch(/^[a-f0-9]{64}$/);
    expect(new Set(rows.map((r) => r.chainId)).size).toBeGreaterThan(1);
  });
});
