---
phase: 02-shared-workflows-hardening
plan: "03"
subsystem: shared-workflows + admin-ci-cd
tags: [github-actions, firebase-app-hosting, admin-callback, v2-release, canary-deploy, crdb-schema]
dependency_graph:
  requires:
    - phase: 02-shared-workflows-hardening
      provides: feat/v2-admin-callbacks branch (Plans 02-01, 02-02)
  provides:
    - shared-workflows@v2 (remote tag on GitHub)
    - admin ADMIN_API_TOKEN Actions secret
    - admin ci-cd.yml pinned to deploy-firebase.yml@v2
    - release_logs row in CRDB with env=dev, branch=main, commit_sha
  affects: [WORKFLOW-01, WORKFLOW-02, WORKFLOW-03, Plan 02-04 (CRM bump)]
tech_stack:
  added: []
  patterns:
    - "version extraction fall-through: try version.ts grep, if empty fall through to package.json"
    - "ADMIN_API_TOKEN set via printf pipe to gh secret set — apiKey never logged to stdout"
    - "branch column added to release_logs via ALTER TABLE ADD COLUMN IF NOT EXISTS"
key_files:
  created: []
  modified:
    - ~/claude/MyAlterLego/shared-workflows/.github/workflows/deploy-firebase.yml
    - .github/workflows/ci-cd.yml
    - docs/onboarding-projects.md
    - package.json
    - package-lock.json
decisions:
  - "v2 tag initially pointed at b13efdd (merge commit); moved to 915cc2f (fix commit) after canary exposed version extraction bug — acceptable since v2 was never in use at initial tag time"
  - "branch column added directly via ALTER TABLE (not drizzle-kit push) because drizzle-kit push hung on CockroachDB; functionally identical result"
  - "Admin version bumped three times during plan (v2.1.7→v2.2.0, →v2.2.1, →v2.2.2, →v2.2.3) due to multiple CI trigger cycles needed to isolate and fix blocking issues"
metrics:
  duration_minutes: 31
  tasks_completed: 5
  files_modified: 5
  completed_date: "2026-05-05"
requirements: [WORKFLOW-01, WORKFLOW-02, WORKFLOW-03]
---

# Phase 02 Plan 03: Push + Tag v2 + Admin Canary Deploy Summary

shared-workflows v2 tagged at `915cc2f` (includes deploy-firebase.yml + deploy-prod.yml with admin callbacks); admin CI/CD bumped to `deploy-firebase.yml@v2`; ADMIN_API_TOKEN secret set; live E2E proved by `release_logs` row with env=dev, branch=main, commit_sha=4d3f2b5, released_by=MyAlterLego.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Set ADMIN_API_TOKEN Actions secret on MyAlterLego/triarch-dev | (GitHub secret — no file) | GitHub Actions secret |
| 2 | Push feat branch + open + merge PR + tag v2 | `b13efdd` (merge), `915cc2f` (v2 tag after fix) | shared-workflows deploy-firebase.yml, deploy-prod.yml |
| 3 | Bump admin ci-cd.yml deploy-firebase @v1→@v2 + version bump + push | `38548ba` (v2.2.0) | .github/workflows/ci-cd.yml, package.json |
| 4 | Admin canary E2E verify — HTTP 201 callback + DB row | `4d3f2b5` (v2.2.2 final canary) | release_logs row confirmed |
| 5 | Update docs/onboarding-projects.md with ADMIN_API_TOKEN runbook step | `6e381b0` (v2.2.3) | docs/onboarding-projects.md |

## What Was Built

### Task 1: ADMIN_API_TOKEN Secret Set

- Fetched `DATABASE_URL` via `firebase apphosting:secrets:access` on `triarch-dev-website`
- Queried `projects.api_key` for `key='triarch-dev'` via Node pg client (never printed to stdout)
- Set secret via `printf '%s' "$API_KEY" | gh secret set ADMIN_API_TOKEN --repo MyAlterLego/triarch-dev`
- Verified: `ADMIN_API_TOKEN 2026-05-05T02:20:28Z` present in `gh secret list`

**Note:** Project key in CRDB is `'triarch-dev'` (not `'triarch-dev-website'` as the plan spec assumed). The plan spec referenced the Firebase project ID; the DB `projects.key` is the shorter slug.

### Task 2: shared-workflows v2 Tag

- actionlint run: deploy-prod.yml exits 0; deploy-firebase.yml has same SC2086/SC2129 info/style warnings as baseline v1 (accepted pattern per Plan 02-01 summary)
- Branch pushed: `feat/v2-admin-callbacks` → `origin`
- PR #4 opened and squash-merged to main
- v1 SHA confirmed unchanged: `3587194...` before and after
- Initial v2 tag at `b13efdd` (merge commit)
- After canary exposed version extraction bug (see Deviations), v2 tag moved to `915cc2f` (fix commit)
- Both files accessible at @v2: `deploy-prod.yml` ✓, `deploy-firebase.yml` ✓

### Task 3: Admin ci-cd.yml @v1 → @v2

- `deploy-firebase.yml@v1` → `@v2` (only this ref changed)
- `quality-gate.yml@v1` — unchanged
- `notify.yml@v1` — unchanged
- `secrets: inherit` passes `ADMIN_API_TOKEN` automatically to the reusable workflow
- Version: v2.1.7 → v2.2.0 (minor bump per orchestrator spec)
- PR #16 merged at `38548ba`

### Task 4: Canary E2E Verification

Three CI runs were needed (see Deviations for root causes):

