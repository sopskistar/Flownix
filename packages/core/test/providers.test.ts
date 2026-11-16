import { describe, it, expect, vi } from "vitest";
import {
  HttpClient,
  ProviderError,
  envelope,
  registryEntry,
  EvmProvider,
} from "../src/index";
import { z } from "zod";
describe("Bounded provider requests", () => {
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
