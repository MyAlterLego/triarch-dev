---
phase: 29-cl2-envbadge-component
plan: 04
subsystem: ui
tags: [envbadge, shared-ui, next.js, apphosting, darksouls, cl-2]

# Dependency graph
requires:
  - phase: 29-cl2-envbadge-component
    provides: EnvBadge component built and exported from @triarchsecurity/shared-ui v1.5.0 (plan 29-01)
provides:
  - EnvBadge mounted in darksouls root layout consuming NEXT_PUBLIC_ENV
  - NEXT_PUBLIC_ENV=dev wired in darksouls apphosting.dev.yaml
  - darksouls transpilePackages updated to include @triarchsecurity/shared-ui
affects: [29-cl2-envbadge-component, 35-compliance-scan]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "EnvBadge mounted as last child of <body>, after <Providers>, server-rendered"
    - "NEXT_PUBLIC_ENV=dev set in apphosting.dev.yaml with BUILD+RUNTIME availability"

key-files:
  created: []
  modified:
    - /Users/mikegeehan/claude/triarch/shared/darksouls/src/app/layout.tsx
    - /Users/mikegeehan/claude/triarch/shared/darksouls/package.json
    - /Users/mikegeehan/claude/triarch/shared/darksouls/next.config.ts
    - /Users/mikegeehan/claude/triarch/shared/darksouls/apphosting.dev.yaml

key-decisions:
  - "Added @triarchsecurity/shared-ui to transpilePackages while keeping legacy @triarch/shared-ui and @myalterlego/shared-ui entries (cleanup deferred out of Phase 29 scope)"
  - "EnvBadge placed after <Providers>{children}</Providers> as last child in body (server-rendered, matches CL-2 requirement for curl-parseable DOM)"
  - "main pulled 3 ahead before branching — confirmed version still 7.7.12, patch bump to 7.7.13 applied"

patterns-established:
  - "EnvBadge pattern: import { EnvBadge } from '@triarchsecurity/shared-ui'; mount as <EnvBadge env={process.env.NEXT_PUBLIC_ENV} />"

requirements-completed: [CL2-03, CL2-04]

# Metrics
duration: 8min
completed: 2026-05-16
---

# Phase 29 Plan 04: darksouls EnvBadge Mount Summary

**EnvBadge mounted in darksouls root layout via @triarchsecurity/shared-ui, NEXT_PUBLIC_ENV=dev set in apphosting.dev.yaml, single v7.7.13 commit on feat/cl2-envbadge-mount**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-05-16T00:00:00Z
- **Completed:** 2026-05-16T00:08:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Branched off freshly-pulled main (was 3 commits behind origin/main — pulled and fast-forwarded before branching)
- Mounted `<EnvBadge env={process.env.NEXT_PUBLIC_ENV} />` in darksouls root layout as last child of `<body>`
- Added `@triarchsecurity/shared-ui` to `transpilePackages` in next.config.ts (kept legacy entries)
- Bumped `@triarchsecurity/shared-ui` dep from ^1.4.0 to ^1.5.0 and repo version from 7.7.12 to 7.7.13
- Added `NEXT_PUBLIC_ENV=dev` with BUILD+RUNTIME availability to apphosting.dev.yaml
- Confirmed `apphosting.yaml` (prod) has no NEXT_PUBLIC_ENV entry

## Task Commits

1. **Tasks 1+2: Branch, bump deps, mount EnvBadge, set env var — atomic commit** - `f0706fb` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `src/app/layout.tsx` — added EnvBadge import and mount inside body
- `package.json` — bumped @triarchsecurity/shared-ui ^1.4.0 → ^1.5.0, version 7.7.12 → 7.7.13
- `next.config.ts` — added @triarchsecurity/shared-ui to transpilePackages array
- `apphosting.dev.yaml` — added NEXT_PUBLIC_ENV=dev with BUILD+RUNTIME availability

## Decisions Made
- Kept legacy `@triarch/shared-ui` and `@myalterlego/shared-ui` in transpilePackages — plan explicitly scoped to ADD only; removal deferred
- Used server-rendered placement (after Providers, before body close) to satisfy Phase 35 compliance scan requirement (curl-parseable DOM)
- npm install skipped — v1.5.0 not yet published; documented as expected per plan

## Deviations from Plan

None — plan executed exactly as written.

Note: darksouls main was 3 commits ahead of local before branching (branch pulled and fast-forwarded as expected). Version on main was still 7.7.12 — patch bump to 7.7.13 applied as planned.

## Issues Encountered

- `npm install` for v1.5.0 skipped per plan instructions — v1.5.0 not yet published to npm registry. This is expected; publish is a human step after shared-ui plan (29-01) is pushed and tagged.

## User Setup Required

None — no external service configuration required beyond what the plan specified. The `NEXT_PUBLIC_ENV=dev` env var is wired in `apphosting.dev.yaml` and will take effect on next dev deploy.

## Known Stubs

None — EnvBadge receives the real `process.env.NEXT_PUBLIC_ENV` value; no hardcoded placeholder data.

## Next Phase Readiness
- darksouls mount complete; feature branch `feat/cl2-envbadge-mount` ready for human push and PR
- Depends on shared-ui v1.5.0 publish (plan 29-01) before the import resolves at build time
- Phase 35 compliance scan can assert `data-env="dev"` on darksouls dev URL once deployed

---
*Phase: 29-cl2-envbadge-component*
*Completed: 2026-05-16*

## Self-Check: PASSED

- `f0706fb` commit confirmed in darksouls git log
- `feat/cl2-envbadge-mount` is exactly 1 commit ahead of main
- All 4 files modified and committed
- apphosting.yaml confirmed absent of NEXT_PUBLIC_ENV
- Working tree clean after commit
