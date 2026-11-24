# Cloudflare Pages Implementation Report

**Project:** FreeFirst AI — domainless staging on Cloudflare Pages + Tencent Lighthouse
**Date:** 2026-10-30
**Scope:** staging only. No production deployment, no public exposure, no purchased domain.

---

## 0. Status

| Dimension | Status |
| --- | --- |
| **Code** | **CODE READY** — proxy, routing contract, headers, tooling and docs are complete and locally verified. |
| **Cloudflare Pages** | **CLOUDFLARE DEPLOYMENT NOT TESTED** — no project was created, no upload was performed, `pages.dev` was never contacted. |
| **Tencent origin connectivity** | **TENCENT ORIGIN CONNECTIVITY NOT TESTED** — no tunnel was opened and no Lighthouse host was reached. |
| **Production** | **PRODUCTION NOT READY** — staging topology, random hostname, single VPS, no monitoring on the new path. |

Everything below marked PASS was executed in this workspace against local mocks. Nothing
marked PASS implies that Cloudflare or Tencent answered a request.

---

## 1. What was asked and what was delivered

| Task | Deliverable | State |
| --- | --- | --- |
| 1 | Inspect existing architecture; preserve behaviour | Done — findings in §3 |
| 2 | Prepare the frontend for Pages (relative `/api`, no secrets, SPA, PWA, CSP) | Done — one incompatibility found and fixed |
| 3 | `functions/api/[[path]].js` + `_routes.json` | Done |
| 4 | Document both origin-connectivity modes | Done |
| 5 | Security verification | Done — matrix in §6 |
| 6 | `scripts/cloudflare-pages-verify.mjs` with local mocks | Done — 106 assertions, exit 0 |
| 7 | `docs/CLOUDFLARE-PAGES-TENCENT-DEPLOYMENT.md` | Done |
| 8 | Constraints respected | Confirmed in §7 |
| 9 | This report | Done |

---

## 2. Files

### Created

| File | Purpose |
| --- | --- |
| `functions/api/[[path]].js` | Pages Function: same-origin `/api/*` proxy. Reads `BACKEND_ORIGIN` from `env`, forwards verbatim, streams SSE, strips hop-by-hop and forgeable identity headers, forces `no-store`, returns explicit errors. |
| `apps/frontend/public/_routes.json` | `include: ["/api", "/api/*"]`, `exclude: []` — Functions run only for the API. |
| `apps/frontend/public/_redirects` | `/*  /index.html  200` — SPA fallback, mirroring the nginx `try_files` rule. |
| `apps/frontend/public/_headers` | CSP, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, COOP, plus asset caching rules. Replaces what `deploy/nginx-freefirst.conf` provided. |
| `wrangler.toml` | `name = "freefirst-ai"`, `pages_build_output_dir = "apps/frontend/dist"`, compatibility date. Contains **no secrets**. |
| `scripts/cloudflare-pages-verify.mjs` | 106-assertion local harness: build, artefacts, routing contract, static/SPA serving, proxy semantics, SSE, cancellation, error handling, secret hygiene. |
| `docs/CLOUDFLARE-PAGES-TENCENT-DEPLOYMENT.md` | Operator runbook. |
| `docs/CLOUDFLARE-PAGES-IMPLEMENTATION-REPORT.md` | This file. |

`_routes.json`, `_redirects` and `_headers` live in `public/` on purpose: Vite copies
`public/` verbatim into `dist/`, so the routing contract ships with every build and
cannot drift from the bundle.

### Modified

| File | Change | Why |
| --- | --- | --- |
| `apps/backend/src/app.js` | Added `app.get('/api/health', ...)` immediately after `/ready` | A `/api/*`-only proxy cannot route a bare `/health`. The alias keeps `_routes.json` minimal. `/health` and `/ready` are untouched for Docker HEALTHCHECK and monitoring. |
| `apps/frontend/src/lib/api.js` | `health: () => request('/api/health', { auth: false })` | Consume the alias. All other paths were already relative. |
| `package.json` | `pages:dev`, `pages:deploy`, `verify:pages` scripts | Operator convenience; no dependency added. |
| `scripts/check-source.mjs` | Added `functions` to the parsed roots; Pages Functions are parsed through a temporary `.mjs` copy | The repo package is CommonJS, so `node --check file.js` would reject `export`. Syntax gate now covers the proxy (23 files). |
| `scripts/stage11-integration-verify.mjs` | Added F16: `/api/health` returns `ok` | Regression guard for the alias. |
| `docs/README.md` | Index entries for the two new documents | Discoverability. |

