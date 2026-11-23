/** Sampling a recent window never proves coverage of the skipped interval. */
export function recentScanWindow(
  target: number,
  span: number,
  previous: number | null,
) {
  if (
    !Number.isSafeInteger(target) ||
    target < 0 ||
    !Number.isSafeInteger(span) ||
    span < 1 ||
    (previous !== null && (!Number.isSafeInteger(previous) || previous < 0))
  )
    throw Error("INVALID_SCAN_WINDOW");
  const from = Math.max(
    0,
    target - span + 1,
    previous === null ? 0 : previous + 1,
  );
  return {
    from,
    to: target,
    gap:
      previous !== null && from > previous + 1
        ? { from: previous + 1, to: from - 1 }
        : null,
    coverage: "bounded_recent_sample" as const,
  };
}
