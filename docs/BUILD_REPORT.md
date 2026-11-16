# Delivery report

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
