---
phase: 36-inclusion-approval-state-machine
plan: 02
subsystem: api
tags: [next-app-router, drizzle, state-machine, audit, transactions, vitest]

requires:
  - phase: 36
    plan: 01
    provides: "inclusion_state column on bug_reports + feature_requests; canManuallyTransition validator in src/lib/inclusion-state.ts"

provides:
  - PATCH /api/platform/bug-reports/[id] accepts inclusionState in body; validates via canManuallyTransition; writes workflow_transitions audit row in same db.transaction
  - PATCH /api/platform/feature-requests/[id] mirrors bug-reports semantics with entityType='feature_request'
  - GET /api/platform/bug-reports accepts ?inclusion_state= filter; validates against INCLUSION_STATES tuple; rejects garbage with 400 invalid_inclusion_state
  - GET /api/platform/feature-requests accepts ?inclusion_state= filter with same validation
  - Atomicity: UPDATE + audit insert co-located in tx so partial writes are impossible (Pitfall 3 closed for new code path AND for pre-existing status audit, which was folded into the same tx)

affects:
  - 36-05a, 36-05b (admin UI calls PATCH with inclusionState body field; relies on validation + audit)
  - 36-05a, 36-05b (next-build-plan page query uses ?inclusion_state=approved_for_build filter)
  - 36-06 (admin upcoming endpoint may also benefit from the LIST filter when reading the upcoming roster)

tech-stack:
  added: []
  patterns:
    - "PATCH allowlist extension + transition validation BEFORE update assembly so invalid payloads short-circuit without touching the updates object"
    - "db.transaction wrapping UPDATE + audit INSERT(s) so atomicity is structural, not an honor system"
    - "Existing status audit folded INTO the new tx as atomicity bonus — no extra plan work needed, audit row no longer at risk of orphaning if the UPDATE rolls back"
    - "Vitest db.transaction mock: tx exposes update + insert that record call args via module-scope vi.fn(); a workflowInsertShouldThrow flag drives the rollback test"

key-files:
  created:
    - src/app/api/platform/bug-reports/[id]/route.test.ts (8 Vitest cases)
    - src/app/api/platform/feature-requests/[id]/route.test.ts (6 Vitest cases)
    - src/app/api/platform/bug-reports/route.test.ts (3 Vitest cases — LIST filter)
    - src/app/api/platform/feature-requests/route.test.ts (3 Vitest cases — LIST filter)
  modified:
    - src/app/api/platform/bug-reports/[id]/route.ts (PATCH extended: allowlist + validate + in-tx UPDATE+audit)
    - src/app/api/platform/feature-requests/[id]/route.ts (PATCH extended: identical pattern)
    - src/app/api/platform/bug-reports/route.ts (GET extended: ?inclusion_state= filter)
    - src/app/api/platform/feature-requests/route.ts (GET extended: ?inclusion_state= filter)

key-decisions:
  - "Status audit folded INTO the new db.transaction along with the inclusionState audit — the plan called this an 'atomicity bonus' and the code makes it structural; both audits and the UPDATE now succeed or fail together. The pre-existing fire-and-forget audit pattern is gone for this endpoint pair."
  - "Vitest mock pattern for db.transaction(fn): the mock immediately invokes fn(tx) with a tx object exposing update/insert wired to vi.fn() recorders; rollback is simulated by a closure flag (workflowInsertShouldThrow) that makes tx.insert.values reject — the test then asserts the outer PATCH call rejects. No need for a real CRDB rollback to verify the contract."
  - "drizzle-orm mock in the LIST endpoint tests overrides eq/and/inArray to record args while preserving desc/sql/etc. via importActual. Lets tests assert on eq invocations to confirm the new inclusion_state filter is appended to the where clause."
  - "Default reason=null on the inclusionState audit row — the existing status audit does not capture reason, and no UI surface in Plan 36-05 includes a reason input. The body.reason ?? null fallback preserves the column as optional and lets a future UI extension pass it without a follow-up schema or route change."

requirements-completed: [INCL-03, INCL-04]

duration: ~12min
completed: 2026-05-18
---

# Phase 36-02: Admin PATCH Transitions Summary

