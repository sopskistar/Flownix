import Decimal from "decimal.js";
import type { RadarToken } from "./data";

export const radarSortOptions = [
  ["change_desc", "24h Change — Highest First"],
  ["change_asc", "24h Change — Lowest First"],
  ["cap", "Market Cap — Highest First"],
  ["cap_asc", "Market Cap — Lowest First"],
  ["liquidity", "Liquidity — Highest First"],
  ["liquidity_asc", "Liquidity — Lowest First"],
  ["volume", "24h Quote Volume — Highest First"],
  ["volume_asc", "24h Quote Volume — Lowest First"],
  ["oldest", "Longest observation"],
  ["activity", "Unresolved activity"],
  ["name", "Token name"],
] as const;
export type RadarSort = (typeof radarSortOptions)[number][0];
export function radarSort(value: string | null, watchlist = false): RadarSort {
  return radarSortOptions.some(([key]) => key === value)
    ? (value as RadarSort)
    : watchlist
      ? "oldest"
      : "change_desc";
}
/** Missing/invalid observations are never zero; decimal precision survives sorting. */
export function radarMetric(value: string | null): Decimal | null {
  if (
    typeof value !== "string" ||
    !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()) ||
    !Number.isFinite(Number(value))
  )
    return null;
  return new Decimal(value.trim());
}
export function compareRadarTokens(
  a: RadarToken,
  b: RadarToken,
  sort: RadarSort,
) {
  const tie = a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  if (sort === "oldest") return a.first_seen.localeCompare(b.first_seen) || tie;
  if (sort === "activity") return b.signal_count - a.signal_count || tie;
  if (sort === "name") return a.symbol.localeCompare(b.symbol) || tie;
  const field = sort.startsWith("change_")
    ? "change_24h"
    : sort.startsWith("cap")
      ? "market_cap"
      : sort.startsWith("volume")
        ? "volume_24h"
        : "liquidity";
  const av = radarMetric(a[field]),
    bv = radarMetric(b[field]);
  if (av === null || bv === null)
    return av === null && bv === null ? tie : av === null ? 1 : -1;
  return av.comparedTo(bv) * (sort.endsWith("_asc") ? 1 : -1) || tie;
}
