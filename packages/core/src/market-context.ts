import Decimal from "decimal.js";
import { z } from "zod";
import { contractIdentity, freshness, tokenKey } from "./identity";
import { HttpClient, klineSchema } from "./providers";

export const futuresInstrumentSchema = z
  .object({
    symbol: z.string().regex(/^[\p{L}\p{N}_]{2,80}$/u),
    pair: z.string(),
    baseAsset: z.string(),
    quoteAsset: z.string(),
    contractType: z.string(),
    status: z.string(),
    onboardDate: z.number().int(),
  })
  .passthrough();
export type FuturesInstrument = z.infer<typeof futuresInstrumentSchema>;
export const futuresAssociationProofSchema = z.object({
  tokenId: z.string().regex(/^[a-f0-9]{32}$/),
  chain: z.string(),
  contract: z.string(),
  symbol: z.string().regex(/^[\p{L}\p{N}_]{2,80}$/u),
  baseAsset: z.string(),
  multiplier: z.string().regex(/^\d+(\.\d+)?$/),
  tokenSource: z.url(),
  instrumentSource: z.url(),
  projectLinkSource: z.url(),
  tokenSourceHash: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .refine(
      (s) =>
        s !==
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    ),
  instrumentSourceHash: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .refine(
      (s) =>
        s !==
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    ),
  rationale: z.string().min(50).max(5000),
  reviewedBy: z.string().min(1),
  independentlyVerified: z.literal(true),
});
export type FuturesAssociation = {
  tokenId: string;
  chain: string;
  contract: string;
  symbol: string;
  baseAsset: string;
  contractType: string;
  multiplier: string;
  verified: boolean;
  tokenSource: string;
  instrumentSource: string;
  projectLinkSource: string;
  verifiedAt: string;
  validFrom: string;
  validTo: string | null;
};
const https = (s: string) => {
  try {
    return new URL(s).protocol === "https:";
  } catch {
    return false;
  }
};
/** exchangeInfo has no token contract; an equal ticker alone must never bind a derivative. */
export function exactFuturesAssociation(
  token: { id: string; chain: string; contract: string },
  association: FuturesAssociation,
  instrument: FuturesInstrument,
  asOf: string,
) {
  return (
    association.verified &&
    token.id === tokenKey(token.chain, token.contract) &&
    association.tokenId === token.id &&
    association.chain === token.chain &&
    contractIdentity(token.chain, association.contract).contract ===
      contractIdentity(token.chain, token.contract).contract &&
    association.symbol === instrument.symbol &&
    association.baseAsset === instrument.baseAsset &&
    association.contractType === instrument.contractType &&
    instrument.status === "TRADING" &&
    https(association.tokenSource) &&
    https(association.instrumentSource) &&
    https(association.projectLinkSource) &&
    association.tokenSource !== association.instrumentSource &&
    /^\d+(\.\d+)?$/.test(association.multiplier) &&
    new Decimal(association.multiplier).isPositive() &&
    Number.isFinite(Date.parse(association.verifiedAt)) &&
    Date.parse(association.verifiedAt) <= Date.parse(asOf) &&
    Date.parse(association.validFrom) <= Date.parse(asOf) &&
    (!association.validTo ||
      Date.parse(asOf) < Date.parse(association.validTo)) &&
    instrument.onboardDate <= Date.parse(asOf)
  );
}
const textNumber = z.string().refine((v) => /^-?\d+(\.\d+)?$/.test(v));
export class FuturesProvider {
  constructor(private http: HttpClient) {}
  private read<T>(
    path: string,
    symbol: string | null,
    parse: (x: unknown) => T,
    extra: Record<string, string> = {},
  ) {
    if (symbol && !/^[\p{L}\p{N}_]{2,80}$/u.test(symbol))
      throw Error("INVALID_FUTURES_SYMBOL");
    return this.http.json(
      `https://fapi.binance.com${path}${symbol ? `?${new URLSearchParams({ symbol, ...extra })}` : ""}`,
      parse,
    );
  }
  exchange() {
    return this.read("/fapi/v1/exchangeInfo", null, (x) =>
      z
        .object({
          symbols: z.array(futuresInstrumentSchema),
          serverTime: z.number().optional(),
          rateLimits: z.array(z.unknown()).optional(),
        })
        .parse(x),
    );
  }
  openInterest(symbol: string) {
    return this.read("/fapi/v1/openInterest", symbol, (x) =>
      z
        .object({
          symbol: z.string(),
          openInterest: textNumber,
          time: z.number().int(),
        })
        .parse(x),
    );
  }
  premium(symbol: string) {
    return this.read("/fapi/v1/premiumIndex", symbol, (x) =>
      z
        .object({
          symbol: z.string(),
          markPrice: textNumber,
          indexPrice: textNumber,
          lastFundingRate: textNumber,
          nextFundingTime: z.number().int(),
          time: z.number().int(),
        })
        .parse(x),
    );
  }
  history(symbol: string) {
    return this.read(
      "/futures/data/openInterestHist",
      symbol,
      (x) =>
        z
          .array(
            z.object({
              symbol: z.string(),
              sumOpenInterest: textNumber,
              sumOpenInterestValue: textNumber,
              timestamp: z.number().int(),
            }),
          )
          .parse(x),
      { period: "1h", limit: "2" },
    );
  }
  ratio(symbol: string) {
    return this.read(
      "/futures/data/globalLongShortAccountRatio",
      symbol,
      (x) =>
        z
          .array(
            z.object({
              symbol: z.string(),
              longShortRatio: textNumber,
              longAccount: textNumber,
              shortAccount: textNumber,
              timestamp: z.number().int(),
            }),
          )
          .parse(x),
      { period: "1h", limit: "1" },
    );
  }
  ticker(symbol: string) {
    return this.read("/fapi/v1/ticker/24hr", symbol, (x) =>
      z
        .object({
          symbol: z.string(),
          quoteVolume: textNumber,
          priceChangePercent: textNumber,
          closeTime: z.number().int(),
        })
        .parse(x),
    );
  }
  candles(
    symbol: string,
    startTime: number,
    endTime: number,
    interval: "1m" | "1h" = "1m",
  ) {
    return this.read("/fapi/v1/klines", symbol, (x) => klineSchema.parse(x), {
      interval,
      startTime: String(startTime),
      endTime: String(endTime),
      limit: "1500",
    });
  }
  fundingHistory(symbol: string, startTime: number, endTime: number) {
    return this.read(
      "/fapi/v1/fundingRate",
      symbol,
      (x) =>
        z
          .array(
            z.object({
              symbol: z.literal(symbol),
              fundingTime: z.number().int().min(startTime).max(endTime),
              fundingRate: textNumber,
            }),
          )
          .parse(x),
      { startTime: String(startTime), endTime: String(endTime), limit: "1000" },
    );
  }
}
export function derivativesContext(
  rows: {
    symbol: string;
    openInterest: string;
    markPrice: string;
    at: string;
    availableAt: string;
  }[],
  symbol: string,
  asOf: string,
) {
  const eligible = rows
    .filter(
      (r) =>
        r.symbol === symbol &&
        Date.parse(r.at) <= Date.parse(asOf) &&
        Date.parse(r.availableAt) <= Date.parse(asOf),
    )
    .toSorted((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const latest = eligible.at(-1),
    previous = eligible.at(-2);
  if (
    !latest ||
    freshness(latest.at, Date.parse(asOf), 3600) !== "current" ||
    freshness(latest.availableAt, Date.parse(asOf), 3600) !== "current"
  )
    return {
      status: "unavailable",
      oiChangePct: null,
      priceChangePct: null,
      interpretation: "Missing or stale derivatives evidence",
    };
  if (
    !previous ||
    Date.parse(latest.at) - Date.parse(previous.at) > 7200000 ||
    !new Decimal(previous.openInterest).gt(0) ||
    !new Decimal(previous.markPrice).gt(0)
  )
    return {
      status: "partial",
      oiChangePct: null,
      priceChangePct: null,
      interpretation:
        "One current observation; comparable interval unavailable",
    };
  const oi = new Decimal(latest.openInterest)
      .div(previous.openInterest)
      .minus(1)
      .mul(100),
    price = new Decimal(latest.markPrice)
      .div(previous.markPrice)
      .minus(1)
      .mul(100);
  return {
    status: "observed",
    oiChangePct: oi.toFixed(6),
    priceChangePct: price.toFixed(6),
    interpretation: oi.gt(0)
      ? price.lt(0)
        ? "OI expansion with price weakness; new shorts, hedging, longs and arbitrage remain possible"
        : "OI expansion; direction and beneficial positioning are unknown"
      : "OI contraction; closing positions or liquidations are possible, liquidation causality is unverified",
  };
}

export function socialAttention(
  input: {
    completeCollection: boolean;
    verifiedIdentity: boolean;
    tokenId: string;
    posts: {
      tokenId: string;
      authorId: string;
      postId: string;
      publishedAt: string;
      availableAt: string;
      verified: boolean;
    }[];
    start: string;
    end: string;
    collectedAt: string;
  },
  asOf: string,
) {
  if (
    !input.completeCollection ||
    !input.verifiedIdentity ||
    ![input.start, input.end, input.collectedAt, asOf].every((at) =>
      Number.isFinite(Date.parse(at)),
    ) ||
    Date.parse(input.start) >= Date.parse(input.end) ||
    Date.parse(input.collectedAt) > Date.parse(asOf) ||
    Date.parse(input.end) > Date.parse(input.collectedAt) ||
    freshness(input.collectedAt, Date.parse(asOf), 3600) !== "current" ||
    Date.parse(input.end) > Date.parse(asOf)
  )
    return {
      status: "unavailable",
      mentions: null,
      distinctAuthors: null,
      reason:
        "Manual leads or stale/incomplete social collection cannot establish mention velocity",
    };
  const posts = [
    ...new Map(
      input.posts
        .filter(
          (p) =>
            p.verified &&
            p.tokenId === input.tokenId &&
            Date.parse(p.availableAt) <= Date.parse(asOf) &&
            Date.parse(p.publishedAt) >= Date.parse(input.start) &&
            Date.parse(p.publishedAt) < Date.parse(input.end),
        )
        .map((p) => [p.postId, p]),
    ).values(),
  ];
  return {
    status: "observed",
    mentions: posts.length,
    distinctAuthors: new Set(posts.map((p) => p.authorId)).size,
    reason:
      "Distinct platform author IDs, not independently controlled people; attention does not establish accumulation",
  };
}
