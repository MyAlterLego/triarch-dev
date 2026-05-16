---
phase: 29-cl2-envbadge-component
plan: "06"
subsystem: ui
tags: [envbadge, shared-ui, next.js, firebase-app-hosting, cl-2]

requires:
  - phase: 29-cl2-envbadge-component
    provides: "29-01 built EnvBadge component in shared-ui v1.5.0"

provides:
  - "EnvBadge mounted in truthtreason root layout"
  - "@triarchsecurity/shared-ui dep added to truthtreason (first time)"
  - "transpilePackages configured in truthtreason next.config.ts (new field)"
  - "NEXT_PUBLIC_ENV=dev set in truthtreason apphosting.dev.yaml"

affects:
  - 29-cl2-envbadge-component
  - phase-35-compliance-scan

tech-stack:
  added:
    - "@triarchsecurity/shared-ui ^1.5.0 (first dep on this package for truthtreason)"
  patterns:
    - "transpilePackages required in next.config.ts when consuming @triarchsecurity/shared-ui"
    - "NEXT_PUBLIC_ENV baked at BUILD and RUNTIME in apphosting.dev.yaml, absent from apphosting.yaml + apphosting.prod.yaml"

key-files:
  created: []
  modified:
    - /Users/mikegeehan/claude/triarch/shared/truthtreason/src/app/layout.tsx
    - /Users/mikegeehan/claude/triarch/shared/truthtreason/package.json
    - /Users/mikegeehan/claude/triarch/shared/truthtreason/next.config.ts
    - /Users/mikegeehan/claude/triarch/shared/truthtreason/apphosting.dev.yaml

key-decisions:
  - "Added @triarchsecurity/shared-ui as first-ever shared-ui dep in truthtreason"
  - "Added transpilePackages field to next.config.ts (was entirely absent)"
  - "EnvBadge placed as last child of <body> after {children}, before body close"
  - "NEXT_PUBLIC_ENV absent from apphosting.yaml and apphosting.prod.yaml (prod env is implicit absence)"

patterns-established:
  - "First-time shared-ui consumer pattern: add dep + transpilePackages + import + mount + apphosting.dev.yaml in single atomic commit"

requirements-completed:
  - CL2-03
  - CL2-04

duration: 8min
completed: 2026-05-16
---

# Phase 29 Plan 06: truthtreason EnvBadge Mount Summary

**@triarchsecurity/shared-ui added as first dep + transpilePackages configured + EnvBadge mounted in truthtreason root layout with NEXT_PUBLIC_ENV=dev wired for dev chrome badge**

## Performance

- **Duration:** 8 min
- **Started:** 2026-05-16T00:00:00Z
- **Completed:** 2026-05-16T00:08:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Added `@triarchsecurity/shared-ui ^1.5.0` to truthtreason package.json (brand new dependency — this repo had no shared-ui dep previously)
- Added `transpilePackages: ['@triarchsecurity/shared-ui']` to next.config.ts (field did not exist)
- Imported and mounted `<EnvBadge env={process.env.NEXT_PUBLIC_ENV} />` in root layout.tsx as last child of `<body>`
- Added `NEXT_PUBLIC_ENV=dev` with `availability: [BUILD, RUNTIME]` to apphosting.dev.yaml
- Confirmed apphosting.yaml and apphosting.prod.yaml have zero NEXT_PUBLIC_ENV entries
- Bumped truthtreason version 1.1.18 → 1.1.19

## Task Commits

1. **Task 1 + Task 2 (merged into single atomic commit):** `2ec6cd7` (feat) — `v1.1.19: feat(cl-2): mount <EnvBadge/> in root layout + set NEXT_PUBLIC_ENV=dev`

## Files Created/Modified

- `src/app/layout.tsx` — Added EnvBadge import from @triarchsecurity/shared-ui; mounted as last child of body
- `package.json` — Added @triarchsecurity/shared-ui ^1.5.0 dep; bumped version 1.1.18 → 1.1.19
- `next.config.ts` — Added transpilePackages: ['@triarchsecurity/shared-ui'] (new field in existing config object)
- `apphosting.dev.yaml` — Added NEXT_PUBLIC_ENV=dev with BUILD+RUNTIME availability

## Decisions Made

- Inserted `@triarchsecurity/shared-ui` dep alphabetically between `@react-email/render` and `drizzle-orm` in package.json
- Added `transpilePackages` as the first field in the `NextConfig` object (above the existing `env` field)
- EnvBadge placed after `{children}` inside `<body>` — consistent with other consumer mounts, ensures badge overlays content without blocking it
- Did not touch apphosting.prod.yaml — that file exists alongside apphosting.yaml; both correctly have no NEXT_PUBLIC_ENV

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. npm install skipped intentionally (shared-ui v1.5.0 not yet on registry — this is expected per plan; install will run once the package is published post-Phase 29 human push).

## Known Stubs

None — no stubs. The EnvBadge component is wired to the real `process.env.NEXT_PUBLIC_ENV` env var which is set in apphosting.dev.yaml. No hardcoded values or placeholders.

## User Setup Required

None — no external service configuration required. The npm install of @triarchsecurity/shared-ui will succeed once the human pushes and publishes shared-ui v1.5.0 to the npm registry (separate human action tracked in 29-HUMAN-UAT).

## Next Phase Readiness

- truthtreason feature branch `feat/cl2-envbadge-mount` is ready for human push + PR to dev
- No push performed (per workspace CLAUDE.md — human handles push/PR/merge)
- All other consumer mounts (dev-portal, darksouls, tmi, platform) handled by sibling agents in parallel
- Phase 35 compliance scan can verify `data-env="dev"` attribute once all mounts are live

---
*Phase: 29-cl2-envbadge-component*
*Completed: 2026-05-16*
