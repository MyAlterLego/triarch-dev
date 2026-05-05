---
status: deferred
phase: 06-promoteandaudit-rewrite
source: [06-VERIFICATION.md]
started: 2026-05-05T17:00:00Z
updated: 2026-05-05T17:00:00Z
deferred_to: Phase 8 (Truth+Treason pilot — PILOT-01/02)
deferred_reason: Items 1–3 require live Slack workspace + a consumer repo with the local promote-branch.yml stub deployed. Item 4 IS the Phase 8 pilot scenario (PILOT-02). All four are best-batched with the pilot run.
---

## Current Test

[deferred — see deferred_reason above]

## Tests

### 1. OttoBot Slack message includes branch name

expected: After a customer approves an RC in the admin UI, the `#release-approvals` Slack message header reads `{branch} {version} approved by {approverEmail}` (e.g. `feat/change-font v0.15.0-rc.1 approved by mike@triarchsecurity.com`). For a `main` row, header reads `main v0.X approved by …`.
result: [pending — Phase 8 pilot]

### 2. GitHub dispatches promote-branch.yml (not deploy-prod.yml)

expected: After a staff member clicks the OttoBot "Promote to Production" button in Slack, a new run of `promote-branch.yml` appears in GitHub Actions on the consumer repo. NO new run of `deploy-prod.yml` from this approval. Workflow run inputs include `branch: feat/change-font`.
result: [pending — Phase 8 pilot]

### 3. Conflict threaded reply visible in Slack

expected: When `promote-branch.yml` reports `result='conflict'`, the original OttoBot dispatch message receives a threaded reply: `:warning: Cannot promote feat/X — conflicts with main:` followed by a code-block file list and `Rebase manually on main, push as a new RC to retry.` `metadata.dispatch.{slackChannelId, slackMessageTs}` from Plan 06-01 supplies the thread coordinates.
result: [pending — Phase 8 pilot]

### 4. Concurrent multi-branch promotion preserves both feature sets

expected: PILOT-02 scenario — create `feat/change-font` and `feat/add-audio` branches with non-conflicting changes. Both deploy to FAH preview URLs. Customer approves font first → rebase + merge succeeds; main now contains font commits. Customer approves audio → audio rebases on updated main → CI green → auto-merge succeeds; main now contains BOTH font and audio commits, NO work reverted.
result: [pending — Phase 8 pilot]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
