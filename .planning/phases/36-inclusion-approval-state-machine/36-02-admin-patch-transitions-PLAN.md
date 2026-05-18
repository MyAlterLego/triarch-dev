---
phase: 36-inclusion-approval-state-machine
plan: 02
type: execute
wave: 2
depends_on: [36-01]
files_modified:
  - src/app/api/platform/bug-reports/[id]/route.ts
  - src/app/api/platform/bug-reports/[id]/route.test.ts
  - src/app/api/platform/feature-requests/[id]/route.ts
  - src/app/api/platform/feature-requests/[id]/route.test.ts
  - src/app/api/platform/bug-reports/route.ts
  - src/app/api/platform/feature-requests/route.ts
autonomous: true
requirements: [INCL-03, INCL-04]
must_haves:
  truths:
    - "PATCH /api/platform/bug-reports/[id] accepts {inclusionState} in body and persists the change to bug_reports.inclusion_state"
    - "PATCH /api/platform/feature-requests/[id] accepts {inclusionState} in body and persists the change to feature_requests.inclusion_state"
    - "Invalid transition (e.g., triaged → built) returns 400 with error 'invalid_transition' and does NOT update the row"
    - "Valid transition writes a workflow_transitions audit row (entityType='bug_report'|'feature_request', fromStatus, toStatus, transitionedBy=session email) in the same DB transaction as the state UPDATE"
    - "GET /api/platform/bug-reports?inclusion_state=approved_for_build filters results by inclusion_state (Pitfall 8 fix)"
    - "GET /api/platform/feature-requests?inclusion_state=approved_for_build filters results by inclusion_state"
    - "Non-member non-staff caller receives 404 (no row exists / no leak) for the PATCH attempt regardless of inclusionState payload"
  artifacts:
    - path: "src/app/api/platform/bug-reports/[id]/route.ts"
      provides: "PATCH allowlist includes inclusionState; transition validated via canManuallyTransition; audit row written in same tx"
      contains: "inclusionState"
    - path: "src/app/api/platform/feature-requests/[id]/route.ts"
      provides: "Same PATCH extension for feature_requests"
      contains: "inclusionState"
    - path: "src/app/api/platform/bug-reports/route.ts"
      provides: "GET endpoint accepts ?inclusion_state= query param and adds eq filter"
      contains: "inclusion_state"
    - path: "src/app/api/platform/feature-requests/route.ts"
      provides: "GET endpoint accepts ?inclusion_state= query param"
      contains: "inclusion_state"
  key_links:
    - from: "src/app/api/platform/bug-reports/[id]/route.ts"
      to: "src/lib/inclusion-state.ts"
      via: "import { canManuallyTransition } from '@/lib/inclusion-state'"
      pattern: "from '@/lib/inclusion-state'"
    - from: "src/app/api/platform/bug-reports/[id]/route.ts"
      to: "workflow_transitions table"
      via: "tx.insert(workflowTransitions) inside same db.transaction as bugReports UPDATE"
      pattern: "tx\\.insert\\(workflowTransitions\\)"
    - from: "src/app/api/platform/feature-requests/[id]/route.ts"
      to: "src/lib/inclusion-state.ts + workflow_transitions"
      via: "same import + same in-tx audit"
      pattern: "canManuallyTransition"
---

<objective>
Extend the existing PATCH `/api/platform/bug-reports/[id]` and `/api/platform/feature-requests/[id]` route handlers to accept `inclusionState` in the body, validate the requested transition via `canManuallyTransition` from `@/lib/inclusion-state`, persist the change, and write a `workflow_transitions` audit row in the SAME database transaction. Also extend the corresponding LIST endpoints (`GET /api/platform/{bug-reports,feature-requests}`) to accept `?inclusion_state=` filter param (Pitfall 8 — triage workflow needs to find pending/approved items). All transitions audit-logged per CONTEXT D-04.

Purpose: Provide the API surface staff use to move items through the inclusion state machine (INCL-03 triaged→pending_inclusion, INCL-04 pending_inclusion→approved_for_build|deferred). UI consumers (Plan 36-05 next-build-plan page + extended bug/feature list pages) call these endpoints. Audit-table foundation for compliance + observability.
Output: Two PATCH endpoints extended with state-machine validation + audit. Two GET endpoints extended with inclusion_state filter. Full test coverage for happy path + invalid transitions + non-member 404.
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/execute-plan.md
@~/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/36-inclusion-approval-state-machine/36-CONTEXT.md
@.planning/phases/36-inclusion-approval-state-machine/36-RESEARCH.md
@.planning/phases/36-inclusion-approval-state-machine/36-01-shared-schema-bump-PLAN.md

