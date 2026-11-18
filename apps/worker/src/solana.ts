import { config, decodeSolanaBalanceDeltas, HttpClient, SolanaProvider } from "@flownix/core";
import { auditRequest, jsonParam, saveSource, sqlClient } from "@flownix/db";

type TokenRow = { id: string; chain_id: string; contract: string; last_seen: string };

/**
 * Bounded Solana holder-account observer. The largest-account endpoint covers
 * only 20 token accounts; observed account deltas are not buys or a holder census.
 */
export async function scanSolanaToken(token: TokenRow) {
  if (token.chain_id !== "CT_501") throw new Error("NOT_SOLANA_ALPHA_TOKEN");
  if (Date.now() - new Date(token.last_seen).getTime() > config().MAX_DATA_AGE_SECONDS * 1000)
    throw new Error("STALE_MEMBERSHIP");
  const sql = sqlClient(), c = config();
  const rpc = new SolanaProvider(
    process.env.SOLANA_RPC_URL ?? c.SOLANA_RPC_URL,
    new HttpClient("rpc:CT_501", 30, auditRequest),
  );
  const [version, slot, mint, largest] = await Promise.all([
    rpc.version(), rpc.slot(), rpc.mintInfo(token.contract), rpc.largestTokenAccounts(token.contract),
  ]);
  const top = largest.data.value.slice(0, c.SOLANA_TOP_ACCOUNTS_PER_TOKEN);
  let deltas = 0, transactions = 0, gaps = 0;
  await saveSource("solana_rpc", largest);
  for (const holder of top) {
    const [account, signatures] = await Promise.all([
      rpc.tokenAccountOwner(holder.address),
      rpc.signatures(holder.address, c.SOLANA_HISTORY_SIGNATURES_PER_ACCOUNT),
    ]);
    if (!account.data || account.data.mint !== token.contract) continue;
    await saveSource("solana_rpc", account);
    const owner = account.data.owner;
    await sql`INSERT INTO wallets(chain_id,address) VALUES('CT_501',${holder.address}),('CT_501',${owner}) ON CONFLICT DO NOTHING`;
    await sql`INSERT INTO solana_balance_observations(token_id,token_account,owner_address,signature,slot,block_time,observation_type,pre_raw,post_raw,delta_raw,decimals,observed_at,source,response_hash) VALUES(${token.id},${holder.address},${owner},NULL,${largest.data.context.slot},NULL,'top_holder_snapshot',NULL,${holder.amount},NULL,${holder.decimals},${largest.observedAt},${largest.source},${largest.hash}) ON CONFLICT DO NOTHING`;

    const cursor = (await sql`SELECT last_signature,coverage_gap FROM solana_account_cursors WHERE token_id=${token.id} AND token_account=${holder.address}`)[0] as { last_signature: string; coverage_gap: boolean } | undefined;
    const signaturesDesc = signatures.data;
    const cursorIndex = cursor ? signaturesDesc.findIndex((v) => v.signature === cursor.last_signature) : -1;
    const gap = cursor ? cursorIndex < 0 && signaturesDesc.length >= c.SOLANA_HISTORY_SIGNATURES_PER_ACCOUNT : signaturesDesc.length >= c.SOLANA_HISTORY_SIGNATURES_PER_ACCOUNT;
    const pending = cursorIndex >= 0 ? signaturesDesc.slice(0, cursorIndex) : signaturesDesc;
    for (const signature of pending.reverse()) {
      if (signature.err) continue;
      const tx = await rpc.transaction(signature.signature);
      const txData = tx.data as { blockTime?: number | null; meta?: { preTokenBalances?: unknown[] | null; postTokenBalances?: unknown[] | null } } | null;
      if (!txData?.meta || !Array.isArray(txData.meta.preTokenBalances) || !Array.isArray(txData.meta.postTokenBalances)) {
        gaps++;
        continue;
      }
      await saveSource("solana_rpc", tx);
      const changes = decodeSolanaBalanceDeltas(txData, token.contract);
      for (const change of changes) {
        await sql`INSERT INTO solana_balance_observations(token_id,token_account,owner_address,signature,slot,block_time,observation_type,pre_raw,post_raw,delta_raw,decimals,observed_at,source,response_hash) VALUES(${token.id},${change.accountAddress},${change.owner},${signature.signature},${signature.slot},${txData.blockTime ? new Date(txData.blockTime * 1000).toISOString() : null},'transaction_delta',${change.preRaw},${change.postRaw},${change.deltaRaw},${change.decimals},${tx.observedAt},${tx.source},${tx.hash}) ON CONFLICT DO NOTHING`;
        if (change.owner) await sql`INSERT INTO wallets(chain_id,address) VALUES('CT_501',${change.owner}) ON CONFLICT DO NOTHING`;
        deltas++;
      }
      transactions++;
    }
    if (signaturesDesc[0]) {
      await sql`INSERT INTO solana_account_cursors(token_id,token_account,last_signature,last_slot,scanned_at,coverage_gap) VALUES(${token.id},${holder.address},${signaturesDesc[0].signature},${signaturesDesc[0].slot},${new Date().toISOString()},${gap || !!cursor?.coverage_gap || gaps>0}) ON CONFLICT(token_id,token_account) DO UPDATE SET last_signature=excluded.last_signature,last_slot=excluded.last_slot,scanned_at=excluded.scanned_at,coverage_gap=solana_account_cursors.coverage_gap OR excluded.coverage_gap`;
    }
  }
  const result = { at: new Date().toISOString(), tokenId: token.id, mint: token.contract, slot: slot.data, solanaCore: version.data["solana-core"], tokenProgram: mint.data.tokenProgram, decimals: mint.data.decimals, topAccountsObserved: top.length, transactions, balanceDeltas: deltas, gapAccounts: gaps, completeHistory: false, note: "Top-account sampling and observed transaction balance deltas only. Not a complete holder census; deltas are not verified swaps or purchases." };
  await sql`INSERT INTO settings(key,value) VALUES(${"solana_coverage:" + token.id},${jsonParam(result)}::jsonb) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=now()`;
  console.log(JSON.stringify({ event: "solana_alpha_scan", tokenId: token.id, slot: slot.data, topAccounts: top.length, transactions, balanceDeltas: deltas, gapAccounts: gaps, completeHistory: false }));
  return result;
}
