import Decimal from "decimal.js";
import { z } from "zod";
import { tokenKey, hashResponse } from "./identity";
export const listingEventSchema = z
  .object({
    tokenId: z.string().regex(/^[a-f0-9]{32}$/),
    chain: z.string(),
    contract: z.string(),
    symbol: z.string(),
    alphaPair: z.string().regex(/^ALPHA_\d+[A-Z0-9]+$/),
    quoteAsset: z.enum(["USDT", "USDC"]),
    announcementAt: z.iso.datetime({ offset: true }),
    scheduledStartAt: z.iso.datetime({ offset: true }),
    alphaAdmissionAt: z.iso.datetime({ offset: true }),
    sourceUrl: z
      .url()
      .refine(
        (s) =>
          new URL(s).hostname === "www.binance.com" &&
          new URL(s).protocol === "https:",
      ),
    identitySource: z.url().refine((s) => new URL(s).protocol === "https:"),
    identitySourceHash: z.string().regex(/^[a-f0-9]{64}$/),
    membershipSource: z.url().refine((s) => new URL(s).protocol === "https:"),
    membershipProof: z.enum([
      "explicit_admission_time",
      "already_alpha_by_announcement",
    ]),
    revisedAt: z.iso.datetime({ offset: true }).nullable(),
    originalContentPreserved: z.boolean(),
    reviewedBy: z.string().min(1),
    caveats: z.array(z.string()).default([]),
  })
  .superRefine((v, ctx) => {
    if (
      tokenKey(v.chain, v.contract) !== v.tokenId ||
      Date.parse(v.announcementAt) > Date.parse(v.scheduledStartAt)
    )
      ctx.addIssue({
        code: "custom",
        message: "Exact identity and chronological announcement/start required",
      });
  });
export type ListingEvent = z.infer<typeof listingEventSchema>;
export type StudyCandle = {
  openAt: string;
  closeAt: string;
  availableAt: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  hash: string;
};
export const listingStudySpec = {
  version: "listing-study/1",
  horizonsHours: [1, 4, 24, 72, 168],
  reactionThresholdPct: 5,
  barMilliseconds: 60000,
  causationEstablished: false,
};
const millis = (s: string) => Date.parse(s);
const pct = (n: string, base: string) =>
  new Decimal(n).div(base).minus(1).mul(100).toFixed(6);
