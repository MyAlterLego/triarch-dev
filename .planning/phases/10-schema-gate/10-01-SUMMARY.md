---
phase: 10-schema-gate
plan: "01"
subsystem: database
tags: [schema, migration, drizzle, cockroachdb, release-log-links, preview-lock]
dependency_graph:
  requires: []
  provides: [release_log_links-table, projects.previewBranchLocked, projects.previewBranchLockedAt]
  affects: [Phase-11-commit-parser, Phase-12-bug-feature-detail, Phase-13-branch-preview-swap]
tech_stack:
  added: []
  patterns: [drizzle-kit generate + rename + journal sync, cockroach sql -f apply pattern]
key_files:
  created:
    - src/db/migrations/0016_release_log_links_and_preview_lock.sql
    - src/db/migrations/meta/0015_snapshot.json
    - src/db/migrations/meta/0016_snapshot.json
  modified:
    - src/db/schema.ts
    - src/db/migrations/meta/_journal.json
    - package.json
decisions:
  - "CHECK constraint enforces link_type discriminant at DB level (not app level)"
  - "Non-partial FK indexes chosen for Drizzle idiomaticity"
  - "onDelete: cascade on bugId and featureId FKs"
  - "0015_snapshot.json backfilled manually to isolate Phase 10 changes from Phase 9 slack_channel_id"
metrics:
  duration_seconds: 446
  completed: "2026-05-07"
  tasks_completed: 3
  files_created: 3
  files_modified: 3
requirements: [LINK-01, PREV-01]
---

# Phase 10 Plan 01: Schema Gate Summary

**One-liner:** Single isolated migration 0016 adding `release_log_links` join table (LINK-01) and `projects` branch preview lock columns (PREV-01) with CHECK constraint enforcing link_type discriminant invariant, applied to admin_dev cluster.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Extend Drizzle schema with releaseLogLinks + projects lock columns | bf8f434 | src/db/schema.ts |
| 2 | Generate migration 0016, add CHECK constraint, sync journal + snapshot | b770a99 | 0016 SQL, 0015 snapshot, 0016 snapshot, journal |
| 3 | Apply migration to dev cluster, verify schema, bump version | 13048c5 | package.json |

## Schema Additions

### `release_log_links` table (LINK-01)

Final column list from `information_schema.columns` on admin_dev:

| column_name | data_type | is_nullable |
|-------------|-----------|-------------|
| id | uuid | NO |
| release_id | uuid | NO |
| link_type | character varying | NO |
| bug_id | uuid | YES |
| feature_id | uuid | YES |
| external_url | text | YES |
| source | character varying | NO |
| created_at | timestamp with time zone | NO |

Indexes: `release_log_links_pkey`, `release_log_links_release_id_idx`, `release_log_links_bug_id_idx`, `release_log_links_feature_id_idx`

### `projects` additions (PREV-01)

| column_name | data_type | is_nullable |
|-------------|-----------|-------------|
| preview_branch_locked | text | YES |
| preview_branch_locked_at | timestamp with time zone | YES |

## Dev Cluster Verification

Verification query result against admin_dev:

```
link_cols  preview_cols  link_indexes  link_checks
8          2             4             6
```

- `link_cols=8`: all 8 expected columns present in release_log_links
- `preview_cols=2`: both preview_branch_locked + preview_branch_locked_at present in projects
- `link_indexes=4`: pkey + 3 FK indexes (release_id, bug_id, feature_id)
- `link_checks=6`: includes named CHECK constraint + CockroachDB implicit FK NOT NULL checks

CHECK constraint rejection test: INSERT with `link_type='bug'` and `feature_id IS NOT NULL` was correctly rejected with `CONSTRAINT: release_log_links_link_type_discriminant` error.

## Decisions Made

### 1. CHECK constraint over app-level enforcement

**Decision:** DB-level CHECK constraint `release_log_links_link_type_discriminant` enforces the link_type discriminant invariant rather than relying on application validation.

**Rationale:** DB-level invariants are robust against bugs in Phase 11 commit-parser auto-stamping. The parser may produce malformed rows (e.g., wrong discriminant column populated) — the CHECK constraint ensures no bad data reaches the DB regardless of application bugs. The constraint is explicitly named so future migrations can DROP/ADD it cleanly.

**Constraint logic:** `link_type='bug'` requires `bug_id IS NOT NULL AND feature_id IS NULL AND external_url IS NULL`; `link_type='feature'` requires `feature_id IS NOT NULL AND bug_id IS NULL AND external_url IS NULL`; `link_type='external'` requires `external_url IS NOT NULL AND bug_id IS NULL AND feature_id IS NULL`.

