# Account recovery release — 2026-11-21

Recovered `main` at `5702523855a1bd7d588b75155a954d8ed9af71b2`; remote main matched. Preserved all 22 modified files, untracked worker tests, the existing Neon database, cursors, evidence, profiles and screenshots. No reset, clean, stash, paid service or trading action. The earlier account's final logs completed: 101 tests, typecheck, lint, four browser journeys and production build passed. Those results followed the implementation edits. No collector survived; Neon confirmed no advisory lock despite a persisted heartbeat. Prior Actions run `44908180552` passed for `5702523`, not for these pending changes.

## Release changes and checks

Preserved provider cancellation, sibling-read draining, heartbeat/lease settlement before SQL shutdown, bounded market/scan overlap, fair retry turns, market batching/atomic provenance, source-price freshness, Solana decoding/cursor recovery and native History Radar filtering.

Recovery exposed another crash in `postgres@3.4.9`: a deferred write on a closed reserved connection throws outside its query promise. A tracked pnpm patch rejects closed/destroyed-socket writes with `CONNECTION_CLOSED` in both Node entrypoints, with no package upgrade. The loopback regression crashes the original driver and passes with the patch. See [patch rationale](../patches/README.md). This does not guarantee transactional continuity after a lost session.

Radar filtering also preserves URL fragments. Its new browser regression verifies initial query hydration, unrelated query parameters, replacement history length, Back/Forward, page reset, reload and no filter-triggered RSC requests.

| Check                                                                   | Result / retained log                                                                                                                      |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Full tests, including PostgreSQL rollback/cursor and market integration | **103 passed**, `/tmp/flownix-recovery-tests-final.log`                                                                                    |
| Typecheck / lint                                                        | Passed, `/tmp/flownix-recovery-types.log`, `/tmp/flownix-recovery-lint.log`                                                                |
| Local browser journeys                                                  | **5 passed**, `/tmp/flownix-recovery-browser-final.log`                                                                                    |
| Extra Neon-backed browser attempt                                       | Navigation interrupted by `chrome-error://chromewebdata/`; runner later exited with signal 143. Not a populated-data pass. Trace retained. |
| Final production build / hosted release                                 | Build passed (`/tmp/flownix-recovery-build.log`); hosted release verification is linked in delivery.                                                                                                     |

Browser checks cover runtime/hydration errors, navigation, themes, responsive/reduced-motion layouts, URL/history behavior, origin/access rejection and local journal/in-app test persistence. No production OAuth session was synthesized. Desktop/phone screenshots and previous populated-data captures remain in ignored `artifacts/screenshots/`.

## Collection snapshot

Read-only snapshot **2026-11-21 18:19:22 UTC**, measured against recovery start 16:59:56 UTC. Pooled and direct system-DNS reads succeeded after intermittent direct/configured-resolver timeouts. DNS override was process-local; endpoints and TLS were preserved.

| Measure                                                      |        Observed |
| ------------------------------------------------------------ | --------------: |
| Official identities / online / offline                       | 687 / 378 / 309 |
| Registry networks / online networks / baseline adapters      |      10 / 9 / 5 |
| Supported identities scheduled / ever successfully observed  |       357 / 343 |
| Due / retrying jobs                                          |         333 / 4 |
| Active Alpha pairs / no active pair                          |        316 / 62 |
| Collected within 15 minutes / source-price fresh pairs       |           0 / 0 |
| Total canonical transfers / verified swap interpretations    |        318 / 18 |
| New canonical transfers / Solana observations since recovery |        17 / 170 |
| Canonical receipts / EVM balance snapshots                   |          6 / 33 |
| New signals                                                  |               0 |
| Database bytes                                               |     129,638,400 |

The zero freshness snapshot followed bounded-worker shutdown. Recovery persisted 365 ticker observations across completed and partial batches; three completed 100-token batches reported zero failures. A newly collected ticker can still contain an old provider `closeTime`. Registry metadata prices are separate evidence. Per-batch request caps never permanently cap registry/token coverage; meme coins remain eligible.

Adapters: Ethereum, BSC, Base, Arbitrum and sampled Solana. Missing adapters: Sonic (4 online), Robinhood Chain (5), TRON (3), Sui (9); Linea identities were offline. Registry discovery retains every network.

Recovery completed 19 EVM windows on 19 BSC identities and two Solana scans. Solana scans reported 27 transactions / 99 decoded deltas combined, each with 20 account gaps and `completeHistory: false`. Database observations additionally include snapshots and partially completed work. All 417 account checkpoints across 22 mints have historical gaps. Unavailable metadata preserves the prior checkpoint. One `SOLANA_RPC_-32015` retry remains, plus three stale-membership retries. Deltas/transfers are not verified purchases or retention.

There were 17 new suppression traces for missing fresh price/minimum liquidity and two for insufficient baseline windows. No validated accumulation signal or external-channel delivery receipt. Local in-app notification behavior passed; configured production delivery remains unproven.

## Worker reliability and resource limits

The first resumed collector hit the driver crash. The patched run completed ten EVM scans, one Solana scan and two 100-token batches, then hit its existing scan deadline during a connection stall. Its bounded watchdog exited; committed evidence survived and the advisory lock disappeared. A later bounded system-DNS attempt encountered heartbeat `ETIMEDOUT`, cancelled requests, recorded the registry retry, drained the job and saved its profile without the uncaught driver error. It established graceful shutdown, not reliable connectivity. No persistent worker is deployed.

The patched profile spans 1,329 seconds: mean RSS 119 MiB, peak 150.3 MiB, mean CPU 2.26%, 1,440 SQL queries, 203 Alpha requests and 176 RPC requests. Estimated Alchemy usage: 4,510 method-priced CUs, zero unpriced methods. The connection stall is included; this is not sustained-throughput evidence. The previous account's last profile spans 2,856 seconds: 7,317 SQL queries, 946 RPC requests, estimated 23,228 CUs, mean RSS 158.1 MiB and peak 184.8 MiB. See [resource measurements](WORKER_RESOURCE_MEASUREMENTS.json).

Process counters/CU estimates are not account billing or Neon compute meters. Existing ten-block Alchemy windows preserve historical cursors and do not establish continuously near-head coverage. Persistent hosting, provider/quota headroom, uninterrupted connectivity, a complete supported-universe cycle and sustained market rotation remain operational gates. No paid service/backfill was enabled.

Historical LAB, BITWAY/BTW, AKE, EVAA, CAP, PIEVERSE, JCT, AGT and other cases remain required. Verified acquisition/ownership, longitudinal balances, winners/non-winners, point-in-time membership/listing catalysts, chronological and out-of-sample validation, forward paper trading and Rally Intelligence remain incomplete. Operational recovery does not replace that work or establish a profitable strategy.