No existing file was deleted. No database schema, JWT, auth or router behaviour was changed.

---

## 3. Architecture findings (Task 1)

| Area | Finding | Consequence |
| --- | --- | --- |
| Build | `npm run build` → `vite build` → `apps/frontend/dist`; `sourcemap: false` | Matches the Direct Upload contract exactly. |
| API base | `apps/frontend/src/lib/api.js` uses `import.meta.env.VITE_API_BASE \|\| ''`, so every call is a relative `/api/...` | **No rewrite needed.** The app was already same-origin by default. |
| Dev proxy | `vite.config.js` proxies `/api` and `/health` to `localhost:3001` (dev only) | `/api/health` is covered by the existing `/api` rule. |
| SSE | `streamChat()` uses `fetch` + `response.body.getReader()`, parses `data:` frames, reads metadata from `x-router-*` headers | A streaming passthrough is sufficient; no protocol change required. |
| Auth | Bearer JWT in `localStorage` (`ff_token`), sent as `Authorization` | The proxy must forward `Authorization` untouched — verified. |
| PWA | `public/sw.js` + `public/manifest.webmanifest`, registered only when `import.meta.env.PROD` | Ships inside `dist/`; must survive deployment — verified. |
| CSP | Delivered as an **HTTP header** by `deploy/nginx-freefirst.conf`, not by a `<meta>` tag | **Gap found:** Pages would have served the app with no CSP. Fixed with `_headers`. |
| `/health` | `SettingsModal` probed `/health` | **Gap found:** unroutable behind a `/api/*`-only proxy. Fixed with the `/api/health` alias. |
| Secrets | No backend host, IP or credential in `apps/frontend/src` | Nothing to remove. |

Two real incompatibilities, both fixed additively.

---

## 4. Architecture decisions

| # | Decision | Rationale | Alternative rejected |
| --- | --- | --- | --- |
| 1 | Direct Upload instead of Git integration | No build on Cloudflare, no build-time secrets, no repo access needed. | Git-connected project would need Cloudflare to build a monorepo workspace. |
| 2 | `_routes.json` scoped to `/api` and `/api/*` | Static assets and SPA routes never invoke a Function: fewer invocations, lower cost, no cold starts on page load. | Catch-all `/*` would route every asset through the Function. |
| 3 | Routing files in `public/` | Vite copies them into `dist/` automatically; the contract cannot drift from the bundle. | A post-build copy script is one more thing to forget. |
| 4 | `BACKEND_ORIGIN` as a Pages secret, read from `env` | Never inlined into the bundle, never in `wrangler.toml`, rotatable without a rebuild. | `VITE_BACKEND_ORIGIN` would be public by definition. |
| 5 | Path forwarded verbatim | The backend keeps its existing routes; no rewrite table to maintain. | Rewriting `/api` away would break every existing client. |
| 6 | Response body passed through as a stream | SSE tokens arrive as produced; no `await response.text()` anywhere. | Buffering would defeat streaming and blow memory on long answers. |
| 7 | Request body read into a buffer | Payloads are JSON, capped at 256 kB by the backend; avoids `duplex` differences between the Workers runtime and Node. | Forwarding `request.body` directly is cheaper but runtime-sensitive. |
| 8 | Identity headers stripped inbound | `x-user-id` and friends can never be forged through the proxy, even if a future route trusted them. | Forwarding everything relies on every backend route being careful. |
| 9 | `accept-encoding` dropped inbound | The origin returns an uncompressed stream, so no intermediate layer can choose to buffer a compressed body. | Passing it through risks a buffering proxy in the path. |
| 10 | Timeouts 30 s default / 300 s for streaming | Fail fast for normal calls; allow long generations for `/api/chat`. | A single global timeout either breaks chat or hides dead origins. |
| 11 | `_headers` mirrors the container edge | CSP, nosniff and clickjacking protection must not silently disappear just because the host changed. | Relying on Cloudflare defaults would drop the app's own policy. |
| 12 | `wrangler.toml` at the repo root | One place describes the project; `functions/` is discovered next to it. | Config inside `apps/frontend` would split the contract across two directories. |

