import {
  explorerUrl,
  hashResponse,
  isChainAddress,
  tokenKey,
  evmChains,
} from "@flownix/core";
import { jsonParam, sqlClient } from "@flownix/db";

export const observedRule = "canonical-activity/1";

export async function evaluateObservedResearch(
  from: Date,
  until: Date,
  sql = sqlClient(),
  historical = false,
) {
  // The live path requires both source time and local availability in the
  // current duty interval. Historical evaluation uses the same factual gates.
  const rows = await sql`
    WITH transfer AS (
      SELECT e.*, labels.supported,labels.direction,labels.sources
      FROM token_transfers e
      JOIN alpha_tokens t ON t.id=e.token_id AND t.chain_id=e.chain_id
      LEFT JOIN LATERAL (
        SELECT count(DISTINCT l.address)=1 AND count(DISTINCT l.entity)=1
          AND bool_and(l.role='verified_exchange' AND l.reviewed_by IS NOT NULL
            AND l.added_by='wallet-exchange/1' AND l.confidence !~* 'unverified|manual|third.party'
            AND l.source_url LIKE 'https://%') AS supported,
          CASE WHEN min(l.address)=e.to_address THEN 'inflow' ELSE 'outflow' END AS direction,
          jsonb_agg(DISTINCT jsonb_build_object('entity',l.entity,'source',l.source_url,'confidence',l.confidence)) AS sources
        FROM wallet_labels l WHERE l.chain_id=e.chain_id AND l.address IN (e.from_address,e.to_address)
          AND l.role IN ('verified_exchange','possible_exchange','DEX_pool','router','bridge','burn')
          AND l.valid_from<=e.event_time AND (l.valid_to IS NULL OR l.valid_to>e.event_time)
          AND l.created_at<=e.available_at
      ) labels ON true
      WHERE e.canonical AND e.kind='unknown_transfer' AND e.raw_quantity>0 AND e.from_address<>e.to_address
        AND e.event_time>=${from} AND e.event_time<=e.available_at AND e.available_at<=${until}
    ), finding AS (
      SELECT 'DOCUMENTED_EXCHANGE_FLOW' AS kind,e.token_id,e.chain_id,e.tx_hash,e.log_index,
        e.event_time,e.available_at,'tx:'||e.tx_hash||':'||e.log_index AS evidence_key,
        'Documented exchange address '||e.direction AS message,
        jsonb_build_object('block',e.block_number::text,'blockHash',e.block_hash,'rawQuantity',e.raw_quantity::text,'decimals',e.decimals,
          'from',e.from_address,'to',e.to_address,'attribution',e.sources) AS detail, 1 AS priority
      FROM transfer e WHERE e.supported
      UNION ALL
      SELECT 'OBSERVED_SWAP_SETTLEMENT',v.token_id,v.chain_id,v.tx_hash,v.log_index,v.event_time,v.available_at,
        'tx:'||v.tx_hash||':'||v.log_index,
        'Verified pool '||v.side||' settlement. '||CASE WHEN v.actor IS NULL THEN 'Participant attribution unavailable.' ELSE 'Recorded execution address; ownership unknown.' END,
        jsonb_build_object('block',v.block_number::text,'blockHash',v.block_hash,'pool',v.pool_address,
          'actor',v.actor,'side',v.side,'classification',v.classification,'receiptHash',r.hash,
          'rawQuantity',v.raw_quantity::text,'rawQuote',v.raw_quote::text,'quoteContract',v.quote_contract),2
      FROM verified_swaps v
      JOIN source_responses r ON r.hash=v.evidence->>'receiptHash' AND r.provider='rpc:'||v.chain_id
      WHERE v.canonical AND v.event_time>=${from} AND v.event_time<=v.available_at AND v.available_at<=${until}
      UNION ALL
      SELECT 'OBSERVED_TRANSFER_SURGE',w.token_id,e.chain_id,e.tx_hash,e.log_index,w.end_time,w.available_at,
        'window:'||w.from_block||':'||w.to_block,
        'Unusual confirmed transfer count in a sampled block window.',
        jsonb_build_object('fromBlock',w.from_block::text,'toBlock',w.to_block::text,'sampledTransfers',e.event_count,
          'baselineWindows',b.n,'baselineMean',b.mean,'representativeEventTime',e.event_time,
          'representativeCollectedAt',e.available_at,'blockHash',e.block_hash),3
      FROM scan_windows w
      JOIN LATERAL (
        SELECT count(*) OVER () AS event_count,transfer.* FROM transfer
        WHERE token_id=w.token_id AND block_number BETWEEN w.from_block AND w.to_block AND available_at<=w.available_at
        ORDER BY block_number,log_index LIMIT 1
      ) e ON true
      JOIN LATERAL (
        SELECT count(*) AS n,avg(count) AS mean FROM (
          SELECT count FROM scan_windows prev WHERE prev.token_id=w.token_id AND prev.complete
            AND prev.to_block<w.from_block AND prev.to_block-prev.from_block=w.to_block-w.from_block
            AND prev.available_at<=w.available_at AND prev.end_time<=w.start_time ORDER BY prev.to_block DESC LIMIT 6
        ) previous
      ) b ON true
      WHERE w.complete AND w.start_time>=${from} AND w.end_time<=w.available_at AND w.available_at<=${until}
        AND b.n=6 AND e.event_count>=greatest(25,b.mean*3)
      UNION ALL
      SELECT 'MATERIAL_BALANCE_CHANGE',b.token_id,b.chain_id,NULL,NULL,b.block_time,b.observed_at,
        'balance:'||b.address||':'||b.block_hash,
        'Material observed balance '||CASE WHEN b.raw_quantity>p.raw_quantity THEN 'increase' ELSE 'decrease' END||'; cause requires verification.',
        jsonb_build_object('wallet',b.address,'block',b.block_number::text,'blockHash',b.block_hash,'previousBlockHash',p.block_hash,
          'beforeRaw',p.raw_quantity::text,'afterRaw',b.raw_quantity::text,'decimals',b.decimals,'previousEventTime',p.block_time,
          'previousCollectedAt',p.observed_at),4
      FROM wallet_balance_snapshots b
      JOIN LATERAL (
        SELECT * FROM wallet_balance_snapshots p WHERE p.token_id=b.token_id AND p.chain_id=b.chain_id AND p.address=b.address
          AND p.canonical AND p.block_number<b.block_number AND p.block_time<b.block_time AND p.observed_at<b.observed_at
          AND p.decimals=b.decimals ORDER BY p.block_number DESC,p.observed_at DESC LIMIT 1
      ) p ON true
      WHERE b.canonical AND b.block_time>=${from} AND b.block_time<=b.observed_at AND b.observed_at<=${until}
        AND abs(b.raw_quantity-p.raw_quantity)>=greatest(power(10::numeric,b.decimals),p.raw_quantity/5)
    )
    SELECT f.*,t.symbol,t.contract,t.alpha_id,t.response_hash AS registry_hash
    FROM finding f JOIN alpha_tokens t ON t.id=f.token_id AND t.chain_id=f.chain_id
    WHERE t.alpha_id IS NOT NULL AND t.first_seen<=f.event_time
      AND (${historical} OR t.status='current')
    ORDER BY priority,available_at DESC,evidence_key,token_id LIMIT 500`;
  return rows.flatMap((row) => {
    if (
      !isChainAddress(row.chain_id, row.contract) ||
      tokenKey(row.chain_id, row.contract) !== row.token_id
    )
      return [];
    const transaction = row.tx_hash
      ? explorerUrl(row.chain_id, "tx", row.tx_hash)
      : null;
    const explorer = evmChains[row.chain_id]?.explorer;
    const evidenceUrl =
      transaction ??
      (explorer && /^\d+$/.test(row.detail.block)
        ? `${explorer}/block/${row.detail.block}`
        : null);
    if (!evidenceUrl) return [];
    return [
      {
        id: hashResponse(
          `${row.kind}:${row.token_id}:${row.evidence_key}`,
        ).slice(0, 32),
        tokenId: String(row.token_id),
        chain: String(row.chain_id),
        contract: String(row.contract),
        symbol: String(row.symbol),
        kind: String(row.kind),
        message: String(row.message),
        txHash: transaction ? String(row.tx_hash) : null,
        logIndex: Number(row.log_index),
        eventTime: new Date(row.event_time).toISOString(),
        collectedAt: new Date(row.available_at).toISOString(),
        evidenceUrl,
        provenance: {
          registryHash: String(row.registry_hash),
          alphaId: String(row.alpha_id),
          method: transaction
            ? row.kind === "OBSERVED_SWAP_SETTLEMENT"
              ? "Canonical pool receipt and validated settlement"
              : "Canonical token contract Transfer log"
            : "Canonical RPC balance checkpoints",
        },
        detail: row.detail as Record<string, unknown>,
      },
    ];
  });
}

