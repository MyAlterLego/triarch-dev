---
phase: 36-inclusion-approval-state-machine
plan: 04
subsystem: api
tags: [prod-ingest, state-machine, transaction, audit, idempotency, inclusion-state]

requires:
  - phase: 36
    plan: 01
    provides: "inclusion_state + next_release_log_id columns + workflowTransitions schema"
  - phase: 5
    provides: "GATE-12 prod-deploy round-trip ingest endpoint with atomic db.transaction"

provides:
  - "INCL-07 built→deployed batch-flip inside the existing prod-ingest db.transaction"
  - "Combined workflow_transitions audit INSERT (entity_type='bug_report'/'feature_request', from='built', to='deployed', transitionedBy='prod-ingest:{commit_sha}')"
  - "Idempotency guard via WHERE inclusion_state='built' clause — re-ingest is a no-op"
  - "Audit insert skipped when auditRows.length === 0 — no empty-rows DB call"

affects:
  - "36-07 portal /upcoming page (consumes inclusion_state='deployed' as terminal shipped signal)"
  - "Every project's prod-deploy CI ingest — admin response shape unchanged; new side-effect is transparent"
  - "workflow_transitions read paths — gain prod-ingest provenance rows alongside existing manual + commit-parser rows"

tech-stack:
  added: []
  patterns:
    - "Atomic state-flip + audit inside an existing db.transaction (Pitfall 3 — same tx)"
    - "Idempotency via WHERE clause on the state column itself (Pitfall 5)"
    - "Single batched workflow_transitions INSERT covering multiple entity types"
    - "Vitest tx mock with queue-driven returning() — txUpdateReturningQueue shifts per call to simulate variable per-test flip counts"

key-files:
  created: []
  modified:
    - "src/app/api/releases/promoted/route.ts (extended transaction at lines 81-104 → now 81-156; +49/-1)"
    - "src/app/api/releases/promoted/route.test.ts (extended with INCL-07 describe block; 6→12 tests; +253/-49)"

key-decisions:
  - "Audit insert is SKIPPED when auditRows.length === 0 (no empty-insert DB round-trip) — verified by Test 3 + Test 4"
  - "next_release_log_id stays anchored to devRow.id, NOT inserted.id (prod row id) — preserves CONTEXT.md D-13 dev-row provenance; prod join is reached via release_logs.version lookup. metadata.prodReleaseLogId provides the dev↔prod link in the audit row without polluting bug/feature FK semantics"
  - "Single combined workflow_transitions INSERT (one DB round-trip for N audit rows) instead of one INSERT per entity type — same atomic guarantee, fewer round-trips"
  - "Test 5 (atomicity) asserts the tx callback REJECTS when audit insert throws — the route does not catch tx errors, so the rejection propagates and Next.js returns 500. Real CRDB tx semantics ensure all writes roll back together"

patterns-established:
  - "Vitest tx mock with FIFO queue for .returning() results: each call to tx.update(...).set(...).where(...).returning() shifts the next array off the queue. Pattern documented inline in route.test.ts defaultTxMocks() helper for future tx-bound route tests."
  - "When extending an existing endpoint's transaction with batched state flips, prefer a single combined audit INSERT over per-row inserts — same atomicity, fewer round-trips, simpler rollback story"
  - "Idempotency on auto-flip endpoints can be enforced TWO WAYS in defense-in-depth: (a) caller-level early-return on duplicate INSERT (GATE-12 line 76-78), (b) state-guard in the WHERE clause (Pitfall 5 — INCL-07 line 113-114). Tests 2 + 3 exercise both paths."

requirements-completed: [INCL-07]

duration: ~3min
completed: 2026-05-18T18:17Z
---

# Phase 36-04: Prod-Ingest Auto-Flip Summary

**Prod-ingest endpoint now atomically flips bug_reports/feature_requests from `inclusion_state='built'` to `'deployed'` for every item linked to the dev release row, all inside the existing GATE-12 transaction, with combined workflow_transitions audit. Idempotent via WHERE-clause state guard; closes INCL-07.**

## Performance

- **Duration:** ~3 min (record + RED + GREEN + grep + commit)
- **Started:** 2026-05-18T18:14Z
- **Completed:** 2026-05-18T18:17Z
- **Tasks:** 1/1 (TDD: RED commit + GREEN commit)
- **Tests added:** 6 (existing 6 GATE-12 tests + 6 new INCL-07 tests = 12 total, all GREEN)
- **Files modified:** 2 (route.ts +49/-1, route.test.ts +253/-49)

## Accomplishments

