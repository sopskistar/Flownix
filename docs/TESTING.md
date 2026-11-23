# Operational and historical verification — 2026-11-23

The continuation from `a6d0f6a` passes **139 automated tests in 23 files**, including PostgreSQL integration, and **seven authenticated local browser journeys**. Typecheck, lint, production build and worker Docker build pass. New regression coverage includes recent samples preserving historical cursors/gaps, request policy fail-closed behavior, independent optional workload budgets, seven-network fairness, exact listing identity, incomplete/conflicting candles, actual trade-bar evidence, pre-admission/amendment/availability suppression, chronological listing counterexamples, peak versus closing outcomes, immutable study/case annotation storage, and a seeded browser case for native versus malformed study JSON.

The real CLI replay additionally verifies native-object storage through the executing transaction's JSON serializer; local bundled tests alone did not expose the original CLI encoding defect. Malformed earlier runs remain exportable and structurally invalid rows do not crash the historical view. Browser fixtures run only against local PostgreSQL and are removed afterward.

See [operational acceptance](OPERATIONAL_ACCEPTANCE_2026-11-23.md), [actual study](FUTURES_LISTING_STUDY_2026-11-23.md) and [machine evidence](OPERATIONAL_EVIDENCE_2026-11-23.json). Hosted full-cycle/24-hour acceptance and a fresh authenticated production owner journey remain unverified. No paid worker was activated. Dated verification below is preserved.

# Latest account-recovery verification

See [ACCOUNT_RECOVERY_RELEASE_2026-11-21.md](ACCOUNT_RECOVERY_RELEASE_2026-11-21.md) for preserved work, the 107-test result, browser history regression, driver backport, live evidence and remaining operational gates. Older snapshots below retain their original dates.

# Recovery verification — 2026-11-21

The recovery continuation passed 98 tests in 12 files on Node 22, including local PostgreSQL rollback integration. Both database integration cases additionally passed against the existing Neon target with isolated rollback schemas. Regression coverage includes real lease claiming/recovery, retry admission, market batch rotation beyond its cap, immediate newly active pairs, atomic provenance/coverage rollback, a two-consumer market bound, Solana newest-signature checkpoints, shared-transaction deduplication, unavailable metadata, slot validation and per-account gaps. Synthetic test rows never commit to the research schema.

Final release/browser results and measured live limitations are recorded in [the acceptance continuation](LOCAL_AUTOMATIC_ACCEPTANCE_2026-11-21.md). Browser readiness checks the public privacy route on owned port 3047. Tests wait for interactive Radar controls, capture runtime/hydration errors, verify that local filters avoid an RSC refetch, and capture responsive viewports. Cold compilation has a separate 240-second readiness allowance on a heavily loaded shared machine. These timing allowances do not substitute for passed application assertions.

# Verification

## Full-universe scheduler verification update (2026-11-18 UTC)

- `pnpm typecheck`, `pnpm lint`, `pnpm test` (66 tests across six files, including an isolated PostgreSQL test scheduling 251 identities across three 100-item batches), and production `pnpm build` passed. Build and DB integration needed an approved unsandboxed run because child-process and localhost database access are denied by the default sandbox.
- Additive migrations `0012_solana_coverage.sql` and `0013_investigation_queue.sql` were applied to the verified existing Neon `neondb`; a post-migration query confirmed all 13 migrations, 686 identities and 180 canonical transfers remained.
- `pnpm worker:schedule` reconciled 358/358 currently online tokens on EVM/Solana-supported chains (Ethereum 19, BSC 289, Base 26, Arbitrum 2, Solana 22). This created/resynchronized jobs only; it did not start the collector. All 358 were due while the worker was offline; 14 old jobs were retrying (11 403, 2 429, 1 timeout). Market state was 0 fresh, 317 stale, 62 no-pair.
- Live Alchemy BSC and Base point probes passed head, confirmed block, contract code/decimals, historical block, historical `balanceOf`, and ten-block logs. Those two token-specific samples had no logs. A separate BSC receipt/log/block check validated one pre-existing stored event (UB, tx `0xb2edaad4fd46545aed097b0c829ac9913a8a576a71f782e8d2b48dafedb2f9f9`, block 133958666, log 105). No new canonical transfer or signal was created.
- Ethereum, Arbitrum and Solana diagnostics fail fast because their endpoint variables are not set in `.env.worker.local`. Solana implementation remains partial top-account sampling, not full ledger coverage. All five chain families have scheduling entries but live provider configuration/coverage is not complete.
- The scanner clamps Alchemy `eth_getLogs` windows to ten blocks. This respects documented free-tier range limits but does not prove the collector can keep a token cursor near chain head at full-universe scale. Per-token backlog/latency must be measured when a persistent worker is intentionally started.
- The existing four Playwright browser journeys passed on 2026-11-18, including Data Health navigation and responsive phone/tablet layouts. These are local browser checks, not proof that this unpushed revision is deployed.

