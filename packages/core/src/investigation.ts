/** A research lead independent of market freshness; never a validated signal. */
export function transferInvestigationCandidate(
  count: number,
  baseline: { count: number; complete: boolean }[],
) {
  const complete = baseline.filter((w) => w.complete);
  if (complete.length < 6 || count < 25) return false;
  const mean = complete.reduce((sum, w) => sum + w.count, 0) / complete.length;
  return count >= Math.max(25, mean * 3);
}
