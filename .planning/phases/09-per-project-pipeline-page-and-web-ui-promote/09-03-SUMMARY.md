---
phase: 09-per-project-pipeline-page-and-web-ui-promote
plan: 03
subsystem: api
tags: [drizzle, vitest, tdd, race-guard, typescript, nextjs, slack]

# Dependency graph
requires:
  - phase: 09-01
    provides: actor_source column on release_approvals + partial unique index (migration 0014)
  - phase: 09-02
    provides: promoteAndAudit with nullable channelId/messageTs/slackUserName

provides:
  - "POST /api/admin/releases/[id]/promote — staff-only web promote route with atomic UPDATE race guard"
  - "Atomic UPDATE-with-WHERE-IS-NULL race guard on release_logs.promotionDispatchedAt in both web route and Slack handler"
  - "approveRelease and rejectRelease accept optional actorSource parameter (default 'web') written to release_approvals"
  - "7-test Vitest suite for web Promote route (TDD RED + GREEN)"
  - "Slack wantsApprove branch updated with matching atomic guard + ephemeral race-lost message"

affects:
  - "09-04 (per-project pipeline page — promote button calls this route)"
  - "09-05 (promote button client island — reads ok/error from 200 response body)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Atomic UPDATE-with-WHERE-IS-NULL race guard pattern for staff-dispatch idempotency (isNull(releaseLogs.promotionDispatchedAt))"
    - "HTTP 200 with ok:false body for processed-but-failed dispatch (avoid 500 when audit row already written)"
    - "Awaited promoteAndAudit in web route (inline result) vs fire-and-forget in Slack route (3-second rule)"

key-files:
  created:
    - src/app/api/admin/releases/[id]/promote/route.ts
    - src/app/api/admin/releases/[id]/promote/route.test.ts
  modified:
    - src/lib/release-actions.ts
    - src/app/api/slack/interact/route.ts
    - src/lib/__tests__/slack-interact.test.ts

key-decisions:
  - "Web route awaits promoteAndAudit (inline result for PROM-05 client island); Slack route uses fire-and-forget (Slack 3-second rule)"
  - "HTTP 200 with ok:false for dispatch failures — the atomic UPDATE already committed so it's not a server error; client reads ok flag"
  - "409 re-reads release_logs after race-lost UPDATE to surface dispatched_by/dispatched_at for the caller"
  - "actorSource optional with 'web' default — existing callers (customer approve route) unchanged"
  - "Slack db mock extended with update() chain (default race-won) to keep all 14 existing tests green after atomic guard added"

patterns-established:
  - "Race guard pattern: db.update().set().where(and(eq(id), isNull(dispatchedAt))).returning() — empty array = race lost"
  - "Slack interact db mock: update() chain alongside existing select() chain, reset via dbUpdateResult in beforeEach"

requirements-completed: [PROM-03, PROM-04, PROM-05]

# Metrics
duration: 5min
completed: 2026-05-07
---

# Phase 9 Plan 03: Web Promote Route with Atomic Race Guard Summary

**Staff-only POST /api/admin/releases/[id]/promote with UPDATE-with-WHERE-IS-NULL atomic dispatch guard mirrored in Slack handler; approveRelease/rejectRelease write actor_source='web' to release_approvals**

## Performance

- **Duration:** 5 min
- **Started:** 2026-05-07T22:49:21Z
- **Completed:** 2026-05-07T22:54:21Z
- **Tasks:** 3 (1 TDD RED + 1 TDD GREEN + 1 non-TDD with 2 sub-commits)
- **Files modified:** 5

## Accomplishments

- `POST /api/admin/releases/[id]/promote` route: staff-only auth (401/403), 404 on missing release, 400 on non-approved status, atomic UPDATE-with-WHERE-IS-NULL race guard, 409 with dispatched_by/dispatched_at on race lost, awaited `promoteAndAudit` with null Slack params, HTTP 200 with `{ ok, error }` body for PROM-05 client island
- 7-test Vitest TDD suite covering all scenarios: 401, 403, 404, 400 invalid_status, 409 race-lost, 200 happy path, 200 ok:false dispatch failure
- Slack `wantsApprove` branch updated with identical atomic UPDATE guard — concurrent web+Slack clicks on the same release can NEVER both fire dispatch; loser returns ephemeral "Already promoted by another route" message
- `approveRelease` and `rejectRelease` in `release-actions.ts` accept optional `actorSource` parameter (default `'web'`) written into `release_approvals` INSERT rows for audit trail unification (PROM-04 / Pitfall 4)

