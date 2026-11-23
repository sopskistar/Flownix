import { it, expect } from "vitest";
import {
  historicalEpisodes,
  historicalFeatureCutoffs,
  matchHistoricalControls,
  researchPatternComparison,
  tokenKey,
  type HistoricalSeries,
  type StudyCandle,
  type ControlRiskRow,
} from "../src/index";
const start = Date.parse("2025-01-01T00:00:00Z"),
  HOUR = 3600000,
  asOf = "2026-11-23T00:00:00Z",
  contract = "0x" + "1".repeat(40),
  id = tokenKey("56", contract);
const bar = (i: number, price = "1"): StudyCandle => ({
  openAt: new Date(start + i * HOUR).toISOString(),
  closeAt: new Date(start + (i + 1) * HOUR - 1).toISOString(),
  availableAt: "2026-01-01T00:00:00Z",
  open: price,
  close: price,
  high: price,
  low: price,
  volume: "10",
  hash: "a".repeat(64),
});
const series = (rows: StudyCandle[]): HistoricalSeries => ({
  tokenId: id,
  chain: "56",
  contract,
  projectKey: "ALPHA_1",
  symbol: "ALPHA_1USDT",
  quoteAsset: "USDT",
  membershipAt: "2025-01-01T00:00:00Z",
  membershipSource: "https://example.com/synthetic-only",
  candles: rows,
});
const path = () =>
  Array.from({ length: 400 }, (_, i) =>
    bar(i, i === 168 ? "2" : i === 169 ? "4" : "1"),
  );
