# Ultimate Router — Build Roadmap

## Product definition
One API. Every Provider. Smarter Routing.

A multi-user AI gateway SaaS with a customer-facing dashboard and a separate routing engine.

## Architecture boundaries
- Web app: React + Vite. No provider secrets in browser code.
- Application API: Express. Owns users, sessions, projects, conversations, API keys, usage, billing, and authorization.
- Application database: PostgreSQL. Owns customer and product data.
- Router service: separate process/service. Owns model discovery, provider adapters, routing policy, cooldown, and routing telemetry.
- Router database/state: separate from application database where required by router implementation.
- Providers: external model APIs. Credentials remain server-side.

## Intended 13 pages
1. Overview
2. AI Chat
3. Projects
4. Models
5. API Keys
6. Usage & Analytics
7. Provider Status
8. Marketplace
9. Billing & Subscription
10. Settings
11. Documentation
12. Help & Support
13. Profile

## Milestones
0. Reproducible local foundation (current)
1. Authentication and authorization
2. Persistent product resources and API key lifecycle
3. Router integration and streaming
4. Full dashboard and design system
5. Usage, quotas, billing, and admin
6. Security hardening and browser E2E
7. Docker production build, backup/restore, staging

## Engineering rules
- Work in small milestones with a clean Git checkpoint after each.
- No fake provider success in production paths.
- Never trust client-supplied user identity.
- Never store raw API keys.
- Every user-owned query must be scoped by authenticated user ID.
- Do not silently fall back to unlocked dependency installation.
- Migrations must be ordered, repeatable, and tested.
- Keep application data and router state boundaries explicit.
- Report verified, implemented-but-not-tested, blocked, and not-implemented separately.
