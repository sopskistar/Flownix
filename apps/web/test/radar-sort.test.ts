import { describe, expect, it } from "vitest";
import {
  compareRadarTokens,
  radarMetric,
  radarSort,
  radarSortOptions,
} from "../lib/radar-sort";
import type { RadarToken } from "../lib/data";
const row = (id: string, value: string | null) =>
  ({
    id,
    change_24h: value,
    market_cap: value,
    liquidity: value,
    volume_24h: value,
    symbol: "SAME",
    first_seen: "2026-01-01T00:00:00Z",
    signal_count: 0,
  }) as RadarToken;
describe("Universe ledger numeric sorting", () => {
  it("defaults to descending change, preserves legacy URLs and the watchlist default", () => {
    expect(radarSort(null)).toBe("change_desc");
    expect(radarSort("unknown")).toBe("change_desc");
    expect(radarSort("cap")).toBe("cap");
    expect(radarSort("liquidity")).toBe("liquidity");
    expect(radarSort(null, true)).toBe("oldest");
    expect(new Set(radarSortOptions.map((o) => o[0])).size).toBe(
      radarSortOptions.length,
    );
  });
  it("orders positive, negative, zero and decimal percentages numerically", () => {
    const values = ["5", "-3", "150", "0", "-12", "85", "20", "5.5", "-0.25"];
    const rows = values.map((v, i) => row(String(i), v));
    expect(
      rows
        .toSorted((a, b) => compareRadarTokens(a, b, "change_desc"))
        .map((r) => r.change_24h),
    ).toEqual(["150", "85", "20", "5.5", "5", "0", "-0.25", "-3", "-12"]);
    expect(
      rows
        .toSorted((a, b) => compareRadarTokens(a, b, "change_asc"))
        .map((r) => r.change_24h),
    ).toEqual(["-12", "-3", "-0.25", "0", "5", "5.5", "20", "85", "150"]);
  });
  it.each(radarSortOptions.slice(0, 8).map(([key]) => [key]))(
    "keeps unavailable data last in %s",
    (sort) => {
      const rows = [
        row("a", null),
        row("b", ""),
        row("c", "NaN"),
        row("d", "Infinity"),
        row("e", "bad"),
        row("f", " "),
        row("g", "0x10"),
        row("z", "0"),
        row("h", "-5"),
      ];
      const result = rows.toSorted((a, b) => compareRadarTokens(a, b, sort));
      expect(result.slice(0, 2).map((r) => r.id)).toEqual(
        sort.endsWith("_asc") ? ["h", "z"] : ["z", "h"],
      );
      expect(result.slice(2).map((r) => r.id)).toEqual([
        "a",
        "b",
        "c",
        "d",
        "e",
        "f",
        "g",
      ]);
    },
  );
  it("uses exact decimal comparisons and identity ties in both directions", () => {
    const rows = [
      row("b", "20.0"),
      row("a", "20"),
      row("c", "20.0000000000000001"),
    ];
    expect(
      rows
        .toSorted((a, b) => compareRadarTokens(a, b, "change_desc"))
        .map((r) => r.id),
    ).toEqual(["c", "a", "b"]);
    expect(
      rows
        .toSorted((a, b) => compareRadarTokens(a, b, "change_asc"))
        .map((r) => r.id),
    ).toEqual(["a", "b", "c"]);
    for (const sort of ["oldest", "activity", "name"] as const)
      expect(
        rows
          .toSorted((a, b) => compareRadarTokens(a, b, sort))
          .map((r) => r.id),
      ).toEqual(["a", "b", "c"]);
    expect(radarMetric("0")?.isZero()).toBe(true);
    expect(radarMetric(null)).toBeNull();
  });
});
