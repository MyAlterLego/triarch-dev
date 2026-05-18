---
status: partial
phase: 37-claude-code-build-trigger
source: [37-VERIFICATION.md]
started: 2026-05-18T20:38:00Z
updated: 2026-05-18T20:38:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. TMI pilot — buildPrompt drives /gsd:plan-phase round-trip
expected: Click Generate Build on /admin/modules/next-build-plan/tmi with ≥1 approved item; copy or open prompt in Claude Code; resulting Claude session can successfully run /gsd:plan-phase and produce a coherent plan addressing the items.
result: [pending]

### 2. Generate Build modal local_claude full flow
expected: Modal opens with prompt preview; Copy button copies prompt + shows success toast; Open in Claude Code button attempts deep-link claude-code://open?prompt=...&cwd=...; if scheme not registered, fallback toast appears within 2 seconds: "Couldn't open Claude Code — copy prompt manually below"; pressing Escape closes modal.
result: [pending]

### 3. Generate Build modal manual mode Copy-only confirmation
expected: After setting project.build_trigger_mode='manual' via BuildTriggerSection, the modal shows ONLY Copy button (no Open in Claude Code button visible). Copy still works.
result: [pending]

### 4. BuildTriggerSection radio + local_path input persistence
expected: On project admin/edit page, BuildTriggerSection renders 3 radios (local_claude/managed_agent/manual) with managed_agent showing "Managed Agent variant ships in v2.5" helper; local_path text input; Save button persists via PATCH and shows success toast; reload shows persisted state.
result: [pending]

### 5. /admin/platform/approval-audit page rendering + Show more toggle
expected: Staff visits page; table shows approval_events rows after Generate Build clicks; comment column shows first 60 chars + "Show more"; clicking Show more reveals full 200 chars; subject_type and project filter dropdowns work.
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
