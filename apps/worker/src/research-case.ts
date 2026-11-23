import { installRequestPolicy, withRequestWorkload } from "@flownix/core";
import { workerRequestPolicy } from "@flownix/db";
import { mkdir, writeFile } from "node:fs/promises";
import {
  config,
  EvmProvider,
  HttpClient,
  decodeTransfer,
  tokenUnits,
  explorerUrl,
  networkErrorCode,
  closeProviderNetwork,
} from "@flownix/core";
import {
  sqlClient,
  closeDb,
  saveSource,
  jsonParam,
  auditRequest,
} from "@flownix/db";

// User-supplied hypotheses only. This list never admits assets into the Alpha universe.
const candidates = [
  "LAB",
  "AKE",
  "RAVE",
  "JCT",
  "AGT",
  "PIEVERSE",
  "BTW",
  "AIN",
  "IDOL",
  "EVAA",
  "BLESS",
  "IRYS",
  "TAG",
  "JELLYJELLY",
  "DOYR",
  "TUT",
  "MYX",
  "SIREN",
  "XCX",
  "U",
  "POWER",
  "PIPPIN",
  "OVL",
  "FHE",
  "BULLA",
  "MAGMA",
  "SENTIS",
  "NAORIS",
  "PAAL",
  "AIOT",
];
const address = "0xa4856e07d14045014b2c3fece5460bd37b310f10";
const leads = [
  {
    hash: "0x677d540b04d7208f02f8c475b14a695917404e021394c202203068592805e301",
    source: "https://coingraph.ai/proof/4486",
  },
  {
    hash: "0xec8a889e0162f87c82d5ba7894886f3f18164f0264b6ca35b37b598bf8b0b9be",
    source: "https://coingraph.ai/proof/4395",
  },
];
async function main() {
  process.env.DATABASE_URL =
    process.env.DATABASE_URL_WORKER ?? process.env.DATABASE_URL;
  const sql = sqlClient(),
    now = new Date().toISOString();
  installRequestPolicy(workerRequestPolicy(sql));
  const rows =
    await sql`SELECT id,symbol,chain_id,contract,alpha_id,status,listing_time,first_seen,last_seen,source,response_hash FROM alpha_tokens WHERE upper(symbol)=ANY(${candidates}) ORDER BY symbol,chain_id,contract`;
  for (const token of rows)
    await sql`INSERT INTO research_case_candidates(token_id,source,observed_at,hypothesis,evidence) VALUES(${token.id},'User-supplied investigation candidate',${now},'Reported Alpha runner: historical inclusion and any pre-rally signal must be independently established',${jsonParam({ identity: token, priorAlphaMembershipProven: false, runnerClassificationVerified: false, historicalSignalVerified: false })}::jsonb) ON CONFLICT(token_id) DO UPDATE SET observed_at=excluded.observed_at,evidence=excluded.evidence`;
  const unverified = candidates.filter(
    (symbol) => !rows.some((row) => row.symbol.toUpperCase() === symbol),
  );
  const targetTokens = rows.filter(
    (row) =>
      ["JCT", "BTW"].includes(row.symbol) &&
      row.chain_id === "56" &&
      row.status === "current",
  );
  if (targetTokens.length !== 2) throw Error("CASE_IDENTITIES_NOT_VERIFIED");
  const rpc = new EvmProvider(
    "56",
    config().BSC_RPC_URL,
    new HttpClient("rpc:56", 30, auditRequest),
  );
  const head = await rpc.head(),
    confirmed = head - config().SCAN_CONFIRMATIONS,
    block = await rpc.block(confirmed),
    balances: unknown[] = [],
    verifiedMovements: unknown[] = [],
    unresolved: unknown[] = [];
  await saveSource("rpc:56", block);
  for (const token of targetTokens) {
    const code = await rpc.code(token.contract, confirmed);
    if (code.data === "0x") throw Error("CASE_CONTRACT_EMPTY");
    const decimals = await rpc.decimals(token.contract, confirmed),
      balance = await rpc.balance(address, token.contract, confirmed);
    await saveSource("rpc:56", balance);
    const at = new Date(
      Number(BigInt(block.data.timestamp)) * 1000,
    ).toISOString();
    await sql`INSERT INTO wallet_balance_snapshots(chain_id,address,token_id,block_number,block_hash,raw_quantity,observed_at,source,block_time,decimals) VALUES('56',${address},${token.id},${confirmed},${block.data.hash.toLowerCase()},${balance.data},${balance.observedAt},${balance.source},${at},${decimals}) ON CONFLICT DO NOTHING`;
    await sql`INSERT INTO wallet_monitoring(token_id,chain_id,address,reason,added_by) VALUES(${token.id},'56',${address},'Explicit user-provided JCT/BTW case address; ownership and acquisition unknown','owner') ON CONFLICT DO NOTHING`;
    balances.push({
      token: token.symbol,
      chain: "56",
      contract: token.contract,
      alphaId: token.alpha_id,
      raw: balance.data,
      units: tokenUnits(balance.data, decimals),
      block: confirmed,
      blockHash: block.data.hash,
      blockTime: at,
      observedAt: balance.observedAt,
      responseHash: balance.hash,
    });
  }
  for (const lead of leads) {
    try {
      const receipt = await rpc.receipt(lead.hash),
        header = await rpc.block(Number(BigInt(receipt.data.blockNumber)));
      if (
        header.data.hash.toLowerCase() !== receipt.data.blockHash.toLowerCase()
      )
        throw Error("CASE_NONCANONICAL_RECEIPT");
      await saveSource("rpc:56", receipt);
      await saveSource("rpc:56", header);
      for (const token of targetTokens) {
        const logs = receipt.data.logs.filter(
          (log) => log.address.toLowerCase() === token.contract,
        );
        if (!logs.length) continue;
        const decimals = await rpc.decimals(
          token.contract,
          Number(BigInt(header.data.number)),
        );
        for (const log of logs) {
          const event = decodeTransfer(
            log,
            "56",
            token.id,
            decimals,
            new Date(
              Number(BigInt(header.data.timestamp)) * 1000,
            ).toISOString(),
            receipt.source,
            receipt.observedAt,
          );
          if (!event || ![event.from, event.to].includes(address)) continue;
          await sql`INSERT INTO token_transfers(chain_id,tx_hash,log_index,token_id,block_number,block_hash,event_time,available_at,from_address,to_address,raw_quantity,decimals,kind,source) VALUES('56',${event.txHash},${event.logIndex},${token.id},${event.blockNumber},${event.blockHash},${event.eventTime},${event.availableAt},${event.from},${event.to},${event.rawQuantity},${event.decimals},${event.kind},${event.source}) ON CONFLICT DO NOTHING`;
          verifiedMovements.push({
            token: token.symbol,
            contract: token.contract,
            ...event,
            units: tokenUnits(event.rawQuantity, event.decimals),
            receiptHash: receipt.hash,
            leadSource: lead.source,
            explorer: explorerUrl("56", "tx", lead.hash),
            historicalMembershipBeforeLocalObservation: "not proven",
            interpretation:
              "Verified transfer; not proof of buying, selling or market making",
          });
        }
      }
    } catch (error) {
      unresolved.push({
        txHash: lead.hash,
        error: networkErrorCode(error),
        source: lead.source,
      });
    }
  }
  const thirdParty = "https://arkm.com/explorer/address/" + address;
  await sql`INSERT INTO wallet_labels(chain_id,address,role,entity,source_url,confidence,valid_from,added_by,notes) SELECT '56',${address},'possible_exchange','Bitget',${thirdParty},'Third-party attribution; independently unverified',${now},'research-case/1','Arkham currently attributes this address to Bitget. This is a lead, not independent ownership proof or a historical point-in-time label. Custody operations are an alternative explanation to market making.' WHERE NOT EXISTS(SELECT 1 FROM wallet_labels WHERE chain_id='56' AND address=${address} AND source_url=${thirdParty})`;
  const report = {
    checkedAt: now,
    address,
    verifiedCurrentIdentities: targetTokens,
    currentBalances: balances,
    verifiedMovements,
    unresolved,
    attribution: {
      status: "possible_exchange only",
      source: thirdParty,
      independentlyVerified: false,
    },
    candidateIdentities: rows,
    unverifiedCandidateTickers: unverified,
    unverifiedClaims: [
      "Approximately 338.84M JCT sent toward Bitget before a rally",
      "Approximately 163.96M BTW held at the unspecified historical time",
      "Market-maker association or common control",
      "A contemporaneous Flownix signal or profitable executable trade",
    ],
    limitations: [
      "Only returned verifiedMovements are evidence; unresolved transaction leads remain unverified. This is not a complete historical transfer search",
      "Current balances do not establish historical balances or acquisition cost",
      "No exchange internal account activity or market-making identity is inferred",
      "Historical Alpha status before first collected registry inclusion remains unproven",
    ],
  };
  await sql`INSERT INTO settings(key,value) VALUES('case:jct-btw',${jsonParam(report)}::jsonb) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=now()`;
  await mkdir("artifacts/live", { recursive: true });
  await writeFile(
    "artifacts/live/jct-btw.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
}
const timer = setInterval(
  () =>
    console.log(
      JSON.stringify({
        event: "case_investigation_progress",
        at: new Date().toISOString(),
      }),
    ),
  30000,
);
withRequestWorkload("historical", main)
  .catch((error) => {
    console.error(
      JSON.stringify({
        error: networkErrorCode(error),
        caseStatus: "incomplete",
      }),
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb();
    await closeProviderNetwork();
    clearInterval(timer);
  });
