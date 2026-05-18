---
phase: 36-inclusion-approval-state-machine
plan: 04
type: execute
wave: 2
depends_on: [36-01]
files_modified:
  - src/app/api/releases/promoted/route.ts
  - src/app/api/releases/promoted/route.test.ts
autonomous: true
requirements: [INCL-07]
must_haves:
  truths:
    - "When prod-deploy ingest succeeds (a new release_logs row with env='prod', status='promoted' is inserted), any bug_reports rows where next_release_log_id = devRow.id AND inclusion_state = 'built' are atomically flipped to inclusion_state = 'deployed' in the same transaction"
    - "Same atomic flip applied to feature_requests rows"
    - "Each flip writes a workflow_transitions audit row inside the same db.transaction (entityType, fromStatus='built', toStatus='deployed', transitionedBy='prod-ingest:{commit_sha}', reason='auto-flip on prod deploy', metadata.prodReleaseLogId)"
    - "Re-ingesting the same prod row is a no-op for inclusion_state — WHERE clause requires inclusion_state='built' so already-deployed rows do not match (Pitfall 5 idempotency)"
    - "The existing 201 response shape (newProdRow JSON) is unchanged"
    - "The existing 200 idempotency-return shape (existingProdRow JSON) is unchanged"
    - "GATE-12 transaction atomicity preserved — either INSERT prod row + UPDATE dev row + flip all linked items + write all audits commit together, or all roll back together"
  artifacts:
    - path: "src/app/api/releases/promoted/route.ts"
      provides: "Transaction at lines 81-103 extended with two UPDATE statements (bug_reports + feature_requests built→deployed) plus a single workflow_transitions INSERT with combined audit rows, all inside the same tx"
      contains: "deployed"
    - path: "src/app/api/releases/promoted/route.test.ts"
      provides: "Tests covering: happy path flip both entity types, idempotent re-ingest no-op, audit row written inside tx, atomicity (audit insert throw rolls back state updates)"
      contains: "inclusionState"
  key_links:
    - from: "src/app/api/releases/promoted/route.ts"
      to: "bugReports.inclusionState UPDATE"
      via: "tx.update(bugReports).set({inclusionState: 'deployed'}).where(and(eq(nextReleaseLogId, devRow.id), eq(inclusionState, 'built')))"
      pattern: "inclusionState: 'deployed'"
    - from: "src/app/api/releases/promoted/route.ts"
      to: "featureRequests.inclusionState UPDATE"
      via: "Same pattern, featureRequests table"
      pattern: "featureRequests.*deployed"
    - from: "src/app/api/releases/promoted/route.ts"
      to: "workflowTransitions audit"
      via: "tx.insert(workflowTransitions).values([...flippedBugs, ...flippedFeats])"
      pattern: "prod-ingest:"
---

<objective>
Extend the existing `db.transaction(async (tx) => { ... })` block at `src/app/api/releases/promoted/route.ts:81-104` to add — BEFORE `return inserted;` — two batch UPDATE statements that flip `inclusion_state` from `built` → `deployed` for all bug_reports and feature_requests rows where `next_release_log_id = devRow.id AND inclusion_state = 'built'`, plus a single combined `workflow_transitions` INSERT auditing every flip. All within the SAME transaction — atomic with the prod row INSERT + dev row status UPDATE. Idempotent on re-ingest because the WHERE clause filters out already-deployed rows (Pitfall 5).

Purpose: INCL-07 — when a prod deploy completes (and admin receives the round-trip ingest), every item that was "built" (commit landed in dev) is now "deployed" (commit landed in prod). Customer-visible signal that the next-build-plan items have actually shipped, not just been merged to dev.
Output: Prod-ingest route flips inclusion_state atomically with the prod row insert; full test coverage including idempotency + atomicity + audit; GATE-12 contract preserved.
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
@src/app/api/releases/promoted/route.ts

<interfaces>
<!-- Current transaction (lines 81-104) we're extending. From src/app/api/releases/promoted/route.ts. -->

