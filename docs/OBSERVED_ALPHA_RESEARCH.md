# Binance Alpha observed research

The read-only production evaluation on November 27, 2026 at 14:55:37 UTC found 364 canonical transfers, 18 canonical swap records, 36 canonical wallet balance snapshots, 3 wallet labels, 464 complete sampled scan windows and zero signal rows. All 504 accumulation observations recorded insufficient evidence. The preceding 36 hours had 119 completed scan jobs, 3 completed persistence jobs and 28 completed notification jobs.

The latest transfer suppression traces showed 275 freshness or liquidity failures, 54 insufficient baselines and 16 stale or incomplete scans. The original transfer detector required a fresh market quote even for on-chain activity. The accumulation worker emitted signals only on a qualifying state transition. Purchase and retention coverage have to be established separately from transfer counts. The worker still passes `independenceVerified: false` and does not use unsupported wallet ownership claims to strengthen an alert.

| Historical rule match over 30 days | Findings | Exact Alpha identities |
| --- | ---: | --- |
| Documented exchange-address flow | 1 | EVAA on BNB Chain |
| Verified pool settlement | 18 | UB, AIOT, O, B and DGAI on BNB Chain |
| Unusual transfer surge | 0 | None |
| Material balance change between comparable checkpoints | 0 | None |

The historical EVAA transaction moved **499,999.806 EVAA** from a documented Gate address at 10:27:38 UTC on November 25. Flownix collected it at 04:58:09 UTC on November 26 after the address label was locally available. The label supports address-level flow. The transfer conveys no evidence of purchase, trading intent or ownership of the receiving wallet. [Transaction](https://bscscan.com/tx/0xeaf7e246446d40612dd8b4f76bd5a049cd23ec03a6fbdecabcc71858fafff743) · [Gate address source](https://www.gate.com/announcements/article/34187)

The historical UB record verifies a buy-side pool settlement on November 16 at 16:21:29 UTC, collected at 16:23:18 UTC. The swap is `verified_pool_swap_unattributed`. The settlement direction is known and buyer identity is unresolved. [Transaction](https://bscscan.com/tx/0xb2edaad4fd46545aed097b0c829ac9913a8a576a71f782e8d2b48dafedb2f9f9)

The new path evaluates existing canonical data after a successful duty child exit within the reserved shutdown allowance. It publishes at most one representative per token and finding type in that window. A surge requires six earlier completed equal-size windows and at least 25 transfers at three times the baseline mean. A material balance finding requires a change of at least one token and 20% of the prior comparable wallet checkpoint. Increases and decreases are leads to investigate. Wallet balance checkpoints do not imply a transaction or a purchase, so those findings link to the relevant block. The existing reorg handling invalidates contradictory canonical records. Economic distribution, unrelated buyer ownership, full historical coverage and automated thesis invalidation are still unsupported.

Historical data was evaluated read-only. The tests use local PostgreSQL and mocked Telegram to exercise a new canonical exchange flow with no market quote, reject an old transfer collected in the same window and prove consolidated delivery before sleep with no duplicate. The observed research settings and delivery ledger record the window result and any digest outcome. Both Telegram flags remain off until owner approval. [Manual deployment and activation runbook](CONTROLLED_RENDER_TELEGRAM_RELEASE.md)
