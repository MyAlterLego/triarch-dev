# triarchsecurity-admin — Project Conventions

This file adds admin-specific rules on top of the workspace CLAUDE.md at `~/claude/CLAUDE.md`.

## Project Onboarding

To add a new project to the v1.14 release-gating workflow, follow the 6-step checklist at [docs/onboarding-projects.md](docs/onboarding-projects.md). The runbook covers project creation, member seeding, shared-workflows wiring, and the full E2E approve flow.

## Key Routes

- `/admin/*` — staff-only platform management (requires `role='staff'` in `project_members`)
- `/projects/[slug]/releases` — customer release gating page (requires project membership)
- `/api/platform/ingest/release-logs` — dev-deploy ingest (Bearer token via `projects.apiKey`)
- `/api/releases/promoted` — prod-deploy round-trip ingest (same Bearer token, GATE-12)
- `/api/slack/interact` — Slack interactive button handler (HMAC signature verified)

## Auth Model

- Staff: wildcard `project_members` row with `project_key='*'` and `role='staff'`
- Customer admin: `project_members` row with `project_key='<project>'` and `role='admin'`
- CI/CD ingest: Bearer token from `projects.apiKey` column via `requireApiKey` in `src/lib/api-key-auth.ts`

## Database

- ORM: Drizzle (schema in `src/db/schema.ts`, migrations in `src/db/migrations/`)
- Engine: CockroachDB (PostgreSQL-compatible)
- `DATABASE_URL` is a Firebase App Hosting secret — not available locally; use `db:push` with the production URL from Firebase secrets for schema migrations

## Testing

- Framework: Vitest 4.x with `@/` alias
- Run: `npx vitest run`
- Test files colocated with source (e.g. `route.test.ts` next to `route.ts`)
