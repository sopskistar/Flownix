import { z } from "zod";
import { depthSchema } from "./quotes";
import { hashResponse, contractIdentity, tokenKey } from "./identity";
import { providerFetch, networkErrorCode } from "./network";
import { countMetric, estimateAlchemyComputeUnits } from "./telemetry";
import { requestPolicy, requestWorkload } from "./request-policy";
export type Observation<T> = {
  data: T;
  source: string;
  observedAt: string;
  hash: string;
  raw: string;
  serverDate: string | null;
};
export type RequestAudit = {
  provider: string;
  at: string;
  status: number | null;
  ok: boolean;
  error: string | null;
  latencyMs: number;
  retryAfterSeconds?: number;
};
export class ProviderError extends Error {
  constructor(
    public code: string,
    public status: number | null = null,
    cause?: unknown,
    public retryAt?: Date,
  ) {
    super(code, { cause });
  }
}
export type Fetcher = typeof fetch;
/** Drain every read, including audit writes, before propagating a failure. */
export async function providerReads<T extends readonly unknown[] | []>(
  reads: T,
): Promise<{ -readonly [K in keyof T]: Awaited<T[K]> }> {
  const results = await Promise.allSettled(reads);
  return results.map((result) => {
    if (result.status === "rejected") throw result.reason;
    return result.value;
  }) as unknown as { -readonly [K in keyof T]: Awaited<T[K]> };
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let processRequestCount = 0;
const providerNextAt = new Map<string, number>();
export async function boundedResponseText(
  response: Response,
  maxBytes = 20_000_000,
) {
  if (!response.body) return "";
  const reader = response.body.getReader(),
    chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new ProviderError("RESPONSE_TOO_LARGE");
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, size).toString("utf8");
}
export class HttpClient {
  private nextAt = 0;
  constructor(
    public provider: string,
    private rpm = 30,
    private audit: (a: RequestAudit) => Promise<void> = async () => {},
    private fetcher: Fetcher = providerFetch,
    private sleep = wait,
    private maxAttempts = 3,
  ) {}
  private async record(audit: RequestAudit) {
    try {
      await this.audit(audit);
      await requestPolicy()?.complete(audit);
    } catch (cause) {
      throw new ProviderError("AUDIT_PERSISTENCE_FAILED", audit.status, cause);
    }
  }
  async json<T>(
    url: string,
    parse: (data: unknown) => T,
    init: RequestInit = {},
  ): Promise<Observation<T>> {
    for (let attempt = 0; attempt < this.maxAttempts; attempt++) {
      if (this.fetcher === providerFetch)
        this.nextAt = Math.max(
          this.nextAt,
          providerNextAt.get(this.provider) ?? 0,
        );
      const reservedAt = Math.max(Date.now(), this.nextAt);
      this.nextAt = reservedAt + 60000 / this.rpm;
      if (this.fetcher === providerFetch)
        providerNextAt.set(this.provider, this.nextAt);
      await this.sleep(Math.max(0, reservedAt - Date.now()));
      const at = new Date().toISOString();
      const budget = Number(process.env.PROVIDER_PROCESS_REQUEST_BUDGET ?? 0);
      if (budget > 0 && processRequestCount >= budget)
        throw new ProviderError("PROCESS_REQUEST_BUDGET_EXHAUSTED");
      const alchemyUsage = estimateAlchemyComputeUnits(
        url,
        typeof init.body === "string" ? init.body : undefined,
      );
      if (process.env.DATABASE_URL_WORKER && !requestPolicy())
        throw new ProviderError("DURABLE_REQUEST_POLICY_REQUIRED");
      await requestPolicy()?.reserve({
        provider: this.provider,
        alchemyRequests: alchemyUsage.requests,
        alchemyUnits: alchemyUsage.units,
        unpriced: alchemyUsage.unpriced,
        ...(requestWorkload() ? { workload: requestWorkload() } : {}),
      });
      processRequestCount++;
      countMetric(`requests:${this.provider}`);
      if (alchemyUsage.requests) {
        countMetric("alchemyRpcRequests", alchemyUsage.requests);
        countMetric("alchemyEstimatedComputeUnits", alchemyUsage.units);
        countMetric("alchemyUnpricedMethods", alchemyUsage.unpriced);
      }
      countMetric(
        "httpRequestBodyBytes",
        typeof init.body === "string" ? Buffer.byteLength(init.body) : 0,
      );
      const start = Date.now();
      let status: number | null = null;
      let retryAfterSeconds: number | undefined;
      try {
        const r = await this.fetcher(url, {
          ...init,
          redirect: "error",
          signal: AbortSignal.timeout(15000),
          headers: { Accept: "application/json", ...init.headers },
        });
        status = r.status;
        if (!r.ok) {
          const header = r.headers.get("retry-after");
          const retry =
            header && /^\d+$/.test(header)
              ? Number(header)
              : header
                ? Math.max(0, (Date.parse(header) - Date.now()) / 1000)
                : 0;
          retryAfterSeconds = Number.isFinite(retry)
            ? Math.min(86400, retry)
            : undefined;
          if (r.status === 429 && retry > 0)
            this.nextAt = Math.max(
              this.nextAt,
              Date.now() + Math.min(retry, 120) * 1000,
            );
          if (this.fetcher === providerFetch)
            providerNextAt.set(this.provider, this.nextAt);
          throw new ProviderError(`HTTP_${r.status}`, r.status);
        }
        const raw = await boundedResponseText(r);
        countMetric("httpResponseBodyBytes", Buffer.byteLength(raw));
        if (raw.length > 20_000_000)
          throw new ProviderError("RESPONSE_TOO_LARGE");
        const data = parse(JSON.parse(raw));
        await this.record({
          provider: this.provider,
          at,
          status,
          ok: true,
          error: null,
          latencyMs: Date.now() - start,
          retryAfterSeconds,
        });
        return {
          data,
          raw,
          source: url,
          hash: hashResponse(raw),
          observedAt: new Date().toISOString(),
          serverDate: r.headers.get("date"),
        };
      } catch (error) {
        countMetric(`requestErrors:${this.provider}`);
        if (
          error instanceof ProviderError &&
          error.code === "AUDIT_PERSISTENCE_FAILED"
        )
          throw error;
        // Never log URL or native fetch message: RPC URLs/Telegram paths can contain secrets.
        const code =
          error instanceof ProviderError
            ? error.code
            : error instanceof z.ZodError
              ? "SCHEMA_MISMATCH"
              : error instanceof SyntaxError
                ? "INVALID_JSON"
                : networkErrorCode(error);
        await this.record({
          provider: this.provider,
          at,
          status,
          ok: false,
          error: code,
          latencyMs: Date.now() - start,
          retryAfterSeconds,
        });
        if (
          attempt === this.maxAttempts - 1 ||
          code === "COLLECTION_STOPPED" ||
          /^(SOLANA_RPC_|RPC_)/.test(code) ||
          (status !== null && status < 500 && status !== 429)
        )
          throw new ProviderError(code, status);
        await this.sleep(
          Math.min(8000, 500 * 2 ** attempt + Math.random() * 300),
        );
      }
    }
    throw new ProviderError("RETRY_EXHAUSTED");
  }
}
const numericText = z
  .union([z.string(), z.number()])
  .transform(String)
  .nullable()
  .optional();
