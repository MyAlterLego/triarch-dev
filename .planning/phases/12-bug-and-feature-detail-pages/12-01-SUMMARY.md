---
phase: 12-bug-and-feature-detail-pages
plan: "01"
subsystem: database
tags: [drizzle, vitest, tdd, release-history, bug-reports, feature-requests]

requires:
  - phase: 10-schema-gate
    provides: release_log_links table with bugId/featureId FK columns
  - phase: 11-commit-parser-and-tracker-linkage-authoring
    provides: release_log_links rows populated by auto-stamp + manual override

provides:
  - getReleaseHistoryForBug(bugId): Promise<ReleaseHistoryRow[]> — typed Drizzle query helper
  - getReleaseHistoryForFeature(featureId): Promise<ReleaseHistoryRow[]> — typed Drizzle query helper
  - ReleaseHistoryRow type export for 12-02 and 12-03 page components

affects:
  - 12-02-bug-detail-page
  - 12-03-feature-detail-page

tech-stack:
  added: []
  patterns:
    - Drizzle typed builder with innerJoin (release_log_links → release_logs) + COALESCE orderBy via sql tag
    - toIso local helper (not exported) mirrors pipeline-summary.ts self-contained pattern
    - Two separate query functions (not shared internal) — cleaner callsites + simpler test mocking

key-files:
  created:
    - src/lib/release-history.ts
    - src/lib/release-history.test.ts
  modified: []

key-decisions:
  - "Two separate exported functions (getReleaseHistoryForBug, getReleaseHistoryForFeature) instead of a shared internal — per pipeline-summary.ts precedent, simpler test mocking, clearer callsites"
  - "toIso helper kept local to release-history.ts (not re-exported from pipeline-summary.ts) — each lib file self-contained per codebase pattern"
  - "ReleaseHistoryRow.releasedAt is always a string (NOT NULL in schema) — deployedAt is nullable per legacy rows"
  - "No formatRelativeTime call here — deferred to detail page render (12-02, 12-03) per CONTEXT.md decisions"

patterns-established:
  - "Drizzle innerJoin pattern: db.select().from(joinTable).innerJoin(targetTable, eq(joinTable.fk, targetTable.pk)).where().orderBy(sql`COALESCE(...)`)"

requirements-completed: [LINK-05, LINK-06]

duration: 2min
completed: "2026-05-08"
---

# Phase 12 Plan 01: Release History Lib + Tests Summary

**Drizzle typed query helpers for bug/feature release history — getReleaseHistoryForBug + getReleaseHistoryForFeature with 7-test Vitest TDD suite (RED → GREEN, ISO timestamps)**

## Performance

- **Duration:** 2 min
- **Started:** 2026-05-08T05:31:21Z
- **Completed:** 2026-05-08T05:33:15Z
- **Tasks:** 2 (RED + GREEN)
- **Files modified:** 2

## Accomplishments

- `getReleaseHistoryForBug(bugId: string): Promise<ReleaseHistoryRow[]>` — Drizzle typed select with innerJoin(release_logs) on releaseLogLinks.releaseId, filtered by bugId, ordered COALESCE(deployedAt, releasedAt) DESC NULLS LAST
- `getReleaseHistoryForFeature(featureId: string): Promise<ReleaseHistoryRow[]>` — identical shape, filters by featureId
- `ReleaseHistoryRow` interface exported for 12-02/12-03 consumers (releaseLogId, version, env, deployedAt, releasedAt, projectKey — all timestamps as ISO strings)
- 7-test Vitest suite: happy/multi-version, empty, ordering with null deployedAt fallback, env-split no-dedup, feature happy, feature empty, Date→ISO conversion

## Function Signatures

```typescript
export interface ReleaseHistoryRow {
  releaseLogId: string;
  version: string;
  env: 'dev' | 'prod' | null;
  deployedAt: string | null;   // ISO; null when deployed_at is null
  releasedAt: string;          // ISO; release_logs.released_at is NOT NULL
  projectKey: string;          // release_logs.project (project key slug)
}

export async function getReleaseHistoryForBug(bugId: string): Promise<ReleaseHistoryRow[]>
export async function getReleaseHistoryForFeature(featureId: string): Promise<ReleaseHistoryRow[]>
```

## Test Coverage (7 tests, 7/7 pass)

| Test | Scenario |
|------|----------|
| Test 1 | `getReleaseHistoryForBug` happy/multi-version: 2 release_logs → 2 rows, most-recent first |
| Test 2 | `getReleaseHistoryForBug` empty: no links → returns [] |
| Test 3 | `getReleaseHistoryForBug` ordering: 3 rows including null deployedAt (falls back to releasedAt) |
| Test 4 | `getReleaseHistoryForBug` env-split: same version in dev AND prod → both rows returned (no dedup) |
| Test 5 | `getReleaseHistoryForFeature` happy: mirror of Test 1 filtered by featureId |
| Test 6 | `getReleaseHistoryForFeature` empty: returns [] |
| Test 7 | Date→ISO conversion: mock returns Date objects; result timestamps are ISO strings |

## Task Commits

1. **Task 1: Write release-history.test.ts (RED)** - `3ebda8b` (test)
2. **Task 2: Implement release-history.ts (GREEN)** - `0b91696` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `src/lib/release-history.ts` — exports ReleaseHistoryRow, getReleaseHistoryForBug, getReleaseHistoryForFeature (104 lines)
- `src/lib/release-history.test.ts` — Vitest suite with 7 tests, vi.mock('@/lib/db'), chainable select mock (226 lines)

## Decisions Made

- **Two separate query functions, not a shared internal** — follows pipeline-summary.ts precedent; one mock per function call in tests, clearer callsites in 12-02/12-03 pages
- **toIso helper local to file** — pipeline-summary.ts has its own copy; both files remain self-contained with no cross-dependency
- **releasedAt typed as `string` (not `string | null`)** — release_logs.released_at is NOT NULL in schema; consumers don't need null guards on this field
- **No formatRelativeTime in this lib** — ISO strings only; render-side concern deferred to 12-02/12-03 per CONTEXT.md

## Deviations from Plan

None — plan executed exactly as written. TDD RED→GREEN discipline maintained with distinct commits.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- `getReleaseHistoryForBug` and `getReleaseHistoryForFeature` are ready to be called from 12-02 (bug detail page) and 12-03 (feature detail page)
- `ReleaseHistoryRow` interface exported — page components import directly from `@/lib/release-history`
- Consumers call `formatRelativeTime(row.deployedAt ?? row.releasedAt)` for display; the lib guarantees ISO strings (no Date objects in result)

---
*Phase: 12-bug-and-feature-detail-pages*
*Completed: 2026-05-08*

## Self-Check: PASSED

- src/lib/release-history.ts: FOUND
- src/lib/release-history.test.ts: FOUND
- .planning/phases/12-bug-and-feature-detail-pages/12-01-SUMMARY.md: FOUND
- Commit 3ebda8b (RED — test): FOUND
- Commit 0b91696 (GREEN — feat): FOUND
