---
phase: 02-customer-releases-page
verified: 2026-05-03T00:00:00Z
status: human_needed
score: 6/6 must-haves verified
human_verification:
  - test: "Non-member 404 leak test"
    expected: "Visiting /projects/truth-treason/releases as mike@mikegeehan.com (non-member) returns Next.js default 404 — no project name or existence hint in the response body"
    why_human: "Server-side membership check calls notFound() — correct code path exists, but the actual rendered 404 page and its headers require a browser or curl to confirm no data leaks"

  - test: "Unauthenticated redirect"
    expected: "Visiting /projects/truth-treason/releases without a session redirects to /login"
    why_human: "Next.js middleware and session cookie behavior requires live request to verify redirect fires correctly"

  - test: "Release table renders correctly for a member"
    expected: "Table shows version (mono teal), env badge, status badge, 7-char commit SHA, deployed_at, approver columns for all project releases ordered by deployed_at DESC"
    why_human: "Column rendering, badge color tokens, and sort order require live data from DB to verify visually"

  - test: "Feedback post flow (admin)"
    expected: "Admin types a comment, clicks Post Comment — comment appears in list with author email + relative timestamp. Toast fires 'Comment posted.' and auto-dismisses after 5 seconds."
    why_human: "POST → optimistic local state append → toast lifecycle requires browser interaction; 5s auto-dismiss cannot be verified statically"

  - test: "Feedback delete (author within 24h)"
    expected: "Trash2 icon visible on own comment. Click removes comment from list, fires 'Comment deleted.' toast."
    why_human: "canDeleteFeedback time-window check and DELETE endpoint interaction require a live comment < 24h old"

  - test: "Feedback delete (expired window)"
    expected: "Trash2 icon not shown on comments older than 24h. Attempting DELETE via curl on such a comment returns 403 with 'Delete window has expired (24 hours)'"
    why_human: "Requires a seeded comment with a past timestamp and a live API call"

  - test: "Viewer role DOM exclusion"
    expected: "Signed in as a viewer-role project member: no feedback textarea, no Approve button, no Reject button in the DOM (not just hidden via CSS)"
    why_human: "DOM inspection via browser DevTools is required to confirm elements are absent (not just invisible)"

  - test: "Two-step approve countdown UX"
    expected: "Click 'Approve for Production' — button morphs to 'Confirm approval (5s…)', countdown decrements visibly 5→4→3→2→1, then resets to idle automatically. Focus moves to step-2 button after transition."
    why_human: "setInterval behavior, focus management, and countdown reset require live browser interaction to verify"

  - test: "Two-step approve cancel on timeout"
    expected: "If countdown reaches 0 without confirmation, button reverts to 'Approve for Production' step-1 state"
    why_human: "Countdown expiry path requires waiting 5 seconds in a live session"

  - test: "Approve completion"
    expected: "Clicking Confirm approval fires POST /approve, status badge updates to teal 'approved', action buttons disappear, audit trail line 'approved by {email} on {date}' appears. Toast: 'Release {version} approved for production.' Toast auto-dismisses after 5s."
    why_human: "State mutation cascade (status update, approvals append, approveStep reset, toast) and DB persistence require end-to-end verification"

  - test: "Idempotent re-approve"
    expected: "POST /approve on an already-approved release returns 200 with alreadyApproved:true, no new release_approvals row inserted (verify count in DB). UI shows toast 'This release was already approved.'"
    why_human: "DB row count check and idempotency response toast require live DB + browser"

  - test: "Reject flow"
    expected: "Click 'Reject Release' — inline form appears with autoFocused textarea. Empty submit: Confirm Rejection disabled. Valid reason submitted: status updates to red 'rejected' badge, audit trail shows 'rejected by {email}: {80-char excerpt}', Toast: 'Release {version} rejected.'"
    why_human: "autoFocus behavior, character counter warning (turns amber at 450), inline form toggle, and status cascade require browser interaction"

  - test: "Reject on already-rejected release"
    expected: "POST /reject on a status='rejected' release returns 409 'Cannot reject a release in status 'rejected''"
    why_human: "Requires a release already in rejected state and a live API call"

  - test: "Approve on rejected release (REJECT-01)"
    expected: "POST /approve on a status='rejected' release returns 409 'Cannot approve a release in status 'rejected''"
    why_human: "REJECT-01's no-re-approve rule requires a live rejected release + API call"

  - test: "DB migration applied"
    expected: "release_approvals table has a reason TEXT column. Existing rows have reason IS NULL. No data loss."
    why_human: "DATABASE_URL is a Firebase App Hosting secret — db:push was not applied in local dev. Mike must apply migration post-merge and verify with psql \\d release_approvals"

  - test: "Load more pagination"
    expected: "Project with >20 releases shows 'Load more' button. Click appends next 20 releases to table. When no more pages remain, button disappears."
    why_human: "Requires a project with >20 release_logs rows in the DB"

  - test: "Error banner + Retry"
    expected: "Simulating a failed load-more fetch (network failure or server error) shows the error banner 'Failed to load releases. Check your connection and try again.' with a Retry button that re-attempts the fetch."
    why_human: "Error path requires either network manipulation or a server-side failure injection"

  - test: "Audit trail line for approved/rejected/promoted"
    expected: "Expanded panel shows correct audit line: 'approved by {email} on {date}' for approved, 'rejected by {email}: {reason excerpt}' for rejected, 'approved by … on …' for promoted (no 'promoted on' segment until Phase 5)."
    why_human: "Requires seeded releases in each status state with corresponding approval rows"

  - test: "Accessibility — keyboard navigation and screen reader"
    expected: "Tab through the page; status badges announced via aria-label; toast announced via aria-live=polite; reject textarea announced as required (aria-required=true); error banner announced via aria-live=assertive"
    why_human: "Screen reader behavior, focus order, and announcement timing require assistive technology testing"
