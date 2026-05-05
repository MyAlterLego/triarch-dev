---
phase: 06-promoteandaudit-rewrite
plan: "01"
subsystem: release-promotion
tags: [dispatch, jsonb, slack-metadata, vitest, RC-04]
dependency_graph:
  requires: []
  provides: [promote-branch.yml dispatch, jsonb_set metadata write, dispatch.slackChannelId/slackMessageTs/dispatchedAt]
  affects: [src/lib/release-promotion.ts, src/lib/release-promotion.test.ts]
tech_stack:
  added: []
  patterns: [jsonb_set COALESCE merge, Drizzle sql tagged-template, vitest mockSetCapture capture pattern]
key_files:
  modified:
    - src/lib/release-promotion.ts
    - src/lib/release-promotion.test.ts
decisions:
  - "D-01/D-02: workflowFile='promote-branch.yml', ref='main', inputs={branch: release.branch ?? 'main'} — tag input removed"
  - "D-08/D-09: sql`jsonb_set(COALESCE(...), '{dispatch}', ...::jsonb, true)` preserves metadata.previewUrl (Pitfall 1)"
  - "JSDoc comment updated to reflect new dispatch target"
metrics:
  duration: ~5 minutes
  completed: "2026-05-05"
  tasks_completed: 2
  files_changed: 2
---

# Phase 6 Plan 01: promoteAndAudit Dispatch Rewrite Summary

**One-liner:** Swap `deploy-prod.yml + {tag}` to `promote-branch.yml + {branch}` and persist `metadata.dispatch.*` via `jsonb_set` for callback thread anchoring.

## What Was Built

### Task 1: src/lib/release-promotion.ts

**Dispatch call diff (lines 99–105):**
```
- workflowFile: 'deploy-prod.yml',
- inputs: { tag: release.version },
+ workflowFile: 'promote-branch.yml',
+ inputs: { branch: release.branch ?? 'main' },
```

**jsonb_set SQL pattern (verbatim):**
```typescript
const dispatchMetaJson = JSON.stringify({
  slackChannelId: channelId,
  slackMessageTs: messageTs,
  dispatchedAt: new Date().toISOString(),
});
await db
  .update(releaseLogs)
  .set({
    promotionDispatchedAt: new Date(),
    promotionDispatchedBy: actorEmail,
    metadata: sql`jsonb_set(
      COALESCE(${releaseLogs.metadata}, '{}'::jsonb),
      '{dispatch}',
      ${dispatchMetaJson}::jsonb,
      true
    )`,
  })
  .where(eq(releaseLogs.id, release.id));
```

**Success-path threaded reply updated:**
```
:rocket: Workflow dispatched: promote-branch.yml (${owner}/${repo}, branch=${release.branch ?? 'main'})
```

### Task 2: src/lib/release-promotion.test.ts

**Test count:** 7 existing (originally 6, plus "never throws" = 7) + 3 new = **10 tests, 10 passed**

Note: PLAN estimated 9 tests (6+3) but the file had 7 original tests. All 10 pass.

**3 existing tests updated:**
1. "success path" — assert `workflowFile: 'promote-branch.yml'` + `inputs: { branch: 'feat/change-font' }` + reply text contains `'promote-branch.yml'`
2. "dispatch throws (404)" — error message references `promote-branch.yml`
3. `mockUpdate` → `mockUpdateWhere` rename throughout (db mock refactored to capture `.set()` args)

**3 new tests added:**
1. `null branch falls back to "main" in dispatch inputs` — verifies `release.branch === null → inputs.branch === 'main'`, no `tag` field
2. `writes Slack metadata via jsonb_set (preserves existing metadata fields)` — captures `.set()` args, asserts `metadata` is a Drizzle `sql` template object (not plain `{dispatch: ...}`), confirms `promotionDispatchedAt` + `promotionDispatchedBy` still present (D-04)
3. `dispatch failure path STILL writes metadata + audit columns` — verifies metadata write happens on the failure path too

**db mock refactored:**
```typescript
const mockSetCapture = vi.fn();
const mockUpdateWhere = vi.fn();
vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({ from: () => ({ where: mockSelect }) }),
    update: () => ({
      set: (args: unknown) => {
        mockSetCapture(args);
        return { where: mockUpdateWhere };
      },
    }),
  },
}));
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Stale JSDoc comment**
- **Found during:** Task 1 post-edit verification
- **Issue:** JSDoc on line 30 still said `dispatchWorkflow(deploy-prod.yml, ...)` after the dispatch was changed
- **Fix:** Updated JSDoc to reflect `promote-branch.yml` + `branch` input
- **Files modified:** src/lib/release-promotion.ts
- **Commit:** 475b677

**2. [Observation] Test count was 10 not 9**
- **Found during:** Task 2 test run
- **Issue:** Plan said "6 existing" but the file had 7 tests (the "never throws" test was a 7th). The plan's count was slightly off.
- **Resolution:** No action needed — all 10 tests pass. Plan said "9 passed" as expected minimum; 10 is a superset.

## Full Suite Status

- `npx vitest run src/lib/release-promotion.test.ts` → **10 passed, 0 failed**
- `npx vitest run` → 4 failures in 06-02 parallel agent's TDD RED tests (`slack-notify.test.ts`, `approve/route.test.ts`) — these are **pre-existing, expected failures** from 06-02's uncommitted GREEN phase. Not caused by this plan.
- `npx tsc --noEmit` → **0 errors**

## Self-Check: PASSED

Files exist:
- FOUND: src/lib/release-promotion.ts
- FOUND: src/lib/release-promotion.test.ts

Commits exist:
- FOUND: 475b677 (Task 1 — release-promotion.ts)
- FOUND: 6ecead6 (Task 2 — release-promotion.test.ts)