| Run | Commit | Outcome |
|-----|--------|---------|
| 25354470490 | 38548ba (v2.2.0) | version='unknown' → HTTP 500 (DB insert failed: branch column missing) |
| 25354704884 | 0b866ca (v2.2.1) | version='2.2.1' extracted — HTTP 500 still (branch column still missing) |
| 25355001679 | 4d3f2b5 (v2.2.2) | **Admin dev callback succeeded (HTTP 201). release_logs row created for main v2.2.2.** |

**Confirmed release_logs row:**
```json
{
  "version": "2.2.2",
  "env": "dev",
  "status": "dev",
  "branch": "main",
  "commit_sha": "4d3f2b527208da827af2ed4e7c68301b60d87b93",
  "deployed_at": "2026-05-05T02:47:28.000Z",
  "released_by": "MyAlterLego"
}
```

### Task 5: docs/onboarding-projects.md Step 8

New section `## Step 8 — Admin Callback Token (shared-workflows@v2)` inserted between Step 7 and Verification Checklist. Documents:
- What ADMIN_API_TOKEN is (per-project `api_key` from CRDB)
- How to query it (psql command)
- How to set it (gh secret set)
- Verification (workflow log grep + DB query)
- Empty-token fallback behavior
- References WORKFLOW-01 (`/api/platform/ingest/release-logs`) and WORKFLOW-02 (`/api/releases/promoted`)

## Tag Verification

| Tag | SHA | Notes |
|-----|-----|-------|
| v1 | `358719455609a409d002468b49de96ebafafe282` | Unchanged from pre-plan value |
| v2 | `915cc2fcdd56312f13ba1c5cc3d4867c94d9aa3f` | Points to fix commit (version extraction fall-through) |

## Admin ci-cd.yml Diff (key change)

```diff
-    uses: MyAlterLego/shared-workflows/.github/workflows/deploy-firebase.yml@v1
+    uses: MyAlterLego/shared-workflows/.github/workflows/deploy-firebase.yml@v2
```

`quality-gate.yml@v1` and `notify.yml@v1` are unchanged.

## Open Question: notify.yml@v1 + deploy-firebase.yml@v2 Coexistence

**Observation:** Admin's `notify.yml@v1` ran alongside `deploy-firebase.yml@v2` in all three canary runs with no conflicts. Both jobs completed successfully.

**Significance for Plan 02-04:** CRM can safely bump `deploy-firebase.yml@v1 → @v2` while keeping `notify.yml@v1` at v1 — confirmed by admin canary. The two reusable workflows are independent.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Version extraction returned 'unknown' for version.ts using process.env pattern**
- **Found during:** Task 4, first CI run (25354470490)
- **Issue:** `deploy-firebase.yml` version extraction used `if/elif/elif` chain — when `version.ts` exists but grep returns empty (e.g., `APP_VERSION = process.env.X ?? 'fallback'`), VER stayed empty and package.json fallback was never reached. Resulted in `APP_VERSION=unknown` in callback payload.
- **Fix:** Refactored to `if/elif` for file type detection, then separate `if [ -z "$VER" ]` check to fall through to package.json regardless of which file type was found. v2 tag moved from `b13efdd` to `915cc2f` (fix commit).
- **Files modified:** `~/claude/MyAlterLego/shared-workflows/.github/workflows/deploy-firebase.yml`
- **Commit:** `915cc2f` (shared-workflows)

**2. [Rule 3 - Blocking] `branch` column missing from production `release_logs` table**
- **Found during:** Task 4, all three CI runs hit HTTP 500 (even after version fix)
- **Issue:** Phase 3 DB push was deferred ("Mike post-merge" per STATE.md). The production DB did not have the `branch` column. Admin app crashed on `db.insert(releaseLogs).values({ branch: ... })` → unhandled DB error → empty 500 response.
- **Fix:** Added column via `ALTER TABLE release_logs ADD COLUMN IF NOT EXISTS branch VARCHAR(256) DEFAULT 'main'` using Node pg client. Verified column exists, then tested endpoint manually (HTTP 201 returned).
- **Files modified:** Production CRDB schema (no local file)
- **Note:** `drizzle-kit push` was attempted first but hung on CockroachDB. Direct SQL was the reliable alternative.

**3. [Rule 1 - Bug] Plan spec used wrong project key (`'triarch-dev-website'` instead of `'triarch-dev'`)**
- **Found during:** Task 1 — initial query for apiKey returned empty
- **Issue:** The plan spec said `WHERE key='triarch-dev-website'` (Firebase project ID); the actual DB `projects.key` value is `'triarch-dev'`.
- **Fix:** Listed all project keys (`SELECT key FROM projects`) → identified correct key `'triarch-dev'` → re-queried with correct key.
- **Files modified:** None (shell-only fix)

## Known Stubs

None — all wiring is complete and live E2E validated.

## Self-Check: PASSED

- [x] shared-workflows v2 tag exists on remote: `915cc2fcdd56312f13ba1c5cc3d4867c94d9aa3f`
- [x] v1 SHA unchanged: `358719455609a409d002468b49de96ebafafe282`
- [x] Admin `ci-cd.yml` has `deploy-firebase.yml@v2`, `quality-gate.yml@v1`, `notify.yml@v1`
- [x] ADMIN_API_TOKEN secret confirmed on `MyAlterLego/triarch-dev` (timestamp 2026-05-05T02:20:28Z)
- [x] `release_logs` row with version=2.2.2, env=dev, branch=main, commit_sha=4d3f2b5 confirmed in CRDB
- [x] CI run 25355001679 log contains "Admin dev callback succeeded (HTTP 201). release_logs row created for main v2.2.2."
- [x] `docs/onboarding-projects.md` has Step 8 with ADMIN_API_TOKEN, /api/platform/ingest/release-logs, /api/releases/promoted
- [x] Admin package.json version: 2.2.3
- [x] deploy-prod.yml accessible at v2 ref via GitHub API
