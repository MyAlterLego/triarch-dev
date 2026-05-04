# Phase 1: Schema + Membership Migration - Context

**Gathered:** 2026-05-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Database is ready to express the gating lifecycle (dev/prod env, full status enum, audit-trail tables) and access control moves from a hardcoded email check in `src/lib/auth.ts` to a DB-backed role + per-project membership model. Phase 1 deliverables are: Drizzle schema additions, an idempotent backfill SQL file, a refactored `auth.ts` that consults the DB (with an env-allowlist fallback during rollout), a single `getCurrentUserContext()` helper consumed across the app, and a staff-only manage-members admin page at `/admin/platform/projects/{key}/members`. **Application of `db:push` to the live `triarch_dev` database is OUT of execute-phase scope** — autonomous writes the code; Mike applies the migration after PR review with explicit go.

</domain>

<decisions>
## Implementation Decisions

### Migration Strategy & DB Safety
- `db:push` runs MANUALLY after PR merge with Mike's explicit go — autonomous writes the schema + migration SQL but does not touch the live DB
- Backfill SQL lives at `src/db/migrations/v1.14.0-backfill.sql` — separate, reviewable, idempotent (`UPDATE ... WHERE env IS NULL`), runnable via `psql $DATABASE_URL -f`
- Default `deployed_at` for backfilled `releaseLogs` rows: copy from `releaseLogs.createdAt` (best available proxy)
- Rollback strategy: forward-only; rely on CRDB managed snapshots/exports for catastrophic recovery; additive column adds are reversible via DROP COLUMN later if needed

### Membership Model
- `staff` role lives as a **wildcard `project_members` row** (`project_key='*'`, `email`, `role='staff'`) — single membership table for all access control
- Backfill existing projects: default ALL existing projects' admin to `mike@triarchsecurity.com` (per PROJECT.md, Mike is the de facto creator); manage-members page is the path to add others
- Email casing: case-insensitive lookups via `lower(email)` unique index per `project_key`; emails stored as-entered (preserve display casing)
- Member removal semantics: hard delete; audit trail of approvals lives in `release_approvals` (preserved separately)

### auth.ts Cutover Strategy
- Cutover approach: replace the hardcoded check with DB lookup; on DB error, fall back to current `email === ADMIN_EMAIL || endsWith('@triarchsecurity.com')` env-allowlist (rollout safety net; remove fallback in v1.15 after stable)
- Staff seed at cutover: ONLY `mike@triarchsecurity.com` is seeded as staff; document the SQL recipe and the manage-members page for adding others
- Single helper `src/lib/auth-context.ts` exports `getCurrentUserContext()` returning `{email, isStaff, memberships: [{project_key, role}]}` — consumed by middleware, page guards, API auth handlers
- No caching of role/membership lookups in v1 — per-request DB query against indexed table; admin traffic is low; profile if it ever becomes hot

### Manage-Members Admin Page
- URL: `/admin/platform/projects/{key}/members` (matches REQUIREMENTS.md ADMIN-01)
- Add UX: email input + role dropdown (admin/viewer) + Add button; server validates email format and INSERTs immediately on click
- Per-project roles in v1.14: `admin` (can approve releases, leave feedback) and `viewer` (read-only); `staff` is global, set via SQL or staff-page in a later phase
- Page access: `staff` role only — Triarch operators add/remove customer admins; customers manage team by request to Triarch (deferred self-serve to post-v1.14)

