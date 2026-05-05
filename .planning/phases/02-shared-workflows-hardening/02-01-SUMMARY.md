---
phase: 02-shared-workflows-hardening
plan: "01"
subsystem: shared-workflows
tags: [github-actions, firebase-app-hosting, admin-callback, branch-preview, workflow-versioning]
dependency_graph:
  requires: []
  provides: [deploy-firebase.yml@v2-inputs, admin-dev-callback, branch-aware-rollout]
  affects: [WORKFLOW-01, WORKFLOW-03, Phase 02-03 (push + tag)]
tech_stack:
  added: [actionlint 1.7.12]
  patterns: [continue-on-error callback, empty-token guard, mutually-exclusive step conditions, metadata JSONB for previewUrl]
key_files:
  created: []
  modified:
    - ~/claude/MyAlterLego/shared-workflows/.github/workflows/deploy-firebase.yml
decisions:
  - "previewUrl stored in metadata JSONB (not new column) — keeps Phase 2 schema-free; JSONB already accepted by ingest route (D-13)"
  - "ADMIN_API_TOKEN required: true in secrets block despite GitHub silently substituting empty string — explicit guard at runtime catches missing token (Pitfall 2)"
  - "Two mutually-exclusive apphosting steps (main vs branch) rather than single conditional step — cleaner if-expression per actionlint, matches Pattern 3 from research"
  - "Notify admin step placed AFTER Deployment summary (last step) to ensure callback fires only after confirmed rollout (Pitfall 1)"
  - "camelCase payload fields: commitSha, deployedAt, releasedBy — matches /api/platform/ingest/release-logs contract; distinct from prod callback snake_case (Pitfall 3)"
metrics:
  duration_minutes: 2
  tasks_completed: 2
  files_modified: 1
  completed_date: "2026-05-05"
requirements: [WORKFLOW-01, WORKFLOW-03]
---

# Phase 02 Plan 01: shared-workflows deploy-firebase.yml v2 Inputs + Admin Dev Callback Summary

deploy-firebase.yml extended with git_branch input for branch-aware FAH rollouts + Notify admin (dev deploy) step posting camelCase callback to /api/platform/ingest/release-logs.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Wave 0: clone shared-workflows + install actionlint + create feat branch | (no code change) | `~/claude/MyAlterLego/shared-workflows/` |
| 2 | Add git_branch input + ADMIN_API_TOKEN secret + branch-aware rollout steps + admin callback | `407008b` | `.github/workflows/deploy-firebase.yml` |

## What Was Built

### Clone + Setup (Task 1)

- `~/claude/MyAlterLego/shared-workflows/` cloned from `MyAlterLego/shared-workflows`
- Branch created: `feat/v2-admin-callbacks`
- actionlint 1.7.12 installed via Homebrew
- Baseline lint: exit code 1, pre-existing SC2086/SC2129 info/style warnings only
- Tags confirmed: v1, v1.1, v1.2, v1.3, v1.4 present — v2 NOT present

### deploy-firebase.yml Changes (Task 2)

**Lines modified/added:** 106 insertions, 2 deletions (net +104 lines)

**Change A — New `on.workflow_call.inputs` (lines 18-27):**
- `git_branch` (string, default: `'main'`): drives branch-aware FAH rollout
- `admin_callback_url` (string, default: `'https://admin.triarch.dev'`): overridable callback base URL

**Change A — New `on.workflow_call.secrets` (lines 28-35):**
- `FIREBASE_SA_KEY` (required: true): preserved from v1
- `GH_PAT` (required: false): preserved from v1
- `ADMIN_API_TOKEN` (required: true): new; per-project Bearer token from `projects.apiKey`

**Change B — Replace single "Deploy via App Hosting" with two mutually-exclusive steps (lines 98-120):**
- `Deploy via App Hosting (main branch)` — `if: inputs.deploy_command == 'apphosting' && (inputs.git_branch == '' || inputs.git_branch == 'main')` — hardcoded `--git-branch main`
- `Deploy via App Hosting (branch preview)` — `if: inputs.deploy_command == 'apphosting' && inputs.git_branch != '' && inputs.git_branch != 'main'` — dynamic `--git-branch "${{ inputs.git_branch }}"`

