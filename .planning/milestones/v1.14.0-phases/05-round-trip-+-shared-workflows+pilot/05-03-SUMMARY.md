---
phase: 05-round-trip-+-shared-workflows+pilot
plan: 03
subsystem: docs
tags: [runbook, onboarding, documentation, claude-md]

# Dependency graph
requires:
  - phase: 05-round-trip-+-shared-workflows+pilot
    plan: 01
    provides: POST /api/releases/promoted endpoint (GATE-12) — referenced in Step 4 verification SQL
  - phase: 05-round-trip-+-shared-workflows+pilot
    plan: 02
    provides: /projects/{slug}/releases timeline view — referenced in Steps 5 and 6

provides:
  - docs/onboarding-projects.md — canonical 6-step project onboarding checklist (PILOT-02)
  - .planning/phases/05-.../ONBOARDING-RUNBOOK.md — byte-identical planning-archive copy
  - CLAUDE.md — admin project conventions with onboarding runbook reference link

affects:
  - 05-04-HUMAN-UAT (can cross-reference this runbook for onboarding prerequisite context)
  - Future agents reading admin CLAUDE.md (discover runbook immediately)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dual-location documentation: canonical at docs/ + planning archive copy via cp (byte-identical guaranteed by diff -q)"
    - "Admin project CLAUDE.md created with key route map, auth model, and onboarding link"

key-files:
  created:
    - docs/onboarding-projects.md
    - .planning/phases/05-round-trip-+-shared-workflows+pilot/ONBOARDING-RUNBOOK.md
    - CLAUDE.md
  modified: []

key-decisions:
  - "CLAUDE.md created from scratch (file was absent) rather than inserted into existing content — no pre-existing content to displace"
  - "Runbook uses cp for archive copy (not Write tool) — guarantees byte-identical content without risk of whitespace drift"
  - "Troubleshooting section uses table format (not bullet list) — easier to scan for specific symptom; matches the structured style of 04-HUMAN-UAT.md"

requirements-completed: [PILOT-02]

# Metrics
duration: 2min
completed: 2026-05-04
---

# Phase 05 Plan 03: Project Onboarding Runbook Summary

**6-step onboarding checklist at docs/onboarding-projects.md — byte-identical planning-archive copy + admin CLAUDE.md reference; covers project creation through full E2E approve flow (PILOT-02)**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-05-04T15:33:39Z
- **Completed:** 2026-05-04T15:35:31Z
- **Tasks:** 2 of 2
- **Files created:** 3 (docs/onboarding-projects.md, ONBOARDING-RUNBOOK.md, CLAUDE.md)

## Accomplishments

- `docs/onboarding-projects.md` created — 236 lines, 6 numbered steps, verification checklist (8 checkboxes), troubleshooting table (8 failure modes)
- `.planning/phases/05-.../ONBOARDING-RUNBOOK.md` created as byte-identical archive copy via `cp`; `diff -q` confirms no byte difference
- `CLAUDE.md` created for the admin project (file was absent) — includes `## Project Onboarding` section linking to the runbook, plus key route map, auth model, DB, and testing quick-ref for future agents

## Runbook Content Summary

**File:** `docs/onboarding-projects.md` | **Line count:** 236

| Step | Title | Key Detail |
|------|-------|-----------|
| 1 | Create the project record | Platform UI wizard; SQL verify; `apiKey` shown once — save to password manager |
| 2 | Seed project members | UI or SQL INSERT; lower(email) uniqueness note; verify SQL |
| 3 | Wire shared-workflows | Bump `uses:` ref in `ci-cd.yml` + `deploy-prod.yml`; set `ADMIN_API_TOKEN` secret = project `apiKey` |
| 4 | Verify dev push round-trip | `release_logs` SELECT; 4-row troubleshooting table |
| 5 | Verify customer page | Sign in as customer admin; check `/projects/<slug>/releases`; Timeline "Deployed to dev" event |
| 6 | Full E2E approve flow | Approve button → Slack → Promote → `deploy-prod.yml` run → paired prod row → 5-event Timeline |

## CLAUDE.md Insertion Point

`CLAUDE.md` was absent from the admin repo root. Created from scratch with `## Project Onboarding` as the **second section** (after the opening project title), which is the most prominent position for discoverability. The section contains a single reference line plus a description of what the runbook covers.

## Task Commits

1. **Task 1: Author docs/onboarding-projects.md and mirror to planning archive** — `d6000e2` (docs)
2. **Task 2: Add CLAUDE.md reference pointing at docs/onboarding-projects.md** — `045c639` (docs)

## Files Created/Modified

- `docs/onboarding-projects.md` — 236 lines; canonical 6-step project onboarding runbook; includes prerequisites, 6 steps with SQL/YAML/URL specifics, 8-item verification checklist, 8-row troubleshooting table
- `.planning/phases/05-round-trip-+-shared-workflows+pilot/ONBOARDING-RUNBOOK.md` — 236 lines; byte-identical cp of docs/ version; `diff -q` returns no output
- `CLAUDE.md` — 33 lines; admin project conventions file; `## Project Onboarding` section links to docs/onboarding-projects.md

## Decisions Made

- **CLAUDE.md created from scratch**: The file was absent. Created with the onboarding section at the top (prominent position) plus supporting conventions (routes, auth, DB, testing) that will serve future agents in this project.
- **Archive copy via `cp`**: Using the Write tool for both files and then diffing would risk subtle encoding or whitespace differences. `cp` guarantees byte identity. `diff -q` verification confirms it.
- **Troubleshooting as table**: The runbook uses a table layout for failure modes (symptom / root cause / fix) instead of a nested bullet list. This matches the scannability of 04-HUMAN-UAT.md's format.

## Potential Step 7 for Future Onboardings

The 6 steps cover the current v1.14 workflow completely. If a recurring onboarding need surfaces, the most likely candidates for a Step 7 are:

- **Backfill legacy release rows** — if the new project has pre-v1.14 `release_logs` rows with `env=NULL`, the admin DB backfill SQL from 01-01 should be re-applied scoped to the new project
- **Notification channel per project** — v1.14 uses a single `#release-approvals` channel; if projects get per-project Slack channels in a future version, Step 6 would need a channel-mapping setup step

## Deviations from Plan

None — plan executed exactly as written. CLAUDE.md was absent (plan noted "if no obvious spot, add a new section near the top"), so a fresh file was created with the onboarding section in the second position.

## Known Stubs

None — both runbook files are fully authored. CLAUDE.md link is live. No placeholder text or TODOs.

## Self-Check: PASSED

- FOUND: docs/onboarding-projects.md (236 lines)
- FOUND: .planning/phases/05-round-trip-+-shared-workflows+pilot/ONBOARDING-RUNBOOK.md
- FOUND: CLAUDE.md
- diff -q: IDENTICAL (no output)
- grep "docs/onboarding-projects.md" CLAUDE.md: 1 match
- grep "Project Onboarding" CLAUDE.md: 1 match
- grep "v1.14" CLAUDE.md: 1 match
- FOUND commit: d6000e2 (Task 1)
- FOUND commit: 045c639 (Task 2)

---
*Phase: 05-round-trip-+-shared-workflows+pilot*
*Completed: 2026-05-04*
