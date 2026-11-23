import { expect, it } from "vitest";
import {
  supplyConcentration,
  concentrationChange,
  sharedTokenSources,
  synchronizedBuys,
  repeatedWalletPairs,
  volumeQuality,
  possibleRoundTrips,
  hypotheticalImpact,
  exactFuturesAssociation,
  derivativesContext,
  socialAttention,
  leadKnowableAt,
  researchLeadSchema,
  tokenKey,
  contractIdentity,
  isChainAddress,
  researchPatternComparison,
  futuresInstrumentSchema,
  futuresAssociationProofSchema,
  type HolderSnapshot,
  type ChainLabel,
  type Transfer,
  type ResearchSwap,
  type FuturesAssociation,
} from "../src/index";
const at = "2026-01-01T00:00:00.000Z",
  later = "2026-01-02T00:00:00.000Z";
const address = (n: number) => "0x" + n.toString(16).padStart(40, "0");
const hash = (n: number) => "0x" + n.toString(16).padStart(64, "0");
const snapshot: HolderSnapshot = {
  chain: "56",
  contract: address(1),
  checkpoint: "100",
  at,
  availableAt: at,
  totalRaw: "1000",
  circulatingRaw: null,
  coverage: "complete_holder_census",
  supplyVerified: true,
  source: "rpc:56",
  responseHashes: [hash(1)],
  holders: [
    { address: address(2), raw: "600", checkpoint: "100" },
    { address: address(3), raw: "400", checkpoint: "100" },
  ],
};
const label: ChainLabel = {
  chain: "56",
  address: address(2),
  entity: "Venue",
  role: "verified_exchange",
  verified: true,
  source: "https://venue.example/proof",
  validFrom: at,
  validTo: null,
  availableAt: at,
};
const transfer = (
  to: number,
  tokenId = tokenKey("56", address(1)),
  chain = "56",
): Transfer => ({
  chain,
  tokenId,
  txHash: hash(to),
  logIndex: 0,
  blockNumber: 100,
  blockHash: hash(1),
  eventTime: at,
  availableAt: at,
  from: address(2),
  to: address(to),
  rawQuantity: "10",
  decimals: 18,
  kind: "unknown_transfer",
  source: "synthetic-test-only",
});
const swap = (
  actor = address(3),
  side: "buy" | "sell" = "buy",
  id = 1,
): ResearchSwap => ({
  eventId: `56:${hash(id)}:${id}`,
  actor,
  side,
  raw: "100",
  block: 100 + id,
  at: new Date(Date.parse(at) + id * 1000).toISOString(),
  availableAt: new Date(Date.parse(at) + id * 1000).toISOString(),
  txHash: hash(id),
});

