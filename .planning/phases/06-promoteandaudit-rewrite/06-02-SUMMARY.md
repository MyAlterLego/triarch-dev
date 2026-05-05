---
phase: 06-promoteandaudit-rewrite
plan: 02
subsystem: slack-notifications
tags: [rc-05, slack, tdd, branch-display, approve-route]
dependency_graph:
  requires: []
  provides: [notifyReleaseApproved-branch-field, approve-route-branch-passthrough]
  affects: [src/lib/slack.ts, src/app/api/projects/[slug]/releases/[releaseId]/approve/route.ts]
tech_stack:
  added: []
  patterns: [TDD Red-Green, null-coalescing fallback for branch display]
key_files:
  created:
    - src/lib/__tests__/slack-notify.test.ts
    - src/app/api/projects/[slug]/releases/[releaseId]/approve/route.test.ts
  modified:
    - src/lib/slack.ts
    - src/app/api/projects/[slug]/releases/[releaseId]/approve/route.ts
decisions:
  - "Option A (RESEARCH §2): signPayload(input.releaseId, 'promote') left unchanged — no crypto/value-format changes"
  - "null branch falls back to literal 'main' via branchDisplay = input.branch ?? 'main' local variable"
  - "branch is a required field (not optional) in notifyReleaseApproved input — callers must explicitly pass null when unknown"
metrics:
  duration_seconds: 155
  completed_date: "2026-05-05"
  tasks_completed: 2
  files_modified: 4
---

# Phase 06 Plan 02: notifyReleaseApproved Branch Field Summary

Surface the branch name in OttoBot's release-approval Slack message. Single function update — `notifyReleaseApproved` gains `branch: string | null` and the approve route call site passes `release.branch ?? null` through.

## What Was Built

### notifyReleaseApproved Final Signature

```typescript
export async function notifyReleaseApproved(input: {
  releaseId: string;
  project: string;
  version: string;
  approverEmail: string;
  status: string;
  feedbackExcerpt: string;
  feedbackOverflowCount: number;
  branch: string | null;  // RC-05 addition
}): Promise<{ ok: boolean; ts?: string; error?: string }>
```

### Header Text Format (Verbatim)

**Before (RC-05):**
```
:rocket: *Release Approved: ${input.project} ${input.version}*\n*Approver:* ${input.approverEmail}\n*Status:* ${input.status}
```

**After (RC-05):**
```
:rocket: *${branchDisplay} ${input.version} approved by ${input.approverEmail}*\n*Project:* ${input.project}\n*Status:* ${input.status}
```

Where `branchDisplay = input.branch ?? 'main'`.

The outer `postSlackMessage text:` field (Slack fallback string) remains `Release Approved: ${input.project} ${input.version}` — unchanged per plan constraints.

### Why signPayload Was NOT Changed (Option A — RESEARCH §2)

Per `06-RESEARCH.md` §2 (lines 173–225), Option A was confirmed: the HMAC-signed button `value` (`${releaseId}.${nonce}.${sig}`) does NOT embed the branch. The `/api/slack/interact` handler already fetches the full release row from the DB (including `release.branch`) when it calls `promoteAndAudit`. Changing the packed value format would break `verifyPayload` for all in-flight messages at the time of deploy.

The `signPayload(input.releaseId, 'promote')` call at slack.ts line 277 is unchanged.

## Decisions Made

1. **Option A (RESEARCH §2)**: No changes to `signPayload` / `verifyPayload` — branch travels through the DB row, not through the Slack button value.
2. **Null fallback to 'main'**: D-05 spec — `const branchDisplay = input.branch ?? 'main'` renders 'main' for legacy releases where branch is null.
3. **Required field, not optional**: `branch: string | null` (not `branch?: string | null`) — callers are forced to make the null decision explicitly at the call site.

## Test Counts

| Wave | Phase | Count | Status |
|------|-------|-------|--------|
| Wave 0 (RED) | Task 1 commit `be1e0c5` | 7 tests | RED (branch field absent) |
| Wave 1 (GREEN) | Task 2 commit `6cf6f5d` | 7 tests | GREEN |

**slack-notify.test.ts (3 tests):**
- renders branch + version + approver in header when branch is set
- falls back to "main" when branch is null
- button payload still uses signPayload(releaseId, "promote") — value format unchanged

**approve/route.test.ts (4 tests):**
- passes branch=release.branch to notifyReleaseApproved on fresh approve
- passes branch=null when release.branch is null
- does NOT call notifyReleaseApproved on idempotent re-approve (alreadyApproved=true)
- returns auth error and does NOT call notifyReleaseApproved when not signed in

## Task Commits

| Task | Type | Commit | Description |
|------|------|--------|-------------|
| 1 (RED) | test | `be1e0c5` | Add failing tests for branch field + call site |
| 2 (GREEN) | feat | `6cf6f5d` | Implement branch in notifyReleaseApproved + route |

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all data is wired to real DB values. `release.branch` from the fetched release row flows directly to `notifyReleaseApproved`.

## Self-Check: PASSED

Files exist:
- FOUND: src/lib/__tests__/slack-notify.test.ts
- FOUND: src/app/api/projects/[slug]/releases/[releaseId]/approve/route.test.ts
- FOUND: src/lib/slack.ts (modified)
- FOUND: src/app/api/projects/[slug]/releases/[releaseId]/approve/route.ts (modified)

Commits exist:
- FOUND: be1e0c5 (test RED)
- FOUND: 6cf6f5d (feat GREEN)

Tests: 14 files, 95 tests, 0 failures. TSC: 0 errors.
