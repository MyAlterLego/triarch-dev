# Requirements: Triarch Dev Admin — v1.14.0 Customer Release Gating

**Defined:** 2026-05-03 (post-audit scope reset)
**Milestone goal:** Customer admins approve dev releases; approval triggers Slack-driven prod promotion via GitHub App; status round-trips back to admin so the timeline reflects the full lifecycle.
**Repository state at scope reset:** `v1.13.1` shipped — foundation, projects, bugs, features, release logs already operational.

---

## Phase 1 — Schema + Membership Migration

Foundation for everything else. Database extensions + access control move to a DB-backed model.

### Schema additions

- [x] **REL-A1**: `releaseLogs.env` column added (text enum: `dev` | `prod`); existing rows backfilled to `dev`
- [x] **REL-A2**: `releaseLogs.status` column added (text enum: `dev` | `pending_approval` | `approved` | `rejected` | `promoted`); existing rows backfilled to `dev`
- [x] **REL-A3**: `releaseLogs.commit_sha` column added (text, nullable for legacy rows); populated for new rows from CI payload
- [x] **REL-A4**: `releaseLogs.deployed_at` column added (timestamp, nullable); populated for new rows from CI payload
- [ ] **REL-A5**: Existing release ingest endpoint (`/api/platform/ingest/release-logs`) accepts `env` and writes it; defaults to `dev` if omitted (backwards-compatible)

### Membership model

- [x] **MEMBER-01**: `project_members` table created — columns (id, project_key, email, role, created_at), unique index on (project_key, lower(email))
- [ ] **MEMBER-02**: Per-project access enforced — page and API guards verify the requesting user is a member of the project (or has staff role) before returning project-scoped data
- [x] **MEMBER-03**: `staff` role replaces hardcoded `email.endsWith('@triarchsecurity.com')` check in `src/lib/auth.ts`; staff users are seeded via membership rows where `project_key = '*'` (wildcard) or via a parallel `users.role` column on the existing user model — implementer chooses the cleaner shape
- [x] **MEMBER-04**: Backfill — for every existing project in `projects` table, insert a `project_members` row for the project's creator email (or `mike@triarchsecurity.com` if creator unknown) with role `admin`

### Audit-trail tables

- [x] **FEEDBACK-01**: `release_feedback` table created — columns (id, release_id, author_email, body, created_at), foreign key to `releaseLogs.id`
- [x] **APPROVAL-01**: `release_approvals` table created — columns (id, release_id, approver_email, approved_at, ip_address, user_agent), foreign key to `releaseLogs.id`

### Manage-members admin page

- [ ] **ADMIN-01**: `/admin/platform/projects/{key}/members` page — staff-only — list members for a project, add member by email + role, remove member; minimal UI mirroring existing admin patterns

---

## Phase 2 — Customer Releases Page

Customer-facing gating UI lives at `/projects/{slug}/releases`.

- [ ] **GATE-01**: Route `/projects/{slug}/releases` renders only if requesting user is a member of the project or has `staff` role; otherwise 404 (do not leak project existence to non-members)
- [ ] **GATE-02**: Page lists releases for the project ordered by `deployed_at` desc, with columns: version, env, status badge, commit_sha (short), deployed_at, approver (if present)
- [ ] **GATE-03**: Each release row supports inline feedback submission; submitted feedback persists to `release_feedback` with author email + timestamp; previously-submitted feedback is rendered chronologically beneath the row
- [ ] **GATE-04**: "Approve for Production" button visible only to project members with role `admin` and only when `status = 'dev'`; disabled in any other state
- [ ] **GATE-05**: Approval action writes a `release_approvals` row capturing approver email, timestamp, request IP, and user-agent; idempotent — second approval attempt for an already-approved release is a no-op with a clear UI message
- [ ] **GATE-06**: Approval transitions `releaseLogs.status` from `dev` → `approved` atomically with the audit-row insert
- [ ] **REJECT-01**: "Reject" button (admin-only, only when `status = 'dev'`); writes a `release_approvals` row with a `rejected_at` field OR a separate `release_rejections` table — implementer chooses; transitions status to `rejected`. Rejected releases cannot be re-approved without a new dev deploy

---

## Phase 3 — Slack Interactive Approval

Outgoing message + signed-callback handler.

- [ ] **GATE-07**: Approval action POSTs a Slack message to `#release-approvals` via Slack App Web API (`chat.postMessage`) — message contains project name, version, approver, and feedback excerpt
- [ ] **GATE-08**: Slack message includes interactive buttons `Approve & Promote` and `Reject` (action IDs include a signed reference to the release_id; signature uses `SLACK_PAYLOAD_SECRET` env var, distinct from the Slack signing secret)
- [ ] **GATE-09**: New endpoint `POST /api/slack/interact` — verifies `X-Slack-Signature` header against `SLACK_SIGNING_SECRET` per Slack's HMAC scheme; rejects with 401 if invalid or replay-window exceeded (5 min)
- [ ] **GATE-09a**: Handler validates the embedded payload signature, looks up the release, checks the actor's Slack user identity is mapped to a known staff email, and dispatches the next phase
- [ ] **ENV-S01**: Slack App created in Slack workspace with `chat:write` scope; bot token, signing secret, and payload secret stored in App Hosting secrets (documented in `apphosting.yaml` secret references)

