# Operations

## Current operating state and changes (2026-11-16–17 UTC)

**Hosting undecided. No hosted collector active.** Oracle account registration failed; the owner will choose a provider after support review. Local profiling collectors have stopped and their stopped heartbeat is durable. Do not activate paid resources or create another PostgreSQL database. Portable procedures: WORKER_DEPLOYMENT.md; measured cost comparison: WORKER_HOSTING_COMPARISON.md.

Nine production migrations are applied (the earlier six plus additive 0007–0009). The worker uses DATABASE_URL_WORKER direct/TLS; Vercel keeps pooled DATABASE_URL. ORM audit and raw SQL use separate pools because Drizzle mutates serializers; native queries/typed JSON stay intact. Pool limits are four raw sessions plus one ORM session. Statements now have a 30-second server timeout. Keep this and the single session advisory lock when moving hosts.

New operational commands: `pnpm providers:production`, `pnpm collection:status`, `pnpm worker:diagnostics`, `pnpm research:refresh`, `pnpm live:gate verify`, `pnpm live:gate replay`. Live-gate replay currently fails public RPC historical access; never announce success from a fixture. Research refresh reads only stored canonical observations and holds the same collector lock. Eight requested long-term windows do not imply eight real historical periods collected.

Market refresh now requests candles incrementally after the newest stored completed hour. Extra historical pages are spaced six hours per symbol and bounded toward 180 days. Metadata covers the whole official registry; market batch remains capped and rotates non-deep entries. The current configured local batch is 20, default 15. Deep selection defaults 15; configurable upper bound is 100 for future approved quota capacity, not a claim that 100 tokens were live-tested.

Heartbeat every 30 seconds verifies the held advisory lock; leases renew every 15 seconds with two-minute expiry. Lock contenders exit without overwriting the active owner's heartbeat. SIGTERM/duration profiling cancellation aborts provider fetches; existing committed evidence remains. Storage guard defaults 750 MB and halts rather than deleting research; it does not measure/cap Neon's billable CU-hours. A 30-second idle poll replaces rapid database polling. Read provider errors and cursor event times, not heartbeat alone.

`WORKER_JOB_TIMEOUT_SECONDS` defaults to 900: an overlong job stops the collector, aborts requests and allows 30 seconds for cleanup before process exit. The host supervisor can then restart it and recover expired leases. This addresses the stalled profiling job without declaring provider success. Runtime deadline/restart behavior still needs a healthy hosted soak; do not set this shorter than a valid bounded job can complete.

Profiling, only when no other collector runs:

```sh
WORKER_RUN_SECONDS=65 pnpm worker:profile --idle
WORKER_RUN_SECONDS=600 PROVIDER_PROCESS_REQUEST_BUDGET=500 pnpm worker:profile
WORKER_RUN_SECONDS=300 WORKER_JOB_KINDS=registry,scan,persistence PROVIDER_PROCESS_REQUEST_BUDGET=500 pnpm worker:profile --once
pnpm worker:profile:report
```

The diagnostic job subset intentionally excludes market work and is not normal production monitoring. Leave WORKER_RUN_SECONDS/process-budget unset or zero and WORKER_JOB_KINDS unset for normal operation after approval. Profiling writes ignored `artifacts/profiles/`; mount a writable private path if running a read-only container. It stores aggregate CPU/memory/socket/query/request/log counts, never credentials/SQL/notes. The time limit stops scheduling after it expires; a running job may need bounded cleanup. Check actual stop/lease/lock status rather than assuming an exact wall-clock exit.

Current RPC errors: Base logs HTTP429; historical ETH/BSC replay/resume HTTP403/timeouts. Fresh BSC 10-block logs passed. Do not reset cursors, silently skip missing windows, or mark that limited fresh success as recovered history. Full real restart recovery remains unaccepted. See DATA_COVERAGE.md for exact observations and real tx references.

## Earlier foundation procedures

The detailed procedures below remain useful except where superseded by current counts, nine migrations and incremental/backfill behavior above.

## First use

From root: `corepack enable`, `pnpm install --frozen-lockfile`, `cp .env.example .env`, `docker compose up -d`, `pnpm db:migrate`. Start `pnpm worker:dev` in one persistent terminal and `pnpm dev` in another. Visit http://127.0.0.1:3000. Check `pnpm run doctor`, `pnpm providers:smoke`, then Data Health. Optional `pnpm run doctor --rpc` tests chain connectivity without claiming token event coverage.

The example local PostgreSQL password is a loopback development credential, not a remote production secret. Keep `.env` ignored. Use a secret manager for remote configuration. No trading API/private/seed keys are needed or accepted.

## Collection and recovery

Registry every 15m; selected markets 5m; deep per-token scans 60s; hourly persistence/outcomes; 30s outbox. Single worker and provider spacing can extend actual cadence. Monitor last successful sync, current market observation, per-chain last scan, cursor and job retry state. Worker updates heartbeat during jobs. A stopped worker produces stale UI rather than pretending cached data are live.

Jobs survive restart. Retry uses exponential delay capped at one hour; provider requests have a 15s timeout and three bounded attempts. 429 cooldown honors numeric Retry-After. Cursor catch-up progresses in configured SCAN_BLOCKS segments; missing historical data is not imputed. Increase block size only within actual provider limits. For a token newly selected, first scan is a bounded current confirmed window, not a complete ledger from deployment.

Keep registry reachable; stale membership blocks transfer detections. Paper entries require a stored fresh Alpha fullDepth ask, and exits require a bid with enough displayed size; missing books block fills. Current market prices use exact exchange baseAsset/quoteAsset pairs. Missing/no-pair entries remain visible. MARKET_TOKEN_LIMIT defaults 15. Historical candles backfill one additional <=1500-hour page per pair per run toward 180d, stopping at actual returned history. API-accessible candles earlier than membership evidence are context only. All observations remain retained; no destructive automatic pruning.

