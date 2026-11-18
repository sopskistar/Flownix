# Automatic discovery activation verification — 2026-11-18

This report records live checks against the ignored local worker configuration and the existing Neon database. It separates successful point probes from scheduled jobs and completed observations.

## Configuration and RPC diagnostics

All five expected variables are present in `.env.worker.local`: `ETH_RPC_URL`, `BSC_RPC_URL`, `BASE_RPC_URL`, `ARBITRUM_RPC_URL`, and `SOLANA_RPC_URL`. The worker loads that file through the existing `--env-file=.env.worker.local` scripts. No endpoint values are included here.

The four EVM diagnostic commands completed read-only probes against current Alpha contracts:

| Network | Chain ID | Chain/head | Confirmed block | Contract code/decimals | Historical block and `balanceOf` | Ten-block transfer query |
|---|---:|---|---|---|---|---|
| Ethereum | 1 | Passed | Passed | Passed | Passed at head − 1,000,000 | Passed; 0 sampled events |
| BNB Smart Chain | 56 | Passed | Passed | Passed | Passed at head − 1,000,000 | Passed; 0 sampled events |
| Base | 8453 | Passed | Passed | Passed | Passed at head − 1,000,000 | Passed; 0 sampled events |
| Arbitrum One | 42161 | Passed | Passed | Passed | Passed at head − 1,000,000 | Passed; 0 sampled events |

Each result is a bounded point probe, not historical token-wide coverage. No receipt sample was available because the ten-block samples returned no Transfer events. EVM diagnostics use the provider audit client and conservative request pacing; BSC required a longer bounded run to finish.

Alchemy documents 30 million compute units (CUs) per month and 500 CUs/second account-wide on Free; its current `eth_getLogs` documentation sets a ten-block maximum on Free for Ethereum, Base, Arbitrum and BNB. The minimum empty-window scan in the current code is approximately six JSON-RPC calls and 156 CUs (block number 10, logs 60, code 20, decimals via `eth_call` 26, and two endpoint blocks 40; extra event blocks and retries increase this). At 335 online EVM identities and hourly scans, the rough baseline would be 241,200 scans/month, or **about 37.6 million CUs/month**, before retries and other applications. This estimate exceeds one documented Free allowance; it is a planning calculation, not measured billing or confirmation of the account's plan. No paid upgrade was activated. Sources: [Alchemy Free allowance](https://support.alchemy.com/articles/5827006872-what-is-included-in-the-free-tier), [eth_getLogs ranges](https://www.alchemy.com/docs/chains/ethereum/ethereum-api-endpoints/eth-get-logs), and [method CU costs](https://www.alchemy.com/docs/reference/compute-unit-costs).

Solana's chain-appropriate JSON-RPC probes passed: `getVersion`, genesis hash, finalized slot, first available block, verified Alpha mint metadata/supply/decimals, `getTokenLargestAccounts`, token-account owner/mint match, one recent signature, and `getTransaction`. At slot `470685632`, a finalized transaction for the Alpha Fartcoin mint `9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump` yielded two mint-specific balance deltas. Transaction reference: [`3kTF8KEBV7vXAQA12P1fFtjDNJWJarj5yCLJdig1qsnPGdVc8wXQ3wjQTDnVgr53fhYSy7DHvrNGuE44yLRQeo3a`](https://solscan.io/tx/3kTF8KEBV7vXAQA12P1fFtjDNJWJarj5yCLJdig1qsnPGdVc8wXQ3wjQTDnVgr53fhYSy7DHvrNGuE44yLRQeo3a). This is a token-account delta, not a verified buy or sell.

The Solana diagnostic uncovered and fixed a validator bug: signatures were checked using the shorter mint-address length rule. The validator now uses the distinct transaction-signature length rule; a regression test was added. The Alchemy historical account-archive capability is not established for this account, so the adapter remains prospective and partial.

## Registry, scheduler, market, and ingestion

The official registry job completed and persisted its current response. The resulting database snapshot contains **686 identities: 378 online and 308 offline**. Online distribution:

