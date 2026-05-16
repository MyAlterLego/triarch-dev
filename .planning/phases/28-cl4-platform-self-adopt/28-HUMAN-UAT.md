---
phase: 28-cl4-platform-self-adopt
type: human-uat
status: pending
generated: 2026-05-16
related_summary: ./28-SUMMARY.md
---

# Phase 28: CL-4 Platform Self-Adopt — Human UAT Checklist

Plan 28-01 + 28-02 ship the code; Plan 28-03 verifies the code. **None of those steps cross a network or touch a live system.** This file enumerates every action Mike must complete for Phase 28 to be operationally live.

Work top-to-bottom — most items have a strict ordering dependency.

## Section A: Carry-Over From Phase 27 (Must Be Done First)

These items were captured in `.planning/phases/27-cl6-server-side-adoption/27-HUMAN-UAT.md` and remain pending. Plan 28's contrived dry-run depends on them.

- [ ] **A-1: Apply migration 0019 to CRDB** — Creates the `deploy_gate_check` table that Phase 27's endpoint writes to and Phase 28's gate POSTs into.
  - Where: CockroachDB cluster `triarchdev-24092.j77.aws-us-east-2.cockroachlabs.cloud:26257`, database `triarch_dev`
  - How: With production DATABASE_URL exported, run `npx drizzle-kit push` from this repo's working directory
  ```bash
  firebase apphosting:secrets:access DATABASE_URL --project triarch-dev-website
  # copy the URL, then:
  DATABASE_URL='<url-from-secret>' npx drizzle-kit push
  ```
  - Verify: `psql "$DATABASE_URL" -c "\d deploy_gate_check"` lists the expected columns (id, projectKey, targetVersion, verdict, devVersion, apiKeyHash, reason, workflowRunUrl, createdAt)
  - Also verify the composite index: `psql "$DATABASE_URL" -c "\di deploy_gate_check*"` shows `deploy_gate_check_project_created_at_idx`

- [ ] **A-2: Confirm CL6_ENFORCEMENT_MODE=warn is bound in production apphosting.yaml** (already shipped in admin v2.13.14, but confirm the FAH secret-snapshot has it)
  - Where: Firebase Console → triarch-dev-website → App Hosting → triarch-dev backend → Environment
  - Verify: `CL6_ENFORCEMENT_MODE` appears with value `warn`

## Section B: shared-workflows v8.2 Release

Plan 28-01 committed locally on branch `feat/v8.2-cl6-verdict-post` in `/Users/mikegeehan/claude/triarch/shared/shared-workflows`. These steps push, merge, and tag.

- [ ] **B-1: Push the feature branch to remote**
  ```bash
  cd /Users/mikegeehan/claude/triarch/shared/shared-workflows
  git push -u origin feat/v8.2-cl6-verdict-post
  ```

- [ ] **B-2: Open PR vs main**
  ```bash
  cd /Users/mikegeehan/claude/triarch/shared/shared-workflows
  gh pr create \
    --base main \
    --head feat/v8.2-cl6-verdict-post \
    --title "v8.2: gate-prod-version posts verdict to /api/platform/cicd/gate-verdict (CL-6)" \
    --body "Closes the CL-6 paired-verdict loop for Phase 28. Additive step inserted between Compare + Audit steps. continue-on-error: true so admin downtime never blocks deploys."
  ```

- [ ] **B-3: Merge PR to main** (squash or merge-commit; consumers pin to tag, not SHA)

- [ ] **B-4: Create annotated tag v8.2 on main**
  ```bash
  cd /Users/mikegeehan/claude/triarch/shared/shared-workflows
  git checkout main && git pull
  git tag -a v8.2 -m "v8.2: CL-6 paired-verdict POST step (additive)"
  git push origin v8.2
  ```
  - Verify: `git ls-remote --tags origin | grep v8.2` returns a hash

## Section C: Platform Repo Release (v2.13.15)

Plan 28-02 committed locally on branch `feat/cl4-self-adopt-gate`. These steps push and PR-vs-dev (per workspace CLAUDE.md — platform is a dev-promotion-path repo).

