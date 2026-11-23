# Universe Ledger continuation — 2026-11-23

Recovered clean local HEAD `1279d126adbeb7eaa1f58fc51884129afcb50256`; fetched `origin/main` matched exactly. The earlier operational, historical Futures/cohort, wallet/cluster, strategy, paper and Rally Intelligence implementation and data are preserved. No migration, shared database query, provider collection, authentication setting, paid service or billing change is required for this refinement.

## Delivered

- Removed the Alpha identity header/cells from the shared Radar presentation. Nine columns remain in the requested order. Membership remains visible with observations and mobile evidence. Alpha IDs remain in the database/API, exact identity matching, ingestion and client search.
- Fresh Alpha Radar views default to **24h Change — Highest First** using existing `change_24h`. Deliberate URL sorting survives ordinary search/filters and history navigation; existing `cap`/`liquidity` URLs retain their meaning. Watchlist's existing longest-observation default is preserved.
- Both directions are available for change, market cap, liquidity and quote volume, alongside existing name, longest-observation and unresolved-activity options. No duplicate options.
- Decimal comparisons preserve ordering beyond floating-point precision. Null, empty, whitespace, nonnumeric, nonfinite and unsupported numeric strings remain unavailable and sort last in either direction. Equal observations use exact token-ID ordering, including unavailable ties. No missing percentage is displayed as zero or a fabricated percentage.
- Filtering and sorting precede the existing 30-row pagination. Client controls reuse already-loaded data; watch mutations still refresh their saved database state. Token links, portraits/network badges, filters, timestamps and research evidence remain.
- Existing registry/collector/ticker freshness warnings are preserved. Stale values remain stale when ordered by percentage; no market observations were generated to populate the interface.

The existing graphite workbench, responsive table/phone rows and native controls are retained. The sort control receives enough width for understandable labels. Reference checks were limited to relevant table patterns: [GOV.UK](https://design-system.service.gov.uk/components/table/) numeric alignment, [USWDS](https://designsystem.digital.gov/components/table/) accessible scrolling/sorting, and [Carbon](https://www.carbondesignsystem.com/building-blocks/core/components/data-table/guidelines) table toolbar and progressive disclosure. No templates, assets or new visual system were introduced.

## Verification

**150 automated tests across 24 files** pass, including PostgreSQL integration. **Eight authenticated local Playwright journeys** pass. The new Ledger journey uses clearly labelled local-only fixtures, exercises all eight numeric sort directions, a second page, ties/missing values, Alpha ID search, combined network/classification/stage/membership/cap filters, empty state, zero filter-triggered workspace RSC requests, token links, a real Save/Saved mutation and stale-data labels. Fixtures are removed and existing local settings restored. Production fixtures were never inserted.

Desktop (1440×1000), tablet (820×1180) and phone (390×844) screenshots were captured and inspected. Table headers match the nine cells, percentage labels and native controls remain readable, and no document overflow was observed. Internal labelled table scrolling and the existing compact phone rows remain. The loading state is unchanged and has no table column-span dependency; the empty table has the correct header count. Typecheck, lint, `git diff --check` and the production build are release checks. Screenshots are ignored local artifacts under `artifacts/screenshots/ledger-*`.

## Recovered OAuth investigation

Saved `/tmp/flownix-phase-production-final.log` and `production-recheck.log` show a 30-second wait for a GitHub authorization request. The latter recorded NextAuth `/_log` then `/error`, so this was not evidence of a successfully completed OAuth handoff. The isolated fresh-browser log records providers, CSRF and sign-in all returning 200, a GitHub authorization request and a secure state cookie. The later full `auth-diagnostic.log` also completed successfully.

Thus a persistent authentication configuration defect was **not reproduced**, and the original timeout's exact cause is not conclusively established. This continuation additionally encountered a browser navigation failure before reaching the login page. Transport/browser instability is observed; attributing every earlier timeout to it would exceed the evidence. Authentication configuration remains unchanged.

The production smoke script now records safe endpoint/status/timing and failed-request transport diagnostics on failures, including initial navigation, without query strings, bodies or cookie/state values. This distinguishes future transport failures from a missing redirect. A normal handoff remains a separate check from the owner's completed session. No owner-authenticated production journey is claimed.

Exact owner check: open `https://flownix.xyz/login` in the owner's normal browser, choose **Continue with GitHub**, sign in as the allowed owner, return to Alpha Radar, verify the fresh default sort and open a token/perform a Save action. No session is manufactured by tests.

Operational blockers remain those in [the preserved acceptance runbook](OPERATIONAL_ACCEPTANCE_2026-11-23.md): paid worker/database capacity approval and account quota reconciliation, a full hosted cycle/soak, incomplete continuous chain-time history and Sui/TRON adapters. This frontend release does not claim to solve those or restart monitoring.
