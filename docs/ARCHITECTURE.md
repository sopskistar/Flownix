# Architecture

One TypeScript workspace, PostgreSQL as durable source of truth. Node 22.12+ (tested runtime 22.23.1). No Redis, Kafka, LLM, wallet signer or order client.

- `packages/core`: identities, observed schemas, fixed-source REST provider, bounded HTTP requests, EVM log decoding, evidence-gated transfer rule, purchase-ledger persistence experiment, paper calculation and security helpers.
- `packages/db`: postgres-js connections and Drizzle schema/typed inserts, SQL migrations for normalized evidence tables. Explicit transactional SQL handles cursors, leases and provenance without hiding behavior in an ORM. Migrations are authoritative; Drizzle projections cover current typed writes, not all future features.
- `apps/worker`: persistent single collector, database jobs/backoff, per-token confirmed log scans, raw snapshots, source retention, sampled balance reads, persistence coverage records, outcome horizons, notification outbox.
- `apps/web`: Next.js App Router, protected server components and BFF mutations. Browser fetches only same-origin actions; no provider secret or RPC URL is sent to clients.

Registry reconciliation is transactional: validate a nonempty response, normalize chain+contract, snapshot all raw entries, update last_seen/status and record additions/removals. Removed entries stay in the database. Unknown offline flags stay unknown. Alpha ID and opaque tokenId never substitute for one another. Tradable quote pairs come from exchange baseAsset/quoteAsset, not ticker concatenation. No Spot/Futures candidates.

All registry metadata is collected each sync. Deep selection defaults to 15 currently verified EVM identities with registry liquidity >=100,000, with watchlisted identities prioritized. It is deterministic and does not favor price gainers. Metadata from every observed network is supported; event adapters exist for BSC/Ethereum/Base, and count as working only after observed logs/cursors. All selected tokens get per-token queue entries. Current market ticker/candle selection defaults to 15 to respect free quotas; raise MARKET_TOKEN_LIMIT explicitly for more pair observations. Uncovered scanner Alpha prices remain unavailable; registry prices never masquerade as Alpha market prices.

The worker uses a dedicated session advisory lock and durable job rows. Default concurrency is one. Lease recovery and idempotent keys tolerate process restarts. Heartbeats continue during long jobs. Registry every 15m, markets every 5m (effective cadence may be longer under quotas), per-token scans every 60s, notification outbox every 30s, long-term coverage/outcomes hourly. These are scheduling intentions; UI shows actual lag. Unchanged signals use per-token/rule cooldown. Worker downtime preserves cursors; bounded next-block catch-up records old windows without emitting fresh alerts from stale events.

Raw atomic amounts are decimal strings / numeric(78,0); formatting uses BigInt string slicing. Paper calculations use decimal.js with explicit precision. PostgreSQL numeric values remain strings. USD is not silently equated to USDT/USDC. Provider metadata valuation methodology remains uncertain.

Confirmed EVM scanning: verify chain ID, use head minus confirmation distance, fetch a bounded range, verify every event block hash and timestamp, persist events and cursor transactionally. Recheck previous cursor hash each run. A changed cursor invalidates the affected token ledger and signals and clears windows, then starts bounded rescan. This deliberately conservative deep-reorg response loses baseline coverage rather than presenting a corrupted history. No full fork tree or probabilistic finality claim.

Purchase-ledger accumulation is separate from transfers. Without verified swaps and retention attribution, all numerical accumulation components remain null. Manual thesis revisions use `manual-hypothesis/1`, never claim computed proof, and persist history. Watchlists archive instead of deleting history. Full retained observations support 1/3/7/14/30/60/90/180 days and custom date ranges; lookback selectors do not create unavailable older data.

Web OAuth mode is fail closed unless all server credentials and an allowlisted GitHub login are configured. Local development bypass requires a loopback Host, no forwarding headers and non-production runtime, with listener bound 127.0.0.1. Production local bypass is always denied. Local mode must never be placed behind a reverse proxy. Mutations require same-origin POST and database rate limiting. Source URLs for labels are validated, stored and linked, never server-fetched. CSV values are formula-escaped. Protected data is no-store/noindex; sitemap contains no private routes. No public deployment was created.

Serverless web may use pooled Neon URL; worker/migrations use direct session connection DATABASE_URL_WORKER (advisory locks require session affinity). Continuously running worker never runs in Vercel serverless or a browser tab.

Paper entries/exits and forward outcomes require persisted Alpha fullDepth observations with provider time and enough displayed top-level size. Missing books never become assumed candle fills. These are conditional simulations, not execution guarantees. Six migrations include observed book evidence storage and typed-JSON/exact-response provenance.

All raw SQL JSONB writes use jsonParam, preserving structured objects across repeated calls; source_responses.raw_text retains exact provider bytes alongside parsed payload and SHA-256.
