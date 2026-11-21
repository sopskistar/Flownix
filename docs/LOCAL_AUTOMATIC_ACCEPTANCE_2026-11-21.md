# Local automatic-monitoring acceptance — 2026-11-21

## Current acceptance result

**Not passed.** This machine restarted, so the prior local-only collector is no longer running. A fresh read-only Neon status check from this sandbox returned `ECONNREFUSED`; this does not distinguish a remote database/network outage from the current execution network restriction. No cursor, market row, or historical evidence was reset. Do not treat the last persisted heartbeat as current.

The latest available persisted status snapshot is from **2026-11-21 10:05:15 UTC**, before this restart:

| Measure | Snapshot |
| --- | ---: |
| Official Alpha identities | 687 |
| Online / offline | 378 / 309 |
| Online identities with an active Alpha pair | 316 |
| Supported baseline jobs scheduled | 357 of 357 |
| Supported jobs due / retrying | 317 / 27 |
| Online identities without baseline adapters | 21 |
| Quoted token identities / fresh within 15 minutes | 318 / 173 |
| No-pair identities | 62 |
| Canonical transfers / swap interpretations | 195 / 18 |
| Database size | 93,978,624 bytes |

Registry counts include every official Alpha identity, including meme coins. Baseline adapters then covered Ethereum, BSC, Base, Arbitrum and Solana. The 21 online unsupported identities in that snapshot were Sonic (4), Robinhood Chain (5), TRON (3) and Sui (9). Registry-listed Linea was offline in that snapshot. These rows remain in the official Alpha universe; unsupported does not mean excluded from discovery.

The collector had a fresh local heartbeat and one advisory lock at that snapshot, but 317 scans were due and 27 retrying. Three market cycles attempted 244 tickers in the preceding profiling window; the latest saved cycle completed 100/100, while only 173/318 quoted identities were fresh at the snapshot. This was progress, not sustained all-pair freshness or one complete baseline cycle.

The 34 completed EVM scans across the 1,767.808-second worker profile average about **1.15 scans/minute**. A simple 357-job extrapolation at that profile-wide rate is about **5.2 hours** for one supported-universe pass; this is not a full-cycle benchmark. On Alchemy Free each EVM job scans a maximum ten-block window, so cursor advancement at that rate cannot keep up with normal hourly chain growth across the whole universe. This is another reason the saved job count is not proof of live wallet-monitoring coverage.

## Wallet, signal and strategy evidence

The 1,767.808-second bounded profile recorded 34 completed EVM token scans: 29 BSC, three Base, one Ethereum and one Arbitrum. It added five canonical transfer events. Transfers are not purchases. One Solana Alpha scan observed 20 top accounts, 20 transactions and 38 mint-specific balance deltas with no reported account gap, but correctly marked `completeHistory: false`. The recurring `SOLANA_RPC_-32015` is now traced to the request's `maxSupportedTransactionVersion: 0`: current Solana docs say v1 transactions require value `1`, and value `0` fails. Flownix now opts into version 1 with a regression test; this machine could not perform a post-fix live RPC check.

No current evidence establishes beneficial ownership labels for exchange, market-maker or team wallets, durable holder-retention histories, complete holder balances, independently verified accumulation, or a validated strategy. The recent scanner traces explicitly suppressed anomaly detection when fresh market price/minimum-liquidity prerequisites were missing. Historical controls, winner/loser cohorts, out-of-sample strategy results and forward paper trading remain unproven. Preserve that separation in dashboard and notification language.

## Provider resource measurements

All five configured local EVM/Solana RPC endpoints were confirmed to use Alchemy by hostname without printing endpoint values. The existing worker profile recorded 348 RPC requests total: 242 EVM and 106 Solana. Alchemy account/dashboard usage could not be read from the sandbox, so these are method-based CU estimates, not invoice or dashboard readings.

The EVM method counters in that profile imply **5,384 documented CUs** across 242 EVM RPC calls: 29 BSC, three Base, one Ethereum and one Arbitrum scan. The HTTP attempt count matches the EVM method-call count, so no additional EVM retries were observed in that run. The 106 Solana requests are bounded at **1,060–4,240 CUs** using the documented 10–40 CU method range for the methods used. The resulting profile estimate is **6,444–9,624 CUs**. It excludes unrelated activity sharing the Alchemy account and must not be described as actual billed consumption. New worker profiles now count the method-priced estimate and unpriced RPC calls directly without persisting request URLs, credentials or bodies.

Using the official method table, a normal empty EVM scan costs about 156 CUs before retries/additional blocks: `eth_blockNumber` 10 + `eth_getLogs` 60 + `eth_getCode` 20 + `eth_call` 26 + two `eth_getBlockByNumber` calls 40. A registry snapshot had approximately 335 supported online EVM identities. Hourly minimum-cost baseline scans therefore plan for approximately **37.6 million CUs/month**, above Alchemy's currently published **30 million CU Free allowance** and 300-CU/s throughput. A 15-minute cadence would need roughly 150.5 million CUs/month before retries, extra block fetches, or other apps. Free `eth_getLogs` currently allows only ten blocks per query on Ethereum, Base, Arbitrum and BNB. Thus the current free allowance cannot support all-token hourly minimum scans with headroom, and 15-minute per-token chain monitoring is not feasible at that allowance.

