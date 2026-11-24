# Ultimate Router — Rebuild Foundation

This is the initial local-development foundation, not the complete SaaS application.

## Requirements
- Windows 10/11
- Node.js 20 LTS or newer
- npm
- Docker Desktop with Linux containers enabled

## Setup (PowerShell)

```powershell
Copy-Item .env.example .env
docker compose up -d postgres
npm install
npm run db:migrate
npm run dev
```

Open:
- Frontend: http://localhost:5173
- API: http://localhost:4000/api/v1
- Liveness: http://localhost:4000/health/live
- Readiness: http://localhost:4000/health/ready

## Stop

Press Ctrl+C in the terminal running `npm run dev`, then:

```powershell
docker compose down
```

Do not use `docker compose down -v` unless you intentionally want to delete the local database volume.

## Current scope
- React/Vite frontend shell
- Express API shell
- PostgreSQL 16 local service
- Initial schema migration for users, projects, conversations, and messages
- Liveness/readiness endpoints
- No authentication or real provider integration yet

## Next milestones
1. Authentication, email verification, and session management
2. User-owned Projects, Conversations, Messages, and API keys
3. Provider gateway adapter and SSE streaming
4. Free-first routing and safe budget enforcement
5. Full 13-page dashboard
6. Usage, billing, admin, and marketplace
7. Playwright E2E, Docker production images, backup/restore, staging

Never commit `.env` or real credentials.

## Deployment

GitHub + Railway (API and PostgreSQL) + Cloudflare Pages (frontend) configuration and step-by-step dashboard
instructions are in [DEPLOYMENT.md](DEPLOYMENT.md). The backend image is built from the root `Dockerfile` using the
repository root as build context; the Pages build command is `npm run build` with output `apps/web/dist`.

Railway `railway.json` config-as-code is intentionally not used: Railway deprecated it and stops reading it on
2026-12-01 for new services. Dashboard settings (or Railway IaC) are used instead.
