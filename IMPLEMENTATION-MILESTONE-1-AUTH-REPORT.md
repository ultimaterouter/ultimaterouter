# Implementation Milestone 1 — Authentication Foundation

Status: **IMPLEMENTED IN SOURCE, NOT VERIFIED END-TO-END IN PRODUCTION**

## Commit history

| Item | SHA |
| --- | --- |
| Baseline before implementation | `ba049f25e97f24b8b5bf85b75fb6c59d9b2fb08f` |
| Implementation commit | `3bcbf6f3e5ac92dcf9d63bc06310020ee6887774` |
| Commit message | `feat(auth): implement production authentication foundation` |

`origin/main` was not touched (`bda11d9c406a434c1445aa99fa624245749c3b3b`). No force push was used.

## Files created

- `apps/backend/src/auth.js` — auth routes, hashing, sessions, cookies, rate limiting, generic errors
- `apps/backend/migrations/002_auth.sql` — additive auth schema
- `apps/backend/test/auth.test.js` — backend auth integration tests
- `apps/web/src/api.js` — credentialed API client
- `apps/web/src/auth/AuthContext.jsx` — session state and restoration
- `apps/web/src/auth/ProtectedRoute.jsx` — protected route guard
- `apps/web/src/pages/AuthPages.jsx` — login and register pages
- `apps/web/src/pages/AppPages.jsx` — landing, overview, protected placeholders

## Files changed

- `apps/backend/src/app.js` — injectable pool, credentialed CORS, auth routes, `/api/v1/account`
- `apps/backend/src/db/migrate.js` — applies all sorted migrations, not only `001_initial.sql`
- `apps/backend/package.json` — added `bcryptjs`
- `apps/web/package.json` — added `react-router-dom`
- `apps/web/src/main.jsx` — router, auth provider, protected routes
- `apps/web/src/style.css` — premium dark glass auth UI styles
- `package.json` / `package-lock.json` — added `bcryptjs`, `react-router-dom`, `pg-mem` (test only)
- `README.md` / `DEPLOYMENT.md` — auth scope, session design, migration behaviour

## Database migration

`002_auth.sql` is additive only:

- Adds `app_users.email_normalized`, backfills `lower(email)`, creates a unique index
- Adds `app_users.display_name`
- Adds `auth_sessions` with hashed token id, user id, expiry, revocation timestamp
- Adds `email_verification_tokens` with hashed token, expiry, and used timestamp

No `DROP`, `TRUNCATE`, `DELETE`, or reset. Existing `001_initial.sql` is unchanged. The migration runner is idempotent and remains guarded by a PostgreSQL advisory lock.

## API endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/v1/auth/register` | Create user, hash password, create session and verification token |
| POST | `/api/v1/auth/login` | Verify password, create server-side session |
| POST | `/api/v1/auth/logout` | Revoke session in database and clear cookie |
| GET | `/api/v1/auth/me` | Restore/verify current user from session cookie |
| POST | `/api/v1/auth/verify-email` | Consume verification token and mark email verified |
| POST | `/api/v1/auth/resend-verification` | Generic 202; provider delivery not yet implemented |
| GET | `/api/v1/account` | Protected example using backend-derived identity |

## Authentication and session design

- Password hashing: bcrypt, cost factor 12 (`bcryptjs`, no plaintext storage).
- Session token: 32 random bytes sent only in an HttpOnly cookie; only SHA-256 hash stored in PostgreSQL.
- Production cookie: `Secure`, `HttpOnly`, `SameSite=None`, `Path=/`, 7 days. Local development uses `SameSite=Lax` without `Secure` so Windows localhost still works.
- Cross-site trade-off: Workers (`*.workers.dev`) and Railway (`*.up.railway.app`) are different sites, so `SameSite=None; Secure` is required. Browsers that block third-party cookies (notably Safari ITP) may not retain the cookie. The safe remedy is same-site custom domains or a same-site proxy arrangement — **not** `localStorage` tokens.
- CORS: exact origins only, `credentials: true`, no wildcard in production. `X-Requested-With: XMLHttpRequest` is required for state-changing auth requests as CSRF defence.
- Rate limits (in-process): register 5/15m, login 8/15m, verify 10/15m, resend 5/1h. A shared store is needed if Railway scales to multiple replicas.
- Generic authentication errors prevent account enumeration. Role is always `user` on public registration; header/body identity and role claims are ignored.