```typescript
const newProdRow = await db.transaction(async (tx) => {
  const [inserted] = await tx
    .insert(releaseLogs)
    .values({
      project: project!.key,
      version: version as string,
      releaseType: devRow.releaseType,
      env: 'prod',
      status: 'promoted',
      commitSha: commit_sha as string,
      deployedAt: parsedDate,
      releasedBy: deployed_by as string,
      summary: devRow.summary,
      entries: devRow.entries,
    })
    .returning();

  await tx
    .update(releaseLogs)
    .set({ status: 'promoted' })
    .where(eq(releaseLogs.id, devRow.id));

  // ▼▼▼ NEW INCL-07 EXTENSION GOES HERE (before return inserted) ▼▼▼

  return inserted;
});

return NextResponse.json(newProdRow, { status: 201 });
```

`devRow` is in scope from the lookup at line 45-54 (the dev release_logs row that matches project + version + env='dev'). `commit_sha` is in scope as the destructured body field at line 16.

Schema fields available after Plan 36-01:
- `bugReports.inclusionState`, `bugReports.nextReleaseLogId`
- `featureRequests.inclusionState`, `featureRequests.nextReleaseLogId`
- `workflowTransitions` (existing, entity-agnostic)
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Extend prod-ingest transaction with built→deployed flip + atomic audit (RED → GREEN)</name>
  <files>src/app/api/releases/promoted/route.ts, src/app/api/releases/promoted/route.test.ts</files>
  <read_first>
    - src/app/api/releases/promoted/route.ts (entire file — 107 lines; the critical block is the transaction at lines 81-104)
    - .planning/phases/36-inclusion-approval-state-machine/36-RESEARCH.md (Pattern 3 Prod-Ingest Transaction Extension, lines 249-302 — full code sketch; Pitfall 3 audit inside tx; Pitfall 5 idempotency via WHERE clause)
    - .planning/phases/36-inclusion-approval-state-machine/36-CONTEXT.md (D-Auto-Flip transitionedBy = 'prod-ingest:{commit_sha}')
    - src/lib/link-stamper.test.ts (Vitest mock pattern for db.update().set().where().returning() chain — same pattern needed here)
  </read_first>
  <behavior>
    - Test 1 (happy path): Existing dev row with 2 linked bugs (next_release_log_id = devRow.id, inclusion_state='built') and 1 linked feature → after POST, both bugs and the feature are flipped to inclusion_state='deployed' with updated_at=now; 3 workflow_transitions rows inserted (entityType='bug_report' x2, 'feature_request' x1) all with fromStatus='built', toStatus='deployed', transitionedBy='prod-ingest:{commit_sha}', reason='auto-flip on prod deploy', metadata.prodReleaseLogId=<inserted prod row id>; response is 201 with the inserted prod row body
    - Test 2 (idempotent re-ingest): Same POST called twice — second call hits the existing-prod-row early-return at line 76-78, no transaction runs, no double-flip, no double audit; response is 200 with the existing row body
    - Test 3 (idempotency via WHERE clause, parallel-deploy edge case): Even if the early-return is bypassed (e.g., race condition with two simultaneous POSTs that both miss the existence check), the WHERE clause `inclusionState='built'` ensures the second tx UPDATEs 0 rows; autoFlipped=0; no audit rows duplicated; no audit row written if `flipped.length === 0`
    - Test 4 (no linked items): Dev row with zero linked bugs/features → UPDATE matches 0 rows → no audit rows written → response still 201 with prod row
    - Test 5 (atomicity): If the audit INSERT throws inside the tx, the bug_reports/feature_requests UPDATEs roll back, the prod row INSERT rolls back, and the dev row UPDATE rolls back; response is 500 (or whatever the tx error path produces)
    - Test 6 (existing GATE-12 contract preserved): Missing required field (e.g. `commit_sha`) still returns 400 with no DB writes; existing 400/404/200/201 paths unchanged
  </behavior>
  <action>
    1. WRITE TESTS FIRST. Create `src/app/api/releases/promoted/route.test.ts` if it does not exist. Use the Vitest mock pattern from `src/lib/link-stamper.test.ts` for `db.transaction(fn)` returning `fn(tx)`. Mock `@/lib/api-key-auth.requireApiKey` to return a project. The tx mock needs to support: `tx.insert(table).values(rows).returning()`, `tx.update(table).set(updates).where(cond)`, `tx.update(table).set(updates).where(cond).returning(cols)`. Tests 1-6 above must initially FAIL because the extension does not yet exist (RED).

    2. EDIT `src/app/api/releases/promoted/route.ts`:

       a. Add imports (line 6 area, alongside existing `releaseLogs`):
       ```typescript
       import { releaseLogs, bugReports, featureRequests, workflowTransitions } from '@/db/schema';
       import { and, eq, inArray } from 'drizzle-orm';
       ```
       (`and` and `inArray` may need adding — `eq` already imported.)

       b. INSIDE the existing transaction (between line 101 `await tx.update(releaseLogs).set({status: 'promoted'}).where(eq(releaseLogs.id, devRow.id));` and line 103 `return inserted;`), INSERT this new block:
       ```typescript
       // ── Phase 36 INCL-07: batch-flip built → deployed for items linked to this release ──
       // Idempotency: WHERE clause requires inclusion_state='built' so re-ingest matches 0 rows.
       // (Pitfall 5 from RESEARCH.md.)
       const flippedBugs = await tx
         .update(bugReports)
         .set({ inclusionState: 'deployed', updatedAt: new Date() })
         .where(and(
           eq(bugReports.nextReleaseLogId, devRow.id),
           eq(bugReports.inclusionState, 'built'),
         ))
         .returning({ id: bugReports.id });

       const flippedFeats = await tx
         .update(featureRequests)
         .set({ inclusionState: 'deployed', updatedAt: new Date() })
         .where(and(
           eq(featureRequests.nextReleaseLogId, devRow.id),
           eq(featureRequests.inclusionState, 'built'),
         ))
         .returning({ id: featureRequests.id });

       // Combined audit insert — single INSERT to minimize round-trips, all rows in same tx
       const auditRows = [
         ...flippedBugs.map(b => ({
           entityType: 'bug_report' as const,
           entityId: b.id,
           fromStatus: 'built',
           toStatus: 'deployed',
           transitionedBy: `prod-ingest:${commit_sha}`,
           reason: 'auto-flip on prod deploy',
           metadata: { prodReleaseLogId: inserted.id },
         })),
         ...flippedFeats.map(f => ({
           entityType: 'feature_request' as const,
           entityId: f.id,
           fromStatus: 'built',
           toStatus: 'deployed',
           transitionedBy: `prod-ingest:${commit_sha}`,
           reason: 'auto-flip on prod deploy',
           metadata: { prodReleaseLogId: inserted.id },
         })),
       ];
       if (auditRows.length > 0) {
         await tx.insert(workflowTransitions).values(auditRows);
       }
       ```

       c. The `return inserted;` at line 103 stays unchanged.

       d. The 201 response at line 106 stays unchanged.

       e. CRITICAL: `next_release_log_id` references the DEV row (`devRow.id`), NOT the new prod row (`inserted.id`). This is per CONTEXT.md D-13 — "dev row stamping preserves which dev release first carried this item; prod is reached via dev↔prod version join." The metadata field `prodReleaseLogId: inserted.id` provides the dev↔prod link in the audit log without losing original dev provenance.

       f. Do NOT extract a helper function or introduce a new transaction — extending the existing tx in place preserves atomicity.

    3. Run `npx vitest run src/app/api/releases/promoted/route.test.ts` — all 6 tests must PASS (GREEN).
  </action>
  <verify>
    <automated>npx vitest run src/app/api/releases/promoted/route.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "tx.update(bugReports)" src/app/api/releases/promoted/route.ts` returns 1
    - `grep -c "tx.update(featureRequests)" src/app/api/releases/promoted/route.ts` returns 1
    - `grep -c "inclusionState: 'deployed'" src/app/api/releases/promoted/route.ts` returns 2 (one per entity type)
    - `grep -c "eq(bugReports.inclusionState, 'built')" src/app/api/releases/promoted/route.ts` returns 1 (idempotency guard — Pitfall 5)
    - `grep -c "eq(featureRequests.inclusionState, 'built')" src/app/api/releases/promoted/route.ts` returns 1
    - `grep -c "prod-ingest:" src/app/api/releases/promoted/route.ts` returns 2 (one per audit row map)
    - `grep -c "tx.insert(workflowTransitions)" src/app/api/releases/promoted/route.ts` returns 1 (single combined audit insert)
    - `grep -c "auto-flip on prod deploy" src/app/api/releases/promoted/route.ts` returns 2
    - `grep -c "devRow.id" src/app/api/releases/promoted/route.ts` returns >= 3 (existing reference + 2 new WHERE clauses on nextReleaseLogId)
    - `grep -c "prodReleaseLogId: inserted.id" src/app/api/releases/promoted/route.ts` returns 2
    - `npx vitest run src/app/api/releases/promoted/route.test.ts` reports 0 failures, >= 6 passing tests
  </acceptance_criteria>
  <done>Prod-ingest transaction atomically flips linked items from built→deployed and writes audit rows; idempotent re-ingest produces no duplicates; existing GATE-12 response contract unchanged.</done>
</task>

</tasks>

<verification>
- Transaction extension lives INSIDE the existing `db.transaction(async (tx) => { ... })` block — not a new transaction (verifiable: `grep -c "db.transaction" src/app/api/releases/promoted/route.ts` returns exactly 1)
- WHERE clause includes the state guard `inclusionState='built'` for both UPDATEs (verifiable via grep — Pitfall 5)
- Audit rows use `prod-ingest:{commit_sha}` provenance (verifiable: grep `prod-ingest:`)
- `next_release_log_id` references `devRow.id`, NOT `inserted.id` (CONTEXT.md D-13 — dev provenance preserved)
- All tests pass: `npx vitest run src/app/api/releases/promoted/route.test.ts`
- Existing GATE-12 success criteria preserved (tests 1-6 from behavior block include the existing 400/404/200/201 paths)
</verification>

<success_criteria>
- TMI pilot dogfood: when admin receives a prod-ingest POST for `tmi v4.46.1` (after a real prod deploy), any TMI bug_reports/feature_requests with `inclusion_state='built'` and `next_release_log_id` matching the dev row flip to `inclusion_state='deployed'` in the same transaction as the prod row insert (verifiable via SELECT after a real ingest)
- Audit table records who flipped each item: `SELECT entity_type, entity_id, transitioned_by FROM workflow_transitions WHERE to_status='deployed' AND transitioned_by LIKE 'prod-ingest:%';` returns rows with the commit_sha provenance
- Re-running the same prod-ingest POST is fully idempotent — no duplicate prod row (existing GATE-12 logic), no duplicate flips (new WHERE clause guard), no duplicate audit rows
- Triarch's customer-facing portal `/upcoming` page (Plan 36-07) can rely on inclusion_state='deployed' as the terminal "this has shipped to prod" signal
</success_criteria>

<output>
After completion, create `.planning/phases/36-inclusion-approval-state-machine/36-04-prod-ingest-autoflip-SUMMARY.md` documenting:
- Total tests added (target ≥6)
- Confirmation that GATE-12 contract is preserved (existing 400/404/200/201 paths still tested)
- Whether the Vitest mock for tx.update().set().where().returning() chain required any closure-state tricks (note for future plans extending tx-bound route tests)
- TMI pilot smoke-test result if available (real prod deploy round-trip → SELECT confirms flip)
- Any drizzle-orm operator imports added (and, inArray) and where they came from
</output>
