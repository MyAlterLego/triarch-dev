---
phase: 02-customer-releases-page
plan: 04
subsystem: api
tags: [drizzle, postgres, cockroachdb, api, release-gating, approve, reject, audit, atomic]

# Dependency graph
requires:
  - phase: 02-01
    provides: "releaseApprovals.reason column (text, nullable) + schema relations"
provides:
  - "POST /api/projects/[slug]/releases/[releaseId]/approve — idempotent approve with atomic audit + status update"
  - "POST /api/projects/[slug]/releases/[releaseId]/reject — required reason, atomic audit + status update"
affects:
  - 02-05  # ReleasesClient will call these endpoints for approve/reject actions

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "db.transaction(async (tx) => { INSERT releaseApprovals + UPDATE releaseLogs.status }) — atomicity via Drizzle node-postgres transaction"
    - "Idempotent approve: status==='approved' short-circuits before transaction, returns existing approval row"
    - "REJECT-01 asymmetry: reject has no idempotency — double-rejection is 409 (not silent no-op)"
    - "Header capture: x-forwarded-for first hop for IP (comma-split); user-agent sliced to 512 chars"
    - "approverEmail always sourced from session ctx.email — never from request body (security invariant)"

key-files:
  created:
    - src/app/api/projects/[slug]/releases/[releaseId]/approve/route.ts
    - src/app/api/projects/[slug]/releases/[releaseId]/reject/route.ts
  modified: []

key-decisions:
  - "Idempotent re-approval returns 200 with alreadyApproved:true + existing row — no new audit INSERT (GATE-05)"
  - "Double-rejection is 409 per REJECT-01 — rejected releases cannot be re-rejected without a new dev deploy"
  - "Non-members receive 404 (not 403) to avoid leaking project existence — same pattern as release-logs/[id]"
  - "REASON_MAX_CHARS=500 constant at module top matches UI-SPEC reject form limit (line 482)"

patterns-established:
  - "Admin-only endpoint pattern: requireSignedIn → getCurrentUserContext → project lookup → membership/role check → release lookup → operation"

requirements-completed:
  - GATE-04
  - GATE-05
  - GATE-06

# Metrics
duration: 2min
completed: 2026-05-04
---

# Phase 02 Plan 04: Approve + Reject API Endpoints Summary

**Approve (idempotent) and reject (required reason) endpoints atomically insert release_approvals audit rows and update release_logs.status via db.transaction(); admin-only, jose JWT session, IP/UA captured from headers**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-05-04T02:01:46Z
- **Completed:** 2026-05-04T02:03:50Z
- **Tasks:** 2
- **Files created:** 2

## Accomplishments

### Task 1: POST /approve endpoint

- Created `src/app/api/projects/[slug]/releases/[releaseId]/approve/route.ts`
- Idempotent re-approval: `release.status === 'approved'` branch fires BEFORE the precondition gate, returning the most recent existing `release_approvals` row with `alreadyApproved: true` and no new INSERT
- Atomic `db.transaction()`: INSERT into `releaseApprovals` (decision='approved', reason=null) + UPDATE `releaseLogs.status='approved'`
- Status precondition: any non-dev status (rejected/pending_approval/promoted) returns 409 with descriptive error message
- Header capture: `x-forwarded-for` first hop for IP, `user-agent` truncated to 512 chars
- Auth chain: requireSignedIn → getCurrentUserContext → project lookup (404 if missing) → membership (404 for non-members) → role (403 for viewers) → release lookup (404 if not in project)
- `approverEmail` sourced from `ctx.email` only — never from request body

### Task 2: POST /reject endpoint

