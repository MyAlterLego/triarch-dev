---
phase: 33
plan: 1
subsystem: security-admin
tags: [dev-path, cl4-gate, cl2-envbadge, cl3-namespace, two-env, ci-cd]
dependency_graph:
  requires: [shared-workflows@v8.2, platform-cl4-gate-endpoint]
  provides: [security-admin-dev-path, security-admin-cl4-gate, security-admin-cl2-badge]
  affects: [triarchsecurity-admin FAH, ci-cd pipeline, EnvBadge rendering]
tech_stack:
  added: [apphosting.dev.yaml, @triarchsecurity/shared-ui@^1.5.0]
  patterns: [two-env FAH, cl4-gate@v8.2, verify-dev-deployed v2.13.10 direction]
key_files:
  created: [apphosting.dev.yaml]
  modified:
    - .github/workflows/ci-cd.yml
    - src/app/layout.tsx
    - package.json
    - next.config.ts
decisions:
  - "quality-gate bumped from @v1.8 to @v8.2 to match shared-workflows adoption"
  - "deploy job split into deploy-dev + deploy-prod to isolate branch-specific behavior"
  - "verify-dev-deployed uses v2.13.10 direction: is-ancestor origin/dev HEAD (NOT reversed)"
  - "cl4-gate project_key=triarchsecurity-admin (matches security-admin registry row)"
  - "NEXTAUTH_SECRET_DEV added to _DEV secret set (alongside DATABASE_URL_DEV)"
  - "apphosting.dev.yaml is standalone (not an overlay) — mirrors full apphosting.yaml with _DEV secret variants"
metrics:
  duration: "~25 minutes"
  completed: "2026-05-16"
  tasks_completed: 5
  files_modified: 5
---

# Phase 33 Plan 1: Security-Admin Dev Path Restructure Summary

**One-liner:** Two-env restructure of security-admin with CL-4 gate@v8.2, verify-dev-deployed v2.13.10, CL-2 EnvBadge mount, and CL-3 _DEV secret namespace in apphosting.dev.yaml.

## What Was Built

Transformed `triarchsecurity/security-admin` from single-env (prod-only, main-only CI) to a two-env setup (dev + prod paths) aligned with the platform's dev/prod contract (CL-1..CL-6). All autonomous repo changes are committed on `feat/dev-path-cl4-cl2-cl3` off `fix/bump-shared-workflows-v8`. No push.

## Completed Tasks

| # | Task | Files | Commit |
|---|------|-------|--------|
| 1 | Create apphosting.dev.yaml | `apphosting.dev.yaml` | `09346e0f` |
| 2 | Restructure ci-cd.yml (dev trigger, version, verify-dev-deployed, cl4-gate, deploy-dev, deploy-prod) | `.github/workflows/ci-cd.yml` | `09346e0f` |
| 3 | Mount EnvBadge in layout.tsx | `src/app/layout.tsx` | `09346e0f` |
| 4 | Bump package.json to v3.55.0, add @triarchsecurity/shared-ui@^1.5.0 | `package.json` | `09346e0f` |
| 5 | Add @triarchsecurity/shared-ui to transpilePackages | `next.config.ts` | `09346e0f` |

## Verification Results

All checks passed:

| Check | Command | Result |
|-------|---------|--------|
| cl4-gate wired | `grep -c "gate-prod-version.yml@v8.2" .github/workflows/ci-cd.yml` | **1** |
| EnvBadge import + mount | `grep -c "EnvBadge" src/app/layout.tsx` | **2** |
| NEXT_PUBLIC_ENV in dev yaml | `grep -c "NEXT_PUBLIC_ENV" apphosting.dev.yaml` | **2** (comment + variable) |
| NEXT_PUBLIC_ENV absent in prod yaml | `grep -c "NEXT_PUBLIC_ENV" apphosting.yaml` | **0** |
| Version bumped | `npm pkg get version` | **"3.55.0"** |
| apphosting.dev.yaml parses | `python3 -c "import yaml; yaml.safe_load(...)"` | **VALID** |
| apphosting.yaml parses | `python3 -c "import yaml; yaml.safe_load(...)"` | **VALID** |
| ci-cd.yml parses | `python3 -c "import yaml; yaml.safe_load(...)"` | **VALID** |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] quality-gate version bump**
- **Found during:** Task 2 (ci-cd.yml restructure)
- **Issue:** Existing ci-cd.yml used `quality-gate.yml@v1.8` — inconsistent with adopting `shared-workflows@v8.2` for cl4-gate and deploy-firebase@v8. Using an old quality-gate against v8 deploy workflow could cause incompatibilities.
- **Fix:** Bumped quality-gate to `@v8.2` to match the rest of the v8 adoption (consistent with fix/bump-shared-workflows-v8 branch intent).
- **Files modified:** `.github/workflows/ci-cd.yml`
- **Commit:** `09346e0f`

