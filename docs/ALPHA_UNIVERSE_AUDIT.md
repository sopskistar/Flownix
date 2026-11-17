# Binance Alpha universe and research eligibility audit

## Current evidence

The independently fetched and persisted official Binance registry snapshot for this continuation was captured at **2026-11-17 15:07:10.149 UTC**: **686 unique chain/contract identities**, **379 online, 307 offline, 0 unknown**, and **1,467 official trading symbols**. The registry endpoint remains the sole membership authority. This is a timestamped observation, not a claim about counts after that time.

The previous captured chain distribution (all identities, not active counts) was: BSC 502, Ethereum 38, Base 46, Sonic 4, chain 4663 5, Arbitrum 4, Linea 1, Solana 70, Sui 13, Tron 3. Chain ID **4663 is Robinhood Chain**, confirmed by [Robinhood's network documentation](https://docs.robinhood.com/chain/connecting/). Network counts must be read from registry identities, not confused with chain IDs.

Active online Alpha identity counts from the 15:07 snapshot: BSC (56) 289; Ethereum (1) 19; Base (8453) 26; Solana (CT_501) 22; Sui (CT_784) 9; Tron (CT_195) 3; Robinhood Chain (4663) 5; Sonic (146) 4; Arbitrum (42161) 2; Linea (59144) 0. Sum: 379. Deep adapters are not implied by membership; the current EVM collector covers only Ethereum, BSC and Base, and no Alchemy override has been tested.

The persisted response contains 686 distinct `alphaId` values; these are Alpha product identifiers, not project counts. There are 317 online identities with active tradable pairs. Flownix does not infer project count from ticker/name.

## Classification and scanner rules

Migration `0011_project_classification.sql` adds cited owner-review classifications: `verified_non_meme`, `verified_meme_focused`, `mixed_ambiguous`, and `unclassified`. The Alpha registry remains complete. Radar defaults to currently online identities with `verified_non_meme`; selecting “All official Alpha identities” reveals the complete registry and other classifications. Deep research selection and transfer-activity alerts also require an owner-reviewed non-meme classification with evidence. An owner review is recorded as a human research judgment, not as automated or independent verification. Store project-controlled or reputable evidence and rationale; do not classify from ticker/logo.

At implementation time there are **no classification rows yet**, so the default non-meme research view and deep-selection pool are expected to be empty until the owner reviews projects. This is intentional. The all-Alpha registry remains accessible for research review. Historical classification must use evidence relevant to the historical date; current classification does not prove past eligibility.

## Broad prices versus deep monitoring

Broad official Alpha ticker checks rotate over **all online identities with an active Alpha pair**, up to `MARKET_TOKEN_LIMIT` per cycle (default 100). The independent `DEEP_TOKEN_LIMIT` (default 15) governs additional depth, candles, and on-chain research only. Each identity stores `observed`, `no_pair`, or `error`, pair, original quote currency, check time, and provider error code. Freshness is 15 minutes. Registry metadata prices may be displayed only as `alpha_registry` with **quote unspecified**; they are not treated as USD, USDT, USDC, or `U` prices. Alpha ticker observations preserve the actual pair quote. No conversion or blending occurs.

Pair preference is deterministic: `USDT`, then `USDC`, then `U`, then lexical symbol order. It is only a display/coverage choice; all prices retain their quote asset. A missing official pair is not filled with a DEX price.

The previous capture had 1,467 market symbols but just 20 identities with stored ticker observations because the market loop shared the 15-token deep limit. The revised collector was exercised against the official exchange-info/ticker API in four bounded cycles: **317/317 current identities with an exact active Alpha pair received ticker observations; 62/379 current identities had no active pair; zero provider errors**. Database status at 15:55 UTC: 317 distinct ticker-covered identities, 377 snapshots, and 244 observations younger than the 15-minute freshness threshold. This is a locally executed batch verification, not proof of an always-on production collector; freshness decays while the worker is stopped. All 379 had a registry metadata price, but those values remain quote-unspecified and are not Alpha ticker data.

## Gaps

- No token identities are yet classified by a sourced human review.
- 686 distinct alphaId values were present in the persisted snapshot; distinct projects are not inferred from Alpha IDs. 317 current identities have active pairs; 62 have no pair. Project-classification count is 0 until a human adds source-backed reviews.
- The registry's `listingCex`/status fields do not prove Spot/Futures listing.
- Historical membership remains proven only from collected snapshots; no retrospective pre-inclusion membership is imputed.