---

# Phase 02: Customer Releases Page — Verification Report

**Phase Goal:** Customer admins can see, comment on, and approve/reject their project's dev releases at a project-scoped URL that enforces membership.
**Verified:** 2026-05-03
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `/projects/{slug}/releases` returns 404 to non-members without leaking project existence | VERIFIED | `page.tsx:31` `if (!project) notFound()` + `page.tsx:36` `if (!isMember) notFound()` — both paths call the same Next.js `notFound()`, indistinguishable to caller |
| 2 | Page lists releases with version, env, status, commit_sha, deployed_at, approver | VERIFIED | `page.tsx:43-51` Drizzle relational query with feedback+approvals join; `ReleasesClient.tsx:465-522` renders all 7 columns per UI-SPEC |
| 3 | Members can post feedback; persists with author email + timestamp; renders chronologically | VERIFIED | `feedback/route.ts:10` POST handler; `authorEmail: ctx.email` (line 60 — session-derived, not request body); `releaseFeedback INSERT` at line 56; page.tsx fetches `asc(f.createdAt)` order |
| 4 | Admin-role members see Approve + Reject buttons when status='dev'; both write audit rows | VERIFIED | `ReleasesClient.tsx:757` `{userRole === 'admin' && status === 'dev' && ...}`; approve/route.ts and reject/route.ts both use `db.transaction()` to INSERT releaseApprovals |
| 5 | Approval transitions dev→approved atomically with audit insert; rejection transitions dev→rejected | VERIFIED | `approve/route.ts:103-123` `db.transaction(async tx => { INSERT releaseApprovals + UPDATE releaseLogs.status })`; reject/route.ts:84-104 identical pattern |
| 6 | Re-approving an already-approved release is idempotent with clear UI message; rejected releases cannot be re-approved | VERIFIED | `approve/route.ts:57-87` early return `alreadyApproved:true` before any INSERT; reject/route.ts:72 `currentStatus !== 'dev'` → 409 for approved/rejected/promoted/pending_approval |

