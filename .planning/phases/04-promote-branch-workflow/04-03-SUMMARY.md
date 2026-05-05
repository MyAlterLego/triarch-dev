---
phase: 04-promote-branch-workflow
plan: 03
subsystem: shared-workflows
tags: [github-actions, reusable-workflow, rebase, ci, merge, callback, promote-branch]

# Dependency graph
requires:
  - phase: 04-promote-branch-workflow
    plan: 01
    provides: "promoteAttempts schema and migration 0012 — callback endpoint target"
  - phase: 04-promote-branch-workflow
    plan: 02
    provides: "POST /api/platform/promote-callback endpoint — receives workflow callback"
provides:
  - "promote-branch.yml in MyAlterLego/shared-workflows feat/promote-branch branch"
  - "Four-job reusable workflow: rebase, ci, merge, callback (WORKFLOW-04, WORKFLOW-05)"
affects: [04-04-e2e-uat]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Capture-before-abort: git diff --name-only --diff-filter=U captured BEFORE git rebase --abort"
    - "Inline CI: npm ci + npm run build + npx vitest run (nested workflow_call impossible)"
    - "Concurrency declared inside reusable workflow — not propagated from caller"
    - "callback job if: always() — fires for all terminal states (merged/conflict/ci_failed)"
    - "jq for safe JSON array construction from newline-separated conflict file list"

key-files:
  created:
    - ~/claude/MyAlterLego/shared-workflows/.github/workflows/promote-branch.yml
  modified: []

key-decisions:
  - "Inline CI (npm ci + build + vitest) rather than nested quality-gate.yml@v2 call — GitHub Actions does not support nested workflow_call (RESEARCH Critical Finding #2)"
  - "Conflict files captured BEFORE git rebase --abort — abort clears working tree (RESEARCH Critical Finding #1)"
  - "Concurrency group uses inputs.target_branch (not github.event which is caller's event in workflow_call context)"
  - "RESEARCH-recommended four-job structure: rebase, ci, merge, callback with callback if:always()"
  - "jq -R -s -c used for conflict_files JSON array to safely handle newlines and special characters"
  - "GH_PAT secret declared optional in workflow_call — allows consumers to override github.token for branch protection bypass"
  - "All CI secrets forwarded via explicit secrets: block in workflow_call (not secrets: inherit which requires consumer to propagate)"

requirements-completed: [WORKFLOW-04]

# Metrics
duration: 10min
completed: 2026-05-05
---

# Phase 4 Plan 3: promote-branch.yml Reusable Workflow Summary

**Four-job GitHub Actions reusable workflow (rebase + inline CI + merge + callback) with capture-before-abort conflict detection and structured promote result callback to admin — committed to shared-workflows feat/promote-branch, awaiting PR + merge + v3 tag**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-05-05T14:20:00Z
- **Completed:** 2026-05-05T14:35:00Z
- **Status:** COMPLETE — Task 1 (file created, committed `1db5a3d`); Task 2 (PR merged, v3 tagged) executed by orchestrator at Mike's request
- **Tasks:** 2/2 complete
- **Files created:** 1 (in shared-workflows repo)

## Accomplishments

- Created `promote-branch.yml` at `~/claude/MyAlterLego/shared-workflows/.github/workflows/promote-branch.yml`
- File is 372 lines — well above the 180-line minimum
- All 23 acceptance criteria checks pass (verified with grep commands)
- actionlint passes with zero errors (yamllint not installed locally)
- Both RESEARCH critical corrections implemented:
  - Critical Finding #1: conflict files captured BEFORE `git rebase --abort`
  - Critical Finding #2: CI inlined as npm ci + build + vitest (no nested workflow_call)
- Committed on `feat/promote-branch` branch in shared-workflows (commit `1db5a3d`)

## Task Commits (shared-workflows repo)

1. **Task 1: Create promote-branch.yml** — `1db5a3d` (feat) — `~/claude/MyAlterLego/shared-workflows/feat/promote-branch`
2. **Task 2: PR merged + v3 tagged** — squash-merge commit `bed2ebb` on main; `v3` tag pushed (annotated tag object SHA `70805e4d` → commit `bed2ebb`)

## Task 2 Evidence (cross-repo operations)

