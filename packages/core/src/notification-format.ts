const stamp = (value: unknown) =>
  value && Number.isFinite(new Date(String(value)).getTime())
    ? new Date(String(value)).toISOString()
    : "unavailable";
/** Only persisted evidence, with missing facts explicitly left unknown. */
export function formatResearchNotification(
  s: Record<string, unknown>,
  evidence: { eventTime: unknown; availableAt: unknown; url: string | null }[],
) {
  const supported = ["supported", "high"].includes(
    String(s.evidence_confidence),
  );
  const compact = (value: unknown) => JSON.stringify(value ?? {}).slice(0, 700);
  return `${supported ? "Flownix research alert" : "Flownix lower-priority research digest"}\n${s.symbol} | chain ${s.chain_id}\nOfficial Alpha contract: ${s.contract}\n${s.kind}: ${String(s.message).slice(0, 350)}\nStage: ${s.research_state ?? s.stage}; confidence: ${s.evidence_confidence}\n${
    evidence
      .slice(0, 3)
      .map(
        (e) =>
          `Event: ${stamp(e.eventTime)}; first local availability: ${stamp(e.availableAt)}\n${e.url ?? "Primary transaction link unavailable"}`,
      )
      .join("\n") || "Primary event timestamps/links unavailable"
  }\nFinding first detected: ${stamp(s.first_detected_at)}; data available: ${stamp(s.data_available_at)}\nCoverage / observed evidence: ${compact(s.observed)}\nAlternatives / limitations: ${compact(s.counter_evidence)}\nAttribution confidence / time-valid label claims: ${Array.isArray(s.attribution) && s.attribution.length ? JSON.stringify(s.attribution).slice(0, 450) : "No source-backed time-valid label known at detection"}\nAttribution: wallet/exchange ownership and intent are unknown unless explicitly verified in linked evidence. Transfers can be custody, routing, liquidity or distribution; they do not establish purchases.\nCoverage is partial; completed small windows are not complete historical coverage.\nWhy inspect: an observed research rule changed; no prediction or validated trading strategy.\nhttps://flownix.xyz/token/${s.token_id}`;
}