## Security controls

- No plaintext password, password hash, session token, API key, or `DATABASE_URL` is returned or logged.
- Verification token is returned only outside production because no email provider is configured.
- Email delivery is not faked: production must configure a provider before verification links are usable.
- Unverified accounts can sign in but are marked `emailVerified: false`; this policy is documented.
- Migration is additive and safe under Railway pre-deploy.

## Test results

| Check | Result |
| --- | --- |
| `npm ci` in clean checkout | PASS — 272 packages |
| `npm test` | PASS — 12/12 tests, 0 fail |
| `npm run build` | PASS — Vite 6.4.6, auth bundle produced |
| `npx wrangler deploy --dry-run` | PASS — 4 asset files read from `apps/web/dist` |
| Migration safety scan | PASS — no destructive SQL statements |
| Lockfile consistency | PASS — lockfileVersion 3 |
| Secret scan | PASS — no credential patterns |
| Browser console on production UI | PASS — no uncaught JS errors observed |

Backend tests cover registration, duplicate rejection, bcrypt storage, correct/wrong password, unverified policy, session restore, logout invalidation, protected endpoint, role escalation, header spoofing, rate limiting, and CORS credentials.

## Browser E2E on production

Production frontend: `https://ultimaterouter.ultimaterouter.workers.dev`

| Flow | Result | Evidence |
| --- | --- | --- |
| Landing page renders new auth UI | PASS | New JS bundle contains auth endpoints; page loads |
| Protected route without session | PASS | `/projects` redirected to `/login` |
| Client-side empty-form validation | PASS | “Email and password are required.” |
| Register form submission | FAIL (blocked) | POST to `/api/v1/auth/register` captured; production API returned 404, UI showed network error |
| Login submission | FAIL (blocked) | POST to `/api/v1/auth/login` captured; production API returned 404 |
| Session restoration | FAIL (blocked) | `/api/v1/auth/me` returned 404 on production |
| Logout | NOT TESTED | No server session could be created |
| Session persistence after reload | NOT TESTED | Blocked by missing backend deployment |
| Protected data loading | NOT TESTED | Blocked by missing backend deployment |

No test password, cookie, token, or secret was printed in test output.

## Deployment status and blocker

- Cloudflare Workers: new frontend bundle is live. The GitHub check-run was still `in_progress` at report time, so no claim of check-run completion is made.
- Railway backend: **NOT deployed**. GitHub status for the implementation commit says `No deployment needed - watched paths not modified`. `GET /api/v1/auth/me` still returns 404 and `/api/v1` still reports `status: foundation`.
- Root cause evidence: source and tests are correct locally, Cloudflare received the commit, but Railway did not build/deploy the changed backend from branch `rebuild`. The Railway GitHub integration is most likely watching a different branch/path configuration.
- Required operator action: in Railway, set the backend service source branch to **`rebuild`**, Root Directory `/`, confirm pre-deploy command `npm run db:migrate`, then trigger a deploy. No Railway configuration was changed from this session.

## Environment variables

No new required variable was introduced. Existing names:

- Railway: `NODE_ENV`, `PORT`, `DATABASE_URL`, `DATABASE_SSL`, `CORS_ORIGIN`
- Cloudflare Workers Builds (build-time): `VITE_API_URL`

`CORS_ORIGIN` must include `https://ultimaterouter.ultimaterouter.workers.dev`. No value was requested, displayed, or stored here.

## What is genuinely working

- Authentication source code, migration, and automated backend tests
- Frontend auth UI, protected routing, client validation, credentialed API client
- Production frontend delivery and CORS preflight for auth requests

## Still BLOCKED / NOT TESTED

- Real register, login, logout, session persistence, and backend authorization in production
- Email verification delivery (provider not configured)
- All Milestone 2 product features

Milestone 1 is **not** complete until Railway deploys the backend, `002_auth.sql` is applied, and the E2E register → reload → logout flow passes against production.

## Milestone 2 recommendation

After Milestone 1 is verified, implement the Dashboard and Projects CRUD: add authenticated project endpoints with server-side ownership checks, then wire the protected `/overview` and `/projects` pages to real data with regression tests. Do not begin Milestone 2 before the auth E2E flow above passes.
