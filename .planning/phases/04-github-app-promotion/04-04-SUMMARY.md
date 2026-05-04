---
phase: 04-github-app-promotion
plan: "04"
subsystem: api
tags: [slack, github-app, workflow-dispatch, fire-and-forget, vitest]

# Dependency graph
requires:
  - phase: 04-01
    provides: promotionDispatchedAt + promotionDispatchedBy columns on releaseLogs
  - phase: 04-02
    provides: dispatchWorkflow() function in github-app.ts
  - phase: 03
    provides: /api/slack/interact route + approveRelease helper + slack.ts postSlackMessage pattern

provides:
  - postSlackThreadedReply exported from slack.ts (threaded Slack reply via chat.postMessage with thread_ts)
  - updateSlackMessage exported from slack.ts (in-place message amendment via chat.update)
  - promoteAndAudit() in release-promotion.ts (full promotion side-effect chain)
  - Fire-and-forget promoteAndAudit call in /api/slack/interact after approveRelease success

affects:
  - 05-webhook-roundtrip (reads promotionDispatchedAt to verify dispatch happened before recording deploy completion)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Fire-and-forget Promise with .catch() guard for Slack 3-second rule compliance
    - Audit columns updated on ATTEMPT regardless of outcome (success or failure both record)
    - Idempotency guard (!alreadyApproved) prevents re-dispatch on re-clicks

key-files:
  created:
    - src/lib/release-promotion.ts
    - src/lib/release-promotion.test.ts
  modified:
    - src/lib/slack.ts
    - src/app/api/slack/interact/route.ts

key-decisions:
  - "promoteAndAudit is NOT awaited in route.ts - fire-and-forget with .catch ensures Slack 200 returns within 3 seconds"
  - "Audit columns (promotionDispatchedAt/By) update on dispatch ATTEMPT, not just success - records that a dispatch was tried even if it failed"
  - "Audit columns NOT updated when project lookup fails before dispatch - no attempt, no audit row"
  - "chat.update only fires on dispatch failure (or project-config failure) - success path leaves original message intact"
  - "postSlackMessage remains private - new helpers are standalone (slightly redundant but keeps module surface minimal)"

patterns-established:
  - "Slack 3-second compliance: return JSON response before any async side-effects; side-effects in fire-and-forget Promise"
  - "Promotion failure recovery: threaded Slack reply + chat.update original message to surface failure in channel"

requirements-completed:
  - GATE-10
  - GATE-11

# Metrics
duration: 3min
completed: 2026-05-03
---

# Phase 04 Plan 04: GitHub App Promotion Wire-Up Summary

**Slack approve click triggers fire-and-forget dispatchWorkflow(deploy-prod.yml) via promoteAndAudit; success posts :rocket: threaded reply; failure posts :warning: + amends original message via chat.update; audit columns always record the dispatch attempt**

## Performance

- **Duration:** 3 min
- **Started:** 2026-05-03T14:03:04Z
- **Completed:** 2026-05-03T14:06:11Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments
- Added `postSlackThreadedReply` and `updateSlackMessage` helpers to slack.ts; both mirror the existing graceful no-op + non-throwing error pattern
- Built `promoteAndAudit` in release-promotion.ts encapsulating: project lookup, owner/repo split, dispatchWorkflow call, DB audit update, threaded Slack reply, and chat.update on failure
- Wired promoteAndAudit as fire-and-forget into /api/slack/interact after approveRelease success — Slack handler returns 200 within 3 seconds

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend slack.ts with postSlackThreadedReply + updateSlackMessage helpers** - `570ecc4` (feat)
2. **Task 2: Build src/lib/release-promotion.ts (promoteAndAudit) + Vitest suite** - `75c3837` (feat)
3. **Task 3: Wire promoteAndAudit into /api/slack/interact promote path** - `94ec398` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `src/lib/slack.ts` - Added `postSlackThreadedReply` (chat.postMessage with thread_ts) and `updateSlackMessage` (chat.update); postSlackMessage remains private
- `src/lib/release-promotion.ts` - `promoteAndAudit()` orchestrator; 4 failure modes (project missing, NULL repo, malformed format, dispatch throw); audit columns updated on attempt
- `src/lib/release-promotion.test.ts` - 7-test Vitest suite: success path, 3 project-lookup failures, dispatch throw, error truncation, DB-failure-as-rejection contract
- `src/app/api/slack/interact/route.ts` - Import + fire-and-forget call with !alreadyApproved guard and .catch for unhandled rejections

## Decisions Made
- `promoteAndAudit` is NOT awaited — fire-and-forget with .catch() is the idiomatic Node pattern for Slack 3-second compliance
- Audit columns record the ATTEMPT regardless of dispatch outcome — even on failure, `promotionDispatchedAt` and `promotionDispatchedBy` are written so there is a paper trail
- Audit columns are NOT written when project lookup fails before dispatch — no dispatch attempt was made, so no audit is recorded
- `chat.update` is strictly guarded to the failure path — success path never amends the original message

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required for this plan. GitHub App credentials (GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, GITHUB_APP_INSTALLATION_ID) were established in Plan 04-02 and apphosting.yaml in Plan 04-03.

## Known Stubs
None - promoteAndAudit is fully wired. The only pre-condition for a live dispatch is that `projects.githubRepo` is populated for the target project and the GitHub App installation has access to that repo (covered in 04-03 HUMAN-UAT runbook).

## Next Phase Readiness
- Phase 4 fully complete: Slack click → GitHub Actions workflow_dispatch is wired end-to-end
- Phase 5 (webhook round-trip) can read `promotionDispatchedAt` to verify dispatch occurred before recording `deployed_at`
- GATE-10 and GATE-11 are satisfied

---
*Phase: 04-github-app-promotion*
*Completed: 2026-05-03*
