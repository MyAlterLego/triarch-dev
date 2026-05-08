---
gsd_state_version: 1.0
milestone: v2.1
milestone_name: Pipeline UI
status: executing
stopped_at: Completed 08-02-PLAN.md — getProjectPipelineSummaries helper with 10/10 tests GREEN
last_updated: "2026-05-08T02:43:39.782Z"
progress:
  total_phases: 7
  completed_phases: 0
  total_plans: 3
  completed_plans: 2
---

# Triarch Dev Admin — Project State

## Project Reference

See: `.planning/PROJECT.md` (last updated 2026-05-07 — v2.1 milestone started)

**Core value:** One control plane to create, manage, and ship Triarch projects — including a dev-to-prod gating workflow that lets customers approve releases before they go live.
**Current focus:** Phase 08 — Admin Home Pipeline Visibility

## Current Position

Phase: 08 (Admin Home Pipeline Visibility) — EXECUTING
Plan: 3 of 3

## Active Milestone: v2.1 — Pipeline UI

**Goal:** Make the dev→prod CI/CD pipeline that v2.0 built legible and operable from the admin/customer web surfaces — per-project prod-vs-dev at a glance, on-demand branch previews, web-UI promotion, bidirectional bug/feature ↔ release linkage with filterable views, and what-changed views surfaced on both admin and customer pages.

**Phases:** 7 (Phases 8–14)

| Phase | Goal | Requirements | Status |
|-------|------|--------------|--------|
| 8 — Admin Home Pipeline Visibility | Staff see prod/dev state at a glance from admin home | PIPE-01, PIPE-02, PIPE-03, PIPE-04, PIPE-06 | Not started |
| 9 — Per-Project Pipeline Page and Web-UI Promote | Staff have consolidated pipeline view + can promote from web | PIPE-05, PROM-01..05, DIFF-01 | Not started |
| 10 — Schema Gate | One isolated migration landing `release_log_links` + lock columns | LINK-01, PREV-01 | Not started |
| 11 — Commit Parser and Tracker Linkage Authoring | Auto-stamp + manual override for bug/feature links | LINK-02, LINK-03, LINK-04, LINK-07 | Not started |
| 12 — Bug and Feature Detail Pages | "Released in" sidebar on bug/feature detail pages | LINK-05, LINK-06 | Not started |
| 13 — Branch Preview Swap (research_required) | Customer admins drive branch swaps from the release page | PREV-02..06 | Not started |
| 14 — Customer Page Integration | Filter chips, what's-changed card, branch swap in section headers | CUST-01..03, DIFF-02 | Not started |

**Requirements:** 29 total, all mapped
**Status:** Ready to execute

## Performance Metrics

**Velocity:**

- Total plans completed: 0 (v2.1 start)
- Average duration: — (no data yet)
- Total execution time: —

*Updated after each plan completion*

## Accumulated Context

### Decisions

Carry-forward from v2.0 (standing constraints, all phases):

- [v2.0]: Never extend `release_logs.status` enum without auditing all consumers; use metadata fields or new tables for new state
- [v2.0]: DB-backed locks for cross-request state — never in-process Maps or module-level variables (Firebase App Hosting serverless multi-instance)
- [v2.0]: URL params (not in-memory state) for all filter dimensions; follow `SlackAuditClient.tsx` precedent
- [v2.0]: New routes go under new paths; never move existing routes; do not restructure `/admin` URL tree
- [v2.0]: promoteAndAudit() fire-and-forget dispatch pattern (Slack 3-sec rule) — web promote path must call the same function

v2.1 decisions captured at roadmap creation:

- [Roadmap-2026-05-07]: Phases 8 and 9 ship before Phase 10 schema gate — two high-value phases with zero migration risk before taking DB migration risk
- [Roadmap-2026-05-07]: Phase 13 (Branch Preview Swap) has `research_required: true` — Firebase App Hosting programmatic rollout API must be resolved before planning; do not design route handler until three options evaluated (googleapis SDK, Firebase MCP, GitHub Actions dispatch)
- [Roadmap-2026-05-07]: Phase 10 is the schema gate — `release_log_links` table + `projects` lock columns land together in one isolated migration, unblocking Phases 11–13
- [Roadmap-2026-05-07]: Phase 12 depends on Phase 11 data — detail pages are only meaningful once the auto-stamper has populated `release_log_links`; blank "Released in" sections at launch would be confusing
- [Roadmap-2026-05-07]: Phase 14 is last — aggregates all preceding phases; entry type filter is only meaningful after Phase 11 linkage data exists; navigation/discoverability audit can only be done when all features exist
- [Roadmap-2026-05-07]: PROM-04 (double-promote unique constraint) ships in same phase as the Promote button (Phase 9) — never build the button without the constraint
- [Roadmap-2026-05-07]: LINK-07 (commit message sanitization) ships with commit parser (Phase 11) — parser and sanitizer are one unit, never separated
- [Roadmap-2026-05-07]: Requirements count discrepancy: REQUIREMENTS.md header says 27, actual count by enumeration is 29 (6+5+2+7+6+3). All 29 enumerated requirements are mapped.
- [Phase 08]: Composite index on release_logs uses index() non-unique with deployedAt.desc() — separate from uniqueIndex; journal backfilled to resolve pre-existing 0012_promote_attempts inconsistency
- [Phase 08]: Raw SQL (db.execute) required for DISTINCT ON query — Drizzle typed builder lacks native DISTINCT ON support per Pitfall 8
- [Phase 08]: parity vs inverted state uses version comparison: same version = parity (just promoted), different version AND prod newer = inverted (hotfix)
- [Phase 08]: What-changed uses JS-side filter (safer alt): fetch all dev rows via Drizzle typed builder, filter by per-project prod cutoff in JS

### Pending Todos

- Before planning Phase 13: run `/gsd:research-phase 13` to resolve Firebase App Hosting programmatic rollout API question
- Phase 8 planning: include composite index `(project, env, deployed_at DESC)` on `release_logs` in the same deploy as the dashboard query (Pitfall 8 guard)
- Phase 9 planning: resolve `promoteAndAudit` signature for web context — nullable Slack params or split into `dispatchPromotion` + `notifySlack`

### Blockers/Concerns

- Phase 13 is blocked on Firebase App Hosting programmatic rollout API research. Three options to evaluate: (a) `googleapis` Node SDK `firebaseapphosting.v1beta`, (b) Firebase MCP tool (`mcp__firebase__`), (c) GitHub Actions workflow_dispatch as intermediary. Must resolve before planning Phase 13.
- v2.0 Phase 8 (Truth+Treason E2E Pilot) was folded into v2.1 — the parallel-RC UX it would have validated is what v2.1 actually builds. No separate runbook needed.

## Session Continuity

Last session: 2026-05-08T02:43:39.780Z
Stopped at: Completed 08-02-PLAN.md — getProjectPipelineSummaries helper with 10/10 tests GREEN
Resume file: None
Next action: `/gsd:plan-phase 8`