Selected EVM tokens use minimum registry liquidity and prioritize saved watchlist identities. Saving a token on an unsupported chain preserves the research thesis but cannot enable an unimplemented adapter. Sample balances cover up to three observed counterparties per scan; this is not complete holder coverage. No Nansen/Arkham/Bitquery subscription is needed.

Reorg hash mismatch marks that token’s ledger noncanonical and invalidates detections, then clears cursors/windows for bounded reconstruction. Delivered external messages cannot be recalled; inspect reorg-invalidated alerts before research use. No full archive replay is promised.

## Remote web / Neon

Production is deployed at **https://flownix.xyz** with ACCESS_MODE=oauth and exactly GITHUB_ALLOWED_LOGIN=sopskistar. GitHub OAuth callback: `https://flownix.xyz/api/auth/callback/github`. Credentials and a strong session secret are configured server-side; secrets never enter NEXT_PUBLIC variables. The owner verified real sign-in, logout protection and persisted Journal notes. Other-account rejection is enforced by tested policy but still needs a real second-account browser check. See [AUTH_SETUP.md](AUTH_SETUP.md).

Use DATABASE_URL for serverless/pooler web access and DATABASE_URL_WORKER for direct persistent sessions, mapped from Neon's DATABASE_URL_UNPOOLED. All six migrations were safely applied to the existing production Neon database; pooled/direct writes and fresh-process reads passed. Deployment commands and exact verification are in [DEPLOYMENT.md](DEPLOYMENT.md). Web production in local mode is deliberately denied. A remote standalone host must use the platform's binding (for example `pnpm --filter @flownix/web exec next start --hostname 0.0.0.0`); only do this after OAuth configuration. Vercel Root Directory is **apps/web**, shared files outside root enabled, Node22, install `pnpm install --frozen-lockfile`, build `pnpm run build`, output `.next`. Do not schedule the continuous collector in Vercel functions.

Persistent worker: `docker build -f Dockerfile.worker -t flownix-worker .`, then `docker run --env-file .env --restart unless-stopped flownix-worker`. Container DATABASE_URL must point to reachable Postgres, not container-local 127.0.0.1. Use TLS for remote Postgres and RPC keys. A WSL terminal, systemd service, VPS, Fly/Render/Railway persistent service can also run Node 22 + pnpm worker:dev. Do not run migrations concurrently with a release worker without a plan.

**Current production worker state: not deployed or started.** The lowest additional hosting cost is an existing local WSL/Linux machine. To monitor production later, prepare a separate ignored `.env.worker.local` containing the intended Neon direct URL as DATABASE_URL_WORKER, DATABASE_URL, and only required read-only provider settings. From root run `node --env-file=.env.worker.local --import tsx apps/worker/src/index.ts`. Do not copy unnecessary OAuth secrets into worker hosting. One-shot diagnostics are not an always-on collector. Sleeping/shutting down the laptop stops observations and notifications; Vercel remains available and must show stale/offline data. Recovery catches up only within adapter/provider limits and cannot recreate unavailable history.

For unattended collection later, run the existing worker Dockerfile on an already available always-on host with restart policy, or choose a persistent VPS/container service after checking its current price and limits. Keep the same database, direct session connection, one-worker advisory lock, environment secrets, bounded provider quotas and health monitoring. No hosting subscription or worker service was purchased or activated during this deployment task.

## Notifications and budget

In-app alerts require only PostgreSQL. Test from Settings; test records are not signal_events and do not create outcomes. Telegram defaults OFF. To enable set TELEGRAM_ENABLED=true plus TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID server-side; default scope is saved watchlist. Settings test queues an outbox row; only `ok:true` plus message_id marks delivered. Up to five jobs per batch, max20/minute, bounded retries. Delivery is at-least-once under ambiguous timeouts. No Telegram send occurred without supplied credentials.

Paid enrichment has no runtime adapter. Even if its env enable flag changes, no paid calls occur. The core budget guard rejects disabled/over-cap requests; future adapters must reserve estimated cost transactionally in api_budgets before calling and settle afterwards. Do not treat a positive environment budget as proof that a particular paid query is affordable. Provider dashboard totals exclude hosting, storage and network costs.

## Security and maintenance

Local bypass relies on loopback binding and exact loopback Host. Next inserts loopback forwarding headers internally; only its loopback values matching Host are accepted. Non-loopback/contradictory forwarded values, explicit Forwarded headers and production local mode are denied. Never expose local mode through a reverse proxy. OAuth mode relies on vetted next-auth CSRF/session handling, exact allowlist, same-origin mutation checks and 60 mutations/minute database limit.

Notes/labels require authorization, validated inputs and normal React escaping. Evidence URLs are stored but never server-fetched. RPC endpoints are environment-only trusted operator inputs. CSV exports are authenticated and formula-escaped. No analytics. CSP permits Next inline scripts/dev eval; tighten to nonce-based CSP before a high-assurance remote deployment. No broad network data proxy or arbitrary URL endpoint exists.

Back up PostgreSQL before upgrades. `pg_dump "$DATABASE_URL_WORKER" > backup.sql` in a trusted terminal (do not upload backups to Git). Restore to a separate database first. Schema migrations use an advisory transaction lock and an applied-file ledger. Tables/source snapshots can grow significantly; plan retention/archive/backups before months of continuous collection. Do not delete membership or first-observation history when compacting older data.

Registry liquidity is an eligibility metadata screen, not a quote-currency conversion. Position-size fractions use displayed ask price × quantity in the actual quote asset; no USD/stablecoin parity is assumed.
