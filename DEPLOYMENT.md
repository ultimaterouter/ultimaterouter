# Ultimate Router — Deployment Guide (GitHub + Railway + Cloudflare Pages)

Target architecture: GitHub (source) → Railway (Express API + PostgreSQL) → Cloudflare Pages (React/Vite SPA).
The browser talks directly to the Railway HTTPS API. **No backend, database, or Cloudflare Worker runs in Pages.**

## 0. Why there is no `railway.json`

Railway's official docs (checked 2026-11-24) state that **Config as Code (`railway.json` / `railway.toml`) is deprecated**:
existing files stop being read on **2026-12-01**, and **new services cannot opt into it**. Therefore this repository does
not ship a `railway.json` that would silently stop working. The backend is configured with a root `Dockerfile` plus
service settings in the Railway dashboard (or, later, Railway Infrastructure as Code via `.railway/railway.ts`,
applied with the Railway CLI). All required dashboard values are listed below.

## 1. Repository layout constraints

- `package.json`, `package-lock.json` and `Dockerfile` are at the **repository root**.
- Railway **Root Directory must be `/`** (not `/apps/backend`) so npm workspaces and the lockfile are visible.
- Docker build context is the repository root. The Dockerfile copies workspace manifests, runs `npm ci`, then copies
  only backend source into the runtime image.
- Runtime starts with `node scripts/start-backend.mjs` (same as `npm run start:backend`), which validates
  configuration, then binds the API to `0.0.0.0:$PORT`.

## 2. Railway setup (do this in the dashboard)

1. Create a Railway project → **Empty project**.
2. Add service **Database → PostgreSQL**. Wait until it reports ready.
3. Add service **Empty Service**, name it `ultimate-router-api`.
4. Service **Settings → Source → Connect Repo** and choose the GitHub repository.
5. **Settings → Source → Root Directory**: `/` (repository root).
6. **Settings → Build**: Railway auto-detects the root `Dockerfile`. If you must set it manually, use
   `Dockerfile` with build context `/`. Do **not** set a Railpack build command.
7. **Settings → Deploy → Start Command**: `npm run start:backend`
8. **Settings → Deploy → Pre-Deploy Command**: `npm run db:migrate`
   (idempotent, additive-only migration; it never drops tables or resets data).
9. **Settings → Deploy → Healthcheck Path**: `/health/ready` (checks DB connectivity), timeout `300` seconds.
   `/health/live` is available for liveness-only checks.
10. **Settings → Networking → Public Networking → Generate Domain**. Copy the generated
    `https://<service>.up.railway.app` URL; it becomes `VITE_API_URL` and `CORS_ORIGIN` on Cloudflare/Railway.
11. Deploy. Check logs: `Ultimate Router API starting on 0.0.0.0:<port>`.
12. Verify `https://<service>.up.railway.app/health/live` → `{"status":"ok"}` and
    `/health/ready` → `{"status":"ready","database":"connected"}`.

### Railway environment variables (backend service only)

| Variable | Where it comes from | Purpose |
| --- | --- | --- |
| `NODE_ENV` | Set manually: `production` | Enables production CORS/SSL defaults |
| `PORT` | Injected by Railway | Listen port; do not hardcode |
| `DATABASE_URL` | Add reference `${{Postgres.DATABASE_URL}}` | PostgreSQL connection (never paste a password) |
| `DATABASE_SSL` | Set manually: `require` | TLS for Railway PostgreSQL |
| `CORS_ORIGIN` | Set manually: exact Pages origin | Allows only your frontend domain; comma-separated for multiple exact origins |

Never put provider API keys, JWT secrets, or database passwords in `Dockerfile`, source, or frontend variables.
If future features need JWT/provider secrets, add them **only** to this Railway service's Variables tab.

### Migration behaviour

`npm run db:migrate` creates `schema_migrations` if needed, takes a PostgreSQL advisory lock, and applies
`001_initial.sql` only once. All statements are `CREATE ... IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS`.
There is no `DROP`, `TRUNCATE`, `DELETE`, or reset. It is safe to run on every deploy.

## 3. Cloudflare Pages setup

1. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git** → select the same GitHub repository.
2. Build settings:
   - Production branch: `main`
   - Root directory: `/` (repository root)
   - Build command: `npm run build`
   - Build output directory: `apps/web/dist`
3. **Settings → Environment variables** (Production, and Preview if desired):
   - `VITE_API_URL` = the Railway domain from step 2.10, e.g. `https://<service>.up.railway.app` (no trailing slash).
   - This is a **build-time** variable: after changing it, trigger a new Pages build.
4. Ensure no `404.html` exists at the site root; `apps/web/public/_redirects` contains
   `/*  /index.html  200`, which Vite copies into `apps/web/dist/_redirects`. Direct visits and refreshes on
   client-side routes therefore return `index.html` with HTTP 200.
5. Deploy and verify:
   - `https://<project>.pages.dev/` loads and shows API status **Online** / DB status **Connected**.
   - Open a non-root client route directly and refresh it — no 404.
   - Browser devtools → Network → API requests use the Railway HTTPS domain, never `localhost`.
6. Optional: add a custom domain under **Settings → Custom domains**, then add that exact origin to Railway's
   `CORS_ORIGIN` list. No Cloudflare Worker is required for this architecture.

## 4. GitHub readiness

- Commit source, `package.json`, `package-lock.json`, Docker/deployment files, and docs.
- Excluded by `.gitignore`: `node_modules/`, `dist/`, `.env`, `.env.*`, local overrides, coverage, test reports,
  `.railway/`, `.wrangler/`, keys/certificates, logs. `.env.example` is intentionally included and contains no secrets.
- Local `docker-compose.yml` is preserved for Windows development. Do not run `docker compose down -v` unless you
  intend to delete the local database volume.
- No `git init`, commit, remote change, or push was performed by the setup work. Those remain your explicit actions.

## 5. Local validation commands

```bash
npm ci                       # or npm install to refresh the lockfile
npm test                     # backend tests
npm run build                # frontend production build
test -f apps/web/dist/_redirects
grep -R "localhost" apps/web/dist || true   # must find no production API URL
node scripts/start-backend.mjs              # with local .env; expects DATABASE_URL
```

Docker build (when Docker is available), from the repository root:

```bash
docker build -t ultimate-router-backend .
```

Deployment itself is only verified after you complete the dashboard steps and check the live URLs.
