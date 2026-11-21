import { describe, expect, it } from "vitest";
import { estimateAlchemyComputeUnits } from "../src/telemetry";

describe("Alchemy CU estimates", () => {
  it("counts each documented EVM method without retaining endpoint credentials", () => {
    expect(
      estimateAlchemyComputeUnits(
        "https://bnb-mainnet.g.alchemy.com/v2/never-return-this-key",
        JSON.stringify([
          { method: "eth_blockNumber" },
          { method: "eth_getLogs" },
          { method: "eth_getCode" },
          { method: "eth_call" },
          { method: "eth_getBlockByNumber" },
          { method: "eth_getBlockByNumber" },
        ]),
      ),
    ).toEqual({ requests: 6, units: 156, unpriced: 0 });
  });

  it("accounts for priced Solana methods and identifies unknown methods", () => {
    expect(
      estimateAlchemyComputeUnits("https://solana.g.alchemy.com/v2/key", {
        method: "getSignaturesForAddress",
      }),
    ).toEqual({ requests: 1, units: 40, unpriced: 0 });
    expect(
      estimateAlchemyComputeUnits("https://solana.g.alchemy.com/v2/key", {
        method: "newMethod",
      }),
    ).toEqual({ requests: 1, units: 0, unpriced: 1 });
    expect(
      estimateAlchemyComputeUnits("https://solana.g.alchemy.com/v2/key", {
        method: "constructor",
      }),
    ).toEqual({ requests: 1, units: 0, unpriced: 1 });
  });

  it("does not count non-Alchemy, malformed or invalid endpoints", () => {
    const body = { method: "eth_getLogs" };
    expect(
      estimateAlchemyComputeUnits("https://rpc.example.test", body),
    ).toEqual({
      requests: 0,
      units: 0,
      unpriced: 0,
    });
    expect(estimateAlchemyComputeUnits("not a URL", body)).toEqual({
      requests: 0,
      units: 0,
      unpriced: 0,
    });
  });
});