## Task Commits

Each task was committed atomically:

1. **Task 1: Write failing tests for POST /api/admin/releases/[id]/promote (RED)** - `b293095` (test)
2. **Task 2: Implement POST /api/admin/releases/[id]/promote (GREEN)** - `d910eb6` (feat)
3. **Task 3a: Record actor_source on release_approvals INSERTs** - `cc960d7` (feat)
4. **Task 3b: Add atomic dispatch guard to slack_promote handler** - `470440f` (feat)

## Files Created/Modified

- `src/app/api/admin/releases/[id]/promote/route.test.ts` — 7-test Vitest suite (TDD RED scaffold committed first; GREEN after route implementation)
- `src/app/api/admin/releases/[id]/promote/route.ts` — Staff-only POST handler: auth, status guard, atomic UPDATE race guard, awaited promoteAndAudit, inline result
- `src/lib/release-actions.ts` — `approveRelease` and `rejectRelease` extended with optional `actorSource` field (default `'web'`) passed to release_approvals INSERT
- `src/app/api/slack/interact/route.ts` — `wantsApprove` branch: added `isNull` import + atomic UPDATE guard before fire-and-forget promoteAndAudit; returns ephemeral on race lost
- `src/lib/__tests__/slack-interact.test.ts` — Added `update()` chain to db mock + `dbUpdateResult` variable (default race-won); reset in `beforeEach`

## Decisions Made

- **Web route awaits promoteAndAudit** (not fire-and-forget) — caller is the staff browser, not Slack. Browser tolerates the few-second dispatch latency; the client-side spinner (plan 09-05) covers the wait. This enables inline `{ ok, error }` result in the HTTP body for PROM-05.
- **HTTP 200 with ok:false** for dispatch failures — the atomic UPDATE already committed so the request was fully processed; returning 500 would be wrong (idempotent retry would re-run the race guard and fail with 409). Client reads the `ok` flag.
- **409 re-reads release_logs** after race lost to surface `dispatched_by` and `dispatched_at` to the caller — gives the client enough info to show "already dispatched by X" without an extra round-trip.
- **actorSource defaults to 'web'** in both `ApproveInput` and `RejectInput` — optional field, so all existing callers (customer approve route) compile and run unchanged, getting `'web'` automatically.
- **Slack db mock extended** with `update()` chain rather than splitting into a separate mock file — keeps all 14 existing tests green after the atomic guard was added to the route.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed slack-interact test db mock missing update() method**
- **Found during:** Task 3b (adding atomic dispatch guard to Slack handler)
- **Issue:** The existing `slack-interact.test.ts` db mock only had `select()` — adding `db.update()` in the route caused `TypeError: db.update is not a function` in the happy-path slack_promote test
- **Fix:** Added `update: () => ({ set: () => ({ where: () => ({ returning: () => Promise.resolve(dbUpdateResult) }) }) })` to the vi.mock for `@/lib/db`; added `dbUpdateResult` variable (default `[{ id: 'rel-uuid' }]` = race won) reset in `beforeEach`
- **Files modified:** `src/lib/__tests__/slack-interact.test.ts`
- **Verification:** All 14 slack-interact tests pass; 152 total tests green
- **Committed in:** `470440f` (Task 3b commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug in test mock)
**Impact on plan:** Necessary fix for test infrastructure — the existing test mock didn't anticipate `db.update()`. No scope creep; no behavior change to production code.

## Issues Encountered

None. The plan was clear and well-specified. The only issue was the test mock gap described in Deviations.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- PROM-03 (web promote dispatches via promoteAndAudit with Slack notification) satisfied
- PROM-04 (concurrent web + Slack → exactly one dispatch via atomic guard) satisfied
- PROM-05 (inline ok/error result in HTTP body for client island) satisfied
- `actor_source='web'` will populate on new customer approval rows from next deploy onward (existing rows remain NULL per plan 09-01 decision)
- Plan 09-04 (per-project pipeline page promote button) can now call `POST /api/admin/releases/[id]/promote` and render the `{ ok, error }` result

## Self-Check: PASSED

All files confirmed present on disk. All task commits confirmed in git log.

---
*Phase: 09-per-project-pipeline-page-and-web-ui-promote*
*Completed: 2026-05-07*
