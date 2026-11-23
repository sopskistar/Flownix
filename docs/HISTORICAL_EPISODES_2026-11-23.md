# Historical episodes and failure research — 23 November 2026

This milestone extends the existing Historical Runner Lab, immutable `event_study_runs`, `research_case_candidates`, `research_feature_snapshots`, `research_leads`, membership snapshots and price store. It creates no parallel engine, database or migration. Historical Strategy Research, Strategy Lab, wallet/cluster evidence, Futures studies, forward paper trading, Rally Intelligence and universal baseline monitoring remain mandatory and intact.

## Reproduce within the existing budget

```sh
# Replay saved evidence; no provider requests:
npm run research:episodes
# One bounded, resumable collection batch, then replay:
npm run research:episodes -- --collect
# Collect only the short windows of controls selected in a saved run:
npm run research:episodes -- --collect-controls
```

These commands use the existing ignored `.env.worker.local`, the existing Neon database and collector advisory lock. Never run them against a different endpoint. They do not activate hosting, paid data, notifications or trading. Public Binance responses are saved with hashes; no Alchemy calls are needed for candle research. Use the prepared worker deployment instructions separately for continuous collection.

`HISTORICAL_COHORT_V1.json` fixes the observation window, control anchor, outcome end and hypotheses before analysis. Default collection is 12 identities × at most eight 1,500-hour pages, bounded to 100 physical provider dispatches per process and a 30-minute deadline. Existing durable provider quotas remain in force. Batch/page variables reject out-of-range inputs. The storage preflight stops above 600 MiB and page collection stops above 675 MiB; this is deliberately a bounded sample, not permission for a universe-wide backfill. Review actual account capacity before further batches. Requests that fail still consume their budget.

Collection rotates by oldest attempt, with unattempted identities first. The requested leads only break initial ties. Current and archived identities are retained, there is no permanent ticker list or BSC-only research limit, and baseline scheduler reconciliation still includes all supported eligible tokens. A batch limit is a resumable execution bound, not a permanent coverage cap. An absent active pair, pre-launch/empty response or schema failure is recorded; no missing bar is synthesized. Historical price availability and supported blockchain coverage are distinct.

The replay processes full series one identity at a time. Only the fixed control window is cached across identities. Immutable reports include elapsed time, process peak RSS, request/response counters and measured database size. Account-wide Neon CU-hours cannot be derived from SQL query counts; account-wide Alchemy usage is not the application's tracked ledger.

## Exact identity and admission

All ten supplied BSC contracts matched existing official registry identities: AKE, LAB, BTW, PIEVERSE, EVAA, ARIA, BLESS, Q, AGT and IDOL. This verifies collected registry identity, not historical membership at every candle. ARIA is currently offline and remains in historical analysis. NES has two offline official BSC records (`ALPHA_994` and `ALPHA_1156`); their migration relationship is unresolved. Neither was chosen by ticker or inserted manually.

The episode engine rejects mismatched chain/contract token keys, invalid EVM contracts and incompatible exact Alpha ID/quote pairs. It uses only saved `ALPHA_nUSDT` or `ALPHA_nUSDC` hourly bars. This does not prove continuous historical contract/representation mapping. Bridged representation and original issuance must not be double-counted. Registry Alpha IDs provide an initial grouping bound, not verified independent ownership or a complete cross-representation project ontology.

Historical membership is either an existing reviewed official known-by bound (AKE, ORDER and PIEVERSE) or the first actual local snapshot showing current membership. Current registry `listingTime` is not backdated proof. Earlier episodes remain visible as `unproven_before_membership_bound`, rather than disappearing from the sample or acquiring invented eligibility.

PIEVERSE's Alpha admission on 14 November 2025 at 11:00 UTC and Futures start at 11:30 UTC remain separate from its later November 2026 rally. The prior reviewed listing-study manifest and announcement source are preserved.

