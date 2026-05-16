---
phase: 34-security-portal-dev-restructure
plan: 1
subsystem: infra
tags: [dev-path, cl4-gate, cl2-envbadge, cl3-namespace, two-env, ci-cd, security-portal]
dependency_graph:
  requires: [shared-workflows@v8.2, platform-cl4-gate-endpoint]
  provides: [security-portal-dev-path, security-portal-cl4-gate, security-portal-cl2-badge]
  affects: [triarchsecurity-portal FAH, ci-cd pipeline, EnvBadge rendering]
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
key_decisions:
  - "quality-gate bumped from @v1 to @v8.2 to match shared-workflows adoption (consistent with fix/bump-shared-workflows-v8 branch intent)"
  - "deploy job split into deploy-dev + deploy-prod to isolate branch-specific behavior"
  - "verify-dev-deployed uses v2.13.10 direction: is-ancestor origin/dev HEAD (NOT reversed)"
  - "cl4-gate project_key=triarchsecurity-portal (matches security-portal registry row)"
  - "PORTAL_JWT_SECRET_DEV + PORTAL_TOTP_ENCRYPTION_KEY_DEV added to _DEV secret set (alongside DATABASE_URL_DEV)"
  - "apphosting.dev.yaml is standalone (not an overlay) — mirrors full apphosting.yaml with _DEV secret variants"
  - "contents: write permission added at top-level (deploy-firebase@v8 requires write)"
  - "flush-changelog absent from portal (not present in original ci-cd.yml — not a regression)"
patterns_established:
  - "Two-env FAH pattern: apphosting.yaml (prod) + apphosting.dev.yaml (dev) with _DEV secret suffix on dev-specific secrets"
  - "verify-dev-deployed gate: git merge-base --is-ancestor origin/dev HEAD before every prod deploy"
requirements_completed: []
duration: ~20 minutes
completed: 2026-05-16
---

# Phase 34: Security-Portal Dev Path Restructure Summary

**Two-env restructure of security-portal with CL-4 gate@v8.2, verify-dev-deployed v2.13.10, CL-2 EnvBadge mount, and CL-3 _DEV secret namespace in apphosting.dev.yaml.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-05-16T00:00:00Z
- **Completed:** 2026-05-16T00:20:00Z
- **Tasks:** 5
- **Files modified:** 5

## Accomplishments

- Transformed `triarchsecurity/security-portal` from single-env (prod-only, main-only CI) to two-env setup (dev + prod paths) aligned with the platform's dev/prod contract (CL-1..CL-6).
- All autonomous repo changes committed on `feat/dev-path-cl4-cl2-cl3` off `fix/bump-shared-workflows-v8`. No push.
- Mirrors Phase 33 (security-admin) exactly, adapted for security-portal secrets and backend names.

## Completed Tasks

| # | Task | Files | Commit |
|---|------|-------|--------|
| 1 | Create apphosting.dev.yaml with _DEV secrets + NEXT_PUBLIC_ENV=dev | `apphosting.dev.yaml` | `294f8ab` |
| 2 | Restructure ci-cd.yml (dev trigger, version, env-select, verify-dev-deployed, cl4-gate, deploy-dev, deploy-prod) | `.github/workflows/ci-cd.yml` | `294f8ab` |
| 3 | Mount EnvBadge in layout.tsx | `src/app/layout.tsx` | `294f8ab` |
| 4 | Bump package.json to v0.15.0, @triarchsecurity/shared-ui@^1.5.0 | `package.json` | `294f8ab` |
| 5 | Add @triarchsecurity/shared-ui to transpilePackages | `next.config.ts` | `294f8ab` |

## Verification Results

All checks passed:

| Check | Command | Result |
|-------|---------|--------|
| cl4-gate wired | `grep -c "gate-prod-version.yml@v8.2" .github/workflows/ci-cd.yml` | **1** |
| EnvBadge import + mount | `grep -c "EnvBadge" src/app/layout.tsx` | **2** |
| NEXT_PUBLIC_ENV in dev yaml | `grep -c "NEXT_PUBLIC_ENV" apphosting.dev.yaml` | **2** (comment + variable) |
| NEXT_PUBLIC_ENV absent in prod yaml | `grep -c "NEXT_PUBLIC_ENV" apphosting.yaml` | **0** |
| Version bumped | `node -p "require('./package.json').version"` | **"0.15.0"** |
| apphosting.dev.yaml parses | `python3 -c "import yaml; yaml.safe_load(...)"` | **VALID** |
| apphosting.yaml parses | `python3 -c "import yaml; yaml.safe_load(...)"` | **VALID** |
| ci-cd.yml parses | `python3 -c "import yaml; yaml.safe_load(...)"` | **VALID** |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] quality-gate version bump**
- **Found during:** Task 2 (ci-cd.yml restructure)
- **Issue:** Existing ci-cd.yml used `quality-gate.yml@v1` — inconsistent with adopting `shared-workflows@v8.2` for cl4-gate and deploy-firebase@v8. Using an old quality-gate against v8 deploy workflow could cause incompatibilities.
- **Fix:** Bumped quality-gate to `@v8.2` to match the rest of the v8 adoption (consistent with fix/bump-shared-workflows-v8 branch intent).
- **Files modified:** `.github/workflows/ci-cd.yml`
- **Commit:** `294f8ab`

