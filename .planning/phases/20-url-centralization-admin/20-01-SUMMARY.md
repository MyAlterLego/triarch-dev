---
phase: 20-url-centralization-admin
plan: 01
subsystem: api
tags: [vitest, urls, environment-variables, typescript]

# Dependency graph
requires: []
provides:
  - "src/lib/urls.ts with four customer-facing URL helpers reading PORTAL_BASE_URL at call time"
  - "Vitest suite (6 cases) verifying all four helpers + env override at call time"
  - "Admin v2.9.2 version bump"
affects: [20-02-eslint-guard, 21-release-page-port, 22-write-surface, 25-cutover]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Call-time env read via ?? fallback — getPortalBaseUrl() inside each helper, never at module load"]

key-files:
  created:
    - src/lib/urls.ts
    - src/lib/urls.test.ts
  modified:
    - package.json

key-decisions:
  - "PORTAL_BASE_URL read at call time (not module load) so Vitest env mutation and per-request overrides work"
  - "No speculative helpers added beyond the four locked signatures — scout confirmed zero current emission sites"
  - "Patch bump only (2.9.1 → 2.9.2) — helper module is a refactor enabler with no functional behavior change"

patterns-established:
  - "URL helper pattern: export named function that calls getPortalBaseUrl() inline, no eager read"

requirements-completed: [URL-01, URL-02]

# Metrics
duration: 3min
completed: 2026-05-08
---

# Phase 20 Plan 01: URL Centralization (Admin) Summary

**Four customer-facing URL helpers (customerProjectUrl/ReleaseUrl/BugUrl/FeatureUrl) in src/lib/urls.ts reading PORTAL_BASE_URL at call time with https://portal.triarch.dev default**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-05-08T19:10:33Z
- **Completed:** 2026-05-08T19:13:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Created src/lib/urls.ts with four locked-signature helpers + PORTAL_BASE_URL env reader (call-time, not module-load)
- Created src/lib/urls.test.ts with 6 Vitest cases (RED → GREEN TDD); all 338 suite tests GREEN
- Bumped admin package.json 2.9.1 → 2.9.2; next build clean

## Task Commits

Each task was committed atomically:

1. **Task 1: Create urls.ts + urls.test.ts (TDD RED → GREEN)** - `b69db35` (test) + `6fb9967` (feat)
2. **Task 2: Bump v2.9.1 → v2.9.2 + full suite + build verify** - `6fb9967` (feat)

**Plan metadata:** (docs commit follows)

_Note: TDD task had test commit (RED) bundled with feat commit (GREEN) in same atomic pair._

## Files Created/Modified
- `src/lib/urls.ts` - Four customer-facing URL helpers with PORTAL_BASE_URL env reader
- `src/lib/urls.test.ts` - 6 Vitest cases covering all helpers + env override behavior
- `package.json` - Version bumped from 2.9.1 to 2.9.2

## Decisions Made
- PORTAL_BASE_URL is read inside each helper via `getPortalBaseUrl()` (call-time, not module load) — ensures Vitest `process.env` mutation in `afterEach` works correctly and per-request overrides are honored in production
- No additional helpers beyond the four locked in 20-CONTEXT.md — scout confirmed zero current customer-facing URL emission sites in admin; adding speculative helpers would be scope creep
- Patch bump (not minor) because the helper module is proactive infrastructure with no behavior change to existing code

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- URL-01 satisfied: helpers available for Phase 21+ code to use naturally
- URL-02 vacuously satisfied: no current admin customer-facing URL emission sites (scout-confirmed); ESLint guard in Plan 20-02 enforces going forward
- Plan 20-02 (parallel sibling) adds the ESLint no-restricted-syntax rule and apphosting.yaml PORTAL_BASE_URL binding
- Phase 21 (release page port) and Phase 22 (write surface) will import from `src/lib/urls.ts` directly

---
*Phase: 20-url-centralization-admin*
*Completed: 2026-05-08*