The local worker process profile—not provider billing—measured mean RSS about 145.8 MiB, peak sampled RSS 163.4 MiB, mean CPU about 2.22%, 3,034 SQL queries and roughly 3.1 MB read / 23.7 MB written over the run. It does not measure Neon server CU-hours, query latency billed to the account, or hosted worker resource use.

Neon usage telemetry is also unavailable from the current restricted session. The existing database was about **89.6 MiB** in the last snapshot. Current Neon Free terms publish **100 CU-hours and 1 GB storage per project**. At a 0.25 CU minimum, 100 CU-hours covers 400 active hours; a 24/7 compute at that minimum would use 182.5 CU-hours/month. Neon Free compute auto-suspends after five minutes of inactivity by default, but Flownix's worker heartbeat and scheduled jobs query every 30 seconds or more often, so an always-on collector is expected to prevent idle suspension. This is a quota-based warning, not a measurement of this Neon account's usage. No service was upgraded.

Primary references checked 2026-11-21: [Alchemy plan limits](https://www.alchemy.com/docs/reference/pricing-plans), [Alchemy method CU table](https://www.alchemy.com/docs/reference/compute-unit-costs), [Alchemy Free `eth_getLogs` range](https://www.alchemy.com/docs/chains/ethereum/ethereum-api-endpoints/eth-get-logs), [Neon Free plan](https://neon.com/blog/neon-free-plan-1-gb-per-project), [Neon scale-to-zero behavior](https://neon.com/blog/why-you-want-a-database-that-scales-to-zero), and [Solana v1 read requirements](https://solana.com/docs/core/transactions/versioned-transactions).

## Browser and recovery status

The public production `/login` route, token-image authorization rejection (401 without a session), production commit/style markers and deployed Vercel status were verified in the prior session. No authenticated production browser session was available to this execution; the OAuth credentials are not used to bypass or synthesize a user session. Private production dashboard rendering therefore remains unverified.

The private Radar and Watchlist routes now return their authenticated shell and put the asynchronous health/token reads inside the React Suspense boundary. Previously they awaited Neon before returning JSX, leaving the boundary around an already-resolved component and providing no early streaming fallback. This addresses the identified structural SSR issue, but live Neon browser verification is still required to establish that the prior server-render boundary errors are resolved in the running environment.

## Remaining acceptance blockers

1. Restore authorized Neon connectivity and confirm the existing worker and pooled URLs still target the same database.
2. Restart one collector under its existing advisory lock; verify registry refresh, a completed 357-identity supported baseline pass, advancing per-token checkpoints, and repeated market freshness cycles.
3. Re-run the Solana scan with the v1-compatible request, confirm gap-aware per-account checkpoint advancement, and measure retry rates; sampling is not full history.
4. Measure usage in the Alchemy account usage/Admin API and Neon project usage dashboard/API. Profile estimates cannot replace either account meter.
5. Finish verified wallet/entity evidence, current suppression/detection outcomes, notifications and paper-forward observations.
6. Complete authenticated production browser QA when an authorized browser session/network route is available.
7. The documented Alchemy and Neon Free quotas do not support the intended always-on coverage cadence with headroom. No paid plans or hosts are activated; ongoing 24/7 acceptance must remain pending until an already-approved quota-compatible runtime/provider is available.

No changes were made to production records during this acceptance attempt.

## Restart-session verification

The recovered worktree is still based on `b94eaaf`, with the pending changes listed in `git status`; no files were reset or discarded. `git diff --check` passed. Typecheck and lint passed. The full test command reported 91 passing tests and one PostgreSQL integration failure: the root `.env` points to local `127.0.0.1:5432`, and the sandbox denied loopback connection with `EPERM`. Retrying that integration test with `.env.worker.local` reached the configured Neon host selection but DNS/network resolution failed with `ECONNREFUSED` before a database connection or test transaction began. This is an environment connectivity failure, not evidence that Neon is unavailable; no schema or production data was changed.

`pnpm build` remains unverified because Next.js could not spawn its TypeScript `--showConfig` child process (`EPERM`); direct typecheck passes. `pnpm test:e2e` could not start the Playwright web server because binding the local test port was denied (`EPERM`), so no browser was launched and no authenticated screenshot was captured. The browser failure is distinct from an application assertion failure. A remote check of the prior GitHub Actions run and Vercel deployment was also inaccessible from this execution environment; the last handover records success for `b94eaaf`, but that status was not independently refreshed here.

The EVM token scan now loads its official token, block cursor, and intensive-selection flags in a single query, removing two serial database round trips per EVM scan without changing token coverage or cursor behavior. Worker profiles now include per-request method-priced Alchemy CU estimates and an unpriced-method count; these are local estimates, not account billing telemetry. The Solana `getTransaction` request accepts transaction version 1, with a regression test. No live post-fix RPC or complete scan cycle could be run while the configured database and network were unreachable.

Git metadata is read-only in this execution environment. The changes remain uncommitted and unpushed, and no CI run or deployment was triggered for them. Do not treat the prior `b94eaaf` deployment as containing these pending edits.
