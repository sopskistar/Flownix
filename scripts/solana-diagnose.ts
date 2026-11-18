import { decodeSolanaBalanceDeltas, HttpClient, networkErrorCode, SolanaProvider, closeProviderNetwork } from "../packages/core/src/index";
import { auditRequest, closeDb, saveSource, setSetting, sqlClient } from "../packages/db/src/index";

process.env.DATABASE_URL = process.env.DATABASE_URL_WORKER ?? process.env.DATABASE_URL;
const endpoint = process.env.SOLANA_RPC_URL;
if (!endpoint) {
  console.error("SOLANA_RPC_URL_NOT_CONFIGURED");
  process.exit(1);
}
if (!new URL(endpoint).hostname.endsWith("alchemy.com")) {
  console.error("SOLANA_RPC_URL_IS_NOT_ALCHEMY");
  process.exit(1);
}
const timer = setInterval(() => {}, 1000);
const report: Record<string, unknown> = { at: new Date().toISOString(), provider: "Alchemy Solana", chain: "Solana Mainnet", chainId: "CT_501", configured: true, results: {} };
try {
  const candidates = await sqlClient()`SELECT id,contract,symbol FROM alpha_tokens WHERE chain_id='CT_501' AND alpha_id IS NOT NULL AND status='current' ORDER BY id LIMIT 20`;
  const mint = candidates.find((t) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(t.contract));
  if (!mint) throw new Error("NO_CURRENT_ALPHA_SOLANA_MINT");
  const rpc = new SolanaProvider(endpoint, new HttpClient("rpc:CT_501", 10, auditRequest));
  const results = report.results as Record<string, unknown>;
  report.token = { tokenId: mint.id, symbol: mint.symbol, mint: mint.contract };
  const jobs: Array<[string, () => Promise<unknown>]> = [
    ["version", () => rpc.version()],
    ["genesis_hash", () => rpc.genesisHash()],
    ["finalized_slot", () => rpc.slot("finalized")],
    ["first_available_block", () => rpc.firstAvailableBlock()],
    ["mint_identity_supply_decimals", () => rpc.mintInfo(mint.contract)],
    ["largest_token_accounts", () => rpc.largestTokenAccounts(mint.contract)],
  ];
  let largest: Awaited<ReturnType<typeof rpc.largestTokenAccounts>> | undefined;
  for (const [name, run] of jobs) {
    try {
      const value = await run();
      if (name === "largest_token_accounts") largest = value as typeof largest;
      if (name === "largest_token_accounts") {
        await saveSource("solana_rpc", value as Awaited<ReturnType<typeof rpc.largestTokenAccounts>>);
        const result = (value as Awaited<ReturnType<typeof rpc.largestTokenAccounts>>).data;
        results[name] = { ok: true, observedSlot: result.context.slot, accountCount: result.value.length };
      } else results[name] = { ok: true };
    } catch (e) { results[name] = { ok: false, error: networkErrorCode(e) }; }
  }
  const accountAddress = largest?.data.value[0]?.address;
  if (accountAddress) {
    try {
      const [account, signatures] = await Promise.all([rpc.tokenAccountOwner(accountAddress), rpc.signatures(accountAddress, 1)]);
      results.top_account_owner = { ok: !!account.data, ownerAvailable: !!account.data?.owner, mintMatches: account.data?.mint === mint.contract };
      results.address_history = { ok: true, signatures: signatures.data.length, slot: signatures.data[0]?.slot ?? null };
      if (signatures.data[0]) {
        const tx = await rpc.transaction(signatures.data[0].signature);
        if (tx.data) {
          const changes = decodeSolanaBalanceDeltas(tx.data, mint.contract);
          await saveSource("solana_rpc", tx);
          results.transaction_and_balance_deltas = { ok: true, slot: signatures.data[0].slot, blockTime: (tx.data as { blockTime?: number | null }).blockTime ?? null, matchingMintBalanceDeltas: changes.length, signature: signatures.data[0].signature };
        } else results.transaction_and_balance_deltas = { ok: false, error: "TRANSACTION_UNAVAILABLE" };
      } else results.transaction_and_balance_deltas = { ok: null, reason: "No recent signature for the largest token account; this is not proof of inactivity." };
    } catch (e) { results.address_history = { ok: false, error: networkErrorCode(e) }; }
  }
  const history = await sqlClient()`SELECT count(*)::int AS observations,min(block_time) AS first,max(block_time) AS last,count(DISTINCT owner_address)::int AS owners FROM solana_balance_observations WHERE canonical`;
  report.persistedHistory = history[0] ?? { observations: 0, first: null, last: null, owners: 0 };
  report.historical_balance_at_slot = { status: "not_requested", reason: "Alchemy documents historical Solana Account Archive reads as paid-tier; current plan/account access has not been verified. Flownix preserves snapshots prospectively instead." };
  report.limitations = "One real Alpha mint and bounded top-account/transaction probes; not an all-holder census or historical ledger. Balance deltas are not purchases. No transaction write methods are used.";
  await setSetting("solana_rpc_diagnostic", report);
  console.log(JSON.stringify(report, null, 2));
} catch (e) {
  console.error(networkErrorCode(e));
  process.exitCode = 1;
} finally {
  await closeDb();
  await closeProviderNetwork();
  clearInterval(timer);
}
