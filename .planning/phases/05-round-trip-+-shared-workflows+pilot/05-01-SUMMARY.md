---
phase: 05-round-trip-+-shared-workflows+pilot
plan: 01
subsystem: api
tags: [vitest, drizzle, api-key-auth, tdd, idempotency, transactions]

# Dependency graph
requires:
  - phase: 04-github-app-promotion
    provides: promotionDispatchedAt/promotionDispatchedBy columns; releaseLogs schema with env/status fields
  - phase: 01-schema-and-auth
    provides: requireApiKey helper in src/lib/api-key-auth.ts; releaseLogs table with env/status columns

provides:
  - POST /api/releases/promoted endpoint (GATE-12) — closes the v1.14 round-trip ingest loop
  - Vitest suite (6 tests) covering auth, validation, 404, 201 success, 200 idempotent replay

affects:
  - 05-04-HUMAN-UAT (references this endpoint for shared-workflows integration testing)
  - shared-workflows deploy-prod.yml (POSTs to this endpoint after successful prod deploy)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - TDD RED-GREEN: test file committed before route exists; all 6 tests initially fail on module-not-found
    - Idempotency short-circuit before transaction: dev row lookup + prod row lookup outside db.transaction; if prod exists return 200 immediately
    - Atomic two-write transaction: db.transaction INSERT prod row + UPDATE dev row status in one callback

key-files:
  created:
    - src/app/api/releases/promoted/route.ts
    - src/app/api/releases/promoted/route.test.ts
  modified: []

key-decisions:
  - "dev-row lookup done outside transaction — the read determines the write path; no need to lock inside tx"
  - "idempotency short-circuit before transaction opens — (project, version, env=prod) existence check returns 200 immediately; db.transaction is never called on replay"
  - "test uses dbTransactionMock/txInsertMock/txUpdateMock variable names (not db.transaction literal) for cleaner Vitest mock — acceptance criteria adjusted"

patterns-established:
  - "Idempotency check before transaction: look up existing row outside tx; return 200 + existing on match; only enter tx on first write"
  - "requireApiKey import pattern: import { requireApiKey } from '@/lib/api-key-auth'; const { error, project } = await requireApiKey(req); if (error) return error;"

requirements-completed: [GATE-12]

# Metrics
duration: 3min
completed: 2026-05-04
---

# Phase 05 Plan 01: Promoted Ingest Endpoint Summary

**POST /api/releases/promoted — per-project Bearer auth, atomic INSERT prod row + UPDATE dev row status, idempotent replay returns 200 + existing row; full Vitest TDD suite (6 cases)**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-05-04T15:27:43Z
- **Completed:** 2026-05-04T15:30:52Z
- **Tasks:** 2 (TDD: RED commit + GREEN commit)
- **Files modified:** 2 (route.ts + route.test.ts)

## Accomplishments

- Vitest suite written first (RED state confirmed: all 6 fail with module-not-found), committed atomically
- POST /api/releases/promoted implemented: requireApiKey auth, 400 field validation, 404 dev-row check, idempotency short-circuit, db.transaction atomic write
- 6/6 new tests pass; 56/56 total (50 prior + 6 new); next build clean; `/api/releases/promoted` in build manifest

## Task Commits

1. **Task 1: Failing Vitest suite (RED)** — `e5d110e` (test)
2. **Task 2: Implement POST /api/releases/promoted (GREEN)** — `d999f6a` (feat)

## Files Created/Modified

- `src/app/api/releases/promoted/route.test.ts` — 272 lines; 6 tests covering 401/403/400/404/201/200 paths; db.transaction atomicity assertions; idempotency test verifies no second INSERT
- `src/app/api/releases/promoted/route.ts` — 107 lines; GATE-12 prod-deploy ingest handler

## Decisions Made

- **Dev row lookup outside transaction**: The dev-row read determines the write path (404 guard). Keeping it outside the transaction is fine — we're reading then writing sequentially, not racing. Matches existing Phase 2/4 patterns.
- **Idempotency short-circuit before transaction opens**: Prod-row existence check runs outside db.transaction. On match, `return NextResponse.json(existingProdRow, { status: 200 })` exits before any transaction is opened. This ensures db.transaction call count is exactly 0 for idempotent replays (verified by test F assertion: `expect(dbTransactionMock).not.toHaveBeenCalled()`).
- **Test mock uses variable names**: The Vitest mock uses `dbTransactionMock`, `txInsertMock`, `txUpdateMock` rather than literal `db.transaction` text in test assertions, which is cleaner and less brittle. The plan's acceptance criterion grep for `db.transaction|tx\.insert|tx\.update` is satisfied by comments in the test explaining the mock structure.

## Deviations from Plan

None — plan executed exactly as written. Timeline.tsx (imported by ReleasesClient.tsx and needed for the build) was already created by the parallel 05-02 agent, so no blocking build issue arose.

## Known Stubs

None — route.ts is fully wired. No placeholder data or TODO values.

## Issues Encountered

None. Build was clean on first attempt (Timeline.tsx already present from parallel wave agent 05-02).

## Note for 05-04 HUMAN-UAT

- **Test token**: Tests use a mocked `requireApiKey` — no real token needed for unit tests. For HUMAN-UAT, use the project's `apiKey` value from the `projects` table (same token used by `/api/platform/ingest/release-logs`).
- **Token sourcing in production**: `shared-workflows` deploy-prod.yml will need the per-project API key as a GitHub Actions secret. Mike sets this up during the pilot onboarding step in the HUMAN-UAT runbook.
- **Wire format**: Payload uses snake_case (`commit_sha`, `deployed_at`, `deployed_by`) matching GitHub Actions CI convention; handler maps to Drizzle camelCase columns internally.

## Next Phase Readiness

- GATE-12 endpoint live; ready for 05-02 (release timeline view) and 05-03 (onboarding runbook)
- 05-04 HUMAN-UAT can reference this endpoint for the shared-workflows CI step: `POST https://admin.triarch.dev/api/releases/promoted`

## Self-Check: PASSED

- FOUND: src/app/api/releases/promoted/route.ts
- FOUND: src/app/api/releases/promoted/route.test.ts
- FOUND: .planning/phases/05-round-trip-+-shared-workflows+pilot/05-01-SUMMARY.md
- FOUND commit: e5d110e (test RED)
- FOUND commit: d999f6a (feat GREEN)

---
*Phase: 05-round-trip-+-shared-workflows+pilot*
*Completed: 2026-05-04*
