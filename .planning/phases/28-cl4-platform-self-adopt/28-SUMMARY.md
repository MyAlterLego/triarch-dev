---
phase: 28-cl4-platform-self-adopt
type: phase-summary
plans_shipped: ["28-01", "28-02"]
plans_followup: ["28-03"]
subsystems: [shared-workflows, ci-cd, platform]
tags: [cl4, cl6, gate, self-adopt, golden-template, cross-repo, v8.2]
dependency_graph:
  requires:
    - Phase 27 endpoint POST /api/platform/cicd/gate-verdict (admin v2.13.14 — code shipped)
    - Phase 27 schema deployGateCheck (migration 0019 — PENDING human apply to CRDB; carry-over from Phase 27)
    - shared-workflows v8.1 baseline (gate-prod-version.yml + GET version-snapshot path)
  provides:
    - shared-workflows v8.2 candidate (local feature branch commit, awaiting human push/PR/merge/tag)
    - Platform ci-cd.yml cl4-gate job pinned to @v8.2 (local feature branch commit, awaiting human push/PR-vs-dev)
    - Golden template for Phase 32 (consumer rollout) — copy the cl4-gate + version jobs into dev-portal, darksouls-rpg, tmi, truthtreason
  affects:
    - /Users/mikegeehan/claude/triarch/shared/shared-workflows/.github/workflows/gate-prod-version.yml (+ ~65 lines)
    - .github/workflows/ci-cd.yml (+ ~30 lines, 2 modified clauses)
    - package.json (2.13.14 -> 2.13.15)
tech_stack:
  added: []
  patterns:
    - Reusable shared-workflow gate pinned by tag (v8.2) — consumer pinning model preserved
    - Pre-deploy version extraction in a dedicated `version` job — deterministic input to the gate
    - Job name `cl4-gate` chosen to avoid collision with existing `gate-prod` GitHub Environment job
    - Skipped-OR-success allowance in deploy.if keeps dev path untouched
    - project_key=triarch-dev sourced from src/db/seed-projects.ts:27 (NOT CONTEXT.md hypothesis triarchsecurity-platform)
key_files:
  modified:
    - /Users/mikegeehan/claude/triarch/shared/shared-workflows/.github/workflows/gate-prod-version.yml
    - .github/workflows/ci-cd.yml
    - package.json
  created:
    - .planning/phases/28-cl4-platform-self-adopt/28-01-SUMMARY.md (Plan 01)
    - .planning/phases/28-cl4-platform-self-adopt/28-SUMMARY.md (this file)
    - .planning/phases/28-cl4-platform-self-adopt/28-HUMAN-UAT.md (Task 3 of Plan 03)
decisions:
  - "Platform project_key in admin projects table is `triarch-dev` (verified by reading src/db/seed-projects.ts:27). The CONTEXT.md hypothesis `triarchsecurity-platform` was wrong — no such row in the seed."
  - "New ci-cd.yml job named `cl4-gate` (not `gate`) to avoid collision with existing `gate-prod` GitHub Environment job."
  - "Added a dedicated `version` job that extracts package.json once, rather than relying on deploy-firebase.yml's late extraction."
  - "deploy.if extended with cl4-gate success-or-skipped so dev pushes still deploy."
  - "shared-workflows is tag-only versioning. Commit uses `v8.2:` prefix; tag created post-merge as HUMAN follow-up."
  - "Per workspace CLAUDE.md, no git push executed in either repo. All push/PR/merge/tag/secret operations enumerated in 28-HUMAN-UAT.md."
requirements: ["CL4-01"]
metrics:
  duration: "~10 minutes (Wave 1 + Wave 2 + Wave 3)"
  completed_date: "2026-05-16"
  plans: 3
  tasks_total: 8
  files_modified: 3
  files_created: 3
---

# Phase 28: CL-4 Platform Self-Adopt — Phase Summary