### 2. Non-partial FK indexes

**Decision:** FK indexes (release_id_idx, bug_id_idx, feature_id_idx) are non-partial — no `WHERE bug_id IS NOT NULL` condition.

**Rationale:** Drizzle's `index()` builder lacks first-class partial-index support. Non-partial indexes work correctly on nullable FK columns. The few null rows are negligible compared to keeping the schema definition idiomatic. CockroachDB's index structure handles nullable columns efficiently.

### 3. `onDelete: 'cascade'` on bugId and featureId FKs

**Decision:** Both `bug_id` and `feature_id` FKs use `onDelete: 'cascade'`.

**Rationale:** Deleting a tracker entry (bug report or feature request) should automatically remove its link rows. This prevents orphan rows in `release_log_links` without requiring application-layer cleanup logic. The cascade is intentional and not a performance concern at expected row counts.

### 4. 0015_snapshot.json backfilled manually

**Decision:** 0015_snapshot.json was not generated by drizzle-kit (Phase 9 migrated 0015 separately without creating the snapshot). Backfilled manually by copying the 0014 snapshot, adding `slack_channel_id` to projects columns, and assigning a new UUID id with `prevId` pointing to 0014's id.

**Rationale:** Without the 0015 snapshot, drizzle-kit diffed from the 0014 snapshot and included `slack_channel_id` in the 0016 migration — contaminating the Phase 10 migration with Phase 9 work. Creating the 0015 snapshot allows drizzle-kit generate to produce a clean 0016 containing only Phase 10 changes.

## Notes for Downstream Phases

### Phase 11 (Commit Parser + Tracker Linkage Authoring)

- `link_type` accepted values: `'bug' | 'feature' | 'external'`
- `source` accepted values: `'commit' | 'manual'`
- CHECK constraint enforces the discriminant — commit-parser MUST produce well-formed rows: exactly one discriminant column populated per row, matching the `link_type` value
- Cascades: deleting a bugReport or featureRequest row will cascade-delete its release_log_links rows automatically

### Phase 13 (Branch Preview Swap)

- Branch preview lock is project-scoped: `projects.preview_branch_locked` (text, nullable) stores the branch name currently being deployed to dev backend; `projects.preview_branch_locked_at` (timestamptz, nullable) records when the lock was set
- `null` in `preview_branch_locked` means no active lock
- The 8-minute stale-lock timeout is route-handler logic (compare `preview_branch_locked_at` to NOW()), not DB-enforced
- No index on `preview_branch_locked` — lock state is fetched as part of the full projects row query; no standalone lock lookup query expected

## Migration File Details

**Migration filename:** `src/db/migrations/0016_release_log_links_and_preview_lock.sql`
**Journal entry tag:** `"0016_release_log_links_and_preview_lock"` at idx 16

## Version

Bumped `2.5.0` → `2.5.1` (patch — schema-only infra phase, no user-facing surface changes).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Missing 0015_snapshot.json caused drizzle-kit to include slack_channel_id in 0016**

- **Found during:** Task 2 Step B
- **Issue:** When drizzle-kit generate ran without a 0015_snapshot.json, it diffed from the 0014 snapshot (which lacks slack_channel_id) and included `ADD COLUMN "slack_channel_id"` in the 0016 migration. This contaminated Phase 10's migration with Phase 9 work.
- **Fix:** Created 0015_snapshot.json by copying 0014_snapshot.json, adding the slack_channel_id column to the projects table, assigning a new UUID id, and setting prevId to 0014's id to maintain the chain. Re-ran drizzle-kit generate to produce a clean 0016.
- **Files modified:** `src/db/migrations/meta/0015_snapshot.json` (created)
- **Commit:** b770a99

**2. [Rule 3 - Blocking] Dev cluster (admin_dev) had no base schema — 0000-0015 not yet applied**

- **Found during:** Task 3 Step A
- **Issue:** The first attempt to apply 0016 partially succeeded (CREATE TABLE for release_log_links) then failed with `relation "projects" does not exist` because admin_dev was a fresh cluster with no migrations applied.
- **Fix:** Dropped the partially-created release_log_links table, applied migrations 0000-0015 sequentially, then re-applied 0016. All migrations applied cleanly.
- **Files modified:** None (database-side only)
- **Commit:** N/A (part of Task 3 execution)

## Known Stubs

None — this is a pure schema migration phase. No application code was touched.

## Self-Check: PASSED

All key files found: src/db/schema.ts, 0016 SQL, 0015 snapshot, 0016 snapshot, journal, package.json, SUMMARY.md.
All task commits verified: bf8f434 (Task 1), b770a99 (Task 2), 13048c5 (Task 3).