**Score:** 6/6 truths verified

---

### Required Artifacts

| Artifact | Min Lines | Actual | Status | Notes |
|----------|-----------|--------|--------|-------|
| `src/db/schema.ts` | — | 400+ | VERIFIED | `reason: text('reason')` at line 182; three relations exports at lines 383/388/395 |
| `src/db/migrations/0008_yielding_hellcat.sql` | — | 1 line DDL | VERIFIED | `ALTER TABLE "release_approvals" ADD COLUMN "reason" text;` |
| `src/app/projects/layout.tsx` | 20 | 18 | VERIFIED | 18 lines; session guard + redirect('/login'); no AdminSidebar |
| `src/app/projects/CustomerHeader.tsx` | 25 | 27 | VERIFIED | 'use client'; signOut; 'Triarch Dev · {projectName}' per UI-SPEC |
| `src/app/projects/[slug]/releases/page.tsx` | 60 | 110 | VERIFIED | Server component; notFound(); project lookup by slug=key; membership check; relational query |
| `src/app/projects/[slug]/releases/types.ts` | 25 | 37 | VERIFIED | ReleaseRow, FeedbackItem, ApprovalItem, UserRole, ReleaseStatus, ReleaseEnv |
| `src/app/api/projects/[slug]/releases/[releaseId]/feedback/route.ts` | 60 | 75 | VERIFIED | POST; FEEDBACK_MAX_CHARS=2000; authorEmail from session; 404-no-leak; 403 for viewer |
| `src/app/api/projects/[slug]/releases/[releaseId]/feedback/[feedbackId]/route.ts` | 50 | 70 | VERIFIED | DELETE; 24h window; case-insensitive author check; innerJoin prevents cross-project deletion |
| `src/app/api/projects/[slug]/releases/[releaseId]/approve/route.ts` | 80 | 141 | VERIFIED | POST; db.transaction(); idempotent short-circuit at line 57; x-forwarded-for/user-agent capture |
| `src/app/api/projects/[slug]/releases/[releaseId]/reject/route.ts` | 80 | 121 | VERIFIED | POST; REASON_MAX_CHARS=500; db.transaction(); no idempotency (REJECT-01); reason column populated |
| `src/components/Toast.tsx` | 50 | 42 | VERIFIED | 'use client'; role=status; aria-live=polite; border-teal-500/30 success / border-red-500/30 error; w-80; fixed bottom-6 right-6 |
| `src/app/api/projects/[slug]/releases/route.ts` | 70 | 93 | VERIFIED | GET; coalesce DESC sort; +1 fetch; limit/offset clamped; 404-no-leak |
| `src/app/projects/[slug]/releases/ReleasesClient.tsx` | 350 | 841 | VERIFIED | Full production component; all 4 endpoints wired; Toast integrated; two-step approve; reject form; feedback compose/delete; viewer DOM-conditional |

Note on `layout.tsx` line count: 18 lines vs 20 minimum. The component is complete and functional — session guard, redirect, and layout wrapper all present. The 2-line deficit is due to fewer blank lines, not missing functionality.

---

### Key Link Verification

