# Roadmap: Triarch Dev Admin

## Milestones

- ✅ **v1.14.0 Customer Release Gating** — Phases 1–5 (shipped 2026-05-04) → [`milestones/v1.14.0-ROADMAP.md`](./milestones/v1.14.0-ROADMAP.md)
- 🚧 **v2.0 Multi-Branch RC + Central Vault + OttoBot Brain** — Phases 1–8 (in progress)

## Phases

<details>
<summary>✅ v1.14.0 Customer Release Gating (Phases 1–5) — SHIPPED 2026-05-04</summary>

- [x] Phase 1: Schema + Membership Migration (4/4 plans) — completed 2026-05-03
- [x] Phase 1.1: Membership Enforcement Audit (6/6 plans) — completed 2026-05-03 (decimal phase inserted)
- [x] Phase 2: Customer Releases Page (5/5 plans) — completed 2026-05-04
- [x] Phase 3: Slack Interactive Approval (5/5 plans) — completed 2026-05-04
- [x] Phase 4: GitHub App Promotion (4/4 plans) — completed 2026-05-04
- [x] Phase 5: Round-trip + shared-workflows + Pilot (4/4 plans) — completed 2026-05-04

**Deferred to v2.0:** WORKFLOW-01, WORKFLOW-02 (cross-repo shared-workflows changes), PILOT-01 (Truth+Treason E2E pilot).
</details>

### 🚧 v2.0 Multi-Branch RC + Central Vault + OttoBot Brain (In Progress)

**Milestone Goal:** Customer-gated parallel release candidates with auto-rebase-and-merge promotion, unified credential storage on GCP Secret Manager, and OttoBot as the canonical Slack control plane with audit trail and expanded scopes.

- [x] **Phase 1: Central Secrets Vault** - GCP `triarch-vault` project + `@myalterlego/secrets` package + all consumers migrated (completed 2026-05-04)
- [x] **Phase 2: shared-workflows Hardening** - v1.14 deferred cross-repo notify steps + branch preview deploy wiring (completed 2026-05-05)
- [x] **Phase 3: Schema + GitHub App Permissions** - `release_logs.branch` column, `slack_action_audit` table, App permission upgrade (completed 2026-05-04)
- [ ] **Phase 4: promote-branch Workflow** - New `promote-branch.yml` rebase/CI/merge workflow with conflict detection + callback
- [ ] **Phase 5: Customer Page RC UI** - Branch-grouped releases, preview URLs, per-RC approve buttons, conflict status badge
- [ ] **Phase 6: promoteAndAudit Rewrite** - Branch-dispatch orchestrator, OttoBot conflict reply, concurrent RC safety
- [ ] **Phase 7: OttoBot Dispatcher Hardening** - Audit logging, scope upgrade, slash commands, app mentions, audit log viewer
- [ ] **Phase 8: Truth+Treason E2E Pilot** - Single-branch E2E smoke test + parallel multi-branch RC validation

## Phase Details

### Phase 1: Central Secrets Vault
**Goal**: Shared credentials live in one canonical location — `triarch-vault` GCP Secret Manager — and every consumer fetches them through a thin npm package with local fallback
**Depends on**: Nothing (first phase)
**Requirements**: VAULT-01, VAULT-02, VAULT-03, VAULT-04, VAULT-05, VAULT-06, VAULT-07
**Success Criteria** (what must be TRUE):
  1. `triarch-vault` GCP project exists with Secret Manager API enabled and all seven shared secrets stored
  2. `@myalterlego/secrets` is published and `await getSecret('SLACK_BOT_TOKEN')` returns the correct value in a deployed admin app
  3. `triarch-dev` admin reads Slack and GitHub App credentials from `@myalterlego/secrets` — no per-project Firebase secrets for those seven keys
  4. `triarchsecurity-admin` (CRM) reads the same Slack/GitHub creds from `@myalterlego/secrets` — `settings` table no longer holds credentials
  5. `docs/onboarding-projects.md` runbook documents the vault access pattern for new projects
**Plans**: 6 plans
- [x] 01-01-PLAN.md — HUMAN provision triarch-vault GCP project + create 7 secrets (VAULT-01, VAULT-02)
- [x] 01-02-PLAN.md — Build & publish @myalterlego/secrets v0.1.0 to GitHub Packages (VAULT-04)
- [x] 01-03-PLAN.md — HUMAN grant secretAccessor IAM to consumer SAs + functional impersonation test (VAULT-03)
- [x] 01-04-PLAN.md — Migrate triarch-dev admin to vault + add /api/platform/health/secrets endpoint (VAULT-05)
- [x] 01-05-PLAN.md — Migrate triarchsecurity-admin CRM to vault + add .npmrc + NODE_AUTH_TOKEN wiring (VAULT-06)
- [x] 01-06-PLAN.md — Update onboarding-projects.md Step 7 + create secrets-vault.md deep-dive (VAULT-07)

