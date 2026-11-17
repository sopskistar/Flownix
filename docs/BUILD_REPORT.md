# Delivery report — Phase 2 progress, hosting deferred

Updated 2026-11-17 UTC (November 16 in New York). **No persistent cloud worker is deployed. No paid plan was activated. Live-data acceptance remains incomplete.** Existing production: https://flownix.xyz; OAuth/Neon/UI/brand architecture preserved. Git/hosted-CI identifiers belong in the final delivery message and `git log -1`.

Current live evidence in the existing Neon database (snapshot measured 2026-11-17 15:55 UTC):

- Official registry: **686 chain/contract identities, 379 current, 307 offline, 0 unknown**, spanning ten chain IDs. Snapshot at 15:07 UTC. Source responses/hashes and membership snapshots retained. `tokenId` is opaque; the stored registry response has 686 distinct `alphaId` values and 1,467 symbols across U, USDT and USDC quotes.
- Broad official Alpha market coverage: **317/317 current identities with active pairs received a ticker** over four capped local cycles; 62/379 online identities have no active pair, and zero ticker failures were recorded. There are 377 Alpha ticker snapshots; 244 were younger than 15 minutes at 15:55 UTC. This is a local batch run, not always-on service, so observations age. Registry metadata prices exist for all 379 online identities but remain explicitly quote-unspecified. **60,543 completed hourly candles** are still limited to the deep-selected symbols; some reach ~187 days. Backfilled prices became available locally at fetch time and do not establish past Alpha membership or contemporaneous signals.
- **15 selected deep tokens, 12 with completed 100-block windows:** eight BSC and four Ethereum; three Base tokens have no completed scan. **180 canonical Transfer events** (139 BSC, 41 Ethereum), 33 observed balance snapshots. These are short samples, not complete ownership history.
- Three actual transaction receipts, log identities/quantities/times and block hashes independently matched the stored events. References are in DATA_COVERAGE.md. **18 Pancake V3 pool interpretations**: one direct-settlement attributed buy, one attributed sell, sixteen unattributed pool-side swaps. No beneficial owner inferred.
- Eight persisted wallet-research reports from the available monitored-address sample; requested 1/3/7/14/30/60/90/180-day windows show unknown where opening balances/continuous ledger are missing. No 30-day holder history was obtained. **Zero genuine accumulation signals or proven profitable trades.**
- Immutable transfer-rule suppression traces persisted. Receipt gate passed its three samples, but replay/resume hit RPC 403/timeouts; Base confirmed block/code/decimals pass while even ten-block logs return 429. Real cursor-advancement/replay acceptance remains pending. Existing observations/checkpoints were preserved.

Implemented: process-local optional DNS repair with normal hostname/TLS, precise safe provider errors/audits; batched registry/candle/transfer writes; incremental candles and six-hour backfill-page spacing; dedicated ORM serializer isolation; canonical receipt evidence and reorg invalidation; known-factory passive Pancake V3 settlement classification; conservative balance-reconciled retained-purchase lower bounds; time-valid reviewed exchange-flow rules; possible round-trip turnover warnings; long-term thesis rules/state history with stale/farming suppression and no flat-price expiry; bounded wallet materialization; single-worker lock/leases/heartbeat/shutdown, storage guard and local profiling; broad ticker rotation independent of the deep limit; explicit no-pair/error coverage; exact quote-aware pair selection; source-labeled registry price fallback; evidence-cited research classifications, defaulting Radar/deep selection to owner-reviewed non-meme only. Additive migrations 0007–0011 preserve existing Journal data.

The Section 5 requirements remain in scope. Current depth is deliberately partial: no independently verified exchange/market-maker/team ownership registry, top-holder census, comprehensive operational supply exclusions, complete relationships/hops, automated team vesting/catalyst attribution, or validated distribution/invalidation pipeline. The thesis engine's distribution path has deterministic tests, while the current materializer supplies no verified distribution evidence; it must not be advertised as an operational distribution detector. Cross-token ownership, supply lock and baselines need genuine longitudinal evidence before strong conclusions. These are remaining engineering/data work, not removed requirements.

Historical research: 29 matching official identities from the user candidate list recorded for investigation; PAAL remains unverified. JCT/BTW current contract balances observed for the supplied address. Claimed historical 338.84M JCT transfer/163.96M BTW holding and pre-rally timing remain unverified; third-party Bitget attribution stays possible_exchange. No historical positive/negative result series is fabricated. Public homepage work remains secondary and unstarted.

