import type { RadarToken } from "./data";
export function researchSummary(t: RadarToken) {
  if (t.signal_count) return `${t.signal_count} observed research alerts`;
  if (t.swap_count)
    return `${t.swap_count} verified swap records; accumulation incomplete`;
  if (t.transfer_count)
    return `${t.transfer_count} observed on-chain transfers`;
  if (t.balance_count)
    return `${t.balance_count} balance snapshots; retention unproven`;
  if (t.solana_count)
    return `${t.solana_count} Solana observations; partial sample`;
  return t.investigation_active
    ? "Incomplete accumulation investigation"
    : "Insufficient accumulation evidence";
}
export function marketObservation(t: RadarToken) {
  return `Source: official Binance Alpha ${t.price_source === "alpha_market" ? "market ticker" : t.price_source === "alpha_registry" ? "registry metadata (quote unspecified)" : "price unavailable"}. Provider time: ${t.provider_time ?? "unavailable"}. Collected: ${t.price_observed_at ?? t.price_at ?? "unavailable"}. On-chain coverage is separate.`;
}
