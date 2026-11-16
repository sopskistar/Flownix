# Coverage register

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