- **PR:** https://github.com/MyAlterLego/shared-workflows/pull/5 — merged via `gh pr merge 5 --squash --delete-branch`
- **Main HEAD after merge:** `bed2ebb85f8204df2a20515d741a03f4f0c6e5ac` (was `915cc2f`)
- **v3 tag:** annotated tag object `70805e4da2152032a00bfe4595d3943058fe5ba9` → commit `bed2ebb`
- **v1 unchanged:** tag object SHA `85b130bfecb02b22c4de40013d27878a5192374b` (matches Phase 2 records)
- **v2 unchanged:** tag object SHA `b2c2e5505f2c6564e68922a6a44a932d04f7eb68` → commit `915cc2f` (matches Phase 02-VERIFICATION.md record)
- **All tags now visible:** `v1, v1.1, v1.2, v1.3, v1.4, v2, v3`
- **No CI checks** were configured on shared-workflows PRs (workflows-only repo, no consumer code) — actionlint validated locally before push
- **D-15 verified:** No changes to admin's `package.json` or `.github/workflows/ci-cd.yml` for this plan (admin app changes for v2.3.0 are from Plan 04-02, separate concern)

## Files Created/Modified

- `~/claude/MyAlterLego/shared-workflows/.github/workflows/promote-branch.yml` — New file, 372 lines, four-job structure per RESEARCH Architecture Patterns §Recommended Workflow Structure

## Workflow Structure

Four jobs in dependency order:

```
rebase  →  ci  →  merge  →  callback (always)
```

**Job 1: rebase** — Checkout with full history, fetch target branch, rebase with capture-before-abort sequence. On success: force-push rebased branch (`--force-with-lease`), output `rebased_sha`. On failure: capture `conflict_files` and `rebase_error` BEFORE abort, exit 1.

**Job 2: ci** — Inline `npm ci && npm run build && npx vitest run`. Mirrors quality-gate.yml env block (DATABASE_URL, NEXTAUTH_SECRET, etc.). Outputs `run_url` for ci_failed callback.

**Job 3: merge** — Checkout target_branch with full history, pull latest, fetch rebased branch, `git merge --no-ff origin/$BRANCH`, push. Outputs `merge_sha`.

**Job 4: callback** — `if: always()`. Determines RESULT enum from `needs.<job>.result`: merge.success → "merged", rebase.failure → "conflict", else → "ci_failed". Builds jq-safe JSON payload, POSTs to `/api/platform/promote-callback` with Bearer auth. Empty-token guard + `continue-on-error: true` per Phase 2 pattern.

## Callback RESULT Determination

```
if needs.merge.result == "success"      → RESULT="merged"
elif needs.rebase.result == "failure"   → RESULT="conflict"
else                                    → RESULT="ci_failed"
```

## Acceptance Criteria Verification

All checks pass:

| Check | Result |
|-------|--------|
| File exists | PASS |
| `^name: Promote Branch` count = 1 | 1 |
| `workflow_call:` count = 1 | 1 |
| `workflow_dispatch:` count = 1 | 1 |
| `^concurrency:` count = 1 | 1 |
| `group: "promote-` in concurrency | 1 |
| `cancel-in-progress: false` | 1 |
| Four jobs (rebase/ci/merge/callback) | 4 |
| `if: always()` on callback | 1 |
| Empty-token guard | 1 |
| `continue-on-error: true` | 1 |
| diff before abort (awk order check) | PASS (line 155 < 159) |
| No nested quality-gate.yml call | 0 |
| `npm ci` | 2 |
| `npm run build` | 1 |
| `npx vitest run` | 1 |
| `/api/platform/promote-callback` | 3 |
| `merge_sha` occurrences >= 2 | 6 |
| `conflict_files` occurrences >= 2 | 6 |
| `rebase_error` occurrences >= 2 | 4 |
| `ci_run_url` occurrences >= 2 | 2 |
| `contents: write` | 1 |
| Line count >= 180 | 372 |
| actionlint: zero errors | PASS |

## Decisions Made

- **Inline CI over nested workflow_call** — GitHub Actions architectural limitation: a `workflow_call`-triggered workflow cannot itself call another workflow via `workflow_call`. Inline `npm ci + build + vitest` preserves the intent of D-06 (same checks) without violating this constraint.
- **Capture-before-abort** — `git diff --name-only --diff-filter=U` returns empty after `git rebase --abort` (abort resets working tree). The correct sequence: detect non-zero exit → capture → abort. D-04's "after abort" note in CONTEXT.md was incorrect per RESEARCH Critical Finding #1.
- **jq for conflict_files JSON** — Newline-separated conflict file list converted to JSON array via `jq -R -s -c 'split("\n") | map(select(length > 0))'` — safe for filenames with special characters, quotes, spaces.
- **Explicit secrets: block in workflow_call** — Rather than a bare `secrets: inherit` in the `on: workflow_call:` block, each secret is declared explicitly. This makes the interface contract clear and documented for Phase 5 consumers.
- **force-with-lease on rebase push** — After successful rebase, `git push --force-with-lease origin $BRANCH` updates the remote branch ref so the merge job checks out the rebased state. Avoids Pitfall 2 (Detached HEAD After Rebase).

