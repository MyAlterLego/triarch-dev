---
gsd_state_version: 1.0
milestone: v2.2
milestone_name: Customer Portal Split
status: executing
stopped_at: Completed 15-03-PLAN.md — PORTAL_NEXTAUTH_SECRET created in triarch-vault with FAH secretAccessor IAM
last_updated: "2026-05-08T15:24:35.776Z"
progress:
  total_phases: 19
  completed_phases: 7
  total_plans: 28
  completed_plans: 25
---

# Triarch Dev Admin — Project State

## Project Reference

See: `.planning/PROJECT.md` (last updated 2026-05-08 — v2.2 milestone started)

**Core value:** One control plane to create, manage, and ship Triarch projects — including a dev-to-prod gating workflow that lets customers approve releases before they go live.
**Current focus:** Phase 15 — operational-prework

## Current Position

Phase: 15 (operational-prework) — EXECUTING
Plan: 3 of 5

## Active Milestone: v2.2 — Customer Portal Split

**Goal:** Fork the customer-facing surface out of `admin.triarch.dev` into its own Next.js app at `portal.triarch.dev`. Mirror the existing `triarchsecurity-admin` (staff) / `triarchsecurity-portal` (customer) precedent.

**Phases:** 12 (Phases 15–26)

| Phase | Goal | Requirements | Status |
|-------|------|--------------|--------|
| 15 — Operational Prework | Repo, FAH backends, DNS, OAuth, secrets exist before app code ships | OPS-01..05 | Not started |
| 16 — Shared Package Extraction | `@myalterlego/triarch-shared@0.1.0` published; admin re-exports; CI gate prevents drift | PKG-01..04 | Not started |
| 17 — Hostname Guard Inventory | Catalog admin's hostname checks; fail-closed middleware before second valid host | HOST-01..02 | Not started |
| 18 — Portal Auth Scaffolding | NextAuth v4 with `__Host-` cookies, distinct secret, customer-membership signIn, staff callout | AUTH-01..07 | Not started |
| 19 — Database Connectivity | Portal `pg.Pool` + `portal_runtime` DML-only role + DDL permission-denied smoke test | DB-01..04 | Not started |
| 20 — URL Centralization (admin) | `src/lib/urls.ts` + ESLint guard; refactor admin Slack/email/release-note URL emitters | URL-01..03 | Not started |
| 21 — Release Page Port (Read) | Lift-and-shift `/projects/[slug]/releases` + `/projects` list; 404 for non-members | PORTAL-01..04 | Not started |
| 22 — Release Page Port (Write, research_required) | Approve/reject/feedback + branch swap; portal-owned FAH key; HMAC-proxy to admin for GH dispatch | WRITE-01..05 | Not started |
| 23 — Bug + Feature Customer Surface | `/bugs/*` and `/features/*` list/detail/new routes (two net-new primitives) | BUG-01..03, FEAT-01..03 | Not started |
| 24 — CI/CD Deploy Safety (research_required) | `verify-deploy-target`, per-repo deploy SAs, `assertEnv()`, `validate-apphosting.ts` | CI-01..04 | Not started |
| 25 — Cutover | Admin 301 → portal; customer email blast; Slack URL sweep; redirect telemetry; kill-switch | CUT-01..05 | Not started |
| 26 — Sunset (T+90) | Delete admin `/projects/[slug]/*` + dead hostname guards; admin v3.0.0 bump (deferred) | SUN-01..03 | Not started |

**Requirements:** 47 total, all mapped (100% coverage, no orphans)
**Status:** Ready to execute

## Performance Metrics

**Velocity:**

- Total plans completed: 0 (v2.2 start)
- Average duration: — (no data yet)
- Total execution time: —

*Updated after each plan completion*

## Accumulated Context

### Decisions

Carry-forward from v2.0/v2.1 (standing constraints, all phases):

- [v2.0]: Never extend `release_logs.status` enum without auditing all consumers; use metadata fields or new tables for new state
- [v2.0]: DB-backed locks for cross-request state — never in-process Maps or module-level variables (Firebase App Hosting serverless multi-instance)
- [v2.0]: URL params (not in-memory state) for all filter dimensions; follow `SlackAuditClient.tsx` precedent
- [v2.0]: New routes go under new paths; never move existing routes; do not restructure `/admin` URL tree
- [v2.0]: promoteAndAudit() fire-and-forget dispatch pattern (Slack 3-sec rule) — web promote path must call the same function

v2.2 decisions captured at roadmap creation (2026-05-08):

