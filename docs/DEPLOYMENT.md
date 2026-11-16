# Production deployment

Verified 2026-11-16. Production: **https://flownix.xyz**. Existing Vercel project: `sopskistars-projects/flownix`, linked to `sopskistar/Flownix`, production branch `main`. The temporary `flownix-theta.vercel.app` alias is not the canonical authentication origin. No replacement database or duplicate project was created.

## Vercel settings

| Setting                              | Value                                 |
| ------------------------------------ | ------------------------------------- |
| Framework                            | Next.js                               |
| Root Directory                       | `apps/web`                            |
| Include files outside Root Directory | Enabled (shared packages and scripts) |
| Node                                 | `22.x`                                |
| Install                              | `pnpm install --frozen-lockfile`      |
| Build                                | `pnpm run build`                      |
| Output                               | `.next`                               |

`apps/web/vercel.json` declares the application build settings. The project runtime was corrected from Node 26 to Node 22. Root `packageManager` selects pnpm 11.21.0. Upload exclusions keep `.env*`, build/test artifacts and local dependencies out of CLI deployments. `.vercel/` and environment files are Git-ignored. Do not upload local development credentials.

## Production environment

Configure these **server-side, Production-only** variables in Vercel. None use `NEXT_PUBLIC_`.

| Variable                                   | Purpose                                                                      |
| ------------------------------------------ | ---------------------------------------------------------------------------- |
| `ACCESS_MODE=oauth`                        | Required remote access mode                                                  |
| `GITHUB_ALLOWED_LOGIN=sopskistar`          | One exact GitHub account                                                     |
| `NEXTAUTH_URL=https://flownix.xyz`         | Canonical HTTPS origin                                                       |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | Existing GitHub OAuth app                                                    |
| `NEXTAUTH_SECRET`                          | Strong generated session secret; preserve across releases                    |
| `DATABASE_URL`                             | Existing Neon pooled connection                                              |
| `DATABASE_URL_WORKER`                      | Same database, direct connection, mapped from Neon's `DATABASE_URL_UNPOOLED` |

The Neon integration's `DATABASE_URL_UNPOOLED` remains intact. The app explicitly uses `DATABASE_URL_WORKER` for migration/worker sessions. Setting that variable in Vercel **does not deploy or start a worker**. `prepare:false` is used for web database connections. Do not use a transaction pooler for the worker's session advisory lock.

All required values were securely configured without printing them. Local deployment credentials are in ignored, owner-only `.env.deploy.local`. Never commit this file. Do not rotate the session secret on each build: rotation invalidates existing sessions.

## Database release procedure

The existing six migrations were applied to the supplied direct Neon endpoint. Before changing a database, verify that pooled/direct URLs identify the same endpoint, user and database, with pooled versus direct hostnames and TLS. Preserve research records; never run reset/drop commands.

```sh
# From repository root, after securely saving the intended deployment URLs:
node --env-file=.env.deploy.local --import tsx packages/db/src/migrate.ts
pnpm db:verify write direct release-unique-probe
pnpm db:verify read direct release-unique-probe
pnpm db:verify write pooled release-unique-probe
pnpm db:verify read pooled release-unique-probe
```

Write and read commands are separate processes, verifying persistence after connection shutdown. Probes use namespaced `settings` records and do not overwrite research records. Migration execution uses the existing ledger and transaction advisory lock. Migrations are an explicit release step, not an automatic public HTTP handler or every-build side effect.

Both Neon connections passed writes and fresh-process reads with six migrations present. Earlier attempts encountered intermittent DNS/TCP timeouts; credentials and target identity were consistent, and both endpoints later connected successfully. The connection timeout now allows 20 seconds for connection establishment/Neon compute resume. This is not a guarantee that future network outages cannot occur.

The owner saved a Journal note containing “Production verification”, refreshed, signed out and back in, and found it retained. A separate read-only direct-database query confirmed exactly one matching note, first saved `2026-11-16T05:21:16.238Z`. No note contents or secrets were printed.

## Deploy and verify

Use an authenticated Vercel CLI and link **the existing project** from repository root:

```sh
vercel link --yes --scope sopskistars-projects --project flownix
vercel deploy --prod --yes --scope sopskistars-projects
```

The existing cached CLI can be reused if `vercel` is not on PATH; do not install redundant versions. GitHub integration also deploys `main` pushes. Environment changes require a new deployment. Never change `ACCESS_MODE` to local to expose production.

Initial verified deployment: `dpl_3Uo27zLSUWkNJ57tXeuYx1Q1r9cU`, Ready, aliased to `https://flownix.xyz`. Subsequent delivery revision/deployment identifiers are reported in the final delivery and Vercel/GitHub history.

Vercel reports the domain correctly configured with no conflicts; Google's public resolver returned `216.198.79.1`. HTTPS requests and Chromium navigation succeeded with certificate validation enabled. `www.flownix.xyz` is configured to redirect to the apex. DNS was intermittently unavailable from this environment before succeeding; do not change working DNS solely on a transient local resolver failure.

```sh
CHROME_PATH=/path/to/chrome node --env-file=.env.deploy.local scripts/production-smoke.mjs
vercel inspect flownix.xyz --scope sopskistars-projects
vercel logs --environment production --query 'level:error' --since 30m --json
```

The smoke test checks login, protected routes/APIs, RSC redirects, invalid sessions, OAuth handoff, secure cookies, supplied-secret absence in public responses, and responsive login screenshots. It never manufactures an authenticated session. An intentionally invalid cookie may produce NextAuth's expected JWT decryption warning/error; distinguish this negative test from unexpected runtime failures.

The owner verified real GitHub login, Radar/navigation, Journal persistence, logout denial and reauthentication. A second-account OAuth rejection remains a manual check; the exact allowlist is enforced in sign-in and session authorization and covered by deterministic tests. See [AUTH_SETUP.md](AUTH_SETUP.md) and [TESTING.md](TESTING.md).

## Worker and coverage

Vercel hosts web only. **No production collector has been started.** Keep Data Health's worker-offline and unverified-market states visible. See [OPERATIONS.md](OPERATIONS.md) for a local or future persistent worker. Official Alpha universe count remains unverified; production stored tokens/transfers/signals are all zero. Deployment success does not establish live research coverage.

Official references checked for this release: [Vercel monorepos](https://vercel.com/docs/monorepos), [project configuration](https://vercel.com/docs/project-configuration), [environment variables](https://vercel.com/docs/environment-variables), [Neon pooling](https://neon.com/docs/connect/connection-pooling).
