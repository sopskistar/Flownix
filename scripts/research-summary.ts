import { sqlClient, closeDb } from "../packages/db/src/index";
import { networkErrorCode } from "../packages/core/src/index";
process.env.DATABASE_URL =
  process.env.DATABASE_URL_WORKER ?? process.env.DATABASE_URL;
const timer = setInterval(() => {}, 1000);
try {
  const sql = sqlClient();
  const [events, cohort] = await Promise.all([
    sql`SELECT DISTINCT ON(manifest->'event'->>'tokenId') run_hash,computed_at,manifest,report FROM event_study_runs WHERE spec_version='listing-study/1' AND jsonb_typeof(manifest)='object' AND manifest->'event'->>'tokenId' IS NOT NULL AND jsonb_typeof(report)='object' AND report ? 'phases' ORDER BY manifest->'event'->>'tokenId',computed_at DESC`,
    sql`SELECT report FROM event_study_runs WHERE spec_version IN ('fixed-cohort/1','fixed-cohort/2') ORDER BY computed_at DESC LIMIT 1`,
  ]);
  console.log(
    JSON.stringify(
      {
        at: new Date().toISOString(),
        events: events.map((r) => ({
          run: r.run_hash,
          at: r.computed_at,
          event: r.manifest.event,
          phases: r.report.phases,
          context: r.report.historicalContext,
          failures: r.report.collectionFailures,
        })),
        cohort: cohort[0]?.report.cohort ?? null,
        validatedStrategies: 0,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(networkErrorCode(error));
  process.exitCode = 1;
} finally {
  await closeDb();
  clearInterval(timer);
}
