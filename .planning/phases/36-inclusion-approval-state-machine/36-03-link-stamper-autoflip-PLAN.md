---
phase: 36-inclusion-approval-state-machine
plan: 03
type: execute
wave: 2
depends_on: [36-01]
files_modified:
  - src/lib/link-stamper.ts
  - src/lib/link-stamper.test.ts
  - src/app/api/platform/ingest/release-logs/route.ts
autonomous: true
requirements: [INCL-06]
must_haves:
  truths:
    - "stampLinksFromCommit signature accepts new optional commitSha parameter (back-compat — defaults to empty string)"
    - "When a commit references a bug/feature ID whose inclusion_state='approved_for_build', the row flips to 'built' and next_release_log_id is stamped with the current releaseId"
    - "When a commit references a bug/feature ID whose inclusion_state IS NOT 'approved_for_build' (e.g., 'triaged', 'pending_inclusion'), the release_log_links row is STILL written (v2.1 Phase 11 behavior preserved) but inclusion_state does NOT flip and the orphan is counted"
    - "Each auto-flip writes a workflow_transitions audit row in the same code path (entityType='bug_report'|'feature_request', fromStatus='approved_for_build', toStatus='built', transitionedBy='commit-parser:{commitSha}', reason='auto-flip from commit', metadata={releaseLogId})"
    - "StampResult return type extended: { stamped, dropped, autoFlipped, orphanLinks } — existing callers see stamped/dropped unchanged"
    - "100% of pre-existing src/lib/link-stamper.test.ts and src/lib/commit-parser.test.ts tests remain GREEN (success criterion #3 from CONTEXT)"
    - "Ingest route at src/app/api/platform/ingest/release-logs/route.ts passes release.commitSha when calling stampLinksFromCommit and logs console.warn with structured payload when orphanLinks > 0 (Pitfall 4)"
  artifacts:
    - path: "src/lib/link-stamper.ts"
      provides: "stampLinksFromCommit extension: post-INSERT step queries inclusion_state, batch-UPDATE approved_for_build→built, audits each flip, returns autoFlipped + orphanLinks counts"
      contains: "autoFlipped"
    - path: "src/lib/link-stamper.test.ts"
      provides: "Extended test coverage for auto-flip happy path, orphan link, non-approved skip, audit row write"
      contains: "autoFlipped"
    - path: "src/app/api/platform/ingest/release-logs/route.ts"
      provides: "Caller passes commitSha and logs orphan warnings"
      contains: "orphanLinks"
  key_links:
    - from: "src/lib/link-stamper.ts"
      to: "bugReports.inclusionState"
      via: "tx-style UPDATE with WHERE inclusion_state='approved_for_build' AND id IN (validBugIds)"
      pattern: "inclusionState.*approved_for_build"
    - from: "src/lib/link-stamper.ts"
      to: "workflow_transitions audit table"
      via: "INSERT auditing each auto-flip with transitionedBy='commit-parser:{commitSha}'"
      pattern: "commit-parser:"
    - from: "src/app/api/platform/ingest/release-logs/route.ts"
      to: "stampLinksFromCommit"
      via: "passes release.commitSha in the input object"
      pattern: "commitSha:\\s*release\\.commitSha"
---

<objective>
Extend `src/lib/link-stamper.ts` so that AFTER the existing `db.insert(releaseLogLinks).values(insertRows)` call at line 145 (DO NOT MODIFY anything above), it auto-flips `inclusion_state` from `approved_for_build` → `built` for any validated bug/feature ID referenced in the commit, stamps `next_release_log_id` with the current `releaseId`, and writes an audit row to `workflow_transitions` for each flip. Soft-warn (count + console.warn at the ingest caller, per Pitfall 4) for "orphan link" cases where a commit referenced an item NOT in approved_for_build (link still written, no flip, observable signal). Extend the ingest caller at `src/app/api/platform/ingest/release-logs/route.ts:179` to pass `release.commitSha` and emit the orphan warning when `orphanLinks > 0`.