export function usableStudyCandles(rows: StudyCandle[], asOf: string) {
  const byOpen = new Map<string, StudyCandle>(),
    conflicts = new Set<string>();
  for (const r of rows) {
    if (
      ![r.openAt, r.closeAt, r.availableAt].every((s) =>
        Number.isFinite(millis(s)),
      ) ||
      millis(r.closeAt) >= millis(asOf) ||
      millis(r.availableAt) > millis(asOf) ||
      millis(r.closeAt) < millis(r.openAt) ||
      ![r.open, r.high, r.low, r.close, r.volume].every((s) =>
        /^\d+(\.\d+)?$/.test(s),
      ) ||
      !new Decimal(r.low).gt(0) ||
      new Decimal(r.high).lt(Decimal.max(r.open, r.close, r.low)) ||
      new Decimal(r.low).gt(Decimal.min(r.open, r.close, r.high))
    )
      continue;
    const old = byOpen.get(r.openAt);
    if (
      old &&
      ["open", "close", "high", "low", "volume"].some(
        (k) => old[k as keyof StudyCandle] !== r[k as keyof StudyCandle],
      )
    )
      conflicts.add(r.openAt);
    else if (!old || millis(r.availableAt) < millis(old.availableAt))
      byOpen.set(r.openAt, r);
  }
  return [...byOpen.values()]
    .filter((r) => !conflicts.has(r.openAt))
    .sort((a, b) => millis(a.openAt) - millis(b.openAt));
}
const usable = usableStudyCandles;
/** Retrospective price reaction, never an executable fill, past live signal or causal estimate. */
export function listingEventStudy(
  event: ListingEvent,
  series: {
    tokenId: string;
    symbol: string;
    quoteAsset: string;
    venue: "alpha" | "binance_futures";
    candles: StudyCandle[];
  }[],
  asOf: string,
) {
  listingEventSchema.parse(event);
  const alpha = usable(
    series
      .filter(
        (s) =>
          s.venue === "alpha" &&
          s.tokenId === event.tokenId &&
          s.symbol === event.alphaPair &&
          s.quoteAsset === event.quoteAsset,
      )
      .flatMap((s) => s.candles),
    asOf,
  );
  const futures = usable(
    series
      .filter(
        (s) =>
          s.venue === "binance_futures" &&
          s.tokenId === event.tokenId &&
          s.symbol === event.symbol &&
          s.quoteAsset === event.quoteAsset,
      )
      .flatMap((s) => s.candles),
    asOf,
  );
  const firstTradeBar = futures.find(
    (r) =>
      new Decimal(r.volume).gt(0) &&
      millis(r.openAt) >= millis(event.scheduledStartAt),
  );
  const actualStart =
    firstTradeBar &&
    millis(firstTradeBar.openAt) <= millis(event.scheduledStartAt) + 60000
      ? {
          earliest: firstTradeBar.openAt,
          latest: firstTradeBar.closeAt,
          precision:
            "First nonzero 1m Futures candle; exact first execution timestamp unavailable",
          sourceHash: firstTradeBar.hash,
        }
      : null;
  const before = (at: string) => {
    const row = alpha.filter((r) => millis(r.closeAt) < millis(at)).at(-1);
    return row && millis(at) - millis(row.closeAt) <= 60001 ? row : null;
  };
  const window = (anchor: string, end: string) => {
    const base = before(anchor),
      path = alpha.filter(
        (r) =>
          millis(r.openAt) >= millis(anchor) && millis(r.closeAt) < millis(end),
      );
    const membership = millis(event.alphaAdmissionAt) <= millis(anchor);
    const expected = (millis(end) - millis(anchor)) / 60000;
    const complete =
      !!base &&
      membership &&
      Number.isInteger(expected) &&
      path.length === expected &&
      path.every(
        (r, i) =>
          millis(r.openAt) === millis(anchor) + i * 60000 &&
          millis(r.closeAt) === millis(r.openAt) + 59999,
      );
    if (!complete)
      return {
        status: "unavailable",
        reason: !membership
          ? "Alpha membership not established before anchor"
          : !base
            ? "Missing exact pre-event Alpha price baseline"
            : "Missing, conflicting or incomplete minute candles",
        returnPct: null,
        mfePct: null,
        maePct: null,
        bars: path.length,
        expectedBars: expected,
      };
    const endPrice = path.at(-1)!.close,
      ret = pct(endPrice, base.close),
      mfe = pct(Decimal.max(...path.map((r) => r.high)).toFixed(), base.close),
      mae = pct(Decimal.min(...path.map((r) => r.low)).toFixed(), base.close);
    const t = listingStudySpec.reactionThresholdPct;
    const reaction =
      (new Decimal(mfe).gte(t) && new Decimal(ret).lte(-t)) ||
      (new Decimal(mae).lte(-t) && new Decimal(ret).gte(t))
        ? "reversed"
        : new Decimal(ret).lte(-t)
          ? "fell"
          : new Decimal(ret).gte(t)
            ? "rose"
            : "within_predeclared_band";
    return {
      status: "observed",
      reason:
        "Complete minute OHLC reconstruction; no executable bid/ask depth",
      returnPct: ret,
      mfePct: mfe,
      maePct: mae,
      bars: path.length,
      observedBaseVolume: path
        .reduce((n, r) => n.plus(r.volume), new Decimal(0))
        .toFixed(),
      expectedBars: expected,
      reaction,
      baselineClose: base.close,
      baselineAt: base.closeAt,
      endPrice,
      sourceHashes: [...new Set([base.hash, ...path.map((r) => r.hash)])],
    };
  };
  const phases = {
    beforeAnnouncement: before(event.announcementAt),
    announcementToTrading: window(event.announcementAt, event.scheduledStartAt),
    beforeTrading: before(event.scheduledStartAt),
    actualStart,
    horizons: listingStudySpec.horizonsHours.map((hours) => ({
      hours,
      ...(actualStart
        ? window(
            actualStart.earliest,
            new Date(
              millis(actualStart.earliest) + hours * 3600000,
            ).toISOString(),
          )
        : {
            status: "unavailable",
            reason: "Actual commencement not evidenced by first trade-bar data",
            returnPct: null,
            mfePct: null,
            maePct: null,
          }),
    })),
  };
  const manifest = {
    event,
    asOf,
    spec: listingStudySpec,
    series: series.map((s) => ({
      tokenId: s.tokenId,
      symbol: s.symbol,
      venue: s.venue,
      quoteAsset: s.quoteAsset,
      hashes: [...new Set(s.candles.map((r) => r.hash))].sort(),
    })),
  };
  return {
    runHash: hashResponse(JSON.stringify(manifest)),
    manifest,
    phases,
    stage: "historically_evaluated" as const,
    validatedStrategy: false,
    forwardTested: false,
    causationEstablished: false,
    originalAnnouncementContentVerified: event.originalContentPreserved,
    historicalDataDownloadedAfterEvent: alpha.some(
      (r) => millis(r.availableAt) > millis(event.scheduledStartAt),
    ),
    missingContext: [
      "Historical wallet/retention coverage",
      "Historical holder/liquidity changes",
      "Time-valid exchange labels and flows",
      "Historical OI outside provider retention",
      "Executable historical bid/ask/spread/gas evidence",
      "Matched market-condition and independent-token negative controls",
    ],
    suppression:
      "Descriptive event outcomes cannot validate a trading strategy. Current/revised announcement contents and later-downloaded observations cannot create a past Flownix signal.",
  };
}

