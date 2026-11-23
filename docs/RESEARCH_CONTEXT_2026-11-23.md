> Current continuation: [operational acceptance](OPERATIONAL_ACCEPTANCE_2026-11-23.md) and [listing/cohort study](FUTURES_LISTING_STUDY_2026-11-23.md). Dated evidence below is preserved; current PAYG estimate is $0.52/M CU.

# Research context implementation and live verification

Started from actual HEAD `b2642e9d7f73b780684b5748980b8a3b66eacc1c`, which already continued `9bfb704fba5cdcb8980a611b6c88c5ccd09b2403`. This extends existing modules, Token Intelligence and Wallet Intelligence. It does not replace the historical research requirements or activate hosting, billing, trading, signing, paid enrichment or social scraping.

## Reused capabilities

Official registry snapshots, exact chain/contract keys, category-independent eligibility including memes, persistent token jobs/cursors, market rotation, partial EVM/Solana ingestion, factory/receipt-verified passive Pancake V3 swaps, time-valid wallet labels, exchange-flow research, 1/3/7/14/30/60/90/180-day wallet research, retention lower bounds, chronological paper scenarios, evidence provenance and Rally Intelligence states already existed. Durable Alchemy/request budgets, provider cooldowns, operational alerts, watchdogs, deployment/rollback files and the host cost investigation were delivered in the preceding milestone. Those implementations are reused.

An existing table was not treated as a working capability: `holder_metrics` and `wallet_relationships` previously had no collector/materializer. Futures project associations, public Futures collection and source-linked structured social/catalyst intake were absent.

## Implemented gaps and limits

| Capability | Implemented behavior | Evidence/dependency limit |
| --- | --- | --- |
| Fair baseline turns | Persist chain turns transactionally; choose the oldest due token within the least recently served available chain. Provider cooldowns remain separate. | Five adapters; no token-category exclusion. A failing or larger BSC backlog cannot permanently crowd out Ethereum/Base/Arbitrum/Solana. |
| Supply observations | EVM `totalSupply` at the actual scan checkpoint; reuse existing Solana mint/largest-account responses. Reorgs invalidate EVM supply/pool materializations. | One extra EVM call, zero extra Solana calls. This is not an owner census. Official registry supply claims are shown separately from chain verification. |
| Top 10/20/50 and changes | Arbitrary-precision calculation only for a unique, synchronized, complete address census reconciling exactly to verified supply. Comparable exact-identity snapshots required for changes. | Percentages stay unavailable for sampled holders, mixed slots and unsupported networks. No inferred circulating supply or beneficial-owner percentage. |
| Operational exclusions | Time-valid, available-at-cutoff reviewed pool/custody/router/burn/vesting/bridge labels; conflicting labels remain contradictory evidence. | Excluded custody does not automatically reduce circulating supply. Unclassified addresses are not independent owners. |
| Wallet graph | Reproducible target-token shared-source edges, verified-buy timing/amount coincidences, repeated pairs across exact Alpha identities; atomic batched materialization and immutable feature snapshots. | `commonOwnership=false`; no transitive owner merging. Native-gas funding, wallet birth, full clusters and cluster-controlled supply remain unavailable. All alternative explanations are retained. |
| Volume quality | Gross buy/sell raw amounts, observed swap net, per-actor short round trips and retained-buying caveats reuse existing swap/retention logic. | Three unrelated one-off actors no longer become one repeated-actor pattern. No inference of farming intent, wash trading, economic profit or actual position increase from turnover. |
| Historical liquidity | Verified V3 pool token balances at explicit blocks, hashes and availability times; saved after existing swap evidence so optional enrichment does not consume the receipt budget first. | V3 balances are not constant-product reserves or executable depth. The separate hypothetical constant-product helper refuses missing/stale/V3 history. No synthetic reserve series. |
| Futures | Reviewed project contract + official named underlying + exact public instrument association; public OI, mark/funding, recent OI history, account ratio and 24h volume. Fixed public endpoints; no trading credentials. | Instrument and token contracts are distinct. Equal tickers cannot bind instruments. Non-Latin symbols supported after a real catalog validation failure. Stale components are withheld; one current sample cannot establish OI/price change. |
| Social/catalysts | Owner-authorized source-linked manual summaries with exact token ID, event type, claimed publication/event times, DB first observation, append-only revisions and independent verification fields. | Manual leads do not become verified posts or historical features. No automatic mention velocity, author-independence claim or guaranteed outcome. |
| Historical pattern foundations | Persist research context with existing accumulation observations; compare candidate features against baseline net returns, non-winners, independent token examples and later periods for 2x/3x/5x/10x/20x/50x/100x outcomes. Purge training outcomes overlapping the test cutoff. | Descriptive helper, not a trained/discovered/validated strategy. Costs and coverage must be complete. No arbitrary confidence percentage, opportunity score or automatic promotion to forward-tested status. |
| Solana interface | Preserve case in Wallet Detective/search, notes, labels and Solscan links; show sampled account balances explicitly. | Partial token accounts are not wallet-wide holdings; historical gaps/retries remain visible. |