Purpose: INCL-06 — the commit-parser auto-flip is THE load-bearing "code shipped means item moved" mechanic. Soft-warning on orphan links keeps v2.1 commit-parser semantics intact (DO NOT regress 100% of v2.1 Phase 11 tests) while giving staff a signal that commits are referencing un-approved items.
Output: link-stamper supports state machine auto-flips with full audit + orphan tracking; ingest route surfaces the orphan signal; existing v2.1 Phase 11 test baseline remains 100% GREEN.
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
@src/lib/link-stamper.ts
@src/lib/link-stamper.test.ts
@src/app/api/platform/ingest/release-logs/route.ts
@src/lib/commit-parser.ts

<interfaces>
<!-- Current stampLinksFromCommit signature. From src/lib/link-stamper.ts line 22-31. -->

```typescript
export interface StampResult {
  stamped: number;
  dropped: number;
}

export async function stampLinksFromCommit(input: {
  releaseId: string;
  commitMessage: string;
  projectKey: string;
}): Promise<StampResult>
```

Target signature after this plan:
```typescript
export interface StampResult {
  stamped: number;
  dropped: number;
  autoFlipped: number;   // NEW — count of approved_for_build → built transitions
  orphanLinks: number;   // NEW — count of refs that linked but had non-approved inclusion_state
}

export async function stampLinksFromCommit(input: {
  releaseId: string;
  commitMessage: string;
  projectKey: string;
  commitSha?: string;    // NEW — optional for back-compat; used in audit row transitionedBy
}): Promise<StampResult>
```

Insertion point in current link-stamper.ts (line 144-146):
```typescript
// ── 6. INSERT (batched, single call) ──────────────────────────────────
if (insertRows.length > 0) {
  await db.insert(releaseLogLinks).values(insertRows);
}
// ▲▲▲ EXTENSION GOES IMMEDIATELY AFTER THIS BLOCK ▲▲▲
```

