# Final market, research and Telegram integration

Bounded hosted read at **2026-11-26 19:39:09 UTC**. Exact snapshots, raw Alpha bytes, hashes, per-job counts and cost ledgers: [evidence](evidence/FINAL_INTEGRATION_2026_11_26.json). The live registry was independently rechecked afterward and still maps EVAA to the same identity. No hosted collector was started or redeployed; no genuine Telegram notification was enabled or sent.

## EVAA: an old valid observation, not a synchronized live price

- Official identity: BNB Chain `56`, contract `0xaa036928c9c0df07d525b55ea8ee690bb5a628c1`, `ALPHA_409`. Exact pair `ALPHA_409USDT`; USDC is a separate supported quote, and `ALPHA_409U` was delisted. No symbol collision or contract mismatch was found.
- Stored snapshot `37639`: **2.77172380 USDT**, provider close **15:55:31.939 UTC**, local collection **15:55:33.424 UTC**. Its exact retained provider bytes hash to `54d46f0d76d0c590362f66d7f066449eb5f249338e87b67a4761c93330693769`, matching both snapshot and raw response.
- Official Alpha's timestamp-matched 15:55 UTC one-minute candle spans **2.76280000–2.77575374 USDT**. The stored last price is consistent with that interval; the candle does not independently prove the exact second's trade.
- A later official ticker returned **2.32788488 USDT** with a different provider timestamp. The supplied CoinGecko observation lacks a synchronized timestamp/source instrument, so it was not used to rewrite Alpha history.
- No newer stored market ticker was hidden. A newer **16:03:46 UTC registry metadata** value, about **2.7169**, does exist, but its quote/provider time are unspecified. The query deliberately prefers explicit Alpha market quotes over that separate metadata series. Neither is presented as an exchange-wide USD truth.

The path is official ticker URL → schema/exact-symbol check → raw `source_responses` plus `market_snapshots` → latest valid `alpha_market` row → Radar price/quote/change. Schema validation now rejects missing, zero and malformed ticker prices. Provider and collection times remain separate; missing/future market provider times cannot look fresh. Failed refreshes preserve previous evidence.

## Practical freshness within the existing budget

The 25-minute/12-hour duty schedule is unchanged. Even with perfect rotation, sleep is about **11h35m**; partial rotations, cooldowns or missed windows can leave a quote **older than 12 hours, potentially multiple cycles**. There is no guaranteed maximum age or near-real-time feed.

An owner-authenticated, same-origin **Refresh official quote** action on Token Intelligence requests one exact official ticker, using registry/pair verification no older than 12 hours. It has a five-minute cache, persisted per-token cooldown, one-minute global reservation, **6 attempts/day and 24/month**, one HTTP attempt, existing provider cooldowns/durable request budgets, and retained raw provenance. It performs no RPC, depth, history or research scan. Reservations serialize across Vercel instances and survive failures. No public polling, timer, cron, loop or paid service was added. A fresh cached quote makes no provider call. The owner action may wake/extend Neon; it is not represented as free compute. At 2 CU and a separate five-minute suspension tail plus 15-second request, 24 isolated requests model up to about 4.2 extra CU-hours/month, excluding unrelated page traffic and account usage. This is a conservative model, not a provider meter.

Radar keeps numeric price, actual quote asset and 24h change, removes repeated price-cell “Alpha ticker” wording, and retains Binance provenance in tooltips/details. Observation separates market age/UTC time, partial on-chain sample time, unsupported adapter and scheduled sleep. Refresh failures/no-pair status remain visible. Data Health now reads near-head checkpoints as well as preserved historical cursors, and includes Solana balance sampling; old historical cursor timestamps no longer stand in for latest network sampling. Sonic and Robinhood are recognized as supported adapters.

## Why research looked empty

The hosted database actually held **360 canonical transfers, 18 canonical swap records, 36 EVM balance snapshots, 2,132 Solana observations, 175 relationship edges and 448 accumulation research rows**. Persistence ran on seven scoped identities in the second window; it was not absent from the duty profile.

The old Radar query did not expose those facts and used “Insufficient accumulation evidence” whenever there was no active signal. Its “0 selected” counter counted `deep_selected` (manual prioritization), not the research already performed. There were also **zero active automatic investigations**: automatic intake previously depended on emitting a market-freshness-gated signal. Stored suppression traces: **273** fresh-market/liquidity gates, **54** insufficient-baseline gates, **18** incomplete/stale scans.

Radar now links to factual evidence and identifies swap records, transfers, balance snapshots and partial Solana observations without inventing a signal. Token Intelligence exposes a bounded evidence ledger with event time, first local availability, source transaction and explicit limitations. Manual prioritization and automatic investigations have separate counts. New thesis evaluations persist specific suppression reasons. Completed equal-block transfer anomalies can enter the existing investigation queue even when market freshness suppresses an alert; existing enrichment and Alchemy guards still apply. Every supported Alpha identity remains eligible for baseline scheduling; no manual Save is required for automatic anomaly intake.

