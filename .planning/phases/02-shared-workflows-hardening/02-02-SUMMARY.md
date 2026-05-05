---
phase: 02-shared-workflows-hardening
plan: 02
subsystem: infra
tags: [github-actions, firebase-app-hosting, curl, workflow_call, snake_case, admin-callback]

# Dependency graph
requires:
  - phase: 02-shared-workflows-hardening
    provides: feat/v2-admin-callbacks branch in MyAlterLego/shared-workflows (Plan 02-01)
provides:
  - deploy-prod.yml reusable workflow in shared-workflows with FAH main prod rollout + snake_case admin callback
  - WORKFLOW-02 implementation (prod deploy → /api/releases/promoted round-trip)
affects: [02-03-PLAN, 03-schema-github-app-permissions, phase-08-pilot]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "env: block pattern for ${{ }} expressions in run: blocks — avoids shellcheck SC2086 while keeping values readable"
    - "{ cmd1; cmd2; } >> file grouping instead of individual redirects — satisfies shellcheck SC2129 and is more readable"
    - "continue-on-error: true on admin callback steps — deploy is source of truth, callback is fire-and-forget"
    - "Empty-token guard at top of callback run: — guards against GitHub Actions silently substituting empty string for missing secrets"

key-files:
  created:
    - ~/claude/MyAlterLego/shared-workflows/.github/workflows/deploy-prod.yml
  modified: []

key-decisions:
  - "All ${{ }} expressions moved to env: block in run: steps — required for actionlint/shellcheck SC2086 compliance; functionally equivalent"
  - "{ } >> file grouping used for GITHUB_STEP_SUMMARY appends — satisfies shellcheck SC2129; same pattern should be applied to deploy-firebase.yml in Plan 02-01"
  - "snake_case payload enforced (commit_sha, deployed_at, deployed_by) per /api/releases/promoted route.ts wire contract — not camelCase"
  - "Node.js version pinned to '20' per plan spec (deploy-firebase.yml uses '22'; prod workflow intentionally independent)"

patterns-established:
  - "Pattern: env: block for GitHub Actions expressions in run: — pass all ${{ inputs.* }}, ${{ github.* }}, ${{ steps.*.outputs.* }} via env vars, never inline in shell"
  - "Pattern: prod deploy tag format prod-v{VERSION}-{TIMESTAMP} — distinguishes from dev deploy tags"

requirements-completed: [WORKFLOW-02]

# Metrics
duration: 8min
completed: 2026-05-05
---

# Phase 02 Plan 02: Deploy Production Workflow Summary

**New `deploy-prod.yml` reusable workflow with FAH main-branch rollout and snake_case POST to `/api/releases/promoted` (GATE-12 round-trip close)**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-05-05T02:07:00Z
- **Completed:** 2026-05-05T02:15:49Z
- **Tasks:** 1
- **Files modified:** 1 created

## Accomplishments

- Created `deploy-prod.yml` (203 lines) from scratch in `MyAlterLego/shared-workflows` on `feat/v2-admin-callbacks` branch
- Full `workflow_call` interface: `firebase_project_id` (required), `app_hosting_backend`, `app_url`, `admin_callback_url` inputs + `FIREBASE_SA_KEY` + `ADMIN_API_TOKEN` secrets
- FAH rollout via `firebase apphosting:rollouts:create <backend> --git-branch main --non-interactive`
- Notify admin step with `continue-on-error: true`, empty-token guard, snake_case payload (`commit_sha`, `deployed_at`, `deployed_by`), both HTTP 200 and 201 accepted
- actionlint exits 0 — all shell expressions moved to `env:` block; grouping redirects satisfy shellcheck SC2086 + SC2129

## Task Commits

1. **Task 1: Create deploy-prod.yml from scratch** — `3c7efb8` (feat)

## Files Created/Modified

- `~/claude/MyAlterLego/shared-workflows/.github/workflows/deploy-prod.yml` — New 203-line reusable prod-deploy workflow

