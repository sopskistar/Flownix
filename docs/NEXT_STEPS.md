# Next steps — Phase 2, hosting undecided

Current priorities, superseding the archived deployment notes below:

1. Configure reliable permitted historical/log RPC access for ETH/BSC and Base. Current public heads work, historical replay gets 403/timeouts and Base logs 429. Store keys only in ignored worker configuration. No paid plan without approval.
2. Complete real replay/duplicate preservation and cursor advancement after process restart. Never reset cursors to the head to hide catch-up failures. Gate remains incomplete despite 180 canonical transfers and three verified receipts.
3. Re-profile a healthy 15-token cycle including successful scans, writes, catch-up and restart; then validate quota capacity before 50/100 live workloads. Current estimates and measurements are explicitly separated in WORKER_HOSTING_COMPARISON.md. Review Neon compute/storage usage, not just worker hosting price.
4. Owner chooses/approves a host after Oracle support review and cost comparison. No host is assumed; no cloud collector is active. Use WORKER_DEPLOYMENT.md for portable Docker/systemd or managed container deployment, same Neon and single-worker lock.
5. Continue the original full wallet-intelligence scope: monitored-address balance history, verified entity labels, exchange flows excluding internal routing, project/MM provenance, passive swap coverage, cross-token relationships, conservative retained purchases and supply concentration exclusions. Unknown ownership/history remains unknown.
6. Accumulate actual longitudinal 7/14/30/60/90/180-day evidence, evaluate quiet/persistent accumulation and contradictory distribution evidence, then validate with chronological negative controls and realistic fills. Current zero accumulation signals is an honest result.
7. Finish JCT/BTW historical transaction/date/label proof and other candidate/failed-runner cases. Keep historical Alpha membership separate from today's registry. Public introduction remains secondary to working core data.

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