---

## 5. Verification performed

All commands were run from the repository root on Node v22.22.2 (Windows).

| # | Command | Result | Exit code |
| --- | --- | --- | --- |
| 1 | `node scripts/cloudflare-pages-verify.mjs` | **106 / 106 assertions PASS** (includes a real `npm run build`) | **0** |
| 2 | `node scripts/cloudflare-pages-verify.mjs --skip-build` | 106 / 106 PASS against the existing `dist` | **0** |
| 3 | `npm run test:backend` | 41 / 41 tests PASS | **0** |
| 4 | `npm run test:frontend` | 9 / 9 tests PASS | **0** |
| 5 | `npm run test:router` | 5 / 5 suites PASS (49 SSRF assertions) | **0** |
| 6 | `node scripts/stage11-integration-verify.mjs` | **16 / 16** PASS (was 15; +F16 `/api/health`) | **0** |
| 7 | `npm run check` | Syntax OK, **23 files** parsed (was 22; +1 Function) | **0** |

### 5.1 What the 106 assertions cover

| Group | Count | Examples |
| --- | --- | --- |
| Build & artefacts | 8 | build exit 0; `dist/index.html`; hashed JS/CSS; `sw.js`; manifest; icons; relative `/assets/` references |
| Routing contract | 18 | `_routes.json` valid and API-only; `/api`, `/api/*` invoke the Function; `/index.html`, `/assets/*`, `/settings`, `/sw.js`, `/manifest.webmanifest` do **not**; `_redirects` SPA rule; `_headers` parsed |
| Function module | 7 | imports as ESM; exports `onRequest`; origin validation (missing / malformed / plain-http / https / loopback) |
| Static + SPA + headers | 17 | `/` 200 + shell; CSP served with `default-src`, `connect-src 'self'`, `script-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`; nosniff; `X-Frame-Options: DENY`; asset immutability; SPA deep link; **Function invocations for static requests = 0** |
| Proxy forwarding | 18 | method; path not rewritten; query string byte-exact; POST body byte-exact; content-type; `Authorization`; cookie; hop-by-hop stripped (3); spoofed `x-user-id` stripped; `x-forwarded-proto`/`-host`; status passthrough; `no-store` ×2; hop-by-hop response header stripped |
| SSE | 8 | 200; `text/event-stream`; router metadata headers; not content-encoded; **incremental delivery (5 chunks, first frame at ~80 ms of a ~280 ms stream; varies per run)**; first chunk before completion; 6 frames intact; `[DONE]`; **client abort propagated to the origin** |
| Error handling & containment | 13 | missing origin → 500 `backend_origin_not_configured`; plain-http → 500 `backend_origin_insecure`; malformed → 500; unreachable → 502 `backend_unreachable`; non-`/api` → `next()`; origin never echoed; no wildcard CORS; single redacted log call; no header/body logging; response never buffered |
| Bundle secret hygiene | 7 | no `BACKEND_ORIGIN`, `trycloudflare`, `localhost:3001`, `DATABASE_URL`, `JWT_SECRET`, admin token, `postgres://` |
| Frontend integration | 4 | health uses `/api/health`; chat posts to `/api/chat`; no absolute origin; base defaults to same-origin |

### 5.2 Honest limits of the harness

The harness starts a local mock origin and a local simulator that reproduces Pages
semantics (asset resolution → `_redirects` → Function). It is a faithful model, not
Cloudflare. Specifically **not** exercised:

- Cloudflare's own header handling, compression and cache layer;
- the Workers runtime's CPU-time budget and any platform timeout;
- TLS between Pages and a tunnel;
- real `cloudflared` behaviour, including hostname rotation;
- real PostgreSQL latency, so real-world first-token timing is unknown.

---

## 6. Security verification (Task 5)

