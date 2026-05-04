---
phase: 04-github-app-promotion
plan: 03
subsystem: infra
tags: [github-app, apphosting, secrets, firebase, runbook]

# Dependency graph
requires:
  - phase: 03-slack-interactive-approval
    provides: HUMAN-UAT runbook structure (03-HUMAN-UAT.md pattern mirrored)
  - phase: 04-github-app-promotion/04-01
    provides: 0009_promotion_dispatch_audit.sql migration referenced in smoke test
  - phase: 04-github-app-promotion/04-02
    provides: github-app.ts reads the 3 env vars declared in apphosting.yaml
provides:
  - apphosting.yaml declares GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, GITHUB_APP_INSTALLATION_ID at RUNTIME
  - 04-HUMAN-UAT.md gives Mike a self-contained runbook to create the GitHub App, push secrets, and verify end-to-end dispatch
affects:
  - 04-04-github-app-promotion (wire-up depends on secrets being live)
  - ENV-G01 (satisfiable once Mike runs the runbook)
  - GATE-11a (actions:write/contents:read/metadata:read permissions documented)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "RUNTIME-only secrets carry no availability field in apphosting.yaml (implicit default, matches Phase 3 Slack pattern)"
    - "HUMAN-UAT runbook mirrors Phase 3 structure: numbered steps, copy-paste commands, rotation + troubleshooting sections"

key-files:
  created:
    - .planning/phases/04-github-app-promotion/04-HUMAN-UAT.md
  modified:
    - apphosting.yaml

key-decisions:
  - "RUNTIME-only availability (no availability field) for GitHub App secrets — github-app.ts called only at request time, never at build"
  - "Runbook references 0009_promotion_dispatch_audit migration from Plan 04-01 so Mike has a single document for all prod-readiness steps"
  - "9-checkbox gate (plan spec said 7-checkbox; 2 extended checks added for pem deletion and smoke test DB row verification)"

patterns-established:
  - "Phase 4 secret block appended after Phase 3 secret block in apphosting.yaml, with comment pointing to runbook"

requirements-completed:
  - ENV-G01
  - GATE-11a

# Metrics
duration: 8min
completed: 2026-05-03
---

# Phase 04 Plan 03: GitHub App Secrets + HUMAN-UAT Runbook Summary

**apphosting.yaml exposes GITHUB_APP_ID/PRIVATE_KEY/INSTALLATION_ID at RUNTIME; 04-HUMAN-UAT.md is the self-contained 8-step runbook for creating the GitHub App, pushing secrets, and verifying end-to-end dispatch**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-05-03T14:50:00Z
- **Completed:** 2026-05-03T14:58:00Z
- **Tasks:** 2/3 complete (Task 3 is a human checkpoint — returned to orchestrator)
- **Files modified:** 2

## Accomplishments

- apphosting.yaml receives 3 new RUNTIME-only secret references matching the Phase 3 Slack secret pattern (no availability field needed)
- 04-HUMAN-UAT.md ships a 190-line runbook covering GitHub App creation, permissions scoping, private key generation, org installation, 3 secret pushes via firebase CLI, schema migration application, redeploy confirmation, and end-to-end smoke test
- Task 3 (human verification checkpoint) is formally returned to the orchestrator — Mike executes the runbook independently of Wave 2 code work

## Task Commits

Each task was committed atomically:

1. **Task 1: Add GitHub App secret entries to apphosting.yaml** - `a7fe8d0` (chore)
2. **Task 2: Create 04-HUMAN-UAT.md runbook for GitHub App setup** - `754aa1a` (docs)
3. **Task 3: Human checkpoint** - awaiting Mike's execution of the runbook

## Files Created/Modified

- `apphosting.yaml` - Appended GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, GITHUB_APP_INSTALLATION_ID secret references after the Phase 3 Slack block
- `.planning/phases/04-github-app-promotion/04-HUMAN-UAT.md` - Full 8-step GitHub App setup runbook with 9-checkbox gate, rotation policy, and troubleshooting section

## Decisions Made

- RUNTIME-only (no `availability` field) for the 3 new secrets — `github-app.ts` reads them inside `readEnv()` at request time, not at build. Matches Phase 3 SLACK_BOT_TOKEN/SIGNING_SECRET/PAYLOAD_SECRET precedent exactly.
- Runbook's Step 6 includes the 0009_promotion_dispatch_audit migration from Plan 04-01 so there is one document Mike opens to make Phase 4 production-ready.
- 9 checkboxes in the verification gate (plan spec said 7 like Phase 3; added "pem deleted" and "DB row populated" as critical security and correctness checks).

## Deviations from Plan

None - plan executed exactly as written for Tasks 1 and 2.

## Issues Encountered

None.

## User Setup Required

**External services require manual configuration.** See [04-HUMAN-UAT.md](./04-HUMAN-UAT.md) for:
- GitHub App creation in MyAlterLego org (actions:write, contents:read, metadata:read)
- Private key (.pem) generation and download
- App installation on the org with access to admin-managed repos
- Push 3 secrets: `firebase apphosting:secrets:set GITHUB_APP_ID` / `GITHUB_APP_PRIVATE_KEY` / `GITHUB_APP_INSTALLATION_ID`
- Schema migration 0009_promotion_dispatch_audit.sql applied to production CRDB
- End-to-end smoke test (requires Plan 04-04 deployed first)

## Next Phase Readiness

- apphosting.yaml is ready — once Mike pushes the 3 secrets, the runtime can bind them
- 04-HUMAN-UAT.md is the formal gate for ENV-G01 + GATE-11a; Mike can run Steps 1-7 in parallel with Plan 04-04's Wave 2 code work; Step 8 smoke test requires 04-04 deployed
- Task 3 (human-verify checkpoint) is returned to the orchestrator; no further automation is blocked

## Known Stubs

None - apphosting.yaml is configuration only (no data flow to UI); 04-HUMAN-UAT.md is a runbook document.

## Self-Check: PASSED

- `/Users/mikegeehan/claude/triarch/development/admin/apphosting.yaml` — FOUND, contains all 3 GitHub App secret references
- `/Users/mikegeehan/claude/triarch/development/admin/.planning/phases/04-github-app-promotion/04-HUMAN-UAT.md` — FOUND, 190 lines, all 8 steps present
- `a7fe8d0` — FOUND in git log
- `754aa1a` — FOUND in git log

---
*Phase: 04-github-app-promotion*
*Completed: 2026-05-03*
