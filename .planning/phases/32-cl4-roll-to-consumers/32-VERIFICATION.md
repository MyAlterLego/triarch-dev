---
phase: 32
slug: cl4-roll-to-consumers
status: human_needed
created: 2026-05-16
verified_via: 3 consumer wire-ups complete; dev-portal deferred (no admin project record)
---

# Phase 32: CL-4 Roll to Consumers — Verification

## Goal
Wire `gate-prod-version.yml@v8.2` into 4 consumer ci-cd.yml files. Self-eats Phase 27/28 dogfood + extends CL-4 enforcement to the rest of the portfolio.

## Requirements
- **CL4-02**: dev-portal cl4-gate — **DEFERRED** (no admin project record; see 32-HUMAN-UAT Section C)
- **CL4-03**: darksouls cl4-gate — **STRUCTURALLY COMPLETE** (commit 12c007d on feat/cl4-consumer-gate; live verification pending HUMAN-UAT B)
- **CL4-04**: tmi cl4-gate + v2.13.10 back-patch — **STRUCTURALLY COMPLETE** (commit 648ea93; verify-dev-deployed direction fixed, hotfix-bypass removed)
- **CL4-05**: truthtreason cl4-gate — **STRUCTURALLY COMPLETE** (commit 3855a0d; v2.13.10 already adopted per PR #30)

## Autonomous Verification

| Check | darksouls | tmi | truthtreason | dev-portal |
|-------|-----------|-----|--------------|------------|
| feat/cl4-consumer-gate branch | ✓ off main | ✓ off main | ✓ off dev | n/a |
| cl4-gate @v8.2 in ci-cd.yml | ✓ | ✓ | ✓ | not done |
| project_key correct | darksouls-rpg | triarch-dev-tmi | truth-treason | n/a (no key exists) |
| deploy-prod needs: cl4-gate | ✓ | ✓ | ✓ | not done |
| YAML parses | ✓ | ✓ | ✓ | n/a |
| Version bumped | v7.7.14 | v4.44.3 | v1.1.20 | not done |
| v2.13.10 framework adopted | n/a | ✓ (back-patched in this commit) | ✓ (pre-existing, PR #30) | n/a |
| No [hotfix-bypass-dev] | n/a | ✓ removed | ✓ never present | n/a |
| No remote push | ✓ | ✓ | ✓ | n/a |

## Human Verification Required (UAT)

Captured in 32-HUMAN-UAT.md:
A. Prerequisites — Phase 27 migration applied + Phase 28 v8.2 published
B. Per-consumer rollout — ADMIN_API_TOKEN secret + push + PR + contrived test + real prod deploy
C. dev-portal special path — create admin project record first, then wire (Phase 32.1)
D. Branch divergence (Phase 29 vs Phase 32 feature branches per repo)
E. Success criteria

## Status
`status: human_needed` — 3 of 4 consumers structurally complete; live verification (real prod deploy through gate) requires shared-workflows v8.2 + ADMIN_API_TOKEN secrets per repo. dev-portal blocked by missing admin project record.