export const registryEntry = z
  .object({
    tokenId: z.string().min(1),
    alphaId: z
      .string()
      .regex(/^ALPHA_\d+$/)
      .nullish(),
    chainId: z.union([z.string(), z.number()]).transform(String),
    chainName: z.string(),
    contractAddress: z.string().min(1),
    symbol: z.string().min(1),
    name: z.string(),
    offline: z.boolean().optional(),
    decimals: z.coerce.number().int().min(0).max(255).optional(),
    listingTime: numericText,
    listingCex: z.boolean().optional(),
    price: numericText,
    percentChange24h: numericText,
    volume24h: numericText,
    marketCap: numericText,
    fdv: numericText,
    liquidity: numericText,
    holders: numericText,
  })
  .passthrough();
export type RegistryEntry = z.infer<typeof registryEntry>;
export const envelope =
  <T extends z.ZodType>(schema: T) =>
  (body: unknown): z.output<T> => {
    const e = z
      .object({ code: z.literal("000000"), success: z.boolean().optional() })
      .passthrough()
      .parse(body);
    if (e.success === false) throw new ProviderError("PROVIDER_REJECTED");
    return schema.parse(e.data);
  };
export const parseRegistry = envelope(z.array(registryEntry).min(1));
export const symbolSchema = z
  .object({
    symbol: z.string(),
    baseAsset: z.string(),
    quoteAsset: z.string(),
    status: z.string().optional(),
  })
  .passthrough();
