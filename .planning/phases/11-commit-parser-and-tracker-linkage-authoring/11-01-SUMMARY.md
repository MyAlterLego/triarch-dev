---
phase: 11-commit-parser-and-tracker-linkage-authoring
plan: 01
subsystem: testing
tags: [vitest, regex, commit-parsing, tdd, pure-function, uuid]

requires:
  - phase: 10-schema-gate
    provides: release_log_links table and schema gate establishing LINK-01

provides:
  - parseCommitRefs(message) pure function extracting ParsedRef[] from commit messages
  - ParsedRef discriminated union type (bug | feature | external)
  - 27-case Vitest test suite covering all 3 regex patterns + edge cases

affects:
  - 11-02 (link-stamper.ts consumes parseCommitRefs and ParsedRef[])
  - 11-03 (manual link authoring UI sits alongside auto-detected links)

tech-stack:
  added: []
  patterns:
    - Pattern B fires before Pattern A to prevent double-counting verb-prefixed UUID refs
    - Space-pad stripping technique blanks verb-prefixed regions before Pattern A scan
    - Set<string> keyed by type:id for dedup; canonical lowercase UUIDs for DB lookup
    - Pure function module: zero DB/IO imports, stateless, trivially unit-testable

key-files:
  created:
    - src/lib/commit-parser.ts
    - src/lib/commit-parser.test.ts
  modified: []

key-decisions:
  - "Pattern B (verb-prefixed) fires before Pattern A; verb-prefix regions space-padded before Pattern A scan to prevent double-counting"
  - "All UUID output lowercased to canonical form for DB lookup in link-stamper"
  - "Bare #N GitHub issue refs only match when preceded by verb (closes/fixes/resolves) — no verb = no match (Pitfall 5 guard)"
  - "Malformed UUIDs (wrong segment count, non-hex chars) rejected by full UUID regex (8-4-4-4-12 hex)"
  - "ParsedRef is a discriminated union type: bug/feature carry `id`, external carries `ref`"

patterns-established:
  - "Commit parser pattern: Pattern B before Pattern A, space-pad stripped regions"
  - "TDD RED/GREEN cycle: test file committed failing, implementation committed passing"

requirements-completed: [LINK-02, LINK-03]

duration: 3min
completed: 2026-05-07
---

# Phase 11 Plan 01: Commit Parser Summary

**Pure regex commit message parser with 27 Vitest tests — extracts BUG/FEAT UUID refs and external #N GitHub issues via 3-pattern approach with full UUID format validation, dedup, and verb-prefix double-count guard**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-05-07T23:40:00Z
- **Completed:** 2026-05-07T23:42:20Z
- **Tasks:** 2 (TDD RED + GREEN)
- **Files modified:** 2

## Accomplishments

- 27-case Vitest suite covers all 3 patterns (direct UUID, verb-prefixed UUID, verb-prefixed #N), 7 negative cases (malformed UUIDs, version tags, PR refs, commit hashes), 3 dedupe cases, and source='commit' invariant
- Regex patterns anchored with word boundaries and full 8-4-4-4-12 UUID format — eliminates false positives from 7-digit commit hashes, `v1.2.3` version tags, and `/pull/42` PR URLs (Pitfall 5 guard)
- Space-pad technique strips verb-prefixed UUID regions before Pattern A scan, preventing double-counting without losing character offsets
- File is completely pure: zero DB, zero I/O, no Next.js imports — ready for unit testing in any environment

## Task Commits

1. **Task 1: Write commit-parser.test.ts (RED)** - `e0b81df` (test)
2. **Task 2: Write commit-parser.ts implementation (GREEN)** - `5ad3d15` (feat)

## Files Created/Modified

- `src/lib/commit-parser.ts` — Exports `parseCommitRefs(message: string): ParsedRef[]` and `ParsedRef` discriminated union type; 136 lines; zero external imports
- `src/lib/commit-parser.test.ts` — 27 Vitest `it()` blocks; covers Pattern A/B/C, negative cases, dedupe, multi-match, source invariant

## Decisions Made

- Pattern B (verb-prefixed) runs before Pattern A to prevent double-counting — e.g., `closes BUG-{uuid}` produces exactly one result, not two
- Space-pad stripping technique chosen over regex alternation to preserve character offsets while blanking verb-prefixed regions before Pattern A scan
- Bare `#42` without a preceding verb does NOT match (plain `#N` would false-positive on PR numbers, quoted strings in prose)
- `ParsedRef` is a discriminated union with `id` on bug/feature and `ref` on external — downstream link-stamper can switch on `type` without checking field existence

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## Self-Check

- `src/lib/commit-parser.ts` exists: FOUND
- `src/lib/commit-parser.test.ts` exists: FOUND
- RED commit `e0b81df` exists: FOUND
- GREEN commit `5ad3d15` exists: FOUND
- 27 tests pass: CONFIRMED
- Zero DB/IO imports: CONFIRMED

## Self-Check: PASSED

## Next Phase Readiness

- Plan 11-02 (link-stamper.ts) is unblocked — `import { parseCommitRefs, ParsedRef } from '@/lib/commit-parser'` is available
- `ParsedRef[]` shape is locked: downstream consumer can switch on `type` field
- All 27 tests GREEN, type check clean, no stubs

---
*Phase: 11-commit-parser-and-tracker-linkage-authoring*
*Completed: 2026-05-07*
