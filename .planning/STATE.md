---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: Multi-Branch RC + Central Vault + OttoBot Brain
status: executing
stopped_at: Completed 02-01-PLAN.md — deploy-firebase.yml git_branch input + admin dev callback
last_updated: "2026-05-05T02:17:34.770Z"
progress:
  total_phases: 8
  completed_phases: 2
  total_plans: 13
  completed_plans: 11
---

# Triarch Dev Admin — Project State

## Project Reference

See: `.planning/PROJECT.md` (last updated 2026-05-04 — v2.0 milestone started)

**Core value:** One control plane to create, manage, and ship Triarch projects — including a dev-to-prod gating workflow that lets customers approve releases before they go live.
**Current focus:** Phase 02 — shared-workflows-hardening

## Current Position

Phase: 02 (shared-workflows-hardening) — EXECUTING
Plan: 3 of 4

## Active Milestone: v2.0 — Multi-Branch RC + Central Vault + OttoBot Brain

**Goal:** Three intertwined initiatives — multi-branch parallel RCs with auto-rebase-and-merge promotion, central credential vault on GCP Secret Manager, OttoBot dispatcher hardening with expanded Slack scopes.
**Phases:** 8 (reset to Phase 1 for v2.0)
**Requirements:** 31 mapped (VAULT ×7, SCHEMA ×3, WORKFLOW ×5, RC ×8, OTTOBOT ×6, PILOT ×2)
**Status:** Ready to execute

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
- [Phase 03]: Three verification options in SCHEMA-03 runbook (existing workflow / one-shot / direct API) — Option A recommended; avoids Option B overhead when write-capable workflow already exists
- [Phase 03-01]: branch column left nullable (no .notNull()) to match v1.14 env/status precedent; DEFAULT handles new inserts, backfill UPDATE handles legacy rows
- [Phase 03-01]: DB push deferred to Mike post-merge — DATABASE_URL is Firebase App Hosting secret; same precedent as v1.14 Phase 02-01/04-01
- [Phase 03]: actor_email nullable in slack_action_audit — unmapped Slack users have null email; actor_slack_id always present
- [Phase 03]: No relations() block for slackActionAudit — audit logs are immutable standalone; no FK to any other table
- [Phase 02-02]: All ${{ }} expressions moved to env: blocks in run: steps — required for actionlint/shellcheck compliance; standard pattern for shared-workflows steps
- [Phase 02-02]: snake_case payload enforced (commit_sha, deployed_at, deployed_by) in deploy-prod.yml — /api/releases/promoted requires snake_case (different from dev endpoint camelCase)
- [Phase 02-01]: previewUrl stored in metadata JSONB (not new column) — keeps Phase 2 schema-free per D-13
- [Phase 02-01]: Two mutually-exclusive FAH deploy steps in deploy-firebase.yml: main vs branch-preview, driven by git_branch input

### Pending Todos

None yet.

### Blockers/Concerns

- VAULT-05 and VAULT-06 require deploying to two separate Firebase projects (triarch-dev admin + triarchsecurity-admin CRM) — coordinate deploy order with Phase 1 plan
- SCHEMA-03 (GitHub App permission upgrade) requires manual re-authorization in GitHub — human action required; plan must include runbook step
- WORKFLOW-01/02 (shared-workflows cross-repo changes) require pushing to MyAlterLego/shared-workflows repo — different repo from triarch-dev; plan must note this

## Session Continuity

Last session: 2026-05-05T02:17:34.769Z
Stopped at: Completed 02-01-PLAN.md — deploy-firebase.yml git_branch input + admin dev callback
Resume file: None
