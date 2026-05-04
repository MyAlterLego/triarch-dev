---
phase: 03-slack-interactive-approval
plan: 02
subsystem: release-gating
tags: [refactor, shared-helpers, drizzle, release-actions]
dependency_graph:
  requires: []
  provides: [release-actions.ts/approveRelease, release-actions.ts/rejectRelease]
  affects: [approve/route.ts, reject/route.ts, 03-04-PLAN.md]
tech_stack:
  added: []
  patterns: [pure-helper extraction, shared transaction logic, result-type discriminated union]
key_files:
  created:
    - src/lib/release-actions.ts
  modified:
    - src/app/api/projects/[slug]/releases/[releaseId]/approve/route.ts
    - src/app/api/projects/[slug]/releases/[releaseId]/reject/route.ts
decisions:
  - "RejectResult uses discriminated union (ok: true | false) — callers map code to HTTP status"
  - "reason trimming happens in helper (not caller) — single source of truth for validation"
  - "alreadyApproved short-circuit returns existing approval row from DB query (not null) for idempotency"
metrics:
  duration: 99s
  completed: "2026-05-04"
  tasks_completed: 2
  tasks_total: 2
  files_created: 1
  files_modified: 2
---

# Phase 03 Plan 02: Release Actions Helper Extraction Summary

**One-liner:** Pure `approveRelease`/`rejectRelease` helpers extracted from Phase 2 route handlers into `src/lib/release-actions.ts` with atomic transactions, idempotency, and no HTTP coupling.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create src/lib/release-actions.ts | bf966e9 | src/lib/release-actions.ts (created, 121 lines) |
| 2 | Refactor approve + reject routes to delegate | d054933 | approve/route.ts, reject/route.ts (net -89 lines) |

## What Was Built

`src/lib/release-actions.ts` exports two pure async functions callable from any context (HTTP route, Slack callback, test, etc.):

- `approveRelease({ release, approverEmail, ipAddress, userAgent })` — idempotent short-circuit on `status='approved'`, 409-equivalent result on non-dev status, atomic `db.transaction` inserting approval row + updating `releaseLogs.status='approved'`
- `rejectRelease({ release, approverEmail, reason, ipAddress, userAgent })` — reason validation (required, ≤500 chars), 409-equivalent on non-dev status (no idempotency per REJECT-01), atomic transaction

Both route handlers (approve/route.ts, reject/route.ts) preserve their auth chain exactly (steps 1–6: requireSignedIn → getCurrentUserContext → project lookup → membership check → role check → release lookup) and delegate only the DB-write step to the helpers. Response JSON shape is byte-identical to Phase 2's contract consumed by `ReleasesClient`.

## Deviations from Plan

None — plan executed exactly as written.

## Success Criteria Verification

- [x] `approveRelease` + `rejectRelease` importable from `@/lib/release-actions` — confirmed via `grep` and build
- [x] Both Phase 2 routes delegate DB-write step, auth chain unchanged
- [x] Idempotency (alreadyApproved:true on re-approve) preserved in helper
- [x] Asymmetric reject behavior (409 on double-reject, no idempotency) preserved
- [x] `db.transaction()` count = 2 in release-actions.ts, 0 in each route
- [x] `REASON_MAX_CHARS` removed from reject/route.ts (lives in helper)
- [x] `NextRequest`/`NextResponse` count = 0 in release-actions.ts (pure logic)
- [x] Line count ≥ 80 in release-actions.ts (actual: 121)
- [x] `npx tsc --noEmit` exits 0
- [x] `npx next build` exits 0 — both routes in manifest at same paths

## Known Stubs

None.

## Self-Check: PASSED

- src/lib/release-actions.ts: FOUND
- commit bf966e9: FOUND
- commit d054933: FOUND
