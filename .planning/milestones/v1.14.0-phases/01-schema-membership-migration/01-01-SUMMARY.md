---
phase: 01-schema-membership-migration
plan: 01
subsystem: database
tags: [drizzle, postgres, cockroachdb, schema, migration, sql, membership, release-gating]

# Dependency graph
requires: []
provides:
  - "Drizzle pgTable definitions for releaseLogs (extended with env/status/commit_sha/deployed_at)"
  - "projectMembers table with wildcard staff row model and case-insensitive unique index"
  - "releaseFeedback table with cascade FK to releaseLogs"
  - "releaseApprovals table with decision column covering approve+reject"
  - "Idempotent backfill SQL at src/db/migrations/v1.14.0-backfill.sql"
  - "Drizzle-generated migration 0007_flashy_madelyne_pryor.sql"
affects:
  - 01-02  # auth-context helper reads project_members table
  - 01-03  # manage-members page writes to project_members table
  - 02-*   # customer releases UI reads releaseLogs (env/status), releaseFeedback, releaseApprovals
  - 03-*   # approval flow writes to releaseApprovals
  - 04-*   # Slack callback reads releaseApprovals, writes releaseLogs.status='promoted'

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "sql template literal from drizzle-orm for case-insensitive unique indexes: uniqueIndex(...).on(table.col, sql`lower(${table.email})`)"
    - "Wildcard project_key='*' row in project_members encodes global staff membership without a separate table"
    - "All new releaseLogs columns are nullable — backfill sets values for legacy rows post-migration"
    - "Backfill SQL uses WHERE NOT EXISTS throughout for idempotency (no ON CONFLICT, no BEGIN/COMMIT)"

key-files:
  created:
    - src/db/migrations/v1.14.0-backfill.sql
    - src/db/migrations/0007_flashy_madelyne_pryor.sql
    - src/db/migrations/meta/0007_snapshot.json
  modified:
    - src/db/schema.ts

key-decisions:
  - "New releaseLogs columns (env/status/commit_sha/deployed_at) are nullable — legacy rows have NULLs until Mike runs the backfill SQL"
  - "project_members email uniqueness is case-insensitive via lower(email) in the uniqueIndex — stored as-entered for display, looked up via lower()"
  - "staff role uses wildcard project_key='*' row — single table for all access control, no separate staff table"
  - "Backfill SQL uses WHERE NOT EXISTS (not ON CONFLICT) because the unique index is on (project_key, lower(email)) with no separate constraint on (project_key, role)"
  - "No Drizzle relations() declarations for new tables in Phase 1 — Phase 2 adds them when the customer releases page consumes them"

patterns-established:
  - "Case-insensitive unique index: uniqueIndex('name').on(table.col, sql`lower(${table.emailCol})`)"
  - "Wildcard membership row: project_key='*' encodes global role without extra table"

requirements-completed:
  - REL-A1
  - REL-A2
  - REL-A3
  - REL-A4
  - MEMBER-01
  - MEMBER-04
  - FEEDBACK-01
  - APPROVAL-01

# Metrics
duration: 2min
completed: 2026-05-03
---

# Phase 01 Plan 01: Schema + Membership Migration — Schema Extension Summary

**Drizzle schema extended with four nullable releaseLogs columns and three new tables (project_members with lower(email) unique index, release_feedback, release_approvals), plus idempotent backfill SQL for post-migration data seeding**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-05-03T17:57:40Z
- **Completed:** 2026-05-03T17:59:39Z
- **Tasks:** 2
- **Files modified:** 4 (schema.ts, 0007 migration, 0007 snapshot/journal, v1.14.0-backfill.sql)

## Accomplishments

- Extended `releaseLogs` with four nullable columns (`env`, `status`, `commit_sha`, `deployed_at`) covering REL-A1 through REL-A4; no `.notNull()` on any of them so legacy rows are valid until backfill runs
- Added `projectMembers` table with `(project_key, lower(email))` case-insensitive unique index — wildcard `project_key='*'` encodes staff without a separate table (MEMBER-01)
- Added `releaseFeedback` and `releaseApprovals` tables with cascade-delete FKs to `releaseLogs`; `releaseApprovals.decision` covers both approve and reject paths (FEEDBACK-01, APPROVAL-01)
- `npx drizzle-kit generate` succeeded clean: 19 tables, new migration at `src/db/migrations/0007_flashy_madelyne_pryor.sql`
- Wrote three-statement idempotent backfill SQL using `WHERE NOT EXISTS` throughout (no `ON CONFLICT`, no transactions) — safe to re-run

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend releaseLogs and add three new tables** - `6ae4a77` (feat)
2. **Task 2: Write idempotent backfill SQL** - `227299e` (feat)