**2. [Rule 2 - Missing critical functionality] permissions: contents: write**
- **Found during:** Task 2
- **Issue:** Original had `contents: read`. The deploy-firebase@v8 workflow needs `contents: write` to create deployment records (mirrors platform's ci-cd.yml pattern).
- **Fix:** Changed top-level permission from `contents: read` to `contents: write`.
- **Files modified:** `.github/workflows/ci-cd.yml`
- **Commit:** `09346e0f`

**3. [Rule 1 - Bug] flush-changelog needs updated**
- **Found during:** Task 2
- **Issue:** Original `flush-changelog` job had `needs: deploy` — the job was renamed to `deploy-prod`. Updated needs to `[deploy-dev, deploy-prod]` with appropriate `if:` guard so changelog flushes after either deploy succeeds.
- **Fix:** Updated `needs` and `if:` condition on flush-changelog.
- **Files modified:** `.github/workflows/ci-cd.yml`
- **Commit:** `09346e0f`

**4. [Rule 1 - Bug] notify job updated for split deploy jobs**
- **Found during:** Task 2
- **Issue:** Original `notify` job referenced `needs: [quality-gate, deploy, flush-changelog]` — `deploy` renamed. Updated needs and dynamic status/version resolution to pull from whichever deploy ran.
- **Fix:** Updated needs + status/version expressions to handle dev vs prod branch.
- **Files modified:** `.github/workflows/ci-cd.yml`
- **Commit:** `09346e0f`

## Commits

| Hash | Message |
|------|---------|
| `09346e0f` | `v3.55.0: feat: dev path + CL-4 gate + CL-2 envbadge + CL-3 namespace prep` |

## Known Stubs

None — no UI stubs. EnvBadge mount is wired to `process.env.NEXT_PUBLIC_ENV` which is set in `apphosting.dev.yaml`. On prod, the env var is absent, so badge renders nothing (correct behavior per CL-2 design). The dependency on `@triarchsecurity/shared-ui@^1.5.0` is intentional — the package is not yet published; `npm install` is a HUMAN-UAT step (see below).

## HUMAN-UAT Items

The following items cannot be automated — they require human action in Firebase Console, GCP, GitHub UI, or GoDaddy DNS. See `33-HUMAN-UAT.md` for the full runbook.

| # | Action | Blocking? |
|---|--------|-----------|
| A | Create FAH backend `admin-dev` in Firebase project `triarchsecurity-admin` | Yes — dev deploys won't run without it |
| B | Push `dev` branch to security-admin: `git checkout -b dev main && git push origin dev` | Yes — CI only triggers on `dev` branch |
| C | Claim `admin-dev.triarchsecurity.com` DNS (CNAME in GoDaddy triarchsecurity.com zone) | No — app works without custom domain via FAH URL |
| D | Create GCP secrets `DATABASE_URL_DEV`, `NEXTAUTH_SECRET_DEV` in `triarchsecurity-admin` project; bind to `admin-dev` backend | Yes — app won't boot on dev without DB |
| E | Add `ADMIN_API_TOKEN` GitHub Actions secret to security-admin repo | Yes — cl4-gate job will fail on prod deploys |
| F | Run `npm install` after `@triarchsecurity/shared-ui@^1.5.0` publishes (Phase 29 dependency) | Yes — build will fail without it |
| G | Merge `feat/dev-path-cl4-cl2-cl3` → `fix/bump-shared-workflows-v8` → `dev` → PR to `main` | Yes — enables the full two-env flow |

## Self-Check

- [x] `apphosting.dev.yaml` exists at `/Users/mikegeehan/claude/triarch/shared/security-admin/apphosting.dev.yaml`
- [x] `.github/workflows/ci-cd.yml` modified with dev branch, version job, verify-dev-deployed, cl4-gate, deploy-dev, deploy-prod
- [x] `src/app/layout.tsx` has EnvBadge import + mount (2 occurrences)
- [x] `package.json` at v3.55.0 with `@triarchsecurity/shared-ui@^1.5.0`
- [x] `next.config.ts` has `@triarchsecurity/shared-ui` in transpilePackages
- [x] All 3 YAMLs parse successfully
- [x] Commit `09346e0f` on `feat/dev-path-cl4-cl2-cl3` off `fix/bump-shared-workflows-v8`
- [x] No push to remote

## Self-Check: PASSED