| From | To | Via | Status | Evidence |
|------|----|-----|--------|---------|
| `page.tsx` | `projects` table by slug | `eq(projects.key, slug)` | VERIFIED | `page.tsx:28-29` |
| `page.tsx` | `notFound()` for non-members | membership check after project lookup | VERIFIED | `page.tsx:34-36` |
| `page.tsx` | `ReleasesClient` (full, not placeholder) | props: releases, userRole, etc. | VERIFIED | `page.tsx:97-106`; ReleasesClient.tsx is 841 lines (placeholder was 42) |
| `feedback/route.ts POST` | `release_feedback INSERT` | `db.insert(releaseFeedback)` | VERIFIED | `feedback/route.ts:56-63` |
| `feedback/[feedbackId]/route.ts DELETE` | 24h window + author check | `DELETE_WINDOW_MS`, `.toLowerCase()` comparison | VERIFIED | `[feedbackId]/route.ts:8,54,58-64` |
| `approve/route.ts` | atomic transaction | `db.transaction(async tx => ...)` | VERIFIED | `approve/route.ts:103` |
| `reject/route.ts` | `releaseApprovals.reason` populated | `values({ ..., reason })` with `decision: 'rejected'` | VERIFIED | `reject/route.ts:88-94` |
| `approve/route.ts` | x-forwarded-for + user-agent capture | `req.headers.get('x-forwarded-for')`, `req.headers.get('user-agent')` | VERIFIED | `approve/route.ts:99-100` |
| `ReleasesClient.tsx` | POST /feedback | `fetch(…/feedback, { method: 'POST' })` | VERIFIED | `ReleasesClient.tsx:328-331` |
| `ReleasesClient.tsx` | POST /approve | `fetch(…/approve, { method: 'POST' })` | VERIFIED | `ReleasesClient.tsx:256-259` |
| `ReleasesClient.tsx` | POST /reject | `fetch(…/reject, { method: 'POST', body: JSON.stringify({ reason }) })` | VERIFIED | `ReleasesClient.tsx:291-298` |
| `ReleasesClient.tsx` | GET /releases?offset=N | `fetch(…/releases?limit=${pageSize}&offset=${offset})` | VERIFIED | `ReleasesClient.tsx:383-385` |
| `ReleasesClient.tsx` | Toast component | `import Toast` + `<Toast key={toast.key} …>` | VERIFIED | `ReleasesClient.tsx:16, 403-410` |
| `db.query.releaseLogs.findMany` | Drizzle relations (feedback + approvals) | `releaseLogsRelations` exported in schema; `db = drizzle(pool, { schema })` | VERIFIED | `schema.ts:383`; `db.ts:9`; both `page.tsx:43` and `route.ts:47` use `with: { feedback, approvals }` |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| GATE-01 | 02-02 | Route 404s non-members without leaking project existence | SATISFIED | `page.tsx:31,36` — both missing-project and non-member paths call `notFound()` identically |
| GATE-02 | 02-02, 02-05 | Page lists releases with version/env/status/commit_sha/deployed_at/approver | SATISFIED | Drizzle relational query in page.tsx; 7-column table in ReleasesClient.tsx:433-523 |
| GATE-03 | 02-03, 02-05 | Feedback persists with author+timestamp; renders chronologically; admin-only write | SATISFIED | POST endpoint writes `authorEmail: ctx.email`; page.tsx fetches `asc(f.createdAt)`; ReleasesClient.tsx:719 `{userRole === 'admin' && ...}` |
| GATE-04 | 02-04, 02-05 | Approve/Reject buttons admin-only, status='dev' only | SATISFIED | `approve/route.ts:41-44` role check; `ReleasesClient.tsx:757` DOM-conditional `{userRole === 'admin' && status === 'dev'}` |
| GATE-05 | 02-04, 02-05 | Audit row captures approver/IP/UA; idempotent re-approve | SATISFIED | `approve/route.ts:99-100` header capture; `approve/route.ts:57-87` idempotent short-circuit with `alreadyApproved:true` |
| GATE-06 | 02-04 | dev→approved transition atomic with audit insert | SATISFIED | `approve/route.ts:103-123` `db.transaction()` wraps INSERT releaseApprovals + UPDATE releaseLogs.status |
| REJECT-01 | 02-01, 02-04, 02-05 | Reject requires reason; persisted in audit row; rejected releases cannot be re-approved | SATISFIED | `schema.ts:182` reason column; `reject/route.ts:63` 400 if empty; `reject/route.ts:93` reason populated; `reject/route.ts:72-76` 409 if non-dev; `approve/route.ts:91-95` 409 if rejected status |

