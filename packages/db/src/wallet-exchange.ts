import { tokenKey, isChainAddress, evmChains } from "@flownix/core";
import { sqlClient } from "./index";

export async function ensureWalletMonitoring(
  token: { id: string; chain: string; contract: string },
  address: string,
  reason: string,
  sql = sqlClient(),
) {
  if (
    !isChainAddress(token.chain, address) ||
    !isChainAddress(token.chain, token.contract) ||
    tokenKey(token.chain, token.contract) !== token.id
  )
    throw Error("EXACT_ALPHA_IDENTITY_REQUIRED");
  const wallet = token.chain === "CT_501" ? address : address.toLowerCase();
  return sql.begin(async (tx) => {
    const rows =
      await tx`SELECT id FROM alpha_tokens WHERE id=${token.id} AND chain_id=${token.chain} AND contract=${token.contract} AND status='current' FOR SHARE`;
    if (rows.length !== 1)
      throw Error("CURRENT_OFFICIAL_ALPHA_IDENTITY_REQUIRED");
    await tx`INSERT INTO wallets(chain_id,address) VALUES(${token.chain},${wallet}) ON CONFLICT DO NOTHING`;
    await tx`INSERT INTO wallet_monitoring(token_id,chain_id,address,reason,added_by) VALUES(${token.id},${token.chain},${wallet},${reason},'owner') ON CONFLICT(token_id,chain_id,address) DO UPDATE SET active=true`;
  });
}

export type WalletLabelAssertion = {
  chain: string;
  address: string;
  entity: string;
  role: "possible_exchange" | "verified_exchange" | "possible_market_maker";
  sourceUrl: string;
  confidence: string;
  validFrom: string;
  validTo: string | null;
  reviewedBy: string | null;
  detail: {
    version: "exchange-address/1";
    accountRole: string;
    basis: string;
    publishedAt: string | null;
    notes: string;
    contradictions: string[];
  };
};
/** Append a revised assertion instead of overwriting a prior source or scope. */
export async function appendWalletLabel(
  assertion: WalletLabelAssertion,
  sql = sqlClient(),
) {
  const a = assertion;
  if (
    !evmChains[a.chain] ||
    !isChainAddress(a.chain, a.address) ||
    new URL(a.sourceUrl).protocol !== "https:" ||
    !Number.isFinite(Date.parse(a.validFrom)) ||
    (a.validTo &&
      (!Number.isFinite(Date.parse(a.validTo)) ||
        Date.parse(a.validTo) <= Date.parse(a.validFrom))) ||
    (a.role === "verified_exchange" &&
      (!a.reviewedBy || a.detail.basis !== "exchange_published_address"))
  )
    throw Error("INVALID_LABEL_ASSERTION");
  return sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtext(${"wallet-label:" + a.chain + ":" + a.address.toLowerCase()}))`;
    const notes = JSON.stringify(a.detail);
    const existing =
      await tx`SELECT id FROM wallet_labels WHERE chain_id=${a.chain} AND address=${a.address.toLowerCase()} AND role=${a.role} AND entity=${a.entity} AND source_url=${a.sourceUrl} AND confidence=${a.confidence} AND valid_from=${a.validFrom} AND valid_to IS NOT DISTINCT FROM ${a.validTo}::timestamptz AND reviewed_by IS NOT DISTINCT FROM ${a.reviewedBy} AND notes=${notes}`;
    if (existing.length) return { id: String(existing[0].id), inserted: false };
    const rows =
      await tx`INSERT INTO wallet_labels(chain_id,address,role,entity,source_url,confidence,valid_from,valid_to,added_by,reviewed_by,notes) VALUES(${a.chain},${a.address.toLowerCase()},${a.role},${a.entity},${a.sourceUrl},${a.confidence},${a.validFrom},${a.validTo},'wallet-exchange/1',${a.reviewedBy},${notes}) RETURNING id`;
    return { id: String(rows[0].id), inserted: true };
  });
}