No validation threshold was relaxed. All 448 stored thesis rows cite insufficient long-term verified buying, retention, price context or coverage. Ten-block samples, sparse factory-verified swap records, sampled Solana accounts, relationship heuristics and exchange-labelled movements do not establish a complete purchase ledger, beneficial ownership, independent accumulators or multiweek retained purchase lots. Missing historical windows, attributed purchases across days and reconciled retention remain real limitations. Historical Runner/Strategy Labs, negative controls, futures/listing research and other intelligence remain intact. Futures HTTP 451 remains a cooldown/access restriction, without circumvention.

## Hosted duty acceptance and costs

| Measured fact | First window | Second window |
|---|---:|---:|
| Unique Alpha identities with ticker snapshots | 296 | 153 |
| Completed scan jobs / unique identities in that window | 54 / 54 | 19 / 19 |
| BSC unique completed scans | 13 | 3 |
| Other chains represented | 6 | 6 |
| Maximum sampled child RSS | about 150.5 MB | about 128.4 MB |

The second recorded duty window ended **16:03:58 UTC**, exit **0**, with durable `idle`; nextAt was **27 November 03:55:01.913 UTC**. The read found **zero collector locks**, no currently active provider blocks except the established Futures restriction, and **two expired legacy leases**. The existing claim query can recover eligible expired leases; expiry itself is not scan completion. The shorter second window is not proof of using the full 25-minute allowance; the historical supervisor stop reason/restart events require Render logs and were not accessible through the available authenticated interface.

BSC has **288 current identities but only 20 recent-scan checkpoint identities**; Ethereum 16/19, Base 16/26, Sonic 4/4, Arbitrum 2/2, Robinhood 5/5. Solana observations use a different sampling ledger and must not be counted as zero merely because they lack EVM checkpoints. Chain-turn fairness works, but equal turns do not give large BSC a six-hour whole-universe SLA. A six-hour requested interval cannot be maintained through twelve-hour duty gaps. Baseline backlog convergence is **not proven**, and complete historical catch-up is not implied. Oldest BSC/Ethereum/Base samples still date to 23 November.

The **04:10 UTC zero-observation market job** checked **25 no-pair identities**, made one Alpha exchange-info request and wrote zero tickers. It was not a ticker outage. The neighboring 04:09 job wrote 3 tickers and recorded 22 no-pair checks. Interrupted terminal batches still persisted 8 and 3 real tickers in the first/second windows. Future completed market jobs now retain requested/observed/no-pair/failure/remaining counts plus a categorized outcome in durable job measurements.

Measured PostgreSQL database size: **251,305,984 bytes**. App-tracked estimated Alchemy usage: **25,760 CU on 26 November**, **36,334 tracked month-to-date**; the second-window increment was about **5,946 CU**. The separate configured 110,000-CU untracked reserve remains. Duty ledger reserved **2 modeled CU-hours**, not 2 metered CU-hours; the existing maximum worker model remains 62 CU-hours/31 days with a 70-CU-hour guard. Provider dashboards are required for account-wide Alchemy billing, Neon compute/suspension and Render container memory/restarts. Sampled RSS excludes the supervisor/loader/container overhead. Sleeping does not make a continuously provisioned Render Starter worker cost less than its existing fixed instance price. No billing, infrastructure or cadence was changed.

## Telegram release boundary

The existing `notification_deliveries` engine now supports an explicit exact-row application test while `TELEGRAM_ENABLED=false`. It checks bot/private-target metadata, binds the test to that configured destination, preserves one UUID across retries, atomically claims before sending, and stores a sanitized Telegram receipt. There is no automatic startup test or backlog drain. Ambiguous sends become `uncertain` and are never automatically replayed; interrupted `sending` rows also require reconciliation. Tests prove application isolation using mocked Telegram responses and rolled-back PostgreSQL fixtures; **no actual application message has yet been sent from the saved Render credentials**.

Real messages now separate source event time, first local availability and finding detection, include exact identity, primary links, research stage/confidence, observed coverage, alternatives/limitations and Flownix details. Stored wallet-label confidence is included only when the label was valid for the event and already known at detection; later labels are excluded, and label claims do not become proof of ownership. High-confidence findings and optional lower-priority limited/provisional digests are distinct. Digests default off. Both queueing and sending require an explicit activation watermark; pre-activation or older-than-15-minute findings cannot be released as fresh notifications. All genuine sends remain disabled.

The single operator procedure is [manual Render release and one-message acceptance](CONTROLLED_RENDER_TELEGRAM_RELEASE.md). It covers SHA verification, sleeping health, exactly one test command, receipt SQL, uncertainty handling and separately approved genuine-alert activation. No migration is required.

## Release verification

The integration passed [hosted verification](https://github.com/sopskistar/Flownix/actions/runs/45946475288): 190 tests with PostgreSQL integration, typecheck, lint, production build and 12 browser journeys. Screenshots were inspected at desktop, tablet and phone widths. Screenshot review also identified a tablet issue: collapsing the Observation column hid price staleness. The final release retains a compact age/status label below tablet quotes and a browser regression asserting its visibility. Final CI retains only the three synthetic integration screenshots for three days so the exact release's rendered result can be reviewed. The local machine's exhausted swap caused earlier browser timeouts; those runs were not counted as passes.
