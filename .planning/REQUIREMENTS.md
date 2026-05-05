# Requirements: Triarch Dev Admin — v2.0 Multi-Branch RC + Central Vault + OttoBot Brain

**Defined:** 2026-05-04
**Milestone goal:** Customer-gated parallel release candidates with auto-rebase-and-merge promotion, unified credential storage on GCP Secret Manager, and OttoBot positioned as the canonical Slack control plane with audit trail and expanded scopes.
**Source draft:** `.planning/v1.15-MILESTONE-DRAFT.md`
**Repository state at milestone start:** `v1.14.6` shipped — customer release gating workflow operational end-to-end on admin.triarch.dev.

---

## v2 Requirements

### Vault — Central Secrets

- [ ] **VAULT-01**: New GCP project `triarch-vault` created with Secret Manager API enabled and billing linked
- [ ] **VAULT-02**: Seven shared secrets migrated to `triarch-vault` Secret Manager: `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, `SLACK_PAYLOAD_SECRET`, `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_APP_INSTALLATION_ID`, `SLACK_USER_MAP` (json blob)
- [ ] **VAULT-03**: IAM grants applied — each Firebase project's service account (`firebase-adminsdk-fbsvc@<project>.iam.gserviceaccount.com`) has `roles/secretmanager.secretAccessor` on the specific secrets it needs in `triarch-vault`
- [ ] **VAULT-04**: `@myalterlego/secrets` npm package published with `getSecret(name)` helper wrapping `@google-cloud/secret-manager` client; module-level cache; fallback to `process.env` for local dev
- [ ] **VAULT-05**: `triarch-dev` admin app migrated from per-project Firebase secrets to `@myalterlego/secrets` for the seven shared creds; per-project secrets (DATABASE_URL, NEXTAUTH_SECRET) remain local
- [ ] **VAULT-06**: `triarchsecurity-admin` (CRM) migrated from `settings` table to `@myalterlego/secrets` for Slack and GitHub creds; `settings` table retained for project-scoped non-credential metadata
- [ ] **VAULT-07**: Onboarding runbook (`docs/onboarding-projects.md`) updated to document vault access pattern for new projects

### Schema — DB + GitHub App permissions

- [x] **SCHEMA-01**: `release_logs.branch varchar(256)` column added (nullable for legacy rows; new rows default to `main`); migration backfills existing rows to `main`
- [x] **SCHEMA-02**: `slack_action_audit` table created — columns (id, action_id, actor_email, actor_slack_id, payload_hash, response_status, latency_ms, created_at) with index on (created_at desc) for query performance
- [x] **SCHEMA-03**: GitHub App `Triarch Release Gate` permission upgraded from `contents:read` to `contents:write` (required for merge step in `promote-branch.yml`); installation re-authorized

### Workflow — shared-workflows cross-repo (carried + new)

- [x] **WORKFLOW-01**: `shared-workflows/deploy-firebase.yml` POSTs dev deploy completion to admin's `/api/platform/ingest/release-logs` with version, commitSha, deployedAt, releasedBy, env=dev (carried from v1.14 deferral)
- [x] **WORKFLOW-02**: `shared-workflows/deploy-prod.yml` POSTs prod deploy completion to admin's `/api/releases/promoted` with version, commit_sha, deployed_at, deployed_by (carried from v1.14 deferral)
- [x] **WORKFLOW-03**: `shared-workflows/deploy-firebase.yml` accepts `git_branch` input; calls `firebase apphosting:rollouts:create --git-branch <branch>` for non-main branches; deploys to FAH branch preview URL pattern
- [ ] **WORKFLOW-04**: New `shared-workflows/promote-branch.yml` workflow accepts `branch` input; performs `git fetch origin main && git rebase origin/main` on the branch; runs CI; on green, pushes to main (or `merge --no-ff`); on conflict, returns conflict file list as workflow output and exits non-zero
- [x] **WORKFLOW-05**: `promote-branch.yml` POSTs success or conflict result to admin via signed callback; conflict result includes file list and rebase error message

### RC — Multi-branch parallel release candidates

- [x] **RC-01**: `/projects/{slug}/releases` page groups releases by branch — one collapsible section per active feature branch, plus a "main" section. Each section shows the most recent release(s) for that branch
- [x] **RC-02**: Each RC row displays the preview URL (e.g. `https://feat-change-font--triarch-dev-truthtreason.us-central1.hosted.app`) with an external-link icon; clicking opens the preview in a new tab
- [x] **RC-03**: Each RC has its own admin-only "Approve for Production" button; multiple RCs can be in `dev → approved` state simultaneously
- [x] **RC-04**: `promoteAndAudit` orchestrator dispatches `promote-branch.yml` with `branch` input (replaces v1.14's `deploy-prod.yml` with `tag` dispatch)
- [ ] **RC-05**: OttoBot Slack message includes the branch name in the body (e.g. "feat/change-font v0.15.0-rc.1 approved by mike@triarchsecurity.com")
- [ ] **RC-06**: When `promote-branch.yml` emits a conflict result, admin posts to OttoBot threaded reply: `:warning: Cannot promote {branch} — conflicts with main: {file list}. Rebase manually and redeploy as a fresh RC.`
- [x] **RC-07**: Customer page shows a `Conflict — needs manual rebase` status badge for branches with unresolved conflicts; releases stay queryable but cannot be re-approved until a new RC deploy lands
- [ ] **RC-08**: Concurrent RCs work without interference — approving feat/change-font then approving feat/add-audio results in main containing both feature commits, with no work reverted from the first promotion

### OttoBot — Dispatcher hardening + scope expansion

- [ ] **OTTOBOT-01**: Every `/api/slack/interact` action_id click writes a `slack_action_audit` row capturing action_id, actor email, Slack user_id, payload hash, response status, dispatcher latency
- [ ] **OTTOBOT-02**: OttoBot Slack App scope upgraded to include `chat:write.public`, `app_mentions:read`, `commands` (slash commands); workspace re-authorized
- [ ] **OTTOBOT-03**: Slash command `/triarch deploy <project> <version>` — staff-only (verified against `SLACK_USER_MAP`); triggers `workflow_dispatch` on the project's `deploy-prod.yml` (or `promote-branch.yml` when branch-aware); responds ephemerally with run URL
- [ ] **OTTOBOT-04**: Slash command `/triarch status <project>` — returns current dev/prod release status, last 3 deploy timestamps, and any active RCs as a Slack message
- [ ] **OTTOBOT-05**: App mention handler — `@OttoBot status <project>` mirrors `/triarch status` behavior; subscribed via `app_mentions:read` event
- [ ] **OTTOBOT-06**: Audit log viewer at `/admin/platform/slack-audit` (staff-only) — paginated table of slack_action_audit rows with filters (action_id, actor email, date range)

### Pilot — Truth+Treason multi-branch E2E

- [ ] **PILOT-01**: Truth+Treason consumes the updated `shared-workflows` (single-branch path); first end-to-end run promotes a real release through the full UI → Slack → GitHub App → round-trip path; success criteria documented in milestone audit
- [ ] **PILOT-02**: Multi-branch test in Truth+Treason — create `feat/change-font` and `feat/add-audio` branches; both deploy to preview URLs; customer approves font first → auto-rebase-and-merge to main; customer approves audio → audio rebased on updated main → CI green → auto-merge succeeds with both font + audio changes present in prod (no work reverted)

## v3 Requirements (Deferred)

### Conflict resolution

- **CONFLICT-V3-01**: AI-mediated conflict resolution (currently always Slack-notify on conflict)
- **CONFLICT-V3-02**: Customer-page conflict UI to resolve directly in browser

### Multi-org

- **MULTIORG-V3-01**: Per-org vault isolation (currently single triarch-vault for all)
- **MULTIORG-V3-02**: Multi-tenant GitHub App installation lookup per repo

### Notifications

- **NOTIF-V3-01**: Per-project Slack channel routing (currently global `#release-approvals`)
- **NOTIF-V3-02**: Email notifications for release lifecycle events
- **NOTIF-V3-03**: Slack notification on prod deploy completion (currently round-trip is silent)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Automated dependency upgrades for shared-workflows in pilot projects | Manual ref bump is fine; auto-upgrade is dependabot territory, not v2.0 |
| Smart conflict auto-resolution | Always Slack-notify on conflict — no AI-mediated merge in v2.0 (v3 candidate) |
| Feature flag gating on top of branch RC | Separate concern; v2.0 is preview-deploy + customer-approve, not flag-gating |
| Per-project Slack channel routing | Still global `#release-approvals` for v2.0; per-project is v3 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| VAULT-01 | Phase 1 | Pending |
| VAULT-02 | Phase 1 | Pending |
| VAULT-03 | Phase 1 | Pending |
| VAULT-04 | Phase 1 | Pending |
| VAULT-05 | Phase 1 | Pending |
| VAULT-06 | Phase 1 | Pending |
| VAULT-07 | Phase 1 | Pending |
| WORKFLOW-01 | Phase 2 | Complete |
| WORKFLOW-02 | Phase 2 | Complete |
| WORKFLOW-03 | Phase 2 | Complete |
| SCHEMA-01 | Phase 3 | Complete |
| SCHEMA-02 | Phase 3 | Complete |
| SCHEMA-03 | Phase 3 | Complete |
| WORKFLOW-04 | Phase 4 | Pending |
| WORKFLOW-05 | Phase 4 | Complete |
| RC-01 | Phase 5 | Complete |
| RC-02 | Phase 5 | Complete |
| RC-03 | Phase 5 | Complete |
| RC-07 | Phase 5 | Complete |
| RC-04 | Phase 6 | Complete |
| RC-05 | Phase 6 | Pending |
| RC-06 | Phase 6 | Pending |
| RC-08 | Phase 6 | Pending |
| OTTOBOT-01 | Phase 7 | Pending |
| OTTOBOT-02 | Phase 7 | Pending |
| OTTOBOT-03 | Phase 7 | Pending |
| OTTOBOT-04 | Phase 7 | Pending |
| OTTOBOT-05 | Phase 7 | Pending |
| OTTOBOT-06 | Phase 7 | Pending |
| PILOT-01 | Phase 8 | Pending |
| PILOT-02 | Phase 8 | Pending |

**Coverage:**
- v2 requirements: 31 total
- Mapped to phases: 31 (100%)
- Unmapped: 0

---

*Requirements defined: 2026-05-04*
*Last updated: 2026-05-04 — traceability populated by roadmapper*
