import { Resolver } from "node:dns/promises";
import { isIP, type LookupFunction } from "node:net";
import { Agent } from "undici";

let cached: { key: string; agent: Agent } | undefined;
const shutdown = new AbortController();
export function stopProviderRequests() {
  shutdown.abort();
}
export function dnsServers(value = process.env.PROVIDER_DNS_SERVERS ?? "") {
  const servers = value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (servers.length > 3 || servers.some((s) => !isIP(s)))
    throw new Error("INVALID_PROVIDER_DNS_SERVERS");
  return servers;
}
export function providerLookup(
  servers = dnsServers(),
): LookupFunction | undefined {
  if (!servers.length) return undefined;
  const resolver = new Resolver({ timeout: 3000, tries: 2 });
  resolver.setServers(servers);
  const lookup: LookupFunction = (hostname, options, callback) => {
    if (isIP(hostname)) {
      callback(null, hostname, isIP(hostname));
      return;
    }
    resolver.resolve4(hostname).then(
      (addresses) => {
        if (!addresses.length)
          return callback(
            Object.assign(new Error("DNS_NO_ANSWER"), { code: "ENODATA" }),
            "",
            4,
          );
        if (options.all) {
          const all = callback as unknown as (
            error: Error | null,
            addresses: { address: string; family: number }[],
          ) => void;
          all(
            null,
            addresses.map((address) => ({ address, family: 4 })),
          );
        } else callback(null, addresses[0], 4);
      },
      (error: Error) => callback(error, "", 4),
    );
  };
  return lookup;
}
// Optional process-local DNS repair only. No proxy, IP pinning, TLS bypass or origin rewrite.
export function providerDispatcher() {
  const servers = dnsServers();
  if (!servers.length) return undefined;
  const key = servers.join(",");
  if (cached?.key === key) return cached.agent;
  if (cached) void cached.agent.close();
  const lookup = providerLookup(servers);
  const agent = new Agent({
    connections: 2,
    pipelining: 1,
    maxResponseSize: 20_000_000,
    connect: {
      lookup,
      family: 4,
      autoSelectFamily: false,
      rejectUnauthorized: true,
    },
  });
  cached = { key, agent };
  return agent;
}
export const providerFetch: typeof fetch = (input, init) => {
  const cancelled = () =>
    Object.assign(new Error("COLLECTION_STOPPED"), {
      code: "COLLECTION_STOPPED",
    });
  if (shutdown.signal.aborted) return Promise.reject(cancelled());
  const dispatcher = providerDispatcher();
  const options: RequestInit & { dispatcher?: Agent } = {
    ...init,
    signal: init?.signal
      ? AbortSignal.any([init.signal, shutdown.signal])
      : shutdown.signal,
    ...(dispatcher ? { dispatcher } : {}),
  };
  return fetch(input, options).catch((error) => {
    throw shutdown.signal.aborted ? cancelled() : error;
  });
};
export async function closeProviderNetwork() {
  if (cached) await cached.agent.close();
  cached = undefined;
}

// Error codes only: never persist native messages, URL paths, query strings or credentials.
export function networkErrorCode(error: unknown): string {
  const safeApplicationCodes = new Set([
    "STALE_MEMBERSHIP",
    "INVALID_SCAN_WINDOW",
    "NO_CONTRACT_CODE",
    "LOG_CONTRACT_MISMATCH",
    "LOG_RANGE_MISMATCH",
    "REORG_DURING_SCAN",
    "CONFLICTING_EVENT_REPLAY",
    "SYMBOL_RESPONSE_MISMATCH",
    "DEPTH_SYMBOL_MISMATCH",
    "INVALID_CANDLE",
    "NOT_SOLANA_ALPHA_TOKEN",
    "INVALID_JOB_KINDS",
    "COLLECTOR_BUSY",
    "COLLECTOR_LOCK_LOST",
  ]);
  const allowed = new Set([
    "CONNECT_TIMEOUT",
    "DB_CONNECT_FAILED",
    "COLLECTION_STOPPED",
    "CONNECTION_CLOSED",
    "CONNECTION_ENDED",
    "EPIPE",
    "EAI_AGAIN",
    "ENOTFOUND",
    "ENODATA",
    "ECONNREFUSED",
    "ECONNRESET",
    "EHOSTUNREACH",
    "ETIMEDOUT",
    "ETIMEOUT",
    "UND_ERR_CONNECT_TIMEOUT",
    "UND_ERR_HEADERS_TIMEOUT",
    "UND_ERR_BODY_TIMEOUT",
    "CERT_HAS_EXPIRED",
    "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
    "ERR_TLS_CERT_ALTNAME_INVALID",
    "DEPTH_ZERO_SELF_SIGNED_CERT",
  ]);
  let current = error;
  for (
    let depth = 0;
    depth < 4 && typeof current === "object" && current !== null;
    depth++
  ) {
    const e = current as {
      code?: unknown;
      name?: unknown;
      cause?: unknown;
      message?: unknown;
    };
    if (typeof e.message === "string" && safeApplicationCodes.has(e.message))
      return e.message;
    if (typeof e.code === "string" && allowed.has(e.code)) return e.code;
    if (
      typeof e.code === "string" &&
      /^(HTTP_[1-5]\d\d|(?:SOLANA_)?RPC_-?\d+|SCHEMA_MISMATCH|AUDIT_PERSISTENCE_FAILED|RECEIPT_MISMATCH_OR_FAILED|BLOCK_NUMBER_MISMATCH|CHAIN_ID_MISMATCH)$/.test(
        e.code,
      )
    )
      return e.code;
    if (
      e.name === "PostgresError" &&
      typeof e.code === "string" &&
      /^[A-Z0-9]{5}$/.test(e.code)
    )
      return `SQLSTATE_${e.code}`;
    if (e.name === "TimeoutError" || e.name === "AbortError")
      return "REQUEST_TIMEOUT";
    current = e.cause;
  }
  return "NETWORK_OR_PARSE_ERROR";
}