Verification: **64 unit/database tests and four browser journeys pass**, lint/typecheck/production build pass; AMD64 worker image built, no exposed ports. ARM64 execution and cloud worker operation remain unverified. Local profiles measured ~103 MiB mean idle RSS, ~118 MiB restart mean, ~163 MiB sampled incomplete market peak. Healthy full-cycle/catch-up/50/100-token benchmarks remain pending because providers reject history and the first run stalled. Exact measurements and priced assumptions: [WORKER_HOSTING_COMPARISON.md](WORKER_HOSTING_COMPARISON.md). All test fixtures are isolated; live acceptance is reported separately from CI.

**Highest-leverage next improvement:** verify a reliable permitted RPC with required historical/log access, then finish real replay/cursor recovery and healthy-cycle profiling before declaring continuous intelligence operational. Hosting selection is independent and remains the owner's decision.

## Archived deployment-repair report (before Phase 2)

Everything below records the earlier foundation/deployment repair; its zero/unverified data counts and six-migration status are historical and superseded above.

Status: implemented, tested private research **foundation**, now securely deployed at **https://flownix.xyz**. **Live research v1 acceptance is not complete.** This release repairs CI and production deployment; it does not begin Phase2 live ingestion. Git commit/push and final hosted-CI identifiers are reported in the delivery message and `git log -1`.

## Implemented modules

| Path          | Delivered functionality                                                                                                                                                                                                                                                                                     |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| apps/web      | Protected Next App Router Radar, long-term Watchlist, token investigation/ranges/evidence timeline, Wallet Detective, sourced labels, Alerts, Journal, candidate Runner Lab, observed-book paper ledger, provider health/settings, CSV, privacy, noindex metadata and custom 404.                           |
| apps/worker   | Durable scheduled collection, retries/leases/single-worker lock, heartbeats, full official registry reconciliation, selected exact Alpha pairs/candle backfill/depth, confirmed EVM log and sampled balance adapters, transfer detections, coverage records, forward outcomes and optional Telegram outbox. |
| packages/core | Validated provider contracts, chain/contract identities, decimal-safe atomic formatting, throttled bounded HTTP, transfer semantics, evidence-gated activity rule, long-term purchase-ledger persistence, actual-book quote constraints, conservative simulation calculations and access/CSV/cost guards.   |
| packages/db   | PostgreSQL + Drizzle, six migrations, normalized research/evidence tables and indices, canonical cursors, typed JSON parameters, exact raw response text and hashes.                                                                                                                                        |
| scripts       | Provider smoke check, Flownix diagnostic, original SVG generation, PNG export and root environment loader.                                                                                                                                                                                                  |
| tests / CI    | 46 deterministic/database tests, 4 retained browser journeys, semantic streamed-page readiness, production security smoke script, GitHub Actions with PostgreSQL and mocked providers.                                                                                                                      |
| branding      | Original flow mark, wordmark, horizontal/compact variants, light/dark SVG and PNG, app icons, favicon, Open Graph and GitHub social preview, brand guide and documented tokens. No video assets.                                                                                                            |
| deployment    | Existing Vercel project and custom domain, Node22/apps/web monorepo configuration, private GitHub OAuth, existing Neon pooled/direct connections, six safe migrations, SQL persistence probes, Docker Compose and future persistent worker guidance. No production worker started.                          |

## Actual coverage

- Official current Alpha count: **unverified**, not 0 and not a hardcoded fixture count.
- Local admitted identities: **0**; observed deep tokens: **0**; canonical token tx: **0**; live signals: **0**.
- Implemented event adapters: BSC 56, Ethereum 1, Base 8453. Working live ingestion verified in this environment: **none**. All other official networks receive metadata only when registry access works.
- Long-term UI/data windows: 1/3/7/14/30/60/90/180 days, full collected history and custom ranges. No history is fabricated by selecting a range.
- Transfer rule and persistence/quote/paper calculations function under deterministic tests. Real accumulation remains unavailable without a verified swap and retention ledger.
- Detection proof: synthetic test replay emits 30 deduplicated transfer evidence IDs under the documented rule. This is not a live alert. Actual pipeline proof is the durable failure/retry/heartbeat state and successful in-app test records.
- Three sample tx hashes/explorer URLs: **none verified; not supplied**. JCT/BTW case remains an unresolved reproducible protocol with user claims clearly separated from evidence.

## Commands and final results

See docs/TESTING.md for exact commands and scope. Typecheck, lint, 46 tests, production build and four local browser journeys passed for this repair. First CI-only repair passed hosted GitHub Actions on ed55d4f; final revision result is in the delivery message. Vercel deployed successfully, production HTTPS/browser/API protections passed, and pooled/direct Neon persistence passed. Earlier foundation installation/PNG/export/audit checks remain recorded in TESTING.md; no new crypto-provider or worker acceptance was attempted in this deployment task. No paid enrichment calls occurred.

