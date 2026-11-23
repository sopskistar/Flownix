import { readFile, mkdir, writeFile } from "node:fs/promises";
import {
  AlphaProvider,
  FuturesProvider,
  HttpClient,
  listingEventSchema,
  listingEventStudy,
  listingStudySpec,
  hashResponse,
  exactFuturesAssociation,
  fixedWindowCohort,
  listingReactionAudit,
  installRequestPolicy,
  closeProviderNetwork,
  networkErrorCode,
  type StudyCandle,
} from "../packages/core/src/index";
import {
  sqlClient,
  closeDb,
  auditRequest,
  workerRequestPolicy,
  saveSource,
  jsonParam,
} from "../packages/db/src/index";
import { storeCandles } from "../apps/worker/src/ingest";
import { persistListingStudy } from "../apps/worker/src/listing-storage";
process.env.DATABASE_URL =
  process.env.DATABASE_URL_WORKER ?? process.env.DATABASE_URL;
const timer = setInterval(() => {}, 1000);
const deadline = setTimeout(() => {
  console.error("RESEARCH_DEADLINE: committed pages/runs remain resumable");
  process.exit(1);
}, 1800000);
const toCandle = (r: Record<string, unknown>): StudyCandle => ({
  openAt: new Date(r.open_at as string).toISOString(),
  closeAt: new Date(r.close_at as string).toISOString(),
  availableAt: new Date(r.available_at as string).toISOString(),
  open: String(r.open),
  high: String(r.high),
  low: String(r.low),
  close: String(r.close),
  volume: String(r.volume),
  hash: String(r.response_hash),
});
async function main() {
  const sql = sqlClient();
  installRequestPolicy(workerRequestPolicy(sql));
  const input = JSON.parse(
    await readFile(
      process.argv[2] ?? "docs/evidence/LISTING_COHORT_V1.json",
      "utf8",
    ),
  );
  const events = input.events.map((e: unknown) => listingEventSchema.parse(e));
  if (events.length > 10) throw Error("REVIEW_COHORT_SIZE");
  const collect = process.argv.includes("--collect"),
    alpha = new AlphaProvider(
      new HttpClient("binance_alpha", 30, auditRequest),
    ),
    futures = new FuturesProvider(
      new HttpClient("binance_futures", 20, auditRequest),
    );
  const lock = await sql.reserve();
  let acquired = false;
  try {
    acquired = (await lock`SELECT pg_try_advisory_lock(726032) AS acquired`)[0]
      .acquired;
    if (!acquired) throw Error("COLLECTOR_BUSY");
    const exchange = collect ? await futures.exchange() : null;
    if (exchange) await saveSource("binance_futures", exchange);
    const reports = [];
    for (const event of events) {
      const token = (
        await sql`SELECT * FROM alpha_tokens WHERE id=${event.tokenId} AND chain_id=${event.chain} AND contract=${event.contract}`
      )[0];
      if (!token || event.alphaPair !== `${token.alpha_id}${event.quoteAsset}`)
        throw Error("EXACT_ALPHA_PAIR_REQUIRED");
      const eventHash = hashResponse(JSON.stringify(event));
      await sql`INSERT INTO futures_listing_events(event_hash,token_id,symbol,definition) VALUES(${eventHash},${event.tokenId},${event.symbol},${jsonParam(event)}::jsonb) ON CONFLICT DO NOTHING`;
      const failures: { stage: string; code: string }[] = [];
      const start = Date.parse(event.announcementAt) - 3600000,
        end = Date.parse(event.scheduledStartAt) + 168 * 3600000;
      if (collect) {
        const instrument = exchange!.data.symbols.find(
          (i) => i.symbol === event.symbol,
        );
        if (
          !instrument ||
          !exactFuturesAssociation(
            { id: token.id, chain: token.chain_id, contract: token.contract },
            {
              tokenId: token.id,
              chain: token.chain_id,
              contract: token.contract,
              symbol: event.symbol,
              baseAsset: instrument.baseAsset,
              contractType: "PERPETUAL",
              multiplier: "1",
              verified: true,
              verifiedAt: new Date().toISOString(),
              validFrom: new Date().toISOString(),
              validTo: null,
              tokenSource: event.identitySource,
              instrumentSource: "https://fapi.binance.com/fapi/v1/exchangeInfo",
              projectLinkSource: event.sourceUrl,
            },
            instrument,
            new Date().toISOString(),
          )
        )
          throw Error("INSTRUMENT_ASSOCIATION_FAILED");
        for (const venue of ["alpha", "binance_futures"] as const) {
          let point =
            venue === "alpha"
              ? event.membershipProof === "explicit_admission_time"
                ? Math.max(start, Date.parse(event.alphaAdmissionAt))
                : start
              : Date.parse(event.scheduledStartAt);
          // Exact endpoints, bounded pages and resumable persisted minute bars; no arbitrary URL fetch.
          for (let page = 0; point < end && page < 10; page++) {
            const until = Math.min(end - 1, point + 1500 * 60000 - 1),
              symbol = venue === "alpha" ? event.alphaPair : event.symbol;
            const old = (
              await sql`SELECT count(*)::int AS n FROM ohlcv_candles WHERE symbol=${symbol} AND interval='1m' AND open_at>=${new Date(point)} AND open_at<=${new Date(until)}`
            )[0].n;
            if (old === Math.floor((until - point + 1) / 60000)) {
              point = until + 1;
              continue;
            }
            try {
              const response =
                venue === "alpha"
                  ? await alpha.klines(event.alphaPair, until, point, "1m")
                  : await futures.candles(event.symbol, point, until);
              if (
                response.data.some(
                  (k) => Number(k[0]) < point || Number(k[0]) > until,
                )
              )
                throw Error("CANDLE_RANGE_MISMATCH");
              await storeCandles(
                symbol,
                response,
                "1m",
                venue === "alpha" ? "binance_alpha" : "binance_futures",
              );
              if (!response.data.length) {
                failures.push({
                  stage: venue,
                  code: "NO_HISTORY_AT_REQUESTED_PERIOD",
                });
                break;
              }
              point = until + 1;
            } catch (error) {
              failures.push({ stage: venue, code: networkErrorCode(error) });
              break;
            }
          }
        }
        try {
          const f = await futures.fundingHistory(
            event.symbol,
            Date.parse(event.scheduledStartAt),
            end,
          );
          await saveSource("binance_futures", f);
          await sql`INSERT INTO research_feature_snapshots(feature_hash,kind,computed_at,available_at,evidence) VALUES(${f.hash},'listing_funding_history',${f.observedAt},${f.observedAt},${jsonParam({ tokenId: event.tokenId, symbol: event.symbol, rows: f.data, source: f.source, hash: f.hash, retrospective: true })}::jsonb) ON CONFLICT DO NOTHING`;
        } catch (error) {
          failures.push({ stage: "funding", code: networkErrorCode(error) });
        }
        try {
          const btc = await futures.candles(
            "BTCUSDT",
            Math.floor(Date.parse(event.scheduledStartAt) / 3600000) * 3600000 -
              3600000,
            end,
            "1h",
          );
          await storeCandles("BTCUSDT", btc, "1h", "binance_futures");
        } catch (error) {
          failures.push({
            stage: "btc_market_context",
            code: networkErrorCode(error),
          });
        }
      }
      const candles =
        await sql`SELECT * FROM ohlcv_candles WHERE symbol=ANY(${[event.alphaPair, event.symbol]}) AND interval='1m' AND open_at>=${new Date(start)} AND open_at<${new Date(end)} ORDER BY open_at`;
      const study = listingEventStudy(
        event,
        [
          {
            tokenId: token.id,
            symbol: event.alphaPair,
            quoteAsset: event.quoteAsset,
            venue: "alpha",
            candles: candles
              .filter((r) => r.symbol === event.alphaPair)
              .map(toCandle),
          },
          {
            tokenId: token.id,
            symbol: event.symbol,
            quoteAsset: event.quoteAsset,
            venue: "binance_futures",
            candles: candles
              .filter((r) => r.symbol === event.symbol)
              .map(toCandle),
          },
        ],
        new Date().toISOString(),
      );
      const [fundingContext, transferContext, poolContext, btcContext] =
        await Promise.all([
          sql`SELECT evidence,available_at FROM research_feature_snapshots WHERE kind='listing_funding_history' AND evidence->>'tokenId'=${token.id} ORDER BY available_at DESC LIMIT 1`,
          sql`SELECT count(*)::int AS observed_rows FROM token_transfers WHERE token_id=${token.id} AND canonical AND event_time>=${new Date(start)} AND event_time<${new Date(end)}`,
          sql`SELECT block_time,available_at,evidence FROM pool_liquidity_observations WHERE token_id=${token.id} AND canonical AND block_time>=${new Date(start)} AND block_time<${new Date(end)} ORDER BY block_time LIMIT 20`,
          sql`SELECT open_at,close_at,open,close,response_hash FROM ohlcv_candles WHERE symbol='BTCUSDT' AND interval='1h' AND open_at>=${new Date(Math.floor(Date.parse(event.scheduledStartAt) / 3600000) * 3600000 - 3600000)} AND close_at<${new Date(end)} ORDER BY open_at`,
        ]);
      const report = {
        ...study,
        historicalContext: {
          funding: fundingContext[0]?.evidence ?? { status: "unavailable" },
          wallets: {
            observedTransfers: transferContext[0].observed_rows,
            scope:
              "Incomplete historical sample; no accumulation/distribution or beneficial-owner inference",
          },
          liquidity: poolContext.length
            ? poolContext
            : {
                status: "unavailable",
                reason: "No observed historical pool series",
              },
          openInterest: {
            status: "unavailable",
            reason:
              "Recent-only REST history; older archive not yet reconciled for timing/licensing",
          },
          exchangeFlows: {
            status: "unavailable",
            reason:
              "No independently verified contemporaneous label/continuous-flow series",
          },
          marketConditions: {
            instrument: "BTCUSDT",
            role: "External Futures market context only, not an Alpha candidate",
            resolution: "1h; not exactly aligned to half-hour listing anchors",
            candles: btcContext,
          },
        },
        collectionFailures: failures,
        registryListingClaim: token.listing_time,
        localMembershipFirstSeen: token.first_seen,
        eventHash,
      };
      await persistListingStudy(
        {
          tokenId: token.id,
          runHash: study.runHash,
          manifest: study.manifest,
          report,
        },
        sql,
      );
      reports.push(report);
      console.log(
        JSON.stringify({
          event: "listing_case",
          token: token.symbol,
          run: study.runHash,
          observedHorizons: study.phases.horizons.filter(
            (h) => h.status === "observed",
          ).length,
          failures,
        }),
      );
    }
    // Freeze the requested lead/control cohort before outcomes; never filter to known winners.
    const cohortRows = [];
    for (const identity of input.outcomeCohort.identities) {
      const token = (
        await sql`SELECT * FROM alpha_tokens WHERE id=${identity.tokenId} AND chain_id=${identity.chain} AND contract=${identity.contract}`
      )[0];
      if (!token) throw Error("COHORT_IDENTITY_MISSING");
      const symbol = `${token.alpha_id}USDT`,
        from = Date.parse(input.outcomeCohort.setupAt) - 3600000,
        to = Date.parse(input.outcomeCohort.endAt);
      if (collect) {
        try {
          const candles = await alpha.klines(symbol, to - 1, from);
          if (
            candles.data.some((k) => Number(k[0]) < from || Number(k[0]) >= to)
          )
            throw Error("CANDLE_RANGE_MISMATCH");
          await storeCandles(symbol, candles);
        } catch (error) {
          console.log(
            JSON.stringify({
              event: "cohort_gap",
              token: token.id,
              code: networkErrorCode(error),
            }),
          );
        }
      }
      const rows =
        await sql`SELECT * FROM ohlcv_candles WHERE symbol=${symbol} AND interval='1h' AND open_at>=${new Date(from)} AND open_at<${new Date(to)} ORDER BY open_at`;
      cohortRows.push({
        tokenId: token.id,
        membershipAt: new Date(token.first_seen).toISOString(),
        candles: rows.map(toCandle),
      });
    }
    const cohort = fixedWindowCohort(
      cohortRows,
      input.outcomeCohort.setupAt,
      input.outcomeCohort.endAt,
      new Date().toISOString(),
    );
    const output = {
      at: new Date().toISOString(),
      spec: listingStudySpec,
      reports,
      listingHypothesis: listingReactionAudit(
        reports,
        input.chronologicalCutoff,
      ),
      cohort: {
        specVersion: "fixed-cohort/2",
        definition: input.outcomeCohort,
        results: cohort,
        confirmed2x: cohort.filter((r) => r.confirmed2x).length,
        observed2xPeaks: cohort.filter((r) => r.peak2xObserved).length,
        non2xPeakControls: cohort.filter((r) => r.non2xPeakControl).length,
        confirmedNon2xControls: cohort.filter((r) => r.control).length,
        unavailable: cohort.filter((r) => r.status === "unavailable").length,
      },
      validatedStrategies: 0,
      validationSuppression:
        "No complete pre-move wallet/liquidity/executable cost dataset; retrospective downloaded bars cannot create historical Flownix signals",
    };
    const hash = hashResponse(JSON.stringify(output));
    await sql`INSERT INTO event_study_runs(run_hash,spec_version,computed_at,manifest,report) VALUES(${hash},'fixed-cohort/2',now(),${jsonParam(input.outcomeCohort)}::jsonb,${jsonParam(output)}::jsonb) ON CONFLICT DO NOTHING`;
    await mkdir("artifacts/research", { recursive: true });
    await writeFile(
      "artifacts/research/listing-study.json",
      JSON.stringify(output, null, 2),
    );
    console.log(
      JSON.stringify({
        event: "research_report",
        path: "artifacts/research/listing-study.json",
        hash,
      }),
    );
  } finally {
    if (acquired) await lock`SELECT pg_advisory_unlock(726032)`;
    lock.release();
  }
}
main()
  .catch((error) => {
    console.error(networkErrorCode(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb();
    await closeProviderNetwork();
    clearInterval(timer);
    clearTimeout(deadline);
  });
