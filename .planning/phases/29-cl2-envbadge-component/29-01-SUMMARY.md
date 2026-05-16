---
phase: 29-cl2-envbadge-component
plan: "01"
subsystem: ui
tags: [react, typescript, shared-ui, npm-package, env-badge, cl-2, dev-chrome]

# Dependency graph
requires: []
provides:
  - "@triarchsecurity/shared-ui v1.5.0 with EnvBadge component (local feature branch feat/v1.5.0-envbadge — unpublished)"
  - "EnvBadge renders fixed-position DEV/STAGING pill for dev chrome marker (CL-2)"
  - "data-env attribute for Phase 35 compliance scan HTML parse"
affects:
  - 29-02-PLAN.md (platform mount — needs shared-ui v1.5.0 published before npm install works)
  - 29-03-PLAN.md through 29-06-PLAN.md (consumer mounts — same publish dependency)
  - 35-cl2-compliance-scan (will curl-parse for data-env attribute)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "EnvBadge inline CSS-in-JS pattern (no className/tailwind) — matches SkeletonLoader style with fixed position override"
    - "TDD RED→GREEN in shared-ui: write failing test importing nonexistent module, then implement until GREEN"
    - "Atomic shared-ui commit: test + component + index.ts export + package.json version bump + dist/ regen in one commit"

key-files:
  created:
    - /Users/mikegeehan/claude/triarch/shared/shared-ui/src/components/EnvBadge/index.tsx
    - /Users/mikegeehan/claude/triarch/shared/shared-ui/__tests__/EnvBadge.test.tsx
  modified:
    - /Users/mikegeehan/claude/triarch/shared/shared-ui/src/index.ts
    - /Users/mikegeehan/claude/triarch/shared/shared-ui/package.json
    - /Users/mikegeehan/claude/triarch/shared/shared-ui/dist/index.js
    - /Users/mikegeehan/claude/triarch/shared/shared-ui/dist/index.d.ts

key-decisions:
  - "Component uses inline style not className/Tailwind — shared-ui has no Tailwind in component source (only themes/*.css)"
  - "Yellow (#facc15) for dev, orange (#fb923c) for staging — contrasting, non-disruptive per CONTEXT.md discretion clause"
  - "zIndex 9000 — above app content, below typical modal overlays (10000+)"
  - "data-env value is always lowercase (normalized from prop) — Phase 35 compliance scan assertion target"
  - "Pre-existing SortableList test failure (1 test) logged to deferred-items — unrelated to EnvBadge, out of scope"

patterns-established:
  - "shared-ui folder pattern: src/components/<Name>/index.tsx (not flat file)"
  - "shared-ui test pattern: __tests__/<Name>.test.tsx importing from ../src/components/<Name>/index.js"
  - "shared-ui commit pattern: v1.5.0: feat: <description> (version prefix, single atomic commit)"

requirements-completed:
  - CL2-01
  - CL2-02

# Metrics
duration: 8min
completed: "2026-05-16"
---

# Phase 29 Plan 01: EnvBadge Component (shared-ui v1.5.0) Summary

**Fixed-position DEV/STAGING pill component in @triarchsecurity/shared-ui v1.5.0 with data-env attribute for CL-2 compliance scan, committed atomically on feat/v1.5.0-envbadge (unpublished — awaiting human push/PR/tag)**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-05-16T21:07:10Z
- **Completed:** 2026-05-16T21:08:35Z
- **Tasks:** 2 (RED test + GREEN implementation, merged into 1 atomic commit)
- **Files modified:** 6

## Accomplishments

- Created `EnvBadge` React component in shared-ui with 6-scenario vitest test suite (all 6 pass)
- Bumped @triarchsecurity/shared-ui from 1.4.0 to 1.5.0; regenerated dist/index.js and dist/index.d.ts
- Single atomic commit `78f2771` on `feat/v1.5.0-envbadge` in `/Users/mikegeehan/claude/triarch/shared/shared-ui`

## Task Commits

Committed atomically (TDD RED + GREEN merged per plan instruction):

1. **Tasks 1+2: RED test + GREEN implementation + build + version bump** - `78f2771` (feat)

_Note: Plan instructed no interim RED commit — single atomic commit covers test file, component, index.ts export, package.json bump, dist/ regen._

## Files Created/Modified