**Admin PATCH endpoints for bug-reports + feature-requests now accept inclusion_state transitions, validate them against the state-machine helper from Plan 36-01, and atomically audit the change inside a db.transaction. LIST endpoints gain a ?inclusion_state= filter so UI surfaces can query "all approved_for_build" without client-side filtering.**

## Performance

- **Duration:** ~12 min (executor agent, parallel wave 2)
- **Started:** 2026-05-18T13:13Z
- **Completed:** 2026-05-18T13:18Z
- **Tasks:** 3/3 (Task 1: bug-reports PATCH; Task 2: feature-requests PATCH; Task 3: both LIST endpoints)
- **Files touched:** 8 (4 route files modified + 4 test files created)
- **Test cases added:** 20 (8 + 6 + 3 + 3); all GREEN

## Accomplishments

- **INCL-03 (triaged → pending_inclusion):** PATCH bug-reports and feature-requests both accept the transition, validate via `canManuallyTransition`, and write a `workflow_transitions` audit row inside the same `db.transaction` as the column UPDATE.
- **INCL-04 (pending_inclusion → approved_for_build | deferred):** Same code path covers it; the validator already enumerates both target states.
- **INCL-05 backward path (approved_for_build → pending_inclusion):** Tested explicitly in both PATCH test suites; behaves identically to forward transitions.
- **Pitfall 3 closed:** UPDATE + audit INSERT live in the same `db.transaction` block, verified via two `tx.insert(workflowTransitions)` callsites inside the `db.transaction` arrow per route file.
- **Pitfall 8 closed:** Both LIST endpoints accept `?inclusion_state=<state>`; invalid values rejected with 400 `invalid_inclusion_state`; missing param preserves back-compat full-list behavior.
- **Status audit folded into same tx (atomicity bonus):** The pre-existing fire-and-forget audit at lines 60-67 of bug-reports route is now inside the new transaction. Both audits succeed-or-rollback together. No status row can be UPDATEd in the DB without its workflow_transitions row landing.

## Task Commits

1. **Task 1** — `4420aa3` — `feat(36-02): extend bug-reports PATCH with inclusion_state + in-tx audit`
2. **Task 2** — `1b7885a` — `feat(36-02): extend feature-requests PATCH with inclusion_state + in-tx audit`
3. **Task 3** — `3bb8540` — `feat(36-02): add inclusion_state filter to bug-reports + feature-requests LIST endpoints`

## Final PATCH Allowlist (what the endpoints now accept)

**bug-reports PATCH body fields:**
- `status`, `priority`, `triarchNotes`, `fixCommitSha`, `fixVersion`, `severity` (existing)
- `inclusionState` (NEW — validated against canManuallyTransition)
- `reason` (NEW — optional context string captured on the inclusionState audit row only; not on the row itself)

**feature-requests PATCH body fields:**
- `status`, `priority`, `triarchNotes`, `estimatedEffort`, `targetVersion`, `shippedVersion`, `buildPlan`, `buildPlanStatus` (existing)
- `inclusionState` (NEW)
- `reason` (NEW — same semantics as bug-reports)

## Tests Added Per Route File

| Route | Test File | Cases | Notable |
|-------|-----------|-------|---------|
| `bug-reports/[id]/route.ts` | `bug-reports/[id]/route.test.ts` | 8 | happy / INCL-05 backward / invalid transition / auto-only-state rejected / no-op same state / non-member 404 / atomicity throws / multi-field PATCH writes 2 audits |
| `feature-requests/[id]/route.ts` | `feature-requests/[id]/route.test.ts` | 6 | happy / INCL-05 backward / invalid / non-member 404 / atomicity / multi-field |
| `bug-reports/route.ts` (GET) | `bug-reports/route.test.ts` | 3 | filter applied / invalid input 400 / no-param does NOT add filter |
| `feature-requests/route.ts` (GET) | `feature-requests/route.test.ts` | 3 | same as bug-reports |

**Full sweep:** `npx vitest run src/app/api/platform/bug-reports/ src/app/api/platform/feature-requests/` → **20/20 GREEN.**

## Vitest Mock Pattern for db.transaction(fn)