it("withholds percentages for samples, mixed checkpoints and unsupported chains", () => {
  expect(
    supplyConcentration({ ...snapshot, coverage: "observed_sample" }, [], later)
      .top,
  ).toBeNull();
  expect(
    supplyConcentration(
      {
        ...snapshot,
        holders: [...snapshot.holders, { ...snapshot.holders[0] }],
      },
      [],
      later,
    ).top,
  ).toBeNull();
  expect(
    supplyConcentration(
      {
        ...snapshot,
        holders: [
          { ...snapshot.holders[0], checkpoint: "99" },
          snapshot.holders[1],
        ],
      },
      [],
      later,
    ).top,
  ).toBeNull();
  expect(
    supplyConcentration({ ...snapshot, chain: "146" }, [], later).status,
  ).toBe("unavailable");
  expect(
    supplyConcentration({ ...snapshot, availableAt: later }, [], at).top,
  ).toBeNull();
});
it("computes exact reconciled concentration and avoids circulating-supply and label leakage", () => {
  const result = supplyConcentration(snapshot, [label], later);
  expect(result.top?.["10"]).toBe("100.000000");
  expect(result.excludedRaw).toBe("600");
  expect(result.unknownRaw).toBe("400");
  expect(
    supplyConcentration({ ...snapshot, circulatingRaw: "900" }, [label], later)
      .circulatingRaw,
  ).toBeNull();
  expect(
    supplyConcentration(snapshot, [{ ...label, availableAt: later }], at)
      .excludedRaw,
  ).toBe("0");
  expect(
    supplyConcentration(
      snapshot,
      [
        {
          ...label,
          availableAt: "2026-01-01T01:00:00+01:00",
          validFrom: "2026-01-01T01:00:00+01:00",
        },
      ],
      at,
    ).excludedRaw,
  ).toBe("600");
  expect(
    supplyConcentration(
      snapshot,
      [label, { ...label, entity: "Other", role: "verified_team/treasury" }],
      later,
    ).contradictions,
  ).not.toHaveLength(0);
  expect(
    supplyConcentration(snapshot, [{ ...label, chain: "1" }], later)
      .excludedRaw,
  ).toBe("0");
  expect(
    concentrationChange(
      { ...snapshot, contract: address(99) },
      { ...snapshot, at: later },
      [],
      later,
    ),
  ).toBeNull();
});
it("keeps shared token funding separate from ownership and excludes verified operational sources", () => {
  const rows = [transfer(3), transfer(4)];
  const edge = sharedTokenSources(rows, [], later).connections[0];
  expect(edge.commonOwnership).toBe(false);
  expect(edge.txIds).toHaveLength(2);
  expect(edge.rule).toBe("shared_token_source");
  for (const role of [
    "verified_exchange",
    "DEX_pool",
    "router",
    "burn",
    "vesting",
  ])
    expect(
      sharedTokenSources(rows, [{ ...label, role }], later).connections,
    ).toHaveLength(0);
  expect(
    sharedTokenSources(rows, [{ ...label, verified: false }], later)
      .connections,
  ).toHaveLength(1);
  expect(
    sharedTokenSources(rows, [{ ...label, availableAt: later }], at)
      .connections,
  ).toHaveLength(1);
  const both = [
    ...sharedTokenSources(rows, [], later).connections,
    ...sharedTokenSources(
      [
        transfer(3, tokenKey("56", address(8))),
        transfer(4, tokenKey("56", address(8))),
      ],
      [],
      later,
    ).connections,
  ];
  expect(repeatedWalletPairs(both)[0].tokenIds).toHaveLength(2);
  expect(
    sharedTokenSources([transfer(3), transfer(4), transfer(5)], [], later, 1)
      .truncated,
  ).toBe(true);
});
it("detects only observed verified-buy synchrony and retains alternative explanations", () => {
  const result = synchronizedBuys(
    "56",
    tokenKey("56", address(1)),
    [swap(), swap(address(4), "buy", 2)],
    [],
    later,
  );
  expect(result.connections[0].rule).toBe("synchronized_verified_buys");
  expect(result.connections[0].commonOwnership).toBe(false);
  expect(
    synchronizedBuys(
      "56",
      "token",
      [swap(), { ...swap(address(4), "buy", 2), raw: "1000" }],
      [],
      later,
    ).connections,
  ).toHaveLength(0);
});
it("gross buy/sell turnover cannot become retained buying or pooled repetition", () => {
  const rows = [swap(address(3), "buy", 1), swap(address(3), "sell", 2)];
  const result = volumeQuality(rows, address(3), later);
  expect(result.grossBuyRaw).toBe("100");
  expect(result.observedSwapNetRaw).toBe("0");
  expect(result.netPositionIncreaseRaw).toBeNull();
  expect(result.turnover.kind).toBeNull();
});
it("requires exact verified project-contract association for a futures instrument", () => {
  const id = tokenKey("56", address(1));
  const association: FuturesAssociation = {
    tokenId: id,
    chain: "56",
    contract: address(1),
    symbol: "SAMEUSDT",
    baseAsset: "SAME",
    contractType: "PERPETUAL",
    multiplier: "1",
    verified: true,
    tokenSource: "https://project.example/token",
    instrumentSource: "https://www.binance.com/en/support/announcement/proof",
    projectLinkSource:
      "https://www.binance.com/en/support/announcement/underlying-proof",
    verifiedAt: at,
    validFrom: at,
    validTo: null,
  };
  const instrument = {
    symbol: "SAMEUSDT",
    pair: "SAMEUSDT",
    baseAsset: "SAME",
    quoteAsset: "USDT",
    contractType: "PERPETUAL",
    status: "TRADING",
    onboardDate: Date.parse(at),
  };
  expect(
    exactFuturesAssociation(
      { id, chain: "56", contract: address(1) },
      association,
      instrument,
      later,
    ),
  ).toBe(true);
  expect(
    exactFuturesAssociation(
      { id: tokenKey("56", address(2)), chain: "56", contract: address(2) },
      association,
      instrument,
      later,
    ),
  ).toBe(false);
  expect(
    exactFuturesAssociation(
      { id, chain: "56", contract: address(1) },
      { ...association, verified: false },
      instrument,
      later,
    ),
  ).toBe(false);
  expect(
    exactFuturesAssociation(
      { id, chain: "56", contract: address(1) },
      { ...association, verifiedAt: later },
      instrument,
      at,
    ),
  ).toBe(false);
});
it("stale derivatives and manual social leads cannot supply a fresh feature", () => {
  expect(
    socialAttention(
      {
        completeCollection: true,
        verifiedIdentity: true,
        tokenId: "x",
        posts: [],
        start: at,
        end: "2026-01-01T00:00:05Z",
        collectedAt: "2026-01-01T00:00:10Z",
      },
      at,
    ).status,
  ).toBe("unavailable");
  expect(
    derivativesContext(
      [
        {
          symbol: "X",
          openInterest: "10",
          markPrice: "1",
          at,
          availableAt: at,
        },
      ],
      "X",
      later,
    ).status,
  ).toBe("unavailable");
  expect(
    socialAttention(
      {
        completeCollection: false,
        verifiedIdentity: true,
        tokenId: "x",
        posts: [],
        start: at,
        end: later,
        collectedAt: later,
      },
      later,
    ).mentions,
  ).toBeNull();
  expect(
    leadKnowableAt(
      { firstObservedAt: later, verifiedAt: later, publishedAt: at },
      at,
    ),
  ).toBe(false);
  expect(
    leadKnowableAt(
      { firstObservedAt: at, verifiedAt: null, publishedAt: at },
      later,
    ),
  ).toBe(false);
  expect(
    researchLeadSchema.safeParse({
      action: "research_lead",
      tokenId: "a".repeat(32),
      kind: "social",
      sourceUrl: "http://unsafe.example",
      body: "An unverified lead",
    }).success,
  ).toBe(false);
});
it("missing historical liquidity and V3 balances cannot imply executable constant-product depth", () => {
  const input = {
    kind: "constant_product" as const,
    baseRaw: "1000",
    quoteRaw: "1000",
    quoteOrderRaw: "100",
    observedAt: at,
    availableAt: at,
    identityVerified: true,
  };
  expect(hypotheticalImpact(input, at)?.averagePriceImpactPct).toBe(
    "10.000000",
  );
  expect(hypotheticalImpact({ ...input, observedAt: null }, at)).toBeNull();
  expect(
    hypotheticalImpact({ ...input, kind: "concentrated_liquidity" }, at),
  ).toBeNull();
  expect(hypotheticalImpact(input, later)).toBeNull();
});
it("retains case-sensitive Solana identities and rejects unsupported wallet networks", () => {
  const mint = "So11111111111111111111111111111111111111112";
  expect(contractIdentity("CT_501", mint).contract).toBe(mint);
  expect(isChainAddress("CT_501", mint)).toBe(true);
  expect(isChainAddress("146", address(1))).toBe(false);
});

