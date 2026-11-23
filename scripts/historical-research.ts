import { readFile, writeFile, mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import {
  AlphaProvider,
  HttpClient,
  installRequestPolicy,
  withRequestWorkload,
  networkErrorCode,
  closeProviderNetwork,
  hashResponse,
  normalizeRegistry,
  preferredAlphaPair,
  historicalEpisodes,
  historicalEpisodeSpec,
  historicalFeatureCutoffs,
  matchHistoricalControls,
  fixedWindowCohort,
  researchPatternComparison,
  processMetrics,
  type StudyCandle,
  type HistoricalObservation,
  type ControlRiskRow,
} from "../packages/core/src/index";
import {
  sqlClient,
  closeDb,
  workerRequestPolicy,
  auditRequest,
  saveSource,
} from "../packages/db/src/index";
import { registrySync, storeCandles } from "../apps/worker/src/ingest";
import { reconcileScanJobs } from "../apps/worker/src/scheduler";
import { persistHistoricalStudy } from "../apps/worker/src/listing-storage";
process.env.DATABASE_URL =
  process.env.DATABASE_URL_WORKER ?? process.env.DATABASE_URL;
const timer = setInterval(() => {}, 1000),
  deadline = setTimeout(() => {
    console.error(
      "HISTORICAL_RESEARCH_DEADLINE: committed pages remain resumable",
    );
    process.exit(1);
  }, 1800000);
const iso = (s: unknown) => new Date(s as string).toISOString();
const errorCode = (e: unknown) =>
  e instanceof Error && /^[A-Z_]+$/.test(e.message)
    ? e.message
    : networkErrorCode(e);
const candle = (r: Record<string, unknown>): StudyCandle => ({
  openAt: iso(r.open_at),
  closeAt: iso(r.close_at),
  availableAt: iso(r.available_at),
  open: String(r.open),
  high: String(r.high),
  low: String(r.low),
  close: String(r.close),
  volume: String(r.volume),
  hash: String(r.response_hash),
});
async function main() {
  const started = Date.now(),
    sql = sqlClient();
  installRequestPolicy(workerRequestPolicy(sql));
  const manifest = JSON.parse(
    await readFile("docs/evidence/HISTORICAL_COHORT_V1.json", "utf8"),
  );
  const from = Date.parse(manifest.windowStart),
    end = Date.parse(manifest.windowEnd);
  if (
    !Number.isFinite(from) ||
    !Number.isFinite(end) ||
    end <= from ||
    end > Date.now() ||
    end - from > 500 * 86400000
  )
    throw Error("INVALID_BOUNDED_HISTORY_WINDOW");
  const collectControls = process.argv.includes("--collect-controls");
  const collect = process.argv.includes("--collect") || collectControls,
    batch = Number(process.env.HISTORICAL_BATCH_SIZE ?? 12),
    pages = Number(process.env.HISTORICAL_PAGES_PER_TOKEN ?? 8);
  if (
    !Number.isInteger(batch) ||
    batch < 1 ||
    batch > 25 ||
    !Number.isInteger(pages) ||
    pages < 1 ||
    pages > 8
  )
    throw Error("INVALID_HISTORY_BATCH");
  if (collect)
    process.env.PROVIDER_PROCESS_REQUEST_BUDGET = String(
      Math.min(100, Number(process.env.PROVIDER_PROCESS_REQUEST_BUDGET) || 100),
    );
  const lock = await sql.reserve();
  let acquired = false;
  try {
    acquired = (await lock`SELECT pg_try_advisory_lock(726032) AS acquired`)[0]
      .acquired;
    if (!acquired) throw Error("COLLECTOR_BUSY");
    const before = (
      await sql`SELECT pg_database_size(current_database())::text AS bytes`
    )[0].bytes;
    if (Number(before) > 600 * 1048576)
      throw Error("HISTORY_STORAGE_RESERVE_REQUIRED");
    const alpha = new AlphaProvider(
      new HttpClient("binance_alpha", 30, auditRequest),
    );
    if (collect) {
      await registrySync(await alpha.registry());
      await reconcileScanJobs();
    }
    const tokens =
      await sql`SELECT * FROM alpha_tokens WHERE alpha_id IS NOT NULL ORDER BY id`;
    const identities = (
      manifest.claims as {
        symbol: string;
        chain: string;
        suppliedContract: string;
        claimedPrices: Record<string, unknown>;
      }[]
    ).map((c) => {
      const matches = tokens.filter(
        (t) =>
          t.chain_id === c.chain &&
          t.contract === c.suppliedContract.toLowerCase() &&
          t.symbol.toUpperCase() === c.symbol.toUpperCase(),
      );
      return {
        lead: c,
        matches: matches.map((t) => ({
          tokenId: t.id,
          chain: t.chain_id,
          contract: t.contract,
          alphaId: t.alpha_id,
          symbol: t.symbol,
          name: t.name,
          status: t.status,
          sourceHash: t.response_hash,
        })),
        status:
          matches.length === 1
            ? "official_identity_matched"
            : "ambiguous_or_unmatched",
      };
    });
    for (const c of identities) {
      const evidence = {
          ...c,
          claimedFact: c.lead.claimedPrices,
          sourceUrl: null,
          verificationStatus: "unverified_claim",
          originalPublishedAt: null,
          firstLocalObservation: "database available_at",
          contradictions: [],
          revisions: [],
        },
        hash = hashResponse(JSON.stringify(evidence));
      await sql`INSERT INTO research_feature_snapshots(feature_hash,kind,computed_at,available_at,evidence) VALUES(${hash},'historical_case_claim',now(),now(),${sql.json(JSON.parse(JSON.stringify(evidence)))}) ON CONFLICT DO NOTHING`;
    }
    for (const source of manifest.sources) {
      const t = tokens.find((t) =>
        identities.some(
          (i: { lead: { symbol: string }; matches: { tokenId: string }[] }) =>
            i.lead.symbol === source.symbol &&
            i.matches.some((m) => m.tokenId === t.id),
        ),
      );
      if (!t || new URL(source.sourceUrl).protocol !== "https:") continue;
      await sql`INSERT INTO research_leads(id,token_id,kind,source_url,author,body,claimed_published_at,claimed_event_at,status,verified_at,revision_of) SELECT ${randomUUID()},${t.id},${source.kind},${source.sourceUrl},${source.author},${source.body},${source.claimedPublishedAt ? new Date(source.claimedPublishedAt) : null},${source.eventAt ? new Date(source.eventAt) : null},${source.status},${source.status === "verified_source" ? new Date() : null},(SELECT id FROM research_leads WHERE token_id=${t.id} AND source_url=${source.sourceUrl} ORDER BY first_observed_at DESC LIMIT 1) WHERE NOT EXISTS(SELECT 1 FROM research_leads WHERE token_id=${t.id} AND source_url=${source.sourceUrl} AND body=${source.body} AND kind=${source.kind})`;
    }
    const collection = [];
    if (collect) {
      const exchange = await alpha.exchange();
      await saveSource("binance_alpha", exchange);
      const attempts =
        await sql`SELECT evidence->>'tokenId' AS token_id,max(available_at) AS at FROM research_feature_snapshots WHERE kind='episode_collection_attempt' AND evidence->>'windowStart'=${manifest.windowStart} AND evidence->>'windowEnd'=${manifest.windowEnd} GROUP BY evidence->>'tokenId'`;
      const at = new Map(attempts.map((a) => [a.token_id, Date.parse(a.at)])),
        priority = new Set(
          identities.flatMap((i: { matches: { tokenId: string }[] }) =>
            i.matches.map((m) => m.tokenId),
          ),
        );
      const savedControlIds = new Set<string>();
      if (collectControls) {
        const saved = (
          await sql`SELECT report FROM event_study_runs WHERE spec_version='historical-episodes/1' AND jsonb_typeof(report)='object' ORDER BY computed_at DESC LIMIT 1`
        )[0]?.report;
        if (!saved) throw Error("SAVE_PREDECLARED_CONTROLS_FIRST");
        for (const group of saved.controls ?? [])
          for (const c of group.selected ?? []) savedControlIds.add(c.tokenId);
      }
      const selected = tokens
        .filter((t) => !collectControls || savedControlIds.has(t.id))
        .toSorted(
          (a, b) =>
            (at.get(a.id) ?? -Infinity) - (at.get(b.id) ?? -Infinity) ||
            Number(priority.has(b.id)) - Number(priority.has(a.id)) ||
            a.id.localeCompare(b.id),
        )
        .slice(0, batch);
      for (const t of selected) {
        const pair = preferredAlphaPair(t.alpha_id, exchange.data.symbols);
        let requests = 0,
          added = 0,
          reason: string | null = null;
        if (pair) {
          const collectionFrom = collectControls
            ? Date.parse(manifest.controlAnchor) - 3600000
            : from;
          let until = end - 1;
          for (let page = 0; page < pages && until >= collectionFrom; page++) {
            if (
              Number(
                (
                  await sql`SELECT pg_database_size(current_database())::text AS bytes`
                )[0].bytes,
              ) >
              675 * 1048576
            ) {
              reason = "HISTORY_STORAGE_RESERVE_REQUIRED";
              break;
            }
            const start = Math.max(collectionFrom, until - 1500 * 3600000 + 1);
            const old = (
              await sql`SELECT count(*)::int AS n FROM ohlcv_candles WHERE symbol=${pair.symbol} AND interval='1h' AND open_at>=${new Date(start)} AND open_at<=${new Date(until)}`
            )[0].n;
            if (old === Math.ceil((until - start + 1) / 3600000)) {
              until = start - 1;
              continue;
            }
            try {
              requests++;
              const response = await alpha.klines(pair.symbol, until, start);
              if (
                response.data.some(
                  (k) => Number(k[0]) < start || Number(k[0]) > until,
                )
              )
                throw Error("HISTORY_RANGE_MISMATCH");
              await storeCandles(pair.symbol, response);
              added += response.data.length;
              if (!response.data.length) {
                reason = "NO_RETURNED_HISTORY_BEFORE_BOUND";
                break;
              }
              until = start - 1;
            } catch (error) {
              reason = errorCode(error);
              break;
            }
          }
        } else
          reason =
            "NO_ACTIVE_PAIR: offline/removed identity retained, archived history unresolved";
        const attempt = {
          tokenId: t.id,
          windowStart: manifest.windowStart,
          windowEnd: manifest.windowEnd,
          pair: pair?.symbol ?? null,
          requests,
          returnedBars: added,
          reason,
          at: new Date().toISOString(),
        };
        await sql`INSERT INTO research_feature_snapshots(feature_hash,kind,computed_at,available_at,evidence) VALUES(${hashResponse(JSON.stringify(attempt))},'episode_collection_attempt',now(),now(),${sql.json(attempt)}) ON CONFLICT DO NOTHING`;
        collection.push(attempt);
        console.log(
          JSON.stringify({
            event: "history_collection",
            symbol: t.symbol,
            ...attempt,
          }),
        );
      }
    }
    const snapshots =
      await sql`SELECT m.observed_at,m.response_hash,s.raw_text FROM alpha_membership_snapshots m JOIN source_responses s ON s.hash=m.response_hash ORDER BY m.observed_at`;
    const membership = new Map<
      string,
      { at: string; status: string; source: string }
    >();
    const firstCurrent = new Map<string, { at: string; source: string }>();
    let malformedMembershipSnapshots = 0;
    for (const snapshot of snapshots) {
      try {
        const raw = JSON.parse(snapshot.raw_text),
          entries = normalizeRegistry(raw.data ?? raw);
        for (const t of entries) {
          if (t.status === "current" && !firstCurrent.has(t.id))
            firstCurrent.set(t.id, {
              at: iso(snapshot.observed_at),
              source: snapshot.response_hash,
            });
          if (
            Date.parse(snapshot.observed_at) >
            Date.parse(manifest.controlAnchor)
          )
            continue;
          membership.set(t.id, {
            at: iso(snapshot.observed_at),
            status: t.status,
            source: snapshot.response_hash,
          });
        }
      } catch {
        malformedMembershipSnapshots++;
        /* malformed/unknown shape remains unproven */
      }
    }
    const listings = JSON.parse(
      await readFile("docs/evidence/LISTING_COHORT_V1.json", "utf8"),
    ).events;
    const storedMarkets =
      await sql`SELECT DISTINCT symbol FROM ohlcv_candles WHERE interval='1h' AND symbol LIKE 'ALPHA_%' AND open_at>=${new Date(from)} AND close_at<${new Date(end)}`;
    const availableMarkets = new Set(storedMarkets.map((r) => r.symbol));
    // Keep only the short, fixed control window in memory. Full historical
    // paths are processed one identity at a time, not one universe-sized array.
    const controlCandles =
      await sql`SELECT symbol,open_at,close_at,available_at,open,high,low,close,volume,response_hash FROM ohlcv_candles WHERE interval='1h' AND symbol LIKE 'ALPHA_%' AND open_at>=${new Date(Date.parse(manifest.controlAnchor) - 3600000)} AND close_at<${new Date(Date.parse(manifest.controlOutcomeEnd))} ORDER BY symbol,open_at`;
    const bySymbol = new Map<string, StudyCandle[]>();
    for (const r of controlCandles) {
      const rows = bySymbol.get(r.symbol) ?? [];
      rows.push(candle(r));
      bySymbol.set(r.symbol, rows);
    }
    const cases: (ReturnType<typeof historicalEpisodes> & {
      symbol: string;
      currentStatus: string;
      featureAuditCoverage: string;
      featureAudits: {
        episodeHash: string;
        cutoffs: ReturnType<typeof historicalFeatureCutoffs>;
      }[];
    })[] = [];
    const riskRows: ControlRiskRow[] = [];
    for (const t of tokens) {
      const market = [`${t.alpha_id}USDT`, `${t.alpha_id}USDC`].find((symbol) =>
        availableMarkets.has(symbol),
      );
      if (!market) continue;
      const known = listings.find(
          (e: { tokenId: string }) => e.tokenId === t.id,
        ),
        memberAt = known
          ? known.alphaAdmissionAt
          : (firstCurrent.get(t.id)?.at ?? null),
        memberSource = known
          ? known.membershipSource
          : (firstCurrent.get(t.id)?.source ?? t.response_hash);
      const fullCandles =
        await sql`SELECT open_at,close_at,available_at,open,high,low,close,volume,response_hash FROM ohlcv_candles WHERE symbol=${market} AND interval='1h' AND open_at>=${new Date(from)} AND close_at<${new Date(end)} ORDER BY open_at`;
      const result = historicalEpisodes(
        {
          tokenId: t.id,
          chain: t.chain_id,
          contract: t.contract,
          projectKey: t.alpha_id,
          symbol: market,
          quoteAsset: market.endsWith("USDT") ? "USDT" : "USDC",
          membershipAt: memberAt,
          membershipSource: memberSource,
          candles: fullCandles.map(candle),
        },
        new Date().toISOString(),
      );
      const observations = await observationsFor(t.id, sql);
      cases.push({
        symbol: t.symbol,
        currentStatus: t.status,
        featureAuditCoverage: observations.truncated
          ? "truncated; no strategy inference"
          : "observed_records_only",
        ...result,
        featureAudits: result.episodes.map((e) => ({
          episodeHash: e.episodeHash,
          cutoffs: historicalFeatureCutoffs(observations.rows, e.confirmedAt),
        })),
      });
      console.log(
        JSON.stringify({
          event: "history_replay",
          symbol: t.symbol,
          episodes: result.episodes.length,
        }),
      );
    }
    // Assemble the risk set before looking at price outcomes, including identities
    // with no candle history. Missing outcomes remain censored after selection.
    const preRows =
      await sql`SELECT t.id,m.observed_at,m.liquidity::text,p.quote_asset,p.symbol,
      EXISTS(SELECT 1 FROM scan_windows w WHERE w.token_id=t.id AND w.available_at<=${new Date(manifest.controlAnchor)} AND w.complete) AS covered
      FROM alpha_tokens t LEFT JOIN LATERAL(SELECT observed_at,liquidity FROM market_snapshots WHERE token_id=t.id AND observed_at<=${new Date(manifest.controlAnchor)} AND liquidity IS NOT NULL ORDER BY observed_at DESC LIMIT 1)m ON true
      LEFT JOIN LATERAL(SELECT quote_asset,symbol FROM market_snapshots WHERE token_id=t.id AND source_kind='alpha_market' AND observed_at<=${new Date(manifest.controlAnchor)} AND provider_time<=${new Date(manifest.controlAnchor)} ORDER BY observed_at DESC LIMIT 1)p ON true`;
    for (const pre of preRows) {
      const t = tokens.find((t) => t.id === pre.id),
        mem = membership.get(pre.id);
      if (t && mem?.status === "current")
        riskRows.push({
          tokenId: t.id,
          projectKey: t.alpha_id,
          chain: t.chain_id,
          quote: pre.quote_asset ?? "unknown",
          marketSymbol: pre.symbol ?? undefined,
          anchor: manifest.controlAnchor,
          membershipAt: firstCurrent.get(t.id)?.at ?? iso(t.first_seen),
          membershipAvailableAt: mem.at,
          liquidity: pre.liquidity ?? null,
          liquidityAvailableAt: pre.observed_at ? iso(pre.observed_at) : null,
          coverage: pre.covered ? "partial_observed" : "not_observed",
        });
    }
    const controls = identities.flatMap(
      (i: { matches: { tokenId: string }[] }) =>
        i.matches.map((m) => {
          const target = riskRows.find((r) => r.tokenId === m.tokenId);
          const match = target
            ? matchHistoricalControls(target, riskRows)
            : {
                selected: [],
                suppressed: "No as-of matched risk-set record",
                excluded: riskRows.length,
              };
          const outcomes = match.selected.map((c) => {
            const t = tokens.find((t) => t.id === c.tokenId)!;
            const series =
              bySymbol.get(c.marketSymbol ?? `${t.alpha_id}${c.quote}`) ?? [];
            return fixedWindowCohort(
              [
                {
                  tokenId: t.id,
                  membershipAt: c.membershipAt,
                  candles: series,
                },
              ],
              manifest.controlAnchor,
              manifest.controlOutcomeEnd,
              new Date().toISOString(),
            )[0];
          });
          return { target: m.tokenId, ...match, outcomes };
        }),
    );
    const forward7d = cases.flatMap((c) =>
      c.episodes.map(
        (e) => e.outcomes.find((o) => o.days === 7)?.returnPct ?? null,
      ),
    );
    const observed7d = forward7d
      .filter((r): r is string => r !== null)
      .map(Number)
      .sort((a, b) => a - b);
    const report = {
      spec: historicalEpisodeSpec,
      at: new Date().toISOString(),
      manifest,
      identities,
      ambiguousLeads: manifest.ambiguousLeads.map(
        (lead: { symbol: string }) => ({
          ...lead,
          matches: tokens
            .filter((t) => t.symbol.toUpperCase() === lead.symbol)
            .map((t) => ({
              tokenId: t.id,
              contract: t.contract,
              alphaId: t.alpha_id,
              status: t.status,
            })),
        }),
      ),
      collection,
      universeCoverage: {
        officialIdentities: tokens.length,
        withHourlySeries: cases.length,
        missingSeries: tokens
          .filter((t) => !cases.some((c) => c.identity.tokenId === t.id))
          .map((t) => ({
            tokenId: t.id,
            symbol: t.symbol,
            status: t.status,
            reason: "No stored exact Alpha hourly series",
          })),
        asOfRiskSet: riskRows.length,
        malformedMembershipSnapshots,
      },
      cases,
      controls,
      descriptiveForward7d: {
        observed: observed7d.length,
        censored: forward7d.length - observed7d.length,
        positive: observed7d.filter((r) => r > 0).length,
        negative: observed7d.filter((r) => r < 0).length,
        zero: observed7d.filter((r) => r === 0).length,
        medianRawCloseReturnPct: observed7d.length
          ? (observed7d[Math.floor((observed7d.length - 1) / 2)] +
              observed7d[Math.floor(observed7d.length / 2)]) /
            2
          : null,
        inference:
          "Overlapping descriptive rule episodes, often before proven Alpha eligibility; no independent statistical test or executable strategy result. Late reconstructed features cannot be promoted.",
      },
      fixedWindowRanking: {
        definition:
          "All stored exact Alpha series; fixed baseline close before anchor to final close. Membership unproven at anchor stays censored. No best-low/best-high ranking.",
        anchor: manifest.controlAnchor,
        end: manifest.controlOutcomeEnd,
        results: fixedWindowCohort(
          cases.map((c) => ({
            tokenId: c.identity.tokenId,
            membershipAt:
              membership.get(c.identity.tokenId)?.status === "current"
                ? membership.get(c.identity.tokenId)!.at
                : "9999-01-01T00:00:00Z",
            candles: bySymbol.get(c.identity.market) ?? [],
          })),
          manifest.controlAnchor,
          manifest.controlOutcomeEnd,
          new Date().toISOString(),
        ).sort((a, b) =>
          a.returnPct === null
            ? b.returnPct === null
              ? a.tokenId.localeCompare(b.tokenId)
              : 1
            : b.returnPct === null
              ? -1
              : Number(b.returnPct) - Number(a.returnPct) ||
                a.tokenId.localeCompare(b.tokenId),
        ),
      },
      independence: {
        ruleEpisodes: cases.reduce((n, c) => n + c.episodes.length, 0),
        distinctConfirmations: new Set(
          cases.flatMap((c) =>
            c.episodes.map((e) => `${e.projectKey}:${e.confirmedAt}`),
          ),
        ).size,
        projects: new Set(
          cases
            .filter((c) => c.episodes.length)
            .map((c) => c.identity.projectKey),
        ).size,
        warning:
          "Overlapping definitions and repeated episodes of one project are not independent token examples. Earlier episodes lack matched contemporaneous controls where local coverage did not exist.",
      },
      validation: {
        ...researchPatternComparison(
          [],
          manifest.chronologicalCutoff,
          new Date().toISOString(),
          [2, 3, 5, 10, 20, 50, 100],
          1,
        ),
        eligibleHistoricalSignals: 0,
        suppression:
          "Reconstructed conditions have late availability; historical costs/depth, retained acquisition and independent ownership are not established. No net strategy returns or model fitted.",
        predeclaredRuleHorizonComparisons: 3 * 7,
        multiplicityCorrectionApplied: false,
      },
      metrics: {
        peakRssBytes: process.resourceUsage().maxRSS * 1024,
        elapsedSeconds: (Date.now() - started) / 1000,
        counters: processMetrics(),
        databaseBytesBefore: before,
        databaseBytesAfter: (
          await sql`SELECT pg_database_size(current_database())::text AS bytes`
        )[0].bytes,
      },
    };
    const runHash = hashResponse(JSON.stringify(report));
    await persistHistoricalStudy(
      {
        runHash,
        manifest,
        report,
        tokenIds: cases.map((c) => c.identity.tokenId),
      },
      sql,
    );
    await mkdir("artifacts/research", { recursive: true });
    await writeFile(
      "artifacts/research/historical-episodes.json",
      JSON.stringify({ runHash, ...report }, null, 2),
    );
    console.log(
      JSON.stringify({
        event: "historical_research",
        runHash,
        cases: cases.length,
        episodes: cases.reduce((n, c) => n + c.episodes.length, 0),
        controls: controls.reduce((n, c) => n + c.selected.length, 0),
        metrics: report.metrics,
      }),
    );
  } finally {
    if (acquired) await lock`SELECT pg_advisory_unlock(726032)`;
    lock.release();
  }
}
async function observationsFor(
  tokenId: string,
  sql: ReturnType<typeof sqlClient>,
): Promise<{ rows: HistoricalObservation[]; truncated: boolean }> {
  const rows =
    await sql`SELECT 'transfer' AS kind,event_time AS at,available_at,canonical,tx_hash AS reference FROM token_transfers WHERE token_id=${tokenId}
 UNION ALL SELECT 'verified_swap',event_time,available_at,canonical,tx_hash FROM verified_swaps WHERE token_id=${tokenId}
 UNION ALL SELECT 'balance',block_time,observed_at,canonical,block_hash FROM wallet_balance_snapshots WHERE token_id=${tokenId} AND block_time IS NOT NULL
 UNION ALL SELECT 'relationship',observed_at,observed_at,true,research_key FROM wallet_relationships WHERE token_id=${tokenId}
 UNION ALL SELECT 'holder_sample',observed_at,observed_at,canonical,coverage FROM holder_metrics WHERE token_id=${tokenId}
 UNION ALL SELECT 'pool_liquidity',block_time,available_at,canonical,block_hash FROM pool_liquidity_observations WHERE token_id=${tokenId}
 UNION ALL SELECT 'accumulation_research',window_end,computed_at,true,window_days::text FROM accumulation_observations WHERE token_id=${tokenId}
 UNION ALL SELECT 'entity_flow_sample',window_end,NULL::timestamptz,true,coverage FROM entity_flows WHERE token_id=${tokenId}
 UNION ALL SELECT 'derivative',provider_time,observed_at,true,symbol FROM derivatives_observations WHERE token_id=${tokenId}
 UNION ALL SELECT 'funding_history',to_timestamp((r->>'fundingTime')::numeric/1000),f.available_at,true,f.feature_hash FROM research_feature_snapshots f CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(f.evidence->'rows')='array' THEN f.evidence->'rows' ELSE '[]'::jsonb END) r WHERE f.kind='listing_funding_history' AND f.evidence->>'tokenId'=${tokenId} LIMIT 20001`;
  return {
    truncated: rows.length > 20000,
    rows: rows.slice(0, 20000).map((r) => ({
      kind: r.kind,
      eventAt: r.at ? iso(r.at) : "",
      availableAt: r.available_at ? iso(r.available_at) : null,
      canonical: r.canonical,
      reference: r.reference ?? "unavailable",
    })),
  };
}
withRequestWorkload("historical", main)
  .catch((e) => {
    console.error(
      networkErrorCode(e),
      e instanceof Error && /^[A-Z_]+$/.test(e.message) ? e.message : "",
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb();
    await closeProviderNetwork();
    clearInterval(timer);
    clearTimeout(deadline);
  });