**Plan metadata:** (committed below as docs commit)

## Files Created/Modified

- `src/db/schema.ts` — Extended `releaseLogs` + added `projectMembers`, `releaseFeedback`, `releaseApprovals` table definitions; `sql` added to drizzle-orm import
- `src/db/migrations/0007_flashy_madelyne_pryor.sql` — Drizzle-generated DDL migration (DO NOT apply manually — use `npm run db:push`)
- `src/db/migrations/meta/0007_snapshot.json` — Drizzle kit snapshot for migration lineage
- `src/db/migrations/meta/_journal.json` — Drizzle migration journal (updated by drizzle-kit)
- `src/db/migrations/v1.14.0-backfill.sql` — Manual backfill SQL (apply via `psql $DATABASE_URL -f src/db/migrations/v1.14.0-backfill.sql` AFTER `npm run db:push`)

## Decisions Made

- **Nullable new columns:** All four new `releaseLogs` columns are nullable so legacy rows remain valid until Mike manually applies the backfill. This was the plan constraint; no change made.
- **`WHERE NOT EXISTS` over `ON CONFLICT`:** Backfill Statements 2 and 3 use `WHERE NOT EXISTS` because the unique index is on `(project_key, lower(email))` — there is no unique constraint on `(project_key, role)` that `ON CONFLICT` could target consistently. Consistent idempotency semantics across all three statements.
- **No `relations()` declarations:** Phase 2 will add Drizzle relation declarations when the customer releases page consumes these tables. Kept this plan purely additive.

## Deviations from Plan

None — plan executed exactly as written.

## DB-Runtime Acceptance Criteria (human_needed)

The following criteria CANNOT be verified by this executor because `db:push` has not been applied. Mike must verify these after applying the migration:

| Criterion | Status | What Mike runs |
|-----------|--------|----------------|
| `release_logs` table has `env`, `status`, `commit_sha`, `deployed_at` columns | **human_needed** | `\d release_logs` in psql |
| `SELECT COUNT(*) FROM release_logs WHERE env IS NULL` returns 0 after backfill | **human_needed** | Run after `psql $DATABASE_URL -f src/db/migrations/v1.14.0-backfill.sql` |
| `SELECT COUNT(*) FROM project_members WHERE project_key != '*' AND role = 'admin'` >= number of projects | **human_needed** | Run after backfill |
| `SELECT COUNT(*) FROM project_members WHERE project_key = '*' AND role = 'staff' AND lower(email) = 'mike@triarchsecurity.com'` returns 1 | **human_needed** | Run after backfill |
| Re-running the SQL produces no row changes (idempotency proof) | **human_needed** | Run backfill SQL a second time, confirm 0 rows affected |

**DB application order:**
1. PR review and merge
2. `npm run db:push` (applies Drizzle DDL migration `0007_flashy_madelyne_pryor.sql`)
3. `psql $DATABASE_URL -f src/db/migrations/v1.14.0-backfill.sql` (seeds data)
4. Verify criteria above

## Issues Encountered

- `npx drizzle-kit generate` (via npx, pulling 0.31.10 global) initially reported "Please install latest version of drizzle-orm" — resolved by using the local `node_modules/.bin/drizzle-kit` instead (project specifies `drizzle-kit ^0.31.10` and `drizzle-orm ^0.45.2`, fully compatible).

## Known Stubs

None — this plan only writes schema definitions and SQL. No UI or data-fetch code was introduced.

## Next Phase Readiness

- **01-02 (auth-context helper):** `project_members` table is defined in schema; `getCurrentUserContext()` helper can be written and will compile. DB table doesn't exist at runtime until `db:push` runs, but Phase 1-2 can be developed in parallel.
- **01-03 (manage-members page):** Same — schema shapes are defined, page can be built against them.
- **Blocker:** All downstream phases that query `project_members`, `release_feedback`, or `release_approvals` at runtime require Mike to apply `db:push` + backfill SQL. Downstream phases should be code-complete before Mike applies the migration.

---
*Phase: 01-schema-membership-migration*
*Completed: 2026-05-03*

## Self-Check: PASSED

- FOUND: src/db/schema.ts
- FOUND: src/db/migrations/v1.14.0-backfill.sql
- FOUND: src/db/migrations/0007_flashy_madelyne_pryor.sql
- FOUND: .planning/phases/01-schema-membership-migration/01-01-SUMMARY.md
- FOUND commit: 6ae4a77 (Task 1 — schema extension)
- FOUND commit: 227299e (Task 2 — backfill SQL)