Local graph work reads at most 5,000 recent transfer and swap observations and emits at most 1,000 relationship pairs per pass. These are disclosed materialization limits, not candidate-universe limits or an exhaustive graph. The live ledger was below those bounds. Historical/source transactions are retained; only current derived edges can be retired after new operational evidence.

## Real observations

Machine-readable evidence: [RESEARCH_CONTEXT_LIVE_2026-11-23.json](RESEARCH_CONTEXT_LIVE_2026-11-23.json). This records observation times and separates public probes, existing source evidence, new materializations and provider billing uncertainty.

- Official public registry probe at **2026-11-23 04:25 UTC** returned 687 identities, **377 current**. The worker then persisted the full registry at **04:27:56 UTC**; one BSC identity had gone offline since the preceding milestone. Current supported population is **356**: BSC 287, Ethereum 19, Base 26, Arbitrum 2, Solana 22. Another **21** current identities remain registry-visible without native adapters: Sonic 4, Robinhood Chain 5, TRON 3, Sui 9.
- The production ledger contains **318 canonical transfers, 18 swap interpretations and 1,595 Solana balance observations**. These are measured existing observations, not newly discovered buys this session.
- A real local-ledger pass saved **162 shared-token-source edges**, including **7 pairs recurring across multiple Alpha identities**. Zero ownership claims. Coincidence, allocations, unlabelled services and independent customers remain possible. These edges were derived from existing transactions, not new blockchain events.
- A bounded BSC VRTon scan committed a real checkpoint supply at block **134603932**, raw total **6285147660185239284478**. Zero holder balances at that checkpoint means no top-holder percentage. The source block was historical/lagging, so this is not a current supply census or a near-head acceptance pass. No new market signal was produced.
- The current public Futures catalog returned **956 instruments** and no token-contract-address field. PIEVERSE's [project white paper](https://www.pieverse.io/MiCAR-White-paper-Pieverse.pdf), PDF page 20/D.9, names its exact Ethereum and BSC contracts. The [official Binance announcement](https://www.binance.com/en/support/announcement/detail/9601f5b2dd9e4f33bf7361fa61368191) independently names Pieverse as the PIEVERSEUSDT underlying. The reviewed [association proof](evidence/PIEVERSE_FUTURES_ASSOCIATION.json) binds only BSC `0x0e63b9c287e32a05e6b9ab8ee8df88a2760225a9`. Its metadata hash covers actual nonempty exchangeInfo bytes; no byte hash is asserted for an empty HTML response.
- The actual public collector saved **one PIEVERSEUSDT observation** at **04:37:37 UTC**, with provider time **04:37:21 UTC**, OI **12,850,475**, funding fraction **0.00011378**, recent account ratio/history and volume, with five source hashes. The funding fraction is not a forecast. One current sample does not establish a local trend, long dominance or liquidation causality.
- Native Neon connections initially timed out; HTTPS SQL reads and later native graph/registry/scan/Futures writes succeeded. The bounded worker was stopped gracefully, interrupted work retained retry/checkpoint state, and the final SQL read confirmed **zero collector locks**. No continuous worker remains active. A full-cycle hosted soak is still required.

## Data access investigation

