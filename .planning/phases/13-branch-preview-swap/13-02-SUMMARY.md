---
plan: 13-02
phase: 13-branch-preview-swap
status: complete
completed: 2026-05-08
tasks: 2/2
commits:
  - 2bc6604: test(13-02): add failing tests for POST /api/projects/[slug]/branch/preview
  - 932c1d6: feat(13-02): add POST /api/projects/[slug]/branch/preview with atomic lock + FAH dispatch (PREV-03)
  - 9b49e3a: test(13-02): add failing tests for GET /api/projects/[slug]/branch/preview/status
  - 2185e1e: feat(13-02): GET /api/projects/[slug]/branch/preview/status with 8-min timeout + branch-guarded auto-clear
requirements_addressed: [PREV-03, PREV-05, PREV-06]
---

# Plan 13-02 Summary

## Self-Check: PASSED

All files exist, all commits verified, full test suite GREEN.

## What Shipped

### POST /api/projects/[slug]/branch/preview (Task 1)

- Customer-admin or staff auth via `getCurrentUserContext` (GATE-01: non-members get 404, no project-existence leak)
- Branch validation: regex `/^[a-zA-Z0-9/_.\-]{1,256}$/` BEFORE any HTTP call
- Atomic lock acquisition: `UPDATE projects SET previewBranchLocked=$branch, previewBranchLockedAt=now() WHERE key=$slug AND previewBranchLocked IS NULL RETURNING ...`
- 409 Conflict on race-lost: returns `{ branch_held, locked_by, locked_at }` from current lock holder
- On lock acquired: calls `createFahRollout()` against project's `<slug>-dev` FAH backend
- On FAH dispatch error: RELEASES lock + returns error (no orphaned lock)
- Persists rollout resource path + lock holder email to `projects.metadata` via `jsonb_set` (preserves existing metadata)
- Returns 202 Accepted with `{ rolloutId, lockedAt, lockHolder }`

### GET /api/projects/[slug]/branch/preview/status (Task 2)

- Same auth model as POST
- Reads current lock state from `projects.previewBranchLocked` + `previewBranchLockedAt` + metadata
- **8-minute hard cap timeout BEFORE FAH poll** — Pitfall 2 guard against stuck PENDING rollouts
- Polls FAH via `getFahRolloutState(rolloutResourcePath)` from Phase 13-01
- **Branch-guarded auto-clear** on terminal state — `UPDATE ... WHERE previewBranchLocked = $branch_param` prevents stale poll from clobbering newer lock
- Terminal states: SUCCEEDED, FAILED, CANCELLED, timeout
- Returns `{ branch, state, locked_at, locked_by, started_at, terminal, errorMessage?, rolloutResourcePath? }`
- Idle response (no lock held): all fields null + terminal: true
- FAH poll error: returns degraded PENDING (does NOT clear lock — transient FAH unavailability)

## Test Coverage

- POST route: 8 tests (auth gates, branch validation, lock acquisition happy path, race-lost 409, FAH dispatch error, FAH success path)
- GET status route: 9 tests (idle, PENDING with no rollout name yet, PENDING with rollout, terminal SUCCEEDED auto-clear, terminal FAILED with errorMessage, 8-min timeout force-clear, FAH poll error degrades to PENDING, branch-guard stale-poll protection, auth gates)

Total: 17 new tests across two routes. Full suite: 275/275 GREEN.

## Deviation

The Task 2 RED commit (9b49e3a) included one stale test fragment — `vi.mocked(db as any)?.update;` — which referenced an undefined `db` symbol from a refactor. Removed in the GREEN commit. Test logic intent preserved (the `expect(mockUpdateReturning).toHaveBeenCalled()` assertion does the actual verification).

## Recovery Note

The Task 2 GREEN commit was completed by the orchestrator after the executor agent stalled mid-implementation (stream watchdog timeout at 600s). The implementation was fully written by the executor before the stall — the orchestrator only ran the test suite, fixed the one undefined-symbol test fragment, and committed. No design decisions were re-made.

## Requirements Status

- PREV-03: COMPLETE (FAH dispatch via createFahRollout in POST route)
- PREV-05: COMPLETE (8-min timeout enforced + SWR-friendly polling response shape)
- PREV-06: COMPLETE (branch-guarded auto-clear on terminal state)

## Files

- `src/app/api/projects/[slug]/branch/preview/route.ts` (148 lines)
- `src/app/api/projects/[slug]/branch/preview/route.test.ts` (~340 lines)
- `src/app/api/projects/[slug]/branch/preview/status/route.ts` (155 lines)
- `src/app/api/projects/[slug]/branch/preview/status/route.test.ts` (~310 lines)

## Next Plan

Plan 13-03: BranchPreviewClient client island + ReleasesClient integration + v2.7.0 + human-verify checkpoint.