/** Controls are selected before reading returns; missing/censored controls are retained. */
export function fixedWindowCohort(
  rows: { tokenId: string; membershipAt: string; candles: StudyCandle[] }[],
  setup: string,
  end: string,
  asOf: string,
) {
  return rows.map((r) => {
    const candles = usable(r.candles, asOf),
      base = candles.filter((c) => millis(c.closeAt) < millis(setup)).at(-1),
      last = candles.filter((c) => millis(c.closeAt) < millis(end)).at(-1);
    const path = candles.filter(
        (c) =>
          millis(c.openAt) >= millis(setup) && millis(c.closeAt) < millis(end),
      ),
      expected = (millis(end) - millis(setup)) / 3600000;
    const complete =
      Number.isInteger(expected) &&
      path.length === expected &&
      path.every(
        (c, i) =>
          millis(c.openAt) === millis(setup) + i * 3600000 &&
          millis(c.closeAt) === millis(c.openAt) + 3599999,
      );
    const valid =
      !!base &&
      !!last &&
      complete &&
      millis(r.membershipAt) <= millis(setup) &&
      millis(setup) - millis(base.closeAt) <= 3600001 &&
      millis(end) - millis(last.closeAt) <= 3600001;
    const move = valid ? pct(last!.close, base!.close) : null;
    const peak = valid
      ? pct(Decimal.max(...path.map((c) => c.high)).toFixed(), base!.close)
      : null;
    return {
      tokenId: r.tokenId,
      status: valid ? "retrospective_price_outcome" : "unavailable",
      returnPct: move,
      mfePct: peak,
      maePct: valid
        ? pct(Decimal.min(...path.map((c) => c.low)).toFixed(), base!.close)
        : null,
      coverageBars: path.length,
      expectedBars: expected,
      classification:
        "Fixed-window Alpha close return before costs; not an executable strategy outcome",
      confirmed2x: move !== null && new Decimal(move).gte(100),
      peak2xObserved: peak !== null && new Decimal(peak).gte(100),
      non2xPeakControl: peak !== null && new Decimal(peak).lt(100),
      control: move !== null && new Decimal(move).lt(100),
      featureKnowableAtSetup:
        !!base && millis(base.availableAt) <= millis(setup),
      signalVerified: false,
      executableOutcome: false,
    };
  });
}

/** Exploratory, two-sided listing hypothesis audit. Reuses reconstructed outcomes only. */
export function listingReactionAudit(
  studies: ReturnType<typeof listingEventStudy>[],
  cutoff: string,
) {
  if (!Number.isFinite(millis(cutoff)))
    throw Error("INVALID_CHRONOLOGICAL_CUTOFF");
  const examples = studies.map((s) => {
    const h = s.phases.horizons.find((h) => h.hours === 24);
    return {
      tokenId: s.manifest.event.tokenId,
      announcementGroup: s.manifest.event.sourceUrl,
      start: s.manifest.event.scheduledStartAt,
      returnPct: h?.returnPct ?? null,
      status: h?.status ?? "unavailable",
    };
  });
  const summarize = (rows: typeof examples) => {
    const observed = rows.filter(
      (r) => r.status === "observed" && r.returnPct !== null,
    );
    return {
      requested: rows.length,
      observed: observed.length,
      unavailable: rows.length - observed.length,
      independentAnnouncementGroups: new Set(
        observed.map((r) => r.announcementGroup),
      ).size,
      declinesAtLeast5Pct: observed.filter((r) =>
        new Decimal(r.returnPct!).lte(-5),
      ).length,
      counterexamples: observed.filter((r) => new Decimal(r.returnPct!).gt(-5))
        .length,
      cases: rows,
    };
  };
  return {
    stage: "historically_evaluated_hypothesis",
    hypothesis:
      "Every verified listing is followed by an Alpha close decline of at least 5% at 24h",
    exploratory: true,
    cutoff,
    training: summarize(
      examples.filter((r) => millis(r.start) + 24 * 3600000 <= millis(cutoff)),
    ),
    heldOut: summarize(
      examples.filter((r) => millis(r.start) >= millis(cutoff)),
    ),
    purgedAcrossCutoff: examples.filter(
      (r) =>
        millis(r.start) < millis(cutoff) &&
        millis(r.start) + 24 * 3600000 > millis(cutoff),
    ).length,
    validatedStrategy: false,
    forwardPaperTested: false,
    causationEstablished: false,
    costAssessment: {
      status: "unavailable",
      reason:
        "Historical executable spread, depth, fees and wallet/DEX continuity not established; raw price returns cannot be called net strategy returns",
    },
    suppression:
      "Small dependent cohort, amended/unarchived announcement bodies, no matched no-listing controls and no executable costs. The held-out split is chronological but does not establish validation; preserve missing cases and counterexamples.",
  };
}