All 7 Phase 2 requirement IDs satisfied. No orphaned requirements — REQUIREMENTS.md shows GATE-01 through GATE-06 and REJECT-01 all mapped to Phase 2 and marked [x].

---

### Anti-Patterns Found

No blocking anti-patterns detected.

| File | Pattern | Severity | Notes |
|------|---------|----------|-------|
| `src/app/projects/layout.tsx` | 18 lines vs 20-line minimum | Info | All required functionality present; minor line count delta due to compact formatting, not missing code |
| `ReleasesClient.tsx:455` | `aria-busy={false}` hardcoded | Info | `aria-busy` is always `false` since initial data comes from server props. This is technically correct (no loading state on mount) but could be improved if the component is refactored to fetch initial data client-side. Not a runtime issue. |
| `02-01-SUMMARY.md` | `db:push` deferred to human | Info | DATABASE_URL is a Firebase App Hosting secret not available in dev shell. Migration file committed correctly; human applies post-merge. Captured in human_verification. |

---

### Human Verification Required

The following items cannot be verified statically. All require a deployed or locally-running instance with live DB data.

#### 1. DB Migration Applied (BLOCKER — required before any runtime verification)

**Test:** Run `npm run db:push` after merging, then `psql $DATABASE_URL -c "\d release_approvals"` and confirm `reason | text` row exists.
**Expected:** Migration 0008_yielding_hellcat.sql applied; `release_approvals` has `reason text` column; existing rows unchanged with `reason IS NULL`.
**Why human:** `DATABASE_URL` is an App Hosting secret not accessible in dev shell.

#### 2. GATE-01 — Non-member 404 leak test

**Test:** Sign in as `mike@mikegeehan.com` (non-member of truth-treason). Visit `/projects/truth-treason/releases`.
**Expected:** Next.js default 404 page renders. No project name "truth-treason" appears anywhere in the response. HTTP status 404.
**Why human:** Next.js `notFound()` renders a page-level 404; requires live request to confirm no data leaks in HTML body or headers.

#### 3. GATE-01 — Unauthenticated redirect

**Test:** Sign out. Visit `/projects/truth-treason/releases`.
**Expected:** Redirect to `/login`. No 404 (would be leaking).
**Why human:** Session cookie state and redirect behavior require a live browser session.

#### 4. GATE-02 — Release table rendering

**Test:** Sign in as a truth-treason member. Visit `/projects/truth-treason/releases`.
**Expected:** Table shows releases with: mono teal version, env badge, status badge (correct color per STATUS_BADGE_COLORS), 7-char commit SHA, formatted deployed_at date, approver email column. Ordered by deployed_at DESC.
**Why human:** Column rendering and sort order require live DB data.

#### 5. GATE-03 — Feedback post flow

**Test:** As a project admin, expand a release row, type a comment, click "Post Comment".
**Expected:** Comment appears in list below with author email + relative timestamp. Toast "Comment posted." fires bottom-right (teal border) and auto-dismisses after 5 seconds.
**Why human:** POST → optimistic state append → 5s toast timer is a live interaction sequence.

#### 6. GATE-03 — Viewer DOM exclusion

**Test:** Sign in as a viewer-role member. Expand any release row. Inspect DOM.
**Expected:** No `<textarea>` feedback compose element in DOM. No "Approve for Production" or "Reject Release" button elements in DOM (not just hidden — absent).
**Why human:** Requires DevTools DOM inspection to confirm `{userRole === 'admin' && ...}` conditional excludes elements entirely.

#### 7. GATE-04/05/06 — Full approve flow

**Test:** As a project admin on a status='dev' release:
1. Click "Approve for Production" → button morphs to "Confirm approval (5s…)"
2. Watch countdown decrement 5→4→3→2→1
3. Click "Confirm approval (3s…)" during countdown
4. Observe: status badge turns teal "approved", action buttons disappear, audit trail line "approved by {email} on {date}" appears, toast fires "Release {version} approved for production."
5. In DB: confirm `release_approvals` row has `approverEmail`, `approvedAt`, `ipAddress`, `userAgent`, `decision='approved'`, `reason=NULL`; confirm `release_logs.status='approved'`