**Change C — Append "Notify admin (dev deploy)" step (lines 146-216):**
- `continue-on-error: true` — deploy success takes precedence over callback
- Empty-token guard: `[ -z "$ADMIN_API_TOKEN" ]` → `::warning::ADMIN_API_TOKEN not set` + `exit 0`
- Branch resolution: `inputs.git_branch` preferred, falls back to `github.ref_name`
- `previewUrl` construction: for non-main branches, `https://${SANITIZED}--${BACKEND}.us-central1.hosted.app` (slash→dash via `tr '/' '-'`)
- Payload: camelCase — `commitSha`, `deployedAt`, `releasedBy`; `previewUrl` inside `metadata` JSONB
- Response capture: `-o "$RESP_BODY" -w "%{http_code}"` — surfaces 400 error body in logs
- `$GITHUB_STEP_SUMMARY` table: endpoint, HTTP status, branch, version, commit, previewUrl (if present)

## Actionlint Results

**Baseline (before changes):** Exit 1 — SC2086 (info) × 7, SC2129 (style) × 1 at lines 45 and 106

**Final (after changes):** Exit 1 — SC2086 (info) × 19, SC2129 (style) × 2 at lines 63, 138, 152

All new warnings are the same SC2086/SC2129 info/style level as the baseline — caused by `${{ inputs.X }}` expressions that shellcheck sees as unquoted shell variables. This is an accepted GitHub Actions pattern; the `${{ }}` expansion happens at the Actions layer before shell execution. No structural actionlint errors introduced.

**YAML syntax:** `python3 -m yamllint` exit code 0 — no YAML errors.

## v2 Tag Confirmation

```
git tag -l | grep v2 → (empty) → v2 NOT yet tagged
```

As required by D-10 and Pitfall 5: tag `v2` is created in Plan 02-03 after both 02-01 (deploy-firebase.yml) and 02-02 (deploy-prod.yml) are complete and validated together.

## Deviations from Plan

### Observation: deploy-prod.yml Already Present (parallel agent 02-02)

**Found during:** Task 1 (git status after clone)

**Issue:** `deploy-prod.yml` appeared as an untracked file in the working directory — created by the parallel 02-02 agent executing on the same feature branch before this agent ran.

**Impact:** None on this plan's scope. This plan only stages and commits `deploy-firebase.yml`. The `deploy-prod.yml` file belongs to Plan 02-02 and was correctly left untracked by this agent. Plan 02-02 agent handles its own commit.

**Classification:** Out-of-scope observation, no action taken.

## Known Stubs

None — all wiring is complete for this plan's scope. Live E2E test of the callback (HTTP 201 from admin + DB row in `release_logs`) is explicitly deferred to Plan 02-03, which handles the push, v2 tag, and end-to-end validation.

## Self-Check: PASSED

- [x] `~/claude/MyAlterLego/shared-workflows/.github/workflows/deploy-firebase.yml` exists
- [x] Commit `407008b` exists on `feat/v2-admin-callbacks`
- [x] `git_branch` input present (6 occurrences)
- [x] `ADMIN_API_TOKEN` secret declared
- [x] Two mutually-exclusive apphosting steps present
- [x] `Notify admin (dev deploy)` step present with `continue-on-error: true`
- [x] `ADMIN_API_TOKEN not set` guard present
- [x] camelCase payload fields: `commitSha`, `deployedAt`, `releasedBy`
- [x] `previewUrl` in `metadata` JSONB — line 177: `METADATA_JSON="{\"previewUrl\":\"${PREVIEW_URL}\"}"` + line 181 PAYLOAD uses `"metadata":%s`
- [x] Branch NOT pushed — 2 local commits ahead of origin/main
- [x] v2 tag NOT applied