## Snake_case Verification

```
grep -q '"commit_sha"' deploy-prod.yml  → OK: present
grep -q '"deployed_at"' deploy-prod.yml → OK: present
grep -q '"deployed_by"' deploy-prod.yml → OK: present
grep -q '"commitSha"' deploy-prod.yml   → OK: NOT found (no camelCase leakage)
```

Payload line in workflow:
```bash
PAYLOAD=$(printf '{"version":"%s","commit_sha":"%s","deployed_at":"%s","deployed_by":"%s"}' \
  "$APP_VERSION" "$COMMIT_SHA" "$DEPLOYED_AT" "$GITHUB_ACTOR")
```

## Actionlint Result

`actionlint .github/workflows/deploy-prod.yml` → exits 0 (no errors)

Fixes applied during deviation handling:
- Moved all `${{ inputs.* }}`, `${{ github.* }}`, `${{ steps.*.outputs.* }}` expressions into `env:` blocks
- Replaced individual `>> $GITHUB_STEP_SUMMARY` appends with `{ } >> "$GITHUB_STEP_SUMMARY"` group syntax

## Branch/Push Status

- Committed on `feat/v2-admin-callbacks` as `3c7efb8`
- Branch NOT pushed to remote — Plan 02-03 handles push + v2 tag
- `git remote -v` target: `origin https://github.com/MyAlterLego/shared-workflows.git`

## Decisions Made

- All `${{ }}` expressions moved to `env:` blocks in `run:` steps — required for actionlint/shellcheck compliance. This is cleaner than inline expressions and should be the standard pattern for all future shared-workflows steps.
- `{ } >> file` grouping used for all multi-line `$GITHUB_STEP_SUMMARY` appends — satisfies SC2129 and is more maintainable.
- Node.js version '20' per plan spec (not bumped to '22' to match deploy-firebase.yml — prod workflow is independent; can be aligned in a future cleanup).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed actionlint SC2086/SC2129 shellcheck failures**
- **Found during:** Task 1, post-write actionlint run
- **Issue:** Plan's exact file content used inline `${{ }}` expressions in `run:` blocks. actionlint (via shellcheck) flagged SC2086 (unquoted variables) and SC2129 (individual redirects) — exits 1, blocking acceptance criteria.
- **Fix:** Moved all GitHub Actions expressions to `env:` blocks on the affected steps; replaced individual `>> $GITHUB_STEP_SUMMARY` echoes with `{ } >> "$GITHUB_STEP_SUMMARY"` group syntax.
- **Files modified:** `.github/workflows/deploy-prod.yml`
- **Verification:** `actionlint .github/workflows/deploy-prod.yml` exits 0; all 10 acceptance criteria grep checks pass.
- **Committed in:** `3c7efb8` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — bug in plan's exact content causing lint failure)
**Impact on plan:** Functionally identical to plan spec — only shell variable sourcing changed from inline `${{ }}` to `env:` vars. No behavior change. Required for actionlint acceptance criterion.

## Issues Encountered

- Plan 02-01 (parallel) had not yet pushed `feat/v2-admin-callbacks` to remote, but the branch existed locally. Confirmed with `git branch -a` and checked out the existing local branch. No conflict.

## User Setup Required

None — this plan creates shared-workflows YAML only. No secrets, no DB changes, no admin code changes.

## Next Phase Readiness

- `deploy-prod.yml` committed on `feat/v2-admin-callbacks` alongside Plan 02-01's `deploy-firebase.yml` changes
- Plan 02-03 can push the branch + tag `v2` + bump admin's `ci-cd.yml` from `@v1` → `@v2`
- Live E2E test of the `/api/releases/promoted` callback is deferred to Plan 02-03 (post-tag, on admin canary)

---
*Phase: 02-shared-workflows-hardening*
*Completed: 2026-05-05*