**2. [Rule 2 - Missing critical functionality] permissions: contents: write**
- **Found during:** Task 2
- **Issue:** Original had `contents: read` at top-level. The deploy-firebase@v8 workflow needs `contents: write` to create deployment records (mirrors platform's ci-cd.yml pattern; identical deviation as Phase 33).
- **Fix:** Changed top-level permission from `contents: read` to `contents: write`.
- **Files modified:** `.github/workflows/ci-cd.yml`
- **Commit:** `294f8ab`

**3. [Rule 1 - Bug] notify job updated for split deploy jobs**
- **Found during:** Task 2
- **Issue:** Original `notify` job referenced `needs: [quality-gate, deploy]` — `deploy` renamed to `deploy-dev` and `deploy-prod`. Updated needs and dynamic status/version resolution to pull from whichever deploy ran.
- **Fix:** Updated needs + status/version expressions to handle dev vs prod branch.
- **Files modified:** `.github/workflows/ci-cd.yml`
- **Commit:** `294f8ab`

**4. [Note] apphosting.dev.yaml already existed (stub)**
- **Found during:** Task 1
- **Issue:** The file existed with a minimal one-liner (`DATABASE_URL → DATABASE_URL_DEV` only). Not a bug — was an earlier partial attempt. Replaced with full _DEV secret set matching all portal secrets.
- **Fix:** Rewrote with full secret coverage (PORTAL_JWT_SECRET_DEV, PORTAL_TOTP_ENCRYPTION_KEY_DEV, etc.) + NEXT_PUBLIC_ENV=dev.
- **Files modified:** `apphosting.dev.yaml`
- **Commit:** `294f8ab`

---

**Total deviations:** 4 (2 missing critical, 1 bug fix, 1 pre-existing stub replacement)
**Impact on plan:** All auto-fixes necessary for correctness and v8 compatibility. No scope creep.

## Commits

| Hash | Message |
|------|---------|
| `294f8ab` | `v0.15.0: feat: dev path + CL-4 gate + CL-2 envbadge + CL-3 namespace prep` |

## Known Stubs

None — no UI stubs. EnvBadge mount is wired to `process.env.NEXT_PUBLIC_ENV` which is set in `apphosting.dev.yaml`. On prod, the env var is absent, so badge renders nothing (correct behavior per CL-2 design). The dependency on `@triarchsecurity/shared-ui@^1.5.0` is intentional — the package is not yet published; `npm install` is a HUMAN-UAT step.

## HUMAN-UAT Items

The following items cannot be automated — they require human action in Firebase Console, GCP, GitHub UI, GoDaddy DNS, or via git. See `34-HUMAN-UAT.md` for the full runbook.

| # | Action | Blocking? |
|---|--------|-----------|
| A | Resolve dormant `dev` branch (Option A recommended: delete + recreate from main) | Yes — CI only triggers on `dev` branch; 20-commit-behind dev will fail verify-dev-deployed |
| B | Create FAH backend `portal-dev` in Firebase project `triarchsecurity-portal` | Yes — dev deploys won't run without it |
| C | Claim `portal-dev.triarchsecurity.com` DNS (CNAME in GoDaddy triarchsecurity.com zone) | No — app works without custom domain via FAH URL |
| D | Create GCP secrets `DATABASE_URL_DEV`, `PORTAL_JWT_SECRET_DEV`, `PORTAL_TOTP_ENCRYPTION_KEY_DEV` in `triarchsecurity-portal` project; bind to `portal-dev` backend | Yes — app won't boot on dev without DB/auth secrets |
| E | Add `ADMIN_API_TOKEN` GitHub Actions secret to security-portal repo | Yes — cl4-gate job will fail on prod deploys |
| F | Run `npm install` after `@triarchsecurity/shared-ui@^1.5.0` publishes (Phase 29 dependency) | Yes — build will fail without it |
| G | Merge `feat/dev-path-cl4-cl2-cl3` → `fix/bump-shared-workflows-v8` → `dev` → PR to `main` | Yes — enables the full two-env flow |

## Self-Check

- [x] `apphosting.dev.yaml` exists at `/Users/mikegeehan/claude/triarch/shared/security-portal/apphosting.dev.yaml`
- [x] `.github/workflows/ci-cd.yml` modified with dev branch, version job, env-select, verify-dev-deployed, cl4-gate, deploy-dev, deploy-prod
- [x] `src/app/layout.tsx` has EnvBadge import + mount (2 occurrences)
- [x] `package.json` at v0.15.0 with `@triarchsecurity/shared-ui@^1.5.0`
- [x] `next.config.ts` has `@triarchsecurity/shared-ui` in transpilePackages
- [x] All 3 YAMLs parse successfully
- [x] Commit `294f8ab` on `feat/dev-path-cl4-cl2-cl3` off `fix/bump-shared-workflows-v8`
- [x] No push to remote

## Self-Check: PASSED