| Requirement | Evidence | Result |
| --- | --- | --- |
| Browser cannot retrieve backend secrets | Bundle scan for `BACKEND_ORIGIN`, tunnel host, DB URL, JWT secret, admin token: 7/7 absent. `BACKEND_ORIGIN` is read from `env` only. | PASS (local) |
| API cannot bypass auth | Proxy never adds, removes or rewrites `Authorization`; it is forwarded verbatim (asserted at the origin). Backend JWT middleware untouched; 41/41 backend tests still pass. | PASS (local) |
| `X-User-ID` never trusted from a browser | Proxy strips `x-user-id`, `x-userid`, `x-user`, `x-forwarded-user`, `x-auth-user`, `x-role`, `x-admin` inbound; asserted `undefined` at the origin. | PASS (local) |
| Admin authorisation is server-side | Stage 11 F9 (200 admin), F10 (403 non-admin), F11 (401 anonymous) through the same origin. | PASS (local) |
| Router internals not exposed | `services/router` trusts `x-user-id` but is never published (`docker-compose.yml` publishes only `127.0.0.1:3001` and `127.0.0.1:5173`); `/admin/*` additionally requires `x-admin-key`. | PASS (config inspection) |
| CORS not weakened | Proxy adds no `Access-Control-*` header (asserted); backend CORS policy unchanged. | PASS (local) |
| No API caching | `cache-control: no-store` + `cdn-cache-control: no-store` on every proxied response (asserted). | PASS (local) |
| SSE works through the proxy | 8 streaming assertions incl. abort propagation. | PASS (local) |
| CSP compatible | `_headers` ships the container policy; `connect-src 'self'` matches same-origin `/api`; CSP asserted on the served shell. | PASS (local) |
| No broad wildcard CORS shortcut | Grep assertion: no `access-control-allow-origin` in the Function. | PASS |
| No secret logging | Zero logs by default; the single `console.log` is behind `PROXY_LOG=1` and emits method/path/status only (asserted). | PASS |

### 6.1 Residual risk (stated, not hidden)

1. **The tunnel hostname is effectively a secret.** Anyone who learns
   `https://<random>.trycloudflare.com` can call the API directly, bypassing Pages.
   JWT and admin checks still apply, but the direct path is not what was designed.
   Mitigation: restart the tunnel to rotate the hostname; never publish the URL.
2. **`X-Forwarded-For` is rebuilt from `cf-connecting-ip`.** Direct-to-origin callers
   bypassing Pages can set anything; the backend must not treat it as identity. It
   does not — identity comes from the JWT.
3. **`trust proxy` is env-gated** (`TRUST_PROXY === 'true'`). Behind the tunnel, leave
   it off unless you actually need client IPs for rate limiting; the proxy already
   sets `x-forwarded-*` explicitly.

---

## 7. Constraint compliance (Task 8)

| Constraint | Status |
| --- | --- |
| Do not delete existing code | No deletions. `app.js`, `api.js` changed additively. |
| Do not alter DB schema | No migration, no schema change. |
| Do not change JWT architecture | Untouched. 41/41 backend tests pass. |
| Do not remove authentication | Untouched; admin/auth assertions pass. |
| Do not expose PostgreSQL | No new port; compose unchanged; tunnel targets `127.0.0.1:3001` only. |
| Do not expose router admin endpoints | Router not published; `/admin/*` still requires `x-admin-key`. |
| No paid provider calls | None made. All tests use mocks. |
| No fake deployment reports | §0 states three NOT TESTED items; the harness prints its own scope caveat. |
| Do not commit secrets | `wrangler.toml` holds no secrets; `.gitignore` already excludes `.env*`. `BACKEND_ORIGIN` is set per project, not in the repo. |

---

## 8. Manual steps still required (Cloudflare)

Nothing below has been done. Each step is a human action against a real account.

