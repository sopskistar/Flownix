import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Radar } from "../components/radar";
import type { Health, RadarToken } from "../lib/data";
import { tokenVisual } from "@flownix/core";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/",
}));

describe("Radar initial freshness snapshot", () => {
  it("renders identical initial HTML when hydration crosses a freshness boundary", () => {
    const asOf = Date.parse("2026-11-21T09:00:00Z");
    const token = {
      id: "a".repeat(32),
      symbol: "TEST",
      name: "Synthetic clock regression only",
      chain_id: "56",
      chain_name: "BSC",
      contract: "0x" + "1".repeat(40),
      alpha_id: "ALPHA_999",
      status: "current",
      research_state: "DISCOVERY",
      classification: "unclassified",
      deep_selected: false,
      first_seen: "2026-11-20T09:00:00Z",
      last_seen: "2026-11-21T08:59:59Z",
      watchlisted: false,
      price: "1",
      quote_asset: "USDT",
      price_source: "alpha_market",
      price_at: "2026-11-21T08:45:01Z",
      change_24h: "0",
      volume_24h: "100",
      liquidity: "100000",
      market_cap: "1000000",
      last_scan: null,
      first_signal: null,
      signal_count: 0,
      baseline_trace: null,
      visual: tokenVisual({
        id: "a".repeat(32),
        symbol: "TEST",
        name: "Synthetic clock regression only",
        chain_id: "56",
        contract: "0x" + "1".repeat(40),
      }),
    } satisfies RadarToken;
    const health = {
      database: true,
      error: null,
      registry: {
        at: token.last_seen,
        count: 1,
        source: "synthetic-test-only",
        hash: "a".repeat(64),
      },
      heartbeat: { at: token.last_seen },
    } as Health;
    const clock = vi.spyOn(Date, "now").mockReturnValue(asOf);
    try {
      const server = renderToString(
        createElement(Radar, { tokens: [token], health, asOf }),
      );
      clock.mockReturnValue(asOf + 20 * 60_000);
      const initialClient = renderToString(
        createElement(Radar, { tokens: [token], health, asOf }),
      );
      expect(server.replace(/<!--.*?-->/g, "")).toContain("current Alpha ticker");
      expect(initialClient).toBe(server);
    } finally {
      clock.mockRestore();
    }
  });
});
