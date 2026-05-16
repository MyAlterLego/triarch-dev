---
phase: 29-cl2-envbadge-component
plan: "02"
subsystem: ui
tags: [react, typescript, shared-ui, env-badge, cl-2, dev-chrome, next-js, apphosting]

# Dependency graph
requires:
  - phase: 29-cl2-envbadge-component
    plan: "01"
    provides: "@triarchsecurity/shared-ui v1.5.0 with EnvBadge component (local feat/v1.5.0-envbadge — unpublished)"
provides:
  - "platform root layout mounts <EnvBadge env={NEXT_PUBLIC_ENV} /> — covers all platform routes (marketing + admin + login + projects)"
  - "apphosting.dev.yaml binds NEXT_PUBLIC_ENV=dev with BUILD+RUNTIME availability"
  - "apphosting.yaml remains absent of NEXT_PUBLIC_ENV (badge invisible in prod)"
  - "next.config.ts transpilePackages updated from stale @myalterlego/shared-ui to @triarchsecurity/shared-ui"
  - "package.json bumped @triarchsecurity/shared-ui dep ^1.2.0 → ^1.5.0 and platform version 2.13.15 → 2.13.16"
affects:
  - 29-07-PLAN.md (verification gate — all 5 consumer mounts must complete before verify)
  - 35-cl2-compliance-scan (will curl-parse platform dev HTML for data-env="dev")

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "EnvBadge mount pattern: last child inside <body>, after <Providers> — fixed-position CSS in component handles visual overlay"
    - "NEXT_PUBLIC_* apphosting pattern: requires BUILD + RUNTIME availability (baked into client bundle at build time)"
    - "Prod-invisibility via absence: apphosting.yaml omits NEXT_PUBLIC_ENV so badge returns null in prod (env prop undefined)"

key-files:
  created: []
  modified:
    - /Users/mikegeehan/claude/triarch/shared/platform/src/app/layout.tsx
    - /Users/mikegeehan/claude/triarch/shared/platform/apphosting.dev.yaml
    - /Users/mikegeehan/claude/triarch/shared/platform/package.json
    - /Users/mikegeehan/claude/triarch/shared/platform/next.config.ts

key-decisions:
  - "Replaced stale transpilePackages entry @myalterlego/shared-ui with @triarchsecurity/shared-ui — grep confirmed 0 source consumers of old name"
  - "EnvBadge mounted as last child in <body> after <Providers> — fixed z-index 9000 in component handles overlay"
  - "npm install NOT run — shared-ui v1.5.0 not yet published; TypeScript error (TS2305) is expected and documented"
  - "Single atomic commit covers all 4 file edits per plan instruction"

patterns-established:
  - "Consumer mount pattern: 4 files per repo (layout.tsx import+mount, apphosting.dev.yaml env entry, package.json dep bump, next.config.ts transpilePackages)"

requirements-completed:
  - CL2-03
  - CL2-04

# Metrics
duration: 5min
completed: "2026-05-16"
---

# Phase 29 Plan 02: Platform EnvBadge Mount Summary

**<EnvBadge/> mounted in platform root layout with NEXT_PUBLIC_ENV=dev in apphosting.dev.yaml; prod badge invisible via env var absence; single atomic commit 7462f40 on feat/cl2-envbadge-mount**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-05-16T21:15:00Z
- **Completed:** 2026-05-16T21:20:00Z
- **Tasks:** 2 (merged into 1 atomic commit per plan)
- **Files modified:** 4

## Accomplishments

- Mounted `<EnvBadge env={process.env.NEXT_PUBLIC_ENV} />` as last child inside `<body>` in `src/app/layout.tsx` — covers all platform routes via Next.js App Router root layout inheritance
- Added `NEXT_PUBLIC_ENV=dev` with `BUILD + RUNTIME` availability to `apphosting.dev.yaml` — baked into client bundle at dev build time
- Fixed stale `transpilePackages` entry: replaced `@myalterlego/shared-ui` → `@triarchsecurity/shared-ui` (0 source consumers of old name confirmed via grep)
- Bumped `@triarchsecurity/shared-ui` dep `^1.2.0` → `^1.5.0` and platform version `2.13.15` → `2.13.16`

## Task Commits

Tasks 1 and 2 merged into single atomic commit per plan instruction:

1. **Tasks 1+2: Branch + all 4 file edits** - `7462f40` (feat)

**Plan metadata:** (created after this summary)

## Files Created/Modified

