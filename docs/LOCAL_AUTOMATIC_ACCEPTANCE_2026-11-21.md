# Local automatic-monitoring acceptance — 2026-11-21

<!-- recovery-continuation:start -->
## Recovery continuation with restored execution access

Full automatic acceptance remains **not passed**. The old sandbox restrictions are resolved: Git main/remote matched `5702523855a1bd7d588b75155a954d8ed9af71b2`, both existing Neon URLs passed target/TLS verification, all four Alchemy EVM chains passed confirmed/historical block, code, decimals, balance and ten-block log probes, and Alchemy Solana passed finalized account/history/transaction probes. The existing local PostgreSQL container was started with its original volume. No production migration, reset, credential change, paid service or trading action was performed.

The interrupted worker changes were retained and completed. Market provenance, snapshots and coverage now commit atomically in one statement. Two bounded market consumers share the existing request pacing; one market job can overlap the serial RPC/maintenance lane under the same collector lock. Market batches continue while due tokens remain, new pairs escape the no-pair delay, registry refresh precedes membership expiry, unchanged scan reconciliation performs no writes, and one overdue retry gets a turn after five regular scans. Request-budget exhaustion stops collection. Automatic investigation-queue identities receive intensive market and wallet research without manual selection.

Solana now keeps the newest signature checkpoint, deduplicates shared transactions across sampled accounts, validates slot/metadata, counts gaps per account, and preserves checkpoints when transaction metadata is unavailable. Existing gaps remain explicit. A live v1-compatible transaction read returned two mint-specific balance deltas. This is sampled finalized evidence, not purchases, complete holder coverage or historical accumulation.

The replay gate now carries chain metadata and uses the admitted supported universe rather than manual deep selection. Three actual saved EVM windows replayed without adding duplicate events, changing first availability or moving cursors. Three receipt/log/block samples were independently matched. The report separates this passing vertical slice from still-failing full automatic monitoring and keeps timestamped reports beside the latest report.

Radar filters now use the supported native History API for already-loaded rows, preserving URL state without refetching the Neon-backed page per keystroke. Controls wait for hydration. Price freshness uses both observation and provider timestamps; a newly collected ticker does not turn an old last-trade price into fresh evidence. The CLI separately reports collected pairs, source-fresh pairs, per-chain observed coverage, retries and evidence added since a supplied timestamp.

Validation at this checkpoint: 98 tests across 12 files passed locally, including real PostgreSQL rollback integration and bounded market concurrency/atomicity checks. The two PostgreSQL integration cases also passed against the existing Neon database inside isolated rollback schemas. Four local browser journeys passed before the final populated-data filter refinement; final browser/build/release checks are recorded below when complete. Anonymous production security, GitHub handoff, secure auth cookies and desktop/tablet/phone login checks passed. No owner-authenticated production browser session is available; no session was manufactured.

### Measured recovery snapshot

At **2026-11-21 14:31:17 UTC**, 687 identities were retained (378 online). All 357 supported identities remained scheduled; 280 scans were due and 29 retrying. Baseline evidence existed for 187/335 EVM identities and 9/22 Solana identities; 74 distinct supported identities had observations since the recovery start at 13:35:41 UTC. This is partial progress, not a complete current baseline pass.

All 316 currently paired identities had recently collected ticker observations at that snapshot, but only **89/316** met source-price freshness using provider `closeTime`. Another 62 online identities had no active pair. Earlier observed-only freshness counts must not be interpreted as fresh last-trade prices. Recovery added six canonical transfers and 233 Solana balance observations by this snapshot, with zero new signals. Transfers/deltas are not verified buys. Six canonical receipt-evidence rows and 33 EVM balance samples were retained. Cursors were never jumped to head to hide backlog.

Local process resource profiles are retained in ignored `artifacts/profiles/` and summarized in `WORKER_RESOURCE_MEASUREMENTS.json`. RPC requests and SQL queries are measured; Alchemy CUs are method-priced estimates. Account-level Alchemy usage and Neon compute/billing meters remain unavailable without an authorized management credential. PostgreSQL database size is measured directly. No provider invoice, monthly allowance or hosted-worker cost is inferred from a process profile.

### Remaining operational and research gates

Continue one collector until every supported identity has a genuine successful current observation; distinguish that from continuously near-head EVM coverage. Existing Alchemy ten-block windows and preserved old cursors still leave historical backlog. The 21 unsupported online identities remain in discovery. The runtime is local and bounded, not a persistent deployment. No paid host or plan has been enabled; account quotas and a suitable approved persistent runtime remain deployment gates.

Whale retained holdings, Binance/Bitget beneficial-owner flows, market-maker/team identities, winner/non-winner cohorts, listing events, Rally Intelligence, chronological/out-of-sample strategy validation and forward paper fills remain gated by verified source/history/trade/label coverage described in the existing historical gap audit. No profitable strategy or accumulation finding is claimed. These requirements were not replaced by the operational fixes or another synthetic backtest.

<!-- recovery-continuation:end -->

## Earlier environment-limited acceptance result

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
