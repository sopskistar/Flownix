# Binance Alpha universe and research eligibility audit

## Current evidence

The independently fetched and persisted official Binance registry snapshot for this continuation was captured at **2026-11-17 15:07:10.149 UTC**: **686 unique chain/contract identities**, **379 online, 307 offline, 0 unknown**, and **1,467 official trading symbols**. The registry endpoint remains the sole membership authority. This is a timestamped observation, not a claim about counts after that time.

The previous captured chain distribution (all identities, not active counts) was: BSC 502, Ethereum 38, Base 46, Sonic 4, chain 4663 5, Arbitrum 4, Linea 1, Solana 70, Sui 13, Tron 3. Chain ID **4663 is Robinhood Chain**, confirmed by [Robinhood's network documentation](https://docs.robinhood.com/chain/connecting/). Network counts must be read from registry identities, not confused with chain IDs.

Active online Alpha identity counts from the 15:07 snapshot: BSC (56) 289; Ethereum (1) 19; Base (8453) 26; Solana (CT_501) 22; Sui (CT_784) 9; Tron (CT_195) 3; Robinhood Chain (4663) 5; Sonic (146) 4; Arbitrum (42161) 2; Linea (59144) 0. Sum: 379. This is the latest persisted registry snapshot, not a re-fetch at this update. Deep adapters are not implied by membership; runtime Alchemy point diagnostics have now passed on BSC and Base, while Ethereum, Arbitrum and Solana credentials are absent from the local worker env.

The persisted response contains 686 distinct `alphaId` values; these are Alpha product identifiers, not project counts. There are 317 online identities with active tradable pairs. Flownix does not infer project count from ticker/name.

## Classification and scanner rules

Migration `0011_project_classification.sql` retains optional owner-reviewed categories: `verified_non_meme`, `verified_meme_focused`, `mixed_ambiguous`, and `unclassified`. Categories are descriptive only. Radar defaults to every online, official Alpha identity, including meme coins. Classification is not required for market observation, baseline scan jobs, intensive investigation or evidence-backed alerts. DEX/Screener feeds cannot add candidates.

Unknown classification does not block automatic monitoring. Historical eligibility still requires time-relevant proof of Alpha membership; a current category does not prove historical status.

## Broad prices versus deep monitoring

Broad official Alpha ticker checks rotate over **all online identities with an active Alpha pair**, up to `MARKET_TOKEN_LIMIT` per cycle (default 100; batch only). A durable per-token scan job is maintained for every current token on Ethereum, BSC, Base, Arbitrum and Solana; the watchlist is not a prerequisite. EVM baseline cadence defaults hourly; Solana top-account sampling defaults every six hours. Jobs and queues are not proof of a fresh cursor: provider quota and scan lag are visible separately. Registry metadata prices are quote-unspecified and never substituted for Alpha ticker prices.

Pair preference is deterministic: `USDT`, then `USDC`, then `U`, then lexical symbol order. It is only a display/coverage choice; all prices retain their quote asset. A missing official pair is not filled with a DEX price.

The prior bounded official exchange-info/ticker run covered **317/317 current identities with an exact active Alpha pair; 62/379 had no active pair**. It remains a local finite run, not proof of continuous freshness. The per-cycle 100 token bound is a batch size; the persistent selector orders by oldest check time and rotates across all eligible pairs. All 379 had a registry metadata price then, but those values remain quote-unspecified and are not Alpha ticker data.

## Gaps

- Project categories are optional and do not gate the official Alpha universe.
- 686 distinct alphaId values were present in the persisted snapshot; distinct projects are not inferred from Alpha IDs. 317 current identities have active pairs; 62 have no pair. Project-classification count is 0 until a human adds source-backed reviews.
- The registry's `listingCex`/status fields do not prove Spot/Futures listing.
- Historical membership remains proven only from collected snapshots; no retrospective pre-inclusion membership is imputed.
