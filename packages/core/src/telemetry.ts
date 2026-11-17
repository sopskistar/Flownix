// Process-local counters only. Never retain URLs, request bodies, SQL, or secrets.
const counters = new Map<string, number>();
export function countMetric(name: string, amount = 1) {
  counters.set(name, (counters.get(name) ?? 0) + amount);
}
export function processMetrics() {
  return Object.fromEntries(counters);
}