- [ ] **C-1: Push the feature branch to remote**
  ```bash
  cd /Users/mikegeehan/claude/triarch/shared/platform
  git push -u origin feat/cl4-self-adopt-gate
  ```

- [ ] **C-2: Open PR vs dev** (NOT main — workspace CLAUDE.md per-project promotion-branch rule)
  ```bash
  cd /Users/mikegeehan/claude/triarch/shared/platform
  gh pr create \
    --base dev \
    --head feat/cl4-self-adopt-gate \
    --title "v2.13.15: feat(ci-cd): wire gate-prod-version@v8.2 as needs: of prod deploy (CL-4)" \
    --body "Platform self-adopts the CL-4 gate. Depends on shared-workflows tag v8.2 (Section B must be done first)."
  ```

- [ ] **C-3: CI runs on the PR**
  - Expected: quality-gate + validate-apphosting + version job run; cl4-gate is SKIPPED (it's prod-only via `if: needs.env-select.outputs.environment == 'prod'`)
  - If any of those fail: investigate before merging

- [ ] **C-4: Merge to dev**
  - dev deploy fires automatically; cl4-gate STILL skipped (dev push); existing deploy path unaffected
  - Verify the dev deploy actually completes successfully — this proves cl4-gate doesn't accidentally fire on dev

- [ ] **C-5: Open second PR dev → main** (the promote step)
  ```bash
  cd /Users/mikegeehan/claude/triarch/shared/platform
  gh pr create --base main --head dev --title "v2.13.15: promote CL-4 self-adopt to prod" --body "Promotes the verified dev state to prod."
  ```
  - DO NOT merge this PR yet — Section D's GitHub secret must be set first.

## Section D: GitHub Actions Secret Provisioning

The gate job references `secrets.ADMIN_API_TOKEN`. Without it, every prod deploy fails at gate-time with "ADMIN_API_TOKEN not set" (a deliberate fail-loud error, not silent skip).

- [ ] **D-1: Look up the platform's apiKey from admin CRDB**
  ```bash
  # With prod DATABASE_URL exported (use firebase secret access command from Section A):
  psql "$DATABASE_URL" -c "SELECT key, name, \"apiKey\" FROM projects WHERE key = 'triarch-dev';"
  ```
  - Copy the apiKey column value (32+ char string)

- [ ] **D-2: Add the secret to MyAlterLego/triarch-dev GitHub Actions**
  - URL: https://github.com/MyAlterLego/triarch-dev/settings/secrets/actions
  - Click "New repository secret"
  - Name: `ADMIN_API_TOKEN`
  - Value: paste the apiKey from D-1
  - Click "Add secret"

- [ ] **D-3: Verify the secret name is byte-exact**
  ```bash
  gh secret list --repo MyAlterLego/triarch-dev | grep ADMIN_API_TOKEN
  ```
  - Expected: one row showing `ADMIN_API_TOKEN` with an "Updated" timestamp

## Section E: Contrived Dry-Run (INV-2 Should Block)

Verify the gate ACTUALLY blocks when invariants are violated. This is success criteria #3 from the phase definition. Run this AFTER Sections A-D are complete.

- [ ] **E-1: Create a contrived branch with a fake high version**
  ```bash
  cd /Users/mikegeehan/claude/triarch/shared/platform
  git checkout -b chore/contrived-gate-test main
  npm version --no-git-tag-version 9.9.9
  git add package.json package-lock.json 2>/dev/null
  git commit -m "vchore: contrived high version to prove INV-2 blocks"
  git push -u origin chore/contrived-gate-test
  ```

- [ ] **E-2: Open PR vs main and merge** (since main triggers prod deploy + gate)
  - WARNING: only do this on the contrived branch — merging this commit means a prod deploy ATTEMPT will fire, which will fail at gate-time. That is the test.

- [ ] **E-3: Verify the gate FAILS with INV-2**
  - GitHub Actions UI → the merged commit's workflow run → cl4-gate job → expected `::error::INV-2: target v9.9.9 is HIGHER than current dev v...`
  - The deploy job should be skipped (gate failed)
  ```bash
  gh run view <run-id> --json conclusion | jq -r .conclusion
  # Expected: "failure"
  ```

- [ ] **E-4: Verify the deploy_gate_check row was written**
  ```bash
  psql "$DATABASE_URL" -c "SELECT projectKey, targetVersion, verdict, devVersion FROM deploy_gate_check WHERE projectKey='triarch-dev' ORDER BY createdAt DESC LIMIT 1;"
  ```
  - Expected: targetVersion=`v9.9.9`, verdict=`fail`

- [ ] **E-5: Roll back the contrived bump**
  ```bash
  # Revert the contrived commit on main:
  git checkout main && git pull
  git revert <contrived-sha> -m 1 --no-edit
  git push origin main
  # This restores package.json back to 2.13.15
  ```

## Section F: Real Prod Deploy (v2.13.15+ Should Pass)

The actual "did we ship it" test. Run this after all of Sections A-E are complete.

- [ ] **F-1: Ensure dev has seen v2.13.15** (Section C-4 already deployed it to dev; this confirms the version-snapshot endpoint reports it)
  ```bash
  curl -s -H "Authorization: Bearer $ADMIN_API_TOKEN" https://admin.triarch.dev/api/platform/version-snapshot | jq '.dev'
  ```
  - Expected: `{"version":"v2.13.15","deployed_at":"..."}`

- [ ] **F-2: Merge the dev → main PR from Section C-5**
  - Prod deploy fires; cl4-gate runs the v8.2 workflow
  - Expected: gate PASSES (target=v2.13.15 matches dev=v2.13.15, > prod, dev age > 300s by now)
  - Expected: deploy job runs and ships

- [ ] **F-3: Verify the deploy_gate_check row for v2.13.15 was written with verdict=pass**
  ```bash
  psql "$DATABASE_URL" -c "SELECT targetVersion, verdict, devVersion, workflowRunUrl FROM deploy_gate_check WHERE projectKey='triarch-dev' AND targetVersion='v2.13.15' ORDER BY createdAt DESC LIMIT 1;"
  ```
  - Expected: targetVersion=`v2.13.15`, verdict=`pass`, devVersion=`v2.13.15`, workflowRunUrl=`https://github.com/MyAlterLego/triarch-dev/actions/runs/...`

- [ ] **F-4: Verify the release_logs row landed** (CL-6 pre-check should pass in warn mode regardless, but here we confirm the paired-verdict was found and the release was NOT 409'd)
  ```bash
  psql "$DATABASE_URL" -c "SELECT version, env, \"deployedAt\" FROM release_logs WHERE \"projectKey\"='triarch-dev' ORDER BY \"deployedAt\" DESC LIMIT 1;"
  ```
  - Expected: version=`v2.13.15`, env=`prod`

## Section G: CL6_ENFORCEMENT_MODE Flip (Operational — Not in Phase 28 Scope)

After 7 days of warn-mode telemetry showing zero false positives (per Phase 27 D-Rollout), flip the enforcement mode. Capture this here so it's not lost.

- [ ] **G-1: After 7-day grace window**, flip the FAH binding:
  - Where: Firebase Console → triarch-dev-website → App Hosting → triarch-dev backend → Environment
  - Change `CL6_ENFORCEMENT_MODE` value from `warn` to `enforce`
  - Trigger a rollout (or wait for next deploy)

- [ ] **G-2: Sanity check** — re-run a normal prod deploy. Expected: still ships (gate + paired verdict + release ingest all happy)

- [ ] **G-3: Compliance matrix UI** (Phase 35) gains a CL-6 column once enforce mode is live

## HUMAN-UAT Items Completion Criteria

Phase 28 is operationally complete when:

- [ ] Sections A through F are all checked
- [ ] One green prod deploy of v2.13.15+ has happened via the gate
- [ ] The corresponding `deploy_gate_check` row is verifiable in CRDB (verdict=pass)
- [ ] The corresponding `release_logs` row is verifiable in CRDB (env=prod)
- [ ] Section G is a follow-up — does NOT block Phase 32 starting

After completion, mark CL4-01 = Complete in `.planning/REQUIREMENTS.md` and Phase 28 status = Complete in `.planning/STATE.md` + `.planning/ROADMAP.md`.
