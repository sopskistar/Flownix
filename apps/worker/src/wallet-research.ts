import { randomUUID } from "node:crypto";
import {
  researchWindows,
  walletResearch,
  exchangeResearch,
  possibleRoundTrips,
  evaluateAccumulationThesis,
  freshness,
  providerReads,
  supplyConcentration,
  hashResponse,
  type Transfer,
  type ResearchSwap,
  type ResearchBalance,
  type LedgerWindow,
  type EvidenceLabel,
  type ResearchState,
} from "@flownix/core";
import { sqlClient, jsonParam, setSetting } from "@flownix/db";

export async function walletResearchSync() {
  const sql = sqlClient(),
    now = new Date().toISOString();
  const tokens =
    await sql`SELECT t.* FROM alpha_tokens t WHERE t.deep_selected OR EXISTS(SELECT 1 FROM watchlists w WHERE w.token_id=t.id AND NOT w.archived) OR EXISTS(SELECT 1 FROM token_investigation_queue q WHERE q.token_id=t.id AND q.active) OR EXISTS(SELECT 1 FROM wallet_monitoring m WHERE m.token_id=t.id AND m.chain_id=t.chain_id AND m.active)`;
  for (const token of tokens) {
    const [
      events,
      tradeRows,
      balanceRows,
      windows,
      labels,
      monitored,
      priceRows,
      swapCoverage,
    ] = await providerReads([
      sql`SELECT * FROM token_transfers WHERE token_id=${token.id} AND canonical AND event_time>now()-interval '180 days' ORDER BY block_number,log_index LIMIT 100001`,
      sql`SELECT * FROM verified_swaps WHERE token_id=${token.id} AND canonical AND event_time>now()-interval '180 days' ORDER BY block_number,log_index LIMIT 50001`,
      sql`SELECT * FROM wallet_balance_snapshots WHERE token_id=${token.id} AND canonical AND block_time IS NOT NULL ORDER BY block_number LIMIT 100001`,
      sql`SELECT * FROM scan_windows WHERE token_id=${token.id} ORDER BY from_block LIMIT 100001`,
      sql`SELECT * FROM wallet_labels WHERE chain_id=${token.chain_id} AND (valid_to IS NULL OR valid_to>now()-interval '180 days')`,
      sql`SELECT * FROM wallet_monitoring WHERE token_id=${token.id} AND chain_id=${token.chain_id} AND active ORDER BY (added_by='owner') DESC,added_at LIMIT 20`,
      sql`SELECT * FROM market_snapshots WHERE token_id=${token.id} AND source_kind='alpha_market' ORDER BY observed_at DESC LIMIT 1`,
      sql`SELECT count(*)::int AS windows,count(*) FILTER(WHERE p.complete)::int AS complete,min(s.start_time) AS first_time,max(s.end_time) AS last_time,
        (SELECT coalesce(sum(extract(epoch FROM upper(period)-lower(period))),0)::float8 FROM unnest((SELECT range_agg(tstzrange(greatest(w.start_time,${token.first_seen}::timestamptz),w.end_time,'[)')) FROM swap_scan_windows c JOIN scan_windows w ON w.token_id=c.token_id AND w.from_block=c.from_block AND w.to_block=c.to_block WHERE c.token_id=${token.id} AND c.complete AND w.complete AND w.end_time>greatest(w.start_time,${token.first_seen}::timestamptz))) AS period) AS covered_seconds
        FROM swap_scan_windows p JOIN scan_windows s ON s.token_id=p.token_id AND s.from_block=p.from_block AND s.to_block=p.to_block WHERE p.token_id=${token.id}`,
    ]);
    const truncated =
      events.length > 100000 ||
      tradeRows.length > 50000 ||
      balanceRows.length > 100000 ||
      windows.length > 100000;
    const transfers: Transfer[] = events.slice(0, 100000).map((e) => ({
      chain: e.chain_id,
      tokenId: e.token_id,
      txHash: e.tx_hash,
      logIndex: e.log_index,
      blockNumber: Number(e.block_number),
      blockHash: e.block_hash,
      eventTime: new Date(e.event_time).toISOString(),
      availableAt: new Date(e.available_at).toISOString(),
      from: e.from_address,
      to: e.to_address,
      rawQuantity: String(e.raw_quantity),
      decimals: e.decimals,
      kind: e.kind,
      source: e.source,
    }));
    const swaps: ResearchSwap[] = tradeRows.slice(0, 50000).map((s) => ({
      eventId: `${s.chain_id}:${s.tx_hash}:${s.log_index}`,
      actor: s.actor,
      side: s.side,
      raw: String(s.raw_quantity),
      block: Number(s.block_number),
      at: new Date(s.event_time).toISOString(),
      availableAt: new Date(s.available_at).toISOString(),
      txHash: s.tx_hash,
    }));
    const ledger: LedgerWindow[] = windows.map((w) => ({
      from: Number(w.from_block),
      to: Number(w.to_block),
      complete: w.complete && !truncated,
      availableAt: new Date(w.available_at).toISOString(),
    }));
    const attribution: EvidenceLabel[] = labels.map((l) => ({
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
    const observedStart = windows[0]?.start_time
      ? new Date(windows[0].start_time).toISOString()
      : now;
    const qualifiedStart = new Date(
      Math.max(Date.parse(observedStart), new Date(token.first_seen).getTime()),
    ).toISOString();
    const [holderContext, graphContext, derivativeContext] =
      await providerReads([
        sql`SELECT evidence FROM holder_metrics WHERE token_id=${token.id} AND canonical AND observed_at<=${now} ORDER BY observed_at DESC LIMIT 1`,
        sql`SELECT chain_id,address_a,address_b,rule,confidence,evidence,observed_at FROM wallet_relationships WHERE token_id=${token.id} AND observed_at<=${now} ORDER BY observed_at DESC LIMIT 20`,
        sql`SELECT symbol,provider_time,observed_at,evidence FROM derivatives_observations WHERE token_id=${token.id} AND observed_at<=${now} ORDER BY observed_at DESC LIMIT 1`,
      ]);
    const researchContext = {
      computedAt: now,
      availableAt: now,
      stage: "candidate_context_only",
      validatedStrategy: false,
      supply: holderContext[0]
        ? supplyConcentration(
            holderContext[0].evidence,
            attribution.map((l) => ({ ...l, chain: token.chain_id })),
            now,
          )
        : { status: "unavailable" },
      walletConnections: graphContext,
      derivatives: derivativeContext,
      socialFeed:
        "unavailable; manual research leads are excluded from automatic mention statistics",
      caveat:
        "Context is available only after its collection/review timestamps; it does not override retention, membership, independence or market freshness gates",
    };
    await sql`INSERT INTO research_feature_snapshots(feature_hash,kind,computed_at,available_at,evidence) VALUES(${hashResponse(JSON.stringify({ tokenId: token.id, ...researchContext }))},'token_research_context',${now},${now},${jsonParam({ tokenId: token.id, ...researchContext })}::jsonb) ON CONFLICT DO NOTHING`;
    const transferEnd = windows.at(-1)?.end_time
      ? new Date(windows.at(-1)!.end_time).toISOString()
      : null;
    const poolEnd = swapCoverage[0].last_time
      ? new Date(swapCoverage[0].last_time).toISOString()
      : null;
    // Union of actually completed joint transfer/pool intervals. Gaps and overlapping
    // replays must never become weeks of fictitious monitoring history.
    const observedDays = truncated
      ? 0
      : Math.max(0, Number(swapCoverage[0].covered_seconds ?? 0) / 86400);
    const materializedWallets: Record<string, unknown>[] = [];
    const walletReports: ReturnType<typeof walletResearch>[] = [];
    for (const days of researchWindows) {
      const start = new Date(Date.parse(now) - days * 86400000).toISOString();
      const reports = [];
      for (const monitor of monitored) {
        const balances: ResearchBalance[] = balanceRows
          .filter((b) => b.address === monitor.address)
          .map((b) => ({
            block: Number(b.block_number),
            blockHash: b.block_hash,
            raw: String(b.raw_quantity),
            at: new Date(b.block_time).toISOString(),
            availableAt: new Date(b.observed_at).toISOString(),
          }));
        const report = walletResearch({
          address: monitor.address,
          start,
          end: now,
          asOf: now,
          balances,
          transfers: transfers.filter(
            (t) => t.from === monitor.address || t.to === monitor.address,
          ),
          swaps,
          windows: ledger,
        });
        reports.push(report);
        if (days === 30) walletReports.push(report);
        materializedWallets.push({
          token_id: token.id,
          chain_id: token.chain_id,
          address: monitor.address,
          window_days: days,
          computed_at: now,
          evidence: report,
        });
      }
      const scoped = transfers.filter(
        (t) => t.eventTime >= start && t.eventTime <= now,
      );
      const flow = exchangeResearch(scoped, attribution, now);
      const roundTrips = possibleRoundTrips(
        swaps.filter((s) => s.at >= start),
        now,
      );
      const fraction = swapCoverage[0].windows
        ? swapCoverage[0].complete / swapCoverage[0].windows
        : 0;
      const metrics = {
        context: researchContext,
        state: "INSUFFICIENT EVIDENCE",
        observedDays,
        windowDays: days,
        requestedStart: start,
        observedStart: qualifiedStart,
        wallets: reports,
        exchangeFlows: flow,
        turnoverRisk: roundTrips,
        verifiedSwapRecords: swaps.filter((s) => s.at >= start).length,
        coverage: {
          walletsSampled: monitored.length,
          holderCensus: false,
          swapPoolWindows: swapCoverage[0].windows,
          completePoolWindowFraction: swapCoverage[0].windows ? fraction : null,
          truncated,
          globalBuyingCoverage: "unknown",
        },
        caveats: [
          "Address sample, not the top-holder census",
          "Unattributed swaps, other pools and inaccessible internal exchange activity remain unknown",
          "Concentration, market-maker and team ownership are not inferred from balance size",
        ],
      };
      await sql`INSERT INTO accumulation_observations(token_id,window_days,computed_at,window_start,window_end,coverage,metrics) VALUES(${token.id},${days},${now},${start},${now},${jsonParam(metrics.coverage)}::jsonb,${jsonParam(metrics)}::jsonb) ON CONFLICT DO NOTHING`;
    }
    if (materializedWallets.length)
      await sql`INSERT INTO wallet_research_observations(token_id,chain_id,address,window_days,computed_at,evidence) SELECT * FROM jsonb_to_recordset(${jsonParam(materializedWallets)}::jsonb) AS r(token_id text,chain_id text,address text,window_days integer,computed_at timestamptz,evidence jsonb) WHERE true ON CONFLICT DO NOTHING`;
    const retained = walletReports.filter(
      (w) =>
        w.retentionLowerBoundPct !== null &&
        w.retentionLowerBoundPct >= 80 &&
        w.transferBalanceReconciled === true &&
        freshness(w.balanceObservedAt) === "current",
    );
    const buyDays = new Set(
      swaps
        .filter((s) => s.side === "buy" && s.actor && s.at >= qualifiedStart)
        .map((s) => s.at.slice(0, 10)),
    ).size;
    const market = priceRows[0];
    const candles = market
      ? await sql`SELECT close::text FROM ohlcv_candles WHERE symbol=${market.symbol} AND close_at>=${qualifiedStart} AND available_at<=${now} ORDER BY close_at LIMIT 1`
      : [];
    const change =
      market && candles.length && Number(candles[0].close) > 0
        ? (Number(market.price) / Number(candles[0].close) - 1) * 100
        : null;
    const coverage =
      swapCoverage[0].windows && !truncated
        ? Math.min(1, observedDays / 7) *
          (swapCoverage[0].complete / swapCoverage[0].windows)
        : 0;
    const state = evaluateAccumulationThesis(
      token.research_state as ResearchState,
      {
        observedDays,
        buyDays,
        retainingAddresses: retained.length,
        retentionPct: retained.length
          ? Math.min(...retained.map((r) => r.retentionLowerBoundPct!))
          : null,
        coverage,
        marketFresh:
          !!market &&
          freshness(market.observed_at) === "current" &&
          freshness(market.provider_time) === "current" &&
          freshness(transferEnd) === "current" &&
          freshness(poolEnd) === "current",
        membershipCurrent:
          token.status === "current" &&
          freshness(token.last_seen) === "current",
        priceChangePct: change,
        verifiedDistribution: false,
        distributionEvidenceIds: [],
        independenceVerified: false,
        possibleIncentiveTrading: !!possibleRoundTrips(
          swaps.filter(
            (s) =>
              s.at >= new Date(Date.parse(now) - 30 * 86400000).toISOString(),
          ),
          now,
        ).kind,
        txIds: swaps
          .filter((s) => s.actor)
          .slice(-100)
          .map((s) => s.eventId),
        availableAt: now,
      },
      now,
    );
    await sql`UPDATE accumulation_observations SET metrics=metrics || ${jsonParam({ state: state.state, thesis: state })}::jsonb WHERE token_id=${token.id} AND computed_at=${now}`;
    if (state.state !== token.research_state) {
      await sql.begin(async (tx) => {
        await tx`UPDATE alpha_tokens SET research_state=${state.state} WHERE id=${token.id}`;
        await tx`INSERT INTO research_state_history(token_id,from_state,to_state,observed_at,rule_version,evidence,reason) VALUES(${token.id},${token.research_state},${state.state},${now},${state.ruleVersion},${jsonParam(state)}::jsonb,${state.reason})`;
        if (state.confidence !== "insufficient") {
          const id = randomUUID();
          await tx`INSERT INTO signal_events(id,token_id,kind,rule_version,stage,first_detected_at,computed_at,data_available_at,price_at_detection,quote_asset,market_snapshot_id,evidence_confidence,thresholds,observed,counter_evidence,message) VALUES(${id},${token.id},'QUIET_ACCUMULATION_RESEARCH',${state.ruleVersion},'INVESTIGATE',${now},${now},${now},${market?.price ?? null},${market?.quote_asset ?? null},${market?.id ?? null},${state.confidence},${jsonParam(state.thresholds)}::jsonb,${jsonParam({ observedDays, buyDays, retainingAddresses: retained.length, priceChangePct: change, evidenceIds: state.evidenceIds })}::jsonb,${jsonParam(state.risks)}::jsonb,${state.reason})`;
          for (const s of tradeRows.filter((s) => s.actor).slice(-100))
            await tx`INSERT INTO signal_evidence(signal_id,chain_id,tx_hash,log_index) VALUES(${id},${s.chain_id},${s.tx_hash},${s.log_index}) ON CONFLICT DO NOTHING`;
          await tx`INSERT INTO notification_deliveries(id,signal_id,channel,status,payload) VALUES(${randomUUID()},${id},'in_app','delivered',${jsonParam({ text: state.reason, kind: "QUIET_ACCUMULATION_RESEARCH", token: token.symbol, caveats: state.risks })}::jsonb)`;
        }
      });
    }
  }
  await setSetting("persistence_sync", {
    at: now,
    tokens: tokens.length,
    windows: researchWindows,
    adapter: "factory-verified Pancake V3 settlement sample",
    history:
      "Only actually collected balances and trades; no historical success claim",
  });
}
