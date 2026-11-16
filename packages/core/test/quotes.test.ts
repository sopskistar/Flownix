import { describe, it, expect } from "vitest";
import { depthSchema, bookQuote, quoteUsable } from "../src/index";
describe("Observed executable-side quotes — synthetic fixture, not live data", () => {
  const at = "2026-11-15T12:00:00.000Z";
  const depth: Parameters<typeof bookQuote>[0] = {
    symbol: "ALPHA_999USDC",
    bids: [
      ["0.9", "1000"],
      ["0.99", "100"],
    ],
    asks: [
      ["1.1", "1000"],
      ["1.01", "100"],
    ],
    E: Date.parse(at),
  };
  it("finds actual best prices and preserves size, quote time and response hash", () => {
    const q = bookQuote(
      depthSchema.parse(depth),
      at,
      "synthetic-test-only",
      "hash",
    )!;
    expect(q.bid).toBe("0.99");
    expect(q.ask).toBe("1.01");
    expect(q.askQuantity).toBe("100");
    expect(quoteUsable(q, at)).toBe(true);
    expect(quoteUsable(q, "2026-11-15T13:00:00.000Z")).toBe(false);
  });
  it("rejects missing event time, crossed books, zero quantities and future evidence", () => {
    expect(
      bookQuote({ ...depth, E: undefined }, at, "test", "hash"),
    ).toBeNull();
    expect(
      bookQuote({ ...depth, bids: [["2", "1"]] }, at, "test", "hash"),
    ).toBeNull();
    expect(() => depthSchema.parse({ ...depth, asks: [["1", "0"]] })).toThrow();
    expect(
      bookQuote({ ...depth, E: Date.parse(at) + 60000 }, at, "test", "hash"),
    ).toBeNull();
  });
});
