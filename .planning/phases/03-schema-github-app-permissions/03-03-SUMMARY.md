---
phase: 03-schema-github-app-permissions
plan: 03
subsystem: infra
tags: [github-app, permissions, contents-write, runbook, human-uat]

# Dependency graph
requires:
  - phase: 03-schema-github-app-permissions
    provides: "Phase 3 context (App created in v1.14, needs contents:write for Phase 4 promote-branch)"
provides:
  - "03-HUMAN-UAT.md — runbook for GitHub App contents:write upgrade (SCHEMA-03)"
  - "Verification checklist gating Phase 4 promote-branch.yml unblock"
affects:
  - "04-promote-branch-workflow (promote-branch.yml git push will 403 without this)"
  - "07-ottobot-dispatcher-hardening (indirect — same App)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "HUMAN-UAT runbook pattern: Prerequisites / Steps / Verification checklist / Rotation / Troubleshooting (mirrors v1.14 Phase 04-03)"

key-files:
  created:
    - ".planning/phases/03-schema-github-app-permissions/03-HUMAN-UAT.md"
  modified: []

key-decisions:
  - "Three verification options (A/B/C) provided: existing workflow, one-shot test workflow, direct gh api PUT — covers all environments without forcing Option B overhead"
  - "Plan marked autonomous:false because Task 3 is a blocking human gate — no Claude automation can flip the GitHub App permission"
  - "Runbook defers to v1.14 secrets/vars already configured in Phase 04-03 — no new Firebase secrets needed"

patterns-established:
  - "HUMAN-UAT runbook: Steps 1-N + Verification checklist + Rotation + Troubleshooting (consistent with v1.14 04-HUMAN-UAT.md)"

requirements-completed: []

# Metrics
duration: 5min
completed: 2026-05-04
---

# Phase 03 Plan 03: GitHub App contents:write Runbook Summary

**SCHEMA-03 HUMAN-UAT runbook — Triarch Release Gate App permission toggle from Read-only to Read and write for Contents, with three verification paths (existing workflow / one-shot test workflow / direct API PUT)**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-05-04T22:09:34Z
- **Completed:** 2026-05-04T22:14:00Z (Tasks 1-2; Task 3 awaiting human checkpoint)
- **Tasks:** 2 of 3 (Task 3 = human-verify checkpoint — paused)
- **Files modified:** 1

## Accomplishments
- Wrote 179-line 03-HUMAN-UAT.md with exact GitHub App settings URL, step-by-step permission toggle, installation re-authorization flow, and three verification options
- Committed runbook with `docs(03)` prefix — clean tree
- Plan paused at Task 3 checkpoint pending Mike's execution of the runbook end-to-end

## Task Commits

Each task was committed atomically:

1. **Task 1: Write 03-HUMAN-UAT.md runbook** - `c25331a` (docs)
2. **Task 2: Commit the runbook** - same commit `c25331a` (tasks 1+2 combined — file write + commit are the same deliverable)

**Plan metadata:** pending (created after human checkpoint in Task 3)

## Files Created/Modified
- `.planning/phases/03-schema-github-app-permissions/03-HUMAN-UAT.md` — Full SCHEMA-03 runbook: 4 steps (open App settings, toggle Contents Read-only → Read and write, accept installation re-authorization, verify with workflow_dispatch), verification checklist, rotation/future changes section, troubleshooting section

## Decisions Made
- Three verification options cover: Option A (use an existing write-capable workflow — recommended), Option B (one-shot test workflow with `actions/create-github-app-token@v1`), Option C (direct `gh api PUT` as fast preflight). This avoids forcing Option B overhead when Option A may already exist.
- Runbook does NOT include any Firebase secrets steps — `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_APP_INSTALLATION_ID` were set in v1.14 Phase 04-03 and are already live; only the GitHub-side permission toggle is new work.
- `actions/create-github-app-token@v1` used in Option B (GitHub's official App token action, matches Phase 4's `promote-branch.yml` usage shape).

## Deviations from Plan

None — plan executed exactly as written. Runbook content matches the template in the plan's `<action>` block with no structural changes.

## Issues Encountered

None.

## User Setup Required

**SCHEMA-03 requires manual GitHub App configuration.** See [03-HUMAN-UAT.md](./03-HUMAN-UAT.md) for:
- Step 1: Open App settings at https://github.com/organizations/MyAlterLego/settings/apps
- Step 2: Toggle Contents permission from Read-only to Read and write
- Step 3: Accept installation re-authorization at https://github.com/organizations/MyAlterLego/settings/installations
- Step 4: Verify with a test workflow_dispatch (Option A, B, or C)

**Estimated time:** 5 minutes (Option A) / 10-15 minutes (Option B)

## Next Phase Readiness

Tasks 1-2 complete. Plan 03-03 is paused at the human-verify checkpoint (Task 3).

**To close SCHEMA-03:** Mike executes 03-HUMAN-UAT.md Steps 1-4 and replies "approved" once the verification checklist is fully ticked.

**Once SCHEMA-03 is satisfied:**
- Phase 4 (promote-branch.yml) is unblocked — `git push origin main` after rebase will no longer 403
- Phase 3 success criterion #3 is satisfied
- v2.0 Phase 3 can be marked complete

**Blocker:** Task 3 cannot proceed without human action — GitHub App permission upgrades cannot be automated.

---
*Phase: 03-schema-github-app-permissions*
*Completed (Tasks 1-2): 2026-05-04 | Task 3: awaiting human-verify checkpoint*