## Earlier Phase 2 verification (2026-11-16–17 UTC)

- Earlier run: 65 tests across six files passed. The latest 66-test run above supersedes this count. Tests use synthetic observations only in isolated fixtures; no synthetic data enters production.
- Typecheck, lint and production Next build passed. Initial sandbox runs could not access local PostgreSQL or spawn Next's TypeScript configuration; approved reruns outside it passed.
- **Four browser journeys passed** using installed Chromium via CHROME_PATH. These cover responsive/reduced-motion navigation, authorization, notes/in-app persistence and the modified Radar filters. No redesign or visual-QA claim is added.
- AMD64 Docker worker build succeeded; no exposed ports. Initial Docker build failed WSL DNS resolution of official npm; a local DNS-resolved `--add-host` retry preserved TLS. Native ARM64 execution remains untested. Linux host/service scripts are prepared, not remotely deployed.
- Live official registry/actual market observations, 317 active-pair Alpha ticker identities (four bounded cycles), 62 explicit no-pair identities, ETH/BSC canonical transfers, three independent receipt/log/block matches, source timestamps and persisted suppression traces verified. **Live gate remains incomplete**: replay historical RPC403, Base log429, no post-restart cursor advancement. No real reorg observed. Do not replace this failure with passing mock tests.
- Single-worker contention rejected a second collector with COLLECTOR_BUSY; separate local run wrote actual heartbeat and clean stopped state. Existing evidence/cursors survived termination/restart; failure retries resumed, but successful historical catch-up is not proven. Local 15-token profiling had provider failures; 50/100 workloads are modeled only. See WORKER_RESOURCE_MEASUREMENTS.json.

Reproduce live checks using the intended existing worker configuration:

```sh
pnpm providers:production
pnpm collection:status
pnpm worker:diagnostics
pnpm live:gate verify
pnpm live:gate replay
pnpm research:refresh
node --env-file=.env.worker.local --import tsx scripts/rpc-diagnose.ts 8453
pnpm worker:profile:report
```

Never run parallel collectors or increase token/API load to benchmark beyond free quotas. `artifacts/live/acceptance.json` is a timestamped last-run report, not an enduring live-health certificate. A dated minimal real fixture is stored in tests/fixtures/alpha-live-2026-11-16.json with parent-response hash and fixtureOnly=true; it never substitutes for the production universe. Hosted CI result must be checked on the pushed SHA; local results alone are not CI verification.

## Archived deployment-repair checks

Earlier 46-test/six-migration/zero-token numbers and unsuccessful-provider statements below describe the prior repair and are superseded above. Authentication architecture remains unchanged.

Updated for production deployment/security repair on 2026-11-16. All claims distinguish code/fixture checks, actual production checks, owner-confirmed authenticated behavior, and live provider acceptance.

## Reproduce

```sh
pnpm install --frozen-lockfile
cp .env.example .env
docker compose up -d
pnpm db:migrate
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
pnpm audit --prod --json
pnpm providers:smoke
pnpm run doctor
pnpm worker:once
```

Existing Chromium can be reused with `CHROME_PATH=/absolute/path/to/chrome pnpm test:e2e`. This session used `/home/sopski/.cache/ms-playwright/chromium-1254/chrome-linux64/chrome`; no new browser installation was needed. Otherwise install Chromium with `pnpm exec playwright install chromium` (CI installs browser OS dependencies too). Browser tests own port **3047** and assert the Flownix response header; they never reuse an arbitrary app on port 3000. The full multi-route cold-compilation journey has a 90-second timeout.

