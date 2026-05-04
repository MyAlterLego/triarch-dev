---
phase: 02-customer-releases-page
plan: 01
subsystem: database
tags: [drizzle, postgres, cockroachdb, schema, migration, relations, release-gating, reject]

# Dependency graph
requires:
  - phase: 01-schema-membership-migration
    provides: "releaseApprovals table (without reason), releaseFeedback, releaseLogs with env/status/commit_sha/deployed_at"
provides:
  - "releaseApprovals.reason column (text, nullable) for REJECT-01 rejection audit trail"
  - "releaseLogsRelations declared linking releaseLogs → releaseFeedback + releaseApprovals"
  - "releaseFeedbackRelations declared linking releaseFeedback → releaseLogs"
  - "releaseApprovalsRelations declared linking releaseApprovals → releaseLogs"
  - "Drizzle-generated migration 0008_yielding_hellcat.sql with ADD COLUMN reason text"
affects:
  - 02-02  # releases list API reads releaseLogs; approval rows now have reason column
  - 02-03  # reject endpoint writes reason to releaseApprovals
  - 02-04  # UI renders rejection reason excerpt in audit line
  - 02-05  # Slack notification includes reason excerpt for rejected releases

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Drizzle relations() linking releaseLogs (one) ↔ releaseFeedback (many) via releaseId FK"
    - "Drizzle relations() linking releaseLogs (one) ↔ releaseApprovals (many) via releaseId FK"
    - "reason: text('reason') — unbounded text column with server-side 500-char limit (same pattern as releaseFeedback.body with 2000-char limit)"

key-files:
  created:
    - src/db/migrations/0008_yielding_hellcat.sql
    - src/db/migrations/meta/0008_snapshot.json
  modified:
    - src/db/schema.ts
    - src/db/migrations/meta/_journal.json

key-decisions:
  - "reason column uses text() not varchar(500) — matches releaseFeedback.body pattern; 500-char limit enforced server-side"
  - "DB push (npm run db:push) deferred to human — DATABASE_URL not available in local shell; same precedent as Phase 01-01"

patterns-established:
  - "Server-side length limits on text columns: use text() in schema + validate in API route (no DB-level check constraints)"

requirements-completed:
  - REJECT-01

# Metrics
duration: 4min
completed: 2026-05-04
---

# Phase 02 Plan 01: Customer Releases Page — Schema Delta Summary

**releaseApprovals.reason column (text, nullable) added for REJECT-01 audit trail, plus three Drizzle relations() declarations linking releaseLogs ↔ releaseFeedback ↔ releaseApprovals, migration 0008 generated**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-05-04T01:54:09Z
- **Completed:** 2026-05-04T01:58:00Z
- **Tasks:** 2
- **Files modified:** 4 (schema.ts, 0008 migration SQL, snapshot JSON, journal JSON)

## Accomplishments

- Added `reason: text('reason')` to `releaseApprovals` table — the only missing column for REJECT-01 (rejection reason for audit trail line "rejected by X: {excerpt}" per UI-SPEC)
- Added three Drizzle `relations()` exports that Phase 1 explicitly deferred: `releaseLogsRelations`, `releaseFeedbackRelations`, `releaseApprovalsRelations`
- `npx drizzle-kit generate` produced `0008_yielding_hellcat.sql` with exactly `ALTER TABLE "release_approvals" ADD COLUMN "reason" text;`
- `npx next build` and `tsc --noEmit` both pass cleanly

## Task Commits

Each task was committed atomically:

1. **Task 1: Add reason column + relations to schema.ts** - `2159bae` (feat)
2. **Task 2: Generate Drizzle migration 0008** - `5b94cb6` (feat)

**Plan metadata:** (committed below as docs commit)

## Files Created/Modified

- `src/db/schema.ts` — Added `reason: text('reason')` to `releaseApprovals` (after `userAgent`, before `createdAt`); added `releaseLogsRelations`, `releaseFeedbackRelations`, `releaseApprovalsRelations` exports after `menuSubpagesRelations`
- `src/db/migrations/0008_yielding_hellcat.sql` — Drizzle-generated DDL: `ALTER TABLE "release_approvals" ADD COLUMN "reason" text;`
- `src/db/migrations/meta/0008_snapshot.json` — Drizzle kit snapshot with new column in snapshot
- `src/db/migrations/meta/_journal.json` — Updated to reference 0008 migration

## Decisions Made

- **`text()` not `varchar(500)`:** Follows `releaseFeedback.body` pattern — keep DB schema unbounded, enforce character limits (500 for reason, 2000 for feedback) in API route validation. Drizzle migration is cleaner without check constraints.
- **DB push deferred:** `DATABASE_URL` is a Firebase App Hosting secret, not present in local dev shell. Following Phase 01-01 precedent — generated migration is committed; Mike applies via `npm run db:push` post-merge.

## Deviations from Plan

None — plan executed exactly as written.

## DB-Runtime Acceptance Criteria (human_needed)

The following cannot be verified automatically because `db:push` has not been applied. Mike must verify after applying the migration:

| Criterion | Status | What Mike runs |
|-----------|--------|----------------|
| `release_approvals` table has `reason` text column | **human_needed** | `\d release_approvals` in psql — look for `reason | text |` row |
| Existing `release_approvals` rows unchanged (reason IS NULL) | **human_needed** | `SELECT count(*) FROM release_approvals WHERE reason IS NOT NULL` returns 0 |

**DB application order:**
1. PR review and merge
2. `npm run db:push` (applies `0008_yielding_hellcat.sql` — adds `reason` column, non-blocking ADD COLUMN on CRDB)
3. Verify `\d release_approvals` shows the new column

## Issues Encountered

None.

## Known Stubs

None — this plan only writes schema definitions and a migration. No UI or data-fetch code was introduced.

## Next Phase Readiness

- **02-02 (releases list API):** `releaseLogs` schema is complete; `releaseLogsRelations` is declared so Drizzle relational query builder (`db.query.releaseLogs.findMany({ with: { feedback: true, approvals: true } })`) is available. Plan can proceed immediately.
- **02-03 (approve/reject API):** `releaseApprovals.reason` column is defined in schema — reject endpoint can write to it. Plan can proceed immediately.
- **Blocker for runtime:** All Phase 2 plans that query `release_approvals` at runtime require Mike to apply `db:push` first.

---
*Phase: 02-customer-releases-page*
*Completed: 2026-05-04*
