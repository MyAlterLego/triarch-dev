---
phase: 32
plan: "02"
subsystem: tmi-ci-cd
tags: [cl4, gate-prod-version, ci-cd, consumer-adoption, v2.13.10-backpatch]
dependency_graph:
  requires: [phase-28-platform-self-adopt]
  provides: [tmi-cl4-gate, tmi-v2.13.10-backpatch]
  affects: [tmi-prod-deploys]
tech_stack:
  added: [gate-prod-version.yml@v8.2]
  patterns: [version-job-extract, cl4-gate-needs-pattern, corrected-merge-base-direction]
key_files:
  modified:
    - /Users/mikegeehan/claude/triarch/shared/tmi/.github/workflows/ci-cd.yml
    - /Users/mikegeehan/claude/triarch/shared/tmi/package.json
key_decisions:
  - "project_key: triarch-dev-tmi matches verified admin DB row"
  - "version job added; cl4-gate wired to needs [env-select, version], prod-only"
  - "deploy.if rewritten with always() prefix and cl4-gate skipped clause so dev pushes unaffected"
  - "verify-dev-deployed direction flipped: HEAD ancestor of origin/dev -> origin/dev ancestor of HEAD (v2.13.10)"
  - "[hotfix-bypass-dev] token and all surrounding escape-hatch logic removed"
  - "version bumped 4.44.1 -> 4.44.3 (main was at 4.44.1; target per instructions is 4.44.3)"
metrics:
  duration: "< 5 min"
  completed: "2026-05-16"
  tasks_completed: 1
  files_modified: 2
---

# Phase 32 Plan 02: TMI CL-4 Consumer Gate + v2.13.10 Back-patch Summary

**One-liner:** CL-4 gate wired via gate-prod-version@v8.2 with v2.13.10 merge-base direction fix and hotfix-bypass-dev token removal.

## What Was Done

### Task 1: Wire cl4-gate + back-patch v2.13.10 framework

**Branch:** `feat/cl4-consumer-gate` off `main` in `/Users/mikegeehan/claude/triarch/shared/tmi`

**Commit:** `648ea93` — `v4.44.3: feat(ci-cd): wire gate-prod-version@v8.2 + back-patch v2.13.10 framework (CL-4)`

#### Changes to `.github/workflows/ci-cd.yml`

**Added `version` job:**
- Runs after `quality-gate`
- Extracts `package.json` version via `node -p "require('./package.json').version"`
- Outputs `version` for consumption by `cl4-gate`

**Added `cl4-gate` job:**
- Uses `triarchsecurity/shared-workflows/.github/workflows/gate-prod-version.yml@v8.2`
- `project_key: triarch-dev-tmi` (verified from admin DB via 32-CONTEXT.md)
- `target_version: ${{ needs.version.outputs.version }}`
- `ADMIN_API_TOKEN` secret wired
- `if: needs.env-select.outputs.environment == 'prod'` — prod-only guard

**Updated `deploy` job:**
- Added `version` and `cl4-gate` to `needs:` array
- Added `always() &&` prefix to `if:` (prevents implicit success() skipping legitimately-skipped prod-only jobs)
- Added `(needs.cl4-gate.result == 'success' || needs.cl4-gate.result == 'skipped')` guard

**Back-patched `verify-dev-deployed` (v2.13.10 direction fix):**
- OLD (wrong): `git merge-base --is-ancestor HEAD origin/dev` — required main commit to exist on dev, forced manual recovery after every prod promotion
- NEW (correct): `git merge-base --is-ancestor origin/dev HEAD` — checks that origin/dev tip is an ancestor of HEAD, passes for the standard dev → main merge-commit flow
- Removed entire `[hotfix-bypass-dev]` escape hatch block (commit message grep, warning step summary, conditional exit 0)
- Step renamed: "Assert dev tip is in main's ancestry" (mirrors platform v2.13.10 wording)

**Version bump:** `package.json` 4.44.1 → 4.44.3

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed reversed merge-base direction in verify-dev-deployed**
- **Found during:** Initial read of tmi ci-cd.yml
- **Issue:** `git merge-base --is-ancestor HEAD origin/dev` is the old pre-v2.13.10 direction — required main's commit to exist on dev, causing false failures on standard merge-commit promotions
- **Fix:** Flipped to `git merge-base --is-ancestor origin/dev HEAD` per platform v2.13.10 pattern
- **Files modified:** `.github/workflows/ci-cd.yml`
- **Commit:** 648ea93

**2. [Rule 2 - Security] Removed [hotfix-bypass-dev] escape hatch**
- **Found during:** Initial read of tmi ci-cd.yml
- **Issue:** Hotfix bypass token allowed bypassing dev-deployed check entirely, undermining Layer 3 bypass-prevention
- **Fix:** Removed the commit message grep, conditional exit 0, warning step summary, and all related comments referencing the bypass
- **Files modified:** `.github/workflows/ci-cd.yml`
- **Commit:** 648ea93

## Success Criteria Verification

- [x] tmi on `feat/cl4-consumer-gate` off main
- [x] ci-cd.yml has `cl4-gate` job using `gate-prod-version.yml@v8.2`
- [x] `project_key: triarch-dev-tmi` (verified from 32-CONTEXT.md admin DB lookup)
- [x] `verify-dev-deployed` uses corrected direction (`origin/dev ancestor of HEAD`)
- [x] No `[hotfix-bypass-dev]` references in ci-cd.yml
- [x] `package.json` version 4.44.3
- [x] YAML parses (validated via python3 yaml.safe_load)
- [x] Single commit `648ea93`, no push

## Self-Check: PASSED

- File `/Users/mikegeehan/claude/triarch/shared/tmi/.github/workflows/ci-cd.yml`: FOUND
- File `/Users/mikegeehan/claude/triarch/shared/tmi/package.json` at v4.44.3: FOUND
- Commit `648ea93` on `feat/cl4-consumer-gate`: FOUND
- No `hotfix-bypass` string in ci-cd.yml: CONFIRMED
- `is-ancestor origin/dev HEAD` direction: CONFIRMED
- `gate-prod-version.yml@v8.2` wired: CONFIRMED