pnpm 11 reserves `doctor` as a built-in. **Use `pnpm run doctor` for Flownix's diagnostic.** A bare `pnpm doctor` checks the package manager, not Alpha data.

## Passing checks

- `pnpm typecheck`, `pnpm lint`, production `pnpm build`.
- `pnpm test`: **46 passing tests across five files** with PostgreSQL configured, including 13 production OAuth policy tests. Without DATABASE_URL the one database test is explicitly skipped; remaining tests are deterministic and offline.
- `pnpm test:e2e`: **4 passing browser journeys** covering navigation, keyboard search, URL filters, light/dark themes, phone/tablet/desktop, reduced motion, no page overflow, custom 404, remote/forwarded access denial, cross-origin mutation denial, invalid identity rejection, in-app test labels and persisted unique manual journal notes.
- Six SQL migrations applied to local PostgreSQL. Integration tests use a unique schema in a rollback transaction, so synthetic token rows never enter the real research database.
- `pnpm audit --prod --json`: **zero reported production advisories** after updating Drizzle to >=0.45.2. The initial audit caught GHSA-gpj5-g38j-94v9 and it was fixed before delivery. This is a production dependency audit, not a claim that all software is free of vulnerabilities.
- Dependency installation and pnpm supply-chain verification passed. Exact Next.js tarballs were reused from the existing npm cache and checked against registry SHA-512; no local file dependency or temporary hook remains in the committed lockfile. Only esbuild's necessary build script is allowed.

## Test coverage and limits

Core tests cover ticker collisions, chain/contract identity, case-sensitive non-EVM addresses, tokenId versus alphaId, multiple quotes/no pair, unknown/offline states, invalid/empty registry response, 450 synthetic identities and Alpha-only mapping, atomic precision, removed logs, mint/burn/self-transfer versus unknown transfer, same-entity flow exclusion, deduplicated evidence, minimum baselines and scan gaps, stale/future data and missing membership suppression, long-term purchase/retention gaps, repeated purchase evidence, missing executable-side quotes, depth size/spread/time validation, paper costs and entry delay, chronological split, CSV formula guards and fail-closed local access.

Provider mocks exercise 429 retry-after, bounded outages, permanent 403 denial, schema rejection and chain mismatch. PostgreSQL tests verify migrations, unique event IDs, cursor storage, canonical exclusion, retained removed membership and repeated nested JSONB writes. These are fixture/schema checks, not proof that a real-chain reorg was observed or that an archive provider supplies complete history.

The final screenshot inspection caught JSONB double encoding in notification payloads. All raw SQL JSON writes now use typed JSON parameters, a migration repairs development observations, and exact raw response text is stored beside structured JSON/hash. The database regression checks two successive nested-object inserts, and browser tests assert the actual test message remains labelled. Earlier browser failures from a wrong port, same-origin URL reconstruction, duplicate test-note text and cold-compilation timeout were corrected and rerun.

## Live checks that intentionally remain unsuccessful

`pnpm providers:smoke`: official registry/exchange runtime calls failed DNS/network checks. `pnpm run doctor` returns failure with database connected and official Alpha count null. `pnpm worker:once` returns 1 when registry/market jobs fail; retries are durable and unrelated due jobs finish. Final local database: **0 stored token identities, 0 canonical transfers, 0 live signals; 12 failed Alpha request attempts recorded at zero API cost.** Do not reinterpret these zero stored counts as an official universe count of zero.

No real provider fixture, three canonical tx references, live detection, remote OAuth callback, Telegram receipt, filled real-data paper experiment, populated-token investigation or statistical trading advantage was verified. No demo universe substitutes for these gaps. CI never calls live crypto APIs.

The original build's remote-OAuth limitation above is superseded by the production authentication verification below. Crypto provider/data limitations remain unresolved; no live-data ingestion was started during deployment repair.

## CI repair and production verification

The original GitHub run `43795161842` failed because a streamed loading fallback and the resolved page both used `h1`. Loading feedback now uses an accessible status paragraph with the same visual styling. The retained multi-route journey waits for each page's exact semantic heading, the loading region to disappear, and exactly one primary heading. It uses no arbitrary timeout. The first repair commit `ed55d4f092165b73ccde0ebfb2ae73db1fdf8c5c` passed real [GitHub Actions run 43799684437](https://github.com/sopskistar/Flownix/actions/runs/43799684437). Final revision CI results are reported in delivery; local success alone is not a hosted-CI claim.

