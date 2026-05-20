# Milestones

## v2.7 Bulk Triage Actions (L3) — BACKLOG

**Goal:** Turn admin.triarch.dev into a multi-item action surface so Mike doesn't have to triage items one-by-one. Bulk-approve N pending deal-suggestions in one click; bulk-reassign contacts across projects; bulk-archive actions before a date (mirrors the manual `scripts/.archive-stale-actions.ts` Mike ran on 2026-05-20 for 37 March follow-ups).

**Why now (after L2):** L2 surfaces what's failing or slow at a per-cron level. L3 surfaces what's piled up at a per-queue level. Together they cover the two daily-driver friction shapes: "something's broken, fix it" (L2) and "queue is big, drain it" (L3).

**Target capabilities:**
- Multi-select on each triage / actions / inbox list view
- Bulk-approve / bulk-dismiss / bulk-reassign actions (driven by existing single-item endpoints, composed server-side for atomic write + audit per item)
- Per-batch idempotency keys (clicking twice doesn't double-apply)
- Audit JSON written per item (mirrors `docs/reports/actions-bulk-archive-apply-*.json` shape)
- Confirmation modal showing exact row count + first 10 sample rows before commit
- "Undo last bulk action" within 5 minutes (writes a reverse-action audit row)

**Non-goals for v2.7:**
- Free-form bulk SQL (too dangerous)
- Bulk schema changes (out of scope — those go through migrations)
- Cross-project bulk (each project's bulk action is per-project for blast radius containment)

---

## v2.6 Cron Control Panel (L2) — BACKLOG

**Goal:** Make the cron layer (classifier, event-dispatcher, granola-synthesizer, briefing, intelligence-refresh, slack-ingest, slack-thread-attention, calendar-sync, etc.) visible and operable from `/admin/modules/cron`. Today the only way to know if a cron stopped firing is to grep FAH logs; the only way to manually re-fire one is `gcloud scheduler jobs run`. L2 makes both into UI.

**Why now (after L1):** L1 proves the action-button pattern. L2 applies the pattern to a higher-value control surface — cron health is the single biggest blind spot in the morning briefing (see 2026-05-20 root cause analysis where a `channel_not_found` Slack error in the synthesizer + a missed `JOB_SECRET` hypothesis cost two hours of investigation).

**Target capabilities:**
- `/admin/modules/cron` page lists every Cloud Scheduler job per project: schedule, last_attempt, last_status, success_rate_24h, last_error (if any)
- "Trigger now" button per cron (auth-gated, JIT-creds-gated for prod jobs, audit-logged)
- "Pause" / "Resume" toggle per cron (writes to Cloud Scheduler API)
- Heartbeat watchdog: if a cron hasn't fired within 2× its interval, the page row goes red and the morning briefing flags it
- One-click "view logs for this cron" link to FAH log viewer with the right filter pre-applied
- Per-cron config view (env vars bound, secret versions in use, last deploy)

**Non-goals for v2.6:**
- Editing cron schedules from UI (still done via apphosting.yaml + redeploy)
- Cross-project cron view in v1 (per-project only)
- Auto-remediation (L5 territory)

---

## v2.5 Admin Action Buttons (L1) — ACTIVE

**Goal:** Take the read-only compliance dashboard at `/admin/modules/ci-cd` and add the two highest-friction action buttons next to every project row: **Promote dev → main** (creates PR) and **Merge PR** (merges open dev→main PR). Mirrors the `gh pr create --base main --head dev` + `gh pr merge` calls Mike was running by hand on 2026-05-20.

**Why now:** L1 proves the action-button pattern on a low-risk surface. The data is already loaded on the CI/CD page; we're just adding action buttons next to read-only state. PR creation and merging are inherently reversible at the GitHub layer (close PR, revert merge commit) so blast radius is small. Once the pattern works, L2 (cron control) and L3 (bulk triage) reuse the same `/api/platform/actions/*` shape.

**Target capabilities:**
- New endpoint `POST /api/platform/actions/promote-dev-to-main` — creates PR base=main, head=dev, idempotent (returns existing PR if open), staff-only, audit-logged
- New endpoint `POST /api/platform/actions/merge-pr` — finds open dev→main PR for the project, merges it, staff-only, audit-logged
- New "Promote dev → main" button on each `/admin/modules/ci-cd` row where `verdict = 'pass'` or `'never_promoted_pass'`
- New "Merge PR #N" button on each row where there's an open dev→main PR with checks green
- Two-step confirm pattern (mirrors `PromoteButton.tsx` from v2.1 Phase 09)
- Every click writes to `approval_events` with `subject_type` `'cicd_promote_dev_to_main'` or `'cicd_merge_pr'`
- 60s idempotency window per (user, project, action) — clicking twice within 60s is a no-op

**Phases (ordered):**
- **Phase 39: Backend action endpoints** (this PR) — `createPullRequest` helper in `github-app.ts` + 2 route files + audit + tests
- **Phase 40: UI buttons** — `PromoteDevToMainButton.tsx` + `MergePrButton.tsx` + wire into `/admin/modules/ci-cd/page.tsx`
- **Phase 41: E2E verification + runbook** — manual UAT against a feature branch + audit-row verification

**Non-goals for v2.5:**
- Per-project permission tiers (admin-only for all actions in v1)
- Bulk-promote across multiple projects (single-project per click)
- Automatic gating on CL-1..CL-6 compliance (v1 button is enabled when `verdict=pass` only)
- Slack-side trigger of these same actions (deferred — Slack already has OttoBot for prod promotion; admin is the web surface)

---

## v2.1 Pipeline UI (Shipped: 2026-05-08)

**Phases completed:** 7 phases, 23 plans, 43 tasks

**Key accomplishments:**

- Composite index `(project, env, deployed_at DESC)` on `release_logs` declared in Drizzle schema and shipped as migration 0013 — satisfying Pitfall 8 guard that index must deploy with the dashboard query
- Testable `getProjectPipelineSummaries()` server helper with DISTINCT ON query, COALESCE null handling, and what-changed one-liner derivation covering parity/dev-ahead/inverted pipeline states
- Pipeline-aware project health tiles with prod/dev stacked rows, mono version font, relative timestamps, top-right amber pending-approval pill, and what-changed one-liner wired from getProjectPipelineSummaries — version 2.4.0
- Drizzle schema adds actor_source audit column and partial unique index preventing double-promote races, migration 0014 ships as the next sequential step after Phase 8's 0013
- promoteAndAudit signature widened with nullable channelId/messageTs/slackUserName; web-origin path posts fresh Slack channel message via new postSlackChannelMessage helper; 12 Vitest tests green
- Staff-only POST /api/admin/releases/[id]/promote with UPDATE-with-WHERE-IS-NULL atomic dispatch guard mirrored in Slack handler; approveRelease/rejectRelease write actor_source='web' to release_approvals
- One-liner:
- One-liner:
- One-liner:
- Pure regex commit message parser with 27 Vitest tests — extracts BUG/FEAT UUID refs and external #N GitHub issues via 3-pattern approach with full UUID format validation, dedup, and verb-prefix double-count guard
- Pure Slack mrkdwn injection and Unicode trickery sanitizers (sanitizeForSlack + sanitizeForRender) with 27-case Vitest coverage — LINK-07 delivered alongside the commit parser per roadmap lock decision
- DB-validated commit ref stamper using inArray batch queries writes release_log_links rows with source='commit', hooked non-blockingly into the CI release ingest route via try/catch after INSERT
- Staff-only GET/POST/DELETE link API routes with requireStaff guards, LinksClient optimistic chip island with blue/teal gradient visual distinction per DESIGN-REFERENCE.md, and sanitizeForSlack applied at all three slack.ts post chokepoints — LINK-04 and LINK-07 fully delivered
- useEffect mount-fetch added to LinksClient.tsx — existing release_log_links chips now hydrate from GET /api/admin/release-logs/[id]/links on every release row expand, closing the LINK-04 chip-visibility gap
- Drizzle typed query helpers for bug/feature release history — getReleaseHistoryForBug + getReleaseHistoryForFeature with 7-test Vitest TDD suite (RED → GREEN, ISO timestamps)
- Bug detail page at /admin/modules/bug-reports/[id] with staff auth, two-column layout, and ReleasedInSidebar (text-violet-300 version mono) wired to getReleaseHistoryForBug; list page row titles now Link to detail page
- Feature detail page at /admin/modules/feature-requests/[id] with staff auth, two-column layout, and ReleasedInSidebar (reused from 12-02) wired to getReleaseHistoryForFeature; feature list row titles now Link to detail page — closes LINK-06 and completes Phase 12
- One-liner:
- SWR-driven BranchPreviewClient island with 5s polling/terminal pause, POST dispatch, in-flight banner (violet halo per DESIGN-REFERENCE), success/failed/timeout pills, toast surfaces for 400/409/502, and top-of-list integration into ReleasesClient — Phase 13 complete at v2.7.0.
- Server-side data layer for Phase 14 customer page: per-release entry-type counts from release_log_links (one inArray batch query) and aggregated "what's coming to prod" summary using release-as-unit bucketing with fixes-take-precedence, wired into page.tsx and passed as optional back-compat props to ReleasesClient
- Two new client component islands (FilterChips, WhatsComingCard) with full Vitest RTL coverage, wired into ReleasesClient via URL-mirrored filter state (router.replace shallow) and client-side useMemo filter math — delivers CUST-01, CUST-02, DIFF-02 visible surface
- BranchPreviewClient split into BranchPreviewBanner (global singleton) + BranchPreviewButton (per-section, admin-only) sharing one SWR cache key; BranchSection header restructured to avoid button-in-button; ReleasesClient mounts singleton banner; v2.8.0 closes v2.1 Pipeline UI milestone

---

## v1.14.0 Customer Release Gating (Shipped: 2026-05-04)

**Phases completed:** 6 phases, 28 plans, 45 tasks

**Key accomplishments:**

- Drizzle schema extended with four nullable releaseLogs columns and three new tables (project_members with lower(email) unique index, release_feedback, release_approvals), plus idempotent backfill SQL for post-migration data seeding
- DB-backed membership lookup helper (getCurrentUserContext) replaces hardcoded @triarchsecurity.com allowlist in signIn callback, with try/catch fallback to env-allowlist for safe v1.14 rollout
- Staff-only manage-members page at /admin/platform/projects/{key}/members with GET/POST/DELETE API endpoints; Manage Members nav button added to each project card
- Membership-aware GET /api/platform/projects (staff=all, non-staff=filtered) and extended POST /api/platform/ingest/release-logs accepting env/commitSha/deployedAt with 'dev' defaults for backwards-compatible CI integration
- One-liner:
- One-liner:
- One-liner:
- One-liner:
- Fetch-then-membership-check pattern applied to 4 project-detail endpoints returning 404 (not 403) to non-members, with reports DELETE gated to staff-only.
- One-liner:
- releaseApprovals.reason column (text, nullable) added for REJECT-01 audit trail, plus three Drizzle relations() declarations linking releaseLogs ↔ releaseFeedback ↔ releaseApprovals, migration 0008 generated
- Customer-only layout, CustomerHeader, and server-component releases page with membership-enforced 404-no-leak gate (GATE-01) and Drizzle relational fetch with feedback + approvals join
- Approve (idempotent) and reject (required reason) endpoints atomically insert release_approvals audit rows and update release_logs.status via db.transaction(); admin-only, jose JWT session, IP/UA captured from headers
- Full interactive release-table client with two-step approve countdown, reject inline form, feedback compose/delete, hand-rolled Toast component, error banner, empty state, skeleton, and Load more pagination — Phase 2 feature-complete
- One-liner:
- One-liner:
- One-liner:
- One-liner:
- apphosting.yaml wired with four Slack secrets/env vars; 126-line HUMAN-UAT runbook covers Slack App creation, secret seeding via firebase apphosting:secrets:set, identity mapping, and end-to-end smoke test
- Two nullable promotion dispatch audit columns added to releaseLogs via Drizzle migration 0009; migration named descriptively; tsc + build + 32/32 tests all pass
- RS256 JWT signer + 50-min installation token cache + single-flight latch via Node built-in crypto, with 11-test Vitest suite covering cache lifecycle, concurrency, and credential-leak guards
- apphosting.yaml exposes GITHUB_APP_ID/PRIVATE_KEY/INSTALLATION_ID at RUNTIME; 04-HUMAN-UAT.md is the self-contained 8-step runbook for creating the GitHub App, pushing secrets, and verifying end-to-end dispatch
- Slack approve click triggers fire-and-forget dispatchWorkflow(deploy-prod.yml) via promoteAndAudit; success posts :rocket: threaded reply; failure posts :warning: + amends original message via chat.update; audit columns always record the dispatch attempt
- POST /api/releases/promoted — per-project Bearer auth, atomic INSERT prod row + UPDATE dev row status, idempotent replay returns 200 + existing row; full Vitest TDD suite (6 cases)
- Vertical lifecycle timeline inside expanded release rows — 5 event kinds (deployed-dev/feedback/approved/promoted/deployed-prod) with lucide icons, actor emails, and relative timestamps using only Phase 2 zinc/teal/amber/red/blue tokens
- 6-step onboarding checklist at docs/onboarding-projects.md — byte-identical planning-archive copy + admin CLAUDE.md reference; covers project creation through full E2E approve flow (PILOT-02)
- 561-line master closeout checklist consolidating all deferred human steps across Phases 2–5: DB pushes (0008 + 0009), Slack App, GitHub App, shared-workflows YAML, Truth+Treason pilot onboarding, and a 14-step E2E smoke test

---
