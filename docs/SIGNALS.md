# Signals and long-term research states

Rules are deterministic experiments. No score is a probability of profit. No threshold is empirically optimized.

## Operational transfer rule

`UNUSUAL_TRANSFER_ACTIVITY`, version `transfer-activity/1.0.0`:

- Current locally proven Alpha membership at window start.
- Complete confirmed equal-block scan windows; minimum 12 prior windows by default.
- Current canonical unknown-transfer events deduplicated by chain + tx hash + log index.
- Exclude mint/burn/self-transfer from event count. Bridge/LP/custody semantics remain unknown, never buying.
- Current window >=25 events and >=3x max(1, prior mean).
- Fresh market and scan timestamps <=900 seconds; minimum reported liquidity 100,000. Stale backlog cannot create a current alert.
- Stage INVESTIGATE, confidence limited, opportunity score null, explicit unknowns and transaction references. Price/quote and original market snapshot are frozen at detection. Cooldown 60 minutes.
- Settings change future computations only. Each event retains its exact thresholds/version/evidence/counter-evidence. Trace records explain suppressed events.

Synthetic deterministic replay is in packages/core/test/core.test.ts. It proves rule behavior, not live market detection. No dependable swap decoder or live event was verified in the current environment.

## Accumulation Persistence Engine

`accumulationPersistence` accepts only completed dated **verified purchase** daily ledgers with source transaction IDs and data-availability timestamps. Transfers cannot enter as buys. Minimum 14 covered days, >=90% requested-day coverage, 3 consecutive net-buy days for EARLY ACCUMULATION, 14 for SUSTAINED ACCUMULATION, measured retention >=80%, and >=3 independently established buyers in each used period. Missing retention or independence leaves INSUFFICIENT EVIDENCE. These strict defaults are provisional; missing days break streaks. It never estimates historical acquisition price. Current worker records unavailable coverage because no swap adapter is verified; this is not zero buying.

Lifecycle vocabulary: DISCOVERY, EARLY ACCUMULATION, SUSTAINED ACCUMULATION, SUPPLY CONCENTRATION, STRENGTHENING SETUP, PRICE EXPANSION, DISTRIBUTION RISK, THESIS INVALIDATED, INSUFFICIENT EVIDENCE. These are nonchronological research states. Membership first observation creates DISCOVERY; a first evaluation without purchase coverage records INSUFFICIENT EVIDENCE. Future purchase adapters may apply the tested persistence transitions. Other automated transitions need evidence rules before activation. User thesis changes persist a reason and `manual-hypothesis/1`, visibly unverified; flat price or elapsed time never deletes a thesis.

Independent components remain separate: long-term purchase persistence/retention (14–180d), recent strengthening, market confirmation, and risk/coverage. No weighted opportunity ranking is produced without minimum input coverage. Radar sorts by liquidity, observation age, unresolved event count or name; it never sorts gainers into an opportunity score.

## Deferred, not secretly enabled

ACCUMULATION_EARLY / sustained net buying, whale clusters, supply absorption/lock, quiet accumulation, catalyst ignition, distribution trap, farming/wash-turnover, market confirmation and calibrated ranking require independently verified swaps, holder histories, source-valid labels, liquidity/depth and sufficient own-token baseline history. They are not live engines in this release. The attributed-exchange-flow accounting helper excludes known same-entity transfers and reports partial coverage. Exchange Rotation UI displays label-valid observed cross-token counts; manual labels do not become independently verified entities.

Round-trip/incentive research must compare verified buys/sells, capital reuse and retained net units, not volume alone. Bitquery’s quq article informs the experiment design; no such classification is asserted for an unexamined token. No identity, intent or criminal allegation follows from an order wall, maker flag, custody transfer or address label.

# Phase 2 implementation update

Versioned `long-term-thesis/1` uses experimental defaults: at least seven actually covered days and three purchase days for early research; 30 covered days and seven purchase days for sustained research; three retained-address samples, conservative retention >=80%, >=90% known input coverage, fresh membership/market/ledger/pool observations, quiet absolute price change <=20%. Address independence stays unknown/provisional. These thresholds are not statistically calibrated or profit probabilities.

Actual monitoring duration is the union of completed transfer/pool time intervals after first provable membership, with overlap removed. Elapsed time across gaps does not become observed history. Opening/closing balances must reconcile with the continuous canonical transfer ledger; missing history, rebases or unexplained balance changes suppress retained-purchase inference. Pool candidate discovery requires known-factory registration; an ordinary Transfer, allocation or router ambiguity never becomes a wallet purchase.

The engine preserves a prior supported thesis during flat prices/outages with an insufficient-evidence flag, suppresses new bullish stages for stale/future inputs and repeated short round trips, and marks observed +50% expansion as extended. A deterministic distribution transition requires actual contradictory sell/reduction evidence; **the current materializer supplies no verified distribution evidence yet**, so that path is tested but not advertised as an operational detector. Supply-concentration/strengthening/invalidation states remain auditable research states, not fully automated engines.

Current production evidence yields **zero accumulation signals**. Real transfer activity suppression traces are stored separately from signal events. Eight requested wallet windows are materialized from available evidence only; they do not imply months of holder history. All prior source/cooldown/point-in-time rules below continue to apply.
