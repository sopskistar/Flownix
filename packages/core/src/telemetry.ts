// Process-local counters only. Never retain URLs, request bodies, SQL, or secrets.
const counters = new Map<string, number>();
export function countMetric(name: string, amount = 1) {
  counters.set(name, (counters.get(name) ?? 0) + amount);
}

const alchemyMethodCUs: Record<string, number> = {
  eth_chainId: 0,
  eth_blockNumber: 10,
  eth_getBlockByNumber: 20,
  eth_getCode: 20,
  eth_call: 26,
  eth_getLogs: 60,
  eth_getTransactionReceipt: 20,
  getVersion: 20,
  getGenesisHash: 10,
  getSlot: 20,
  getFirstAvailableBlock: 40,
  getAccountInfo: 10,
  getTokenLargestAccounts: 20,
  getSignaturesForAddress: 40,
  getTransaction: 40,
};

/** Estimate documented Alchemy CU consumption without retaining RPC URLs or request bodies. */
export function estimateAlchemyComputeUnits(url: string, body: unknown) {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return { requests: 0, units: 0, unpriced: 0 };
  }
  if (!host.endsWith(".alchemy.com"))
    return { requests: 0, units: 0, unpriced: 0 };
  let parsed = body;
  if (typeof body === "string") {
    try {
      parsed = JSON.parse(body);
    } catch {
      return { requests: 0, units: 0, unpriced: 0 };
    }
  }
  const calls = Array.isArray(parsed) ? parsed : [parsed];
  let units = 0;
  let unpriced = 0;
  for (const call of calls) {
    const method =
      typeof call === "object" && call !== null && "method" in call
        ? String(call.method)
        : "";
    const cost = Object.hasOwn(alchemyMethodCUs, method)
      ? alchemyMethodCUs[method]
      : undefined;
    if (cost === undefined) unpriced++;
    else units += cost;
  }
  return { requests: calls.length, units, unpriced };
}

export function processMetrics() {
  return Object.fromEntries(counters);
}