1. `npx wrangler login` (or dashboard login).
2. `npx wrangler pages project create freefirst-ai --production-branch main`.
3. `npm run build` at the repo root.
4. `npx wrangler pages deploy` — confirm the printed `https://freefirst-ai.pages.dev`.
5. `npx wrangler pages secret put BACKEND_ORIGIN --project-name freefirst-ai`
   (value: the tunnel's `https://` URL).
6. **Redeploy** — Pages applies secret changes to new deployments only.
7. Smoke test: `/` → 200, `/settings` → 200, `/api/health` → `{"status":"ok"}`,
   and `Content-Security-Policy` present on `/`.
8. Register a user through the `pages.dev` URL and send one streamed chat message;
   confirm tokens appear progressively rather than all at once at the end.

## 9. Manual steps still required (Tencent Lighthouse)

1. Provision 2 vCPU / 2 GB / 40 GB Ubuntu 22.04 or later.
2. Install Docker + Compose plugin.
3. Clone the repo to `/opt/freefirst-ai`; create `.env` from `.env.example` with
   generated `JWT_SECRET`, DB passwords and router admin key.
4. `docker compose -f docker-compose.yml -f deploy/docker-compose.lighthouse.yml up -d`.
5. `curl 127.0.0.1:3001/health` → ok; `curl 127.0.0.1:3001/ready` → ready;
   `curl 127.0.0.1:3001/api/health` → ok.
6. Firewall: inbound `22` from your IP only. **Do not open 3001 or 5432.**
7. Install `cloudflared`, run `cloudflared tunnel --url http://127.0.0.1:3001`.
8. Copy the printed `https://…trycloudflare.com` into step 5 above.
9. Keep the tunnel supervised (systemd unit or `tmux`); it must survive reboots.

---

## 10. Known limitations

| # | Limitation | Impact | Mitigation |
| --- | --- | --- | --- |
| 1 | Quick Tunnel hostname rotates on restart | Every restart needs a secret update + redeploy | Move to a custom domain (guide §14) |
| 2 | Quick Tunnel has no SLA | Staging availability is best-effort | Accept for staging; custom domain for anything else |
| 3 | Pages secrets apply per deployment | A secret change without a redeploy appears to do nothing | Always redeploy after `secret put` |
| 4 | Long streams may hit platform limits | Very long generations could truncate | Cap `max_tokens`; measure on real infrastructure |
| 5 | Request bodies are buffered in the Function | Fine for JSON ≤256 kB; not for uploads | Add a streaming path if uploads are ever introduced |
| 6 | No rate limiting at the proxy | Abuse is bounded only by auth and backend limits | Add Cloudflare WAF/rate-limit rules before wider sharing |
| 7 | Single VPS, single database | No HA; a restart is downtime | Out of scope for staging |
| 8 | Monitoring not wired to the new path | `/health` probe still targets the container origin, not Pages | Add an external check on `https://freefirst-ai.pages.dev/api/health` |
| 9 | No HSTS on `pages.dev` | Cannot be set via `_headers` on a shared zone | Configure at the Cloudflare zone level once a custom domain exists |

---

## 11. Rollback

| Level | Action |
| --- | --- |
| Frontend | Pages → Deployments → previous deployment → Rollback. |
| Proxy only | Revert `functions/api/[[path]].js`, redeploy. Static assets keep serving; only `/api/*` is affected. |
| Routing/headers | Revert `_routes.json` / `_redirects` / `_headers` in `public/`, rebuild, redeploy. |
| Origin | Stop `cloudflared`; the API becomes unreachable through Pages but the VPS keeps running. |
| Full teardown | Delete the Pages project; stop the tunnel. The database is untouched. |

---

## 12. Verdict

**CODE READY** for a first manual Cloudflare Pages deployment.

**CLOUDFLARE DEPLOYMENT NOT TESTED.** No Pages project exists, no upload occurred,
`pages.dev` was never contacted. The 106 passing assertions were produced by a local
simulator and a local mock origin.

**TENCENT ORIGIN CONNECTIVITY NOT TESTED.** No tunnel was opened, no Lighthouse host
was reached, no packet crossed between Cloudflare and Tencent.

**PRODUCTION NOT READY.** The topology is staging-only: a rotating hostname, a single
VPS, no rate limiting at the edge, and no monitoring on the new path.

The next honest step is the manual checklist in §8–§9, performed against real
accounts, with the results recorded in a new report. Until then, this document is a
record of what the code does — not evidence that it is running anywhere.