### Claude's Discretion
- Naming of helper file (`auth-context.ts` vs `user-context.ts` vs `access.ts`) — implementer chooses
- SQL formatting in backfill file (single statement vs commented sections) — implementer chooses
- Exact zod schema shape for the add-member API request — implementer chooses
- Drizzle relation declarations for new tables — implementer chooses

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/auth.ts` — current NextAuth + Google config; `signIn` callback at line ~21 has the hardcoded check to refactor
- `src/db/schema.ts` — Drizzle schema with `projects`, `menuSections/Pages/Subpages`, `rolePermissions`, `moduleSettings`, etc. — pattern to follow for new tables (uuid PK, timestamps with timezone, uniqueIndex on logical keys)
- `src/db/seed.ts`, `src/db/seed-projects.ts`, `src/db/seed-releases.ts` — seed script patterns
- `src/lib/db.ts` — `pg.Pool` + Drizzle client (already inherited)
- `src/app/admin/platform/projects/page.tsx` and `new/page.tsx` — admin UI patterns to mirror for manage-members
- `src/lib/api-auth.ts`, `src/lib/api-key-auth.ts` — request-auth helpers; new `auth-context.ts` is a peer of these

### Established Patterns
- All tables use `uuid` PKs with `defaultRandom()`, `timestamp` columns with `withTimezone: true`, `uniqueIndex` for logical keys
- `varchar` length limits explicit (e.g., `length: 64` for keys, `256` for names)
- Drizzle schema lives in a single `src/db/schema.ts` file (no per-table files)
- Existing `rolePermissions` table is keyed by `(project, role, entityType, entityId, companyId)` — DIFFERENT model from what we need (entity-scoped permissions, not user-scoped membership); leave it alone
- NextAuth uses JWT strategy; `signIn` callback is the gate

### Integration Points
- `src/lib/auth.ts` `signIn` callback — the cutover happens here
- `src/app/api/platform/projects/route.ts` (GET/POST projects) — must call membership filter for non-staff
- `src/app/api/platform/ingest/release-logs/route.ts` — accepts `env` parameter (REL-A5)
- `src/app/admin/platform/projects/page.tsx` — must filter by membership for non-staff display
- `apphosting.yaml` — no new env vars needed in this phase (membership reads from DB)
- `.env.local` — DATABASE_URL already present
- `src/components/AdminSidebar.tsx` — may need a "Members" link added for staff users on the project detail surface (low-priority for this phase; can be a link from the existing project page)

</code_context>

<specifics>
## Specific Ideas

- New helper file: `src/lib/auth-context.ts` exporting `getCurrentUserContext()` that takes a `Session` and returns `{email, isStaff, memberships[]}`
- Backfill SQL file: `src/db/migrations/v1.14.0-backfill.sql` — composed of:
  - `UPDATE release_logs SET env = 'dev', status = 'dev', deployed_at = created_at WHERE env IS NULL;` (idempotent)
  - `INSERT INTO project_members (project_key, email, role) SELECT key, 'mike@triarchsecurity.com', 'admin' FROM projects WHERE NOT EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_key = projects.key AND pm.role = 'admin');`
  - `INSERT INTO project_members (project_key, email, role) VALUES ('*', 'mike@triarchsecurity.com', 'staff') ON CONFLICT DO NOTHING;`
- Manage-members page: server component for the list, client component for the add form (`'use client'`), uses existing admin layout
- Verification of "DB has new columns" criterion is `human_needed` (Mike runs `db:push` and confirms) — autonomous's verification step should mark it accordingly

</specifics>

<deferred>
## Deferred Ideas

- Customer-self-serve member management (project admins inviting other admins) — deferred from Q4 of Area 4; can come in v1.15 once the staff-driven flow is stable
- Bulk paste add-members UX — deferred from Q2 of Area 4; staff can run SQL for bulk additions in v1
- Invite-by-email confirmation flow (Resend integration) — deferred; staff manually communicates added access
- Add `createdBy` column to `projects` — deferred; current backfill defaults to `mike@triarchsecurity.com` is sufficient
- Caching of role/membership lookups (LRU or session-cookie cached) — deferred until profiling shows it's hot
- `owner` role in addition to admin/viewer — deferred until per-project membership-management is moved to customer-self-serve
- Migration of the existing hardcoded `@triarchsecurity.com` allowlist to the staff role table for everyone (not just Mike) — deferred; staff will be added on-demand via SQL

</deferred>