| Registry chain | Online identities | Coverage |
|---|---:|---|
| Ethereum (1) | 19 | EVM adapter |
| BNB Smart Chain (56) | 288 | EVM adapter |
| Base (8453) | 26 | EVM adapter |
| Arbitrum One (42161) | 2 | EVM adapter |
| Solana (`CT_501`) | 22 | Partial Solana adapter |
| Sonic (146) | 4 | Registry only |
| Robinhood Chain (4663; Binance registry label `Robinhood`) | 5 | Registry only; the network name/ID are confirmed by [Robinhood's official chain connection docs](https://docs.robinhood.com/chain/connecting/) |
| TRON (`CT_195`) | 3 | Registry only |
| Sui (`CT_784`) | 9 | Registry only |

After reconciliation, **357/357** online identities on the five implemented networks had persistent scan jobs. The other **21 online identities** are not silently added to a different chain adapter: 4 Sonic, 5 chain ID 4663 (registry label `Robinhood`), 3 TRON, and 9 Sui. They remain in the official universe and need chain-native adapters.

A 90-second scan-only worker run attempted 23 due jobs across its fair due-time rotation. All 23 ended in `NETWORK_OR_PARSE_ERROR`; **zero EVM cursor/checkpoint advancements** resulted. At the latest status query, 357 jobs remained scheduled/due, with 23 retrying. Neon audit records include a BSC `UND_ERR_CONNECT_TIMEOUT`; the generic job code does not yet let us attribute every failed attempt to a specific RPC stage. Earlier retry rows included 11 HTTP 403, 2 HTTP 429, and 1 timeout; these were retried and superseded by the latest 23 generic failures. No current 403/429 result was established by the bounded run.

A direct bounded Solana baseline invocation for the verified Fartcoin identity partially persisted **83 observations for one token**, including **14 top-account snapshots and 69 transaction-delta rows across 58 observed owners**. It processed 14 of the 20 requested accounts; all 14 account cursors are marked with a coverage gap because one signature/account does not establish continuity. It hit the 180-second process cap before completing the scan. These records are partial account-level observations and do not establish complete history, a holder census, or trade direction. The full automatic cycle did not complete.

The current market-coverage table reports **0 fresh, 316 stale, 62 no-pair, 0 errors**. A recent registry metadata price is not substituted for a fresh executable Alpha ticker. The collector is not continuously hosted.

At 2026-11-18 14:36 UTC, scan jobs were **335 queued, 23 retrying, 0 done** in the current batch state. The existing Neon database measured **79,921,152 bytes** (about 76.2 MiB). Its RPC audit table recorded 83 HTTP attempts in the preceding two hours: 80 successful responses and 3 failures (BSC connect timeout; Solana timeout and the now-fixed signature-schema error). These are request counts, not Alchemy CU billing. Neon SQL activity/compute usage and account-level Alchemy CU consumption were not available from this local check.

The worker profile collector was not enabled during the 90-second EVM scan attempt or 180-second Solana attempt. Therefore CPU, RSS/heap peak and socket byte totals for these live jobs were **not measured**; those bounded runs are not a complete-cycle resource benchmark.

## Evidence and system state

- Existing canonical EVM transfers: **180**; existing decoded swap interpretations: **18**. No new canonical EVM transfer was stored by the bounded worker attempt.
- Signal events: **0**. No evidence-backed accumulation/distribution alert was fabricated.
- EVM cursors remain on **4 Ethereum and 8 BSC identities**, with the pre-existing November 16 scan times; **0 Base, 0 Arbitrum** cursors. This is not a full-universe ledger.
- Solana observations are partial prospective account samples; long-term retention and historical balances remain unavailable.
- Telegram delivery has not been verified in this run; no successful delivery is claimed.
- Continuous worker hosting remains inactive. No paid host/API plan was activated.
- The Vercel production deployment SHA was not available from the local deployment tooling in this verification; `flownix.xyz` availability alone cannot identify the deployed commit.

## Required next actions

1. Diagnose intermittent provider/Neon network timeouts by stage, then retry only affected jobs with bounded backoff.
2. Fix scan throughput before claiming complete coverage: per-token 10-block requests at hourly cadence cannot establish a current, gap-free ledger for the whole EVM universe.
3. Finish the Solana baseline run or reduce its per-cycle request count while preserving fair token rotation and explicit gaps.
4. Implement Sonic, Robinhood Chain, TRON, and Sui adapters after verifying provider/model compatibility.
5. Verify a complete scheduled cycle, EVM canonical event persistence/replay, dashboard presentation, and Telegram receipt before describing automatic intelligence as operational.
6. Verify the exact Vercel deployment SHA in the Vercel project.
