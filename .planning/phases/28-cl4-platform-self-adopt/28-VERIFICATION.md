---
phase: 28
slug: cl4-platform-self-adopt
status: human_needed
created: 2026-05-16
verified_via: 28-SUMMARY.md verification matrix (10/10 automated PASS)
---

# Phase 28: CL-4 Platform Self-Adopt — Verification

## Goal
Platform's own `ci-cd.yml` declares `gate-prod-version.yml@v8.2` as `needs:` prerequisite of every prod deploy job. Self-eats the dog food + provides golden template for Phase 32 rollout.

## Requirements
- **CL4-01**: Platform `ci-cd.yml` wires `gate-prod-version.yml@v8.2` as `needs:` for prod deploy — **STRUCTURALLY VERIFIED** in code; full operational verification pending HUMAN-UAT sections F + G.

## must_haves Verified (automated)

| # | Truth | Evidence | Status |
|---|-------|----------|--------|
| 1 | shared-workflows v8.2 exists with POST step | `.github/workflows/gate-prod-version.yml` in shared-workflows checkout has `Record verdict to admin (CL-6)` step that POSTs to `/api/platform/cicd/gate-verdict`; commit `4cdc9e0` on `feat/v8.2-cl6-verdict-post` | PASS |
| 2 | Platform ci-cd.yml has cl4-gate job pinned to @v8.2 | `grep "gate-prod-version.yml@v8.2" .github/workflows/ci-cd.yml` returns 1 | PASS |
| 3 | cl4-gate uses correct project_key | `grep "project_key: triarch-dev"` returns 1 (verified from src/db/seed-projects.ts) | PASS |
| 4 | ADMIN_API_TOKEN secret declared | `grep "ADMIN_API_TOKEN"` returns ≥1 | PASS |
| 5 | deploy-prod blocked behind cl4-gate | `deploy.needs` includes `cl4-gate`; `deploy.if` allows skipped on dev path | PASS |
| 6 | Platform version bumped | `npm pkg get version` returns `"2.13.15"` | PASS |
| 7 | YAML files parse | both ci-cd.yml + gate-prod-version.yml pass `yaml.safe_load` | PASS |
| 8 | No Phase 27 regression | `npx vitest run` on phase 27 test files: 16/16 passed | PASS |
| 9 | Build passes | `npx tsc --noEmit` exits 0 | PASS |
| 10 | No remote push | shared-workflows branch + platform `feat/cl4-self-adopt-gate` both local-only | PASS |

## Human Verification Required (UAT)

Operational verification of CL4-01 requires real GitHub Actions runs that cannot be reproduced inside this repo. See `28-HUMAN-UAT.md` sections A-G for full step-by-step. Key items:

1. **Migration 0019 applied to CRDB** (Phase 27 carryover) — `npm run db:push` against prod DATABASE_URL secret
2. **shared-workflows v8.2 shipped** — push feature branch, PR vs main, merge, create `v8.2` annotated tag
3. **ADMIN_API_TOKEN secret added** to triarchsecurity/platform GitHub Actions
4. **Branch reconcile** — Phase 27 commits on `dev` (17 ahead of origin), Phase 28-02 commits on `feat/cl4-self-adopt-gate`. Strategy TBD by user.
5. **Platform PR(s) opened** — push branches, open PRs vs dev or main per workspace policy
6. **Contrived dry-run test** — push fake higher version, verify INV-2 fires
7. **Real prod deploy test** — v2.13.15+, verify gate passes + deploy_gate_check row + deploy ships

## Status Routing

`status: human_needed` — all automated verification passed (100% PASS rate on the 10-check matrix); operational verification deferred to user-controlled real GitHub Actions runs.