export async function persistObservedResearch(
  from: Date,
  until: Date,
  sql = sqlClient(),
) {
  const findings = await evaluateObservedResearch(from, until, sql);
  // One representative per identity and classification per duty window.
  const representatives = findings.filter(
    (f, index) =>
      findings.findIndex(
        (other) => other.tokenId === f.tokenId && other.kind === f.kind,
      ) === index,
  );
  await sql`
    WITH candidates AS (
      SELECT fields.*, value AS evidence
      FROM jsonb_array_elements(${jsonParam(representatives)}::jsonb)
      CROSS JOIN LATERAL jsonb_to_record(value)
        AS fields(id text,"tokenId" text,kind text,chain text,"txHash" text,"logIndex" int,
          "collectedAt" timestamptz,message text)
    ), inserted AS (
      INSERT INTO signal_events(id,token_id,kind,rule_version,stage,first_detected_at,computed_at,
        data_available_at,evidence_confidence,thresholds,observed,counter_evidence,message)
      SELECT f.id,f."tokenId",f.kind,${observedRule},'OBSERVED',now(),now(),f."collectedAt",'limited','{}',
        f.evidence,'["Partial sampled coverage","Ownership and accumulation, distribution and intent remain unproven"]',f.message
      FROM candidates f
      ON CONFLICT DO NOTHING RETURNING id
    ), linked AS (
      INSERT INTO signal_evidence(signal_id,chain_id,tx_hash,log_index)
      SELECT f.id,f.chain,f."txHash",f."logIndex" FROM candidates f JOIN inserted i USING(id)
      WHERE f."txHash" IS NOT NULL ON CONFLICT DO NOTHING
    ) SELECT count(*) FROM inserted`;
  return representatives.length;
}
