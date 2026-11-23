import {
  sharedTokenSources,
  synchronizedBuys,
  repeatedWalletPairs,
  volumeQuality,
  hashResponse,
  type Transfer,
  type ChainLabel,
  type ResearchSwap,
} from "@flownix/core";
import { sqlClient, jsonParam, setSetting } from "@flownix/db";

/** Local canonical Alpha observations only. No label API, native-funding scan or ownership assertion. */
export async function graphResearchSync(sql = sqlClient()) {
  const asOf = new Date().toISOString();
  const [rows, labelRows, pools, swaps] = await Promise.all([
    sql`SELECT e.* FROM token_transfers e JOIN alpha_tokens t ON t.id=e.token_id WHERE e.canonical AND t.chain_id=e.chain_id AND e.event_time>now()-interval '30 days' ORDER BY e.available_at DESC LIMIT 5001`,
    sql`SELECT * FROM wallet_labels`,
    sql`SELECT p.*,(SELECT max(end_time) FROM scan_windows w WHERE w.token_id=p.token_id AND w.to_block=p.verified_at_block) AS verified_block_time FROM token_dex_pools p`,
    sql`SELECT s.* FROM verified_swaps s JOIN alpha_tokens t ON t.id=s.token_id WHERE s.canonical AND s.event_time>now()-interval '30 days' ORDER BY s.available_at DESC LIMIT 5001`,
  ]);
  const labels: ChainLabel[] = labelRows.map((l) => ({
    chain: l.chain_id,
    address: l.address,
    entity: l.entity ?? "",
    role: l.role,
    verified:
      !!l.reviewed_by &&
      !/unverified|manual assertion|third.party/i.test(l.confidence),
    source: l.source_url,
    validFrom: new Date(l.valid_from).toISOString(),
    validTo: l.valid_to ? new Date(l.valid_to).toISOString() : null,
    availableAt: new Date(l.created_at).toISOString(),
  }));
  for (const p of pools)
    labels.push({
      chain: p.chain_id,
      address: p.address,
      entity: `pool:${p.address}`,
      role: "DEX_pool",
      verified: true,
      source: p.evidence.source,
      validFrom: new Date(p.verified_block_time ?? p.observed_at).toISOString(),
      validTo: null,
      availableAt: new Date(p.observed_at).toISOString(),
    });
  const transfers: Transfer[] = rows.slice(0, 5000).map((r) => ({
    chain: r.chain_id,
    tokenId: r.token_id,
    txHash: r.tx_hash,
    logIndex: r.log_index,
    blockNumber: Number(r.block_number),
    blockHash: r.block_hash,
    eventTime: new Date(r.event_time).toISOString(),
    availableAt: new Date(r.available_at).toISOString(),
    from: r.from_address,
    to: r.to_address,
    rawQuantity: String(r.raw_quantity),
    decimals: r.decimals,
    kind: r.kind,
    source: r.source,
  }));
  const result = sharedTokenSources(transfers, labels, asOf);
  const byToken = new Map<string, ResearchSwap[]>();
  for (const r of swaps.slice(0, 5000))
    byToken.set(r.token_id, [
      ...(byToken.get(r.token_id) ?? []),
      {
        eventId: `${r.chain_id}:${r.tx_hash}:${r.log_index}`,
        actor: r.actor,
        side: r.side,
        raw: String(r.raw_quantity),
        block: Number(r.block_number),
        at: new Date(r.event_time).toISOString(),
        availableAt: new Date(r.available_at).toISOString(),
        txHash: r.tx_hash,
      },
    ]);
  for (const [tokenId, trades] of byToken) {
    const chain = swaps.find((s) => s.token_id === tokenId)!.chain_id;
    const sync = synchronizedBuys(
      chain,
      tokenId,
      trades,
      labels,
      asOf,
      60,
      5,
      Math.max(0, 1000 - result.connections.length),
    );
    result.connections.push(...sync.connections);
    result.truncated ||= sync.truncated;
  }
  const feature = {
    rule: "shared-token-source/1",
    connections: result.connections,
    partialLedger: true,
    truncated: rows.length > 5000 || swaps.length > 5000 || result.truncated,
  };
  const materialized = result.connections.map((c) => ({
    chain_id: c.chain,
    address_a: c.a,
    address_b: c.b,
    rule: c.rule,
    confidence: c.confidence,
    evidence: { ...c, partialLedger: true, sampleTruncated: feature.truncated },
    research_key: hashResponse(
      `${c.rule}:${c.chain}:${c.tokenId}:${c.a}:${c.b}:${c.source}`,
    ),
    token_id: c.tokenId,
  }));
  await sql.begin(async (tx) => {
    await tx`INSERT INTO research_feature_snapshots(feature_hash,kind,computed_at,available_at,evidence) VALUES(${hashResponse(JSON.stringify(feature))},'wallet_graph',${asOf},${asOf},${jsonParam(feature)}::jsonb) ON CONFLICT DO NOTHING`;
    // One bounded batch rather than one round trip per relationship.
    await tx`INSERT INTO wallet_relationships(chain_id,address_a,address_b,rule,confidence,evidence,observed_at,research_key,token_id)
      SELECT chain_id,address_a,address_b,rule,confidence,evidence,${asOf}::timestamptz,research_key,token_id
      FROM jsonb_to_recordset(${jsonParam(materialized)}::jsonb) AS x(chain_id text,address_a text,address_b text,rule text,confidence text,evidence jsonb,research_key text,token_id text)
      ON CONFLICT(research_key) DO UPDATE SET evidence=excluded.evidence,observed_at=excluded.observed_at`;
    // Retire only our materializations. Source transactions stay canonical and auditable.
    await tx`DELETE FROM wallet_relationships WHERE research_key IS NOT NULL AND observed_at<${asOf}::timestamptz AND rule IN ('shared_token_source','synchronized_verified_buys')`;
  });
  for (const [tokenId, rows] of byToken)
    await setSetting(
      `volume_quality:${tokenId}`,
      {
        at: asOf,
        scope: "Canonical observed swaps only; incomplete venues/history",
        wallets: [
          ...new Set(rows.map((r) => r.actor).filter((a): a is string => !!a)),
        ].map((address) => ({
          address,
          ...volumeQuality(rows, address, asOf),
        })),
      },
      sql,
    );
  await setSetting(
    "graph_research_sync",
    {
      at: asOf,
      transferSample: transfers.length,
      swapSample: swaps.length,
      truncated: rows.length > 5000 || swaps.length > 5000 || result.truncated,
      connections: result.connections.length,
      repeatedPairs: repeatedWalletPairs(result.connections),
      freshWalletBirthCoverage: "unavailable",
      commonOwnershipVerified: false,
    },
    sql,
  );
  return { connections: result.connections.length, externalRequests: 0 };
}
