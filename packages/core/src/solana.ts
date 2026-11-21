import { z } from "zod";
import { HttpClient, ProviderError } from "./providers";

export const SOLANA_MINT_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const signatureRe = /^[1-9A-HJ-NP-Za-km-z]{80,90}$/;
const pubkey = z.string().regex(SOLANA_MINT_RE);
const rpcError = z.object({ code: z.number(), message: z.string() });

export class SolanaProvider {
  constructor(
    private readonly url: string,
    private readonly http: HttpClient,
  ) {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") throw new Error("SOLANA_RPC_MUST_USE_HTTPS");
  }

  async rpc<T>(method: string, params: unknown[], parse: (v: unknown) => T) {
    const result = await this.http.json(
      this.url,
      (body) => {
        const envelope = z.object({
          error: rpcError.optional(),
          result: z.unknown().optional(),
        }).parse(body);
        if (envelope.error) throw new ProviderError(`SOLANA_RPC_${envelope.error.code}`);
        return parse(envelope.result);
      },
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      },
    );
    return { ...result, source: "solana_json_rpc" };
  }

  version() {
    return this.rpc("getVersion", [], (v) => z.object({ "solana-core": z.string() }).parse(v));
  }

  genesisHash() {
    return this.rpc("getGenesisHash", [], (v) => z.string().parse(v));
  }

  slot(commitment: "confirmed" | "finalized" = "finalized") {
    return this.rpc("getSlot", [{ commitment }], (v) => z.number().int().nonnegative().parse(v));
  }

  firstAvailableBlock() {
    return this.rpc("getFirstAvailableBlock", [], (v) => z.number().int().nonnegative().parse(v));
  }

  mintInfo(mint: string) {
    pubkey.parse(mint);
    return this.rpc("getAccountInfo", [mint, { encoding: "jsonParsed", commitment: "finalized" }], (v) => {
      const schema = z.object({
        context: z.object({ slot: z.number().int().nonnegative() }),
        value: z.object({
          owner: pubkey,
          data: z.object({
            parsed: z.object({
              type: z.string(),
              info: z.object({ decimals: z.number().int().min(0).max(255), supply: z.string().regex(/^\d+$/).optional() }).passthrough(),
            }).passthrough(),
          }).passthrough(),
        }).nullable(),
      });
      const parsed = schema.parse(v);
      if (!parsed.value || parsed.value.data.parsed.type !== "mint") throw new Error("ALPHA_MINT_NOT_FOUND");
      return { slot: parsed.context.slot, tokenProgram: parsed.value.owner, decimals: parsed.value.data.parsed.info.decimals, rawSupply: parsed.value.data.parsed.info.supply ?? null };
    });
  }

  largestTokenAccounts(mint: string) {
    pubkey.parse(mint);
    return this.rpc("getTokenLargestAccounts", [mint, { commitment: "finalized" }], (v) => z.object({
      context: z.object({ slot: z.number().int().nonnegative() }),
      value: z.array(z.object({ address: pubkey, amount: z.string().regex(/^\d+$/), decimals: z.number().int().min(0).max(255), uiAmountString: z.string().optional() })),
    }).parse(v));
  }

  tokenAccountOwner(account: string) {
    pubkey.parse(account);
    return this.rpc("getAccountInfo", [account, { encoding: "jsonParsed", commitment: "finalized" }], (v) => {
      const parsed = z.object({ value: z.object({ data: z.object({ parsed: z.object({ info: z.object({ owner: pubkey, mint: pubkey.optional() }).passthrough() }).passthrough() }).passthrough() }).nullable() }).parse(v);
      return parsed.value?.data.parsed.info ?? null;
    });
  }

  signatures(address: string, limit = 10) {
    pubkey.parse(address);
    return this.rpc("getSignaturesForAddress", [address, { commitment: "finalized", limit }], (v) => z.array(z.object({
      signature: z.string().regex(signatureRe), slot: z.number().int().nonnegative(), blockTime: z.number().int().nullable(), err: z.unknown().nullable(), confirmationStatus: z.string().optional(),
    })).parse(v));
  }

  transaction(signature: string) {
    if (!signatureRe.test(signature)) throw new Error("INVALID_SOLANA_SIGNATURE");
    return this.rpc("getTransaction", [signature, { commitment: "finalized", encoding: "jsonParsed", maxSupportedTransactionVersion: 1 }], (v) => z.unknown().nullable().parse(v));
  }
}

export type SolanaBalanceDelta = {
  accountIndex: number;
  accountAddress: string;
  owner: string | null;
  mint: string;
  preRaw: string;
  postRaw: string;
  deltaRaw: string;
  decimals: number;
};

/** Derives account balance deltas from finalized transaction metadata; these are not buys/sells. */
export function decodeSolanaBalanceDeltas(input: unknown, mint: string): SolanaBalanceDelta[] {
  pubkey.parse(mint);
  const tx = z.object({
    transaction: z.object({ message: z.object({ accountKeys: z.array(z.union([z.string(), z.object({ pubkey: z.string() }).passthrough()])) }).passthrough() }).passthrough(),
    meta: z.object({
      preTokenBalances: z.array(z.object({ accountIndex: z.number().int().nonnegative(), mint: z.string(), owner: z.string().optional(), uiTokenAmount: z.object({ amount: z.string().regex(/^\d+$/), decimals: z.number().int().min(0).max(255) }) }).passthrough()).nullable(),
      postTokenBalances: z.array(z.object({ accountIndex: z.number().int().nonnegative(), mint: z.string(), owner: z.string().optional(), uiTokenAmount: z.object({ amount: z.string().regex(/^\d+$/), decimals: z.number().int().min(0).max(255) }) }).passthrough()).nullable(),
    }).nullable(),
  }).parse(input);
  if (!tx.meta?.preTokenBalances || !tx.meta.postTokenBalances) return [];
  const keys = tx.transaction.message.accountKeys.map((key) => typeof key === "string" ? key : key.pubkey);
  const matching = (rows: typeof tx.meta.preTokenBalances) => new Map(rows.filter((row) => row.mint === mint).map((row) => [row.accountIndex, row]));
  const before = matching(tx.meta.preTokenBalances), after = matching(tx.meta.postTokenBalances);
  const indices = new Set([...before.keys(), ...after.keys()]);
  return [...indices].flatMap((accountIndex) => {
    const pre = before.get(accountIndex), post = after.get(accountIndex);
    const decimals = post?.uiTokenAmount.decimals ?? pre?.uiTokenAmount.decimals;
    if (decimals === undefined || !keys[accountIndex]) return [];
    const preRaw = pre?.uiTokenAmount.amount ?? "0", postRaw = post?.uiTokenAmount.amount ?? "0";
    const delta = BigInt(postRaw) - BigInt(preRaw);
    if (delta === 0n) return [];
    return [{ accountIndex, accountAddress: keys[accountIndex], owner: post?.owner ?? pre?.owner ?? null, mint, preRaw, postRaw, deltaRaw: delta.toString(), decimals }];
  });
}