it("rejects contract, market and quote misidentification", () => {
  const s = series(path());
  expect(() =>
    historicalEpisodes({ ...s, contract: "0x" + "2".repeat(40) }, asOf),
  ).toThrow("IDENTITY");
  expect(() =>
    historicalEpisodes({ ...s, symbol: "ALPHA_2USDT" }, asOf),
  ).toThrow("IDENTITY");
  expect(() => historicalEpisodes({ ...s, quoteAsset: "USDC" }, asOf)).toThrow(
    "IDENTITY",
  );
});
it("freezes the first closed confirmation before reading later peaks", () => {
  const rows = path(),
    r = historicalEpisodes(series(rows), asOf),
    e = r.episodes.find((e) => e.definition === "rolling_7d_low")!;
  expect(e).toMatchObject({
    confirmedAt: rows[168].closeAt,
    referencePrice: "2",
    priorLow: "1",
    retrospectiveOnly: true,
    strategyValidated: false,
    coverage: "complete_fixed_7d",
  });
  const altered = rows.map((r, i) => (i === 169 ? { ...r, high: "1000" } : r)),
    next = historicalEpisodes(series(altered), asOf).episodes.find(
      (e) => e.definition === "rolling_7d_low",
    )!;
  expect(next.confirmedAt).toBe(e.confirmedAt);
  expect(next.referencePrice).toBe(e.referencePrice);
  expect(next.peak?.multipleFromConfirmation).toBe("500.000000");
  expect(r.landmarks.lifetimeAtlAthVerified).toBe(false);
  expect(r.launchToPeak.status).toBe("unavailable");
});
it("does not infer the order of a low and high inside one candle", () => {
  const rows = Array.from({ length: 200 }, (_, i) => bar(i));
  rows[168] = { ...rows[168], low: "0.1", high: "10" };
  const r = historicalEpisodes(series(rows), asOf);
  expect(
    r.episodes.some(
      (e) =>
        e.definition === "rolling_7d_low" &&
        e.confirmedAt === rows[168].closeAt,
    ),
  ).toBe(false);
  // A later closed-bar rebound can be a descriptive condition, but its entry
  // reference is the later close, never the retrospectively selected wick.
  expect(
    r.episodes.find((e) => e.definition === "rolling_7d_low")?.referencePrice,
  ).toBe("1");
  expect(r.landmarks.lowPrecedesHigh).toBe(false);
});
it("retains confirmation with a censored future but refuses a gapped lookback", () => {
  const rows = path();
  const beforeGap = historicalEpisodes(
    series(rows.filter((_, i) => i !== 50)),
    asOf,
  );
  expect(
    beforeGap.episodes.filter((e) => e.definition === "rolling_7d_low"),
  ).toHaveLength(0);
  const r = historicalEpisodes(
    series(rows.filter((_, i) => i !== 180)),
    asOf,
  ).episodes.find((e) => e.definition === "rolling_7d_low")!;
  expect(r.coverage).toBe("censored_or_gapped");
  expect(r.outcomes[0].returnPct).toBeNull();
});
it("does not hide an episode when historical Alpha admission is unproven", () => {
  const r = historicalEpisodes(
    { ...series(path()), membershipAt: "2026-11-16T00:00:00Z" },
    asOf,
  );
  expect(r.episodes[0].historicalAlphaEligibility).toBe(
    "unproven_before_membership_bound",
  );
  expect(r.episodes[0].strategyValidated).toBe(false);
  expect(
    historicalEpisodes(series(path()), "2025-02-01T00:00:00Z").episodes,
  ).toHaveLength(0);
});
it("keeps consolidation breakout distinct and permits later separate episodes", () => {
  const rows = Array.from({ length: 650 }, (_, i) =>
    bar(i, i === 168 ? "1.1" : i === 400 ? "2" : "1"),
  );
  const r = historicalEpisodes(series(rows), asOf);
  expect(
    r.episodes.find((e) => e.definition === "consolidation_breakout")
      ?.confirmedAt,
  ).toBe(rows[168].closeAt);
  const doubles = path();
  for (let i = 400; i < 650; i++) doubles.push(bar(i, i === 500 ? "2" : "1"));
  expect(
    historicalEpisodes(series(doubles), asOf).episodes.filter(
      (e) => e.definition === "rolling_7d_low",
    ),
  ).toHaveLength(2);
});
it("excludes late labels, future events, noncanonical evidence and unknown availability", () => {
  const at = "2026-11-01T00:00:00Z";
  const audit = historicalFeatureCutoffs(
    [
      {
        kind: "label",
        eventAt: "2026-01-01T00:00:00Z",
        availableAt: asOf,
        canonical: true,
        reference: "late",
      },
      {
        kind: "label",
        eventAt: "2026-01-01T00:00:00Z",
        availableAt: null,
        canonical: true,
        reference: "unknown",
      },
      {
        kind: "label",
        eventAt: asOf,
        availableAt: "2026-01-01T00:00:00Z",
        canonical: true,
        reference: "future",
      },
      {
        kind: "label",
        eventAt: "2026-01-01T00:00:00Z",
        availableAt: "2026-01-01T00:00:00Z",
        canonical: false,
        reference: "reorg",
      },
    ],
    at,
  );
  expect(audit.at(-1)?.kinds[0]).toMatchObject({
    knowable: 0,
    retrospectiveOnly: 1,
    unknownAvailability: 1,
  });
});
const risk = (
  id: string,
  extra: Partial<ControlRiskRow> = {},
): ControlRiskRow => ({
  tokenId: id,
  projectKey: id,
  chain: "56",
  quote: "USDT",
  anchor: "2026-11-01T00:00:00Z",
  membershipAt: "2026-10-01T00:00:00Z",
  membershipAvailableAt: "2026-10-01T00:00:00Z",
  liquidity: "100000",
  liquidityAvailableAt: "2026-10-31T00:00:00Z",
  coverage: "partial_observed",
  ...extra,
});
it("matches controls using as-of data without seeing future winner/loser labels", () => {
  const target = risk("a"),
    pool = [
      risk("b"),
      risk("c", { projectKey: "b" }),
      risk("d", { chain: "1" }),
      risk("e", { liquidityAvailableAt: asOf }),
      risk("f", { liquidity: null }),
      risk("g", { projectKey: "a" }),
      risk("h", { quote: "unknown" }),
    ];
  expect(
    matchHistoricalControls(target, pool).selected.map((r) => r.tokenId),
  ).toEqual(["b"]);
  expect(
    matchHistoricalControls(risk("a", { liquidity: null }), pool).selected,
  ).toHaveLength(0);
});
it("purges shared-project training episodes and embargoed labels", () => {
  const base = {
    tokenId: "a".repeat(32),
    projectKey: "same-project",
    membershipAvailableAt: "2025-01-01T00:00:00Z",
    featureAvailableAt: "2025-01-01T00:00:00Z",
    featurePresent: true,
    netReturnPct: "20",
    baselineNetReturnPct: "10",
    maxDrawdownPct: "-5",
    costsAndCoverageComplete: true,
  };
  const r = researchPatternComparison(
    [
      {
        ...base,
        setupAt: "2025-01-01T00:00:00Z",
        outcomeAvailableAt: "2025-01-03T00:00:00Z",
      },
      {
        ...base,
        tokenId: "b".repeat(32),
        setupAt: "2025-02-02T00:00:00Z",
        outcomeAvailableAt: "2025-02-03T00:00:00Z",
      },
      {
        ...base,
        tokenId: "c".repeat(32),
        projectKey: "independent",
        setupAt: "2025-01-29T00:00:00Z",
        outcomeAvailableAt: "2025-01-31T12:00:00Z",
      },
    ],
    "2025-02-01T00:00:00Z",
    asOf,
    [2, 3],
    1,
  );
  expect(r.purgedSharedProjectExamples).toBe(1);
  expect(r.purgedOverlappingOutcomes).toBe(1);
  expect(r.train.examples).toBe(0);
  expect(r.validated).toBe(false);
});
