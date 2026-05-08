---
phase: 11-commit-parser-and-tracker-linkage-authoring
plan: 03
subsystem: api
tags: [vitest, tdd, drizzle, inarray, commit-parsing, release-links, link-stamper]

requires:
  - phase: 11-commit-parser-and-tracker-linkage-authoring
    plan: 01
    provides: parseCommitRefs() pure function returning ParsedRef[] discriminated union

provides:
  - stampLinksFromCommit(releaseId, commitMessage, projectKey) — validates parsed refs against DB, writes release_log_links with source='commit'
  - 18-case Vitest suite verifying batching, dedup, null github_repo guard, error isolation
  - Ingest route auto-stamps links after every CI release INSERT (non-blocking try/catch)

affects:
  - 11-04 (manual link authoring UI reads release_log_links rows now being populated by stamper)
  - 12 (Released-in sidebar reads release_log_links — data now flows from CI ingest)

tech-stack:
  added: []
  patterns:
    - inArray batched DB validation — one query per entity type, never per-ID
    - Set-based dedup before INSERT — duplicate refs in same commit produce single row
    - Double-layer error isolation — stamper try/catch + route try/catch (defense-in-depth per Pitfall 5)
    - messageText resolution hierarchy — body.commitMessage → summary → entries[].description concat

key-files:
  created:
    - src/lib/link-stamper.ts
    - src/lib/link-stamper.test.ts
  modified:
    - src/app/api/platform/ingest/release-logs/route.ts

key-decisions:
  - "inArray for batch bug/feature validation — never per-ID queries (Pitfall 5 false-positive guard + performance)"
  - "External #N refs dropped silently when projects.github_repo is null — no phantom links"
  - "Project lookup only issued when externalRefs.length > 0 — zero DB calls for commit messages with no #N refs"
  - "Bug/feature queries only issued when respective ID buckets are non-empty — prevents inArray([]) SQL error"
  - "messageText resolution: body.commitMessage preferred, falls back to summary, then concatenated entries[].description"
  - "Stamper is forgiving internally (try/catch) AND wrapped at call site in route — two layers for defense-in-depth"

patterns-established:
  - "Stamper pattern: parse (pure) → bucket → validate (batched inArray) → build rows → single INSERT"
  - "Non-blocking hook pattern: try/catch wrap AFTER INSERT, BEFORE response — stamper failure never returns 500"

requirements-completed: [LINK-02, LINK-03]

duration: 5min
completed: 2026-05-08
---

# Phase 11 Plan 03: Link Stamper + Ingest Hook Summary

**DB-validated commit ref stamper using inArray batch queries writes release_log_links rows with source='commit', hooked non-blockingly into the CI release ingest route via try/catch after INSERT**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-05-08T04:46:12Z
- **Completed:** 2026-05-08T04:51:50Z
- **Tasks:** 3 (TDD RED + GREEN + ingest hook)
- **Files modified:** 3

## Accomplishments

- 18-case Vitest suite covers bug/feature/external validation, mixed valid+invalid, dedup (Set-based), null github_repo guard, batching call counts, empty message fast-path, and both DB error scenarios (INSERT throw + reject)
- stampLinksFromCommit validates BUG/FEAT UUIDs via single inArray per type, constructs external GitHub URLs only when projects.github_repo is non-null, deduplicates refs before INSERT, and catches all internal errors — never throws
- Ingest route hook adds 34 lines: messageText resolution IIFE + try/catch wrapping stampLinksFromCommit call after the existing `.returning()` INSERT — zero changes to existing INSERT or 201 response shape

## Task Commits

1. **Task 1: Write link-stamper.test.ts (RED)** - `83b1f9f` (test)
2. **Task 2: Write link-stamper.ts implementation (GREEN)** - `5e3bbca` (feat)
3. **Task 3: Hook stamper into release-logs ingest route** - `f386c40` (feat)

## Files Created/Modified

- `src/lib/link-stamper.ts` — Exports `stampLinksFromCommit({ releaseId, commitMessage, projectKey })`: parse → bucket → inArray validate → build rows → single INSERT; top-level try/catch returns `{ stamped: 0, dropped: N }` on error; 125 lines
- `src/lib/link-stamper.test.ts` — 18 Vitest `it()` blocks; mocks `@/lib/db` with chainable select/insert stubs; covers all plan scenarios + batching call counts
- `src/app/api/platform/ingest/release-logs/route.ts` — Added import + 34-line try/catch block after INSERT `.returning()` call; messageText IIFE resolves commit message from body.commitMessage → summary → entries[].description

## Decisions Made

- Bug and feature queries are conditionally issued (`if (bugIds.length > 0)`) to avoid `inArray([])` SQL error — this means the test mock call indices must account for skipped queries. Test mock responses were updated during GREEN phase accordingly (Rule 1 auto-fix of test setup mismatch discovered during GREEN run).
- External #N refs are integer-only (no hyphens) per commit-parser Pattern C — the `ref` field from `ParsedRef` carries the raw number string used in URL construction.
- `mockDbInsertValues.mockReturnValueOnce(Promise.reject(...))` pattern chosen over `mockImplementationOnce(() => { throw ... })` to properly simulate async INSERT rejection through the mock's `.values()` wrapper.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed test mock call-index mapping for skipped queries**
- **Found during:** Task 2 (GREEN implementation run)
- **Issue:** 5 tests failed on first GREEN run because `setupSelectResponses` was configured assuming bug+feature queries always fire (indices 0 and 1), but the implementation skips each `inArray` call when the corresponding ID bucket is empty. Messages with only FEAT refs skip bug query → feature becomes index 0; messages with only #N refs skip both → project becomes index 0.
- **Fix:** Updated test mock response maps to match actual call order: feature-only message → `{ 0: [feat row] }`; external-only message → `{ 0: [project row] }`; bug+external message → `{ 0: [bug row], 1: [project row] }`. Also updated INSERT mock to return the value of `mockDbInsertValues()` so `mockReturnValueOnce(Promise.reject(...))` works correctly for error-path tests.
- **Files modified:** `src/lib/link-stamper.test.ts`
- **Verification:** All 18 tests GREEN after fix; `npx vitest run src/lib/link-stamper.test.ts` exits 0
- **Committed in:** `5e3bbca` (GREEN task commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — test setup bug discovered during first GREEN run)
**Impact on plan:** Minimal — implementation logic unchanged; test mock indices corrected. No behavioral deviation from plan spec.

## Issues Encountered

None beyond the test mock index mismatch documented above.

## Known Stubs

None — all logic is wired end-to-end: parser → stamper → DB INSERT → ingest route hook. No placeholder values or hardcoded empty returns in the happy path.

## Next Phase Readiness

- Plan 11-04 (manual link authoring UI) is unblocked — `release_log_links` rows now populate on every CI ingest containing recognizable refs
- Phase 12 (Released-in sidebar) is unblocked — data pipeline from CI push → release_log_links is live
- Manual smoke test: POST a fake release with `commitMessage: "BUG-{seeded-uuid}"` to `/api/platform/ingest/release-logs` and confirm `release_log_links` row appears with `link_type='bug'` and `source='commit'`

---
*Phase: 11-commit-parser-and-tracker-linkage-authoring*
*Completed: 2026-05-08*
