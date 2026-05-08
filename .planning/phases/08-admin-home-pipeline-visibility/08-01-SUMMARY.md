---
phase: 08-admin-home-pipeline-visibility
plan: 01
subsystem: database
tags: [drizzle, cockroachdb, postgresql, index, migration, schema]

# Dependency graph
requires: []
provides:
  - "Composite index release_logs_project_env_deployed_idx on (project, env, deployed_at DESC) in release_logs"
  - "Migration 0013_release_logs_pipeline_idx.sql with CREATE INDEX statement"
  - "Drizzle schema second-arg declaration for the index"
  - "Journal backfill: 0012_promote_attempts entry added (pre-existing inconsistency resolved)"
affects:
  - "08-02 (dashboard query relies on this index being present in same deploy)"
  - "08-03 (admin home tile rendering depends on the fast DISTINCT ON query)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Drizzle index() helper (non-unique) with .desc() column modifier for DESC ordering"
    - "pgTable second-arg array pattern for non-unique composite indexes"

key-files:
  created:
    - "src/db/migrations/0013_release_logs_pipeline_idx.sql"
    - "src/db/migrations/meta/0012_snapshot.json"
    - "src/db/migrations/meta/0013_snapshot.json"
  modified:
    - "src/db/schema.ts"
    - "src/db/migrations/meta/_journal.json"

key-decisions:
  - "index() (non-unique) used — release_logs legitimately has multiple rows per (project, env) over time"
  - ".desc() applied only to deployedAt (third column); project and env use default ASC for grouping"
  - "NULLS LAST is Postgres default for DESC — acceptable for COALESCE fallback path on legacy null-deployed_at rows"
  - "Migration created manually (not drizzle-kit generated) due to pre-existing journal inconsistency (0012_promote_attempts was in git but not in journal) — drizzle-kit generate was run to validate the index SQL syntax but output was adjusted to be index-only"
  - "Journal backfilled to include 0012_promote_attempts and 0013_release_logs_pipeline_idx in correct sequence"
  - "drizzle-kit check passes after all changes — no schema/migration drift"

patterns-established:
  - "Non-unique DESC composite indexes: index('name').on(table.col1, table.col2, table.col3.desc())"

requirements-completed:
  - PIPE-01
  - PIPE-03

# Metrics
duration: 15min
completed: 2026-05-07
---

# Phase 8 Plan 01: Release Logs Pipeline Index Summary

**Composite index `(project, env, deployed_at DESC)` on `release_logs` declared in Drizzle schema and shipped as migration 0013 — satisfying Pitfall 8 guard that index must deploy with the dashboard query**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-05-08T02:25:00Z
- **Completed:** 2026-05-08T02:40:38Z
- **Tasks:** 1
- **Files modified:** 5 (schema.ts, journal, 3 new: 0013 SQL + 2 snapshots)

## Accomplishments
- Added `index('release_logs_project_env_deployed_idx').on(table.project, table.env, table.deployedAt.desc())` to the `releaseLogs` table second-arg in schema.ts
- Created `0013_release_logs_pipeline_idx.sql` with `CREATE INDEX "release_logs_project_env_deployed_idx" ON "release_logs" USING btree ("project","env","deployed_at" DESC NULLS LAST)`
- Resolved pre-existing journal inconsistency: backfilled `0012_promote_attempts` into `_journal.json` and created proper `0012_snapshot.json` (state with promote_attempts, no index) and `0013_snapshot.json` (full current state)
- `drizzle-kit check` reports "Everything's fine" — no schema/migration drift

## Task Commits

Each task was committed atomically:

1. **Task 1: Declare composite index in Drizzle schema and generate migration** - `a77bd51` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `src/db/schema.ts` — Added second-arg index array to `releaseLogs` table; `index` was already imported
- `src/db/migrations/0013_release_logs_pipeline_idx.sql` — Created with CREATE INDEX statement matching Pitfall 8 spec exactly
- `src/db/migrations/meta/_journal.json` — Backfilled `0012_promote_attempts` (idx=12), added `0013_release_logs_pipeline_idx` (idx=13)
- `src/db/migrations/meta/0012_snapshot.json` — New snapshot: promote_attempts present, no release_logs index
- `src/db/migrations/meta/0013_snapshot.json` — New snapshot: promote_attempts + release_logs index (full current state)

## Decisions Made
- Used `index()` (non-unique) not `uniqueIndex()` — `release_logs` has multiple rows per `(project, env)` by design
- `.desc()` applied only to `deployedAt` (third column); project and env columns use default ASC for grouping — correct for `DISTINCT ON (project, env)` queries
- NULLS LAST is Postgres/CockroachDB default for DESC ordering — acceptable for the COALESCE fallback path on legacy null-deployed_at rows
- Migration created manually rather than using the raw drizzle-kit output because a pre-existing journal inconsistency (`0012_promote_attempts.sql` was in git but not in `_journal.json`) caused `drizzle-kit generate` to produce a file numbered 0012 with both the promote_attempts CREATE TABLE and the release_logs index combined — not the intended 0013-only-index file

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Resolved pre-existing journal inconsistency before generating migration**
- **Found during:** Task 1 (generating the migration)
- **Issue:** `0012_promote_attempts.sql` existed in git (added in commit 329ea10) but was absent from `_journal.json`. Drizzle-kit's latest snapshot was `0011` (no promote_attempts). Running `drizzle-kit generate` produced `0012_green_angel.sql` containing both `CREATE TABLE promote_attempts` and `CREATE INDEX release_logs_project_env_deployed_idx` — not the index-only file the plan required.
- **Fix:** Deleted the generated `0012_green_angel.sql`; created `0012_snapshot.json` (promote_attempts, no index) and `0013_snapshot.json` (full current state) with proper ID chains; created `0013_release_logs_pipeline_idx.sql` manually with only the index; updated `_journal.json` to add `0012_promote_attempts` and `0013_release_logs_pipeline_idx` in correct sequence.
- **Files modified:** `_journal.json`, `0012_snapshot.json` (new), `0013_snapshot.json` (new), `0013_release_logs_pipeline_idx.sql` (new)
- **Verification:** `drizzle-kit check` → "Everything's fine". All acceptance criteria pass. TypeScript compiles.
- **Committed in:** a77bd51 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - pre-existing journal inconsistency)
**Impact on plan:** Auto-fix necessary to produce the correct index-only migration file. The journal is now consistent and drizzle-kit check confirms no drift.

## Issues Encountered
- Pre-existing journal inconsistency: `0012_promote_attempts.sql` was manually added to git without going through `drizzle-kit generate`, so the journal and snapshots didn't include it. This caused drizzle-kit to try to re-create `promote_attempts` when generating the next migration. Resolved by manually creating the missing snapshot and updating the journal.

## User Setup Required
None - no external service configuration required. Schema change deploys via standard `db:push` at CI time when this commit hits main.

## Next Phase Readiness
- Plan 02 (`getProjectPipelineSummaries` dashboard query) can proceed — the composite index will be present in the same deploy per Pitfall 8 guard
- Plan 03 (admin home tile UI) can proceed — both the index and the query function will be ready
- The index must ship in the same deploy as Plan 02's query — this is enforced by the standing constraint from STATE.md Pending Todos and Pitfall 8

## Known Stubs
None — this plan creates only database schema artifacts (no UI components, no data functions). No stubs.

---
*Phase: 08-admin-home-pipeline-visibility*
*Completed: 2026-05-07*
