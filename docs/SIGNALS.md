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
