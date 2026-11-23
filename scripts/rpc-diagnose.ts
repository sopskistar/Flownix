import { installRequestPolicy } from "../packages/core/src/index";
import { workerRequestPolicy } from "../packages/db/src/index";
import {
  EvmProvider,
  HttpClient,
  config,
  evmChains,
  TRANSFER_TOPIC,
  networkErrorCode,
  closeProviderNetwork,
} from "../packages/core/src/index";
import {
  sqlClient,
  closeDb,
  auditRequest,
  setSetting,
} from "../packages/db/src/index";
process.env.DATABASE_URL =
  process.env.DATABASE_URL_WORKER ?? process.env.DATABASE_URL;
const chain = process.argv[2] ?? "8453",
  c = config();
installRequestPolicy(workerRequestPolicy());
const timer = setInterval(() => {}, 1000);
try {
  if (!["1", "56", "8453", "42161"].includes(chain))
    throw Error("UNSUPPORTED_CHAIN");
  const envName = evmChains[chain].env;
  const endpoint = process.env[envName];
  if (!endpoint) throw Error(`${envName}_NOT_CONFIGURED`);
  if (!new URL(endpoint).hostname.endsWith("alchemy.com"))
    throw Error(`${envName}_IS_NOT_ALCHEMY`);
  const rows =
    await sqlClient()`SELECT id,contract FROM alpha_tokens WHERE chain_id=${chain} AND alpha_id IS NOT NULL AND status='current' ORDER BY id LIMIT 1`;
  if (!rows.length) throw Error("NO_VERIFIED_ALPHA_TOKEN");
  const rpc = new EvmProvider(
    chain,
    endpoint,
    new HttpClient(`rpc:${chain}`, 10, auditRequest),
  );
  const results: Record<string, unknown> = {},
    head = await rpc.head(),
    block = head - c.SCAN_CONFIRMATIONS;
  let transferLogs: Awaited<ReturnType<EvmProvider["logs"]>>["data"] = [];
  for (const [operation, read] of [
    ["confirmed_block", () => rpc.block(block)],
    ["contract_code", () => rpc.code(rows[0].contract, block)],
    ["decimals", () => rpc.decimals(rows[0].contract, block)],
    ["historical_block", () => rpc.block(Math.max(0, head - 1_000_000))],
    [
      "historical_balance_of",
      () =>
        rpc.balance(
          "0x0000000000000000000000000000000000000000",
          rows[0].contract,
          Math.max(0, head - 1_000_000),
        ),
    ],
    [
      "transfer_logs_10_blocks",
      () => rpc.logs(rows[0].contract, block - 9, block),
    ],
  ] as const) {
    try {
      const result = await read();
      if (operation === "transfer_logs_10_blocks")
        transferLogs = (result as Awaited<ReturnType<EvmProvider["logs"]>>)
          .data;
      results[operation] = {
        ok: true,
        ...(operation === "transfer_logs_10_blocks"
          ? {
              events: (result as Awaited<ReturnType<EvmProvider["logs"]>>).data
                .length,
            }
          : {}),
      };
    } catch (e) {
      results[operation] = { ok: false, error: networkErrorCode(e) };
    }
  }
  const sample = transferLogs.find(
    (log) => log.topics[0]?.toLowerCase() === TRANSFER_TOPIC,
  );
  if (sample) {
    try {
      const receipt = await rpc.receipt(sample.transactionHash);
      const receiptLog = receipt.data.logs.find(
        (log) =>
          log.address.toLowerCase() === rows[0].contract.toLowerCase() &&
          log.blockHash.toLowerCase() === sample.blockHash.toLowerCase() &&
          log.logIndex.toLowerCase() === sample.logIndex.toLowerCase() &&
          log.topics[0]?.toLowerCase() === TRANSFER_TOPIC,
      );
      const canonical = await rpc.block(Number(BigInt(sample.blockNumber)));
      results.receipt_sample = {
        ok:
          !!receiptLog &&
          canonical.data.hash.toLowerCase() === sample.blockHash.toLowerCase(),
        txHash: sample.transactionHash,
        blockNumber: Number(BigInt(sample.blockNumber)),
        canonical:
          canonical.data.hash.toLowerCase() === sample.blockHash.toLowerCase(),
        matchingTransferLog: !!receiptLog,
      };
    } catch (e) {
      results.receipt_sample = { ok: false, error: networkErrorCode(e) };
    }
  } else {
    results.receipt_sample = {
      ok: null,
      reason:
        "No ERC-20 Transfer log for this Alpha contract in the ten-block sample; this does not imply no historical activity.",
    };
  }
  const report = {
    at: new Date().toISOString(),
    chain,
    tokenId: rows[0].id,
    head,
    confirmed: block,
    results,
    provider: "Alchemy",
    limitations:
      "Read-only point probes only; not a complete history, ledger, replay or coverage proof",
  };
  await setSetting(`rpc_diagnostic:${chain}`, report);
  console.log(JSON.stringify(report, null, 2));
} catch (e) {
  const message = e instanceof Error ? e.message : "RPC_DIAGNOSTIC_FAILED";
  console.error(
    /^(ETH_RPC_URL|BSC_RPC_URL|BASE_RPC_URL|ARBITRUM_RPC_URL)_(NOT_CONFIGURED|IS_NOT_ALCHEMY)$/.test(
      message,
    )
      ? message
      : networkErrorCode(e),
  );
  process.exitCode = 1;
} finally {
  await closeDb();
  await closeProviderNetwork();
  clearInterval(timer);
}