- [Roadmap-v2.2]: Phase numbering continues from v2.1's last phase (14) — v2.2 starts at Phase 15, ends at Phase 26
- [Roadmap-v2.2]: Phase 16 (shared package) precedes everything app-side — type safety dependency for portal code; admin re-export ships in same phase to prove contract
- [Roadmap-v2.2]: Phase 17 (hostname guard inventory) MUST land before Phase 18 — auditing host checks before introducing a second valid host so cutover has a known cleanup target
- [Roadmap-v2.2]: Phase 18 (auth) is prerequisite for any portal feature route — has highest concentration of catastrophic pitfalls (cookie leakage, secret cross-replay, signIn race, OAuth sub divergence)
- [Roadmap-v2.2]: Phase 20 (URL centralization in admin) MUST land before Phase 25 cutover — refactor admin's URL emission BEFORE flipping the 301 so Slack/email/release-note links don't rot
- [Roadmap-v2.2]: Phase 21 (read paths) precedes Phase 22 (write paths) — verify rendering before exposing mutation, smaller blast radius
- [Roadmap-v2.2]: Phase 24 (CI safety) is HARD prerequisite for Phase 25 cutover — verify-deploy-target prevents catastrophic cross-app deploys
- [Roadmap-v2.2]: Phase 26 (sunset) deferred T+90 after Phase 25 cutover; folded into v2.2 roadmap so requirement coverage is complete; reasonable to roll forward into v2.3 if grace period extends
- [Roadmap-v2.2]: Phase 22 marked `research_required: true` — Slack credential ownership operational mechanics (HMAC-proxy contract) settled at SUMMARY level, operational details TBD before plan
- [Roadmap-v2.2]: Phase 24 marked `research_required: true` — `MyAlterLego/shared-workflows` v5 vs per-repo equivalent decision pending
- [Roadmap-v2.2]: Shared package name `@myalterlego/triarch-shared` (matches scope: schema + helpers); auth-context.ts moves to shared package since we're creating it anyway
- [Roadmap-v2.2]: Same Firebase project (`triarch-dev-website`), two new backends `portal-prod` / `portal-dev` — reuses DATABASE_URL, FAH_PROMOTER_SA_KEY, Slack secrets; reversible if it bites
- [Roadmap-v2.2]: Cookies host-only (`__Host-` prefix in prod, NO `domain` attribute); distinct `NEXTAUTH_SECRET` per app; single Google OAuth client with two redirect URIs
- [Roadmap-v2.2]: Portal owns `PORTAL_SLACK_BOT_TOKEN` for direct customer-side posting; admin retains GitHub App key + dispatches workflows via internal HMAC-signed POST from portal
- [Roadmap-v2.2]: Admin sole migration authority; portal has DML-only DB role + no `db:push` script in package.json — defense-in-depth against rogue schema writes
- [Roadmap-v2.2]: Customer email blast list at cutover derived from `project_members.email WHERE role IN ('admin','viewer')`
- [Roadmap-v2.2]: Truth+Treason pilot reactivation deferred to v2.3 milestone candidate (was deferred from v2.0; out of v2.2 scope per Mike's directive)
- [Phase 15-operational-prework]: Repo created in MyAlterLego org (private); ci-cd.yml deferred to Phase 16 scaffold; HTTPS clone used
- [Phase 15-operational-prework]: PORTAL_NEXTAUTH_SECRET: distinct from admin NEXTAUTH_SECRET; secretAccessor to FAH compute SA only (mirrors admin pattern)

### Pending Todos

- Before planning Phase 22: run `/gsd:research-phase 22` to resolve HMAC-proxy operational mechanics for portal→admin GitHub workflow dispatch
- Before planning Phase 24: run `/gsd:research-phase 24` to resolve `MyAlterLego/shared-workflows` v5 immutability question
- Phase 15 planning: include OAuth localhost URIs from start (Pitfall 13) — `http://localhost:3002/api/auth/callback/google` alongside production redirect URI
- Phase 16 planning: ensure portal repo scaffold strips `db:push` and `db:generate` from package.json BEFORE first commit (defense-in-depth alignment with Phase 19 DB-03)
- Phase 18 planning: Vitest assertion on Set-Cookie (AUTH-05) is mandatory — Pitfall 1 catastrophic-leakage guard

### Blockers/Concerns

- Phase 22 is blocked on HMAC-proxy operational research — request/response contract, replay-window, key-rotation procedure, error-surface for portal client must be resolved before plan
- Phase 24 is blocked on shared-workflows immutability research — whether v4 immutable in practice, whether v5 tag accepts new `verify-deploy-target` job + `repo_name` input, or whether per-repo equivalent is needed
- Phase 26 (Sunset) execution gated on T+90 grace period after Phase 25 cutover lands; not a code blocker but a calendar-driven deferral

## Session Continuity

Last session: 2026-05-08T15:24:35.775Z
Stopped at: Completed 15-03-PLAN.md — PORTAL_NEXTAUTH_SECRET created in triarch-vault with FAH secretAccessor IAM
Resume file: None
Next action: `/gsd:plan-phase 15`
