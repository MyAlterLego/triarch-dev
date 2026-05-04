---
status: partial
phase: 02-customer-releases-page
source: [02-VERIFICATION.md]
started: 2026-05-03
updated: 2026-05-03
---

## Current Test

[awaiting human testing — DB migration is the blocker for all runtime tests]

## Tests

### 1. DB Migration Applied (BLOCKER)
expected: `npm run db:push` applies migration 0008_yielding_hellcat.sql; `psql $DATABASE_URL -c "\d release_approvals"` shows `reason | text` column; existing rows unchanged with `reason IS NULL`
result: [pending]

### 2. GATE-01 — Non-member 404 leak test
expected: Sign in as non-member of `truth-treason`, visit `/projects/truth-treason/releases` → Next.js 404 page; no project name in HTML/headers; HTTP 404
result: [pending]

### 3. GATE-01 — Unauthenticated redirect
expected: Sign out, visit `/projects/truth-treason/releases` → redirect to `/login` (not 404)
result: [pending]

### 4. GATE-02 — Release table rendering
expected: As member, visit page → table shows mono teal version, env badge, status badge with correct color, 7-char commit SHA, formatted deployed_at, approver column; ordered by deployed_at DESC
result: [pending]

### 5. GATE-03 — Feedback post flow
expected: Admin expands row, types comment, clicks "Post Comment" → comment appears with email + relative timestamp; toast "Comment posted." fires bottom-right (teal border), auto-dismisses after 5s
result: [pending]

### 6. GATE-03 — Viewer DOM exclusion
expected: Sign in as viewer-role member, expand row, inspect DOM → NO `<textarea>` element, NO Approve/Reject buttons (absent, not CSS-hidden)
result: [pending]

### 7. GATE-04/05/06 — Full approve flow
expected: Admin on `dev` release: click "Approve for Production" → button morphs to "Confirm approval (5s…)" with countdown 5→4→3→2→1 → click during countdown → status badge turns teal "approved", buttons disappear, audit trail shows "approved by {email} on {date}", toast fires; DB has `release_approvals` row with approverEmail/approvedAt/ipAddress/userAgent/decision='approved'/reason=NULL; `release_logs.status='approved'`
result: [pending]

### 8. GATE-05 — Idempotent re-approve
expected: POST /approve on already-approved release → response includes `alreadyApproved:true`; no new `release_approvals` row; UI toast: "This release was already approved."
result: [pending]

### 9. REJECT-01 — Full reject flow
expected: Admin on `dev` release: click "Reject Release" → inline form appears, textarea autofocused; empty reason → submit disabled; >500 chars → counter turns amber at 450; valid reason + Confirm Rejection → status badge red "rejected", audit trail "rejected by {email}: {excerpt}…", toast fires; subsequent POST /approve → 409
result: [pending]

### 10. Approve countdown timeout + cancel
expected: Click "Approve for Production", wait 5s without confirming → button reverts to step-1 state automatically
result: [pending]

### 11. Pagination (Load more)
expected: On project with >20 releases, "Load more" button appears; click → next 20 releases append; button disappears when all loaded
result: [pending]

### 12. Error banner + Retry
expected: With network failure or blocked endpoint → error banner shows "Failed to load releases. Check your connection and try again." + Retry button; clicking Retry re-attempts the fetch
result: [pending]

## Summary

total: 12
passed: 0
issues: 0
pending: 12
skipped: 0
blocked: 0

## Gaps