# Source-of-truth references
@src/app/api/platform/bug-reports/[id]/route.ts
@src/app/api/platform/bug-reports/route.ts
@src/lib/inclusion-state.ts

<interfaces>
<!-- The PATCH endpoint we're extending. From src/app/api/platform/bug-reports/[id]/route.ts (current state — read first). -->

Current PATCH allowlist (line 33):
```typescript
const { status, priority, triarchNotes, fixCommitSha, fixVersion, severity } = body;
```

Current workflow_transitions write (line 60 — fires only on status change):
```typescript
await db.insert(workflowTransitions).values({
  entityType: 'bug_report',
  entityId: id,
  fromStatus: current.status,
  toStatus: status,
  transitionedBy: session!.user?.email ?? 'admin',
});
```
NOTE: This is OUTSIDE a transaction (Pitfall 3 — fine for status because admin already accepts this risk, but the NEW inclusionState path MUST use tx for atomicity per CONTEXT.md).

From src/lib/inclusion-state.ts (created in Plan 36-01):
```typescript
export const INCLUSION_STATES = ['triaged', 'pending_inclusion', 'approved_for_build', 'built', 'deployed', 'deferred', 'rejected'] as const;
export type InclusionState = typeof INCLUSION_STATES[number];
export function canManuallyTransition(from: InclusionState, to: InclusionState): boolean;
```

