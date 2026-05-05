---
phase: 06-promoteandaudit-rewrite
plan: "03"
subsystem: promote-callback
tags: [slack, threaded-reply, rc-06, d-11, d-15, tdd]
dependency_graph:
  requires: ["06-01"]
  provides: ["RC-06"]
  affects: ["src/app/api/platform/promote-callback/route.ts", "src/app/api/platform/promote-callback/route.test.ts"]
tech_stack:
  added: []
  patterns: ["postSlackThreadedReply", "db.select().from(releaseLogs).where(and(eq,eq)).orderBy(desc,desc).limit(1)"]
key_files:
  created: []
  modified:
    - src/app/api/platform/promote-callback/route.ts
    - src/app/api/platform/promote-callback/route.test.ts
decisions:
  - "buildPromoteReplyText exported at module scope (enables unit-testable helper) and invoked inline in POST handler"
  - "Release lookup runs AFTER the insert — promote_attempts row is the source of truth (D-15)"
  - "TypeScript error in src/lib/__tests__/release-concurrent.test.ts is out-of-scope (parallel agent 06-04 file)"
metrics:
  duration: "119s"
  completed: "2026-05-05T17:30:12Z"
  tasks_completed: 2
  files_modified: 2
---

# Phase 06 Plan 03: promote-callback Slack Threaded Reply Summary

**One-liner:** Slack threaded reply on promote-callback with conflict/merged/ci_failed variants using releaseLogs.metadata.dispatch anchor.

## What Was Built

Extended `POST /api/platform/promote-callback` to post a Slack threaded reply after every promote-branch.yml result, targeting the original `:rocket: Workflow dispatched:` message anchored by Plan 06-01's `metadata.dispatch.{slackChannelId, slackMessageTs}`.

### route.ts Changes

**Imports added:**
- `and`, `desc`, `eq` from `drizzle-orm`
- `releaseLogs` from `@/db/schema`
- `postSlackThreadedReply` from `@/lib/slack`

**`buildPromoteReplyText` helper** (exported, module-scope):

| result | Output |
|--------|--------|
| `merged` | `:white_check_mark: Promoted {branch} to main (sha: {sha[:7]})` |
| `ci_failed` | `:no_entry: CI failed for {branch} — see {ci_run_url}` |
| `conflict` | `:warning: Cannot promote {branch} — conflicts with main:` + code-block file list (cap 50, `+ N more files` overflow) + `Rebase manually on main, push as a new RC to retry.` |

**Release lookup** (after insert, before response):
```typescript
const [latestRelease] = await db
  .select()
  .from(releaseLogs)
  .where(and(eq(releaseLogs.project, project!.key), eq(releaseLogs.branch, branch as string)))
  .orderBy(desc(releaseLogs.deployedAt), desc(releaseLogs.releasedAt))
  .limit(1);
```

**D-11 guard:** Missing `metadata.dispatch.slackChannelId` or `.slackMessageTs` → `console.warn` + early 201 return, no Slack call.

**D-15 guard:** `postSlackThreadedReply` wrapped in `try/catch` → `console.warn` on error, 201 always returned.

### buildPromoteReplyText Verbatim Output Examples

**conflict (3 files):**
```
:warning: Cannot promote feat/change-font — conflicts with main:
```
src/foo.ts
src/bar.ts
src/baz.tsx
```
Rebase manually on main, push as a new RC to retry.
```

**conflict (53 files — overflow):**
```
:warning: Cannot promote feat/change-font — conflicts with main:
```
src/file-0.ts
...
src/file-49.ts
+ 3 more files
```
Rebase manually on main, push as a new RC to retry.
```

**merged:**
```
:white_check_mark: Promoted feat/change-font to main (sha: abc1234)
```

**ci_failed:**
```
:no_entry: CI failed for feat/change-font — see https://github.com/MyAlterLego/truth-treason/actions/runs/123
```

### Test Count: 7 → 14

| Test | Coverage |
|------|----------|
| 1–7 (existing) | 401/403 auth, 400 validation (×3), 201 merged, 201 conflict |
| 8 | RC-06: conflict → :warning: reply with file list + rebase hint |
| 9 | RC-06: conflict >50 files → `+ N more files` overflow |
| 10 | D-13: merged → :white_check_mark: with 7-char sha |
| 11 | D-13: ci_failed → :no_entry: with ci_run_url |
| 12 | D-11: missing metadata.dispatch → 201 + db insert + no Slack + console.warn |
| 13 | D-11: no release row at all → 201 + db insert + no Slack |
| 14 | D-15: Slack throws → still 201 + db insert + console.warn |

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 (RED) | 0cee83f | test(06-03): extend route.test.ts with db.select mock + 7 RC-06/D-11/D-15 tests |
| 2 (GREEN) | 32314b6 | feat(06-03): extend promote-callback with release lookup + Slack threaded reply |

## Deviations from Plan

### Out-of-Scope Issue Logged

**TypeScript error in parallel-agent file** (`src/lib/__tests__/release-concurrent.test.ts`): TS2353 error exists in a file owned by the 06-04 parallel agent. This is outside our file scope (not in the `files_modified` list for 06-03) and is deferred to the 06-04 agent per the parallel execution contract.

No deviations within plan scope — executed exactly as written.

## Known Stubs

None. All three result variants are fully wired: conflict files, merge_sha, and ci_run_url are read from the request body and passed through to the reply text.

## Self-Check

Files exist:
- `src/app/api/platform/promote-callback/route.ts` — FOUND
- `src/app/api/platform/promote-callback/route.test.ts` — FOUND

Commits exist:
- 0cee83f — FOUND
- 32314b6 — FOUND

Test results: 14 passed, 0 failed (npx vitest run route.test.ts)
Full suite: 105 passed, 0 failed

## Self-Check: PASSED