[Binance's BLESS notice](https://www.binance.com/en/support/announcement/detail/0927ee2f460a4041a5e6a871a4ad9d4b) was published 21 September 2025 and scheduled Alpha for 23 September at 09:00 UTC, Futures at 09:30. The [project whitepaper](https://bless.network/mica/whitepaper.pdf) describes native Solana issuance. Neither source alone establishes when the current BSC representation became eligible or a new exact BSC Futures association. No such association was invented.

## Standardized episode definitions

The `historical-episodes/1` specification is included in every run:

- Observed-window extrema: dated low and high, ordering, hourly coverage and gaps. The high/low ratio is explicitly unordered context. A low occurring after the high cannot be presented as a rally return. Lifetime ATL/ATH remains unverified.
- Launch-to-peak: unavailable without an independently established exact launch time and corresponding first candle. First stored history is not automatically called launch.
- Rolling 7-day and 30-day low: the first closed hourly price at least 2× the lowest price in the preceding complete window. The confirmation candle does not supply its own low. Re-arm below 1.5×; enforce seven-day spacing within each rule. This is a descriptive condition, not an early-accumulation prediction.
- Consolidation breakout: preceding seven-day high/low range at most 1.15×, followed by a close at least 1.05× the previous high. Future data cannot choose the confirmation.
- Forward outcomes: fixed 1/3/7/14/30/60/90-day close returns and adverse excursions measured from the confirmation close, never a selected historical low. Missing grid bars censor the outcome. The next seven-day peak, dated source hashes, sample-close drawdown and prior-bar-peak/low drawdown are separate fields. Intrabar high/low ordering remains unknown.

Quality checks reuse the listing-study candle sanitizer, then require hour-aligned complete-duration candles. Conflicting duplicates, bad prices and observations unavailable by replay time are handled by the existing sanitizer. No prices from another quote or ticker are spliced into a gap. Every outcome contains its own source hashes and first-local-availability bound.

A token can have multiple episodes. Overlapping definitions at one confirmation and repeated episodes of a project are explicitly counted separately from independent projects. Subsequent fixed horizons and close paths support later distribution/recovery investigation; price declines do not prove wallet distribution. No episode creates a `signal_event`, live alert, paper entry or validated strategy.

## Features before the move

Each episode audits 90/60/30/14/7/3/1-day pre-confirmation cutoffs against the existing transfer, verified swap, balance, graph, holder, pool, accumulation, entity-flow, derivatives and funding evidence. It distinguishes event time from first local availability, canonical from reorged evidence, and knowable, retrospective and unknown availability. Unknown availability is not zero or a backdated timestamp. Entity-flow windows lacking an ingestion timestamp are explicitly unknown.

The register includes bounded reference examples plus truncation flags. Large evidence samples are capped at 20,000 records and labelled truncated; counts cannot establish complete chain history, ownership, net retained acquisition or multiweek accumulation. Existing confidence and custody safeguards remain authoritative. Backfilled candles alone are not a historically knowable multi-feature signal.

## Controls, failures and validation gates

The November 17, 2026 00:00 UTC risk set is reconstructed only from membership and liquidity/quote observations available by that anchor. It includes candidates without price outcomes. Matching uses the same anchor/chain/quote/chain-coverage category, an **observation-age** bucket and liquidity within 0.5–2×, ordered by closest absolute liquidity, then age and exact identity. Original token age is not fully proven; local observation age is not relabelled token age. The common anchor controls broad market timing, but individual beta/market-regime matching remains incomplete.

Selection cannot access future returns. Three PIEVERSE controls were saved before collecting their outcome windows: DGAI (`ALPHA_1185`), O (`ALPHA_991`) and AIOT (`ALPHA_158`). November 17–23 raw close returns were +42.632577%, +11.545362% and −26.669727%. All remained below a 2× high in this window. Positive controls are retained; no outcome filter was used to manufacture losers. Other requested cases lack adequate as-of liquidity or comparable risk-set records and remain suppressed/censored. These recent controls are not falsely represented as matched controls for earlier 2025/2026 rally episodes.

All available exact series are additionally ranked on the same fixed baseline/end, retaining missing or unproven-membership outcomes as unavailable. Peak 2× and close 2× are separate. Raw price returns exclude fees, spread, depth, slippage and position size. No executable profitability is claimed.

The existing pattern comparator now supports an explicit embargo and purges train examples whose token/project group appears in the later test set. Outcome availability must precede the embargoed cutoff. The episode experiment declares 21 rule/horizon comparisons and reports that multiplicity correction is not applied. It cannot promote a model or strategy on that basis. No admissible pre-move feature cohort with verified costs has been established, so the historical validation input remains empty and validated/forward-tested strategies remain zero. Descriptive continuation failures and censored outcomes are retained as useful negative evidence.

## LAB forensic evidence and corrections

[The Block's May 14 report](https://www.theblock.co/news/ecosystems/2026-05-14-zachxbt-alleges-95-insider-control-of-lab-token-in-investigation-into-ai-terminals-6-billion-fdv-project-401290) links the [original ZachXBT thread](https://x.com/zachxbt/status/2054898749923860819). Direct X retrieval returned 403. [Odaily syndicated on Bitget News](https://www.bitget.com/news/detail/12560605412219) repeats approximately 226M deposits and 100M withdrawals, but provides no full transaction-hash reconciliation. Publication review is not independent confirmation of those quantities, exchange ownership or a greater-than-95% owner census. The syndication's displayed timestamp has no independently verified timezone; an earlier imported UTC interpretation is preserved and corrected by an appended revision, not overwritten.

A third-party mirror surfaced a later 196M transfer claim with a different apparent scope. It was not the original investigation and supplied no independently verified hash ledger. It is not used to reconcile the 226M claim, create wallet labels or infer beneficial ownership. Full original sources, transaction hashes, address-label provenance and label-publication times are still required. Exchange custody, customer deposits, routing and market making remain plausible alternatives.

The [official November 2025 LAB buying competition](https://www.binance.com/en-AE/support/announcement/detail/21fab8e9db5f4dd8a1446e1a3eb6ceb1) provides a genuine campaign lead: buys counted, sells did not. That incentive is not proof of retained buying. Its earlier project activity also conflicts with the current registry's March 2026 listing metadata; the representation chronology remains unresolved.

Source URLs, publisher, claimed publication/event timestamps, first local observation, verification status and revision links reuse `research_leads`. Original `published_at` stays unset where it is not independently established in stored evidence. Supplied Grok prices remain immutable unverified claim snapshots, never predictive labels. The original supplied numbers are not substituted into the candle pipeline.

## Interface and release acceptance

The existing authenticated Runner Lab now shows episode baselines, dated observed extrema, exact token links, coverage, historical eligibility, retrospective availability, controls and source corrections. A scoped authenticated export downloads the exact immutable run without reloading 100 historical reports. The default export and all existing listing studies remain available. No other page is redesigned. Browser verification also exposed a shared-form pre-hydration native GET submission. Mutation forms now use POST and keep the fieldset disabled until hydration; no-JavaScript checks verify that research inputs cannot submit into a query string.

Verification and final measured counts/costs are retained in `docs/evidence/HISTORICAL_EPISODES_ACCEPTANCE_2026-11-23.json`. Tests cover identity/pair collisions, first-closed confirmation invariance, same-bar ordering, missing history, membership/availability leakage, repeat episodes, pre-outcome controls, group/embargo purging and PostgreSQL JSON/annotation immutability. Authenticated local desktop/tablet/phone checks use isolated local fixtures, explicitly not production observations. Real owner-authenticated production access remains a separate manual check.

## Outstanding collection and research work

Full-universe price history, original admission/representation chronology, pre-rally wallet retention, historical holder censuses, exchange-label history, historical depth/books, costs and exact old catalysts remain incomplete. No full-chain transaction backfill was attempted. Historical analysis of signal discrimination, matched earlier non-winners, properly powered chronological holdouts, multiplicity correction and forward validation are still required. A source-linked price episode is not a proven early edge.

Continuous monitoring remains unapproved and unverified. Preserve the prepared Render/Docker safeguards and existing Neon/Alchemy infrastructure. Hosted startup/database reliability, full supported-universe soak, near-head catch-up and Solana history limitations remain operational gates; missing chain adapters remain separate from metadata coverage. Account billing/capacity must be reconciled before approval of continuous operation. No paid worker, API upgrade, signing or trading action was activated.
