# Roadmap: Triarch Dev Admin — v1.14.0 Customer Release Gating

## Overview

The admin app at `MyAlterLego/triarch-dev` is shipped at v1.13.1 with foundation, project registry, automated provisioning, bug/feature tracking, and release log ingestion all operational. This milestone adds **customer release gating**: customer admins review dev deploys for their projects, leave feedback, and approve them for production. Approval triggers a Slack message with interactive buttons, which (after signature verification) dispatches the project's `deploy-prod.yml` workflow via GitHub App. Status round-trips back to admin so the timeline reflects the full lifecycle. Truth+Treason is the pilot.

Build order: schema and access control first (everything depends on them), then customer UI (the visible feature), then Slack integration (the handoff), then GitHub App promotion (the action), then the round-trip + shared-workflows wiring + pilot (close the loop).

## Phases

- [x] **Phase 1: Schema + Membership Migration** — `releaseLogs` schema additions, `project_members` / `release_feedback` / `release_approvals` tables, DB-backed staff role, manage-members admin page (completed 2026-05-03)
- [ ] **Phase 2: Customer Releases Page** — `/projects/{slug}/releases` UI, feedback submission, approval/reject actions, audit trail
- [ ] **Phase 3: Slack Interactive Approval** — Slack App config, signed message with Approve/Reject buttons, signature-verified callback handler
- [ ] **Phase 4: GitHub App Promotion** — GitHub App install, installation-token auth, `workflow_dispatch` of `deploy-prod.yml`
- [ ] **Phase 5: Round-trip + shared-workflows + Pilot** — `/api/releases/promoted` endpoint, paired prod row, shared-workflows updates, full timeline UI, Truth+Treason end-to-end pilot

## Phase Details

### Phase 1: Schema + Membership Migration
**Goal**: Database is ready to express the gating lifecycle (dev/prod env, full status enum, audit-trail tables) and access control moves from a hardcoded email check to a DB-backed role + per-project membership.
**Depends on**: Nothing (first phase)
**Requirements**: REL-A1..A5, MEMBER-01..04, FEEDBACK-01, APPROVAL-01, ADMIN-01
**Success Criteria** (what must be TRUE):
  1. `releaseLogs` table has `env`, `status`, `commit_sha`, `deployed_at` columns; existing rows backfilled with `env='dev'` and `status='dev'`
  2. `project_members` table exists with (project_key, email, role, created_at) and unique (project_key, lower(email))
  3. `release_feedback` and `release_approvals` tables exist with foreign keys to `releaseLogs.id`
  4. `src/lib/auth.ts` no longer hardcodes `@triarchsecurity.com`; staff role lookup goes through the membership/role model
  5. Existing projects in `projects` table have at least one `project_members` row (creator → admin) backfilled
  6. `/admin/platform/projects/{key}/members` page allows staff to add/remove members for a project
  7. Existing release ingest endpoint accepts `env` parameter and persists it; backwards-compatible default is `dev`
**Plans:** 4/4 plans complete
- [x] 01-01-PLAN.md — Drizzle schema additions (releaseLogs columns + project_members + release_feedback + release_approvals) + idempotent backfill SQL
- [x] 01-02-PLAN.md — auth-context helper + auth.ts signIn cutover with env-allowlist fallback
- [x] 01-03-PLAN.md — manage-members admin page + API (GET/POST/DELETE) + projects-page nav button
- [x] 01-04-PLAN.md — projects list membership filtering + release-logs ingest accepts env/commitSha/deployedAt

### Phase 2: Customer Releases Page
**Goal**: Customer admins can see, comment on, and approve/reject their project's dev releases at a project-scoped URL that enforces membership.
**Depends on**: Phase 1
**Requirements**: GATE-01..06, REJECT-01
**Success Criteria** (what must be TRUE):
  1. `/projects/{slug}/releases` returns 404 to anyone who is not a member of that project (and not staff) — does not leak project existence
  2. Page lists releases for the project with version, env, status, commit_sha, deployed_at, approver
  3. Members can post feedback on a release; feedback persists with author email + timestamp and renders chronologically
  4. Project members with role `admin` see "Approve for Production" and "Reject" buttons when status = `dev`; both write audit rows
  5. Approval transitions release status `dev → approved` atomically with the audit insert; rejection transitions `dev → rejected`
  6. Re-approving an already-approved release is a no-op with a clear UI message; rejected releases cannot be re-approved
