import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import {
  config,
  validateWorkerLaunchEnvironment,
  EvmProvider,
  HttpClient,
  installRequestPolicy,
  withRequestWorkload,
  ProviderError,
  networkErrorCode,
  closeProviderNetwork,
  stopProviderRequests,
  walletReceiptTransfers,
  tokenKey,
  processMetrics,
  hashResponse,
  type Transfer,
  historicalSignalStudy,
  matchHistoricalControls,
  normalizeRegistry,
  type ControlRiskRow,
  type StudyCandle,
} from "../packages/core/src/index";
import {
  sqlClient,
  closeDb,
  workerRequestPolicy,
  auditRequest,
  saveSource,
  ensureWalletMonitoring,
  appendWalletLabel,
  jsonParam,
} from "../packages/db/src/index";

// Investigation inputs only. Exact existing Alpha identities are required;
// these candidates never create/admit tokens or replace universal scheduling.
const address = "0x091d1c972cb1648537a2ba78eaba371b1ce18336";
const candidates = [
  {
    symbol: "Q",
    contract: "0xc07e1300dc138601fa6b0b59f8d0fa477e690589",
    claim:
      "Reported 33M received from Gate below $0.04 and 19M returned near $0.20, followed by a decline; quantities, prices and outcomes unverified",
  },
  {
    symbol: "AKE",
    contract: "0x2c3a8ee94ddd97244a93bc48298f97d2c412f7db",
    claim:
      "Reported 248.4M received on November 13 and later returned to Gate; quantities, year and complete return history unverified",
  },
  {
    symbol: "EVAA",
    contract: "0xaa036928c9c0df07d525b55ea8ee690bb5a628c1",
    claim:
      "Reported 800K received, 300K returned and another approximately 500K received on November 25, 2026; each leg requires canonical evidence",
  },
];
const source = "https://www.binance.com/en/square/post/392077924969454";
const arkham = "https://arkm.com/explorer/address/" + address;
const gateSource = "https://www.gate.com/announcements/article/34187";
const txHash =
  "0xeaf7e246446d40612dd8b4f76bd5a049cd23ec03a6fbdecabcc71858fafff743";
const receiptLead =
  "https://www.jxbcrypto.com/perp/transfer?direction=in%2Cout&range=24h&symbol=EVAA";
const register = process.argv.includes("--register"),
  verify = process.argv.includes("--verify-receipt"),
  study = process.argv.includes("--study");
if (!register && !verify && !study)
  throw Error("EXPLICIT_CASE_ACTION_REQUIRED");
const c = config();
validateWorkerLaunchEnvironment(c, process.env);
if (c.WORKER_EXECUTION_MODE !== "duty_cycle")
  throw Error("BUDGET_ENVIRONMENT_REQUIRED");
process.env.DATABASE_URL = c.DATABASE_URL_WORKER;
const sql = sqlClient();
let lock: Awaited<ReturnType<typeof sql.reserve>> | undefined,
  held = false;
