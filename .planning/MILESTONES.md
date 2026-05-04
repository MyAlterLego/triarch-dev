# Milestones

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