```typescript
db: {
  transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
    const tx = {
      update: vi.fn(() => ({
        set: (updates) => ({
          where: () => ({
            returning: () => {
              mockTxUpdateValues({ updates });
              return Promise.resolve([{ id: 'updated-row', ...updates }]);
            },
          }),
        }),
      })),
      insert: vi.fn(() => ({
        values: (rows) => {
          mockTxInsertValues(rows);
          if (workflowInsertShouldThrow) {
            return Promise.reject(new Error('simulated audit insert failure'));
          }
          return Promise.resolve([]);
        },
      })),
    };
    return fn(tx);
  }),
}
```

- The tx object exposes `update` + `insert` builders that record call args via module-scope `vi.fn()` recorders (`mockTxUpdateValues`, `mockTxInsertValues`).
- A module-scope `workflowInsertShouldThrow` flag, reset in `beforeEach`, lets the atomicity test force `tx.insert.values` to reject. The PATCH then rejects with the same error, demonstrating the rollback contract without needing a real DB.
- `tx.insert.values` return defaults to `Promise.resolve([])` so unrelated inserts don't break.

**No quirks discovered.** `tx.insert.values` did NOT need an explicit Promise.resolve wrapper outside the throw branch — the default return is already a resolved promise.

## Pitfall 3 Verification

Both PATCH route files: `grep -c "tx.insert(workflowTransitions)" src/app/api/platform/bug-reports/[id]/route.ts` → **2** (status audit + inclusionState audit, both inside the `db.transaction` arrow).

`grep -c "db.transaction" src/app/api/platform/bug-reports/[id]/route.ts` → **1** (single transaction wraps everything).

Same counts for `feature-requests/[id]/route.ts`.

## Regression Check

- Phase 11 link-stamper tests: 25/25 GREEN
- Phase 36-01 inclusion-state helper tests: 16/16 GREEN

Total related regression sweep: **41/41 GREEN.**

## What this enables

- Plan 36-05a (admin UI for inclusion-state actions on bug/feature detail pages) can call `PATCH /api/platform/bug-reports/[id]` with `{inclusionState: 'pending_inclusion'}` and trust the validation + audit.
- Plan 36-05b (next-build-plan page) can call `GET /api/platform/bug-reports?inclusion_state=approved_for_build` for the table query.
- Plan 36-06 (admin upcoming endpoint) can reuse the same LIST filter pattern for the customer-facing /upcoming portal query.
- Auto-flip paths in 36-03 (link-stamper auto-flip) and 36-04 (prod-deploy auto-flip) DO NOT go through these PATCH endpoints — they touch the column directly inside their own transactions and write their own audit rows with `transitionedBy='commit-parser:<sha>'` / `'releases-promoted:<release>'` per CONTEXT.md D-Auto-Flip Integration.

## Deviations & Recoveries

**None.** Plan executed exactly as written:
- 3 tasks, 3 commits, 1 per task
- TDD RED → GREEN cycle observed for each task
- All acceptance criteria grep counts met or exceeded
- All vitest test files compile + run cleanly under existing `vitest.config.ts`
- No auto-fix Rule 1/2/3 deviations needed; no checkpoint hit; no auth gate encountered

## Outstanding from this plan

- Final phase-close version bump is deferred to the last plan in Phase 36 (admin v2.14.0 ships with all 8 plans landed in one feature branch merge per parallel-wave strategy)
- No PR opened yet; feature branch `feat/inclusion-state-machine` continues to accumulate Wave 2 commits from 36-03/04/06 in parallel
- `--no-verify` was used on all three task commits to avoid pre-commit hook contention with parallel agents per the parallel_execution directive in the prompt

## Self-Check: PASSED

Verified post-write:
- 9/9 claimed files exist on disk (4 routes + 4 test files + SUMMARY.md)
- 3/3 claimed commit hashes (4420aa3, 1b7885a, 3bb8540) present in `git log --oneline --all`
- `npx vitest run src/app/api/platform/bug-reports/ src/app/api/platform/feature-requests/` → 20/20 GREEN
- Phase 11 link-stamper + Phase 36-01 inclusion-state regression: 41/41 GREEN
