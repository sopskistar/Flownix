# Next steps — Phase 2, hosting undecided

Current priorities, superseding the archived deployment notes below:

1. Fill in the missing `ETH_RPC_URL`, `ARBITRUM_RPC_URL`, and `SOLANA_RPC_URL` in ignored `.env.worker.local` (Alchemy HTTPS endpoints for the exact mainnets). BSC and Base are currently the only explicit Alchemy endpoints and their point probes passed. Do not paste endpoint values in chat.
2. Start one local persistent worker after confirming all five env values. The schedule now has 358 supported current Alpha identities queued (358 due, 14 in retry state as of 2026-11-18); no worker is deployed or running, and market data is currently 0 fresh / 317 stale / 62 no-pair.
3. Fix/recover the existing RPC failures (11 HTTP 403, 2 HTTP 429, 1 timeout) and verify per-chain cursor advancement. Alchemy ranges are clamped to 10 blocks; this is safe for free-tier limits but can fall behind chain head. Never reset cursors to the head to hide backlog.
4. Establish an actual per-chain cursor lag and full-universe scan-duration measurement before selecting any paid host. The worker is still offline. Current historical resource measurements were for a small selected workload only and must not be extrapolated to the full universe.
5. Owner chooses/approves a host only after reviewing updated resource data; no host or paid plan is activated. Keep Vercel, Neon and the single-worker lock.
6. Continue the original full wallet-intelligence scope and only add stronger detectors once there is sufficient verified trade/label coverage. Current total signals remain zero; the current EVM rule detects unusual transfers, not accumulation. Solana samples top accounts only.
7. Accumulate real 7/14/30/60/90/180-day evidence, validate with chronology and negative controls, and continue the Evening Trader/JCT case studies without inferring historic evidence.

No new dashboard credentials are needed. Real second-account OAuth denial remains a manual security check; existing owner sign-in/Journal verification and protected endpoints are preserved.

## Archived deployment-repair next steps

The following recorded the earlier pre-ingestion state and no longer describes current token counts:

1. Optionally complete the documented **real second-GitHub-account rejection test** in a separate browser profile. Exact allowlist policy and anonymous API denial are already tested; do not report the second-account browser flow as tested until performed.
2. Preserve the working Vercel project, permanent `https://flownix.xyz` OAuth callback, production session secret, and existing Neon database. Keep backups and check provider/storage quotas. No additional setup credentials are currently required for the dashboard.
3. Deploy a persistent worker only when intentionally ready to resume the separate live-data phase. Initially, a local WSL process has no additional hosting bill, but collection stops when the laptop sleeps or switches off. The current production worker is **not deployed/running**.
4. Highest-leverage research improvement: verify permitted official Alpha access and one reliable EVM RPC, then independently complete the live registry/market/transfer vertical-slice gate. Current official Alpha count is unverified and production tokens/transfers/live signals are zero. This deployment task did not start Phase 2.

Do not prioritize new graphs, signal engines, redesigned screens or additional providers over genuine data acceptance. Token watchlist toggles, populated token investigations and real-data paper fills cannot be accepted end to end until verified Alpha identities and executable market evidence exist. Their current empty/unavailable states remain intentional.
# Next implementation steps after the market coverage/classification update

1. Owner adds Alchemy HTTPS URLs locally under `ETH_RPC_URL`, `BSC_RPC_URL`, and `BASE_RPC_URL` (do not paste values into chat). Keep the Alchemy account on Free; do not accept a PAYG prompt.
2. Verify existing Neon target and migrations, then run `pnpm rpc:diagnose 1`, `pnpm rpc:diagnose 56`, and `pnpm rpc:diagnose 8453`. Each probes an actual current official Alpha contract, code/decimals, confirmed block, 10-block Transfer query, and—when present—receipt plus canonical block. Diagnostics do not ingest events or prove 180-day coverage.
3. Broad market cycle is now verified: 317 active-pair online identities had real ticker observations, 62 had no active pair; 244 ticker observations were fresh at the last local health query, with no provider errors. Keep the persistent collector single and recheck freshness after restart/deployment.
4. Manually classify eligible research candidates from cited project sources in Token Intelligence. Do not classify from symbol/logo or social posts alone. The new owner review is explicitly not independent verification.
5. Add `ETH_RPC_URL`, `BSC_RPC_URL`, and `BASE_RPC_URL` from Alchemy locally, then run `pnpm rpc:diagnose 1`, `pnpm rpc:diagnose 56`, and `pnpm rpc:diagnose 8453`. Alchemy is not yet configured/tested. Free `eth_getLogs` spans 10 blocks; full historical token-wide ledgers may require a separate indexed data source or approved budget. Do not trigger an unbounded backfill.
6. Obtain the exact Evening Trader post URLs and timestamps for PIEVERSE, AGT, Q, BTW, CAP, EVAA, JCT if a reproducible point-in-time audit is desired; several cases lack a target wallet or source post.
