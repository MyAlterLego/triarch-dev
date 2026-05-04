---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: Multi-Branch RC + Central Vault + OttoBot Brain
status: ready_to_plan
last_updated: "2026-05-04T22:00:00.000Z"
progress:
  total_phases: 8
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
---

# Triarch Dev Admin — Project State

## Project Reference

See: `.planning/PROJECT.md` (last updated 2026-05-04 — v2.0 milestone started)

**Core value:** One control plane to create, manage, and ship Triarch projects — including a dev-to-prod gating workflow that lets customers approve releases before they go live.
**Current focus:** Phase 1 — Central Secrets Vault

## Current Position

Phase: 1 of 8 (Central Secrets Vault)
Plan: — (not yet planned)
Status: Ready to plan
Last activity: 2026-05-04 — v2.0 roadmap created; 8 phases, 31 requirements mapped

Progress: [░░░░░░░░░░] 0%

## Active Milestone: v2.0 — Multi-Branch RC + Central Vault + OttoBot Brain

**Goal:** Three intertwined initiatives — multi-branch parallel RCs with auto-rebase-and-merge promotion, central credential vault on GCP Secret Manager, OttoBot dispatcher hardening with expanded Slack scopes.
**Phases:** 8 (reset to Phase 1 for v2.0)
**Requirements:** 31 mapped (VAULT ×7, SCHEMA ×3, WORKFLOW ×5, RC ×8, OTTOBOT ×6, PILOT ×2)
**Status:** Ready to plan — run `/gsd:plan-phase 1`

## Performance Metrics

**Velocity:**
- Total plans completed: 0 (v2.0 start)
- Average duration: — (no data yet)
- Total execution time: —

*Updated after each plan completion*

## Accumulated Context

### Decisions

Active decisions from v1.14.0 that carry forward into v2.0:

- [v1.14 Phase 04]: promoteAndAudit fire-and-forget dispatch pattern (Slack 3-sec rule) — v2.0 Phase 6 extends same pattern
- [v1.14 Phase 03]: Per-project Bearer auth on `/api/releases/promoted` — Phase 2 shared-workflows must include token
- [v1.14 Phase 04]: apphosting.yaml RUNTIME-only (no availability field) for secrets — vault migration must follow same pattern
- [v1.14 Phase 05]: YAML field case distinction: ci-cd.yml camelCase / deploy-prod.yml snake_case — Phase 2 must respect both conventions

### Pending Todos

None yet.

### Blockers/Concerns

- VAULT-05 and VAULT-06 require deploying to two separate Firebase projects (triarch-dev admin + triarchsecurity-admin CRM) — coordinate deploy order with Phase 1 plan
- SCHEMA-03 (GitHub App permission upgrade) requires manual re-authorization in GitHub — human action required; plan must include runbook step
- WORKFLOW-01/02 (shared-workflows cross-repo changes) require pushing to MyAlterLego/shared-workflows repo — different repo from triarch-dev; plan must note this

## Session Continuity

Last session: 2026-05-04
Stopped at: v2.0 roadmap creation complete — ready for `/gsd:plan-phase 1`
Resume file: None
