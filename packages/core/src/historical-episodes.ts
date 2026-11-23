import Decimal from "decimal.js";
import { hashResponse, tokenKey, evmChains, isEvmAddress } from "./identity";
import { usableStudyCandles, type StudyCandle } from "./listing-study";

const HOUR = 3600000,
  DAY = 24 * HOUR;
const ms = (s: string) => Date.parse(s);
const pct = (value: string, base: string) =>
  new Decimal(value).div(base).minus(1).mul(100).toFixed(6);
export const historicalEpisodeSpec = {
  version: "historical-episodes/1",
  interval: "1h",
  rollingDays: [7, 30],
  confirmationMultiple: "2",
  rearmBelowMultiple: "1.5",
  consolidationDays: 7,
  consolidationMaxRange: "1.15",
  breakoutMultiple: "1.05",
  episodeHorizonDays: 7,
  outcomeDays: [1, 3, 7, 14, 30, 60, 90],
  cutoffDays: [90, 60, 30, 14, 7, 3, 1],
  costsAndExecutableCoverageVerified: false,
} as const;
export type HistoricalSeries = {
  tokenId: string;
  chain: string;
  contract: string;
  projectKey: string;
  symbol: string;
  quoteAsset: string;
  membershipAt: string | null;
  membershipSource: string;
  launchAt?: string | null;
  candles: StudyCandle[];
};
export function assertHistoricalIdentity(s: HistoricalSeries) {
  if (
    tokenKey(s.chain, s.contract) !== s.tokenId ||
    !s.contract ||
    (Object.hasOwn(evmChains, s.chain) && !isEvmAddress(s.contract)) ||
    s.symbol !== `${s.projectKey}${s.quoteAsset}` ||
    !/^ALPHA_\d+(USDT|USDC)$/.test(s.symbol) ||
    !s.symbol.endsWith(s.quoteAsset) ||
    !s.projectKey ||
    !s.membershipSource ||
    (s.membershipAt !== null && !Number.isFinite(ms(s.membershipAt)))
  )
    throw Error("HISTORICAL_EXACT_IDENTITY_REQUIRED");
}
const complete = (rows: StudyCandle[], start: number, end: number) =>
  end > start &&
  rows.length === (end - start) / HOUR &&
  rows.every(
    (r, i) =>
      ms(r.openAt) === start + i * HOUR &&
      ms(r.closeAt) === start + (i + 1) * HOUR - 1,
  );