- `src/components/EnvBadge/index.tsx` — EnvBadge component with inline CSS-in-JS, renders DEV/STAGING pill or returns null
- `__tests__/EnvBadge.test.tsx` — 6-scenario vitest test suite (all pass)
- `src/index.ts` — Added `export { EnvBadge } from './components/EnvBadge';` as first component export
- `package.json` — Version bumped 1.4.0 → 1.5.0
- `dist/index.js` — Rebuilt by tsup (54.70 KB ESM, contains EnvBadge symbol)
- `dist/index.d.ts` — Rebuilt by tsup (10.01 KB, contains EnvBadge type export)

## Decisions Made

- Inline CSS-in-JS used (not Tailwind className) — shared-ui component sources do not use Tailwind classes directly; themes/*.css is the CSS mechanism. This matches SkeletonLoader style.
- Yellow (#facc15) for `dev`, orange (#fb923c) for `staging` — saturated, non-disruptive colors per CONTEXT.md discretion clause.
- `zIndex: 9000` — above typical app content, below modal overlay convention (10000+).
- `data-env` normalized to lowercase regardless of input casing (e.g., `env="DEV"` → `data-env="dev"`) — Phase 35 compliance scan will assert on this lowercase value.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed missing npm dependencies before running tests**
- **Found during:** Task 1 (RED test run)
- **Issue:** `vitest` package not installed — `npx vitest run` failed with `ERR_MODULE_NOT_FOUND: Cannot find package 'vitest'`
- **Fix:** Ran `npm install` in shared-ui repo to install all devDependencies (217 packages)
- **Files modified:** node_modules/ (not tracked in git — .gitignore excludes it)
- **Verification:** Tests ran successfully after install
- **Committed in:** No commit needed (node_modules not committed)

### Out-of-Scope Pre-existing Issue (Not Fixed)

**SortableList.test.tsx: "renders screen reader instructions" (1 test failure)**
- Pre-existing failure unrelated to EnvBadge — `SortableList` component is missing a `.sr-only` element
- Not touched by this plan; out of scope per deviation scope-boundary rule
- Logged here for awareness; all 65 other tests (including 6 new EnvBadge tests) pass

## Issues Encountered

- `dist/index.js` rebuild produced a tsup warning: `The condition "types" here will never be used as it comes after "default"` — this is a pre-existing package.json exports field ordering issue, not caused by this plan. Not fixed (out of scope).

## Human Actions Required (Critical Path)

**This plan's work is complete locally. The following HUMAN steps are required before any consumer plan (29-02..29-06) can install v1.5.0 via npm:**

1. **Push the feature branch:**
   ```bash
   cd /Users/mikegeehan/claude/triarch/shared/shared-ui
   git push origin feat/v1.5.0-envbadge
   ```

2. **Open a PR** from `feat/v1.5.0-envbadge` → `main` in the `triarchsecurity/shared-ui` repo on GitHub (MyAlterLego account).

3. **Merge the PR** after CI passes.

4. **Create and push the version tag** (triggers CI publish to GitHub Packages npm registry):
   ```bash
   git checkout main && git pull origin main
   git tag v1.5.0
   git push origin v1.5.0
   ```

5. **Verify npm publish** — check GitHub Actions in `triarchsecurity/shared-ui` for a successful publish workflow run. The package must appear at `https://github.com/triarchsecurity/shared-ui/packages` before consumer plans run `npm install`.

**Until the tag is pushed and CI publishes, consumer repos referencing `"@triarchsecurity/shared-ui": "^1.5.0"` will get install errors.** This is expected — consumer mount plans (29-02..29-06) document this gating in their own summaries.

## Next Phase Readiness

- EnvBadge component is ready for consumer mount (Plans 29-02..29-06)
- Consumer plans CAN write/commit their layout.tsx + apphosting.dev.yaml changes without the published package (the commit is correct; CI will fail until publish, but local commits are valid)
- Phase 35 (compliance scan) can target `data-env="dev"` HTML attribute once consumers mount the component

## Self-Check: PASSED

| Item | Result |
|------|--------|
| `src/components/EnvBadge/index.tsx` | FOUND |
| `__tests__/EnvBadge.test.tsx` | FOUND |
| `29-01-SUMMARY.md` | FOUND |
| commit `78f2771` | FOUND |
| `package.json` version 1.5.0 | FOUND |
| `EnvBadge` in `dist/index.js` | FOUND (3 occurrences) |
| `EnvBadge` in `dist/index.d.ts` | FOUND (3 occurrences) |
| Branch `feat/v1.5.0-envbadge` | CONFIRMED |
| 6/6 vitest tests pass | CONFIRMED |

---
*Phase: 29-cl2-envbadge-component*
*Completed: 2026-05-16*
