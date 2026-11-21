import { jsonParam, sqlClient } from "@flownix/db";

export const SUPPORTED_BASELINE_CHAINS = [
  "56",
  "1",
  "8453",
  "42161",
  "CT_501",
] as const;

/** Claim under the collector's lock; optional scan turn prevents market backlog starvation. */
export async function claimNextJob(
  owner: string,
  kinds: string[],
  excluded: string[] = [],
  client = sqlClient(),
  retryOnly = false,
) {
  return client.begin(async (tx) => {
    const rows =
      await tx`SELECT * FROM worker_jobs WHERE (NOT ${retryOnly} OR status='retry') AND run_after<=now() AND kind=ANY(${kinds}) AND NOT(key=ANY(${excluded})) AND (kind<>'scan' OR EXISTS(SELECT 1 FROM alpha_tokens t WHERE t.id=worker_jobs.payload->>'tokenId' AND t.status='current' AND t.chain_id=ANY(${[...SUPPORTED_BASELINE_CHAINS]}))) AND (status IN ('queued','done','retry') OR (status='running' AND lease_until<now())) ORDER BY CASE kind WHEN 'registry' THEN 0 WHEN 'market' THEN 1 ELSE 2 END,run_after,CASE WHEN kind='scan' AND EXISTS(SELECT 1 FROM token_investigation_queue q WHERE q.token_id=worker_jobs.payload->>'tokenId' AND q.active) THEN 0 ELSE 1 END,key FOR UPDATE SKIP LOCKED LIMIT 1`;
    if (!rows.length) return null;
    const job = rows[0];
    await tx`UPDATE worker_jobs SET status='running',owner=${owner},lease_until=now()+interval '2 minutes',updated_at=now() WHERE key=${job.key}`;
    return job;
  });
}

/** Reconcile one durable job per current official Alpha identity on supported chains. */
export async function reconcileScanJobs() {
  const sql = sqlClient();
  const tokens = await sql`
    SELECT id,chain_id FROM alpha_tokens
    WHERE status='current' AND chain_id=ANY(${[...SUPPORTED_BASELINE_CHAINS]})
    ORDER BY chain_id,id
  `;
  if (tokens.length) {
    const scanJobs = tokens.map((t) => ({
      key: `scan:${t.id}`,
      kind: "scan",
      payload: { tokenId: t.id, chainId: t.chain_id },
    }));
    await sql`INSERT INTO worker_jobs(key,kind,payload)
      SELECT key,kind,payload FROM jsonb_to_recordset(${jsonParam(scanJobs)}::jsonb) AS r(key text,kind text,payload jsonb)
      ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,updated_at=now()
      WHERE worker_jobs.status<>'running' AND worker_jobs.payload IS DISTINCT FROM excluded.payload`;
  }
  return {
    currentSupported: tokens.length,
    byChain: Object.fromEntries(
      SUPPORTED_BASELINE_CHAINS.map((chain) => [
        chain,
        tokens.filter((t) => t.chain_id === chain).length,
      ]),
    ),
  };
}