**One-liner:** Platform self-adopts the CL-4 prod-deploy gate it just built. Two repos modified: shared-workflows v8.1 to v8.2 (additive verdict POST step) and platform ci-cd.yml (cl4-gate job + version job + deploy.needs/deploy.if extensions). v2.13.15 ships the wiring on a local feature branch; remote operations and live verification are HUMAN-UAT.

## Verification Matrix (Plan 28-03 Automated Checks)

All 10 verification checks passed on 2026-05-16:

| # | Check | Command | Expected | Result |
|---|-------|---------|----------|--------|
| 1 | YAML valid (ci-cd.yml) | `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci-cd.yml'))"` | exit 0 | PASS |
| 2 | gate-prod-version.yml@v8.2 pinned | `grep -c "gate-prod-version.yml@v8.2" ci-cd.yml` | 1 | PASS (1) |
| 3 | cl4-gate job declared | `grep -c "^  cl4-gate:$" ci-cd.yml` | 1 | PASS (1) |
| 4 | version job declared | `grep -c "^  version:$" ci-cd.yml` | 1 | PASS (1) |
| 5 | project_key: triarch-dev | `grep -c "project_key: triarch-dev" ci-cd.yml` | 1 | PASS (1) |
| 6 | ADMIN_API_TOKEN referenced | `grep -c "ADMIN_API_TOKEN" ci-cd.yml` | ≥1 | PASS (1) |
| 7 | deploy.needs includes cl4-gate | `grep -E "needs: \[.*cl4-gate.*\]" ci-cd.yml \| wc -l` | ≥1 | PASS (1) |
| 8 | deploy.if allows cl4-gate skipped | `grep -c "needs.cl4-gate.result" ci-cd.yml` | ≥1 | PASS (1) |
| 9 | package.json version | `npm pkg get version` | "2.13.15" | PASS |
| 10a | Platform commit exists | `git log -1 --format="%s"` | feat(ci-cd): wire... | PASS (9f063e3) |
| 10b | shared-workflows commit exists | `git -C .../shared-workflows log -1 --format="%s"` | v8.2: gate-prod... | PASS (4cdc9e0) |

Additional checks run per success criteria:

| Check | Command | Result |
|-------|---------|--------|
| YAML valid (gate-prod-version.yml) | `python3 -c "import yaml; yaml.safe_load(open('gate-prod-version.yml'))"` | PASS |
| Record verdict to admin step exists | `grep -c "Record verdict to admin" gate-prod-version.yml` | PASS (1) |
| cicd/gate-verdict path present | `grep -c "cicd/gate-verdict" gate-prod-version.yml` | PASS (2) |
| TypeScript check | `npx tsc --noEmit` | PASS (exit 0) |
| Vitest 16 tests | `npx vitest run route.test.ts (gate-verdict + ingest)` | PASS (16/16) |

## What Shipped (Autonomous)

**Plan 28-01 (Wave 1) — shared-workflows v8.2**

- New step `Record verdict to admin (CL-6)` inserted between `Compare versions + enforce invariants` and `Audit log to admin` in `gate-prod-version.yml`.
- Step POSTs `{target_version, verdict, dev_version, workflow_run_url}` to `${ADMIN_CALLBACK_URL}/api/platform/cicd/gate-verdict`.
- `if: always() + continue-on-error: true` — fires on pass + fail, admin downtime never blocks deploys.
- Header comment updated with v8.2 entry (newest-first ordering preserved).
- Local commit `v8.2: gate-prod-version posts verdict to /api/platform/cicd/gate-verdict (CL-6 enforcement)` on `feat/v8.2-cl6-verdict-post` branch in `/Users/mikegeehan/claude/triarch/shared/shared-workflows` (hash: `4cdc9e0`).
- See: `28-01-SUMMARY.md`

**Plan 28-02 (Wave 2) — platform ci-cd.yml wire-up**