it("accepts exact non-Latin Futures instruments and rejects empty source proof hashes", () => {
  const row = {
    symbol: "币安人生USDT",
    pair: "币安人生USDT",
    baseAsset: "币安人生",
    quoteAsset: "USDT",
    contractType: "PERPETUAL",
    status: "TRADING",
    onboardDate: 0,
  };
  expect(futuresInstrumentSchema.safeParse(row).success).toBe(true);
  expect(
    futuresInstrumentSchema.safeParse({ ...row, symbol: "X&symbol=BTCUSDT" })
      .success,
  ).toBe(false);
  expect(
    futuresAssociationProofSchema.shape.instrumentSourceHash.safeParse(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    ).success,
  ).toBe(false);
});

it("keeps historical winners, non-winners and later periods separate without promoting a hypothesis", () => {
  const row = {
    tokenId: "a".repeat(32),
    setupAt: at,
    membershipAvailableAt: at,
    featureAvailableAt: at,
    outcomeAvailableAt: later,
    featurePresent: true,
    netReturnPct: "150",
    baselineNetReturnPct: "100",
    maxDrawdownPct: "-30",
    costsAndCoverageComplete: true,
  };
  const result = researchPatternComparison(
    [
      row,
      { ...row, tokenId: "b".repeat(32), netReturnPct: "-20" },
      { ...row, tokenId: "c".repeat(32), featureAvailableAt: later },
    ],
    later,
    later,
  );
  expect(result.stage).toBe("candidate_hypothesis");
  expect(result.validated).toBe(false);
  expect(result.train.independentTokenExamples).toBe(2);
  expect(result.rejectedForCoverageOrTiming).toBe(1);
  expect(result.train.outcomes[0]).toMatchObject({
    multiple: 2,
    withFeature: 1,
    featureWithoutThisReturn: 1,
  });
  expect(result.unseenPeriod.examples).toBe(0);
});

it("purges training outcomes that overlap the unseen-period cutoff", () => {
  const result = researchPatternComparison(
    [
      {
        tokenId: "a".repeat(32),
        setupAt: at,
        membershipAvailableAt: at,
        featureAvailableAt: at,
        outcomeAvailableAt: later,
        featurePresent: true,
        netReturnPct: "150",
        baselineNetReturnPct: "100",
        maxDrawdownPct: "-30",
        costsAndCoverageComplete: true,
      },
    ],
    "2026-01-01T12:00:00Z",
    later,
  );
  expect(result.train.examples).toBe(0);
  expect(result.purgedOverlappingOutcomes).toBe(1);
});

it("does not pool unrelated one-off wallet round trips into repeated actor behavior", () => {
  const rows = [3, 4, 5].flatMap((n) => [
    swap(address(n), "buy", n * 2),
    swap(address(n), "sell", n * 2 + 1),
  ]);
  expect(possibleRoundTrips(rows, later).kind).toBeNull();
  expect(possibleRoundTrips(rows, later).repeatedActors).toEqual([]);
});
