import { afterEach, expect, it, vi } from "vitest";
import {
  recentScanWindow,
  listingEventStudy,
  listingEventSchema,
  fixedWindowCohort,
  listingReactionAudit,
  tokenKey,
  HttpClient,
  installRequestPolicy,
  type StudyCandle,
} from "../src/index";
const contract = "0x" + "1".repeat(40),
  id = tokenKey("56", contract),
  start = "2025-09-26T12:30:00.000Z",
  asOf = "2026-11-23T00:00:00Z";
const event = {
  tokenId: id,
  chain: "56",
  contract,
  symbol: "TESTUSDT",
  alphaPair: "ALPHA_1USDT",
  quoteAsset: "USDT" as const,
  announcementAt: "2025-09-26T12:00:00Z",
  scheduledStartAt: start,
  alphaAdmissionAt: "2025-09-01T00:00:00Z",
  sourceUrl: "https://www.binance.com/en/support/announcement/detail/fixture",
  identitySource: "https://project.example/contract",
  identitySourceHash: "a".repeat(64),
  membershipSource:
    "https://www.binance.com/en/support/announcement/detail/fixture",
  membershipProof: "already_alpha_by_announcement" as const,
  revisedAt: null,
  originalContentPreserved: false,
  reviewedBy: "synthetic-test-only",
  caveats: [],
};
const bar = (n: number, price = "10"): StudyCandle => {
  const t = Date.parse(start) + n * 60000;
  return {
    openAt: new Date(t).toISOString(),
    closeAt: new Date(t + 59999).toISOString(),
    availableAt: asOf,
    open: price,
    close: price,
    high: price,
    low: price,
    volume: "1",
    hash: "b".repeat(64),
  };
};
const alpha = (rows: StudyCandle[]) => ({
  tokenId: id,
  symbol: event.alphaPair,
  quoteAsset: "USDT",
  venue: "alpha" as const,
  candles: rows,
});
const future = {
  tokenId: id,
  symbol: event.symbol,
  quoteAsset: "USDT",
  venue: "binance_futures" as const,
  candles: [bar(0)],
};
afterEach(() => {
  installRequestPolicy(undefined);
  vi.unstubAllEnvs();
});
it("plans near-head samples while explicitly preserving unknown skipped blocks", () => {
  expect(recentScanWindow(1000, 10, 100)).toEqual({
    from: 991,
    to: 1000,
    gap: { from: 101, to: 990 },
    coverage: "bounded_recent_sample",
  });
  expect(recentScanWindow(109, 10, 100).gap).toBeNull();
  expect(recentScanWindow(100, 10, null).from).toBe(91);
  expect(() => recentScanWindow(NaN, 10, 100)).toThrow();
});
it("refuses worker-environment calls without durable reservations before dispatch", async () => {
  vi.stubEnv("DATABASE_URL_WORKER", "fixture-only");
  const fetcher = vi.fn();
  await expect(
    new HttpClient(
      "fixture",
      60,
      async () => {},
      fetcher,
      async () => {},
    ).json("https://fixture.invalid", (x) => x),
  ).rejects.toMatchObject({ code: "DURABLE_REQUEST_POLICY_REQUIRED" });
  expect(fetcher).not.toHaveBeenCalled();
});
it("requires exact token, venue and instrument identity rather than matching tickers", () => {
  const rows = [bar(-1), ...Array.from({ length: 60 }, (_, n) => bar(n, "8"))];
  const good = listingEventStudy(event, [alpha(rows), future], asOf);
  expect(good.phases.horizons[0]).toMatchObject({
    returnPct: "-20.000000",
    reaction: "fell",
  });
  const wrong = listingEventStudy(
    event,
    [{ ...alpha(rows), tokenId: "f".repeat(32) }, future],
    asOf,
  );
  expect(wrong.phases.horizons[0].returnPct).toBeNull();
  expect(
    listingEventSchema.safeParse({ ...event, contract: "0x" + "2".repeat(40) })
      .success,
  ).toBe(false);
});
it("withholds a horizon with one missing, conflicting or incomplete minute bar", () => {
  const rows = [bar(-1), ...Array.from({ length: 60 }, (_, n) => bar(n))];
  expect(
    listingEventStudy(event, [alpha(rows.slice(0, -1)), future], asOf).phases
      .horizons[0].returnPct,
  ).toBeNull();
  expect(
    listingEventStudy(
      event,
      [alpha([...rows, { ...bar(20), close: "8", low: "8" }]), future],
      asOf,
    ).phases.horizons[0].returnPct,
  ).toBeNull();
});
it("does not invent an actual trading start from a scheduled or onboard date", () => {
  expect(
    listingEventStudy(event, [alpha([bar(-1), bar(0)])], asOf).phases
      .actualStart,
  ).toBeNull();
  expect(
    listingEventStudy(event, [{ ...future, candles: [bar(20)] }], asOf).phases
      .actualStart,
  ).toBeNull();
});
it("retains counterexamples, dependent announcements and unavailable held-out cases", () => {
  const candles = [
    bar(-1),
    ...Array.from({ length: 1440 }, (_, n) => bar(n, "12")),
  ];
  const first = listingEventStudy(event, [alpha(candles), future], asOf);
  const second = listingEventStudy(
    {
      ...event,
      tokenId: tokenKey("56", "0x" + "2".repeat(40)),
      contract: "0x" + "2".repeat(40),
    },
    [],
    asOf,
  );
  const third = listingEventStudy(
    {
      ...event,
      announcementAt: "2025-11-14T00:00:00Z",
      scheduledStartAt: "2025-11-14T01:00:00Z",
    },
    [],
    asOf,
  );
  const audit = listingReactionAudit(
    [first, second, third],
    "2025-11-01T00:00:00Z",
  );
  expect(audit.training).toMatchObject({
    requested: 2,
    observed: 1,
    unavailable: 1,
    counterexamples: 1,
    declinesAtLeast5Pct: 0,
    independentAnnouncementGroups: 1,
  });
  expect(audit.heldOut).toMatchObject({
    requested: 1,
    observed: 0,
    unavailable: 1,
  });
  expect(audit.validatedStrategy).toBe(false);
  expect(audit.costAssessment.status).toBe("unavailable");
});
it("separates Alpha admission, amended announcement and retrospective local knowledge", () => {
  const result = listingEventStudy(
    { ...event, alphaAdmissionAt: start, revisedAt: start },
    [alpha([bar(-1), ...Array.from({ length: 60 }, (_, n) => bar(n))]), future],
    asOf,
  );
  expect(result.phases.announcementToTrading.returnPct).toBeNull();
  expect(result.originalAnnouncementContentVerified).toBe(false);
  expect(result.historicalDataDownloadedAfterEvent).toBe(true);
  expect(result.validatedStrategy).toBe(false);
  const old = listingEventStudy(
    event,
    [alpha([bar(-1), bar(0)]), future],
    start,
  );
  expect(old.phases.beforeTrading).toBeNull();
});
it("keeps falls, rises, reversals and small reactions under the same predeclared band", () => {
  for (const [price, reaction] of [
    ["12", "rose"],
    ["10", "within_predeclared_band"],
    ["8", "fell"],
  ]) {
    const rows = [
      bar(-1),
      ...Array.from({ length: 60 }, (_, n) => bar(n, price)),
    ];
    expect(
      listingEventStudy(event, [alpha(rows), future], asOf).phases.horizons[0],
    ).toMatchObject({ reaction });
  }
  const rows = [
    bar(-1),
    ...Array.from({ length: 60 }, (_, n) => bar(n, n === 0 ? "12" : "8")),
  ];
  expect(
    listingEventStudy(event, [alpha(rows), future], asOf).phases.horizons[0],
  ).toMatchObject({ reaction: "reversed" });
});
it("retains losing controls and rejects unproved membership or late feature knowledge", () => {
  const end = new Date(Date.parse(start) + 3600000).toISOString();
  const base = {
      ...bar(-60),
      closeAt: new Date(Date.parse(start) - 1).toISOString(),
    },
    exit = {
      ...bar(0, "8"),
      high: "25",
      closeAt: new Date(Date.parse(end) - 1).toISOString(),
    };
  const rows = [
    {
      tokenId: id,
      membershipAt: "2025-01-01T00:00:00Z",
      candles: [base, exit],
    },
    {
      tokenId: "f".repeat(32),
      membershipAt: asOf,
      candles: [
        base,
        { ...exit, open: "30", close: "30", low: "30", high: "30" },
      ],
    },
  ];
  const result = fixedWindowCohort(rows, start, end, asOf);
  expect(result[0]).toMatchObject({
    control: true,
    confirmed2x: false,
    peak2xObserved: true,
    non2xPeakControl: false,
    returnPct: "-20.000000",
    featureKnowableAtSetup: false,
  });
  expect(result[1]).toMatchObject({
    status: "unavailable",
    confirmed2x: false,
  });
});