Production is **https://flownix.xyz**, with OAuth enabled and the allowlisted account. Run:

```sh
CHROME_PATH=/path/to/chrome node --env-file=.env.deploy.local scripts/production-smoke.mjs
pnpm db:verify write direct release-unique-probe
pnpm db:verify read direct release-unique-probe
pnpm db:verify write pooled release-unique-probe
pnpm db:verify read pooled release-unique-probe
```

Actual production browser checks cover valid HTTPS, login 200, GitHub handoff, secure HttpOnly CSRF/state cookies, all private navigation routes requiring login, direct export/mutation API 401, anonymous session `{}`, denial of an unsigned session cookie and spoofed loopback forwarding headers, and no private Journal content in anonymous RSC. Next may encode a redirect inside an already-started RSC response with HTTP200; the test requires its NEXT_REDIRECT/login marker rather than treating HTTP200 alone as an authenticated page. Public login HTML/JS/JSON are checked for supplied server-secret values. This is a scoped leak check, not certification of every possible response or dependency.

The owner separately confirmed real GitHub sign-in as sopskistar, Radar/Watchlist/navigation, Journal writes retained after refresh and signing back in, logout followed by denied `/journal`, and reauthentication restoring access. A read-only SQL check independently confirmed the verification note in the intended production Neon database, saved at `2026-11-16T05:21:16.238Z`. Both pooled and direct SQL writes/readbacks survived closing and restarting client processes; six migrations are applied. No database reset occurred.

A real **different GitHub account** has not been used. Other-account and malformed-profile rejection are covered by shared server policy/unit tests, not a second real OAuth authorization. Authenticated populated-token/watchlist toggle/wallet evidence/paper-fill journeys remain unavailable because production contains no verified Alpha identities or live evidence. The owner verified authenticated general navigation; automated production screenshots cover login only.

Production login screenshots at 1440, 820 and390px were opened and inspected. Typography, button visibility and text wrapping remain usable with no horizontal overflow. The full local browser suite also exercised dark/light/reduced-motion layouts. No redesign or branding change was made. The initial post-login production error-log query returned no error records; invalid-cookie negative tests can intentionally generate NextAuth JWT decryption errors and must be identified as test-induced.

## Visual QA

Actual rendered screenshots were captured and opened at 1440px desktop, 820px tablet and 390px phone; dark/light desktop, Settings, Alerts, Journal, Performance Lab, Wallet Detective, Cluster Intelligence, Exchange Rotation and Runner Lab were also inspected. Artifacts are under ignored `artifacts/screenshots/`. Brand PNGs were rendered from original SVGs and the social preview was inspected.

A fresh Impeccable finish reviewer approved **shipping the provider-unavailable foundation**, with no material visual blocker. Its selected-alert-filter refinement was implemented and recaptured. This review does not pass live-data acceptance. Populated tables, real chart overlays and longitudinal wallet patterns cannot be visually certified without observed data.

Impeccable's static detector returned no primary findings. Hallmark's static scan returned **0 FAIL, 33 REFLEX, 0 WARN**: the off-grid compact terminal spacing is explicitly waived in CSS to preserve 44px targets and readable dense rows. Its standalone render tier was not used; actual rendering/interaction evidence comes from Playwright screenshots and inspection. No blanket WCAG or screen-reader certification is claimed.


## Research context verification — 2026-11-23

128 tests across 21 files pass on Node 22, including isolated PostgreSQL rollback checks for durable five-chain fairness, provider quota boundaries and atomic graph upsert/retirement. Research tests cover exact contracts, source/label timing, insufficient census data, operational exclusions, non-Latin Futures instruments, empty proof hashes, stale derivatives/social data, turnover false positives, missing liquidity and purged historical outcome overlap. Six local authenticated browser journeys passed; source-linked intake/revisions and case-sensitive Solana wallet links were exercised. Desktop/phone Token Intelligence and Wallet Intelligence screenshots were opened and inspected. Fixture records were local-only and removed afterward. See [dated evidence and limits](RESEARCH_CONTEXT_2026-11-23.md).