/** Hourly extrema do not establish the ordering of the high and low inside a candle. */
function drawdown(rows: StudyCandle[], initial: string) {
  let peak = new Decimal(initial),
    worst = new Decimal(0),
    closePeak = new Decimal(initial),
    closeWorst = new Decimal(0);
  for (const r of rows) {
    worst = Decimal.min(worst, new Decimal(r.low).div(peak).minus(1).mul(100));
    peak = Decimal.max(peak, r.high);
    closeWorst = Decimal.min(
      closeWorst,
      new Decimal(r.close).div(closePeak).minus(1).mul(100),
    );
    closePeak = Decimal.max(closePeak, r.close);
  }
  return {
    priorBarPeakToLowPct: worst.toFixed(6),
    sampledCloseToCloseMaxDrawdownPct: closeWorst.toFixed(6),
    intrabarOrderingKnown: false,
  };
}
function rollingBounds(rows: StudyCandle[], count: number) {
  const lows = rows.map((r) => new Decimal(r.low)),
    highs = rows.map((r) => new Decimal(r.high)),
    times = rows.map((r) => ms(r.openAt)),
    gaps = [0];
  for (let i = 1; i < rows.length; i++)
    gaps.push(gaps[i - 1] + Number(times[i] !== times[i - 1] + HOUR));
  const min: number[] = [],
    max: number[] = [],
    result: { min: number; max: number; complete: boolean }[] = [];
  let minHead = 0,
    maxHead = 0;
  for (let i = 1; i < rows.length; i++) {
    const j = i - 1;
    while (min.length > minHead && lows[min.at(-1)!].gt(lows[j])) min.pop();
    while (max.length > maxHead && highs[max.at(-1)!].lt(highs[j])) max.pop();
    min.push(j);
    max.push(j);
    while (minHead < min.length && min[minHead] < i - count) minHead++;
    while (maxHead < max.length && max[maxHead] < i - count) maxHead++;
    if (i >= count)
      result[i] = {
        min: min[minHead],
        max: max[maxHead],
        complete:
          times[i - count] === times[i] - count * HOUR &&
          gaps[i - 1] === gaps[i - count],
      };
  }
  return result;
}
export function historicalEpisodes(series: HistoricalSeries, asOf: string) {
  assertHistoricalIdentity(series);
  const rows = usableStudyCandles(series.candles, asOf).filter(
    (r) =>
      ms(r.closeAt) - ms(r.openAt) === HOUR - 1 && ms(r.openAt) % HOUR === 0,
  );
  const gaps = rows
    .slice(1)
    .filter((r, i) => ms(r.openAt) !== ms(rows[i].openAt) + HOUR).length;
  const low = rows.reduce<StudyCandle | null>(
      (a, r) => (!a || new Decimal(r.low).lt(a.low) ? r : a),
      null,
    ),
    high = rows.reduce<StudyCandle | null>(
      (a, r) => (!a || new Decimal(r.high).gt(a.high) ? r : a),
      null,
    );
  const landmarks = {
    definition: "observed_window_extrema",
    first: rows[0]?.openAt ?? null,
    last: rows.at(-1)?.closeAt ?? null,
    low: low ? { price: low.low, at: low.openAt } : null,
    high: high ? { price: high.high, at: high.openAt } : null,
    unorderedHighLowMultiple:
      low && high ? new Decimal(high.high).div(low.low).toFixed(6) : null,
    lowPrecedesHigh: low && high ? ms(low.closeAt) < ms(high.openAt) : null,
    bars: rows.length,
    gaps,
    lifetimeAtlAthVerified: false,
    executable: false,
  };
  const outcomes = (index: number) =>
    historicalEpisodeSpec.outcomeDays.map((days) => {
      const start = ms(rows[index].closeAt) + 1,
        end = start + days * DAY,
        path = rows.slice(index + 1).filter((r) => ms(r.openAt) < end);
      const ok = complete(path, start, end);
      return {
        days,
        status: ok ? "observed" : "censored_or_gapped",
        returnPct: ok ? pct(path.at(-1)!.close, rows[index].close) : null,
        maePct: ok
          ? pct(
              Decimal.min(...path.map((r) => r.low)).toFixed(),
              rows[index].close,
            )
          : null,
        bars: path.length,
        expectedBars: days * 24,
        sourceHashes: [...new Set(path.map((r) => r.hash))].sort(),
        outcomeAvailableAt: path.length
          ? new Date(
              Math.max(...path.map((r) => ms(r.availableAt))),
            ).toISOString()
          : null,
      };
    });
  const episodes = [];
  const bounds = new Map(
    [7, 30].map((days) => [days, rollingBounds(rows, days * 24)]),
  );
  for (const definition of [
    "rolling_7d_low",
    "rolling_30d_low",
    "consolidation_breakout",
  ] as const) {
    const lookback = definition === "rolling_30d_low" ? 30 : 7,
      count = lookback * 24;
    let armed = true,
      lastStart = -Infinity;
    for (let i = count; i < rows.length; i++) {
      const start = ms(rows[i].openAt),
        anchor = rows[i];
      const bound = bounds.get(lookback)![i];
      if (!bound?.complete) continue;
      const min = rows[bound.min],
        max = new Decimal(rows[bound.max].high),
        ratio = new Decimal(anchor.close).div(min.low);
      if (ratio.lt(historicalEpisodeSpec.rearmBelowMultiple)) armed = true;
      const confirms =
        definition === "consolidation_breakout"
          ? max.div(min.low).lte(historicalEpisodeSpec.consolidationMaxRange) &&
            new Decimal(anchor.close).gte(
              max.mul(historicalEpisodeSpec.breakoutMultiple),
            )
          : ratio.gte(historicalEpisodeSpec.confirmationMultiple);
      if (
        !armed ||
        !confirms ||
        start < lastStart + historicalEpisodeSpec.episodeHorizonDays * DAY
      )
        continue;
      armed = false;
      lastStart = start;
      const prior = rows.slice(i - count, i);
      const end = start + HOUR + historicalEpisodeSpec.episodeHorizonDays * DAY,
        path = rows.slice(i + 1).filter((r) => ms(r.openAt) < end),
        isComplete = complete(path, start + HOUR, end);
      const peak = path.reduce<StudyCandle | null>(
        (a, r) => (!a || new Decimal(r.high).gt(a.high) ? r : a),
        null,
      );
      const availableAt = new Date(
        Math.max(...[...prior, anchor].map((r) => ms(r.availableAt))),
      ).toISOString();
      const base = {
        tokenId: series.tokenId,
        projectKey: series.projectKey,
        chain: series.chain,
        contract: series.contract,
        market: series.symbol,
        quote: series.quoteAsset,
        definition,
        confirmedAt: anchor.closeAt,
        referencePrice: anchor.close,
        priorLow: min.low,
        priorLowAt: min.openAt,
        lookbackDays: lookback,
        availableAt,
        retrospectiveOnly: ms(availableAt) > ms(anchor.closeAt),
        historicalAlphaEligibility:
          series.membershipAt !== null &&
          ms(anchor.closeAt) >= ms(series.membershipAt)
            ? "documented_known_by_bound"
            : "unproven_before_membership_bound",
        membershipEvidence: {
          at: series.membershipAt,
          source: series.membershipSource,
        },
        peak: peak
          ? {
              price: peak.high,
              at: peak.openAt,
              multipleFromConfirmation: new Decimal(peak.high)
                .div(anchor.close)
                .toFixed(6),
              multipleFromPriorLow: new Decimal(peak.high)
                .div(min.low)
                .toFixed(6),
            }
          : null,
        coverage: isComplete ? "complete_fixed_7d" : "censored_or_gapped",
        drawdown: path.length ? drawdown(path, anchor.close) : null,
        outcomes: outcomes(i),
        sourceHashes: [
          ...new Set([...prior, anchor, ...path].map((r) => r.hash)),
        ].sort(),
        strategyValidated: false,
        executable: false,
      };
      episodes.push({
        episodeHash: hashResponse(JSON.stringify(base)),
        ...base,
      });
    }
  }
  const launchIndex = series.launchAt
    ? rows.findIndex((r) => r.openAt === series.launchAt)
    : -1;
  const launchToPeak =
    launchIndex < 0
      ? {
          status: "unavailable",
          reason:
            "Exact launch/first trading time and complete series not established",
        }
      : {
          status: "context_only",
          launchAt: series.launchAt,
          baseline: rows[launchIndex].open,
          coverageComplete: complete(
            rows.slice(launchIndex),
            ms(rows[launchIndex].openAt),
            ms(rows.at(-1)!.closeAt) + 1,
          ),
          peakMultiple: new Decimal(
            Decimal.max(...rows.slice(launchIndex).map((r) => r.high)),
          )
            .div(rows[launchIndex].open)
            .toFixed(6),
          executable: false,
        };
  return {
    identity: {
      tokenId: series.tokenId,
      chain: series.chain,
      contract: series.contract,
      projectKey: series.projectKey,
      market: series.symbol,
      quote: series.quoteAsset,
    },
    landmarks,
    launchToPeak,
    episodes,
    actualSignalOutcomes:
      "Existing signal_outcomes pipeline only; reconstructed confirmations never create signal_events",
    suppression:
      "Hourly highs/lows are not executable fills. Missing books, retained positions and contemporaneous labels prevent net strategy validation.",
  };
}

