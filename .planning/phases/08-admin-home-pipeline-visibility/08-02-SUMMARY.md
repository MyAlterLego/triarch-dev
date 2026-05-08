---
phase: 08-admin-home-pipeline-visibility
plan: 02
subsystem: database
tags: [drizzle, postgresql, cockroachdb, vitest, tdd, pipeline, release-logs]

# Dependency graph
requires:
  - phase: 08-admin-home-pipeline-visibility
    plan: 01
    provides: composite index (project, env, deployed_at DESC) on release_logs

provides:
  - getProjectPipelineSummaries() server-side helper with PipelineSummary type
  - WhatChangedSummary type and PipelineState union type
  - 10-test Vitest suite covering DISTINCT ON correctness, null-env exclusion, type bucketing, parity/inverted/dev-ahead states

affects:
  - 08-03 (admin/page.tsx consumes getProjectPipelineSummaries)
  - 09 (per-project pipeline page reuses same helper)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "DISTINCT ON (project, env) raw SQL via db.execute() for latest-per-group queries (Drizzle limitation)"
    - "Drizzle typed builder for count and dev-rows queries to minimize raw SQL surface area"
    - "JS-side filter for what-changed cutoff (fetch all dev rows, filter in JS — correct for small volume)"
    - "Version comparison for parity vs inverted state (same version = parity; different version + prod newer = inverted)"

key-files:
  created:
    - src/lib/pipeline-summary.ts
    - src/lib/pipeline-summary.test.ts
  modified: []

key-decisions:
  - "Raw SQL (db.execute) used for DISTINCT ON query — Drizzle typed builder does not support DISTINCT ON natively"
  - "Safer alternative for what-changed: fetch all dev rows via Drizzle typed builder, filter in JS by per-project prod cutoff (avoids unnest SQL injection risk)"
  - "No getProjectPipelineSummary singular variant — Plan 03 and Phase 9 both call plural with array; one function = one test surface"
  - "pendingApprovalCount uses separate grouped aggregate query (independent of latest-per-env semantics)"
  - "ISO date strings (not Date objects) in return shape — JSON-serializable for server → client island handoff in Phase 9"
  - "parity vs inverted distinction: same version = parity; different versions AND prod newer by timestamp = inverted"

patterns-established:
  - "TDD: RED commit (test + stub) then GREEN commit (implementation) for all data-layer helpers"
  - "DISTINCT ON query correctness: always WHERE env IN ('dev','prod'), COALESCE(deployed_at, released_at) DESC NULLS LAST"

requirements-completed:
  - PIPE-01
  - PIPE-02
  - PIPE-03
  - PIPE-06

# Metrics
duration: 5min
completed: 2026-05-07
---

# Phase 08 Plan 02: Pipeline Summary Helper Summary

**Testable `getProjectPipelineSummaries()` server helper with DISTINCT ON query, COALESCE null handling, and what-changed one-liner derivation covering parity/dev-ahead/inverted pipeline states**

## Performance

- **Duration:** 5 min
- **Started:** 2026-05-08T02:36:52Z
- **Completed:** 2026-05-08T02:41:52Z
- **Tasks:** 2 (Task 1: TDD RED, Task 2: TDD GREEN)
- **Files modified:** 2 (created)

## Accomplishments

- Exported `PipelineSummary`, `WhatChangedSummary`, `PipelineState` types as specified in plan
- Implemented `getProjectPipelineSummaries(projectKeys)` with three sub-queries: DISTINCT ON (raw SQL), pending count (Drizzle typed), dev rows (Drizzle typed + JS filter)
- 10/10 Vitest tests GREEN covering: prod+dev, prod-only, dev-only, null-env exclusion, COALESCE fallback, what-changed breakdown, parity, inverted, pending count, projectKeys filter

## Task Commits

Each task was committed atomically:

1. **Task 1: Define types and write failing tests** - `7853f47` (test)
2. **Task 2: Implement getProjectPipelineSummaries** - `8f318f5` (feat)

**Plan metadata:** committed separately

_Note: TDD tasks — RED commit then GREEN commit_

## Files Created/Modified

- `src/lib/pipeline-summary.ts` — Exported types + `getProjectPipelineSummaries()` with DISTINCT ON query, COALESCE ordering, what-changed bucketing, pipeline state derivation
- `src/lib/pipeline-summary.test.ts` — 10-test Vitest suite with db mock, covering all behavior cases from plan spec

## Decisions Made

- Used `db.execute(sql\`...\`)` for DISTINCT ON query (Drizzle typed builder doesn't support DISTINCT ON — PostgreSQL/CockroachDB extension per Pitfall 8)
- Used Drizzle typed builder for pending count and dev rows queries (typesafe, simpler, minimizes raw SQL surface area)
- Chose "safer alternative" for what-changed: fetch all dev rows for relevant projects via typed builder, filter in JS by per-project prod cutoff timestamp. Volume is small (10s of rows per project); avoids dynamic unnest SQL injection risk.
- `parity` vs `inverted` distinction uses version comparison: same version = parity (just promoted; dev caught up to prod); different version AND prod timestamp newer = inverted (prod jumped ahead with hotfix). Pure timestamp comparison failed Test 7/8 distinction.
- Fixed test mock to use camelCase field names (`deployedAt`/`releasedAt`) to match actual Drizzle typed select return shape — original test had snake_case which was a test bug

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed test mock field names from snake_case to camelCase**
- **Found during:** Task 2 (implementation — tests 6 failing)
- **Issue:** Test mock returned `{ deployed_at: '...', released_at: '...' }` but Drizzle typed select returns `{ deployedAt: ..., releasedAt: ... }` (camelCase). Implementation correctly used Drizzle camelCase; test mock was wrong.
- **Fix:** Updated dev rows mock in Test 6 to use `deployedAt`/`releasedAt` (camelCase) matching Drizzle's actual output
- **Files modified:** `src/lib/pipeline-summary.test.ts`
- **Verification:** All 10 tests pass after fix
- **Committed in:** `8f318f5` (Task 2 GREEN commit)

**2. [Rule 1 - Bug] Fixed parity vs inverted state derivation**
- **Found during:** Task 2 (Test 7 failing — expected parity but got inverted)
- **Issue:** Plan's action spec said `devTs <= prodTs → inverted` but Test 7 (both v1.0.0, dev 1 day behind prod) expected `parity`. Pure timestamp comparison couldn't distinguish "just promoted" (parity) from "prod jumped ahead with different version" (inverted).
- **Fix:** Used version comparison: same version + dev behind timestamp → parity; different versions + prod newer → inverted. Tests 7 and 8 both pass.
- **Files modified:** `src/lib/pipeline-summary.ts`
- **Verification:** Both Test 7 (parity) and Test 8 (inverted) pass
- **Committed in:** `8f318f5` (Task 2 GREEN commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 — Bug)
**Impact on plan:** Both fixes necessary for correctness. The test mock bug was introduced during plan writing; the parity/inverted fix resolves an ambiguity in the action spec that the behavior spec clarified through the test assertions.

## Issues Encountered

None beyond the two auto-fixed deviations documented above.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- `getProjectPipelineSummaries(projectKeys)` is ready for Plan 03 (`admin/page.tsx`) to import and consume
- All exports match the interface specified in the plan's `must_haves.artifacts` section
- Phase 9 can reuse the same helper for the per-project pipeline page without modification
- TypeScript compiles cleanly; no type errors anywhere in the codebase

---
*Phase: 08-admin-home-pipeline-visibility*
*Completed: 2026-05-07*