[Binance's public USD-M market-data documentation](https://developers.binance.com/en/docs/catalog/core-trading-derivatives-trading-usd-s-m-futures/api/rest-api/market-data) is the source for instrument metadata, OI, funding, recent OI statistics and account ratios. Endpoint weights, funding/history limits and availability can differ; they are not unlimited historical archives. Collection uses a separate **5,000-request/day local ceiling**, normal provider pacing and 403/429 cooldowns; HTTP 451 pauses the provider for a day without geographic bypass. A batch checks two due exact associations, oldest first, every 30 minutes. With one association this is about **288 public requests/day**; 96 token observations/day is the current batch scheduling ceiling as associations grow. That cadence must be revisited before expanding associations; it is not a permanent two-token universe. Public feed access is verified for this environment, not guaranteed for a future host/region.

The [Bitquery farming investigation](https://bitquery.io/investigations/binance-alpha-points-farming) motivates comparing retained net buying against rapid turnover. Its account-level intent conclusions are not imported into Flownix. Alpha Points rules and thresholds change; no undated threshold is hardcoded as proof of farming. Historical threshold research needs dated official rules and comparable complete transaction history.

[X's pricing](https://docs.x.com/x-api/getting-started/pricing) is pay-per-use; credits, permitted endpoints, caps and actual unit quotes need the developer console. [X terms](https://x.com/en/tos) and [developer policy](https://docs.x.com/developer-terms/policy) constrain scraping, retention and redistribution. No free X API, proxy scraper or third-party mirror was activated. Manual intake stores an operator summary and original HTTPS link, not copied subscription content. Automated attention/spam/promotion baselines need licensed, completeness-aware collection and exact project/contract resolution. Public distinct authors are not necessarily independent people.

[Telegram Bot API](https://core.telegram.org/bots/api) access depends on the bot's authorized chats/channel permissions; it is not unrestricted public/private group history. Historical channel access, membership permissions and redistribution need separate review. [Bitquery pricing](https://bitquery.io/pricing) and [Arkham enterprise/API access](https://arkm.com/) require plan/license review for archived holders, ownership labels, graphs and redistribution. No available token was treated as permission to activate paid usage.

| Requested account lead | Verification result used in this release |
| --- | --- |
| `@eveningtraders` | Remains a lead. Previous case-research files preserved; no newly verified timestamped post imported. |
| `@JuliusElum` | Mirrors surfaced relevant Alpha claims, but no first-party post/contract/timestamp verification sufficient for strategy evidence. No profitability or supply-control claim imported. |
| `@bsc_daily`, `@TraderGPFX`, `@Ryker_BTC` | Remain unverified leads; no automatic observations or claimed profitable track records. |
| `@BinanceWallet` | An [officially verified Binance Square publisher](https://www.binance.com/en/square/post/337923443790081) cross-links that X handle. Specific token posts still need timestamps and exact identity review. |
| `@BinanceResearch` | [Official Binance launch announcement](https://www.binance.com/en/support/announcement/detail/360018941712) identifies the account; the [official current publisher](https://www.binance.com/en/square/profile/binance_research) also links it. No social alpha claim imported. |
| `@ArkhamIntel` | Provider identity is a research lead; no newly verified relevant Alpha post/timestamp imported from an official first-party account in this run. |
| `@Bitquery` | Requested spelling is not silently verified: [Bitquery's own footer](https://bitquery.io/) links **`@Bitquery_io`**. No account substitution or post import was performed. |

## Costs and worker activation

Updated [WORKER_COST_MODEL.json](WORKER_COST_MODEL.json) uses **202 estimated CU per ordinary EVM scan**, including the new 26-CU checkpoint call, and 1,870 per upper ordinary Solana sample. For 334 EVM + 22 Solana identities every six hours: **13,032,960 CU/30 days**, leaving **16,967,040** below the published 30M Free allowance and **13,967,040** below the 27M application cap, before event blocks, retries, receipts, extra wallet balances and other applications. The ledger's measured November reservation is **3,518 CU**, including **318** from the new bounded run. This is not account-wide billing or pre-ledger usage.

The new graph adds no external calls; two optional pool balances plus a block add roughly 72 CU per eligible pool window. Futures uses public Binance requests, not Alchemy. SQL statements and graph work do not directly translate into Neon CU-hours. Account dashboards are still required to reconcile remaining allowances and untracked CU usage.

At the final evidence read, Neon database size was about **140.4 MB** (physical PostgreSQL size), approximately 0.86 GB below a nominal 1 GB allowance; provider quota accounting/history can differ. Continuous activity at an assumed 0.25 CU still requires **180 CU-hours/30 days**, exceeding 100 free CU-hours by 80. Slower chain scans do not let a continuously querying worker scale to zero.

The [existing deployment instructions](WORKER_READINESS_2026-11-22.md) remain applicable, with the new cost model taking precedence over their old 176-CU arithmetic. Recommend the prepared Render Starter worker for its predictable **$7/month** compute envelope, versus approximately **$5/month minimum** on Railway at measured usage. Previous measured Node RSS (~158 MiB mean, ~185 MiB peak) and CPU (~5.7% of one core) fit Starter's 512 MB/0.5 CPU provisionally; the new graph/retention workload still needs a hosted soak. Budget approximately **$28–$32/month total initially**, including capacity for the existing Neon project and Alchemy Free, excluding tax/existing account subscriptions. No hosting, API plan or billing change was made.

Exact next owner action: confirm current Neon plan/compute allowance and account-wide Alchemy usage, then approve the prepared Render Starter worker **and existing-Neon capacity together**. Run preflight and a bounded full supported-universe/market rotation before enabling 24/7 operation. If Neon is already paid, reconcile that plan rather than creating another project. All 377 current registry identities remain visible; 356 have baseline adapters. Actual near-head, uninterrupted all-chain monitoring is not operational yet.

## Verification, commands and rollback

Migration `0015_research_context.sql` is additive and was applied to existing Neon. Local full suite: **128 passing tests** on supported Node 22; typecheck/lint pass. The 15 tests added since the 113-test preceding milestone cover exact contracts, common funding versus ownership, operational exclusions, inadequate holder coverage, source/label leakage, Unicode Futures metadata, stale social/derivatives data, gross turnover false positives, missing historical liquidity, unsupported networks, durable chain fairness, quota boundaries, and atomic graph retirement. Six authenticated local browser journeys passed, including manual intake/revision persistence and desktop/phone screenshots. The local-only fixture is removed afterward; it was never inserted into Neon. Existing production owner access was not available, so no owner production session was fabricated.

The final suite detected that the interrupted package-manager bootstrap had overwritten the locally installed declared Postgres lifecycle patch. The repository patch was reapplied to that local installation and the complete Node 22 suite rerun successfully. No dependency version/lockfile change was introduced; CI's frozen install applies the declared patch. Browser startup now invokes the installed Next launcher directly, avoiding an automatic package-manager install during tests.

Useful existing-infrastructure commands, using owner-only ignored environment files:

```sh
npm run db:migrate:production
npm run worker:preflight
npm run research:context
npm run research:futures-associate -- docs/evidence/PIEVERSE_FUTURES_ASSOCIATION.json
# Only after independently reviewing source evidence; this writes a research association, no trading action:
npm run research:futures-associate -- docs/evidence/PIEVERSE_FUTURES_ASSOCIATION.json --apply-reviewed-evidence
npm run research:derivatives
npm run worker:status
```

These one-shot research commands take the existing collector lock. Do not run them concurrently with another collector. No web request launches an arbitrary URL fetch or unbounded wallet scan. Source-linked intake is authenticated and origin-protected.

Rollback: stop the new collector, restore the preceding immutable `b2642e9...` worker/web release, verify one lock and preserved cursors, and retain the additive tables, source evidence and request ledger. The preceding release tolerates the additive schema. Never drop history, clear quotas or refund uncertain reservations. The prepared Render/Docker/systemd configurations remain unactivated; preflight now requires migration 0015. Hosted activation still requires owner approval.

## Mandatory continuation

The entire Historical Strategy Research Addendum, original historical case documents and all prior requirements remain intact. Historical winner/non-winner research, automatic pattern discovery, point-in-time backtesting, fees/spread/slippage/drawdown evaluation, unseen-period validation, forward paper trading and Rally Intelligence remain mandatory. Full holder/beneficial-owner censuses, native funding graphs, comprehensive 1/7/14/30-day cluster retention, vesting/unlock/airdrop-recipient studies, full liquidity depth and removal history, independently verified exchange/team labels, remaining chain adapters and licensed automatic social feeds remain incomplete dependencies—not discarded requirements. Wider markets, wallets and derivatives explain Alpha behavior without expanding the candidate-token universe. All trading decisions remain with the owner.