## Deviations from Plan

### Auto-fixed Issues

None.

### Structural Deviations

**1. [Enhancement] Explicit secrets: block replaces implied secrets: inherit**
- **Found during:** Task 1 — writing the workflow_call trigger block
- **Issue:** Plan's example showed `secrets: inherit` at job level but didn't specify the `on.workflow_call.secrets:` block. actionlint requires explicit declaration for each secret used from `workflow_call` callers.
- **Fix:** Added explicit `secrets:` block under `on.workflow_call` with all CI secrets declared (DATABASE_URL, NEXTAUTH_SECRET, etc.) matching quality-gate.yml's env block. Required to make the contract clear and actionlint-compatible.
- **Commit:** 1db5a3d

**2. [YAML style] Arrow in merge job name**
- Plan's example used `→` (Unicode arrow) in job names. actionlint allows this but some terminals render poorly.
- Fix: Used `->` ASCII arrow instead. No behavioral change.
- Commit: 1db5a3d

## Pending: Task 2 (Human Checkpoint)

**Status: AWAITING HUMAN ACTION**

Mike must perform these steps from `~/claude/MyAlterLego/shared-workflows/`:

```bash
# 1. Push the feature branch
cd ~/claude/MyAlterLego/shared-workflows
git push -u origin feat/promote-branch

# 2. Create PR
gh pr create --title "feat: promote-branch.yml reusable workflow" --body "Phase 4 of v2.0 milestone (admin repo). Reusable rebase + CI + merge + callback workflow. WORKFLOW-04, WORKFLOW-05.

Critical implementation notes:
- Inline CI (npm ci + build + vitest) — nested workflow_call to quality-gate.yml is not supported by GitHub Actions
- Conflict files captured BEFORE git rebase --abort (abort clears working tree)
- Concurrency declared inside this workflow (does not propagate from caller)
- Callback always runs to report all terminal states"

# 3. Verify GitHub's actionlint passes in PR checks

# 4. Merge PR (squash or merge commit — either is fine for a workflow-only file)
gh pr merge --squash --delete-branch

# 5. Tag v3 at the merge commit
git checkout main
git pull origin main
MAIN_SHA=$(git rev-parse HEAD)
git tag v3 "$MAIN_SHA" -m "v3: promote-branch.yml workflow added (WORKFLOW-04, WORKFLOW-05)"
git push origin v3

# 6. Verify v1 and v2 tags unchanged (D-14)
gh api repos/MyAlterLego/shared-workflows/git/refs/tags/v1 --jq '.object.sha'
gh api repos/MyAlterLego/shared-workflows/git/refs/tags/v2 --jq '.object.sha'
```

Resume by typing: `"tagged"` or `"issues: <description>"`

## Pre-conditions for Plan 04-04 UAT

1. **Consumer repo must have `ADMIN_API_TOKEN` Actions secret** — workflow will skip callback silently if not set (empty-token guard)
2. **No branch protection on main that blocks `github-actions[bot]` push** — `promote-branch.yml` uses `github.token` (with `permissions: contents: write`) to push rebased branch and merge commit; branch protection requiring PR reviews will block this
3. **`v3` tag must exist on shared-workflows** — consumer's `ci-cd.yml` (or stub workflow) must reference `promote-branch.yml@v3` (Phase 5 consumer ref bump)
4. **`promote_attempts` table must exist in production CockroachDB** — Plan 04-01 deferred the db:push; must be run before Plan 04-04 callback validation
5. **Admin app must be deployed** — Plan 04-02's `/api/platform/promote-callback` endpoint must be live at `admin.triarch.dev`

## Known Stubs

None — this plan delivers a YAML file only. No UI or data-fetching components.

## Self-Check

See below after STATE.md update.

## Self-Check: PASSED

- FOUND: ~/claude/MyAlterLego/shared-workflows/.github/workflows/promote-branch.yml
- FOUND: commit 1db5a3d in shared-workflows feat/promote-branch branch
- FOUND: .planning/phases/04-promote-branch-workflow/04-03-SUMMARY.md
