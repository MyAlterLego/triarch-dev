---
status: partial
phase: 04-promote-branch-workflow
source: [04-04-PLAN.md]
started: 2026-05-05T15:00:00Z
updated: 2026-05-05T15:00:00Z
---

## Current Test

[awaiting Phase 7.5 dev cluster + Phase 8 T+T pilot for live UAT]

## Tests

### 1. Scenario A — Clean rebase + CI + merge (Roadmap SC-1)
expected: Dispatch `promote-branch.yml@v3` against a clean feature branch (main is ahead by ≥1 commit, no conflicts). Confirm:
  - Workflow run completes with `result=merged`
  - `merge_sha` output populated
  - Target branch HEAD points at the new merge commit (`git log --first-parent` shows the `--no-ff` merge commit)
  - `promote_attempts` row inserted with `result='merged'`, `merge_sha=<sha>`, `conflict_files=[]`, `rebase_error=null`, `ci_run_url=null`
  - Workflow summary table shows green status
result: [pending — deferred to Phase 7.5/8. Code path implemented (4-job structure verified by grep); awaiting live dispatch against a sandbox consumer.]

### 2. Scenario B — Rebase conflict (Roadmap SC-2)
expected: Dispatch `promote-branch.yml@v3` against a branch with a real merge conflict. Confirm:
  - Workflow exits non-zero on the rebase job
  - `conflict_files` workflow output is **non-empty** (CRITICAL — empty value indicates the capture-before-abort regression flagged in RESEARCH Critical Finding #1)
  - `rebase_error` workflow output populated with patch context
  - `git rebase --abort` left the feature branch unmodified (verifiable via `git rev-parse <branch>` before/after)
  - `promote_attempts` row inserted with `result='conflict'`, `merge_sha=null`, `conflict_files=[...]`, `rebase_error=<text>`, `ci_run_url=null`
result: [pending — deferred. Capture-before-abort sequence is grep-verified in the YAML; live conflict scenario awaits sandbox.]

### 3. Scenario C — CI failure
expected: Dispatch `promote-branch.yml@v3` against a branch with intentionally failing tests. Confirm:
  - Rebase succeeds, CI job fails, merge job is skipped
  - `ci_run_url` workflow output populated
  - Target branch unchanged (no merge happened)
  - `promote_attempts` row inserted with `result='ci_failed'`, `merge_sha=null`, `conflict_files=[]`, `rebase_error=null`, `ci_run_url=<url>`
result: [pending — deferred. CI inlining (npm ci + build + vitest) verified structurally; live failure run awaits sandbox.]

### 4. Scenario D — Concurrency serialization (RESEARCH Pitfall 4)
expected: Dispatch `promote-branch.yml@v3` twice concurrently against two different branches both targeting `main`. Confirm:
  - Workflow's `concurrency: group: "promote-${{ inputs.target_branch }}"` queues the second run (does NOT cancel — `cancel-in-progress: false`)
  - Both runs eventually complete; `main` contains BOTH feature sets after both runs
  - Two `promote_attempts` rows, both `result='merged'`, distinct `merge_sha` values
result: [pending — deferred. Concurrency block grep-verified; live race condition awaits sandbox.]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps

None — the deferral is a conscious scope decision driven by infrastructure: live UAT requires a consumer repo with `ADMIN_API_TOKEN` Actions secret + a dev environment that can be safely abused with test branches. Phase 7.5 (Dev Cluster + Admin Dev Backend) creates that environment; Phase 8 (T+T E2E Pilot) exercises the full chain against it.

The Phase 4 implementation is verified by:
- 7 vitest tests green on `POST /api/platform/promote-callback` (Bearer auth, payload validation, DB insert)
- actionlint clean on `promote-branch.yml` (372 lines, four-job structure)
- 23 grep-verifiable acceptance criteria pass on the workflow YAML
- v3 tag live in `MyAlterLego/shared-workflows`; v1/v2 SHAs unchanged from Phase 2 records
- `promote_attempts` table live in prod CRDB (verified via `psql \d`)
- v2.3.0 deployed to `https://admin.triarch.dev` (deploy tag `deploy-main-98`); endpoint returns 401 unauthenticated as expected
