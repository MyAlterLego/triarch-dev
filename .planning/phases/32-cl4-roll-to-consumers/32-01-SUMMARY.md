---
phase: 32
plan: "01"
subsystem: darksouls-ci-cd
tags: [cl4, gate-prod-version, ci-cd, consumer-adoption]
dependency_graph:
  requires: [phase-28-platform-self-adopt]
  provides: [darksouls-cl4-gate]
  affects: [darksouls-rpg-prod-deploys]
tech_stack:
  added: [gate-prod-version.yml@v8.2]
  patterns: [version-job-extract, cl4-gate-needs-pattern]
key_files:
  modified:
    - /Users/mikegeehan/claude/triarch/shared/darksouls/.github/workflows/ci-cd.yml
    - /Users/mikegeehan/claude/triarch/shared/darksouls/package.json
key_decisions:
  - "project_key: darksouls-rpg matches verified admin DB row"
  - "version job added before cl4-gate, mirrors platform Phase 28 pattern exactly"
  - "deploy.if extended with cl4-gate skipped clause so dev pushes are unaffected"
  - "version bumped v7.7.12 -> v7.7.14 (file was at v7.7.12, target per instructions was v7.7.14)"
metrics:
  duration: "< 5 min"
  completed: "2026-05-16"
  tasks_completed: 1
  files_modified: 2
---

# Phase 32 Plan 01: Darksouls CL-4 Consumer Gate Summary

**One-liner:** Wire `gate-prod-version.yml@v8.2` into darksouls ci-cd.yml as prod-only `cl4-gate` job with `version` extraction job, blocking `deploy` via `needs:` — mirrors Phase 28 platform self-adopt pattern exactly.

## What Was Done

Added CL-4 gate enforcement to the `darksouls-rpg` repository's CI/CD workflow:

1. **`version` job** — added before `cl4-gate` (mirrors platform Phase 28 pattern). Extracts `package.json` version once via `node -p "require('./package.json').version"`, outputs as `version` for downstream `cl4-gate` consumption.

2. **`cl4-gate` job** — calls `triarchsecurity/shared-workflows/.github/workflows/gate-prod-version.yml@v8.2` with:
   - `project_key: darksouls-rpg`
   - `target_version: ${{ needs.version.outputs.version }}`
   - `secrets.ADMIN_API_TOKEN: ${{ secrets.ADMIN_API_TOKEN }}`
   - `if: needs.env-select.outputs.environment == 'prod'` — prod-only guard

3. **`deploy` job** — updated `needs:` to include `[quality-gate, schema-check, version, env-select, verify-dev-deployed, gate-prod, cl4-gate]`. Extended `if:` condition with `(needs.cl4-gate.result == 'success' || needs.cl4-gate.result == 'skipped')` so dev pushes are unaffected.

4. **`package.json`** — bumped `7.7.12 → 7.7.14` (file was at v7.7.12 at execution time; instructions targeted v7.7.14).

## Branch and Commit

- **Repo:** `/Users/mikegeehan/claude/triarch/shared/darksouls`
- **Branch:** `feat/cl4-consumer-gate` (off `main`)
- **Commit:** `12c007d` — `v7.7.14: feat(ci-cd): wire gate-prod-version@v8.2 as needs of deploy-prod (CL-4)`
- **Commit flag:** `--no-verify` (parallel executor context per instructions)
- **Pushed:** No — local commit only

## Verification Checks Passed

- `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci-cd.yml'))"` → exit 0
- `grep "project_key: darksouls-rpg" ci-cd.yml` → 1 match at line `project_key: darksouls-rpg`
- `cl4-gate` job present at `@v8.2`
- `deploy.needs` includes `cl4-gate`
- `deploy.if` includes `cl4-gate.result == 'success' || cl4-gate.result == 'skipped'`
- `package.json` version is `7.7.14`

## Deviations from Plan

### Auto-noted: Version was v7.7.12 not v7.7.13

- **Found during:** Task execution
- **Issue:** `package.json` showed `"version": "7.7.12"` at execution time; the critical constraints referenced `v7.7.13 → v7.7.14`. Git snapshot in the session header showed v7.7.13 but the file on disk was v7.7.12 (likely from another executor branch or snapshot timing).
- **Fix:** Bumped from v7.7.12 to v7.7.14 as instructed — the target version v7.7.14 and commit message are correct per the plan objective.
- **Files modified:** `package.json`

## Human UAT Required

- **ADMIN_API_TOKEN secret** — must be added to the `darksouls-rpg` GitHub repository via Settings → Secrets and Variables → Actions → New repository secret. Value = the Bearer token from admin's `projects.apiKey` column for `project_key=darksouls-rpg`. Without this, the `cl4-gate` job will fail at runtime.
- **v8.2 tag publish** — `triarchsecurity/shared-workflows` v8.2 tag must be published (pending from Phase 28 HUMAN-UAT). If not yet published, the `cl4-gate` job will fail with "workflow not found".

## Known Stubs

None — this plan wires existing infrastructure. The `cl4-gate` job calls `gate-prod-version.yml@v8.2` which enforces INV-1..INV-5 invariants against the live admin API. No placeholder logic was introduced.

## Self-Check

- [x] `/Users/mikegeehan/claude/triarch/shared/darksouls/.github/workflows/ci-cd.yml` modified and YAML-validated
- [x] `/Users/mikegeehan/claude/triarch/shared/darksouls/package.json` bumped to 7.7.14
- [x] Commit `12c007d` exists on `feat/cl4-consumer-gate` branch in darksouls repo
- [x] `project_key: darksouls-rpg` present (1 match)
- [x] `cl4-gate` in deploy `needs:`
- [x] `cl4-gate.result == 'skipped'` clause in deploy `if:`
