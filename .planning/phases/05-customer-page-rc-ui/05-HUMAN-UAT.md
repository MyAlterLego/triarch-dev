---
status: deferred
phase: 05-customer-page-rc-ui
source: [05-VERIFICATION.md]
started: 2026-05-05T16:00:00Z
updated: 2026-05-05T16:05:00Z
deferred_to: Phase 7.5 (dev cluster) / Phase 8 (Truth+Treason pilot)
deferred_reason: Items 2 and 4 require live data (metadata.previewUrl on a feature branch deploy; promote_attempts conflict row) that does not exist until Phase 6 wires dispatch + a real conflict occurs. Items 1, 3, 5 are exercisable today on main-only data but provide limited multi-branch signal. Batch with the Phase 8 pilot UAT.
---

## Current Test

[deferred — see deferred_reason above]

## Tests

### 1. Branch section rendering with real CockroachDB data

expected: `/projects/{slug}/releases` for a project with `main` + at least one feature branch renders one collapsible section per distinct branch value; `main` section appears first; feature branches appear below sorted by most recent deploy; active branches (deployed within 30 days OR in `dev`/`pending`/`approved` status) are expanded by default; stale branches collapsed.
result: [pending]

### 2. Preview URL click behavior

expected: Click the ExternalLink icon next to a version badge on a row that has `metadata.previewUrl`. A new browser tab opens with the FAH preview URL. The parent `<tr>` does NOT toggle its ExpandedPanel (stopPropagation works correctly).
result: [pending]

### 3. Concurrent confirm states across branches

expected: With two RC rows in different branch sections both at status `dev`, click Approve on the first row → its button shows `Click to confirm — promote {branch} {version} (Ns)` with the countdown ticking. While the countdown is ticking, expand the second RC's section. The second RC's Approve button still shows `Approve for Production` (idle); no cross-row interference. Both can be confirmed independently.
result: [pending]

### 4. Conflict badge with live promote_attempts data

expected: For a branch whose latest `promote_attempts` row has `result='conflict'` and `created_at` newer than the latest `release_logs.deployed_at` for that branch, the section header shows the red `Conflict — N file(s)` badge. Expanding the section shows the conflict file list and `Resolve conflict to enable approval` helper text in place of the Approve button. Pushing a newer release for that branch (so `deployed_at > latest_conflict.created_at`) clears the badge automatically on next page load.
result: [pending]

### 5. Mobile viewport (375px)

expected: At 375px viewport width with at least 2 branch sections, sections stack vertically; section-header badge clusters wrap below the branch name without overflow; no horizontal scroll; conflict file list (if any) is readable.
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
