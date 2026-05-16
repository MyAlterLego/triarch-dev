---
phase: 29-cl2-envbadge-component
plan: "05"
subsystem: ui
tags: [envbadge, shared-ui, next-config, apphosting, tmi, cl-2]

requires:
  - phase: 29-01
    provides: EnvBadge component built and exported from @triarchsecurity/shared-ui v1.5.0

provides:
  - EnvBadge mounted in tmi root layout
  - NEXT_PUBLIC_ENV=dev set in tmi apphosting.dev.yaml
  - tmi next.config.ts transpilePackages updated to @triarchsecurity/shared-ui

affects:
  - 29-HUMAN-UAT
  - Phase 35 compliance scan (data-env attribute assertion)

tech-stack:
  added: []
  patterns:
    - "EnvBadge mounted as last child of <body> after Providers wrapper, reads NEXT_PUBLIC_ENV at RSC render time"
    - "NEXT_PUBLIC_* vars added to apphosting.dev.yaml with BUILD+RUNTIME availability for Next.js static baking"

key-files:
  created: []
  modified:
    - /Users/mikegeehan/claude/triarch/shared/tmi/src/app/layout.tsx
    - /Users/mikegeehan/claude/triarch/shared/tmi/package.json
    - /Users/mikegeehan/claude/triarch/shared/tmi/next.config.ts
    - /Users/mikegeehan/claude/triarch/shared/tmi/apphosting.dev.yaml

key-decisions:
  - "Version bump to 4.44.2 (not 4.44.4) — plan context had stale branch version 4.44.3; actual main was 4.44.1 so correct patch bump is 4.44.2"
  - "Replaced @myalterlego/shared-ui with @triarchsecurity/shared-ui in transpilePackages after confirming 0 src imports of stale name"

patterns-established:
  - "EnvBadge mount pattern: import from @triarchsecurity/shared-ui, place inside <body> after main Providers, pass process.env.NEXT_PUBLIC_ENV"

requirements-completed:
  - CL2-03
  - CL2-04

duration: 8min
completed: 2026-05-16
---

# Phase 29 Plan 05: tmi EnvBadge Mount Summary

**EnvBadge mounted in tmi root layout via @triarchsecurity/shared-ui ^1.5.0, NEXT_PUBLIC_ENV=dev baked into dev apphosting config, stale transpilePackages entry corrected**

## Performance

- **Duration:** 8 min
- **Started:** 2026-05-16T00:00:00Z
- **Completed:** 2026-05-16T00:08:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Branched tmi off clean main (feat/cl2-envbadge-mount), 1 commit ahead
- Mounted `<EnvBadge env={process.env.NEXT_PUBLIC_ENV} />` in tmi root layout as last child of `<body>`
- Set NEXT_PUBLIC_ENV=dev in apphosting.dev.yaml with BUILD+RUNTIME availability for Next.js NEXT_PUBLIC_ baking
- Replaced stale `@myalterlego/shared-ui` in transpilePackages with correct `@triarchsecurity/shared-ui`
- Bumped @triarchsecurity/shared-ui dep ^1.4.0 → ^1.5.0
- Confirmed prod apphosting.yaml has no NEXT_PUBLIC_ENV (badge stays invisible in prod)

## Task Commits

1. **Task 1 + Task 2 (atomic): Mount EnvBadge + env var + deps** - `69450e4` (feat)

## Files Created/Modified

- `/Users/mikegeehan/claude/triarch/shared/tmi/src/app/layout.tsx` - Added EnvBadge import and mount in body
- `/Users/mikegeehan/claude/triarch/shared/tmi/package.json` - Bumped shared-ui to ^1.5.0, tmi version 4.44.1 → 4.44.2
- `/Users/mikegeehan/claude/triarch/shared/tmi/next.config.ts` - Replaced @myalterlego/shared-ui with @triarchsecurity/shared-ui in transpilePackages
- `/Users/mikegeehan/claude/triarch/shared/tmi/apphosting.dev.yaml` - Added NEXT_PUBLIC_ENV=dev (BUILD+RUNTIME)

## Decisions Made

- **Version bump to 4.44.2 (not 4.44.4):** Plan context referenced version 4.44.3 from the stale `fix/deploy-skip-bug` branch. Actual `main` was at 4.44.1, so correct patch bump is 4.44.2. Commit message adjusted accordingly.
- **transpilePackages replace (not keep both):** grep confirmed 0 references to @myalterlego/shared-ui anywhere in `src/`. Safe to drop stale entry entirely.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Adjusted version bump target from 4.44.4 to 4.44.2**
- **Found during:** Task 1 (reading package.json on main)
- **Issue:** Plan context stated current version was 4.44.3 (from stale fix/deploy-skip-bug branch); actual main branch version was 4.44.1
- **Fix:** Bumped 4.44.1 → 4.44.2 (correct patch increment from main); commit message says v4.44.2
- **Files modified:** package.json
- **Verification:** `grep '"version": "4.44.2"' package.json` passes
- **Committed in:** 69450e4

---

**Total deviations:** 1 auto-fixed (version number correction)
**Impact on plan:** No scope change. Correct semver from actual main baseline.

## Issues Encountered

None beyond the version number discrepancy handled above.

## User Setup Required

None - no external service configuration required. Human pushes the branch and opens PR per workspace CLAUDE.md.

## Next Phase Readiness

- tmi feat/cl2-envbadge-mount branch ready for push and PR review
- All 4 required edits verified: layout mount, apphosting dev env, transpilePackages, shared-ui dep bump
- prod yaml confirmed clean (no NEXT_PUBLIC_ENV leak)
- Stale `fix/deploy-skip-bug` branch in tmi: still exists locally, flag for cleanup in 29-HUMAN-UAT

---
*Phase: 29-cl2-envbadge-component*
*Completed: 2026-05-16*

## Self-Check: PASSED

- `69450e4` confirmed in tmi git log
- layout.tsx: 2 occurrences of EnvBadge (import + mount)
- apphosting.dev.yaml: 1 occurrence of NEXT_PUBLIC_ENV
- apphosting.yaml: 0 occurrences of NEXT_PUBLIC_ENV
- Working tree clean on feat/cl2-envbadge-mount