export type HistoricalObservation = {
  kind: string;
  eventAt: string;
  availableAt: string | null;
  canonical: boolean;
  reference: string;
};
export function historicalFeatureCutoffs(
  observations: HistoricalObservation[],
  confirmationAt: string,
) {
  return historicalEpisodeSpec.cutoffDays.map((days) => {
    const cutoff = new Date(ms(confirmationAt) - days * DAY).toISOString(),
      rows = observations.filter(
        (r) =>
          r.canonical &&
          Number.isFinite(ms(r.eventAt)) &&
          ms(r.eventAt) <= ms(cutoff),
      );
    return {
      days,
      cutoff,
      kinds: [...new Set(observations.map((r) => r.kind))]
        .sort()
        .map((kind) => ({
          kind,
          knowable: rows.filter(
            (r) => r.kind === kind && ms(r.availableAt ?? "") <= ms(cutoff),
          ).length,
          retrospectiveOnly: rows.filter(
            (r) => r.kind === kind && ms(r.availableAt ?? "") > ms(cutoff),
          ).length,
          unknownAvailability: rows.filter(
            (r) => r.kind === kind && !Number.isFinite(ms(r.availableAt ?? "")),
          ).length,
          referenceExamples: rows
            .filter((r) => r.kind === kind)
            .slice(0, 20)
            .map((r) => ({
              eventAt: r.eventAt,
              availableAt: r.availableAt,
              reference: r.reference,
            })),
          referencesTruncated: rows.filter((r) => r.kind === kind).length > 20,
        })),
      continuousAccumulationProven: false,
    };
  });
}
export type ControlRiskRow = {
  tokenId: string;
  projectKey: string;
  chain: string;
  quote: string;
  marketSymbol?: string;
  anchor: string;
  membershipAt: string;
  membershipAvailableAt: string;
  liquidity: string | null;
  liquidityAvailableAt: string | null;
  coverage: string;
};
/** Select without outcome access. Missing match features remain explicit exclusions. */
export function matchHistoricalControls(
  target: ControlRiskRow,
  pool: ControlRiskRow[],
  limit = 3,
) {
  const valid = (r: ControlRiskRow) =>
    ["USDT", "USDC"].includes(r.quote) &&
    Number.isFinite(ms(r.membershipAt)) &&
    ms(r.membershipAt) <= ms(r.anchor) &&
    ms(r.membershipAvailableAt) <= ms(r.anchor) &&
    r.liquidity !== null &&
    /^\d+(\.\d+)?$/.test(r.liquidity) &&
    new Decimal(r.liquidity).gt(0) &&
    r.liquidityAvailableAt !== null &&
    ms(r.liquidityAvailableAt) <= ms(r.anchor);
  const age = (r: ControlRiskRow) =>
      Math.floor((ms(r.anchor) - ms(r.membershipAt)) / DAY),
    bucket = (n: number) => (n < 7 ? 0 : n < 30 ? 1 : n < 90 ? 2 : 3);
  if (!valid(target))
    return {
      selected: [],
      suppressed: "Target lacks point-in-time membership/liquidity",
      excluded: pool.length,
    };
  const matched = pool.filter(
    (r) =>
      valid(r) &&
      r.projectKey !== target.projectKey &&
      r.chain === target.chain &&
      r.quote === target.quote &&
      r.anchor === target.anchor &&
      r.coverage === target.coverage &&
      bucket(age(r)) === bucket(age(target)) &&
      new Decimal(r.liquidity!).div(target.liquidity!).gte("0.5") &&
      new Decimal(r.liquidity!).div(target.liquidity!).lte("2"),
  );
  matched.sort(
    (a, b) =>
      new Decimal(a.liquidity!)
        .minus(target.liquidity!)
        .abs()
        .comparedTo(new Decimal(b.liquidity!).minus(target.liquidity!).abs()) ||
      Math.abs(age(a) - age(target)) - Math.abs(age(b) - age(target)) ||
      a.tokenId.localeCompare(b.tokenId),
  );
  const seen = new Set<string>();
  const selected = matched
    .filter((r) => {
      if (seen.has(r.projectKey)) return false;
      seen.add(r.projectKey);
      return true;
    })
    .slice(0, limit);
  return {
    selected,
    suppressed: selected.length
      ? null
      : "No comparable as-of risk-set observations",
    excluded: pool.length - matched.length,
    method:
      "Same UTC anchor/chain/quote/coverage, observation-age bucket, liquidity within 0.5–2x; nearest absolute liquidity then age then exact ID. No future return filter.",
  };
}