- **INCL-07 batch-flip lives inside the existing db.transaction** — no new transaction was opened (`grep -c "db.transaction" returns 1`). Atomicity inherited from the GATE-12 contract: prod INSERT + dev UPDATE + bug-flip + feat-flip + audit INSERT either all commit or all roll back.
- **Audit row provenance** — `transitionedBy='prod-ingest:{commit_sha}'`, `reason='auto-flip on prod deploy'`, `metadata.prodReleaseLogId={inserted.id}`. Queryable via `SELECT ... WHERE transitioned_by LIKE 'prod-ingest:%'` for ops visibility.
- **Pitfall 5 idempotency satisfied** — WHERE clause requires `inclusion_state='built'`; re-ingest matches 0 rows; `auditRows.length === 0` skips the audit INSERT entirely. Verified by Test 3.
- **Pitfall 3 audit-inside-tx satisfied** — `tx.insert(workflowTransitions)` called on the same `tx` parameter as the UPDATEs. Verified by Test 5: when audit throws, the tx callback rejects and Next.js surfaces the error (in a real CRDB tx, all upstream writes roll back).
- **GATE-12 response contract preserved** — 401/403/400/404/200/201 shapes unchanged; Tests A-F + Test 6 cover all existing paths.
- **12/12 Vitest GREEN**, zero TypeScript errors on changed file.

## Task Commits

1. **Task 1 RED: failing tests for INCL-07** — `a6cb5b4` (test)
2. **Task 1 GREEN: prod-ingest auto-flip implementation** — `08b5142` (feat)

_SUMMARY.md to be committed separately via the parent orchestrator (parallel-wave coordination)._

## Files Modified

- `src/app/api/releases/promoted/route.ts`
  - Added `bugReports`, `featureRequests`, `workflowTransitions` to schema imports (line 6)
  - Extended `db.transaction(async (tx) => { ... })` block:
    - `tx.update(bugReports).set({inclusionState:'deployed', updatedAt: now}).where(and(eq(nextReleaseLogId, devRow.id), eq(inclusionState, 'built'))).returning({id})` → captures flipped bug IDs
    - Same pattern for `featureRequests`
    - Combined `tx.insert(workflowTransitions).values([...bugAuditRows, ...featAuditRows])` — only when `auditRows.length > 0`

- `src/app/api/releases/promoted/route.test.ts`
  - Added `bugReports`, `featureRequests`, `workflowTransitions` to the `@/db/schema` mock surface
  - Added `txUpdateReturningQueue` FIFO + `txInsertCalls` capture array
  - Refactored `defaultTxMocks()` helper — `tx.update(...).set().where().returning()` shifts from queue; `tx.insert(...).values()` captures into `txInsertCalls`
  - Added 6 new tests in `describe('Phase 36 INCL-07: built → deployed auto-flip')`:
    - Test 1 (happy path): 2 bugs + 1 feature flipped, 3 audit rows
    - Test 2: idempotent replay → tx never opens
    - Test 3: WHERE-clause idempotency → tx opens but 0 flips → no audit insert
    - Test 4: no linked items → response unchanged
    - Test 5: atomicity — audit throw rejects tx callback
    - Test 6: 400 path with no DB writes

## GATE-12 Contract Preservation Confirmation

All 6 existing GATE-12 success paths still verified:

| Path | Test | Status |
|------|------|--------|
| 401 no auth | Test A | GREEN |
| 403 bad token | Test B | GREEN |
| 400 missing fields | Test C / Test 6 | GREEN |
| 404 no dev row | Test D | GREEN |
| 201 success (atomic transaction) | Test E (updated for new tx call counts) | GREEN |
| 200 idempotent replay | Test F + Test 2 | GREEN |

## Vitest mock notes (for future tx-bound route tests)

The `tx.update(table).set(updates).where(cond).returning(cols)` chain requires a FIFO queue pattern: each call to `.returning()` shifts the next array off `txUpdateReturningQueue`. Tests push expected return values in CALL ORDER before invoking the route. Order in this plan: bugs first, features second — matches the order they appear in the route body.

The `tx.insert(table).values(rows).returning?()` chain handles both shapes:
- Prod row INSERT calls `.returning()` → returns `[FAKE_PROD_ROW]`
- Audit INSERT awaits `.values()` directly (no `.returning()`) → resolves `undefined`

To support the audit-INSERT path on the `values()` return value, the mock attaches a `then` PromiseLike method to the object returned by `.values()` so `await tx.insert(...).values(...)` resolves cleanly. This composition mirrors how Drizzle's query builder is awaitable at multiple points along the chain.

No closure-state tricks needed beyond the FIFO queue + capture array — `vi.clearAllMocks()` in beforeEach + explicit `.length = 0` on the queue/capture arrays gives clean per-test isolation.

## TMI pilot smoke-test

Not yet executed — pending Phase 36 merge to dev + a real TMI prod-deploy round-trip. The atomic flip will be exercised live on the next TMI prod ingest after this change ships.

## Drizzle-orm operator imports

`and` and `eq` were already imported on line 7. No new operators added (the plan's `<action>` mentioned `inArray` but it was not needed — the WHERE clauses use `and(eq(...), eq(...))` exclusively).

## Self-Check: PASSED

- File `src/app/api/releases/promoted/route.ts` exists and includes the INCL-07 extension (grep counts above match acceptance criteria 1-10)
- File `src/app/api/releases/promoted/route.test.ts` exists with 12 tests
- Commits exist: `a6cb5b4` (test RED), `08b5142` (feat GREEN) — verified via `git log --oneline`
- Vitest run reports `Tests 12 passed (12)` on the route's test file
- No TypeScript errors on the changed file
