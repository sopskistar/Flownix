# Coverage register

## Current Phase 2 observations — 2026-11-16–17 UTC

**Live acceptance still NOT PASSED:** three canonical receipt samples verified, but real replay/resume and Base logs remain blocked. No hosted continuous worker. Local profiling collector is stopped; data ages honestly.

Latest registry capture **2026-11-17T02:34:34.868Z**: 686 identities, **378 online / 308 offline**. The earlier Nov16 observation had 377/309; the reconciler retained the status change rather than hardcoding the count.

| Evidence                                     | Verified result                                                                                                                                                                                              |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Official registry                            | 686 unique identities: 378 current/online, 308 offline. Full observed universe persisted, no fixture substitution                                                                                            |
| Chain distribution (all returned identities) | BSC 502; Ethereum 38; Base 46; Sonic 4; chain 4663 5; Arbitrum 4; Linea 1; Solana 70; Sui 13; Tron 3                                                                                                         |
| Actual Alpha markets                         | 1,467 symbols, U/USDT/USDC quote assets; 20 identities with stored market quotes. Registry metadata prices kept as separate source_kind, never silently blended                                              |
| Deep monitoring                              | 15 selected, 12 have one completed 100-block window each: 8 BSC, 4 ETH. Base 3 selected/0 scanned                                                                                                            |
| Transfer ledger                              | 180 canonical events: BSC 139, ETH 41. UTC block times, atomic quantities/decimals, log index, block/tx hashes and raw source hashes retained                                                                |
| Historical event coverage                    | BSC windows about 44–45 seconds/token; ETH about 20 minutes/token. Mostly Nov16 15:45–16:22 UTC. No complete history since Alpha inclusion                                                                   |
| Passive swap evidence                        | 18 known-factory Pancake V3 records; one attributed buy, one attributed sell, sixteen unattributed. A pool direction is not a personal trader identity                                                       |
| Balances / holder retention                  | 33 sampled balance snapshots, eight materialized wallet reports at first refresh. Longer deltas unknown without actual opening snapshots; no top-holder census or weeks-long retention yet                   |
| Market candles                               | 60,543 completed hourly candles at latest count; up to ~187 days for some symbols, shorter elsewhere. Fetch-time availability recorded; historical membership before first observation is unproven           |
| Signals                                      | Zero genuine accumulation signals. Real versioned suppression traces explain missing baseline/market/membership/coverage. No success/ROI chart                                                               |
| Exchange/entity coverage                     | No independently verified exchange/market-maker/team registry. Case wallet has only a possible_exchange third-party Bitget lead, not verified historical ownership                                           |
| RPC diagnostics                              | BSC current confirmed block/code/decimals and 10-block logs passed (five logs); ETH/BSC historical resume/replay returned 403/timeouts; Base current block/code/decimals pass, even 10-block logs return 429 |

Independently checked receipt/log/block references:

- [Ethereum transaction 0x537723…e5249](https://etherscan.io/tx/0x53772376ff8e56d91d6935b2d2cf3ff79bb3748924e38ac1a457f514008e5249), block 26428671.
- [BSC transaction 0x2a277a…9307c](https://bscscan.com/tx/0x2a277a19ca306598354648526ebfcc9e9aa3bfc2eaa8c5b242dd41f3a529307c), block 133957211.
- [Ethereum transaction 0x2a2cc0…feec](https://etherscan.io/tx/0x2a2cc07bd8981e3dd17cc220f73fa49ba7bef06e93ba7ae104f09b638b5efeec), block 26428655.

Receipt verification recorded 2026-11-16 17:53 UTC. Synthetic reorg/idempotency tests pass; no actual chain reorganization was observed. Failed replay preserved prior cursors/availability; no successful full replay is claimed. Full available/custom/range selectors do not manufacture 7–180-day wallet coverage. Other official chains have metadata only; deep analysis displays unavailable. Paid enrichment, Telegram delivery, historical outcome validation and public homepage remain unavailable/uncompleted.

## Archived foundation snapshot (superseded above)

Source research date: 2026-11-15 UTC. Final database snapshot: 2026-11-16 02:41 UTC. The final smoke/test details are in docs/TESTING.md and docs/BUILD_REPORT.md.

**Live-data acceptance gate: NOT PASSED.** Runtime official Binance registry checks returned DNS/network failure even outside the sandbox. The initial Ethereum RPC candidate resolved but timed out. Web documentation was accessible; web requests to registry/exchange did not yield a usable payload. No geographic bypass or alternative unofficial universe was used.

| Coverage                                 | Actual result                                                                                                                                                                                                                              |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Current official Alpha token count       | **Unknown / not verified**; local store has no admitted universe until official sync succeeds. Never report a configured or fixture count as observed.                                                                                     |
| Tokens receiving observed deep coverage  | **0 verified** in this environment. Target selector defaults to 15 eligible liquid EVM identities, but a target is not coverage.                                                                                                           |
| Networks observed from registry          | Unknown until successful response. No assumed all-BSC universe.                                                                                                                                                                            |
| Network adapters                         | BSC (56), Ethereum (1), Base (8453) implemented read-only. No successful token-event ingestion verified here. Other official chains receive metadata only and “Not available on this chain” for deep analysis.                             |
| Market data                              | Registry metadata for every returned entry when reachable; exact Alpha ticker/candles and size-gated depth quotes for up to MARKET_TOKEN_LIMIT default15. Missing Alpha pair or quote stays unavailable.                                   |
| On-chain tx proof                        | **No verified sample transaction hashes.** Three sample explorer URLs cannot honestly be supplied.                                                                                                                                         |
| Alert proof                              | Reproducible synthetic transfer-activity test replay with exact thresholds and evidence IDs; explicitly test-only, never persisted as a live signal. Real pipeline logs/provider failures are recorded in the database when worker is run. |
| Long-term windows                        | 1/3/7/14/30/60/90/180d, full collected history, custom dates in UI. Actual depth depends on provider history and collection start.                                                                                                         |
| Historical Alpha inclusion since Dec2024 | No independently verified archive obtained. First local observation bounds point-in-time membership. Provider listingTime is a separate claim.                                                                                             |
| Verified buys / sales / retention        | Unavailable. No dependable swap decoder implemented. Transfer log semantics remain unknown transfer/mint/burn/self-transfer.                                                                                                               |
| Holder concentration / entities          | No complete holder census, no independently reviewed labels. Balance samples are bounded observed-address reads. Manual assertions retain source and unverified status.                                                                    |
| Nansen / Arkham / paid enrichment        | No integration calls, no subscription, default OFF.                                                                                                                                                                                        |
| Telegram                                 | Optional implementation, no credentials or live receipt. In-app test works with PostgreSQL.                                                                                                                                                |
| Paper results                            | Engine/ledger implemented with explicit cost constraints; no actual trading returns or proven strategy performance.                                                                                                                        |

No demo mode is enabled. All test fixtures are isolated and explicitly synthetic or official documentation examples, not dated real provider recordings. Provider artifacts are ignored because responses may have redistribution restrictions; checked summaries belong in docs.

## Next priorities

1. Restore permitted official registry + reliable EVM RPC access and run the live vertical-slice gate: count actual identities/networks, select 10–20 with real liquidity, capture at least three canonical token events and first suppression/detection trace, inspect source evidence in UI.
2. Add one independently verified DEX pool/swap decoder and retained-purchase ledger with time-valid wallet/operational labels. This unlocks meaningful 14–180d persistence, quiet accumulation, distribution research and executable-cost assessment.
3. Collect sufficient longitudinal controls/negative cases before ranking or claiming statistical usefulness. Add independently sourced historical membership only where provenance exists.

Advanced supply-lock, clustering graph, catalyst, farming, distribution and statistical baseline features are not represented as completed implementations.
