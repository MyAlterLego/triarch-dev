---
phase: 09-per-project-pipeline-page-and-web-ui-promote
plan: 02
subsystem: api
tags: [slack, vitest, typescript, tdd, release-promotion]

requires:
  - phase: 09-01
    provides: actor_source column on release_approvals + migration 0014

provides:
  - "promoteAndAudit with nullable channelId/messageTs/slackUserName (web-origin safe)"
  - "postSlackChannelMessage export in slack.ts for standalone non-threaded Slack posts"
  - "slackChannelId column on projects table (schema + migration 0015)"
  - "12-test Vitest suite covering Slack-origin (10 existing) and web-origin (2 new) paths"
affects:
  - 09-03 (web Promote API route calls promoteAndAudit with null channelId/messageTs/slackUserName)

tech-stack:
  added: []
  patterns:
    - "channelId === null branch pattern for origin-aware Slack notification routing in promoteAndAudit"
    - "postSlackChannelMessage as thin wrapper over chat.postMessage without thread_ts"
    - "actorSource in dispatchMetaJson audit field (web vs slack) for defense-in-depth"

key-files:
  created:
    - src/db/migrations/0015_projects_slack_channel_id.sql
  modified:
    - src/lib/release-promotion.ts
    - src/lib/release-promotion.test.ts
    - src/lib/slack.ts
    - src/db/schema.ts

key-decisions:
  - "Option (a) selected over Option (b): unified promoteAndAudit with nullable params, not split into dispatchPromotion + notifySlack — harder to misuse"
  - "Web-origin posts fresh Slack message to projects.slackChannelId; graceful no-op if column null"
  - "slackChannelId added to projects schema (migration 0015) — column was assumed by plan but missing from schema"
  - "PROMOTION_FAILED_MSG_TEMPLATE uses slackUserName ?? actorEmail fallback when slackUserName is null"
  - "actorSource written to dispatchMetaJson as defense-in-depth even though route handler also writes actor_source"

patterns-established:
  - "Web-origin Slack notification: postSlackChannelMessage to projects.slackChannelId"
  - "Slack-origin unchanged: postSlackThreadedReply + updateSlackMessage on non-null channelId"

requirements-completed:
  - PROM-03

duration: 5min
completed: 2026-05-07
---

# Phase 09 Plan 02: promoteAndAudit Nullable Slack Params Summary

**promoteAndAudit signature widened with nullable channelId/messageTs/slackUserName; web-origin path posts fresh Slack channel message via new postSlackChannelMessage helper; 12 Vitest tests green**

## Performance

- **Duration:** 5 min
- **Started:** 2026-05-07T22:38:52Z
- **Completed:** 2026-05-07T22:43:52Z
- **Tasks:** 2 (TDD: 1 RED + 1 GREEN)
- **Files modified:** 4

## Accomplishments
- Widened `PromoteAndAuditInput` to accept `channelId: string | null`, `messageTs: string | null`, `slackUserName: string | null`
- Added `postSlackChannelMessage` export to `src/lib/slack.ts` — standalone non-threaded Slack post used by web-origin promotions
- Web-origin branch posts fresh message to `project.slackChannelId`; Slack-origin branch unchanged (existing threaded reply + chat.update path)
- Added `actorSource` field to `dispatchMetaJson` audit record for origin tracking
- Added `slackChannelId` column to `projects` schema + migration 0015

## Task Commits

Each task was committed atomically:

1. **Task 1: Add web-origin test scenarios (RED)** - `0c9ac16` (test)
2. **Task 2: Implement nullable channelId/messageTs (GREEN)** - `10c04bc` (feat)

## Files Created/Modified
- `src/lib/release-promotion.ts` - Type widened to nullable params; origin-aware branching; actorSource in audit
- `src/lib/release-promotion.test.ts` - 2 new web-origin tests; postSlackChannelMessage mock; slackChannelId in project mock
- `src/lib/slack.ts` - Added postSlackChannelMessage export (non-threaded standalone channel post)
- `src/db/schema.ts` - Added slackChannelId to projects table
- `src/db/migrations/0015_projects_slack_channel_id.sql` - ALTER TABLE projects ADD COLUMN slack_channel_id varchar(64)

## Decisions Made
- Option (a) chosen (nullable params, single unified function) over Option (b) (split into two functions) — avoids callers forgetting a function call
- Web-origin Slack notification uses `project.slackChannelId`; graceful no-op with console.warn if null (dispatch still returns ok:true)
- `PROMOTION_FAILED_MSG_TEMPLATE` calls use `slackUserName ?? actorEmail` so the message body always has an actor identity
- `actorSource` written to both `dispatchMetaJson` (defense-in-depth) and will be written to `release_approvals.actor_source` by the 09-03 route handler

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added slackChannelId to projects schema**
- **Found during:** Task 2 (implementing promoteAndAudit)
- **Issue:** Plan referenced `projects.slackChannelId` but the column did not exist in the schema; TypeScript error `Property 'slackChannelId' does not exist on type`
- **Fix:** Added `slackChannelId: varchar('slack_channel_id', { length: 64 })` to the `projects` pgTable in schema.ts; created migration 0015
- **Files modified:** src/db/schema.ts, src/db/migrations/0015_projects_slack_channel_id.sql
- **Verification:** `npx tsc --noEmit` exits 0; all 145 vitest tests pass
- **Committed in:** 10c04bc (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 3 - blocking schema gap)
**Impact on plan:** Essential fix — column was assumed by plan context but missing from schema. No scope creep.

## Issues Encountered
- Pre-existing test failures in `pipeline-summary.test.ts` (tests 11–17 for `getProjectPipelineDetail`) were present before this plan's changes; confirmed by stash/unstash. Out of scope — these relate to 09-01's `getProjectPipelineDetail` function being written in parallel.

## User Setup Required
None — no external service configuration required. The `slack_channel_id` column on `projects` is nullable; existing rows will have NULL and the code gracefully no-ops with a console.warn.

## Next Phase Readiness
- Plan 09-03 (web Promote API route) can now call `promoteAndAudit({ channelId: null, messageTs: null, slackUserName: null })` — the key unblock this plan delivered
- PROM-03 satisfied: Slack is notified on every successful promotion regardless of origin (Slack or web)
- Existing Slack-origin call site in `/api/slack/interact/route.ts` unchanged — no regression

---
*Phase: 09-per-project-pipeline-page-and-web-ui-promote*
*Completed: 2026-05-07*
