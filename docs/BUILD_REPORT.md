# Delivery report

Status: implemented, tested private research **foundation**. **Live v1 acceptance is not complete.** Runtime access to official Alpha endpoints and working token-specific RPC evidence was unavailable. Git commit and push identifiers are reported in the delivery message and `git log -1`.

## Implemented modules

| Path          | Delivered functionality                                                                                                                                                                                                                                                                                     |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| apps/web      | Protected Next App Router Radar, long-term Watchlist, token investigation/ranges/evidence timeline, Wallet Detective, sourced labels, Alerts, Journal, candidate Runner Lab, observed-book paper ledger, provider health/settings, CSV, privacy, noindex metadata and custom 404.                           |
| apps/worker   | Durable scheduled collection, retries/leases/single-worker lock, heartbeats, full official registry reconciliation, selected exact Alpha pairs/candle backfill/depth, confirmed EVM log and sampled balance adapters, transfer detections, coverage records, forward outcomes and optional Telegram outbox. |
| packages/core | Validated provider contracts, chain/contract identities, decimal-safe atomic formatting, throttled bounded HTTP, transfer semantics, evidence-gated activity rule, long-term purchase-ledger persistence, actual-book quote constraints, conservative simulation calculations and access/CSV/cost guards.   |
| packages/db   | PostgreSQL + Drizzle, six migrations, normalized research/evidence tables and indices, canonical cursors, typed JSON parameters, exact raw response text and hashes.                                                                                                                                        |
| scripts       | Provider smoke check, Flownix diagnostic, original SVG generation, PNG export and root environment loader.                                                                                                                                                                                                  |
| tests / CI    | 33 deterministic/database tests, 4 browser journeys, dated clearly marked documentation/synthetic fixtures, GitHub Actions with PostgreSQL and mocked providers.                                                                                                                                            |
| branding      | Original flow mark, wordmark, horizontal/compact variants, light/dark SVG and PNG, app icons, favicon, Open Graph and GitHub social preview, brand guide and documented tokens. No video assets.                                                                                                            |
| deployment    | Docker Compose local Postgres, persistent worker Dockerfile, Neon/pooler versus direct-connection guidance, private OAuth deployment requirements. No remote deployment created.                                                                                                                            |

## Actual coverage

- Official current Alpha count: **unverified**, not 0 and not a hardcoded fixture count.
- Local admitted identities: **0**; observed deep tokens: **0**; canonical token tx: **0**; live signals: **0**.
- Implemented event adapters: BSC 56, Ethereum 1, Base 8453. Working live ingestion verified in this environment: **none**. All other official networks receive metadata only when registry access works.
- Long-term UI/data windows: 1/3/7/14/30/60/90/180 days, full collected history and custom ranges. No history is fabricated by selecting a range.
- Transfer rule and persistence/quote/paper calculations function under deterministic tests. Real accumulation remains unavailable without a verified swap and retention ledger.
- Detection proof: synthetic test replay emits 30 deduplicated transfer evidence IDs under the documented rule. This is not a live alert. Actual pipeline proof is the durable failure/retry/heartbeat state and successful in-app test records.
- Three sample tx hashes/explorer URLs: **none verified; not supplied**. JCT/BTW case remains an unresolved reproducible protocol with user claims clearly separated from evidence.

## Commands and final results

See docs/TESTING.md for exact commands and scope. Installation/supply-chain verification, Docker/Postgres startup, six migrations, typecheck, lint, 33 tests, production build, 4 browser tests, PNG export and production audit passed. Provider smoke, application diagnostic and worker live collection fail honestly while the endpoints are unavailable. Final production audit reports zero advisories; no paid enrichment calls occurred.

The browser suite checks the actual database-backed setup/unavailable UI and working journal/in-app notifications. It does not certify real-market populated charts or token/wallet ingestion. Screenshots were captured and inspected; the separate finish review approved this limited foundation scope.

## Configuration, usage and limitations

Required: Node 22, pnpm, PostgreSQL, permitted connectivity to the official Alpha endpoints and a reliable read-only RPC for supported-chain evidence. Public Alpha market routes do not require a trading API key. Optional: GitHub OAuth + exact allowed login for remote access; Telegram bot/chat credentials; provider-specific RPC credentials for reliable archive/log service. No seed, private key or exchange trading key.

Worker must run persistently in WSL, a VPS or a persistent service independently of the web app. Vercel may host web only. Development binds loopback; remote production access fails closed until OAuth is configured. Secrets remain in ignored .env/server configuration. Local Postgres is running; preview servers created by browser tests are stopped after checks.

Default worker usage is 30 Alpha requests/minute, 15 selected market/deep identities, bounded confirmed block windows and sequential processing. Twelve failed worker Alpha attempts were actually recorded. Current API enrichment cost is zero; hosting/storage costs are separate. Paid enrichment is not implemented and defaults OFF; the guard rejects calls beyond a user budget. No subscription or paid service was created.

Unfinished: live registry/market/tx acceptance; verified DEX swaps and purchase retention; complete holders/supply concentration; independently reviewed entity labels; relationship graph inference; supply-lock/quiet-accumulation/catalyst/distribution/farming engines; historical membership since launch; daily/weekly Telegram reports; calibrated scores and robust negative/control backtests. The UI does not disguise these as completed features. Source terms/geographic eligibility and production OAuth/Telegram remain operator verification requirements.

**Single highest-leverage next improvement:** restore permitted official Alpha access and one reliable EVM RPC, then run the live vertical-slice gate with actual count, exact Alpha pairs, three canonical transfers and a persisted detection/suppression trace. This must precede any claim of useful accumulation intelligence.
