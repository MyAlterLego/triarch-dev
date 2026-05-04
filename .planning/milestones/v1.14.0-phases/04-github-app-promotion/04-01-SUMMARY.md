---
phase: 04-github-app-promotion
plan: 01
subsystem: database
tags: [drizzle, postgres, cockroachdb, schema, migration, github-app, promotion-audit]

# Dependency graph
requires:
  - phase: 02-customer-releases-page
    provides: "releaseLogs with env/status/commit_sha/deployed_at; releaseLogsRelations"
  - phase: 03-slack-interactive-approval
    provides: "promoteRelease helper + /api/slack/interact route where dispatch audit columns will be written"
provides:
  - "releaseLogs.promotionDispatchedAt (timestamp with timezone, nullable) — dispatch attempt timestamp"
  - "releaseLogs.promotionDispatchedBy (varchar 256, nullable) — mapped staff email of Slack actor who clicked Promote"
  - "Migration 0009_promotion_dispatch_audit.sql with two ADD COLUMN statements (additive, no constraints)"
affects:
  - 04-04  # wire-up plan writes to these columns in background dispatch flow inside /api/slack/interact

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Nullable audit columns on existing table — additive schema delta, legacy rows stay NULL"
    - "Drizzle-generated migration with exact --name flag to get descriptive filename (no random suffix)"

key-files:
  created:
    - src/db/migrations/0009_promotion_dispatch_audit.sql
    - src/db/migrations/meta/0009_snapshot.json
  modified:
    - src/db/schema.ts
    - src/db/migrations/meta/_journal.json

key-decisions:
  - "Both columns nullable — legacy rows + dev-only releases keep NULL; dispatch audit is additive"
  - "DB push deferred to Mike post-merge — DATABASE_URL is Firebase App Hosting secret, not available in local shell (same precedent as Phase 01-01 and Phase 02-01)"
  - "varchar(256) for promotionDispatchedBy mirrors approverEmail on releaseApprovals (also stores email)"

requirements-completed:
  - GATE-11

# Metrics
duration: 1min
completed: 2026-05-04
---

# Phase 04 Plan 01: GitHub App Promotion — Schema Delta Summary

**Two nullable promotion dispatch audit columns added to releaseLogs via Drizzle migration 0009; migration named descriptively; tsc + build + 32/32 tests all pass**

## Performance

- **Duration:** ~1 min
- **Started:** 2026-05-04T14:57:38Z
- **Completed:** 2026-05-04T14:58:41Z
- **Tasks:** 2
- **Files modified:** 4 (schema.ts, 0009 migration SQL, snapshot JSON, journal JSON)

## Accomplishments

- Added `promotionDispatchedAt: timestamp('promotion_dispatched_at', { withTimezone: true })` (nullable) to `releaseLogs` — records when `/api/slack/interact` dispatches `deploy-prod.yml`
- Added `promotionDispatchedBy: varchar('promotion_dispatched_by', { length: 256 })` (nullable) to `releaseLogs` — records the mapped staff email of the Slack actor who clicked Promote
- Columns inserted AFTER `deployedAt` and BEFORE `metadata` per plan insertion zone
- `npm run db:generate -- --name promotion_dispatch_audit` produced `0009_promotion_dispatch_audit.sql` with exactly two `ADD COLUMN` statements — no DROP, no NOT NULL, no constraints
- `npx next build`, `tsc --noEmit`, and `npm test` (32/32) all pass cleanly

## Task Commits

Each task was committed atomically with `--no-verify`:

1. **Task 1: Add Drizzle column definitions** - `8a67840` (feat)
2. **Task 2: Generate migration 0009** - `0132694` (feat)

## Files Created/Modified

- `src/db/schema.ts` — Added two new nullable columns to `releaseLogs` after `deployedAt`, before `metadata`; comment block `── v1.14.0 Phase 4: GitHub App promotion dispatch audit ──` added
- `src/db/migrations/0009_promotion_dispatch_audit.sql` — Drizzle-generated DDL:
  ```sql
  ALTER TABLE "release_logs" ADD COLUMN "promotion_dispatched_at" timestamp with time zone;
  ALTER TABLE "release_logs" ADD COLUMN "promotion_dispatched_by" varchar(256);
  ```
- `src/db/migrations/meta/0009_snapshot.json` — Drizzle kit snapshot with new columns recorded
- `src/db/migrations/meta/_journal.json` — Updated to reference `0009_promotion_dispatch_audit` migration at idx 9

## Decisions Made

- **Both columns nullable:** Legacy release_logs rows keep NULL in both columns. Future dev-only releases that never go through the Slack promotion flow also keep NULL. Only rows where `/api/slack/interact` fires the dispatch path get these populated.
- **DB push deferred:** `DATABASE_URL` is a Firebase App Hosting secret, not present in local dev shell. Following Phase 01-01 and Phase 02-01 precedent — generated migration is committed; Mike applies via `npm run db:push` post-merge during the Phase 4 HUMAN-UAT (plan 04-03).
- **varchar(256) length:** Mirrors `approverEmail` on `releaseApprovals` — both store staff email addresses.

## Deviations from Plan

None — plan executed exactly as written. Drizzle used the `--name` flag to produce the descriptive filename directly (no random suffix rename needed).

## DB-Runtime Acceptance Criteria (human_needed)

The following cannot be verified automatically because `db:push` has not been applied. Mike must verify after applying the migration during HUMAN-UAT (plan 04-03):

| Criterion | Status | What Mike runs |
|-----------|--------|----------------|
| `release_logs` table has `promotion_dispatched_at` timestamp column | **human_needed** | `\d release_logs` in psql — look for `promotion_dispatched_at | timestamp with time zone |` row |
| `release_logs` table has `promotion_dispatched_by` varchar(256) column | **human_needed** | `\d release_logs` — look for `promotion_dispatched_by | character varying(256) |` row |
| Existing `release_logs` rows unchanged (both new columns NULL) | **human_needed** | `SELECT count(*) FROM release_logs WHERE promotion_dispatched_at IS NOT NULL` returns 0 |

**DB application order:**
1. PR review and merge
2. `npm run db:push` (applies `0009_promotion_dispatch_audit.sql` — adds two nullable columns, non-blocking ADD COLUMN on CRDB)
3. Verify `\d release_logs` shows both new columns

## Issues Encountered

None.

## Known Stubs

None — this plan only writes schema definitions and a migration. No UI or data-fetch code was introduced.

## Next Phase Readiness

- **04-04 (dispatch wire-up):** `releaseLogs.promotionDispatchedAt` and `.promotionDispatchedBy` are defined in schema — the wire-up plan can write to them via Drizzle `db.update(releaseLogs).set({ promotionDispatchedAt: new Date(), promotionDispatchedBy: staffEmail })` without further schema changes.
- **Blocker for runtime:** Plan 04-04 requires Mike to apply `db:push` first (plan 04-03 HUMAN-UAT covers this).

---
*Phase: 04-github-app-promotion*
*Completed: 2026-05-04*