export type MarketSymbol = z.infer<typeof symbolSchema>;
export const exchangeSchema = z
  .object({
    symbols: z.array(symbolSchema),
    rateLimits: z.array(z.unknown()).optional(),
    timezone: z.string().optional(),
    serverTime: z.number().optional(),
  })
  .passthrough();
export const tickerSchema = z
  .object({
    symbol: z.string(),
    lastPrice: z
      .string()
      .regex(/^\d+(\.\d+)?$/)
      .refine((v) => Number(v) > 0 && Number.isFinite(Number(v))),
    priceChangePercent: z.string().regex(/^-?\d+(\.\d+)?$/),
    volume: z.string().regex(/^\d+(\.\d+)?$/),
    quoteVolume: z.string().regex(/^\d+(\.\d+)?$/),
    closeTime: z.coerce.number().int().positive().max(8640000000000000),
  })
  .passthrough();
export const klineSchema = z.array(
  z.array(z.union([z.string(), z.number()])).min(7),
);
export const ALPHA_BASE = "https://www.binance.com";
export const REGISTRY_PATH =
  "/bapi/defi/v1/public/wallet-direct/buw/wallet/cex/alpha/all/token/list";
export class AlphaProvider {
  constructor(private http: HttpClient) {}
  registry() {
    return this.http.json(ALPHA_BASE + REGISTRY_PATH, parseRegistry);
  }
  exchange() {
    return this.http.json(
      ALPHA_BASE + "/bapi/defi/v1/public/alpha-trade/get-exchange-info",
      envelope(exchangeSchema),
    );
  }
  depth(symbol: string) {
    return this.http.json(
      this.url("fullDepth", { symbol, limit: "5" }),
      envelope(depthSchema),
    );
  }
  ticker(symbol: string) {
    return this.http.json(
      this.url("ticker", { symbol }),
      envelope(tickerSchema),
    );
  }
  klines(
    symbol: string,
    endTime?: number,
    startTime?: number,
    interval: "1h" | "1m" = "1h",
  ) {
    return this.http.json(
      this.url("klines", {
        symbol,
        interval,
        limit: "1500",
        ...(endTime ? { endTime: String(endTime) } : {}),
        ...(startTime ? { startTime: String(startTime) } : {}),
      }),
      envelope(klineSchema),
    );
  }
  private url(route: string, q: Record<string, string>) {
    if (!/^ALPHA_\d+[A-Z0-9]+$/.test(q.symbol))
      throw new ProviderError("INVALID_SYMBOL");
    return `${ALPHA_BASE}/bapi/defi/v1/public/alpha-trade/${route}?${new URLSearchParams(q)}`;
  }
}
export function normalizeRegistry(entries: RegistryEntry[]) {
  const out = new Map<
    string,
    RegistryEntry & { id: string; status: "current" | "offline" | "unknown" }
  >();
  for (const e of entries) {
    const i = contractIdentity(e.chainId, e.contractAddress);
    const id = tokenKey(i.chain, i.contract);
    const prior = out.get(id);
    if (prior && prior.alphaId !== e.alphaId)
      throw new ProviderError("CONFLICTING_ALPHA_ID");
    out.set(id, {
      ...e,
      chainId: i.chain,
      contractAddress: i.contract,
      id,
      status:
        e.offline === true
          ? "offline"
          : e.offline === false
            ? "current"
            : "unknown",
    });
  }
  return [...out.values()];
}
export function eligiblePairs(
  alphaId: string | null | undefined,
  symbols: MarketSymbol[],
) {
  return !alphaId
    ? []
    : symbols.filter(
        (s) =>
          s.baseAsset === alphaId &&
          s.symbol === `${alphaId}${s.quoteAsset}` &&
          (!s.status || ["TRADING", "1"].includes(s.status)),
      );
}
/** Deterministic market pair choice. Values remain quoted in their source asset. */
export function preferredAlphaPair(
  alphaId: string | null | undefined,
  symbols: MarketSymbol[],
) {
  const priority: Record<string, number> = { USDT: 0, USDC: 1, U: 2 };
  return (
    eligiblePairs(alphaId, symbols).sort(
      (a, b) =>
        (priority[a.quoteAsset] ?? 10) - (priority[b.quoteAsset] ?? 10) ||
        a.symbol.localeCompare(b.symbol),
    )[0] ?? null
  );
}