The browser suite checks the actual database-backed setup/unavailable UI and working journal/in-app notifications. It does not certify real-market populated charts or token/wallet ingestion. Screenshots were captured and inspected; the separate finish review approved this limited foundation scope.

## Configuration, usage and limitations

Required: Node 22, pnpm, PostgreSQL, permitted connectivity to the official Alpha endpoints and a reliable read-only RPC for supported-chain evidence. Public Alpha market routes do not require a trading API key. Optional: GitHub OAuth + exact allowed login for remote access; Telegram bot/chat credentials; provider-specific RPC credentials for reliable archive/log service. No seed, private key or exchange trading key.

Worker must run persistently in WSL, a VPS or a persistent service independently of the web app. **Production collector is not deployed/running.** Vercel hosts web only. Development binds loopback; remote production uses configured OAuth restricted to sopskistar. Secrets remain in ignored owner-only .env.deploy.local and Vercel server configuration. Preview servers created by browser tests are stopped after checks.

Default worker usage is 30 Alpha requests/minute, 15 selected market/deep identities, bounded confirmed block windows and sequential processing. Twelve failed worker Alpha attempts were actually recorded. Current API enrichment cost is zero; hosting/storage costs are separate. Paid enrichment is not implemented and defaults OFF; the guard rejects calls beyond a user budget. No subscription or paid service was created.

Unfinished: live registry/market/tx acceptance; verified DEX swaps and purchase retention; complete holders/supply concentration; independently reviewed entity labels; relationship graph inference; supply-lock/quiet-accumulation/catalyst/distribution/farming engines; historical membership since launch; daily/weekly Telegram reports; calibrated scores and robust negative/control backtests. The UI does not disguise these as completed features. Source terms/geographic eligibility and Telegram remain operator verification requirements. Production allowed-account OAuth is owner-confirmed; a real second-account rejection test remains manual.

## Production authentication and persistence evidence

The owner confirmed actual GitHub sign-in, Radar/Watchlist/navigation, Journal saves, refresh/relogin persistence, logout denial and reauthentication. A read-only Neon query found the note containing “Production verification”, first saved at `2026-11-16T05:21:16.238Z`; production stored tokens/transfers/signals remain zero. No private note text or credentials were logged.

Settings was already consolidated into **Data Health** at `/settings`, headed **Settings & Data Health**. UI/navigation branding is preserved. Automated checks deny private pages, direct APIs, invalid session cookies, spoofed loopback headers and anonymous Journal RSC access. Exact other-login rejection is tested in code; a real second-account OAuth flow is not claimed. Production login screenshots were inspected at desktop/tablet/phone sizes. See AUTH_SETUP.md and DEPLOYMENT.md for configuration, exact tested scope and remaining manual checks.

**Single highest-leverage next improvement:** restore permitted official Alpha access and one reliable EVM RPC, then run the live vertical-slice gate with actual count, exact Alpha pairs, three canonical transfers and a persisted detection/suppression trace. This must precede any claim of useful accumulation intelligence.
# Continuation update — 2026-11-17

This continuation preserves the existing production foundation and Alpha-only scope. It fixes broad ticker selection in code, separates ticker coverage from deep research, adds persisted missing-pair/error states, displays quote-safe registry price fallback, and requires owner-reviewed evidence-backed non-meme classification for the default scanner, deep scan selection, and automatic transfer alerts. These code changes are not yet live data proof until migrations are applied and a worker cycle runs.

The latest prior live registry remains 686 identities (378 online / 308 offline) at 2026-11-17 02:34 UTC, with 1,467 Alpha symbols and 20 observed ticker tokens before this code change. No new registry count, broad market coverage count, Alchemy RPC result, or new accumulation finding is claimed here. Local `.env.worker.local` had no Alchemy URL variables at last inspection. Existing environment names: `ETH_RPC_URL`, `BSC_RPC_URL`, `BASE_RPC_URL`.

Official Alchemy documentation currently states 30M free Compute Units/month, 500 CU/s (25 requests/s), and a free-tier `eth_getLogs` maximum 10-block range for ETH/Base/BNB. This does not make a full multiweek token-wide ledger cheap. Keep a bounded recent scan and measure method usage before any large backfill. DEX Screener and GeckoTerminal remain optional separate price/pool sources; they do not establish Alpha membership or historic wallet ledgers.

Additional documents: [universe audit](ALPHA_UNIVERSE_AUDIT.md), [Alpha123 review](ALPHA123_RESEARCH.md), [Evening Trader case studies](EVENING_TRADER_CASE_STUDIES.md), [detector status](EARLY_ACCUMULATION_DETECTORS.md).