**Plans**: TBD

### Phase 3: Slack Interactive Approval
**Goal**: Approval action sends a real Slack message with interactive buttons; the callback path is signature-verified and securely identifies the release.
**Depends on**: Phase 2
**Requirements**: GATE-07, GATE-08, GATE-09, GATE-09a, ENV-S01
**Success Criteria** (what must be TRUE):
  1. Slack App created in the workspace with `chat:write` scope; bot token, signing secret, payload secret stored in App Hosting secrets
  2. Approval action posts a message to `#release-approvals` containing project, version, approver, and feedback excerpt, plus interactive Approve/Reject buttons
  3. Each button payload includes a release_id reference signed with `SLACK_PAYLOAD_SECRET`
  4. `POST /api/slack/interact` verifies `X-Slack-Signature` header against the Slack signing secret with a 5-minute replay window; rejects invalid or stale requests with 401
  5. Handler validates the embedded payload signature and resolves the release before taking any action
**Plans**: TBD

### Phase 4: GitHub App Promotion
**Goal**: A successful Slack-button approval dispatches the project's `deploy-prod.yml` via GitHub App installation token (not a PAT).
**Depends on**: Phase 3
**Requirements**: GATE-10, GATE-11, GATE-11a, GATE-11b, ENV-G01
**Success Criteria** (what must be TRUE):
  1. GitHub App created in `MyAlterLego` org with permissions: actions:write, contents:read, metadata:read
  2. App installed on the org with access to admin-managed repos
  3. Installation-token retrieval implemented — JWT-signed exchange, cached for 50 min, regenerated on miss
  4. App credentials (`GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_APP_INSTALLATION_ID`) stored in App Hosting secrets
  5. Slack approve callback dispatches `workflow_dispatch` on `deploy-prod.yml` with `tag` input set to the release version
  6. Slack callback returns 200 within 3 seconds (per Slack rules) — dispatch happens async
**Plans**: TBD

### Phase 5: Round-trip + shared-workflows + Pilot
**Goal**: Close the loop — both dev and prod deploys report back to admin via shared-workflows, the timeline reflects the full lifecycle, and Truth+Treason exercises the workflow end-to-end.
**Depends on**: Phase 4
**Requirements**: GATE-12, GATE-13, WORKFLOW-01, WORKFLOW-02, PILOT-01, PILOT-02
**Success Criteria** (what must be TRUE):
  1. New endpoint `POST /api/releases/promoted` exists; auth via CI service-token header
  2. Endpoint creates a paired prod release row (`env=prod`, `status=promoted`) and updates the dev row's status to `promoted`
  3. Release timeline view renders deployed-to-dev → feedback (chronological) → approved → promoted-to-prod → deployed-to-prod with timestamps and actors
  4. `shared-workflows` repo `ci-cd.yml` POSTs dev deploy completion to admin's release-logs ingest endpoint
  5. `shared-workflows` repo `deploy-prod.yml` POSTs prod deploy completion to admin's `/api/releases/promoted`
  6. Truth+Treason consumes the updated shared-workflows; one full release passes through the entire UI → Slack → GitHub App → round-trip path successfully
  7. Onboarding runbook documented for adding a new project to the gating workflow
**Plans**: TBD

## Progress

**Execution Order:** Phases execute in order: 1 → 2 → 3 → 4 → 5. No parallelization — each phase strictly depends on the previous.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Schema + Membership Migration | 4/4 | Complete   | 2026-05-03 |
| 2. Customer Releases Page | 0/0 | Not started | - |
| 3. Slack Interactive Approval | 0/0 | Not started | - |
| 4. GitHub App Promotion | 0/0 | Not started | - |
| 5. Round-trip + shared-workflows + Pilot | 0/0 | Not started | - |
