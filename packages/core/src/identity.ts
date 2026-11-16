import { createHash } from "node:crypto";
export const evmChains: Record<
  string,
  { name: string; explorer: string; env: string }
> = {
  "56": { name: "BSC", explorer: "https://bscscan.com", env: "BSC_RPC_URL" },
  "1": {
    name: "Ethereum",
    explorer: "https://etherscan.io",
    env: "ETH_RPC_URL",
  },
  "8453": {
    name: "Base",
    explorer: "https://basescan.org",
    env: "BASE_RPC_URL",
  },
};
export function contractIdentity(chain: string, address: string) {
  const a = address.trim();
  // Lowercase EVM only. Solana and other case-sensitive identifiers are preserved.
  return {
    chain,
    contract: /^0x[0-9a-fA-F]{40}$/.test(a) ? a.toLowerCase() : a,
  };
}
export function tokenKey(chain: string, address: string) {
  const i = contractIdentity(chain, address);
  return createHash("sha256")
    .update(`${i.chain}:${i.contract}`)
    .digest("hex")
    .slice(0, 32);
}
export const hashResponse = (raw: string) =>
  createHash("sha256").update(raw).digest("hex");
export const isEvmAddress = (s: string) => /^0x[0-9a-fA-F]{40}$/.test(s);
export function explorerUrl(
  chain: string,
  kind: "tx" | "address" | "token",
  value: string,
): string | null {
  const c = evmChains[chain];
  if (!c) return null;
  if (kind === "tx" ? !/^0x[0-9a-fA-F]{64}$/.test(value) : !isEvmAddress(value))
    return null;
  return `${c.explorer}/${kind}/${value}`;
}
export function freshness(
  at: string | Date | null | undefined,
  now = Date.now(),
  maxSeconds = 900,
) {
  if (!at) return "unavailable";
  const age = now - new Date(at).getTime();
  return age >= -30000 && age <= maxSeconds * 1000 ? "current" : "stale";
}
