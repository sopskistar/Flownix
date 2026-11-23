import { sqlClient } from "@flownix/db";
import { listingStudySpec, historicalEpisodeSpec } from "@flownix/core";
/** Preserve immutable runs and prior case annotations in one transaction. */
export async function persistListingStudy(
  input: {
    tokenId: string;
    runHash: string;
    manifest: unknown;
    report: unknown;
  },
  sql = sqlClient(),
) {
  await sql.begin(async (tx) => {
    // Build typed parameters with the executing client's serializer. CLI and
    // workspace imports can otherwise carry different postgres Parameter classes.
    const saved =
      await tx`INSERT INTO event_study_runs(run_hash,spec_version,computed_at,manifest,report) VALUES(${input.runHash},${listingStudySpec.version},now(),${tx.json(JSON.parse(JSON.stringify(input.manifest)))}::jsonb,${tx.json(JSON.parse(JSON.stringify(input.report)))}::jsonb) ON CONFLICT DO NOTHING RETURNING jsonb_typeof(manifest) AS manifest_type,jsonb_typeof(report) AS report_type`;
    if (
      saved.some(
        (r) => r.manifest_type !== "object" || r.report_type !== "object",
      )
    )
      throw Error("EVENT_JSON_ENCODING_INVALID");
    await tx`INSERT INTO research_case_candidates(token_id,source,observed_at,hypothesis,evidence) VALUES(${input.tokenId},'Reviewed primary listing event',now(),'Two-sided listing reaction; no assumed dump/rally or causation',jsonb_build_object('eventStudyRun',${input.runHash}::text,'runnerClassificationVerified',false)) ON CONFLICT(token_id) DO UPDATE SET evidence=research_case_candidates.evidence||jsonb_build_object('eventStudyRun',${input.runHash}::text)`;
  });
}

/** Append an immutable episode run without replacing older case annotations. */
export async function persistHistoricalStudy(
  input: {
    runHash: string;
    manifest: unknown;
    report: unknown;
    tokenIds: string[];
  },
  sql = sqlClient(),
) {
  await sql.begin(async (tx) => {
    const saved =
      await tx`INSERT INTO event_study_runs(run_hash,spec_version,computed_at,manifest,report) VALUES(${input.runHash},${historicalEpisodeSpec.version},now(),${tx.json(JSON.parse(JSON.stringify(input.manifest)))}::jsonb,${tx.json(JSON.parse(JSON.stringify(input.report)))}::jsonb) ON CONFLICT DO NOTHING RETURNING jsonb_typeof(manifest) AS manifest_type,jsonb_typeof(report) AS report_type`;
    if (
      saved.some(
        (r) => r.manifest_type !== "object" || r.report_type !== "object",
      )
    )
      throw Error("EVENT_JSON_ENCODING_INVALID");
    for (const tokenId of new Set(input.tokenIds))
      await tx`INSERT INTO research_case_candidates(token_id,source,observed_at,hypothesis,evidence) VALUES(${tokenId},'Standardized observed price episode',now(),'Candidate historical episode; no presumed edge',jsonb_build_object('historicalRun',${input.runHash}::text)) ON CONFLICT(token_id) DO UPDATE SET evidence=research_case_candidates.evidence||jsonb_build_object('historicalRun',${input.runHash}::text)`;
  });
}