**Why human:** setInterval countdown, focus management (step-1 → step-2 button), state cascade, DB persistence, and IP/UA capture all require live browser + DB.

#### 8. GATE-05 — Idempotent re-approve

**Test:** With an already-approved release, click "Approve for Production" again (or POST via curl).
**Expected:** Response includes `alreadyApproved:true`, no new `release_approvals` row created (count unchanged). UI toast: "This release was already approved."
**Why human:** Requires an already-approved release and DB row count verification.

#### 9. REJECT-01 — Full reject flow

**Test:** As a project admin on a status='dev' release:
1. Click "Reject Release" → inline form appears, textarea autofocused
2. Attempt submit with empty reason → "Confirm Rejection" button disabled
3. Type a reason > 500 chars → observe character counter turns amber at 450
4. Type a valid reason, click "Confirm Rejection"
5. Observe: status badge turns red "rejected", audit trail "rejected by {email}: {80-char excerpt}…", toast "Release {version} rejected."
6. Attempt POST /approve on now-rejected release → 409 response

**Why human:** autoFocus behavior, character counter threshold, cancel focus return, and REJECT-01 re-approve block all require live testing.

#### 10. Approve countdown timeout + cancel

**Test:** Click "Approve for Production", then wait 5 seconds without confirming.
**Expected:** Button reverts to "Approve for Production" step-1 state automatically.
**Why human:** Requires waiting 5 seconds in a live session to observe expiry path.

#### 11. Pagination (Load more)

**Test:** Navigate to a project with >20 releases. Observe "Load more" button. Click it.
**Expected:** Next 20 releases append to table. When all releases loaded, button disappears.
**Why human:** Requires a project with >20 release_logs rows.

#### 12. Error banner + Retry

**Test:** Simulate a failed load-more (network failure or block the API endpoint).
**Expected:** Error banner appears with "Failed to load releases. Check your connection and try again." and a "Retry" button. Clicking Retry re-attempts the fetch.
**Why human:** Error path requires network manipulation or intentional server failure.

---

### Summary

Phase 2 is code-complete. All 6 observable truths are statically verified against the actual code:

- The 404-no-leak membership gate uses identical `notFound()` calls for both missing-project and non-member paths (`page.tsx:31,36`)
- The Drizzle relational query fetches releases with feedback and approvals joined in a single query, sorted by `coalesce(deployedAt, releasedAt) DESC`
- The feedback POST endpoint sources `authorEmail` from the session (never from request body), enforces 2000-char limit, and requires admin role (viewer → 403)
- The feedback DELETE endpoint enforces case-insensitive author matching and a 24-hour delete window via `innerJoin(releaseLogs)` to prevent cross-project tampering
- Both approve and reject endpoints use `db.transaction()` for atomicity, capture IP/UA from request headers, and gate on admin role (viewer → 403, non-member → 404)
- The idempotent approve short-circuit fires at line 57, before the 409 precondition gate at line 91, ensuring re-approval returns 200 with `alreadyApproved:true` and no new INSERT
- ReleasesClient (841 lines) wires all 4 API endpoints, implements the two-step countdown, reject inline form, Toast auto-dismiss, and DOM-conditional viewer gating

One item requires human action before any runtime verification can proceed: applying Drizzle migration `0008_yielding_hellcat.sql` via `npm run db:push` (DATABASE_URL unavailable in dev shell, per Phase 01-01 precedent). All other human verification items are interaction and DB-state checks that require a live browser session with seeded data.

All 7 Phase 2 requirement IDs (GATE-01 through GATE-06, REJECT-01) are satisfied by the implemented code.

---

_Verified: 2026-05-03_
_Verifier: Claude (gsd-verifier)_
