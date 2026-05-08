---
phase: 17-hostname-guard-inventory
plan: 01
subsystem: infra
tags: [hostname, middleware, audit, inventory, phase-26-sunset]

# Dependency graph
requires:
  - phase: 16-shared-package-extraction
    provides: shared package extraction complete; admin stable before Phase 17 audit
provides:
  - .planning/host-guard-inventory.md cataloging all 5 hostname-check sites in admin src/
  - Phase 26 (SUN-02) cleanup checklist scoped by exhaustive audit
  - HOST-01 satisfied
affects:
  - 17-02-hostname-guard-inventory (Plan 17-02 hardens proxy.ts using this inventory as context)
  - Phase 26 (Sunset, SUN-01..03) — cleanup checklist created here is the execution guide

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Hostname audit pattern: grep src/ for host header access patterns + named host sets before introducing new valid hosts"

key-files:
  created:
    - .planning/host-guard-inventory.md
  modified: []

key-decisions:
  - "Inventory document at .planning/host-guard-inventory.md (NOT in phases/) — milestone-spanning reference used through Phase 26"
  - "Re-grep at execution time confirmed planning-time site list is exhaustive — exactly 5 sites, no new sites added"
  - "Phase 26 cleanup checklist explicitly lists which layout files/directories are deleted vs which (proxy.ts) is kept"

patterns-established:
  - "Pre-introduction audit: before adding portal.triarch.dev as a second valid host, audit all existing hostname checks to establish deletion scope"

requirements-completed: [HOST-01]

# Metrics
duration: 5min
completed: 2026-05-08
---

# Phase 17 Plan 01: Hostname Guard Inventory Summary

**Exhaustive grep audit of all 5 hostname-check sites in admin src/; .planning/host-guard-inventory.md written with per-site file:line, pattern, behavior, and Phase 26 cleanup checklist**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-05-08T17:33:00Z
- **Completed:** 2026-05-08T17:38:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Re-ran audit grep at execution time — confirmed exactly 5 hostname-check sites, matching the planning-time inventory (no new sites introduced since planning)
- Wrote `.planning/host-guard-inventory.md` with a full markdown table covering all 5 sites (file:line, code pattern, current behavior, removal-target phase)
- Documented the MARKETING_HOSTS duplication across 3 layout files as a Phase 26 cleanup hint
- Created the forward-referenced Phase 26 cleanup checklist (6 items: delete projects/, remove MARKETING_HOSTS blocks from admin/layout.tsx and login/layout.tsx, delete/simplify page.tsx, KEEP hardened proxy.ts, bump admin v3.0.0)

## Task Commits

1. **Task 1: Re-grep and write host-guard-inventory.md** - `ad044ab` (docs)

**Plan metadata:** (included in final docs commit)

## Files Created/Modified

- `.planning/host-guard-inventory.md` - Canonical audit document: 5 hostname-check sites cataloged, Phase 26 cleanup checklist, duplication notes

## Decisions Made

- Inventory placed at `.planning/host-guard-inventory.md` (not inside phases/) because it is a milestone-spanning reference document consumed by Phase 26 — follows the decision locked in 17-CONTEXT.md
- Phase 26 cleanup checklist documents `src/proxy.ts` as KEEP (hardened in Phase 17, survives sunset) while all 4 layout-file guards are scheduled for deletion

## Deviations from Plan

None - plan executed exactly as written. Re-grep confirmed planning-time inventory was correct; no additional sites required.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- HOST-01 satisfied; inventory document is the canonical reference for Phase 26 (SUN-02) deletion scope
- Plan 17-02 (middleware hardening) can proceed immediately — proxy.ts entry in inventory confirms the open passthrough pattern that Plan 17-02 must harden
- No blockers

---
*Phase: 17-hostname-guard-inventory*
*Completed: 2026-05-08*
