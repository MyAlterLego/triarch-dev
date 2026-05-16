---
phase: 32
plan: "03"
subsystem: ci-cd
tags: [cl4, gate-prod-version, truthtreason, consumer-adoption]
dependency_graph:
  requires: [phase-28-platform-self-adopt, shared-workflows-v8.2]
  provides: [truthtreason-cl4-gate]
  affects: [truthtreason-prod-deploys]
tech_stack:
  added: []
  patterns: [gate-prod-version@v8.2, cl4-gate job, always()-needs pattern]
key_files:
  modified:
    - /Users/mikegeehan/claude/triarch/shared/truthtreason/.github/workflows/ci-cd.yml
    - /Users/mikegeehan/claude/triarch/shared/truthtreason/package.json
decisions:
  - "Renamed gate-prod-version job to cl4-gate to match platform self-adopt naming convention"
  - "Bumped @v8.1 to @v8.2 per Phase 32 requirement"
  - "cl4-gate needs [env-select, version] only (not verify-dev-deployed) matching platform pattern"
  - "v2.13.10 framework already adopted — no back-patch needed"
metrics:
  duration: "~5 minutes"
  completed: "2026-05-16"
  tasks: 1
  files: 2
---

# Phase 32 Plan 03: CL-4 Wire truthtreason Summary

**One-liner:** Renamed gate-prod-version to cl4-gate, bumped @v8.1 to @v8.2 with project_key truth-treason on feat/cl4-consumer-gate branch.

## What Was Done

Wired `gate-prod-version.yml@v8.2` into truthtreason's `ci-cd.yml` as `cl4-gate`, matching the platform self-adopt pattern from Phase 28.

### Changes to `.github/workflows/ci-cd.yml`

- Renamed job `gate-prod-version` → `cl4-gate`
- Bumped workflow ref from `@v8.1` to `@v8.2`
- Updated comment to match Phase 28 CL-4 platform pattern
- Changed `cl4-gate` needs from `[env-select, version, verify-dev-deployed]` to `[env-select, version]` — matching platform pattern (verify-dev-deployed runs independently, not as a gate prereq)
- Updated `gate-prod` needs: removed `gate-prod-version`, added `cl4-gate`
- Updated `deploy` needs: replaced `gate-prod-version` with `cl4-gate`
- Updated `deploy` if condition: replaced `gate-prod-version.result` with `cl4-gate.result`

### v2.13.10 Framework Adoption Verification

The `verify-dev-deployed` job was already using the correct direction (`is-ancestor origin/dev HEAD`) per v2.13.10. No `[hotfix-bypass-dev]` token was present. No back-patch needed — this was confirmed pre-existing in the dev branch state.

### Version bump

`package.json`: v1.1.18 (on-disk on dev branch) → v1.1.20

Note: The context document referenced v1.1.19 → v1.1.20, but the actual dev branch had v1.1.18 at checkout time (v1.1.19 was likely on main/a merged PR). Bumped to v1.1.20 as specified.

## Commits

| Hash | Message | Files |
|------|---------|-------|
| `3855a0d` | v1.1.20: feat(ci-cd): wire gate-prod-version@v8.2 (CL-4) | ci-cd.yml, package.json |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Structural] cl4-gate needs array aligned to platform pattern**

- **Found during:** Task 1
- **Issue:** Original `gate-prod-version` job had `needs: [env-select, version, verify-dev-deployed]`, but the platform pattern (Phase 28 reference) uses `needs: [env-select, version]` — verify-dev-deployed runs as a separate parallel gate
- **Fix:** Aligned needs to `[env-select, version]` matching the canonical platform pattern
- **Files modified:** .github/workflows/ci-cd.yml
- **Commit:** 3855a0d

### Observations (No Action Required)

- **v2.13.10 already adopted:** `verify-dev-deployed` was already using `is-ancestor origin/dev HEAD` (correct direction). No back-patch needed.
- **No [hotfix-bypass-dev] present:** Already removed per prior PR #30 merge.
- **version job already present:** No need to add it.

## Human UAT Required

- Add `ADMIN_API_TOKEN` secret to truthtreason repo Settings → Actions secrets (cannot be set autonomously)
- No push done — branch `feat/cl4-consumer-gate` is local only

## Self-Check: PASSED

- [x] Branch `feat/cl4-consumer-gate` exists off dev: confirmed
- [x] ci-cd.yml has `cl4-gate` job with `@v8.2` and `project_key: truth-treason`: confirmed
- [x] verify-dev-deployed uses correct direction: confirmed (pre-existing)
- [x] No [hotfix-bypass-dev]: confirmed (absent)
- [x] package.json at v1.1.20: confirmed
- [x] YAML parses: confirmed (python3 yaml.safe_load passes)
- [x] Single commit, no push: confirmed (3855a0d, local only)
