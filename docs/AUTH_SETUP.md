# Private GitHub authentication

Production uses the existing NextAuth v4 GitHub provider and JWT sessions, with exactly one allowed account: **sopskistar**. There is no public registration. Production local mode is denied. The original UI and authentication architecture are preserved.

## Existing production app

The owner created a GitHub OAuth application with:

- Homepage: `https://flownix.xyz`
- Authorization callback: `https://flownix.xyz/api/auth/callback/github`

Credentials, a generated strong session secret, `ACCESS_MODE=oauth`, `GITHUB_ALLOWED_LOGIN=sopskistar`, and `NEXTAUTH_URL=https://flownix.xyz` are configured in Vercel Production. Secrets stay server-side. The callback path is implemented by `apps/web/app/api/auth/[...nextauth]/route.ts`.

## Beginner setup if recreating the OAuth app becomes necessary

1. Sign in to GitHub as the owner. Open Settings → Developer settings → OAuth Apps → New OAuth App, or [the registration page](https://github.com/settings/applications/new).
2. Enter application name **Flownix** and Homepage URL **https://flownix.xyz**. The description can say “Private independent Binance Alpha research.”
3. Set Authorization callback URL to **https://flownix.xyz/api/auth/callback/github**. Register the application.
4. Copy the Client ID into `GITHUB_CLIENT_ID`. Generate a client secret and save it as `GITHUB_CLIENT_SECRET` in secure server configuration. GitHub only shows a newly generated secret for copying; never put it in chat, Git, browser code, or screenshots.
5. Set the production environment variables listed in [DEPLOYMENT.md](DEPLOYMENT.md). Generate a cryptographically random session secret at least 32 characters long and save it once as `NEXTAUTH_SECRET`; do not reuse the GitHub client secret.
6. Redeploy. Open `https://flownix.xyz/login`, choose **Continue with GitHub**, and authorize using `sopskistar`.

Keep development OAuth configuration separate if needed. Do not repoint the permanent production callback to a temporary deployment URL. Vercel authentication/integration credentials do not replace a GitHub OAuth application.

## Enforcement and lifecycle

The shared policy requires all OAuth variables, a valid HTTPS origin in production, a strong session secret, and one valid allowed-login value. Missing/invalid configuration presents a locked setup message naming variables only; the auth endpoint returns a redacted 503. It does not open private data.

Sign-in reads the GitHub provider's verified profile login and compares the exact login case-insensitively. Partial usernames and other accounts are rejected. The resulting signed JWT carries the login. Every private page and data API checks both a valid session and the configured account. Forwarded/Host headers cannot enable the local bypass in production.

The sign-in control uses NextAuth's CSRF-protected `signIn("github")` POST. A direct GET link to `/api/auth/signin/github` was corrected because custom sign-in pages could loop back without starting GitHub authorization. Sign-out uses NextAuth's CSRF-protected `signOut`. Production auth cookies are Secure; CSRF/state cookies are HttpOnly. Sessions last up to eight hours. Logout clears this browser's session cookie; stateless JWTs do not implement a separate server-side per-token revocation list.

Settings is intentionally available through **Data Health → `/settings`**, titled **Settings & Data Health**. No separate Settings navigation item is needed.

## Verified versus manual security checks

| Check                                                | Evidence/status                                                                                                                         |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Real allowed-account sign-in and dashboard           | Owner confirmed on production                                                                                                           |
| Refresh and sign-in again preserve Journal           | Owner confirmed; matching note independently found in production Neon                                                                   |
| Sign-out then `/journal` requires login              | Owner confirmed; fresh anonymous browser requests independently denied                                                                  |
| Private pages, direct APIs and Journal RSC           | Automated checks against actual production                                                                                              |
| Invalid/unsigned cookie and spoofed loopback headers | Automated production denial checks                                                                                                      |
| Reject other GitHub login                            | Shared server policy and deterministic tests pass; real second-account OAuth attempt **not performed**                                  |
| CSRF/state and session handling                      | NextAuth implementation; real OAuth handoff/cookies checked, not a full protocol penetration test                                       |
| Secret exposure                                      | Supplied server-secret values absent from inspected public login HTML/JS/JSON; no blanket certification of every authenticated response |

For the remaining manual test, use a separate browser profile/private window signed into a different GitHub account. Open Flownix, complete GitHub authorization, and confirm denial with no dashboard or private API access. Then sign in as the owner in the normal profile to confirm continued access. No second account or authorization is fabricated by automation.

Read-only public routes are login, privacy, framework static assets and noindex metadata. `/api/auth/*` exposes the minimal protocol endpoints needed for sign-in; anonymous session responses contain no private user/session data. `/api/actions` and `/api/export` require authorization. Authenticated mutations additionally require the canonical same-origin header and a database-backed mutation rate limit.

Official sources: [GitHub OAuth app registration](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app), [NextAuth v4 GitHub provider](https://next-auth.js.org/providers/github), [NextAuth deployment](https://next-auth.js.org/deployment).
