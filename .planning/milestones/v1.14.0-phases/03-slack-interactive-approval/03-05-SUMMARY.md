---
phase: 03-slack-interactive-approval
plan: 05
subsystem: infra
tags: [slack, apphosting, secrets, firebase, yaml]

# Dependency graph
requires:
  - phase: 03-slack-interactive-approval
    provides: Slack crypto + identity + notification + interact route (plans 01-04)
provides:
  - apphosting.yaml exposes SLACK_BOT_TOKEN, SLACK_SIGNING_SECRET, SLACK_PAYLOAD_SECRET, SLACK_RELEASE_APPROVAL_CHANNEL at runtime
  - 03-HUMAN-UAT.md runbook for Slack App creation, secret seeding, identity mapping, and smoke test
affects:
  - ENV-S01 satisfaction: code references secrets at names declared here; Mike fills values via runbook

# Tech tracking
tech-stack:
  added: []
  patterns:
    - App Hosting secret references follow variable/secret pattern matching existing DATABASE_URL/NEXTAUTH_SECRET entries
    - Self-generated secrets (SLACK_PAYLOAD_SECRET) documented with openssl rand -base64 32 generation pattern

key-files:
  created:
    - .planning/phases/03-slack-interactive-approval/03-HUMAN-UAT.md
  modified:
    - apphosting.yaml

key-decisions:
  - "SLACK_RELEASE_APPROVAL_CHANNEL is a plain env var (not a secret) with RUNTIME-only availability and default value #release-approvals"
  - "Slack secrets carry no availability field (RUNTIME-only by default) — no BUILD exposure needed since Slack functions are called only at request time"
  - "HUMAN-UAT runbook is the formal gate for ENV-S01 — code ships independently, runtime readiness depends on runbook execution"

patterns-established:
  - "Human-UAT runbook pattern: self-contained 8-step checklist with verification checklist, rotation, and troubleshooting sections"
  - "Secret comment block in apphosting.yaml references the phase runbook file so future devs can trace setup origin"

requirements-completed:
  - ENV-S01

# Metrics
duration: 8min
completed: 2026-05-03
---

# Phase 03 Plan 05: Slack Secrets + HUMAN-UAT Runbook Summary

**apphosting.yaml wired with four Slack secrets/env vars; 126-line HUMAN-UAT runbook covers Slack App creation, secret seeding via firebase apphosting:secrets:set, identity mapping, and end-to-end smoke test**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-05-03T00:00:00Z
- **Completed:** 2026-05-03T00:08:00Z
- **Tasks:** 2 of 3 (Task 3 is a human checkpoint — returned to orchestrator)
- **Files modified:** 2

## Accomplishments

- apphosting.yaml now declares all four Slack runtime values: three secret references (SLACK_BOT_TOKEN, SLACK_SIGNING_SECRET, SLACK_PAYLOAD_SECRET) and one plain env var (SLACK_RELEASE_APPROVAL_CHANNEL defaulting to #release-approvals)
- 03-HUMAN-UAT.md created with 8 fully copy-paste-able steps covering Slack App creation, bot scope install, payload secret generation, all three secret push commands, interactivity URL wiring, bot channel invite, SLACK_USER_MAP population, and smoke test sequence
- Runbook includes verification checklist (7 checkboxes = gate for ENV-S01), rotation policy, and troubleshooting for the three most likely failure modes

## Task Commits

Each task was committed atomically:

1. **Task 1: Add Slack secret + env var entries to apphosting.yaml** - `f22323a` (chore)
2. **Task 2: Create 03-HUMAN-UAT.md runbook** - `75da4d0` (docs)
3. **Task 3: Mike runs HUMAN-UAT** - CHECKPOINT (human-verify) — awaiting human

## Files Created/Modified

- `apphosting.yaml` - Added four new env entries (3 secrets + 1 plain channel env var) with comment block pointing to runbook
- `.planning/phases/03-slack-interactive-approval/03-HUMAN-UAT.md` - 126-line Slack App setup runbook (Steps 1-8 + verification checklist + rotation + troubleshooting)

## Decisions Made

- SLACK_RELEASE_APPROVAL_CHANNEL is a plain env var (not a secret) with RUNTIME-only availability — channel name is not sensitive
- Slack secrets carry no explicit `availability:` field (App Hosting defaults to RUNTIME-only) — consistent with DATABASE_URL/NEXTAUTH_SECRET pattern in same file
- Runbook documents openssl rand -base64 32 as the canonical generation method for SLACK_PAYLOAD_SECRET

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

**External services require manual configuration.** See [03-HUMAN-UAT.md](./03-HUMAN-UAT.md) for:

- Create Slack App at https://api.slack.com/apps with chat:write scope
- Generate SLACK_PAYLOAD_SECRET via openssl rand -base64 32
- Push all three secrets via firebase apphosting:secrets:set
- Configure Interactivity Request URL: https://admin.triarch.dev/api/slack/interact
- Invite bot to #release-approvals channel
- Populate SLACK_USER_MAP in src/lib/slack-identity.ts
- Run end-to-end smoke test (Step 8)

## Next Phase Readiness

- Code side of ENV-S01 is complete: apphosting.yaml declares secrets at the exact names consumed by src/lib/slack.ts and src/lib/slack-crypto.ts
- Phase 3 is fully code-complete (plans 01-04 + 05 tasks 1-2); only the Slack App human setup remains
- Once Mike completes the 03-HUMAN-UAT.md verification checklist (7 boxes), ENV-S01 is satisfied and Phase 3 is shippable
- No code blockers for Phase 4 (GitHub App dispatch wiring)

---
*Phase: 03-slack-interactive-approval*
*Completed: 2026-05-03*