- `src/app/layout.tsx` — Added `import { EnvBadge } from '@triarchsecurity/shared-ui'` and `<EnvBadge env={process.env.NEXT_PUBLIC_ENV} />` as last child in `<body>`
- `apphosting.dev.yaml` — Added `NEXT_PUBLIC_ENV: dev` entry with `BUILD + RUNTIME` availability (after existing `CL6_ENFORCEMENT_MODE` block)
- `package.json` — Bumped `@triarchsecurity/shared-ui` dep `^1.2.0` → `^1.5.0`; bumped platform version `2.13.15` → `2.13.16`
- `next.config.ts` — Replaced stale `@myalterlego/shared-ui` with `@triarchsecurity/shared-ui` in `transpilePackages`

## Decisions Made

- Replaced stale `@myalterlego/shared-ui` in `transpilePackages` entirely (not kept alongside new name) — grep confirmed zero source consumers of the old package name in `src/`
- Mounted EnvBadge as last child of `<body>` (after `<Providers>`) — fixed-position CSS in the component itself handles visual stacking via `z-index: 9000`
- Skipped `npm install` per plan instruction — shared-ui v1.5.0 not yet published to npm registry

## Deviations from Plan

None - plan executed exactly as written. The stale `@myalterlego/shared-ui` replacement was explicitly specified in the plan and confirmed safe via grep.

## Issues Encountered

**Expected TypeScript error (documented, not a failure):**

Running `npx tsc --noEmit` after the edits produces exactly 1 error:
```
src/app/layout.tsx(5,10): error TS2305: Module '"@triarchsecurity/shared-ui"' has no exported member 'EnvBadge'.
```

This is expected — the installed version of `@triarchsecurity/shared-ui` is `^1.2.0` (pre-EnvBadge). The `^1.5.0` specifier in `package.json` cannot resolve until the package is published and `npm install` is re-run.

**Build verification deferred:** `next build` will also fail until shared-ui v1.5.0 publishes. This is inherent to the Phase 29 cross-repo sequencing: shared-ui must be published (human action in 29-HUMAN-UAT) before consumer repos can install and build. The commit is correct — CI verification is gated on publish.

## Human Actions Required Before CI Can Pass

Before the `feat/cl2-envbadge-mount` branch PR can pass CI:

1. **shared-ui v1.5.0 must be published** (see 29-01-SUMMARY.md human action steps):
   - Push `feat/v1.5.0-envbadge` branch in shared-ui
   - Open PR → main, merge after CI
   - Tag `v1.5.0` and push → triggers npm publish via CI

2. **Run `npm install`** in platform repo (will update `package-lock.json` to resolve `^1.5.0`)

3. **Verify `next build` passes** after npm install resolves

These steps are captured in 29-HUMAN-UAT.

## Next Phase Readiness

- Platform mount complete and committed — ready for 29-07 verification gate (pending all 5 consumer mounts completing)
- Note for 29-07: Visual verification requires dev deploy at `admin-dev.triarch.dev` after the full sequence: shared-ui publish → npm install → platform PR merge → FAH dev deploy → curl HTML for `data-env="dev"`
- Out-of-scope: `apphosting.yaml` confirmed absent of `NEXT_PUBLIC_ENV` (badge will render null in prod — correct per CL-2 contract)

## Self-Check: PASSED

| Item | Result |
|------|--------|
| Branch `feat/cl2-envbadge-mount` exists | CONFIRMED |
| `src/app/layout.tsx` has `import { EnvBadge }` | FOUND |
| `src/app/layout.tsx` body has `<EnvBadge env={process.env.NEXT_PUBLIC_ENV} />` | FOUND |
| `grep -c "EnvBadge" src/app/layout.tsx` == 2 | CONFIRMED (2) |
| `package.json` version `2.13.16` | FOUND |
| `package.json` shared-ui dep `^1.5.0` | FOUND |
| `next.config.ts` transpilePackages has `@triarchsecurity/shared-ui` | FOUND |
| `next.config.ts` no longer has `@myalterlego/shared-ui` | CONFIRMED |
| `apphosting.dev.yaml` has `NEXT_PUBLIC_ENV` with `value: dev` | FOUND |
| `apphosting.yaml` absent of `NEXT_PUBLIC_ENV` | CONFIRMED (0 matches) |
| commit `7462f40` exists | CONFIRMED |
| working tree clean | CONFIRMED |

---
*Phase: 29-cl2-envbadge-component*
*Completed: 2026-05-16*
