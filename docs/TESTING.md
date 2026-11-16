# Verification

Final build session: 2026-11-15 local (America/New_York); final database evidence snapshot 2026-11-16 02:41 UTC. All claims below distinguish code/fixture checks from live provider acceptance.

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
- `pnpm test`: **33 passing tests across four files** with PostgreSQL configured. Without DATABASE_URL the one database test is explicitly skipped; the 32 core/provider tests remain deterministic and offline.
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

## Visual QA

Actual rendered screenshots were captured and opened at 1440px desktop, 820px tablet and 390px phone; dark/light desktop, Settings, Alerts, Journal, Performance Lab, Wallet Detective, Cluster Intelligence, Exchange Rotation and Runner Lab were also inspected. Artifacts are under ignored `artifacts/screenshots/`. Brand PNGs were rendered from original SVGs and the social preview was inspected.

A fresh Impeccable finish reviewer approved **shipping the provider-unavailable foundation**, with no material visual blocker. Its selected-alert-filter refinement was implemented and recaptured. This review does not pass live-data acceptance. Populated tables, real chart overlays and longitudinal wallet patterns cannot be visually certified without observed data.

Impeccable's static detector returned no primary findings. Hallmark's static scan returned **0 FAIL, 33 REFLEX, 0 WARN**: the off-grid compact terminal spacing is explicitly waived in CSS to preserve 44px targets and readable dense rows. Its standalone render tier was not used; actual rendering/interaction evidence comes from Playwright screenshots and inspection. No blanket WCAG or screen-reader certification is claimed.