### Phase 2: shared-workflows Hardening
**Goal**: Every deploy in shared-workflows notifies the admin control plane — dev deploys POST to release-logs ingest, prod deploys POST to the promoted endpoint, and non-main branch deploys trigger FAH branch preview URLs
**Depends on**: Phase 1 (ADMIN_API_TOKEN access pattern via vault)
**Requirements**: WORKFLOW-01, WORKFLOW-02, WORKFLOW-03
**Success Criteria** (what must be TRUE):
  1. After a `deploy-firebase.yml` run completes, a `release_logs` row appears in admin with `env=dev`, version, commitSha, and deployedAt populated
  2. After a `deploy-prod.yml` run completes, the corresponding release row in admin is updated with `env=prod` status via the `/api/releases/promoted` endpoint
  3. A workflow run with `git_branch=feat/change-font` creates a Firebase App Hosting branch rollout and the preview URL is accessible
**Plans**: 4 plans
- [x] 02-01-PLAN.md — Wave 0 clone + deploy-firebase.yml git_branch input + dev callback (WORKFLOW-01, WORKFLOW-03)
- [x] 02-02-PLAN.md — Create deploy-prod.yml with snake_case prod callback (WORKFLOW-02)
- [x] 02-03-PLAN.md — Tag v2 + admin canary ref bump + ADMIN_API_TOKEN secret + onboarding doc step
- [x] 02-04-PLAN.md — CRM ref bump + ADMIN_API_TOKEN secret + prod-endpoint idempotency E2E

### Phase 3: Schema + GitHub App Permissions
**Goal**: The database has the branch column and audit table needed by subsequent phases, and the GitHub App has write permissions required for the merge step
**Depends on**: Nothing (parallel with Phase 1 and 2)
**Requirements**: SCHEMA-01, SCHEMA-02, SCHEMA-03
**Success Criteria** (what must be TRUE):
  1. `release_logs.branch` column exists; legacy rows are backfilled to `main`; new release ingest rows include branch value
  2. `slack_action_audit` table exists with all required columns and a `created_at desc` index
  3. GitHub App `Triarch Release Gate` has `contents:write` permission and the installation is re-authorized — a test workflow dispatch that writes to a branch succeeds
**Plans**: 3 plans
- [x] 03-01-PLAN.md — Add `release_logs.branch` column + migration 0010 + ingest endpoint update (SCHEMA-01)
- [x] 03-02-PLAN.md — Create `slack_action_audit` table + migration 0011 (SCHEMA-02)
- [x] 03-03-PLAN.md — HUMAN-UAT runbook for GitHub App contents:write upgrade (SCHEMA-03)

### Phase 4: promote-branch Workflow
**Goal**: A reusable `promote-branch.yml` workflow can take any feature branch, rebase it on main, run CI, and either merge to main or report conflicts — with the result posted back to admin
**Depends on**: Phase 2 (shared-workflows foundation), Phase 3 (branch column + GitHub App write permission)
**Requirements**: WORKFLOW-04, WORKFLOW-05
**Success Criteria** (what must be TRUE):
  1. Dispatching `promote-branch.yml` with `branch=feat/change-font` on a clean branch results in a successful rebase, CI run, and merge to main
  2. Dispatching `promote-branch.yml` on a branch with a merge conflict exits non-zero and returns the conflicting file list as workflow output
  3. Admin receives the success or conflict result via signed callback within the workflow run window — the callback payload includes branch, result, and (on conflict) file list
**Plans**: 4 plans
- [ ] 04-01-PLAN.md — promote_attempts schema + migration 0012 (WORKFLOW-05)
- [ ] 04-02-PLAN.md — POST /api/platform/promote-callback endpoint + vitest (WORKFLOW-05)
- [ ] 04-03-PLAN.md — promote-branch.yml workflow (4 jobs) + v3 tag on shared-workflows (WORKFLOW-04)
- [ ] 04-04-PLAN.md — Manual UAT: clean / conflict / ci_failed / concurrent paths (WORKFLOW-04, WORKFLOW-05)

### Phase 5: Customer Page RC UI
**Goal**: The customer releases page shows branches as independent RC groups with preview URLs and per-RC approve buttons, and surfaces conflict status without blocking the rest of the page
**Depends on**: Phase 3 (schema — `release_logs.branch` column required for grouping)
**Requirements**: RC-01, RC-02, RC-03, RC-07
**Success Criteria** (what must be TRUE):
  1. The `/projects/{slug}/releases` page groups releases into collapsible sections by branch — one section per active feature branch plus a "main" section
  2. Each RC row shows a clickable preview URL that opens the branch's FAH preview in a new tab
  3. Each RC row has its own admin-only "Approve for Production" button; two different RCs can both be in `approved` state simultaneously without interference
  4. A branch with an unresolved conflict shows a `Conflict — needs manual rebase` status badge; its approve button is disabled and the row remains queryable
