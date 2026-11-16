# Operations

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

Set ACCESS_MODE=oauth, GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, GITHUB_ALLOWED_LOGIN, NEXTAUTH_SECRET and NEXTAUTH_URL (your HTTPS origin). GitHub OAuth callback: `https://your-host/api/auth/callback/github`. One exact GitHub login is allowed; all others are rejected. Secrets never enter NEXT_PUBLIC variables. No credentials existed for a live OAuth callback verification in this build.

Use DATABASE_URL for serverless/pooler web access and DATABASE_URL_WORKER for direct persistent sessions. Apply `pnpm db:migrate` against the direct connection. Web production in local mode is deliberately denied. A remote host must use the platform's binding (for example `pnpm --filter @flownix/web exec next start --hostname 0.0.0.0`); only do this after OAuth configuration. Vercel root should be the monorepo root with install `pnpm install --frozen-lockfile`, build `pnpm build`, Next output apps/web/.next; do not schedule the continuous collector in Vercel functions.

Persistent worker: `docker build -f Dockerfile.worker -t flownix-worker .`, then `docker run --env-file .env --restart unless-stopped flownix-worker`. Container DATABASE_URL must point to reachable Postgres, not container-local 127.0.0.1. Use TLS for remote Postgres and RPC keys. A WSL terminal, systemd service, VPS, Fly/Render/Railway persistent service can also run Node 22 + pnpm worker:dev. Do not run migrations concurrently with a release worker without a plan.

## Notifications and budget

In-app alerts require only PostgreSQL. Test from Settings; test records are not signal_events and do not create outcomes. Telegram defaults OFF. To enable set TELEGRAM_ENABLED=true plus TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID server-side; default scope is saved watchlist. Settings test queues an outbox row; only `ok:true` plus message_id marks delivered. Up to five jobs per batch, max20/minute, bounded retries. Delivery is at-least-once under ambiguous timeouts. No Telegram send occurred without supplied credentials.

Paid enrichment has no runtime adapter. Even if its env enable flag changes, no paid calls occur. The core budget guard rejects disabled/over-cap requests; future adapters must reserve estimated cost transactionally in api_budgets before calling and settle afterwards. Do not treat a positive environment budget as proof that a particular paid query is affordable. Provider dashboard totals exclude hosting, storage and network costs.

## Security and maintenance

Local bypass relies on loopback binding and exact loopback Host. Next inserts loopback forwarding headers internally; only its loopback values matching Host are accepted. Non-loopback/contradictory forwarded values, explicit Forwarded headers and production local mode are denied. Never expose local mode through a reverse proxy. OAuth mode relies on vetted next-auth CSRF/session handling, exact allowlist, same-origin mutation checks and 60 mutations/minute database limit.

Notes/labels require authorization, validated inputs and normal React escaping. Evidence URLs are stored but never server-fetched. RPC endpoints are environment-only trusted operator inputs. CSV exports are authenticated and formula-escaped. No analytics. CSP permits Next inline scripts/dev eval; tighten to nonce-based CSP before a high-assurance remote deployment. No broad network data proxy or arbitrary URL endpoint exists.

Back up PostgreSQL before upgrades. `pg_dump "$DATABASE_URL_WORKER" > backup.sql` in a trusted terminal (do not upload backups to Git). Restore to a separate database first. Schema migrations use an advisory transaction lock and an applied-file ledger. Tables/source snapshots can grow significantly; plan retention/archive/backups before months of continuous collection. Do not delete membership or first-observation history when compacting older data.

Registry liquidity is an eligibility metadata screen, not a quote-currency conversion. Position-size fractions use displayed ask price × quantity in the actual quote asset; no USD/stablecoin parity is assumed.
