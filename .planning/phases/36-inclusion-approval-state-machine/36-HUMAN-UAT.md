---
status: partial
phase: 36-inclusion-approval-state-machine
source: [36-VERIFICATION.md]
started: 2026-05-18T19:09:08Z
updated: 2026-05-18T19:09:08Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. /admin/modules/next-build-plan/[slug] visual UAT
expected: Table renders mixed bugs+features sorted by approval desc; FilterChip styling matches v2.1 /releases pattern; Remove from build optimistically removes row + persists via PATCH; empty state copy renders when zero approved items. Test: Navigate to `/admin/modules/next-build-plan/tmi` as staff session; click a FilterChip; click Remove from build on a row; navigate as non-staff and expect 404.
result: [pending]

### 2. bug-reports + feature-requests list and detail UI extensions visual UAT
expected: All 6 color pills render with correct violet/teal/blue/zinc/amber tokens; dropdown options gated by canManuallyTransition; NO Reject button anywhere; filter dropdown drives `?inclusion_state=` URL param. Test: Open `/admin/modules/bug-reports` and `/admin/modules/feature-requests`; verify Inclusion column; use new inclusion filter; click into detail pages and exercise Propose for next build / Approve / Defer / Remove from build buttons.
result: [pending]

### 3. Portal /projects/[slug]/upcoming + cross-repo PR merge UAT
expected: Portal page renders state pills (Approved violet, Built teal) with relative timestamps; Upcoming tab visible in sub-nav and active when on /upcoming; non-member receives 404 (not 403); zero staff-only fields visible in rendered HTML; admin PR #110 + portal PR #43 merged to dev branches. Test: Merge admin PR #110 + portal PR #43; visit https://portal-dev.triarch.dev/projects/tmi/upcoming; devtools field-leak grep for triarchNotes/buildPlan/slackThread → must be ZERO.
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
