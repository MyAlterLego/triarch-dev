---
gsd_state_version: 1.0
milestone: v1.14.0
milestone_name: milestone
status: executing
last_updated: "2026-05-04T15:31:50.079Z"
progress:
  total_phases: 6
  completed_phases: 5
  total_plans: 28
  completed_plans: 26
---

# Triarch Dev Admin — Project State

## Project Reference

See: `.planning/PROJECT.md` (last updated 2026-05-03 — scope reset post-audit)

**Core value:** One control plane to create, manage, and ship Triarch projects — including a dev-to-prod gating workflow that lets customers approve releases before they go live.
**Current focus:** Phase 05 — round-trip-+-shared-workflows+pilot

## Active Milestone: v1.14.0 — Customer Release Gating

**Goal:** Customer admins approve dev releases via admin.triarch.dev → Slack interactive buttons → GitHub App workflow_dispatch → status round-trips back; Truth+Treason is the pilot.
**Phases:** 6 (Phase 1.1 inserted)
**Requirements:** 42 (32 original + 10 added in Phase 1.1)
**Status:** Executing Phase 05

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

- [Phase 01]: requireStaff() helper is local to each route file (copy-paste is fine per Plan 04 note — no shared import coupling)
- [Phase 01]: Manage Members button rendered for all /admin users (access enforced server-side); conditional isStaff render deferred to post-pilot if /admin widens access
- [Phase 01.1-01]: requireAdmin preserved as deprecated alias of requireSignedIn — identical signature keeps 32 callsites compiling through v1.14.x rollout
- [Phase 01.1-01]: DB unreachable in requireStaff/requireMembership returns 403 (fail-closed) — cannot prove role without successful lookup
- [Phase 01.1]: access-logs classified staff-only despite project column — audit trail is internal accountability, not customer data
- [Phase 01.1]: reports/[id] DELETE restricted to staff-only within Plan 05 despite project-detail classification
- [Phase 01.1]: projects/route.ts GET keeps existing membership filter; POST uses requireStaff — dual method treatment within Plan 04
- [Phase 01.1-04]: reports/route.ts classified project-list (not staff-only) — reports are customer-deliverable, non-staff see only their project's reports
- [Phase 01.1-03]: settings/route.ts and service-offerings/route.ts POST preserve { error, session } destructure — session used for userId/createdBy
- [Phase 01.1-03]: No ctx added speculatively to any callsite — none of the 23 handlers use ctx in body logic
- [Phase 01.1-06]: Task 3 was no-op — 13 of 14 admin pages are client components delegating to the now-membership-aware API; only the dashboard needed an inline filter
- [Phase 01.1-06]: Dashboard DB-error fallback (!ctx) passes null projectKeys → full view, mirrors API convention from Plans 03/04/05
- [Phase 01.1-06]: Empty memberships for non-staff → zeros + empty Project Health grid (not 403/redirect), consistent with API empty-list behavior
- [Phase 02-01]: reason column uses text() not varchar(500) — server-side 500-char limit; matches releaseFeedback.body pattern
- [Phase 02-01]: DB push deferred to human — DATABASE_URL is Firebase secret, not in local shell; same pattern as Phase 01-01
- [Phase 02]: CustomerHeader is a client component (signOut requires next-auth/react client-only import)
- [Phase 02]: notFound() called for both missing project and non-member — indistinguishable 404 for GATE-01 no-leak guarantee
- [Phase 02-04]: Idempotent re-approval returns 200 with alreadyApproved:true + existing row; double-rejection is 409 per REJECT-01
- [Phase 02-04]: Non-members receive 404 (not 403) to avoid leaking project existence — same pattern as release-logs/[id]
- [Phase 02-05]: Auto-dismiss timer for success toasts lives in ReleasesClient useEffect, not in Toast.tsx — Toast is purely presentational
- [Phase 02-05]: Countdown intervals tracked per-releaseId in approveStep Record — supports multiple expanded rows simultaneously
- [Phase 02-05]: GET pagination endpoint mirrors page.tsx sort exactly (coalesce DESC) for stable offset semantics
- [Phase 03]: SLACK_RELEASE_APPROVAL_CHANNEL is plain env var (RUNTIME-only) with #release-approvals default; Slack secrets carry no availability field (App Hosting RUNTIME default); HUMAN-UAT runbook is formal gate for ENV-S01
- [Phase 03-slack-interactive-approval]: RejectResult uses discriminated union — callers map code to HTTP status; reason trimming in helper for single source of truth
- [Phase 03-slack-interactive-approval]: HMAC-SHA256 payload signing uses base64url sig packed as {releaseId}.{nonce}.{sig} for Slack button value compactness
- [Phase 03-slack-interactive-approval]: SLACK_USER_MAP initially empty — Mike populates during HUMAN-UAT plan 03-05
- [Phase 03-slack-interactive-approval]: notifyReleaseApproved takes pre-truncated feedbackExcerpt (caller's job) — keeps block construction declarative
- [Phase 03-slack-interactive-approval]: Slack call is awaited inside try/catch (not unawaited) — serverless runtime keeps function alive; errors are swallowed not propagated
- [Phase 03-slack-interactive-approval]: Guard on !result.alreadyApproved prevents duplicate Slack posts on idempotent re-approvals
- [Phase 03-slack-interactive-approval]: req.text() is the only body read — formData() would consume the stream and break HMAC verification
- [Phase 03-slack-interactive-approval]: Reject reason fixed as 'Rejected via Slack' for v1.14 — modal input deferred per CONTEXT.md Area 4
- [Phase 03-slack-interactive-approval]: vitest.config.ts added to resolve @/ alias for test imports (Rule 3 fix)
- [Phase 04-github-app-promotion]: promotionDispatchedAt + promotionDispatchedBy columns nullable — legacy rows and dev-only releases keep NULL; DB push deferred to Mike post-merge per Phase 01-01 and 02-01 precedent
- [Phase 04]: RUNTIME-only availability (no field) for GitHub App secrets in apphosting.yaml — matches Phase 3 Slack pattern
- [Phase 04-02]: JWT iat=now-60s, exp=now+9min: 60-sec past-skew handles clock drift; 1-min margin under GitHub's 10-min ceiling
- [Phase 04-02]: 50-min installation token TTL (not 60-min) — 10-min safety margin under GitHub's lifetime; single-flight latch prevents concurrent JWT signing
- [Phase 04]: promoteAndAudit is fire-and-forget (not awaited) in route.ts - Slack 3-second rule compliance
- [Phase 04]: Audit columns updated on dispatch ATTEMPT regardless of outcome; NOT updated on project-lookup failure (no attempt)
- [Phase 04]: chat.update strictly guarded to failure path - success path never amends the original Slack message
- [Phase 05-round-trip-+-shared-workflows+pilot]: format.ts shared module extracted from ReleasesClient for formatRelativeTime/formatDeployedAt — avoids circular import from Timeline.tsx into 800-line client component
- [Phase 05-round-trip-+-shared-workflows+pilot]: pairedProd only populated for env='dev' rows — prod rows surface via dev row's pairedProd field to avoid double-listing

## Stopped At

Completed 04-01-PLAN.md (Wave 1) — Schema delta: two nullable promotion dispatch audit columns (promotionDispatchedAt, promotionDispatchedBy) added to releaseLogs; migration 0009_promotion_dispatch_audit.sql generated; tsc + build + 32/32 tests all pass. DB push deferred to Mike per precedent.

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
| 2026-05-03 | Phase 01 deployed live — apphosting.yaml fix (PR #6) bound NODE_AUTH_TOKEN→GITHUB_PACKAGES_TOKEN secret; first successful FAH rollout in 2 days. Cloud Run revision triarch-dev-build-2026-05-03-005 serving traffic. UAT items 1, 2, 7 verified. |
| 2026-05-03 | Live test with mike@mikegeehan.com (darksouls-rpg admin, non-staff) revealed access-control gap: 32 endpoints using requireAdmin() check session-only, not staff role. Inserted Phase 1.1 (Membership Enforcement Audit) before Phase 2; added MEMBER-AUDIT-01..10 reqs. |
