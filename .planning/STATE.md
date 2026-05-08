---
gsd_state_version: 1.0
milestone: v2.1
milestone_name: Pipeline UI
status: executing
stopped_at: Completed 13-03-PLAN.md — BranchPreviewClient + ReleasesClient integration + v2.7.0
last_updated: "2026-05-08T06:31:26.552Z"
progress:
  total_phases: 7
  completed_phases: 6
  total_plans: 20
  completed_plans: 20
---

# Triarch Dev Admin — Project State

## Project Reference

See: `.planning/PROJECT.md` (last updated 2026-05-07 — v2.1 milestone started)

**Core value:** One control plane to create, manage, and ship Triarch projects — including a dev-to-prod gating workflow that lets customers approve releases before they go live.
**Current focus:** Phase 13 — Branch Preview Swap

## Current Position

Phase: 13 (Branch Preview Swap) — EXECUTING
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
- [Phase 08]: formatRelativeTime reused from @/app/projects/[slug]/releases/format — no new utility file needed
- [Phase 08]: Legacy ProjectHealth.version field kept on interface per CONTEXT.md — not rendered on tile but preserved for other potential consumers
- [Phase 08]: Pipeline tile hover border zinc-800 to zinc-600 (two-step lift) — one-step zinc-707 too subtle on dark background
- [Phase 09]: actor_source is nullable — legacy rows have NULL; web path sets 'web', Slack path sets 'slack'
- [Phase 09]: Partial unique index on (release_id) WHERE decision='approved' enforces one-approved-per-release at DB level (PROM-04)
- [Phase 09]: Migration rename pattern: drizzle-kit generate → rename SQL file → update journal tag → drizzle-kit check
- [Phase 09-per-project-pipeline-page-and-web-ui-promote]: Option (a): nullable params in promoteAndAudit (not split functions) — unified function harder to misuse
- [Phase 09-per-project-pipeline-page-and-web-ui-promote]: slackChannelId added to projects table (migration 0015) — web-origin Slack notification uses per-project channel; graceful no-op if null
- [Phase 09]: RC ordering uses JS-side sort after grouping (safe against mock/test ordering); staff auth adds getCurrentUserContext + redirect at page level since admin layout only validates session; deploy history uses JS split into 10+10 then re-merge desc; type pills use v2.1 gradient accents per DESIGN-REFERENCE.md
- [Phase 09]: Web route awaits promoteAndAudit (inline result for PROM-05); Slack route uses fire-and-forget (3-sec rule)
- [Phase 09]: HTTP 200 with ok:false for dispatch failures — atomic UPDATE committed; client reads ok flag
- [Phase 09]: actorSource optional with 'web' default in approveRelease/rejectRelease — existing callers unchanged
- [Phase 09]: useState phase machine (idle/confirming/dispatching/dispatched/failed) preferred over useTransition for PromoteButton — cleaner multi-phase state isolation
- [Phase 09]: Admin home Project Health tile Link href retargeted from /projects/<key>/releases to /admin/modules/pipeline/<key> (CONTEXT.md: 'Pipeline page is now linked from the /admin Project Health tile')
- [Phase 10]: CHECK constraint enforces link_type discriminant at DB level — robust against Phase 11 commit-parser bugs
- [Phase 10]: Non-partial FK indexes on release_log_links for Drizzle idiomaticity; performance negligible at expected row counts
- [Phase 10]: 0015_snapshot.json backfilled manually to isolate Phase 9 slack_channel_id from Phase 10 migration
- [Phase 11]: Pattern B (verb-prefixed UUID) fires before Pattern A; verb-prefix regions space-padded before Pattern A scan to prevent double-counting
- [Phase 11]: ParsedRef is a discriminated union: bug/feature carry id, external carries ref — downstream switch on type field without field existence checks
- [Phase 11]: Bare #N GitHub issue refs only match when preceded by verb (closes/fixes/resolves) — no verb = no match (Pitfall 5 false-positive guard)
- [Phase 11-02]: Neutralize-not-delete strategy for Slack: <!channel> becomes ‹!channel› preserving audit readability while breaking the trigger
- [Phase 11-02]: Link deception handled by URL extraction: <URL|label> becomes bare URL, deceptive label dropped
- [Phase 11-02]: sanitizeForRender is defense-in-depth against Unicode RTL/zero-width trickery that HTML escaping doesn't cover
- [Phase 11]: inArray for batch bug/feature validation — never per-ID queries (Pitfall 5 false-positive guard + performance)
- [Phase 11]: External #N refs dropped silently when projects.github_repo is null — no phantom links
- [Phase 11]: Stamper is forgiving internally (try/catch) AND wrapped at call site in route — two layers for defense-in-depth
- [Phase 11]: UUID-paste fallback for LinksClient picker: bug/feature typeahead search endpoints not yet built; picker uses direct UUID paste with placeholder text — POST API contract unchanged so future plan can add typeahead without route changes
- [Phase 11]: sanitizeBlockKitBlocks helper added to slack.ts: walks block.text.text and fields[].text — covers all Block Kit patterns in current codebase; sanitize-at-chokepoint pattern means future callers cannot bypass sanitization
- [Phase 11]: Option A (useEffect) over Option B (platform route augment) for LinksClient mount-fetch — self-contained, per-row expand, no N+1 cost
- [Phase 12-bug-and-feature-detail-pages]: Two separate query functions (getReleaseHistoryForBug, getReleaseHistoryForFeature) — not a shared internal — per pipeline-summary.ts precedent; simpler test mocking, clearer callsites
- [Phase 12-bug-and-feature-detail-pages]: toIso helper local to release-history.ts (not re-exported) — self-contained pattern per codebase convention
- [Phase 12]: ReleasedInSidebar.tsx is a shared server component with zero bug-specific logic — 12-03 imports it unchanged
- [Phase 12]: Version links use ?release= query param to pipeline page — informational now, anchor-scroll wirable later
- [Phase 12]: stopPropagation on Link title in bug list — navigates to detail page without triggering expand toggle
- [Phase 12-bug-and-feature-detail-pages]: ReleasedInSidebar reused unchanged from 12-02 for feature detail — zero modifications; 12-02 designed it as shared component
- [Phase 12-bug-and-feature-detail-pages]: jsonb != null check (not truthy) prevents Drizzle unknown ReactNode TypeScript error in feature detail page
- [Phase 13]: jose v5 added as direct dep alongside next-auth transitive jose v4: npm hoists both; no API conflict
- [Phase 13]: branch regex /^[a-zA-Z0-9\/_.-]{1,256}$/ blocks shell metacharacters before any fetch call in createFahRollout
- [Phase 13]: @vitest-environment node on fah-rollout.test.ts: jose v5 needs TextEncoder which jsdom lacks
- [Phase 13]: Banner uses violet-400 spinner + bg-violet-500/10 halo per DESIGN-REFERENCE.md active/in-flight pattern (overrides plan's amber suggestion)
- [Phase 13]: refreshInterval as function form ensures terminal pause applies immediately after first terminal response
- [Phase 13]: branchPreviewEnabled optional with default false — additive prop, existing ReleasesClient tests unchanged

### Pending Todos

- Before planning Phase 13: run `/gsd:research-phase 13` to resolve Firebase App Hosting programmatic rollout API question
- Phase 8 planning: include composite index `(project, env, deployed_at DESC)` on `release_logs` in the same deploy as the dashboard query (Pitfall 8 guard)
- Phase 9 planning: resolve `promoteAndAudit` signature for web context — nullable Slack params or split into `dispatchPromotion` + `notifySlack`

### Blockers/Concerns

- Phase 13 is blocked on Firebase App Hosting programmatic rollout API research. Three options to evaluate: (a) `googleapis` Node SDK `firebaseapphosting.v1beta`, (b) Firebase MCP tool (`mcp__firebase__`), (c) GitHub Actions workflow_dispatch as intermediary. Must resolve before planning Phase 13.
- v2.0 Phase 8 (Truth+Treason E2E Pilot) was folded into v2.1 — the parallel-RC UX it would have validated is what v2.1 actually builds. No separate runbook needed.

## Session Continuity

Last session: 2026-05-08T06:31:26.550Z
Stopped at: Completed 13-03-PLAN.md — BranchPreviewClient + ReleasesClient integration + v2.7.0
Resume file: None
Next action: `/gsd:plan-phase 8`
