---
gsd_state_version: 1.0
milestone: v1.14.0
milestone_name: milestone
status: executing
last_updated: "2026-05-03T18:09:13.025Z"
progress:
  total_phases: 5
  completed_phases: 0
  total_plans: 4
  completed_plans: 3
---

# Triarch Dev Admin — Project State

## Project Reference

See: `.planning/PROJECT.md` (last updated 2026-05-03 — scope reset post-audit)

**Core value:** One control plane to create, manage, and ship Triarch projects — including a dev-to-prod gating workflow that lets customers approve releases before they go live.
**Current focus:** Phase 01 — schema-membership-migration (Plans 01 + 02 complete, Plan 03 next)

## Active Milestone: v1.14.0 — Customer Release Gating

**Goal:** Customer admins approve dev releases via admin.triarch.dev → Slack interactive buttons → GitHub App workflow_dispatch → status round-trips back; Truth+Treason is the pilot.
**Phases:** 5
**Requirements:** 32
**Status:** Executing Phase 01 — Plans 01-01 and 01-02 complete

## Decisions

| Date | Phase/Plan | Decision |
|------|-----------|----------|
| 2026-05-03 | 01-01 | New releaseLogs columns (env/status/commit_sha/deployed_at) are nullable — legacy rows NULL until Mike runs backfill SQL |
| 2026-05-03 | 01-01 | project_members email uniqueness is case-insensitive via lower(email) in uniqueIndex — stored as-entered |
| 2026-05-03 | 01-01 | staff role uses wildcard project_key='*' row — single table for all access control |
| 2026-05-03 | 01-01 | Backfill SQL uses WHERE NOT EXISTS (not ON CONFLICT) — consistent idempotency across all three statements |
| 2026-05-03 | 01-01 | No Drizzle relations() for new tables in Phase 1 — Phase 2 adds them when customer releases page consumes them |
| 2026-05-03 | 01-02 | getCurrentUserContext returns null (not fallback context) on DB error — caller decides fallback policy |
| 2026-05-03 | 01-02 | env-allowlist fallback in signIn is intentional for v1.14 rollout — slated for removal in v1.15 once staff seeding stable |
| 2026-05-03 | 01-04 | Non-staff with empty memberships returns { projects: [] } (200) not 403 |
| 2026-05-03 | 01-04 | env validation silently coerces invalid values to 'dev' for CI backwards compat |
| 2026-05-03 | 01-04 | status='dev' is server-controlled on insert; Phase 2 gating is only transition path |

## Stopped At

Completed 01-schema-membership-migration/01-04-PLAN.md — Plans 01-01, 01-02, 01-04 done (01-03 ran in parallel). Phase 01 code-complete pending 01-03 final commit and Mike's db:push + backfill SQL.

## Repository state

`MyAlterLego/triarch-dev` is at `v1.13.1` — foundation, projects, bugs, features, and release-log ingestion are already shipping. This milestone builds on top; nothing in v1.13 is being rewritten.

## Backlog

See `.planning/BACKLOG.md` for items punted from this milestone (PROJ-03, BUG-03, BUG-06, FEAT-04, CREATE-03/07/10/11, MIG-01..03, multi-staging environments, auto-rollback, N-of-M sign-offs).

## History

| Date | Event |
|------|-------|
| 2026-04-07 | Project initialized in `.planning/` with 6 phases, 34 requirements (greenfield assumption) |
| 2026-05-03 | First scope expansion: added customer membership and release gating (7 phases, 56 reqs). Treated project as greenfield. |
| 2026-05-03 | Audit: codebase actually at `v1.13.1` with foundation/projects/bugs/features/releases already shipped. Greenfield plan would re-implement existing work. |
| 2026-05-03 | Scope reset to single milestone v1.14.0 — Customer Release Gating only. 5 phases, 32 reqs, no rework of v1.13. Pre-existing gaps (project detail page, bug Kanban, etc.) moved to BACKLOG.md. |