const wall = setTimeout(() => {
  stopProviderRequests();
  console.error('{"error":"CASE_DEADLINE"}');
  process.exit(1);
}, 120000);
try {
  lock = await sql.reserve();
  held = (await lock`SELECT pg_try_advisory_lock(726032) AS held`)[0].held;
  if (!held) throw Error("COLLECTOR_BUSY_CASE_DEFERRED");
  const size = (
    await sql`SELECT pg_database_size(current_database())::text AS bytes`
  )[0].bytes;
  if (Number(size) >= c.DATABASE_STORAGE_LIMIT_MB * 1048576)
    throw Error("DATABASE_STORAGE_GUARD");
  const rows =
    await sql`SELECT id,chain_id,contract,symbol,alpha_id,status,first_seen,last_seen,source,response_hash FROM alpha_tokens WHERE chain_id='56' AND contract=ANY(${candidates.map((t) => t.contract)}) AND status='current'`;
  if (
    rows.length !== 3 ||
    rows.some((t) => t.id !== tokenKey(t.chain_id, t.contract))
  )
    throw Error("CURRENT_ALPHA_CASE_IDENTITIES_REQUIRED");
  const before =
    await sql`SELECT count(*)::int AS n FROM wallet_monitoring WHERE chain_id='56' AND address=${address}`;
  if (register) {
    for (const token of rows) {
      await ensureWalletMonitoring(
        { id: token.id, chain: token.chain_id, contract: token.contract },
        address,
        "Owner-requested exchange-flow investigation; Cumberland attribution provisional, transfers are not verified purchases",
        sql,
      );
      const body = candidates.find((t) => t.contract === token.contract)!.claim;
      await sql`INSERT INTO research_leads(id,token_id,kind,source_url,author,body) SELECT ${randomUUID()},${token.id},'forensic_claim',${source},'User / ArslanOnChain',${body} WHERE NOT EXISTS(SELECT 1 FROM research_leads WHERE token_id=${token.id} AND source_url=${source} AND kind='forensic_claim' AND body=${body})`;
    }
    const previousLabel =
      await sql`SELECT valid_from FROM wallet_labels WHERE chain_id='56' AND address=${address} AND source_url=${arkham} AND added_by='wallet-exchange/1' ORDER BY created_at LIMIT 1`;
    await appendWalletLabel(
      {
        chain: "56",
        address,
        entity: "Cumberland (provisional)",
        role: "possible_market_maker",
        sourceUrl: arkham,
        confidence: "Third-party attribution; ownership unverified",
        validFrom: previousLabel[0]
          ? new Date(previousLabel[0].valid_from).toISOString()
          : new Date().toISOString(),
        validTo: null,
        reviewedBy: null,
        detail: {
          version: "exchange-address/1",
          accountRole: "unknown",
          basis: "conflicting_third_party_attribution",
          publishedAt: null,
          notes:
            "Social researchers associate this address with Cumberland. Arkham shows a Cumberland heading and unattributed explanatory text. Neither proves beneficial ownership.",
          contradictions: [
            "Arkham explanatory text says unattributed; displayed holdings differ across source captures",
          ],
        },
      },
      sql,
    );
    await appendWalletLabel(
      {
        chain: "56",
        address: "0x0d0707963952f2fba59dd06f2b425ace40b492fe",
        entity: "Gate",
        role: "verified_exchange",
        sourceUrl: gateSource,
        confidence:
          "Exchange-published chain-specific address; independently source-reviewed",
        validFrom: "2024-01-24T01:03:00.000Z",
        validTo: null,
        reviewedBy: "public-source-review/2026-11-26",
        detail: {
          version: "exchange-address/1",
          accountRole: "operational",
          basis: "exchange_published_address",
          publishedAt: "2024-01-24T01:03:00.000Z",
          notes:
            "Gate's announcement links this exact BSC address and discusses its custody snapshot. Gate also publishes the same hexadecimal address on Ethereum in announcement 16864; that is separate chain evidence. Exact current hot/cold/deposit subtype and uninterrupted control are not proven. First local review is not backdated.",
          contradictions: [],
        },
      },
      sql,
    );
  }
  const movements: Transfer[] = [],
    balances: Record<string, unknown>[] = [],
    gaps: string[] = [];
  if (verify) {
    const base = workerRequestPolicy(sql);
    let requests = 0,
      units = 0;
    installRequestPolicy({
      ...base,
      reserve: async (request) => {
        requests++;
        units += request.alchemyUnits;
        if (requests > 30 || units > 400)
          throw new ProviderError("CASE_REQUEST_CAP");
        await base.reserve(request);
      },
    });
    await withRequestWorkload("historical", async () => {
      const rpc = new EvmProvider(
        "56",
        c.BSC_RPC_URL,
        new HttpClient("rpc:56", 30, auditRequest),
      );
      const confirmed = (await rpc.head()) - c.SCAN_CONFIRMATIONS,
        header = await rpc.block(confirmed);
      await saveSource("rpc:56", header);
      const at = new Date(
        Number(BigInt(header.data.timestamp)) * 1000,
      ).toISOString();
      for (const token of rows) {
        const code = await rpc.code(token.contract, confirmed);
        if (code.data === "0x") throw Error("EMPTY_CASE_CONTRACT");
        const decimals = await rpc.decimals(token.contract, confirmed),
          balance = await rpc.balance(address, token.contract, confirmed);
        await saveSource("rpc:56", balance);
        await sql`INSERT INTO wallet_balance_snapshots(chain_id,address,token_id,block_number,block_hash,raw_quantity,observed_at,source,block_time,decimals) VALUES('56',${address},${token.id},${confirmed},${header.data.hash.toLowerCase()},${balance.data},${balance.observedAt},${balance.source},${at},${decimals}) ON CONFLICT DO NOTHING`;
        balances.push({
          tokenId: token.id,
          symbol: token.symbol,
          contract: token.contract,
          raw: balance.data,
          decimals,
          block: confirmed,
          blockHash: header.data.hash,
          blockTime: at,
          availableAt: balance.observedAt,
        });
      }
      const receipt = await rpc.receipt(txHash),
        block = await rpc.block(Number(BigInt(receipt.data.blockNumber)));
      if (Number(BigInt(block.data.number)) > confirmed)
        throw Error("UNCONFIRMED_CASE_RECEIPT");
      await saveSource("rpc:56", receipt);
      await saveSource("rpc:56", block);
      const token = rows.find((t) => t.contract === candidates[2].contract)!;
      const decimals = await rpc.decimals(
        token.contract,
        Number(BigInt(block.data.number)),
      );
      movements.push(
        ...walletReceiptTransfers({
          token: { id: token.id, chain: "56", contract: token.contract },
          address,
          txHash,
          decimals,
          availableAt: receipt.observedAt,
          receipt: receipt.data,
          header: block.data,
        }),
      );
      if (!movements.length)
        gaps.push(
          "Receipt contains no matching EVAA transfer to/from the investigation wallet; the lead is unsupported",
        );
      for (const e of movements) {
        await sql.begin(async (tx) => {
          const existing =
            await tx`SELECT token_id,block_hash,raw_quantity::text,from_address,to_address FROM token_transfers WHERE chain_id=${e.chain} AND tx_hash=${e.txHash} AND log_index=${e.logIndex}`;
          if (
            existing.some(
              (r) =>
                r.token_id !== e.tokenId ||
                r.block_hash !== e.blockHash ||
                r.raw_quantity !== e.rawQuantity ||
                r.from_address !== e.from ||
                r.to_address !== e.to,
            )
          )
            throw Error("EXISTING_TRANSFER_CONFLICT");
          await tx`INSERT INTO token_transfers(chain_id,tx_hash,log_index,token_id,block_number,block_hash,event_time,available_at,from_address,to_address,raw_quantity,decimals,kind,source) VALUES(${e.chain},${e.txHash},${e.logIndex},${e.tokenId},${e.blockNumber},${e.blockHash},${e.eventTime},${e.availableAt},${e.from},${e.to},${e.rawQuantity},${e.decimals},${e.kind},${e.source}) ON CONFLICT DO NOTHING`;
        });
      }
    });
  }
  const eventStudies: Record<string, unknown>[] = [];
  if (study) {
    const events =
      await sql`SELECT * FROM token_transfers WHERE chain_id='56' AND token_id=ANY(${rows.map((t) => t.id)}) AND (from_address=${address} OR to_address=${address}) AND canonical ORDER BY event_time DESC LIMIT 20`;
    for (const event of events) {
      const anchor = new Date(event.event_time).toISOString(),
        asOf = new Date().toISOString();
      const snapshots =
        await sql`SELECT m.observed_at,s.raw_text FROM alpha_membership_snapshots m JOIN source_responses s ON s.hash=m.response_hash WHERE m.observed_at<=${anchor} ORDER BY m.observed_at DESC LIMIT 1`;
      const members = new Set<string>();
      if (snapshots[0]) {
        const raw = JSON.parse(snapshots[0].raw_text);
        for (const t of normalizeRegistry(raw.data ?? raw))
          if (t.status === "current") members.add(t.id);
      }
      const risk =
        await sql`SELECT t.id,t.alpha_id,t.chain_id,t.contract,t.first_seen,t.source,m.symbol,m.quote_asset,m.liquidity::text,m.observed_at,
        EXISTS(SELECT 1 FROM scan_windows w WHERE w.token_id=t.id AND w.complete AND w.available_at<=${anchor}) AS covered
        FROM alpha_tokens t LEFT JOIN LATERAL(SELECT symbol,quote_asset,liquidity,observed_at FROM market_snapshots s WHERE s.token_id=t.id AND s.source_kind='alpha_market' AND s.observed_at<=${anchor} AND s.provider_time<=${anchor} AND s.symbol IN (t.alpha_id||'USDT',t.alpha_id||'USDC') ORDER BY s.observed_at DESC LIMIT 1)m ON true WHERE t.chain_id='56'`;
      const pool: ControlRiskRow[] = risk
        .filter((t) => members.has(t.id))
        .map((t) => ({
          tokenId: t.id,
          projectKey: t.alpha_id,
          chain: t.chain_id,
          quote: t.quote_asset ?? "unknown",
          marketSymbol: t.symbol ?? undefined,
          anchor,
          membershipAt: new Date(t.first_seen).toISOString(),
          membershipAvailableAt: new Date(
            snapshots[0].observed_at,
          ).toISOString(),
          liquidity: t.liquidity ?? null,
          liquidityAvailableAt: t.observed_at
            ? new Date(t.observed_at).toISOString()
            : null,
          coverage: t.covered ? "partial_observed" : "not_observed",
        }));
      const target = pool.find((t) => t.tokenId === event.token_id),
        controls = target
          ? matchHistoricalControls(target, pool)
          : {
              selected: [],
              suppressed: "No point-in-time Alpha/liquidity risk-set target",
              excluded: pool.length,
            };
      const outcomes = [];
      for (const id of [
        event.token_id,
        ...controls.selected.map((t) => t.tokenId),
      ]) {
        const t = risk.find((t) => t.id === id),
          r = pool.find((t) => t.tokenId === id);
        if (
          !t ||
          !r ||
          !r.marketSymbol ||
          !["USDT", "USDC"].includes(r.quote)
        ) {
          outcomes.push({
            tokenId: id,
            status: "exact_market_baseline_unavailable",
          });
          continue;
        }
        const bars =
          await sql`SELECT * FROM ohlcv_candles WHERE symbol=${r.marketSymbol} AND interval='1h' AND open_at>=${new Date(Date.parse(anchor) - 2 * 3600000)} AND close_at<=${asOf} AND available_at<=${asOf} ORDER BY open_at LIMIT 2200`;
        const candles: StudyCandle[] = bars.map((b) => ({
          openAt: new Date(b.open_at).toISOString(),
          closeAt: new Date(b.close_at).toISOString(),
          availableAt: new Date(b.available_at).toISOString(),
          open: String(b.open),
          high: String(b.high),
          low: String(b.low),
          close: String(b.close),
          volume: String(b.volume),
          hash: b.response_hash,
        }));
        outcomes.push(
          historicalSignalStudy(
            {
              tokenId: id,
              chain: t.chain_id,
              contract: t.contract,
              projectKey: t.alpha_id,
              symbol: r.marketSymbol,
              quoteAsset: r.quote,
              membershipAt: r.membershipAt,
              membershipSource: t.source,
              candles,
            },
            anchor,
            new Date(event.available_at).toISOString(),
            asOf,
          ),
        );
      }
      eventStudies.push({
        eventId: `56:${event.tx_hash}:${event.log_index}`,
        anchor,
        signalAvailableAt: new Date(event.available_at).toISOString(),
        controls,
        outcomes,
        selectionUsesFutureReturns: false,
        strategyValidated: false,
      });
    }
  }
  const report = {
    at: new Date().toISOString(),
    address,
    identities: rows,
    monitoringBefore: before[0].n,
    monitoringAfter: (
      await sql`SELECT count(*)::int AS n FROM wallet_monitoring WHERE chain_id='56' AND address=${address} AND active`
    )[0].n,
    movements,
    eventStudies,
    balances,
    gaps,
    metrics: processMetrics(),
    receiptLead,
    txHash,
    completeHistory: false,
    verifiedPurchaseOrSale: false,
    cumberlandOwnershipVerified: false,
    historicalClaims: candidates.map((t) => ({
      symbol: t.symbol,
      claim: t.claim,
      status: "unverified aggregate; isolated receipt evidence is separate",
    })),
    limitations: [
      "One transaction lead plus confirmed current balances; no broad historical scan or full scan window created",
      "No price outcome, profit, fixed-horizon strategy or complete round trip has been established",
      "Social publication times unavailable; local collection/review times are not backdated",
      "The existing duty schedule and universal jobs are unchanged",
    ],
  };
  const raw = JSON.stringify(report);
  await sql`INSERT INTO research_feature_snapshots(feature_hash,kind,computed_at,available_at,evidence) VALUES(${hashResponse(raw)},'wallet_exchange_case',${report.at},${report.at},${jsonParam(report)}::jsonb) ON CONFLICT DO NOTHING`;
  mkdirSync("artifacts/wallet-exchange", { recursive: true });
  writeFileSync(
    `artifacts/wallet-exchange/${study ? "study" : register ? "registration" : "receipt"}.json`,
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  console.error(
    JSON.stringify({
      ok: false,
      error: networkErrorCode(error),
      metrics: processMetrics(),
    }),
  );
  process.exitCode = 1;
} finally {
  clearTimeout(wall);
  if (held && lock) await lock`SELECT pg_advisory_unlock(726032)`;
  lock?.release();
  await closeDb();
  await closeProviderNetwork();
}
