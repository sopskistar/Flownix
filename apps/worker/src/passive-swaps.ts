import { z } from "zod";
import {
  config,
  HttpClient,
  EvmProvider,
  isEvmAddress,
  verifyPancakePool,
  PANCAKE_V3_SWAP,
  interpretPancakeSwap,
  pancakeFactorySource,
  type PoolIdentity,
  networkErrorCode,
  providerReads,
  ProviderError,
} from "@flownix/core";
import { sqlClient, jsonParam, auditRequest, saveSource } from "@flownix/db";

const pairsSchema = z.array(
  z
    .object({
      chainId: z.string(),
      dexId: z.string(),
      pairAddress: z.string(),
      baseToken: z.object({ address: z.string() }),
      quoteToken: z.object({ address: z.string() }),
      liquidity: z.object({ usd: z.number().optional() }).optional(),
    })
    .passthrough(),
);
const dex = new HttpClient("dexscreener", 30, auditRequest);
type Token = { id: string; chain_id: string; contract: string };
export async function discoverPool(t: Token, rpc: EvmProvider, block: number) {
  const sql = sqlClient();
  const previous =
    await sql`SELECT evidence FROM token_dex_pools WHERE token_id=${t.id} AND observed_at>now()-interval '6 hours' ORDER BY observed_at DESC LIMIT 1`;
  if (previous[0]) return previous[0].evidence.identity as PoolIdentity;
  const chain = (
    { "56": "bsc", "1": "ethereum", "8453": "base" } as Record<string, string>
  )[t.chain_id];
  if (!chain || !isEvmAddress(t.contract)) return null;
  const observation = await dex.json(
    `https://api.dexscreener.com/token-pairs/v1/${chain}/${t.contract}`,
    (x) => pairsSchema.parse(x),
  );
  await saveSource("dexscreener", observation);
  const candidates = observation.data
    .filter(
      (p) =>
        p.chainId === chain &&
        isEvmAddress(p.pairAddress) &&
        [
          p.baseToken.address.toLowerCase(),
          p.quoteToken.address.toLowerCase(),
        ].includes(t.contract),
    )
    .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))
    .slice(0, 3);
  for (const p of candidates) {
    try {
      const verified = await verifyPancakePool(
        rpc,
        p.pairAddress,
        t.contract,
        block,
      );
      const { responses, ...identity } = verified;
      for (const response of responses)
        await saveSource(`rpc:${t.chain_id}`, response);
      const evidence = {
        identity,
        discoveryResponseHash: observation.hash,
        source: pancakeFactorySource,
        scope: "One verified Pancake V3 pool; not all trading venues",
        verifiedAt: new Date().toISOString(),
      };
      await sql`INSERT INTO dex_pools(chain_id,address,token_id,source,observed_at,evidence) VALUES(${t.chain_id},${identity.address},${t.id},${pancakeFactorySource},${observation.observedAt},${jsonParam(evidence)}::jsonb) ON CONFLICT(chain_id,address) DO UPDATE SET observed_at=excluded.observed_at,evidence=excluded.evidence`;
      await sql`INSERT INTO token_dex_pools(token_id,chain_id,address,observed_at,verified_at_block,evidence) VALUES(${t.id},${t.chain_id},${identity.address},${observation.observedAt},${block},${jsonParam(evidence)}::jsonb) ON CONFLICT(token_id,chain_id,address) DO UPDATE SET observed_at=excluded.observed_at,verified_at_block=excluded.verified_at_block,evidence=excluded.evidence`;
      return identity;
    } catch {
      /* A screener's dexId is never sufficient proof of a pool's contract identity. */
    }
  }
  return null;
}
export async function collectPassiveSwaps(
  t: Token,
  rpc: EvmProvider,
  from: number,
  to: number,
) {
  if (!config().PASSIVE_SWAPS_ENABLED) return;
  const sql = sqlClient();
  try {
    const pool = await discoverPool(t, rpc, to);
    if (!pool) {
      await sql`INSERT INTO data_quality_issues(token_id,provider,kind,detail) SELECT ${t.id},'pancake_v3','swap_pool_unavailable','No factory-verified Pancake V3 pool found. Other DEX protocols remain unsupported.' WHERE NOT EXISTS(SELECT 1 FROM data_quality_issues WHERE token_id=${t.id} AND kind='swap_pool_unavailable' AND created_at>now()-interval '6 hours')`;
      return;
    }
    const observation = await rpc.eventLogs(pool.address, from, to, [
      PANCAKE_V3_SWAP,
    ]);
    await saveSource(`rpc:${t.chain_id}`, observation);
    const cap = config().SWAP_RECEIPTS_PER_WINDOW,
      selected = observation.data.slice(0, cap);
    let decoded = 0,
      attributed = 0,
      failed = false;
    for (const log of selected) {
      try {
        const receipt = await rpc.receipt(log.transactionHash);
        const swap = interpretPancakeSwap(pool, t.contract, log, receipt.data);
        if (!swap) {
          failed = true;
          continue;
        }
        const block = await rpc.block(swap.blockNumber);
        if (block.data.hash.toLowerCase() !== swap.blockHash) {
          failed = true;
          continue;
        }
        const eventTime = new Date(
          Number(BigInt(block.data.timestamp)) * 1000,
        ).toISOString();
        await saveSource(`rpc:${t.chain_id}`, receipt);
        await saveSource(`rpc:${t.chain_id}`, block);
        const evidence = {
          ...swap,
          poolProof: pool,
          receiptHash: receipt.hash,
          blockResponseHash: block.hash,
          source: receipt.source,
          availableAt: receipt.observedAt,
        };
        let newMonitor = false;
        await sql.begin(async (tx) => {
          await tx`INSERT INTO dex_trades(chain_id,event_id,token_id,pool_address,event_time,available_at,evidence) VALUES(${t.chain_id},${swap.eventId},${t.id},${pool.address},${eventTime},${receipt.observedAt},${jsonParam(evidence)}::jsonb) ON CONFLICT DO NOTHING`;
          await tx`INSERT INTO verified_swaps(chain_id,tx_hash,log_index,token_id,pool_address,block_number,block_hash,event_time,available_at,side,actor,raw_quantity,quote_contract,raw_quote,classification,evidence) VALUES(${t.chain_id},${swap.txHash},${swap.logIndex},${t.id},${pool.address},${swap.blockNumber},${swap.blockHash},${eventTime},${receipt.observedAt},${swap.side},${swap.actor},${swap.rawQuantity},${swap.quote},${swap.rawQuote},${swap.classification},${jsonParam(evidence)}::jsonb) ON CONFLICT(chain_id,tx_hash,log_index,token_id) DO UPDATE SET canonical=true,block_hash=excluded.block_hash`;
          if (swap.actor) {
            const inserted =
              await tx`INSERT INTO wallet_monitoring(token_id,chain_id,address,reason,added_by) SELECT ${t.id},${t.chain_id},${swap.actor},'Direct target-token settlement in a factory-verified on-chain swap','passive-swap/1' WHERE (SELECT count(*) FROM wallet_monitoring WHERE token_id=${t.id} AND active)<20 ON CONFLICT DO NOTHING RETURNING address`;
            newMonitor = inserted.length > 0;
          }
        });
        if (newMonitor && swap.actor) {
          // An actual opening balance is required to detect missing transfers/rebases;
          // holding a closing balance alone cannot establish purchase retention.
          for (const point of [Math.max(0, from - 1), to]) {
            try {
              const header = await rpc.block(point),
                balance = await rpc.balance(swap.actor, t.contract, point),
                decimals = await rpc.decimals(t.contract, point);
              await saveSource(`rpc:${t.chain_id}`, balance);
              await sql`INSERT INTO wallet_balance_snapshots(chain_id,address,token_id,block_number,block_hash,raw_quantity,observed_at,source,block_time,decimals) VALUES(${t.chain_id},${swap.actor},${t.id},${point},${header.data.hash.toLowerCase()},${balance.data},${balance.observedAt},${balance.source},${new Date(Number(BigInt(header.data.timestamp)) * 1000).toISOString()},${decimals}) ON CONFLICT DO NOTHING`;
            } catch {
              await sql`INSERT INTO data_quality_issues(token_id,provider,kind,detail) VALUES(${t.id},'passive_swaps','retention_opening_balance_unavailable','Swap evidence retained, but a verified opening/closing balance is unavailable; retention remains unknown.')`;
            }
          }
        }
        decoded++;
        if (swap.actor) attributed++;
      } catch {
        failed = true;
      }
    }
    const complete = !failed && observation.data.length <= cap;
    await sql`INSERT INTO swap_scan_windows(token_id,chain_id,pool_address,from_block,to_block,observed_at,event_count,decoded_count,attributed_count,complete,reason) VALUES(${t.id},${t.chain_id},${pool.address},${from},${to},${observation.observedAt},${observation.data.length},${decoded},${attributed},${complete},${complete ? "All swaps in this one pool/window decoded; global market coverage remains partial" : "Partial sample: receipt budget or verification failure; do not extrapolate net buying"}) ON CONFLICT DO NOTHING`;
    try {
      const quote = pool.token0 === t.contract ? pool.token1 : pool.token0;
      const [baseBalance, quoteBalance, liquidityBlock] = await providerReads([
        rpc.balance(pool.address, t.contract, to),
        rpc.balance(pool.address, quote, to),
        rpc.block(to),
      ]);
      await saveSource(`rpc:${t.chain_id}`, baseBalance);
      await saveSource(`rpc:${t.chain_id}`, quoteBalance);
      await saveSource(`rpc:${t.chain_id}`, liquidityBlock);
      await sql`INSERT INTO pool_liquidity_observations(token_id,chain_id,pool_address,block_number,block_hash,block_time,available_at,evidence) VALUES(${t.id},${t.chain_id},${pool.address},${to},${liquidityBlock.data.hash},${new Date(Number(BigInt(liquidityBlock.data.timestamp)) * 1000).toISOString()},${quoteBalance.observedAt},${jsonParam({ kind: "concentrated_liquidity", tokenRaw: baseBalance.data, quoteRaw: quoteBalance.data, quoteContract: quote, responseHashes: [baseBalance.hash, quoteBalance.hash, liquidityBlock.hash], poolProof: pool, effectiveDepth: null, note: "Verified V3 pool balances, not executable depth or a constant-product reserve model" })}::jsonb) ON CONFLICT(token_id,chain_id,pool_address,block_number) DO UPDATE SET block_hash=excluded.block_hash,block_time=excluded.block_time,available_at=excluded.available_at,evidence=excluded.evidence,canonical=true`;
    } catch (error) {
      if (
        error instanceof ProviderError &&
        (error.retryAt ||
          ["COLLECTION_STOPPED", "PROCESS_REQUEST_BUDGET_EXHAUSTED"].includes(
            error.code,
          ))
      )
        throw error;
      await sql`INSERT INTO data_quality_issues(token_id,provider,kind,detail) VALUES(${t.id},'pancake_v3','liquidity_history_unavailable','Pool balance snapshot unavailable; existing swap collection continues without an executable-depth assumption.')`;
    }
  } catch (error) {
    const code = networkErrorCode(error);
    await sql`INSERT INTO data_quality_issues(token_id,provider,kind,detail) VALUES(${t.id},'passive_swaps','swap_scan_unavailable',${code})`;
  }
}
