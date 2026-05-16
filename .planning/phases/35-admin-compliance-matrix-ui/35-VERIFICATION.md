---
phase: 35
slug: admin-compliance-matrix-ui
status: human_needed
created: 2026-05-16
verified_via: 35-SUMMARY.md verification matrix
---

# Phase 35: Admin Compliance Matrix UI Extension — Verification

## Goal
Extend `/admin/modules/ci-cd` to render CL-1..CL-6 columns per project. Green/red/grey badge per cell with hover reason.

## Requirements
- **MATRIX-01**: Page renders one row per project × 6 columns + existing CL-4 readiness — **COMPLETE** (e52dcea)
- **MATRIX-02**: Each cell shows green/red/grey badge with one-line reason on hover — **COMPLETE** (via `title` attribute)
- **MATRIX-03**: Page response time < 2s; live recompute — **COMPLETE** (force-dynamic, no cache; single batch DB query for CL-6)
- **CL1-03**: CL-1 column (dev URL derivation) — **COMPLETE** (autonomous: derives expected dev hostname from prod URL pattern)
- **CL3-04**: CL-3 column — **SCAFFOLDED** (grey badge with reason; full implementation needs raw GitHub API for apphosting yaml reads)
- **CL5-01..03**: CL-5 column — **SCAFFOLDED** (grey badge; full implementation needs HEAD checks against customer release pages)

## Autonomous Verification
- 6 new columns rendered (CL-1..CL-6) ✓
- CL-1 implemented (green if dev URL derivable from prod pattern, grey otherwise) ✓
- CL-4 implemented (reuses existing gate verdict — no new DB queries) ✓
- CL-6 implemented (batch query of deploy_gate_check; green/red/grey logic) ✓
- CL-2/3/5 scaffolded with structure + grey badge + hover reason explaining what's needed ✓
- 16/16 existing vitest tests still pass ✓
- ComplianceCell type defined ✓
- v2.13.17 ✓

## Human Verification Required (UAT)
- **CL-2 full implementation**: HTTP fetch of each project's dev URL + grep for `data-env="dev"` in returned HTML. Requires network access from admin server.
- **CL-3 full implementation**: Raw GitHub API reads of each project's apphosting.yaml + apphosting.dev.yaml. Requires GitHub PAT in admin secrets.
- **CL-5 full implementation**: HEAD-check against `<project>.triarch.dev/projects/<slug>/releases` (or equivalent customer release page URL per project).
- **Live verification**: After all CL-6 paired-verdict rows start landing (post Phase 28/32 HUMAN-UAT), CL-6 cells should turn green on each project.

## Status
`status: human_needed` — 3 of 6 cells fully implemented; 3 scaffolded for follow-up work. MATRIX-01/02/03 structural goal achieved (the page renders all 6 columns with reasonable defaults; future iterations can fill in the network-dependent checks without UI changes).