Current caller from src/app/api/platform/ingest/release-logs/route.ts:179-184:
```typescript
await stampLinksFromCommit({
  releaseId: release.id,
  commitMessage: messageText,
  projectKey: project!.key,
});
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Extend stampLinksFromCommit with auto-flip + orphan tracking + commitSha audit (RED → GREEN)</name>
  <files>src/lib/link-stamper.ts, src/lib/link-stamper.test.ts</files>
  <read_first>
    - src/lib/link-stamper.ts (entire file — current 162 lines; the critical insertion point is AFTER line 145 INSERT and BEFORE return at line 148)
    - src/lib/link-stamper.test.ts (entire file — existing mock pattern using closure-state mockDbSelectFromWhere; you'll extend NOT replace)
    - .planning/phases/36-inclusion-approval-state-machine/36-RESEARCH.md (Pattern 2 Link-Stamper Extension, lines 192-247 — full code sketch; Pitfall 4 orphan link soft-warning; Open Question 1 — commitSha is optional for back-compat)
    - .planning/phases/36-inclusion-approval-state-machine/36-CONTEXT.md (D-03 orphan link MUST still write release_log_links — v2.1 behavior preserved; D-Auto-Flip-Audit transitionedBy = 'commit-parser:{commit_sha}')
    - src/lib/commit-parser.test.ts (existing 80+ tests — confirm none are broken by this change)
  </read_first>
  <behavior>
    - Existing v2.1 Phase 11 tests in link-stamper.test.ts and commit-parser.test.ts ALL remain GREEN (no regression)
    - NEW Test A (auto-flip happy path): Commit `Fix BUG-{uuid}` where bug exists AND inclusion_state='approved_for_build' → result.stamped=1, autoFlipped=1, orphanLinks=0; UPDATE issued setting inclusionState='built', nextReleaseLogId=releaseId, updatedAt=now; workflowTransitions row inserted with entityType='bug_report', fromStatus='approved_for_build', toStatus='built', transitionedBy='commit-parser:abc123', reason='auto-flip from commit', metadata containing {releaseLogId}
    - NEW Test B (orphan link): Commit `Fix BUG-{uuid}` where bug exists AND inclusion_state='triaged' → result.stamped=1 (link STILL written), autoFlipped=0, orphanLinks=1; NO UPDATE on bugReports; NO workflowTransitions insert
    - NEW Test C (feature auto-flip): Commit `closes FEAT-{uuid}` where feature in 'approved_for_build' → autoFlipped=1 for feature_request entity
    - NEW Test D (mixed batch): Commit `Fix BUG-{a} and closes FEAT-{b}` where bug='approved_for_build' but feature='triaged' → stamped=2, autoFlipped=1 (bug), orphanLinks=1 (feature)
    - NEW Test E (no commitSha → graceful fallback): Call without commitSha → audit transitionedBy='commit-parser:unknown'
    - NEW Test F (invalid bug ID): Commit references BUG-{uuid} that DOES NOT EXIST in bug_reports → dropped+1, NO flip, NO orphan (orphan only counts validated refs)
    - NEW Test G (state guard prevents double-flip): If somehow inclusion_state is already 'built' when the auto-flip runs (e.g., re-ingest), UPDATE WHERE inclusionState='approved_for_build' returns 0 rows → autoFlipped=0, no audit row (Pitfall 5 idempotency)
  </behavior>
  <action>
    1. EXTEND `src/lib/link-stamper.test.ts` (DO NOT replace existing tests — Phase 11 test baseline must stay GREEN):

       a. Update the existing `mockDbInsertValues` and add a new mock for the UPDATE chain. The current mock supports `db.insert(table).values(rows)`; we now need `db.update(table).set(updates).where(cond).returning({id})`. Extend the `vi.mock('@/lib/db', ...)` block:
       ```typescript
       const mockDbUpdateSet = vi.fn();
       const mockDbUpdateWhereReturning = vi.fn();

       vi.mock('@/lib/db', () => ({
         db: {
           select: vi.fn(/* unchanged */),
           insert: vi.fn(/* unchanged */),
           update: vi.fn(() => ({
             set: vi.fn(() => ({
               where: vi.fn(() => ({
                 returning: (cols: unknown) => mockDbUpdateWhereReturning(cols),
               })),
             })),
           })),
         },
       }));
       ```

       b. Extend `setupSelectResponses` to handle the new inclusionState lookup. The stamper now needs to read the inclusionState of validated bug/feature rows (or fold inclusionState into the existing validation SELECT). To minimize SELECT call count, change the existing bugReports validation SELECT to also project `inclusionState`:
       ```typescript
       // Current: .select({ id: bugReports.id }).from(bugReports).where(inArray(...))
       // New:     .select({ id: bugReports.id, inclusionState: bugReports.inclusionState }).from(bugReports).where(inArray(...))
       ```
       So the SELECT count stays at 2 (bugs + features) plus optional projects lookup at index 2. Update tests to return `[{id: VALID_BUG_UUID, inclusionState: 'approved_for_build'}]` etc.

       c. ADD the 7 new tests (A through G above) inside the existing `describe('stampLinksFromCommit', ...)` block.

       d. Run `npx vitest run src/lib/link-stamper.test.ts` — Tests A-G MUST FAIL initially (RED) because the extension does not yet exist. Existing v2.1 tests should still pass IF the SELECT signature change (added `inclusionState`) is benign for them (it is — they just ignore the extra field).

    2. EDIT `src/lib/link-stamper.ts`:

       a. Add imports at top (line 19-20 area, alongside existing `releaseLogLinks, bugReports, featureRequests, projects`):
       ```typescript
       import { releaseLogLinks, bugReports, featureRequests, projects, workflowTransitions } from '@/db/schema';
       import { inArray, eq, and } from 'drizzle-orm';
       ```

       b. Update `StampResult` interface (line 22-25):
       ```typescript
       export interface StampResult {
         stamped: number;
         dropped: number;
         autoFlipped: number;   // Phase 36 INCL-06
         orphanLinks: number;   // Phase 36 INCL-06 / Pitfall 4
       }
       ```

       c. Update function signature input (line 27-31):
       ```typescript
       export async function stampLinksFromCommit(input: {
         releaseId: string;
         commitMessage: string;
         projectKey: string;
         commitSha?: string;   // Phase 36 INCL-06 audit provenance (optional, back-compat)
       }): Promise<StampResult>
       ```

       d. Destructure `commitSha`: `const { releaseId, commitMessage, projectKey, commitSha } = input;`

       e. Update the fast-path returns (lines 36, 43) to include `autoFlipped: 0, orphanLinks: 0`:
       ```typescript
       if (!commitMessage || commitMessage.trim().length === 0) {
         return { stamped: 0, dropped: 0, autoFlipped: 0, orphanLinks: 0 };
       }
       // ... and for the parsed.length === 0 branch
       ```

       f. Change the bug validation SELECT (line 59-66) to also project inclusionState. Build a Map<id, inclusionState>:
       ```typescript
       const validBugIds = new Set<string>();
       const bugInclusionStates = new Map<string, string>();
       if (bugIds.length > 0) {
         const rows = await db
           .select({ id: bugReports.id, inclusionState: bugReports.inclusionState })
           .from(bugReports)
           .where(inArray(bugReports.id, bugIds));
         for (const row of rows) {
           validBugIds.add(row.id);
           bugInclusionStates.set(row.id, row.inclusionState);
         }
       }
       ```
       Same for featureRequests (lines 69-78) — add `featureInclusionStates: Map<string, string>`.

       g. AFTER line 145 (the existing `if (insertRows.length > 0) { await db.insert(releaseLogLinks).values(insertRows); }`), and BEFORE the return at line 148, INSERT this new block:
       ```typescript
       // ── 7. Phase 36 INCL-06: auto-flip approved_for_build → built ──
       let autoFlipped = 0;
       let orphanLinks = 0;
       const auditSha = commitSha ?? 'unknown';

       // Identify which validated bug IDs were 'approved_for_build' (flip) vs other (orphan)
       const bugsToFlip: string[] = [];
       for (const id of validBugIds) {
         if (bugInclusionStates.get(id) === 'approved_for_build') {
           bugsToFlip.push(id);
         } else {
           orphanLinks++;
         }
       }
       const featuresToFlip: string[] = [];
       for (const id of validFeatureIds) {
         if (featureInclusionStates.get(id) === 'approved_for_build') {
           featuresToFlip.push(id);
         } else {
           orphanLinks++;
         }
       }

       if (bugsToFlip.length > 0) {
         const flipped = await db
           .update(bugReports)
           .set({ inclusionState: 'built', nextReleaseLogId: releaseId, updatedAt: new Date() })
           .where(and(
             inArray(bugReports.id, bugsToFlip),
             eq(bugReports.inclusionState, 'approved_for_build'),  // state guard — Pitfall 5
           ))
           .returning({ id: bugReports.id });
         autoFlipped += flipped.length;
         if (flipped.length > 0) {
           await db.insert(workflowTransitions).values(flipped.map(f => ({
             entityType: 'bug_report',
             entityId: f.id,
             fromStatus: 'approved_for_build',
             toStatus: 'built',
             transitionedBy: `commit-parser:${auditSha}`,
             reason: 'auto-flip from commit',
             metadata: { releaseLogId: releaseId },
           })));
         }
       }

       if (featuresToFlip.length > 0) {
         const flipped = await db
           .update(featureRequests)
           .set({ inclusionState: 'built', nextReleaseLogId: releaseId, updatedAt: new Date() })
           .where(and(
             inArray(featureRequests.id, featuresToFlip),
             eq(featureRequests.inclusionState, 'approved_for_build'),
           ))
           .returning({ id: featureRequests.id });
         autoFlipped += flipped.length;
         if (flipped.length > 0) {
           await db.insert(workflowTransitions).values(flipped.map(f => ({
             entityType: 'feature_request',
             entityId: f.id,
             fromStatus: 'approved_for_build',
             toStatus: 'built',
             transitionedBy: `commit-parser:${auditSha}`,
             reason: 'auto-flip from commit',
             metadata: { releaseLogId: releaseId },
           })));
         }
       }
       ```

       h. Update the return statement (line 148-151):
       ```typescript
       return {
         stamped: insertRows.length,
         dropped: totalCandidates - insertRows.length,
         autoFlipped,
         orphanLinks,
       };
       ```

       i. Update the catch-block fallback return (line 156-160) to also include `autoFlipped: 0, orphanLinks: 0`.

    3. Run `npx vitest run src/lib/link-stamper.test.ts src/lib/commit-parser.test.ts` — ALL tests (existing + new A-G) must pass. If any v2.1 Phase 11 test breaks, fix the regression (likely a return-shape mismatch — old tests asserted on `result.stamped` only; check that adding `autoFlipped`/`orphanLinks` to the object doesn't fail strict equality assertions).
  </action>
  <verify>
    <automated>npx vitest run src/lib/link-stamper.test.ts src/lib/commit-parser.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "autoFlipped" src/lib/link-stamper.ts` returns >= 6 (interface + variable + flipped.length increments + return)
    - `grep -c "orphanLinks" src/lib/link-stamper.ts` returns >= 4
    - `grep -c "commit-parser:" src/lib/link-stamper.ts` returns >= 2 (one audit per entity type)
    - `grep -c "auto-flip from commit" src/lib/link-stamper.ts` returns >= 2
    - `grep -c "eq(bugReports.inclusionState, 'approved_for_build')" src/lib/link-stamper.ts` returns 1 (state-guard in WHERE — Pitfall 5)
    - `grep -c "eq(featureRequests.inclusionState, 'approved_for_build')" src/lib/link-stamper.ts` returns 1
    - `grep -c "commitSha\\?" src/lib/link-stamper.ts` returns 1 (optional commitSha in input type)
    - `npx vitest run src/lib/link-stamper.test.ts` reports 0 failures with original Phase 11 tests still passing AND new tests A-G passing
    - `npx vitest run src/lib/commit-parser.test.ts` reports 0 failures (100% of v2.1 Phase 11 commit-parser tests GREEN — success criterion #3 from CONTEXT)
  </acceptance_criteria>
  <done>link-stamper extended with auto-flip + orphan tracking + commitSha audit; v2.1 Phase 11 test baseline preserved; new behavior covered by tests A-G.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Pass commitSha through ingest route and log orphan warning when orphanLinks > 0 (Pitfall 4)</name>
  <files>src/app/api/platform/ingest/release-logs/route.ts</files>
  <read_first>
    - src/app/api/platform/ingest/release-logs/route.ts (lines 160-189 — current messageText composition + stampLinksFromCommit call)
    - src/lib/link-stamper.ts (the updated StampResult shape from Task 1 — autoFlipped + orphanLinks)
    - .planning/phases/36-inclusion-approval-state-machine/36-RESEARCH.md (Open Question 2 — recommendation: console.warn with structured payload as V1; defer dashboard surface to follow-up phase)
    - .planning/phases/36-inclusion-approval-state-machine/36-CONTEXT.md (D-03 orphan link soft-warning to commit-parser stats so staff sees signal)
  </read_first>
  <behavior>
    - The ingest route now passes `commitSha: release.commitSha` in the input to stampLinksFromCommit
    - When stampLinksFromCommit returns `{orphanLinks > 0}`, the ingest route emits `console.warn('[link-stamper] orphan links detected', {releaseId, project, orphanLinks, autoFlipped, stamped})` with a structured payload
    - The existing try/catch envelope at lines 158-187 is preserved — link-stamping failures still NEVER block release ingest (forgiving principle)
    - The existing 201 response shape is unchanged
  </behavior>
  <action>
    1. EDIT `src/app/api/platform/ingest/release-logs/route.ts` around line 178-184:

       a. Capture the return value:
       ```typescript
       if (messageText.length > 0) {
         const stampResult = await stampLinksFromCommit({
           releaseId: release.id,
           commitMessage: messageText,
           projectKey: project!.key,
           commitSha: release.commitSha,   // ← NEW: Phase 36 audit provenance
         });

         // Phase 36 INCL-06 / Pitfall 4: surface orphan-link signal so staff sees commits
         // referencing items that weren't in approved_for_build.
         if (stampResult.orphanLinks > 0) {
           console.warn('[link-stamper] orphan links detected', {
             releaseId: release.id,
             project: project!.key,
             orphanLinks: stampResult.orphanLinks,
             autoFlipped: stampResult.autoFlipped,
             stamped: stampResult.stamped,
           });
         }
       }
       ```

       b. Verify the try/catch envelope (lines 158-187) still wraps the entire block — link-stamper failure must NOT 500 the ingest. The existing `} catch (err) { console.error('[ingest/release-logs] link stamping failed (non-blocking)', err); }` is preserved.

    2. Verify no test for this route file regresses. Run `npx vitest run src/app/api/platform/ingest/release-logs/` if a test file exists. If not, smoke-test by importing the route module in a fresh node REPL or rely on the integration that follows in Plan 36-04 / TMI pilot UAT.
  </action>
  <verify>
    <automated>grep -c "commitSha: release.commitSha" src/app/api/platform/ingest/release-logs/route.ts &amp;&amp; grep -c "orphan links detected" src/app/api/platform/ingest/release-logs/route.ts &amp;&amp; npx vitest run src/app/api/platform/ingest/release-logs/ 2>&amp;1 | tail -5</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "commitSha: release.commitSha" src/app/api/platform/ingest/release-logs/route.ts` returns exactly 1
    - `grep -c "orphan links detected" src/app/api/platform/ingest/release-logs/route.ts` returns exactly 1
    - `grep -c "stampResult.orphanLinks > 0" src/app/api/platform/ingest/release-logs/route.ts` returns exactly 1
    - The existing try/catch envelope is preserved — `grep -c "link stamping failed (non-blocking)" src/app/api/platform/ingest/release-logs/route.ts` still returns 1
    - If a test file exists for this route, all tests still pass (otherwise this is a future Plan 36-04 / TMI UAT integration check)
  </acceptance_criteria>
  <done>Ingest route passes commitSha through to stampLinksFromCommit and surfaces orphan warnings as console.warn — staff observability hook landed without breaking the forgiving envelope.</done>
</task>

</tasks>

<verification>
- `npx vitest run src/lib/link-stamper.test.ts src/lib/commit-parser.test.ts` reports 0 failures (v2.1 Phase 11 baseline preserved + new tests A-G pass)
- stampLinksFromCommit signature includes optional commitSha (verifiable: grep `commitSha\\?` in src/lib/link-stamper.ts)
- StampResult interface now has 4 fields (verifiable: grep `autoFlipped`, `orphanLinks`)
- WHERE clause includes state guard `inclusionState = 'approved_for_build'` for idempotent re-runs (Pitfall 5)
- Ingest caller passes `commitSha: release.commitSha` (verifiable)
- Orphan signal surfaces as console.warn with structured payload (verifiable: grep `orphan links detected`)
</verification>

<success_criteria>
- TMI pilot dogfood: when a commit lands referencing a `BUG-{uuid}` that is `approved_for_build`, the dev release ingest auto-flips the bug to `built` and stamps `next_release_log_id` with the dev row id (verifiable via direct SELECT after a real ingest)
- When a commit lands referencing a `BUG-{uuid}` in `triaged` (not yet approved), the release_log_links row IS written (v2.1 commit-parser behavior preserved) and a `[link-stamper] orphan links detected` warning fires in admin logs
- Re-ingesting the same commit a second time produces autoFlipped=0 (state-guard WHERE clause filters out already-flipped rows — Pitfall 5)
- workflow_transitions audit row attributable to specific commit via `transitionedBy = 'commit-parser:{sha}'` (verifiable via SELECT)
</success_criteria>

<output>
After completion, create `.planning/phases/36-inclusion-approval-state-machine/36-03-link-stamper-autoflip-SUMMARY.md` documenting:
- Total v2.1 Phase 11 tests passing after extension (should match pre-extension count)
- Total new tests added (target ≥7: A-G)
- Any Vitest mock complexity discovered (e.g. did mockDbUpdateWhereReturning need a Promise.resolve wrapper?)
- TMI smoke-test result (find a TMI bug, flip to approved_for_build via API, push a commit referencing BUG-{uuid}, verify auto-flip + audit row in workflow_transitions)
- Confirmation that the existing forgiving try/catch envelope on the ingest route is preserved
</output>
