import { EvmProvider, ProviderError, type HolderSnapshot } from "@flownix/core";
import { sqlClient, jsonParam, saveSource } from "@flownix/db";
export async function collectEvmSupply(
  token: { id: string; chain_id: string; contract: string },
  rpc: EvmProvider,
  block: number,
  blockHash: string,
  at: string,
  decimals: number,
) {
  const sql = sqlClient();
  try {
    const supply = await rpc.callWord(token.contract, "0x18160ddd", block);
    await saveSource(`rpc:${token.chain_id}`, supply);
    const balances =
      await sql`SELECT address,raw_quantity::text FROM wallet_balance_snapshots WHERE token_id=${token.id} AND block_number=${block} AND block_hash=${blockHash} AND canonical`;
    const evidence: HolderSnapshot & { decimals: number; blockHash: string } = {
      chain: token.chain_id,
      contract: token.contract,
      checkpoint: String(block),
      at,
      availableAt: supply.observedAt,
      totalRaw: BigInt(supply.data).toString(),
      circulatingRaw: null,
      supplyVerified: true,
      coverage: "observed_sample",
      source: supply.source,
      responseHashes: [supply.hash],
      holders: balances.map((b) => ({
        address: b.address,
        raw: b.raw_quantity,
        checkpoint: String(block),
      })),
      decimals,
      blockHash,
    };
    await sql`INSERT INTO holder_metrics(token_id,observed_at,coverage,evidence) SELECT ${token.id},${supply.observedAt},'observed_sample',${jsonParam(evidence)}::jsonb WHERE NOT EXISTS(SELECT 1 FROM holder_metrics WHERE token_id=${token.id} AND canonical AND evidence->>'checkpoint'=${String(block)} AND evidence->>'blockHash'=${blockHash})`;
  } catch (error) {
    if (
      error instanceof ProviderError &&
      (error.retryAt ||
        ["COLLECTION_STOPPED", "PROCESS_REQUEST_BUDGET_EXHAUSTED"].includes(
          error.code,
        ))
    )
      throw error;
    await sql`INSERT INTO data_quality_issues(token_id,provider,kind,detail) SELECT ${token.id},${"rpc:" + token.chain_id},'supply_unavailable','Checkpoint totalSupply failed; circulating supply and top-holder concentration remain unavailable.' WHERE NOT EXISTS(SELECT 1 FROM data_quality_issues WHERE token_id=${token.id} AND kind='supply_unavailable' AND created_at>now()-interval '1 day')`;
  }
}
