# Verification

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
