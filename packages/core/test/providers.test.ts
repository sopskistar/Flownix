import { describe, it, expect, vi } from "vitest";
import {
  HttpClient,
  ProviderError,
  envelope,
  registryEntry,
  EvmProvider,
  preferredAlphaPair,
  decodeSolanaBalanceDeltas,
  SOLANA_MINT_RE,
  SolanaProvider,
} from "../src/index";
import { z } from "zod";
describe("Bounded provider requests", () => {
  it("decodes Solana token-account balance changes without calling them trades", () => {
    const mint = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
    expect(SOLANA_MINT_RE.test(mint)).toBe(true);
    const decoded = decodeSolanaBalanceDeltas({
      transaction: { message: { accountKeys: ["TokenAccount111111111111111111111111111111"] } },
      meta: {
        preTokenBalances: [{ accountIndex: 0, mint, owner: "Owner11111111111111111111111111111111", uiTokenAmount: { amount: "9007199254740993123", decimals: 6 } }],
        postTokenBalances: [{ accountIndex: 0, mint, owner: "Owner11111111111111111111111111111111", uiTokenAmount: { amount: "9007199254740993000", decimals: 6 } }],
      },
    }, mint);
    expect(decoded).toEqual([{
      accountIndex: 0,
      accountAddress: "TokenAccount111111111111111111111111111111",
      owner: "Owner11111111111111111111111111111111",
      mint,
      preRaw: "9007199254740993123",
      postRaw: "9007199254740993000",
      deltaRaw: "-123",
      decimals: 6,
    }]);
  });
  it("accepts Solana transaction signatures using signature length, not mint length", async () => {
    const signature = "1".repeat(88);
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      result: [{ signature, slot: 123, blockTime: null, err: null, confirmationStatus: "finalized" }],
    })));
    const provider = new SolanaProvider(
      "https://solana.example.test",
      new HttpClient("solana-test", 120, async () => {}, fetcher, async () => {}),
    );
    await expect(provider.signatures("11111111111111111111111111111111", 1)).resolves.toMatchObject({
      data: [{ signature, slot: 123, confirmationStatus: "finalized" }],
    });
  });
  it("prefers an exact active pair deterministically while preserving its quote currency", () => {
    const symbols = [
      { symbol: "ALPHA_17USDC", baseAsset: "ALPHA_17", quoteAsset: "USDC", status: "TRADING" },
      { symbol: "ALPHA_17U", baseAsset: "ALPHA_17", quoteAsset: "U", status: "TRADING" },
      { symbol: "ALPHA_17USDT", baseAsset: "ALPHA_17", quoteAsset: "USDT", status: "TRADING" },
      { symbol: "ALPHA_18USDT", baseAsset: "ALPHA_18", quoteAsset: "USDT", status: "TRADING" },
      { symbol: "ALPHA_17BTC", baseAsset: "ALPHA_17", quoteAsset: "BTC", status: "BREAK" },
    ];
    expect(preferredAlphaPair("ALPHA_17", symbols)).toMatchObject({ symbol: "ALPHA_17USDT", quoteAsset: "USDT" });
    expect(preferredAlphaPair("ALPHA_99", symbols)).toBeNull();
  });
  it("retries 429, counts actual calls and respects retry-after", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response("{}", { status: 429, headers: { "retry-after": "2" } }),
      )
      .mockResolvedValueOnce(new Response('{"ok":true}'));
    const sleeps: number[] = [],
      audits: unknown[] = [];
    const client = new HttpClient(
      "synthetic",
      120,
      async (a) => {
        audits.push(a);
      },
      fetcher,
      async (ms) => {
        sleeps.push(ms);
      },
    );
    const r = await client.json("https://example.test", (x) =>
      z.object({ ok: z.literal(true) }).parse(x),
    );
    expect(r.data.ok).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(audits).toHaveLength(2);
    expect(Math.max(...sleeps)).toBeGreaterThan(1000);
    expect(r.hash).toHaveLength(64);
  });
  it("preserves failure without unbounded retries or URL/secret logging", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValue(Error("secret RPC URL"));
    const client = new HttpClient(
      "test",
      120,
      async () => {},
      fetcher,
      async () => {},
    );
    await expect(
      client.json("https://example.test/key-secret", (x) => x),
    ).rejects.toMatchObject({ code: "NETWORK_OR_PARSE_ERROR" });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it("does not retry permanent 403 access restrictions", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("{}", { status: 403 }));
    const client = new HttpClient(
      "test",
      120,
      async () => {},
      fetcher,
      async () => {},
    );
    await expect(
      client.json("https://example.test", (x) => x),
    ).rejects.toBeInstanceOf(ProviderError);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("rejects malformed success envelopes and mismatched RPC chains", async () => {
    expect(() =>
      envelope(z.array(registryEntry))({
        code: "000000",
        success: false,
        data: [],
      }),
    ).toThrow();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response('{"jsonrpc":"2.0","id":1,"result":"0x1"}'),
      );
    const rpc = new EvmProvider(
      "56",
      "https://example.test",
      new HttpClient(
        "test",
        120,
        async () => {},
        fetcher,
        async () => {},
      ),
    );
    await expect(rpc.head()).rejects.toMatchObject({
      code: "CHAIN_ID_MISMATCH",
    });
  });
});