- New `version` job extracts package.json version once (needs: quality-gate); output `version` consumed by cl4-gate.
- New `cl4-gate` job uses `triarchsecurity/shared-workflows/.github/workflows/gate-prod-version.yml@v8.2` with inputs `project_key: triarch-dev`, `target_version: ${{ needs.version.outputs.version }}` and secret `ADMIN_API_TOKEN`.
- Guard `if: needs.env-select.outputs.environment == 'prod'` — gate is prod-only; dev pushes skip entirely.
- `deploy.needs: [quality-gate, validate-apphosting, version, env-select, verify-dev-deployed, gate-prod, cl4-gate]` extended to include `version` and `cl4-gate`.
- `deploy.if:` extended with `(needs.cl4-gate.result == 'success' || needs.cl4-gate.result == 'skipped')` — preserves dev deploy path.
- package.json bumped 2.13.14 to 2.13.15.
- Local commit `v2.13.15: feat(ci-cd): wire gate-prod-version@v8.2 as needs: of prod deploy (CL-4 platform self-adopt)` on `feat/cl4-self-adopt-gate` branch (hash: `9f063e3`).
- See: this SUMMARY.

**Plan 28-03 (Wave 3) — verification + phase close**

- All verification checks passed (see matrix above).
- This SUMMARY written.
- `28-HUMAN-UAT.md` written with the complete operational-completion checklist.

## Out of Scope (Captured in 28-HUMAN-UAT.md)

- Pushing either feature branch (no remote operation per workspace CLAUDE.md)
- Opening the two PRs (shared-workflows vs main; platform vs dev)
- Creating the `v8.2` git tag on shared-workflows
- Setting the `ADMIN_API_TOKEN` GitHub Actions secret on `MyAlterLego/triarch-dev`
- Applying Phase 27's migration 0019 to CRDB (carry-over from Phase 27 — gates non-empty deploy_gate_check table)
- Running the contrived dry-run (push a fake high version) to verify INV-2 blocks
- Running a real v2.13.15+ prod deploy and verifying the gate passes + deploy_gate_check row lands
- Flipping `CL6_ENFORCEMENT_MODE` from warn to enforce (separate operational decision after 7-day grace per Phase 27 D-Rollout)

See: `.planning/phases/28-cl4-platform-self-adopt/28-HUMAN-UAT.md`

## Self-Eats-The-Dog-Food Architecture

The round-trip closure is now end-to-end discoverable. Platform CI on push to main runs the version job (extracts 2.13.15), then the cl4-gate job (uses shared-workflows v8.2: GETs admin /api/platform/version-snapshot, enforces INV-1..INV-5, POSTs admin /api/platform/cicd/gate-verdict to write the paired-verdict row), then the deploy job (needs cl4-gate success-or-skipped). deploy-firebase emits a release_logs ingest, and admin /api/platform/ingest/release-logs runs the CL-6 pre-check that reads the deploy_gate_check row (15-min lookback, same project_key + target_version + apiKey). If match: insert release_logs row (warn or enforce mode). If mismatch: 409 (enforce mode) or audit-and-pass (warn mode).

Phase 28 is the consumer side; Phase 27 was the producer side. The loop closes here.

## Golden Template for Phase 32

Phase 32 (CL-4 roll to consumers: dev-portal, darksouls-rpg, tmi, truthtreason) copies the cl4-gate + version job blocks from this repo's ci-cd.yml verbatim, changing only project_key: and the GitHub Actions secret binding.

## Self-Check: PASSED

- `.planning/phases/28-cl4-platform-self-adopt/28-SUMMARY.md` — FOUND (this file)
- `.planning/phases/28-cl4-platform-self-adopt/28-HUMAN-UAT.md` — verified present after Task 3
- `plans_shipped: ["28-01", "28-02"]` in frontmatter — YES
- `project_key=triarch-dev` referenced in body — YES
- `28-HUMAN-UAT.md` cross-link — YES
- `requirements: ["CL4-01"]` in frontmatter — YES
- Exactly 2 lines matching `^---$` — YES (frontmatter delimiters only)
- YAML frontmatter valid — YES
