import { jsonParam, sqlClient } from "@flownix/db";

export const SUPPORTED_BASELINE_CHAINS = ["56", "1", "8453", "42161", "CT_501"] as const;

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
      WHERE worker_jobs.status<>'running'`;
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