**Plans**: TBD

### Phase 6: promoteAndAudit Rewrite
**Goal**: Approving an RC dispatches the branch-aware `promote-branch.yml` workflow, OttoBot Slack messages include the branch name, conflict results are threaded back into Slack, and two concurrent RC approvals leave main containing both feature sets
**Depends on**: Phase 4 (promote-branch.yml must exist before dispatch can target it)
**Requirements**: RC-04, RC-05, RC-06, RC-08
**Success Criteria** (what must be TRUE):
  1. Clicking "Approve for Production" on an RC dispatches `promote-branch.yml` with the correct `branch` input (not `deploy-prod.yml`)
  2. The OttoBot Slack notification for an approval includes the branch name and version (e.g. "feat/change-font v0.15.0-rc.1 approved by mike@triarchsecurity.com")
  3. When `promote-branch.yml` returns a conflict, admin posts a threaded `:warning:` Slack reply listing the conflicting files and rebase instructions
  4. Approving feat/change-font then approving feat/add-audio results in a main branch containing commits from both features — no prior work is reverted
**Plans**: TBD

### Phase 7: OttoBot Dispatcher Hardening
**Goal**: Every Slack action is audited, OttoBot responds to slash commands and app mentions, and a staff-only viewer in admin shows the full audit trail
**Depends on**: Phase 3 (slack_action_audit table must exist before audit writes begin)
**Requirements**: OTTOBOT-01, OTTOBOT-02, OTTOBOT-03, OTTOBOT-04, OTTOBOT-05, OTTOBOT-06
**Success Criteria** (what must be TRUE):
  1. Every button click through `/api/slack/interact` produces a `slack_action_audit` row with action_id, actor email, Slack user_id, payload hash, response status, and latency
  2. `/triarch deploy <project> <version>` from a staff Slack user triggers the correct workflow dispatch and returns an ephemeral message with the run URL; a non-staff user receives an access-denied ephemeral
  3. `/triarch status <project>` returns current dev/prod release status, last 3 deploy timestamps, and any active RCs
  4. `@OttoBot status <project>` in any channel returns the same response as `/triarch status <project>`
  5. `/admin/platform/slack-audit` shows a paginated, filterable table of audit rows accessible to staff — non-staff receive a 403
**Plans**: TBD

### Phase 8: Truth+Treason E2E Pilot
**Goal**: The full multi-branch RC flow is validated against a real project with real customer interaction — single-branch path first, then parallel concurrent RC promotion with no work reverted
**Depends on**: Phase 2 (shared-workflows), Phase 4 (promote-branch), Phase 5 (UI), Phase 6 (dispatch rewrite), Phase 7 (audit)
**Requirements**: PILOT-01, PILOT-02
**Success Criteria** (what must be TRUE):
  1. Truth+Treason runs a complete single-branch release through the updated shared-workflows path: CI/CD notifies admin, customer approves via UI, OttoBot fires, GitHub App promotes via `promote-branch.yml`, round-trip ingest marks the release promoted — all steps confirmed in milestone audit doc
  2. Two parallel feature branches (`feat/change-font` and `feat/add-audio`) both deploy to preview URLs; customer approves font first — rebase + merge succeeds, main has font; customer approves audio — audio rebases on updated main (which has font), CI green, auto-merge succeeds with both features present in production, no work reverted
**Plans**: TBD

## Progress

**Execution Order:** 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8
(Phase 3 may run in parallel with Phase 1/2; Phase 5 can start as soon as Phase 3 schema is pushed)

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Schema + Membership Migration | v1.14.0 | 6/6 | Complete   | 2026-05-04 |
| 1.1. Membership Enforcement Audit | v1.14.0 | 6/6 | Complete | 2026-05-03 |
| 2. Customer Releases Page | v1.14.0 | 4/4 | Complete   | 2026-05-05 |
| 3. Slack Interactive Approval | v1.14.0 | 3/3 | Complete    | 2026-05-04 |
| 4. GitHub App Promotion | v1.14.0 | 4/4 | Complete | 2026-05-04 |
| 5. Round-trip + shared-workflows + Pilot | v1.14.0 | 4/4 | Complete | 2026-05-04 |
| 1. Central Secrets Vault | v2.0 | 0/6 | Planned | - |
| 2. shared-workflows Hardening | v2.0 | 0/4 | Planned | - |
| 3. Schema + GitHub App Permissions | v2.0 | 0/TBD | Not started | - |
| 4. promote-branch Workflow | v2.0 | 0/4 | Planned | - |
| 5. Customer Page RC UI | v2.0 | 0/TBD | Not started | - |
| 6. promoteAndAudit Rewrite | v2.0 | 0/TBD | Not started | - |
| 7. OttoBot Dispatcher Hardening | v2.0 | 0/TBD | Not started | - |
| 8. Truth+Treason E2E Pilot | v2.0 | 0/TBD | Not started | - |
