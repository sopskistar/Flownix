export function freshness(
  at: string | Date | null | undefined,
  now = Date.now(),
  maxSeconds = 900,
) {
  if (!at) return "unavailable";
  const age = now - new Date(at).getTime();
  return age >= -30000 && age <= maxSeconds * 1000 ? "current" : "stale";
}
