import { afterEach, expect, it, vi } from "vitest";
import {
  HttpClient,
  installRequestPolicy,
  ProviderError,
  networkErrorCode,
} from "../src/index";
afterEach(() => installRequestPolicy(undefined));

it("reserves each retry before dispatch and never dispatches when a durable budget refuses", async () => {
  const retryAt = new Date(Date.now() + 3600000);
  const reserve = vi
    .fn()
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(
      new ProviderError("PROVIDER_BUDGET_EXHAUSTED", null, undefined, retryAt),
    );
  const complete = vi.fn();
  const fetcher = vi
    .fn()
    .mockResolvedValue(new Response("busy", { status: 503 }));
  installRequestPolicy({ reserve, complete });
  const http = new HttpClient(
    "rpc:56",
    60,
    async () => {},
    fetcher,
    async () => {},
  );
  await expect(
    http.json("https://bnb-mainnet.g.alchemy.com/v2/SECRET", (v) => v, {
      body: JSON.stringify({ method: "eth_getLogs" }),
    }),
  ).rejects.toMatchObject({ code: "PROVIDER_BUDGET_EXHAUSTED", retryAt });
  expect(fetcher).toHaveBeenCalledOnce();
  expect(reserve).toHaveBeenCalledTimes(2);
  expect(reserve.mock.calls[0][0]).toEqual({
    provider: "rpc:56",
    alchemyRequests: 1,
    alchemyUnits: 60,
    unpriced: 0,
  });
  expect(JSON.stringify(reserve.mock.calls)).not.toContain("SECRET");
});

it("records HTTP Retry-After and avoids repeating deterministic Solana method errors", async () => {
  const complete = vi.fn();
  installRequestPolicy({ reserve: vi.fn(), complete });
  const fetcher = vi
    .fn()
    .mockResolvedValue(
      new Response("busy", { status: 429, headers: { "retry-after": "300" } }),
    );
  await expect(
    new HttpClient(
      "rpc:CT_501",
      30,
      async () => {},
      fetcher,
      async () => {},
    ).json("https://fixture.invalid", (v) => v),
  ).rejects.toMatchObject({ code: "HTTP_429" });
  expect(complete.mock.calls[0][0]).toMatchObject({
    status: 429,
    retryAfterSeconds: 300,
  });
  fetcher.mockClear().mockResolvedValue(new Response("{}", { status: 200 }));
  await expect(
    new HttpClient(
      "rpc:CT_501",
      30,
      async () => {},
      fetcher,
      async () => {},
    ).json("https://fixture.invalid", () => {
      throw new ProviderError("SOLANA_RPC_-32015");
    }),
  ).rejects.toMatchObject({ code: "SOLANA_RPC_-32015" });
  expect(fetcher).toHaveBeenCalledOnce();
  expect(networkErrorCode(new ProviderError("SOLANA_RPC_-32015"))).toBe(
    "SOLANA_RPC_-32015",
  );
});
