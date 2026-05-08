# Phase 19: Database Connectivity - Context

**Gathered:** 2026-05-08
**Status:** Ready for planning
**Type:** Infrastructure (CRDB role + IAM) + targeted code (portal pg.Pool factory)

<domain>
## Phase Boundary

Create a CockroachDB user `portal_runtime` with SELECT/INSERT/UPDATE/DELETE only (NO DDL grants) on the existing `triarch_dev` database. Portal connects via this role. Admin keeps its existing role unchanged. After this phase: a hypothetical malicious or buggy `ALTER TABLE` from portal returns CRDB permission denied — defense-in-depth so admin remains sole migration authority.

Delivers DB-01..DB-04 from REQUIREMENTS.md (4 reqs).

</domain>

<decisions>
## Implementation Decisions

### Locked Decisions (from research/SUMMARY.md + ARCHITECTURE.md)

- **Role name:** `portal_runtime` (CRDB role, NOT a GCP IAM SA)
- **Connection string:** Same cluster URL as admin (`triarchdev-dev-15666` / database `triarch_dev`); password stored in Firebase secret `DATABASE_URL_PORTAL` containing the full `postgresql://...` connection string with portal_runtime credentials
- **Privilege grants on existing tables:** `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO portal_runtime;` (no `CREATE`, no `ALTER`, no `TRUNCATE`)
- **Privilege grants on sequences:** `GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO portal_runtime;` (so INSERT can use auto-incrementing IDs)
- **Future-proofing:** `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO portal_runtime;` (so when admin adds a new table via drizzle-kit push, portal_runtime auto-gets DML)
- **Portal `src/lib/db.ts`:** import `Pool` from pg; wrap in singleton; reads `process.env.DATABASE_URL` at runtime
- **NO `db:push` in portal package.json:** already enforced in Phase 18-01
- **DML-only smoke test:** Vitest test that opens a connection with portal_runtime credentials and asserts `ALTER TABLE projects ADD COLUMN test text` rejects with permission-denied error
- **DATABASE_URL secret in Firebase:** create new GCP secret `DATABASE_URL_PORTAL` in `triarch-vault` with the portal_runtime connection string; bind via `apphosting.yaml` env `DATABASE_URL: secret: DATABASE_URL_PORTAL`. Admin's `DATABASE_URL` secret stays unchanged.
- **Admin's existing DATABASE_URL is unchanged** — admin keeps its admin-level role; only portal binds the new portal_runtime credential

### Claude's Discretion
- The exact connection string format (port, sslmode, etc.) — Claude picks based on admin's existing format
- Whether to write a dedicated migration script for the role or do it inline via SQL — recommend a `scripts/provision-portal-runtime.sql` script for reproducibility (mirrors admin's `scripts/provision-dev-dbs.sql` pattern)
- Whether to also create `portal_runtime_dev` for the dev backend, or share `portal_runtime` between prod + dev — recommend share (simpler; same RBAC profile)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- Admin's `scripts/provision-dev-dbs.sql` — template for SQL scripts on the cluster (idempotent, runs via `cockroach sql -f`)
- Admin's `src/lib/db.ts` (now in shared package as `@myalterlego/triarch-shared/db`) — exports `db` (Drizzle wrapper around pg.Pool); portal can import from shared package directly OR write its own thin wrapper
- Admin's `apphosting.yaml` env binding pattern for `DATABASE_URL`

### Established Patterns
- CRDB Cloud cluster admin via `cockroach sql --url postgresql://root@host:port/...`
- Secret rotation pattern: existing GCP secret → bind in apphosting.yaml → FAH compute SA needs secretAccessor IAM
- Drizzle queries don't change based on role — same `db.select()...` syntax works for portal_runtime as for admin's role; only DDL fails

### Integration Points
- New CRDB role: `portal_runtime` (cluster-side via SQL)
- New GCP secret: `DATABASE_URL_PORTAL` in `triarch-vault`
- Modified: `~/claude/triarch/development/portal/apphosting.yaml` — DATABASE_URL binding swapped from `DATABASE_URL` (admin's secret) to `DATABASE_URL_PORTAL`
- New: `~/claude/triarch/development/portal/src/lib/db.ts` — re-export from `@myalterlego/triarch-shared/db` OR thin wrapper (Claude picks)
- New: `~/claude/triarch/development/portal/src/lib/db.test.ts` — DML-only smoke test (asserts ALTER fails)
- New: `~/claude/triarch/development/admin/scripts/provision-portal-runtime.sql` — repeatable role creation (lives in admin repo since admin owns DB schema; portal CONSUMES the role)

</code_context>

<specifics>
## Specific Ideas

- Connection password: generate via `openssl rand -base64 24` (NOT in plaintext); store directly in DATABASE_URL_PORTAL secret value
- The smoke test mocks the pg.Pool to use a separate connection with portal_runtime creds (not admin creds) and runs the ALTER attempt
- Phase 18 Portal currently binds `DATABASE_URL: DATABASE_URL` (admin's secret) — Phase 19 swaps to `DATABASE_URL: DATABASE_URL_PORTAL`. Until that swap, portal would have admin-level DB access — but portal hasn't done any writes yet (no API routes ship until Phase 22). So the swap can land in Phase 19 without breaking anything.
- Document in the SUMMARY: rotating portal_runtime password requires SQL UPDATE + GCP secret version + portal redeploy; admin's password is independent

</specifics>

<deferred>
## Deferred Ideas

- Per-table ROW LEVEL SECURITY policies → out of scope for v2.2 (not yet in PostgreSQL/CRDB feature parity for our use case)
- Read-replica routing for portal — single-primary CRDB Cloud cluster doesn't have read replicas separately addressable
- Connection pooling tuning (max connections, idle timeout) — start with admin's defaults; tune in v2.2.x if metrics show issues

</deferred>