- Created `src/app/api/projects/[slug]/releases/[releaseId]/reject/route.ts`
- `REASON_MAX_CHARS = 500` constant at module top — matches UI-SPEC reject form limit (line 482)
- Reason validation: empty/whitespace → 400 "Rejection reason is required"; over 500 chars → 400 "Reason exceeds 500 characters"
- No idempotency short-circuit per REJECT-01 — `currentStatus !== 'dev'` check catches re-rejection (409)
- Atomic `db.transaction()`: INSERT into `releaseApprovals` (decision='rejected', reason=trimmedReason) + UPDATE `releaseLogs.status='rejected'`
- Same auth chain as approve; same 404/403 mapping
- `npx next build` passes with both routes in the manifest

## Endpoint URLs

| Endpoint | Method | Path |
|----------|--------|------|
| Approve | POST | `/api/projects/[slug]/releases/[releaseId]/approve` |
| Reject | POST | `/api/projects/[slug]/releases/[releaseId]/reject` |

## Atomicity Strategy

Both endpoints use `db.transaction(async (tx) => { ... })` (Drizzle node-postgres). The callback:
1. INSERTs a `release_approvals` row via `tx.insert(...).returning()`
2. UPDATEs `release_logs.status` via `tx.update(...).returning({ id, status })`

If either operation throws, Drizzle propagates rollback — no partial state persists.

## Idempotency Model

**Approve (short-circuit on already-approved):**
- Fires BEFORE the 409 precondition gate
- Queries the most recent `release_approvals` row with `decision='approved'` for this release
- Returns `{ ok: true, alreadyApproved: true, release, approval: <existing row> }` with status 200
- No new audit row inserted (GATE-05 invariant)
- Client uses `alreadyApproved` flag to show correct toast (UI-SPEC: "This release was already approved.")

**Reject (no idempotency per REJECT-01):**
- Double-rejection triggers the `currentStatus !== 'dev'` gate → 409
- Rationale: REJECT-01 states "Rejected releases cannot be re-approved without a new dev deploy" — a re-rejection would create a spurious audit row with no state change
- A new dev deploy resets status to 'dev', at which point rejection is valid again

## Header Capture Details

```typescript
const ipAddress = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
const userAgent = req.headers.get('user-agent')?.slice(0, 512) ?? null;
```

- `x-forwarded-for`: comma-separated proxy chain; first hop is the originating client IP
- `user-agent`: truncated to 512 chars to fit `varchar(512)` schema column
- `ip_address`: stored as-is in `varchar(45)` (covers IPv4 + IPv6)
- Both nullable — missing headers store NULL, not error

## Status Precondition Matrix

| Release Status | Approve Result | Reject Result |
|----------------|---------------|---------------|
| `null` (legacy) | 200 approved | 200 rejected |
| `dev` | 200 approved | 200 rejected |
| `approved` | 200 alreadyApproved:true | 409 |
| `rejected` | 409 | 409 |
| `pending_approval` | 409 | 409 |
| `promoted` | 409 | 409 |

## Task Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | POST approve endpoint | `20d20e1` | approve/route.ts (created) |
| 2 | POST reject endpoint | `186b4d9` | reject/route.ts (created) |

## Plan 05 Handoff

Plan 05 (`ReleasesClient`) will call these endpoints directly:
- `POST /api/projects/{slug}/releases/{id}/approve` — two-step confirm flow; handle `alreadyApproved:true` toast vs `ok:true` toast
- `POST /api/projects/{slug}/releases/{id}/reject` — inline reason textarea; handle 400 validation errors inline
- Both return `{ release: { id, status }, approval: { ... } }` — sufficient for in-place row update and audit line render

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — these are pure API endpoints with no UI rendering. Data is wired end-to-end from request to DB.

## Self-Check

- [x] `src/app/api/projects/[slug]/releases/[releaseId]/approve/route.ts` exists
- [x] `src/app/api/projects/[slug]/releases/[releaseId]/reject/route.ts` exists
- [x] Commit `20d20e1` exists
- [x] Commit `186b4d9` exists
- [x] `npx next build` passes (both routes appear in manifest)
- [x] `npx tsc --noEmit` passes

## Self-Check: PASSED