From src/db/schema.ts (re-exports shared package):
- `bugReports.inclusionState`, `bugReports.nextReleaseLogId` (added in Plan 36-01)
- `featureRequests.inclusionState`, `featureRequests.nextReleaseLogId`
- `workflowTransitions` (existing, entity-agnostic)
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Extend bug-reports PATCH endpoint with inclusionState allowlist + state-machine validation + in-tx audit</name>
  <files>src/app/api/platform/bug-reports/[id]/route.ts, src/app/api/platform/bug-reports/[id]/route.test.ts</files>
  <read_first>
    - src/app/api/platform/bug-reports/[id]/route.ts (current PATCH at lines 27-70; current allowlist at line 33; existing workflow_transitions write at line 60)
    - src/lib/inclusion-state.ts (canManuallyTransition signature — created in Plan 36-01)
    - .planning/phases/36-inclusion-approval-state-machine/36-RESEARCH.md (Admin PATCH allowlist extension code example, lines 463-487)
    - .planning/phases/36-inclusion-approval-state-machine/36-RESEARCH.md (Pitfall 3: audit row inside same tx as state UPDATE)
    - src/lib/link-stamper.test.ts (Vitest pattern for mocking @/lib/db — closure-state mockDbInsertValues pattern)
  </read_first>
  <behavior>
    - Test 1 (happy path bug): PATCH with `{inclusionState: 'pending_inclusion'}` on a bug currently in 'triaged' → 200, row updated, workflow_transitions row inserted with entityType='bug_report', fromStatus='triaged', toStatus='pending_inclusion', transitionedBy=session.user.email
    - Test 2 (INCL-05 "Remove from build"): PATCH with `{inclusionState: 'pending_inclusion'}` on a bug in 'approved_for_build' → 200 + audit row
    - Test 3 (invalid transition): PATCH with `{inclusionState: 'built'}` on a bug in 'triaged' → 400 with `{error: 'invalid_transition'}`, NO update to bug_reports, NO workflow_transitions insert
    - Test 4 (auto-only state rejected): PATCH with `{inclusionState: 'deployed'}` on a bug in 'built' → 400 (deployed is auto-only)
    - Test 5 (no-op same state): PATCH with `{inclusionState: 'triaged'}` on a bug already in 'triaged' → 200 but NO workflow_transitions insert (only inserts on actual change)
    - Test 6 (non-member 404): PATCH from a user with no membership returns 404, no update, no audit (existing membership-gate pattern at lines 41-45 unchanged)
    - Test 7 (atomicity): If audit insert throws inside tx, the bug_reports UPDATE must also roll back (verify via mock that throws on workflowTransitions insert)
    - Test 8 (multi-field PATCH): PATCH with `{status: 'approved', inclusionState: 'pending_inclusion'}` updates BOTH columns AND writes TWO audit rows (one for status, one for inclusionState)
  </behavior>
  <action>
    1. WRITE TESTS FIRST. Create `src/app/api/platform/bug-reports/[id]/route.test.ts` if it does not exist. Use the Vitest mock pattern from `src/lib/link-stamper.test.ts` (mock `@/lib/db` with `db.transaction(fn)` returning `fn(tx)`, mock `@/lib/api-auth.requireSignedIn` to return a session, mock `@/lib/auth-context.getCurrentUserContext` to return a context with the right membership). Tests 1-8 above must initially FAIL because the endpoint does not yet handle inclusionState (RED phase).

    2. EDIT `src/app/api/platform/bug-reports/[id]/route.ts`:

       a. Add import at top: `import { canManuallyTransition, type InclusionState } from '@/lib/inclusion-state';`

       b. Extend the destructured body fields (currently line 33) to include `inclusionState`:
       ```typescript
       const { status, priority, triarchNotes, fixCommitSha, fixVersion, severity, inclusionState } = body;
       ```

       c. After the existing membership gate (after line 45) and BEFORE the `const updates: Record<string, unknown> = ...` block (line 47), add the inclusionState validation block:
       ```typescript
       // ── Phase 36 INCL-03/04: validate inclusion_state transition ──
       if (inclusionState !== undefined && inclusionState !== current.inclusionState) {
         if (!canManuallyTransition(current.inclusionState as InclusionState, inclusionState as InclusionState)) {
           return NextResponse.json({ error: 'invalid_transition' }, { status: 400 });
         }
       }
       ```

       d. In the `updates` object (line 47-53), add (BEFORE the resolvedAt line):
       ```typescript
       if (inclusionState !== undefined) updates.inclusionState = inclusionState;
       ```

       e. REPLACE the existing single-UPDATE + non-tx audit (lines 56-67) with a transaction that does the UPDATE + writes BOTH audit rows (status AND inclusionState) atomically:
       ```typescript
       const updated = await db.transaction(async (tx) => {
         const [row] = await tx.update(bugReports).set(updates).where(eq(bugReports.id, id)).returning();

         // Existing status audit (preserved)
         if (status && status !== current.status) {
           await tx.insert(workflowTransitions).values({
             entityType: 'bug_report',
             entityId: id,
             fromStatus: current.status,
             toStatus: status,
             transitionedBy: session!.user?.email ?? 'admin',
           });
         }

         // ── Phase 36 INCL-03/04: inclusion_state audit (same tx) ──
         if (inclusionState !== undefined && inclusionState !== current.inclusionState) {
           await tx.insert(workflowTransitions).values({
             entityType: 'bug_report',
             entityId: id,
             fromStatus: current.inclusionState,
             toStatus: inclusionState,
             transitionedBy: session!.user?.email ?? 'admin',
             reason: body.reason ?? null,
           });
         }

         return row;
       });
       ```

       f. Pitfall 3 (audit row outside tx) — explicitly fixed here by wrapping in `db.transaction`. Note the existing status audit is ALSO moved inside the tx (atomicity bonus for INCL-03/04 ship).

    3. Run `npx vitest run src/app/api/platform/bug-reports/[id]/route.test.ts` — must PASS all 8 tests (GREEN phase).
  </action>
  <verify>
    <automated>npx vitest run src/app/api/platform/bug-reports/[id]/route.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "canManuallyTransition" src/app/api/platform/bug-reports/[id]/route.ts` returns >= 1
    - `grep -c "inclusionState" src/app/api/platform/bug-reports/[id]/route.ts` returns >= 4 (destructure + validate + updates assign + audit row)
    - `grep -c "invalid_transition" src/app/api/platform/bug-reports/[id]/route.ts` returns 1
    - `grep -c "db.transaction" src/app/api/platform/bug-reports/[id]/route.ts` returns 1 (audit + update in same tx)
    - `grep -c "tx.insert(workflowTransitions)" src/app/api/platform/bug-reports/[id]/route.ts` returns 2 (both status and inclusionState audit inside tx)
    - `npx vitest run src/app/api/platform/bug-reports/[id]/route.test.ts` reports 0 failures, >= 8 passing tests covering Tests 1-8 from behavior block
  </acceptance_criteria>
  <done>bug-reports PATCH accepts and validates inclusion_state transitions, audit-logs them inside the same tx as the state update, rejects invalid transitions with 400.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Extend feature-requests PATCH endpoint — identical pattern to bug-reports, entityType='feature_request'</name>
  <files>src/app/api/platform/feature-requests/[id]/route.ts, src/app/api/platform/feature-requests/[id]/route.test.ts</files>
  <read_first>
    - src/app/api/platform/feature-requests/[id]/route.ts (current PATCH state — verify it follows same pattern as bug-reports)
    - src/app/api/platform/bug-reports/[id]/route.ts (the file just modified in Task 1 — copy the structure verbatim, swap `bugReports` → `featureRequests` and `'bug_report'` → `'feature_request'`)
    - src/app/api/platform/bug-reports/[id]/route.test.ts (the test file just created in Task 1 — copy the structure, adapt entity type)
  </read_first>
  <behavior>
    - Identical to Task 1 tests, but for `featureRequests` table and `entityType: 'feature_request'` in the audit row.
    - Test 1: PATCH with `{inclusionState: 'pending_inclusion'}` on a feature in 'triaged' → 200 + audit (entityType='feature_request')
    - Test 2: PATCH `{inclusionState: 'pending_inclusion'}` on feature in 'approved_for_build' → 200 (INCL-05 backward)
    - Test 3: PATCH `{inclusionState: 'built'}` on 'triaged' feature → 400 invalid_transition
    - Test 4: Non-member → 404
    - Test 5: Atomicity — audit insert throw rolls back UPDATE
  </behavior>
  <action>
    1. WRITE TESTS FIRST. Create `src/app/api/platform/feature-requests/[id]/route.test.ts` as a near-clone of `src/app/api/platform/bug-reports/[id]/route.test.ts` (created in Task 1). Substitutions:
       - `bugReports` → `featureRequests` everywhere
       - `'bug_report'` → `'feature_request'` in audit entityType assertions
       - Import path: `from '@/db/schema'` selects `featureRequests`, `workflowTransitions`
       - Adapt any feature-specific fields (e.g., the existing PATCH on feature-requests likely allows `buildPlan`, `targetVersion` etc. — preserve those in the destructure)

    2. EDIT `src/app/api/platform/feature-requests/[id]/route.ts` applying the EXACT same 6-step transformation as Task 1, with the substitutions above:
       a. Add: `import { canManuallyTransition, type InclusionState } from '@/lib/inclusion-state';`
       b. Extend destructure with `inclusionState`.
       c. After membership gate, add the inclusionState transition validation block (return 400 invalid_transition if `canManuallyTransition` returns false).
       d. Add `if (inclusionState !== undefined) updates.inclusionState = inclusionState;` to the updates object.
       e. Wrap UPDATE + existing-audit + inclusionState-audit in `db.transaction(async (tx) => { ... })` — entityType is `'feature_request'` not `'bug_report'`.
       f. Use `featureRequests` table for the UPDATE call.

    3. Run `npx vitest run src/app/api/platform/feature-requests/[id]/route.test.ts` — must PASS.
  </action>
  <verify>
    <automated>npx vitest run src/app/api/platform/feature-requests/[id]/route.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "canManuallyTransition" src/app/api/platform/feature-requests/[id]/route.ts` returns >= 1
    - `grep -c "inclusionState" src/app/api/platform/feature-requests/[id]/route.ts` returns >= 4
    - `grep -c "entityType: 'feature_request'" src/app/api/platform/feature-requests/[id]/route.ts` returns >= 1 (the new inclusionState audit row; the existing status audit may or may not exist depending on what was there before)
    - `grep -c "invalid_transition" src/app/api/platform/feature-requests/[id]/route.ts` returns 1
    - `grep -c "db.transaction" src/app/api/platform/feature-requests/[id]/route.ts` returns 1
    - `npx vitest run src/app/api/platform/feature-requests/[id]/route.test.ts` reports 0 failures, >= 5 passing tests
  </acceptance_criteria>
  <done>feature-requests PATCH ships identical INCL-03/04 semantics as bug-reports; audit rows write entityType='feature_request'; full test parity with Task 1.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Extend bug-reports and feature-requests LIST GET endpoints with ?inclusion_state= filter (Pitfall 8)</name>
  <files>src/app/api/platform/bug-reports/route.ts, src/app/api/platform/feature-requests/route.ts</files>
  <read_first>
    - src/app/api/platform/bug-reports/route.ts (current GET — read how `?status=` and `?project=` filters are applied with eq() and and() from drizzle)
    - src/app/api/platform/feature-requests/route.ts (current GET — same pattern check)
    - .planning/phases/36-inclusion-approval-state-machine/36-RESEARCH.md (Pitfall 8: list-page inclusion column needs server-side filter or triage workflow breaks)
    - src/lib/inclusion-state.ts (INCLUSION_STATES tuple — use for input validation)
  </read_first>
  <behavior>
    - GET `/api/platform/bug-reports?inclusion_state=approved_for_build` returns only bugs where inclusionState='approved_for_build' for the matching project (mirrors existing `?status=` filter)
    - GET `/api/platform/bug-reports?inclusion_state=invalid_value` returns 400 (input validated against INCLUSION_STATES tuple)
    - GET `/api/platform/bug-reports` (no inclusion_state param) returns all rows (back-compat — no filter applied)
    - Identical behavior on `/api/platform/feature-requests`
  </behavior>
  <action>
    1. WRITE A SMALL TEST FILE for each (or extend existing) — `src/app/api/platform/bug-reports/route.test.ts` and `src/app/api/platform/feature-requests/route.test.ts`. Test cases (per route):
       - `GET ?inclusion_state=approved_for_build` adds `eq(bugReports.inclusionState, 'approved_for_build')` to the where clause (assert on mock invocation)
       - `GET ?inclusion_state=garbage` returns 400 with `{error: 'invalid_inclusion_state'}`
       - `GET` (no param) does NOT add the inclusionState filter

    2. EDIT `src/app/api/platform/bug-reports/route.ts` GET handler:

       a. Add import: `import { INCLUSION_STATES, type InclusionState } from '@/lib/inclusion-state';`

       b. After parsing existing query params (typically near `const status = searchParams.get('status')`), add:
       ```typescript
       const inclusionState = searchParams.get('inclusion_state');
       if (inclusionState !== null && !INCLUSION_STATES.includes(inclusionState as InclusionState)) {
         return NextResponse.json({ error: 'invalid_inclusion_state' }, { status: 400 });
       }
       ```

       c. Where existing filters are composed into the WHERE clause (likely `and(...filters)` or `where(...)`), add the inclusion_state filter conditionally:
       ```typescript
       if (inclusionState) filters.push(eq(bugReports.inclusionState, inclusionState));
       ```
       (Exact code shape depends on how the existing GET composes its filter array — match the existing idiom for `status` and `project`.)

    3. EDIT `src/app/api/platform/feature-requests/route.ts` GET handler with the IDENTICAL transformation:
       a. Same import.
       b. Same parse + validate.
       c. Same conditional filter push (using `featureRequests.inclusionState` instead of `bugReports.inclusionState`).

    4. Run tests for both list routes — must PASS.
  </action>
  <verify>
    <automated>npx vitest run src/app/api/platform/bug-reports/route.test.ts src/app/api/platform/feature-requests/route.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "INCLUSION_STATES" src/app/api/platform/bug-reports/route.ts` returns >= 1
    - `grep -c "INCLUSION_STATES" src/app/api/platform/feature-requests/route.ts` returns >= 1
    - `grep -c "inclusion_state" src/app/api/platform/bug-reports/route.ts` returns >= 2 (searchParams.get + filter push)
    - `grep -c "inclusion_state" src/app/api/platform/feature-requests/route.ts` returns >= 2
    - `grep -c "invalid_inclusion_state" src/app/api/platform/bug-reports/route.ts` returns 1
    - Tests for both routes pass
  </acceptance_criteria>
  <done>Both LIST endpoints accept the new filter; triage workflow can now find "all approved_for_build bugs" without client-side filtering.</done>
</task>

</tasks>

<verification>
- Both PATCH endpoints accept inclusionState in body and validate transitions via canManuallyTransition (verifiable: grep for `canManuallyTransition` in both route files)
- Both PATCH endpoints write workflow_transitions audit rows inside `db.transaction` block (verifiable: grep for `tx.insert(workflowTransitions)` returns 2 per route file — status + inclusionState audits)
- Invalid transitions return 400 with `error: 'invalid_transition'` and no DB writes (verified by tests)
- Both LIST endpoints accept `?inclusion_state=` and validate input (verifiable: grep for `inclusion_state` + INCLUSION_STATES in both files)
- All test suites for the 4 modified routes pass
- Run full vitest sweep: `npx vitest run src/app/api/platform/bug-reports/ src/app/api/platform/feature-requests/` exits 0
</verification>

<success_criteria>
- Plan 36-05 (admin UI) can call `PATCH /api/platform/bug-reports/[id]` with `{inclusionState}` body and trust the validation + audit
- Plan 36-05 can call `GET /api/platform/bug-reports?inclusion_state=approved_for_build` for the next-build-plan page query
- Staff actions logged in workflow_transitions with `transitionedBy = session.user.email` (auditable provenance)
- Atomic guarantee: if either the bug update or the audit insert fails, both roll back (Pitfall 3 closed for the new code path)
</success_criteria>

<output>
After completion, create `.planning/phases/36-inclusion-approval-state-machine/36-02-admin-patch-transitions-SUMMARY.md` documenting:
- Final PATCH allowlist (what fields the endpoints now accept)
- Number of tests added per route file
- Whether the existing status audit was also folded into the new transaction (it was — atomicity bonus) or left separate
- Any quirks with the Vitest mock pattern for `db.transaction(fn)` (e.g. did `tx.insert.values` need an explicit Promise.resolve mock?)
</output>