---

## Phase 4 — GitHub App Promotion

Replace any PAT-based assumptions with a GitHub App installation token, used to dispatch `deploy-prod.yml`.

- [ ] **GATE-10**: Slack approve callback dispatches `workflow_dispatch` on the project's `deploy-prod.yml` with `tag` input set to the release version; non-blocking (returns 200 to Slack immediately, does the dispatch async)
- [ ] **GATE-11**: Dispatch uses GitHub App installation token (NOT a PAT) — short-lived (≤1h), scoped to `actions:write` on `MyAlterLego` org
- [ ] **GATE-11a**: GitHub App created in `MyAlterLego` org with permissions: `actions: write`, `contents: read`, `metadata: read`; installed on org with access to all admin-managed repos
- [ ] **GATE-11b**: Installation-token retrieval implemented — JWT signed with private key, exchanged for installation token, cached in-process for 50 minutes; on cache miss, regenerate
- [ ] **ENV-G01**: GitHub App credentials in App Hosting secrets: `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY` (PEM), `GITHUB_APP_INSTALLATION_ID`

---

## Phase 5 — Round-trip + shared-workflows + Timeline UI

Close the loop: shared-workflows reports both dev and prod deploys; admin renders the full lifecycle.

- [ ] **GATE-12**: New endpoint `POST /api/releases/promoted` — accepts `{project, version}`, verifies a CI service-token header, locates the dev release row by (project, version), creates a paired prod release row (`env=prod`, `status=promoted`, copy of commit_sha/deployed_at from CI payload), updates the dev row's status to `promoted`
- [ ] **GATE-13**: Release detail page (or extension of GATE-01 page) shows full timeline for a version: deployed-to-dev → feedback chronological → approved → promoted-to-prod → deployed-to-prod, each with timestamp and actor
- [ ] **WORKFLOW-01**: `shared-workflows` repo `ci-cd.yml` notify step (or new dedicated step) POSTs to `${ADMIN_API_URL}/api/platform/ingest/release-logs` with `env=dev`, version, commit, deployed_at; uses CI service token from `secrets.ADMIN_API_TOKEN`
- [ ] **WORKFLOW-02**: `shared-workflows` repo `deploy-prod.yml` notify step POSTs to `${ADMIN_API_URL}/api/releases/promoted` with `{project, version, commit, deployed_at}`; same auth
- [ ] **PILOT-01**: Truth+Treason consumes the updated shared-workflows; first end-to-end run promotes a real release through the full UI → Slack → GitHub App → round-trip path; success criteria documented in milestone audit
- [ ] **PILOT-02**: After pilot success, runbook for onboarding a new project to the gating workflow added under `Plans/` or admin docs

---

## Out of scope for this milestone

Captured in `BACKLOG.md`:
- PROJ-03 project detail page (gating page is reachable directly via `/projects/{slug}/releases`; full project detail is a follow-up)
- BUG-03 Kanban view (list view exists; Kanban is UX nice-to-have)
- BUG-06 bulk operations
- FEAT-04 feature detail with linked bugs
- CREATE-03 auto-add CI/CD files to scaffolded repos
- CREATE-07 GitHub repo secrets provisioning
- CREATE-10/11 customer admin email seeding in creation wizard
- MIG-01..03 darksouls-rpg data migration to central DB
- Multiple staging environments per project
- Auto-rollback on prod deploy failure
- N-of-M sign-offs for sensitive projects

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| REL-A1, REL-A2, REL-A3, REL-A4 | Phase 1 | Complete (01-01) |
| REL-A5 | Phase 1 | Pending (01-04) |
| MEMBER-01, MEMBER-04 | Phase 1 | Complete (01-01) |
| MEMBER-03 | Phase 1 | Complete (01-02) |
| MEMBER-02 | Phase 1 | Pending (01-04) |
| FEEDBACK-01, APPROVAL-01 | Phase 1 | Complete (01-01) |
| ADMIN-01 | Phase 1 | Pending |
| GATE-01, GATE-02, GATE-03, GATE-04, GATE-05, GATE-06 | Phase 2 | Pending |
| REJECT-01 | Phase 2 | Pending |
| GATE-07, GATE-08, GATE-09, GATE-09a | Phase 3 | Pending |
| ENV-S01 | Phase 3 | Pending |
| GATE-10, GATE-11, GATE-11a, GATE-11b | Phase 4 | Pending |
| ENV-G01 | Phase 4 | Pending |
| GATE-12, GATE-13 | Phase 5 | Pending |
| WORKFLOW-01, WORKFLOW-02 | Phase 5 | Pending |
| PILOT-01, PILOT-02 | Phase 5 | Pending |

**Coverage:**
- v1.14.0 requirements: 32 total
- Mapped to phases: 32
- Unmapped: 0

---
*Defined 2026-05-03 — scope set post-audit of v1.13.1 codebase.*
