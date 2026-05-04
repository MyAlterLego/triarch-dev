---
phase: 03-slack-interactive-approval
plan: "03"
subsystem: slack/notifications
tags: [slack, fire-and-forget, interactive-buttons, signed-payload, release-gating]
dependency_graph:
  requires:
    - signPayload (src/lib/slack-crypto.ts — 03-01)
    - approveRelease (src/lib/release-actions.ts — 03-02)
  provides:
    - notifyReleaseApproved (src/lib/slack.ts)
    - SLACK_RELEASE_APPROVAL_CHANNEL constant (src/lib/slack.ts)
  affects:
    - 03-04 (interact route dispatches on slack_promote / slack_reject action_ids built here)
tech_stack:
  added: []
  patterns:
    - Rich Slack block structure (header section + optional feedback excerpt + actions)
    - signPayload button values for tamper-evident Slack button payloads
    - Fire-and-forget Slack call with try/catch insulation in API route
    - Feedback excerpt: most-recent comment, 200-char truncation + overflow count
key_files:
  created: []
  modified:
    - src/lib/slack.ts
    - src/app/api/projects/[slug]/releases/[releaseId]/approve/route.ts
decisions:
  - "notifyReleaseApproved takes pre-truncated feedbackExcerpt (caller's job) — keeps block construction declarative"
  - "Slack call is awaited inside try/catch (not unawaited) — serverless runtime keeps function alive; errors are swallowed not propagated"
  - "Guard is !result.alreadyApproved — idempotent re-approvals do NOT post duplicate Slack messages"
  - "reject/route.ts is untouched — per CONTEXT.md Area 1, rejection does not notify Slack"
metrics:
  duration_secs: 180
  completed_date: "2026-05-04"
  tasks_completed: 2
  tasks_total: 2
  files_created: 0
  files_modified: 2
---

# Phase 03 Plan 03: Slack Notify on Approve Summary

**One-liner:** notifyReleaseApproved added to slack.ts with rich blocks (header + feedback excerpt + signed interactive Approve & Promote / Reject buttons), wired into approve/route.ts as a guarded fire-and-forget call that skips on idempotent re-approvals and never propagates Slack failures to the API response.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | notifyReleaseApproved in src/lib/slack.ts | a50b4a8 | src/lib/slack.ts |
| 2 | Wire fire-and-forget into approve route | c51a0fc | src/app/api/projects/[slug]/releases/[releaseId]/approve/route.ts |

## What Was Built

### src/lib/slack.ts additions

- **SLACK_RELEASE_APPROVAL_CHANNEL constant** — `process.env.SLACK_RELEASE_APPROVAL_CHANNEL ?? '#release-approvals'`. Follows the existing `SLACK_BUG_CHANNEL` / `SLACK_FEATURE_CHANNEL` pattern.

- **`import { signPayload } from '@/lib/slack-crypto'`** — module-top import for signing button values.

- **`notifyReleaseApproved(input)`** — exported async function returning `{ ok, ts?, error? }` consistent with the other notifiers. Input shape: `{ releaseId, project, version, approverEmail, status, feedbackExcerpt, feedbackOverflowCount }`.

  Block structure:
  1. `section` (mrkdwn): `:rocket: *Release Approved: {project} {version}*\n*Approver:* {email}\n*Status:* {status}`
  2. `section` (mrkdwn, conditional): `> {feedbackExcerpt}` + `\n_(N more comments)_` suffix only when `feedbackOverflowCount > 0`. Omitted entirely when feedbackExcerpt is empty.
  3. `actions` (`block_id: release_actions_{releaseId}`): two buttons:
     - "Approve & Promote" — style primary, action_id `slack_promote`, value `signPayload(releaseId, 'promote')`
     - "Reject" — style danger, action_id `slack_reject`, value `signPayload(releaseId, 'reject')`

  Falls through `postSlackMessage`'s no-token early-return without throwing.

### src/app/api/projects/[slug]/releases/[releaseId]/approve/route.ts additions

- Added `releaseFeedback` to the `@/db/schema` import destructure.
- Added `desc` to the `drizzle-orm` import.
- Added `import { notifyReleaseApproved } from '@/lib/slack'`.
- Inserted fire-and-forget block after the `!result.ok` 409 branch and before the final `return NextResponse.json(...)`:
  - Guards on `!result.alreadyApproved` — idempotent re-approvals do not post duplicates.
  - Queries `releaseFeedback` ordered by `createdAt DESC` to get the most-recent comment.
  - Truncates to 200 chars with `…` if longer; computes `overflow = Math.max(0, feedbackRows.length - 1)`.
  - Calls `notifyReleaseApproved` with all fields populated.
  - `console.warn('[slack] ...')` on both `!slackResult.ok` and caught exceptions.
  - Does NOT alter the response JSON shape.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — `notifyReleaseApproved` is fully functional. Slack delivery depends on `SLACK_BOT_TOKEN` and `SLACK_PAYLOAD_SECRET` being set in the runtime environment (apphosting.yaml secrets, gated by HUMAN-UAT plan 03-05).

## Self-Check: PASSED

Files confirmed modified:
- src/lib/slack.ts — FOUND (notifyReleaseApproved exported, SLACK_RELEASE_APPROVAL_CHANNEL declared, signPayload imported)
- src/app/api/projects/[slug]/releases/[releaseId]/approve/route.ts — FOUND (notifyReleaseApproved called, alreadyApproved guard present)

Commits confirmed:
- a50b4a8 — Task 1 (notifyReleaseApproved)
- c51a0fc — Task 2 (fire-and-forget wiring)

Acceptance criteria verified:
- `grep -c "export async function notifyReleaseApproved" src/lib/slack.ts` — 1
- `grep -c "SLACK_RELEASE_APPROVAL_CHANNEL" src/lib/slack.ts` — 2
- `grep -c "#release-approvals" src/lib/slack.ts` — 1
- `grep -c "signPayload" src/lib/slack.ts` — 3 (import + 2 calls)
- `grep -c "action_id: 'slack_promote'" src/lib/slack.ts` — 1
- `grep -c "action_id: 'slack_reject'" src/lib/slack.ts` — 1
- `grep -c "notifyReleaseApproved" approve/route.ts` — 4 (import + guard comment + call + condition check)
- `grep -c "alreadyApproved" approve/route.ts` — 2
- `grep -c "console.warn" approve/route.ts` — 2
- `grep -c "notifyReleaseApproved" reject/route.ts` — 0
- `npx tsc --noEmit` — clean (0 errors)
- `npx next build` — passed (exit 0)
