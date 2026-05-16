---
phase: 29-cl2-envbadge-component
plan: 03
subsystem: ui
tags: [envbadge, shared-ui, dev-portal, apphosting, NEXT_PUBLIC_ENV, cl-2]

requires:
  - phase: 29-cl2-envbadge-component
    provides: EnvBadge component built in shared-ui v1.5.0 (plan 29-01)

provides:
  - EnvBadge mounted in dev-portal root layout (portal.triarch.dev)
  - NEXT_PUBLIC_ENV=dev bound in dev-portal apphosting.dev.yaml
  - dev-portal shared-ui dep bumped to ^1.5.0

affects:
  - 29-HUMAN-UAT
  - Phase 35 (compliance scan — dev-portal HTML will carry data-env="dev" after deploy)

tech-stack:
  added: []
  patterns:
    - "Cross-repo consumer mount: import EnvBadge from shared-ui, mount as last child of <body>, bind NEXT_PUBLIC_ENV in apphosting.dev.yaml"

key-files:
  created: []
  modified:
    - /Users/mikegeehan/claude/triarch/shared/dev-portal/src/app/layout.tsx
    - /Users/mikegeehan/claude/triarch/shared/dev-portal/package.json
    - /Users/mikegeehan/claude/triarch/shared/dev-portal/apphosting.dev.yaml

key-decisions:
  - "Branched off main (not stale fix/deploy-skip-bug) per CONTEXT.md decision"
  - "EnvBadge placed as last child of <body> after {children}, after PreviewModeBanner + StaffCallout conditionals"
  - "npm install skipped — shared-ui 1.5.0 not yet published; expected 404 documented"
  - "transpilePackages already had @triarchsecurity/shared-ui — no next.config.ts edit needed"

patterns-established:
  - "Consumer mount pattern: single atomic commit per consumer repo covering layout + yaml + package.json"

requirements-completed:
  - CL2-03
  - CL2-04

duration: 8min
completed: 2026-05-16
---

# Phase 29 Plan 03: dev-portal EnvBadge Mount Summary

**EnvBadge imported and mounted in dev-portal root layout with NEXT_PUBLIC_ENV=dev bound in apphosting.dev.yaml on feature branch feat/cl2-envbadge-mount**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-05-16T00:00:00Z
- **Completed:** 2026-05-16T00:08:00Z
- **Tasks:** 2
- **Files modified:** 3 (in dev-portal repo)

## Accomplishments

- Checked out `feat/cl2-envbadge-mount` off `main` in dev-portal repo (main was 1 commit ahead of local — pulled cleanly)
- Mounted `<EnvBadge env={process.env.NEXT_PUBLIC_ENV} />` as last `<body>` child in dev-portal root layout without disturbing existing `PreviewModeBanner` + `StaffCallout` conditionals
- Added `NEXT_PUBLIC_ENV: dev` with `BUILD + RUNTIME` availability to `apphosting.dev.yaml`
- Bumped `@triarchsecurity/shared-ui` from `^1.2.0` to `^1.5.0` and portal version from `0.7.4` to `0.7.5`
- Confirmed `transpilePackages` already contains `@triarchsecurity/shared-ui` — no `next.config.ts` edit needed
- Confirmed `apphosting.yaml` (prod) does NOT contain `NEXT_PUBLIC_ENV` — no edit needed

## Task Commits

Each task was committed atomically in the dev-portal repo:

1. **Tasks 1+2 combined: branch, bump deps, mount EnvBadge, bind env var** - `55060c2` (feat) — single atomic commit per plan spec

## Files Created/Modified

*(All in `/Users/mikegeehan/claude/triarch/shared/dev-portal/`)*

- `src/app/layout.tsx` - Added `import { EnvBadge } from '@triarchsecurity/shared-ui'`; mounted `<EnvBadge env={process.env.NEXT_PUBLIC_ENV} />` as last child of `<body>`
- `package.json` - Bumped `@triarchsecurity/shared-ui` to `^1.5.0`; bumped portal version to `0.7.5`
- `apphosting.dev.yaml` - Added `NEXT_PUBLIC_ENV` with `value: dev` and `availability: [BUILD, RUNTIME]`

## Decisions Made

- Branched off `main` (ignoring stale `fix/deploy-skip-bug`) per CONTEXT.md decision — main had one additional commit not yet on local, pulled cleanly
- No `npm install` run — `@triarchsecurity/shared-ui@1.5.0` not yet published; expected 404; documented here; install will succeed after plan 29-01 publishes the package
- No `next.config.ts` edit required — `transpilePackages` already included `@triarchsecurity/shared-ui` (confirmed via grep)
- No `apphosting.yaml` edit required — `NEXT_PUBLIC_ENV` absent from prod yaml (confirmed via grep, 0 matches)

## Deviations from Plan

None - plan executed exactly as written. All pre-conditions matched recon expectations.

## Issues Encountered

None. The `main` branch pull brought in one additional commit (`v0.7.4` package.json bump + `.github/workflows/ci-cd.yml` update) which was already accounted for in the version bump target (`0.7.4` → `0.7.5`).

## Known Stubs

None. `EnvBadge` renders based on `process.env.NEXT_PUBLIC_ENV` which will be `dev` in dev-portal-dev deployments once `apphosting.dev.yaml` is applied. No hardcoded empty values or placeholders introduced.

**Build status note:** `npm run build` / `tsc` will fail with package-not-found (404) for `@triarchsecurity/shared-ui@1.5.0` until plan 29-01's `npm publish` step completes. This is expected and documented — NOT a defect in this plan.

## User Setup Required

None — no external service configuration required. EnvBadge will display automatically after plan 29-01's shared-ui package is published and the feature branch is merged + deployed.

## Next Phase Readiness

- dev-portal feature branch `feat/cl2-envbadge-mount` at commit `55060c2` is ready to push and PR once shared-ui 1.5.0 is published
- After merge to `dev` + deploy, `admin-dev.triarch.dev` (wait — this is portal: `portal-dev.triarch.dev`) will render the "DEV" badge
- Phase 35 compliance scan will find `data-env="dev"` in the HTML for dev-portal's dev deployment

---
*Phase: 29-cl2-envbadge-component*
*Completed: 2026-05-16*
