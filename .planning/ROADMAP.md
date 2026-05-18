# Roadmap: Triarch Dev Admin

## Milestones

- ✅ **v1.14.0 Customer Release Gating** — Phases 1–5 (shipped 2026-05-04) → [`milestones/v1.14.0-ROADMAP.md`](./milestones/v1.14.0-ROADMAP.md)
- ✅ **v2.0 Multi-Branch RC + Central Vault + OttoBot Brain** — Phases 1–7.5 (shipped 2026-05-06)
- ✅ **v2.1 Pipeline UI** — Phases 8–14 (shipped 2026-05-08) → [`milestones/v2.1-ROADMAP.md`](./milestones/v2.1-ROADMAP.md)
- ✅ **v2.2 Customer Portal Split** — Phases 15–26 (shipped 2026-05-10)
- 🚧 **v2.3 Dev/Prod Contract Adoption** — Phases 27–35 (active, started 2026-05-16) → enforces the [Dev/Prod Distinction Contract](../public/ci-cd/dev-prod-customer-contract.md) CL-1..CL-6 across the portfolio

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

<details>
<summary>✅ v2.0 Multi-Branch RC + Central Vault + OttoBot Brain (Phases 1–7.5) — SHIPPED 2026-05-06</summary>

- [x] Phase 1: Central Secrets Vault (6/6 plans) — completed 2026-05-04
- [x] Phase 2: shared-workflows Hardening (4/4 plans) — completed 2026-05-05
- [x] Phase 3: Schema + GitHub App Permissions (3/3 plans) — completed 2026-05-04
- [x] Phase 4: promote-branch Workflow (4/4 plans) — completed 2026-05-05
- [x] Phase 5: Customer Page RC UI (5/5 plans) — completed 2026-05-05
- [x] Phase 6: promoteAndAudit Rewrite (4/4 plans) — completed 2026-05-05
- [x] Phase 7: OttoBot Dispatcher Hardening (6/6 plans) — completed 2026-05-05
- [x] Phase 7.5: Dev Cluster + Admin Dev Backend (5/5 plans) — completed 2026-05-05
</details>

<details>
<summary>✅ v2.1 Pipeline UI (Phases 8–14) — SHIPPED 2026-05-08</summary>

- [x] Phase 8: Admin Home Pipeline Visibility (3/3 plans) — completed 2026-05-08
- [x] Phase 9: Per-Project Pipeline Page and Web-UI Promote (5/5 plans) — completed 2026-05-08
- [x] Phase 10: Schema Gate (1/1 plan) — completed 2026-05-08
- [x] Phase 11: Commit Parser and Tracker Linkage Authoring (5/5 plans) — completed 2026-05-08
- [x] Phase 12: Bug and Feature Detail Pages (3/3 plans) — completed 2026-05-08
- [x] Phase 13: Branch Preview Swap (3/3 plans) — completed 2026-05-08
- [x] Phase 14: Customer Page Integration (3/3 plans) — completed 2026-05-08

**Full archive:** [`milestones/v2.1-ROADMAP.md`](./milestones/v2.1-ROADMAP.md)
</details>

### v2.3 Dev/Prod Contract Adoption (Phases 27–35) — ACTIVE

Adopt the [Dev/Prod Distinction Contract](../public/ci-cd/dev-prod-customer-contract.md) (PR #91 / v2.13.12) across the Triarch portfolio. The framework gate (`shared-workflows/gate-prod-version.yml@v8.1`) and the admin endpoint (`/api/platform/version-snapshot`) both already exist; the work below makes them non-bypassable (CL-6), self-adopts on platform first (CL-4), and rolls customer-facing surface contracts (CL-1 hostnames, CL-2 env badge, CL-3 DB namespace) to every project.

- [x] **Phase 27: CL-6 Server-Side Adoption Enforcement (P0)** — `/api/platform/ingest/release-logs` REJECTS `env=prod` release ingests without a paired pass-verdict `deploy_gate_check` audit row in the prior 15 min. Without this, CL-4 is opt-out — a consumer that strips its workflow gate still gets prod recorded. (completed 2026-05-16)
- [x] **Phase 28: CL-4 Platform Self-Adopt** — Wire `gate-prod-version.yml@v8.1` into platform's own `ci-cd.yml` as a `needs:` prereq of every prod deploy. Self-eats the dog food + provides golden template for phase 32. (completed 2026-05-16)
- [x] **Phase 29: CL-2 EnvBadge Component** — Build `<EnvBadge env={NEXT_PUBLIC_ENV}/>` in `@triarchsecurity/shared-ui` (repo: `triarchsecurity/shared-ui`); mount in root layout of 5 clean projects (platform, dev-portal, darksouls, tmi, truthtreason). security-admin + security-portal mounts deferred to Phase 33/34 (they restructure to add dev paths first). Admin compliance scan fetches dev URL and asserts presence. (completed 2026-05-16)
- [x] **Phase 30: DNS Sweep — CL-1 Hostnames** — Claim 6 missing `*-dev.<zone>` hostnames (admin-dev / portal-dev on both `.triarch.dev` AND `.triarchsecurity.com`, tmi-dev, truthtreason-dev). Interactive Firebase Console + GoDaddy MCP per the 2026-05-14 walkthrough. Verify TLS provisioning per host. (completed 2026-05-16)
- [x] **Phase 31: CL-3 DB Namespace Audit + Migration** — For every project: confirm `apphosting.dev.yaml` DATABASE_URL points to `<project>_dev` database and `apphosting.yaml` points to `<project>` (same cluster OK, distinct database required). Create the missing `_dev` databases; migrate any shared-DB projects to namespaced. (completed 2026-05-16)
- [x] **Phase 32: CL-4 Roll to Consumers** — Wire `gate-prod-version.yml@v8.1` into `dev-portal`, `darksouls-rpg`, `tmi`, `truthtreason` ci-cd.yml. Per repo: add gate job, add ADMIN_API_TOKEN secret bound to project's `apiKey` from CRDB, verify a dry-run blocks correctly. Also back-patch tmi + truthtreason to v2.13.10 framework (corrected C-12 direction; remove `[hotfix-bypass-dev]`). (completed 2026-05-16)
- [x] **Phase 33: security-admin Dev Path Restructure** — Repo-side work complete: `apphosting.dev.yaml` (CL-3 _DEV secrets + CL-2 NEXT_PUBLIC_ENV), ci-cd.yml restructured (dev trigger + version + verify-dev-deployed v2.13.10 + cl4-gate@v8.2 + deploy-dev + deploy-prod), EnvBadge mounted (CL-2), v3.55.0. Commit `09346e0f` on `feat/dev-path-cl4-cl2-cl3`. HUMAN-UAT required: FAH backend, dev branch push, DNS, GCP secrets, ADMIN_API_TOKEN, npm install. (repo-side complete 2026-05-16; HUMAN-UAT pending)
- [x] **Phase 34: security-portal Dev Path Restructure** — Repo-side work complete: `apphosting.dev.yaml` expanded (CL-3 _DEV secrets: DATABASE_URL_DEV + PORTAL_JWT_SECRET_DEV + PORTAL_TOTP_ENCRYPTION_KEY_DEV + CL-2 NEXT_PUBLIC_ENV), ci-cd.yml restructured (dev trigger + version + env-select + verify-dev-deployed v2.13.10 + cl4-gate@v8.2 + deploy-dev portal-dev + deploy-prod), EnvBadge mounted (CL-2), v0.15.0. Commit `294f8ab` on `feat/dev-path-cl4-cl2-cl3` off `fix/bump-shared-workflows-v8`. HUMAN-UAT required: resolve dormant dev branch (Option A: delete+recreate recommended), FAH portal-dev backend, DNS portal-dev.triarchsecurity.com, GCP _DEV secrets, ADMIN_API_TOKEN, npm install after shared-ui publishes. (repo-side complete 2026-05-16; HUMAN-UAT pending)
- [x] **Phase 35: Admin Compliance Matrix UI Extension** — Extend `/admin/modules/ci-cd` to render CL-1..CL-6 columns per project (today only CL-4 readiness shown). Each cell: green pass / red fail / grey N/A with one-line reason on hover. Page becomes the live compliance dashboard for the contract. (completed 2026-05-16)

**Out of scope (deferred to v2.4 customer-exposure milestone):** per-PR preview channels, `/changelog` route, seeded sandbox fixtures, `/status` three-lane view. These are the four primitives from the deep-dive's section 4; they amplify the contract but aren't required to make CL-1..CL-6 enforceable.

### Phase 27: CL-6 Server-Side Adoption Enforcement (P0)
**Goal**: Make CL-4 non-bypassable — admin `/api/platform/ingest/release-logs` rejects `env=prod` ingests without a paired pass-verdict `deploy_gate_check` audit row in the prior 15 min, same project_key, same target_version, same Bearer apiKey.
**Depends on**: Nothing (independent platform admin work)
**Requirements**: CL6-01, CL6-02, CL6-03, CL6-04
**Success Criteria** (what must be TRUE):
  1. Endpoint reads most-recent `deploy_gate_check` audit row for `(project_key)` within last 15 min
  2. Endpoint asserts `verdict=pass` AND `target_version == ingested_version` AND same bearer apiKey wrote both
  3. On mismatch/missing: returns 409 with structured error, no release row written, writes rejection to audit log
  4. Contrived test (strip `needs: gate` from a consumer workflow): release row never appears, compliance matrix flags red

### Phase 28: CL-4 Platform Self-Adopt
**Goal**: Platform's own `ci-cd.yml` declares `gate-prod-version.yml@v8.2` as `needs:` prerequisite of every prod deploy job. Self-eats the dog food + provides golden template for Phase 32 rollout.
**Depends on**: Phase 27 (CL-6 must be live so a misadoption fails closed)
**Requirements**: CL4-01
**Success Criteria** (what must be TRUE):
  1. `triarchsecurity/platform/.github/workflows/ci-cd.yml` declares gate job; deploy job has `needs: gate`
  2. `ADMIN_API_TOKEN` secret bound from `triarch-vault` to GitHub Actions
  3. Contrived dry-run (deploy with version dev hasn't seen) blocks correctly with INV-2 error
  4. Real prod deploy of v2.13.15+ passes gate and ships normally
**Plans**: 3 plans
- [x] 28-01-PLAN.md — shared-workflows v8.2: gate-prod-version posts verdict to /api/platform/cicd/gate-verdict (CL-6 paired-verdict round-trip)
- [x] 28-02-PLAN.md — platform ci-cd.yml: add `cl4-gate` + `version` jobs pinned to @v8.2, extend deploy.needs/deploy.if, bump v2.13.15
- [ ] 28-03-PLAN.md — verification + write 28-SUMMARY.md + 28-HUMAN-UAT.md (push/PR/merge/tag, ADMIN_API_TOKEN secret, contrived dry-run, real prod-deploy)

### Phase 29: CL-2 EnvBadge Component
**Goal**: Customers can tell at a glance whether they're on dev — `<EnvBadge env={NEXT_PUBLIC_ENV}/>` lives in `@triarchsecurity/shared-ui`, mounts in every project's root layout, renders a persistent "DEV" pill in dev chrome.
**Depends on**: Nothing (pure shared-ui work + per-app mount)
**Requirements**: CL2-01, CL2-02, CL2-03, CL2-04
**Success Criteria** (what must be TRUE):
  1. `<EnvBadge/>` exported from `@triarchsecurity/shared-ui` (private repo `triarchsecurity/shared-ui`, cloned locally to `/Users/mikegeehan/claude/triarch/shared/shared-ui`); renders only when env in `('dev','staging')`
  2. Component emits `data-env="dev"` attribute for compliance-scan assertion
  3. Mounted in root layout of 5 projects in this phase: platform, dev-portal, darksouls, tmi, truthtreason. security-admin mount handled by Phase 33; security-portal mount handled by Phase 34 (both need dev paths created first)
  4. `NEXT_PUBLIC_ENV=dev` in every `apphosting.dev.yaml`; absent or `prod` in every `apphosting.yaml`

**Scope corrections (2026-05-16):** Original roadmap text said `@myalterlego/triarch-shared` — corrected to `@triarchsecurity/shared-ui` (registry-confirmed via package.json in installed node_modules). shared-ui is its own private GitHub repo (`triarchsecurity/shared-ui`, last updated 2026-05-15), not a workspace package in platform. Per-consumer mounts are 1-line edits to `src/app/layout.tsx` + 1 env entry in `apphosting.dev.yaml`. Three consumer repos (dev-portal, darksouls, tmi) currently sit on stale `fix/deploy-skip-bug` branches (27h old; abandoned backport of platform v2.13.5 — never merged because platform v2.13.7+ superseded). Phase 29 work branches off origin/main in each repo, ignoring the stale branches (those can be cleaned up incidentally).

**Plans**: 7 plans
- [x] 29-01-PLAN.md — shared-ui v1.5.0: EnvBadge component + TDD test suite (CL2-01, CL2-02)
- [x] 29-02-PLAN.md — platform mount + apphosting.dev.yaml NEXT_PUBLIC_ENV=dev (CL2-03, CL2-04)
- [x] 29-03-PLAN.md — dev-portal mount + apphosting.dev.yaml NEXT_PUBLIC_ENV=dev (CL2-03, CL2-04)
- [x] 29-04-PLAN.md — darksouls mount + apphosting.dev.yaml NEXT_PUBLIC_ENV=dev (CL2-03, CL2-04)
- [x] 29-05-PLAN.md — tmi mount + apphosting.dev.yaml NEXT_PUBLIC_ENV=dev (CL2-03, CL2-04)
- [x] 29-06-PLAN.md — truthtreason mount + new shared-ui dep + transpilePackages + NEXT_PUBLIC_ENV=dev (CL2-03, CL2-04)
- [x] 29-07-PLAN.md — cross-repo verification + 29-SUMMARY.md + 29-HUMAN-UAT.md push/PR/merge/publish runbook

### Phase 30: DNS Sweep — CL-1 Hostnames
**Goal**: Claim the 6 missing `*-dev.<zone>` hostnames so every project has a customer-disambiguatable dev URL. Interactive per 2026-05-14 walkthrough — Firebase Console "Add custom domain" + GoDaddy DNS records + TLS provisioning verify.
**Depends on**: Nothing (independent infra work)
**Requirements**: CL1-01, CL1-02
**Success Criteria** (what must be TRUE):
  1. `admin-dev.triarch.dev`, `portal-dev.triarch.dev`, `tmi-dev.triarch.dev`, `truthtreason-dev.triarch.dev` resolve and serve their FAH dev backends
  2. `admin-dev.triarchsecurity.com`, `portal-dev.triarchsecurity.com` resolve (depend on Phases 33/34 to actually serve)
  3. TLS valid cert on each hostname (subject matches, expiry > 60 days)
  4. Updated apphosting.dev.yaml NEXTAUTH_URL entries point at new dev hosts where applicable

### Phase 31: CL-3 DB Namespace Audit + Migration
**Goal**: Every project's dev backend writes to `<project_key>_dev` database; prod writes to `<project_key>`. Same cluster OK; same database name forbidden. Customer test data in dev never leaks to prod.
**Depends on**: Nothing
**Requirements**: CL3-01, CL3-02, CL3-03
**Success Criteria** (what must be TRUE):
  1. Every `apphosting.dev.yaml` DATABASE_URL contains `/<project>_dev` path component
  2. Every `apphosting.yaml` DATABASE_URL contains `/<project>` (no `_dev`) path component
  3. CRDB cluster has both databases populated; migrations applied to both
  4. Audit doc captures any project that was previously sharing — migration plan documented

### Phase 32: CL-4 Roll to Consumers
**Goal**: Wire `gate-prod-version.yml@v8.1` into dev-portal, darksouls-rpg, tmi, truthtreason. Plus back-patch tmi + truthtreason to v2.13.10 framework (corrected C-12 direction; remove `[hotfix-bypass-dev]`).
**Depends on**: Phase 28 (golden template exists)
**Requirements**: CL4-02, CL4-03, CL4-04, CL4-05
**Success Criteria** (what must be TRUE):
  1. dev-portal `ci-cd.yml` has gate; ADMIN_API_TOKEN secret bound; contrived block verified
  2. darksouls-rpg same
  3. tmi same + workflow back-patched (corrected ancestor direction; no hotfix-bypass token)
  4. truthtreason same back-patch
  5. Compliance matrix shows CL-4 pass for all 4 consumers

### Phase 33: security-admin Dev Path Restructure
**Goal**: triarchsecurity/security-admin becomes two-env: create FAH dev backend `admin-dev`, add `dev` branch, restructure workflow triggers, claim `admin-dev.triarchsecurity.com` DNS, wire CL-4 gate. Folds in EnvBadge mount + NEXT_PUBLIC_ENV env vars (deferred from Phase 29).
**Depends on**: Phase 30 (DNS) + Phase 28 (gate template) + Phase 29 (shared-ui v1.5.0+ with EnvBadge component published)
**Requirements**: CL4-06, CL2-03 (security-admin mount), CL2-04 (security-admin env vars)
**Success Criteria** (what must be TRUE):
  1. FAH backend `admin-dev` exists in `triarchsecurity-admin` Firebase project
  2. `admin-dev.triarchsecurity.com` resolves and serves
  3. `dev` branch exists; workflow triggers on push/PR `[dev, main, ...]`
  4. CL-4 gate wired and verified
  5. Verify-dev-deployed (C-12 from gap analysis) wired with v2.13.10 direction
  6. `<EnvBadge/>` mounted in security-admin's root layout (`src/app/layout.tsx`)
  7. `apphosting.dev.yaml` created with `NEXT_PUBLIC_ENV=dev`; `apphosting.yaml` left absent NEXT_PUBLIC_ENV (defaults to prod chrome)

**Coordination note (2026-05-16):** security-admin currently sits on local branch `fix/bump-shared-workflows-v8` (2 days old, 1 ahead of main) — active in-flight work that Phase 33 will likely supersede or build on top of. Decide at execute time whether to rebase that branch onto the new restructure work or to land Phase 33 on a separate branch and reconcile via PR review.

### Phase 34: security-portal Dev Path Restructure
**Goal**: Same as Phase 33 for security-portal — including EnvBadge mount + NEXT_PUBLIC_ENV env vars (deferred from Phase 29). Also resolve the dormant dev branch (20 commits behind main) — rebase or delete.
**Depends on**: Phase 30 + Phase 28 + Phase 29 (shared-ui v1.5.0+ with EnvBadge published)
**Requirements**: CL4-07, CL2-03 (security-portal mount), CL2-04 (security-portal env vars)
**Success Criteria** (what must be TRUE):
  1. FAH backend `portal-dev` exists in `triarchsecurity-portal` Firebase project
  2. `portal-dev.triarchsecurity.com` resolves and serves
  3. Dormant dev branch resolved (rebased or deleted + recreated from main)
  4. Workflow triggers updated
  5. CL-4 gate wired and verified

### Phase 35: Admin Compliance Matrix UI Extension
**Goal**: Extend `/admin/modules/ci-cd` from a CL-4-readiness view into the full CL-1..CL-6 compliance matrix — one row per project × 6 columns, green/red/grey badge per cell with hover reason.
**Depends on**: Phases 27, 29, 30, 31, 32, 33, 34 (every clause has a real adoption state to read by the time this UI ships)
**Requirements**: CL1-03, CL3-04, CL5-01, CL5-02, CL5-03, MATRIX-01, MATRIX-02, MATRIX-03
**Success Criteria** (what must be TRUE):
  1. Page renders one row per project × 6 columns (CL-1..CL-6) + existing CL-4 readiness column
  2. CL-1 check parses dev_url; CL-2 fetches dev URL and asserts `data-env="dev"`; CL-3 reads both apphosting yamls via raw GitHub; CL-4 reads workflow file; CL-5 HEAD-checks customer release page; CL-6 reads recent audit log
  3. Each cell shows green/red/grey badge + one-line reason on hover
  4. Page response time < 2s for full portfolio scan; live recompute (no stale cache)

### v2.2 Customer Portal Split (Phases 15–26) — SHIPPED 2026-05-10

- [x] **Phase 15: Operational Prework** — Repo, FAH backends, DNS, OAuth, secrets exist before app code ships (completed 2026-05-08)
- [x] **Phase 16: Shared Package Extraction** — `@myalterlego/triarch-shared@0.1.0` published; admin re-exports; CI gate prevents schema drift (completed 2026-05-08)
- [x] **Phase 17: Hostname Guard Inventory** — Catalog admin's hostname checks; fail-closed middleware before second valid host appears (completed 2026-05-08)
- [x] **Phase 18: Portal Auth Scaffolding** — NextAuth v4 with `__Host-` cookies, distinct secret, customer-membership signIn, staff "Switch to admin" callout (completed 2026-05-08)
- [x] **Phase 19: Database Connectivity** — Portal `pg.Pool` + `portal_runtime` DML-only role + DDL permission-denied smoke test (completed 2026-05-08)
- [x] **Phase 20: URL Centralization (admin)** — `src/lib/urls.ts` + ESLint guard; refactor admin Slack/email/release-note URL emitters BEFORE cutover (completed 2026-05-08)
- [x] **Phase 21: Release Page Port (Read)** — Lift-and-shift `/projects/[slug]/releases` + `/projects` list; 404 (not 403) for non-members; mobile-responsive read paths (completed 2026-05-08)
- [x] **Phase 22: Release Page Port (Write)** — Approve/reject/feedback + branch preview swap; portal-owned `FAH_PROMOTER_SA_KEY`; HMAC-proxy to admin for GitHub dispatch (completed 2026-05-08)
- [x] **Phase 23: Bug + Feature Customer Surface** — `/bugs/*` and `/features/*` list/detail/new routes (the two net-new primitives) (completed 2026-05-09; portal v0.4.0)
- [x] **Phase 23.1: Portal UI Polish** — Sub-nav, status column rewrite, empty-state copy, staff preview-as-customer toggle (decimal phase inserted between 23 and 24; UX-01..04) — completed 2026-05-10
- [x] **Phase 24: CI/CD Deploy Safety** — structurally complete under reduced scope (24-02 shipped CI-03 + 24-03 shipped CI-04 — PRs open awaiting merge; 24-01 + 24-04 SKIPPED per scope decision; 2026-05-09)
- [ ] **Phase 25: Cutover** — Admin 301 → portal; customer email blast; Slack URL sweep; redirect telemetry; kill-switch
- [ ] **Phase 26: Sunset (T+90)** — Delete admin `/projects/[slug]/*` + dead hostname guards; admin v3.0.0 bump (deferred 90 days)


## Phase Details

### Phase 8: Admin Home Pipeline Visibility
**Goal**: Staff can see each project's prod and dev state at a glance from the admin home — no Slack lookup required to answer "what version is in dev?" or "does anything need approval?"
**Depends on**: Nothing (zero schema changes; extends existing `release_logs` query)
**Requirements**: PIPE-01, PIPE-02, PIPE-03, PIPE-04, PIPE-06
**Success Criteria** (what must be TRUE):
  1. Admin home shows prod version and dev version side-by-side on each project tile; projects with no dev deploy show "--" not a broken cell
  2. A pending-approval count badge appears on each project tile; tiles with no pending approvals show no badge (not "0")
  3. Each project tile shows "dev: N min ago / prod: N days ago" last-deploy timestamps using relative time
  4. Clicking a project tile navigates directly to `/projects/<slug>/releases`
  5. Each project tile shows a compact one-liner what-changed summary ("4 entries since prod: 2 bug fixes, 1 feature, 1 other") when dev is ahead of prod; no summary shown when dev and prod are at the same version
**Plans**: 3 plans
- [x] 08-01-PLAN.md — Composite index migration on release_logs (project, env, deployed_at DESC) — Pitfall 8 guard
- [x] 08-02-PLAN.md — getProjectPipelineSummaries helper with DISTINCT ON query, type bucketing, parity/inversion logic, Vitest suite
- [x] 08-03-PLAN.md — Admin page tile rendering: Link wrap, prod/dev rows, pending pill, what-changed oneliner, version bump

### Phase 9: Per-Project Pipeline Page and Web-UI Promote
**Goal**: Staff have a consolidated per-project view showing env state, all branch RCs, deploy history, and what's changed — and can initiate a production promotion from that page without touching Slack
**Depends on**: Phase 8 (admin home already has prod/dev data; pipeline page extends the same data model)
**Requirements**: PIPE-05, PROM-01, PROM-02, PROM-03, PROM-04, PROM-05, DIFF-01
**Success Criteria** (what must be TRUE):
  1. `/admin/modules/pipeline/<slug>` exists, is staff-only, and shows consolidated env state, all branch RCs with status, and a deploy history list
  2. An approved RC row shows a "Promote to production" button visible only to staff; the button is absent for non-approved RCs and for non-staff users
  3. Clicking Promote opens a two-step confirm modal showing the specific label "Promote <branch> <version> to production" — no promotion fires until the modal is confirmed
  4. After confirming, the button shows an in-flight spinner; on success the row reflects the dispatch; on failure an error pill appears linking to the GitHub Actions run
  5. Simultaneously clicking web Promote and the Slack OttoBot approve button for the same RC results in exactly one GitHub Actions dispatch and one Slack notification — not two
  6. An expanded "What's changed" table on the pipeline page shows each unreleased dev entry with Type pill, title, branch, author, and date; entries with bug/feature links are clickable
**Plans**: 5 plans
- [x] 09-01-PLAN.md — Schema migration 0014: actor_source column + partial unique index on release_approvals (PROM-04 schema)
- [x] 09-02-PLAN.md — promoteAndAudit nullable Slack params + fresh-channel-message fallback (PROM-03)
- [x] 09-03-PLAN.md — POST /api/admin/releases/[id]/promote with atomic dispatch race-guard + Slack handler parity (PROM-03/04/05)
- [x] 09-04-PLAN.md — getProjectPipelineDetail helper + /admin/modules/pipeline/[slug] server component with what-changed table (PIPE-05, DIFF-01)
- [x] 09-05-PLAN.md — PromoteButton client island (two-step inline confirm + result pills) + admin home tile retarget + v2.5.0 (PROM-01/02/05)

### Phase 10: Schema Gate
**Goal**: All schema changes required by Phases 11–13 land in one isolated migration — `release_log_links` join table and branch-preview lock columns — leaving downstream phases free to build without migration risk
**Depends on**: Phase 9 (no-migration phases ship before any DB migration risk is taken)
**Requirements**: LINK-01, PREV-01
**Success Criteria** (what must be TRUE):
  1. `release_log_links` table exists in the dev cluster with `release_id`, `link_type`, `bug_id`, `feature_id`, `source`, and `created_at` columns; FK indexes on `release_id`, `bug_id`, `feature_id` are present
  2. `projects.preview_branch_locked` (text, nullable) and `projects.preview_branch_locked_at` (timestamptz, nullable) columns exist in the dev cluster
  3. Drizzle schema in `src/db/schema.ts` reflects both changes with correct relations; `db:push` completes without errors on the dev cluster
**Plans**: 1 plan
- [x] 10-01-PLAN.md — Drizzle schema + migration 0016: release_log_links table (with CHECK constraint + 3 FK indexes) + projects branch-preview lock columns; applied + verified on dev cluster

### Phase 11: Commit Parser and Tracker Linkage Authoring
**Goal**: Every release ingest automatically stamps bug/feature links from commit messages, and staff can correct or supplement those links from the admin release-logs page
**Depends on**: Phase 10 (`release_log_links` table must exist before any links can be written)
**Requirements**: LINK-02, LINK-03, LINK-04, LINK-07
**Success Criteria** (what must be TRUE):
  1. A new release ingest containing a commit message with `#BUG-{uuid}`, `closes FEAT-{uuid}`, or `fixes #N` pattern produces corresponding `release_log_links` rows automatically, without any staff action
  2. Auto-detected IDs that do not match any existing `bug_reports.id` or `feature_requests.id` are silently discarded — no phantom links appear on any page
  3. Staff can open any release entry in `/admin/modules/release-logs` and manually add or remove links; changes persist and the page reflects the updated links without a hard reload
  4. A commit message containing Slack mrkdwn characters (e.g. `<!channel>`) passes through ingest without triggering a Slack channel mention; all commit content is sanitized before render or Slack post
**Plans**: 4 plans
- [x] 11-01-PLAN.md — TDD commit-parser regex (BUG/FEAT UUID + verb-prefixed + bare #N) — LINK-02 / LINK-03 (parser layer)
- [x] 11-02-PLAN.md — TDD sanitize-commit helpers (sanitizeForSlack + sanitizeForRender) — LINK-07
- [x] 11-03-PLAN.md — link-stamper (DB validation + ingest hook, non-blocking) — LINK-02 / LINK-03 (DB layer)
- [x] 11-04-PLAN.md — Manual link CRUD API + LinksClient + slack.ts sanitization wrap — LINK-04 / LINK-07

### Phase 12: Bug and Feature Detail Pages
**Goal**: Bugs and features each have a detail page that shows which release versions they shipped in — closing the bidirectional visibility loop between the tracker and the release log
**Depends on**: Phase 11 (detail pages are only meaningful once `release_log_links` has real data from the auto-stamper)
**Requirements**: LINK-05, LINK-06
**Success Criteria** (what must be TRUE):
  1. `/admin/modules/bug-reports/<id>` exists as a staff-only server component showing the bug's fields plus a "Released in" sidebar section — "Dev: vX.Y (feat/branch)" and "Prod: vA.B (main)" populated from join query; "Not yet released" shown when no links exist
  2. `/admin/modules/feature-requests/<id>` exists with the identical "Released in" sidebar section pattern
  3. The bug list page (`/admin/modules/bug-reports`) loads in under 500ms with 50 bugs — no N+1 query; release linkage is fetched via a single `inArray` batch query per page load
**Plans**: 3 plans
- [x] 12-01-PLAN.md — getReleaseHistoryForBug/Feature lib + Vitest suite (TDD; mocked db; happy/empty/multi-version/ordering)
- [x] 12-02-PLAN.md — ReleasedInSidebar shared component + bug detail page + bug list Link wrap (LINK-05)
- [x] 12-03-PLAN.md — feature detail page (reuses sidebar) + feature list Link wrap (LINK-06)

### Phase 13: Branch Preview Swap
**Goal**: Customer admins can click "Preview this branch" on any RC to deploy that branch onto the project's dev backend — and the page correctly shows in-flight state and prevents concurrent swaps
**Depends on**: Phase 10 (branch-preview lock columns must exist); Firebase App Hosting programmatic rollout API must be resolved via research spike before this phase is planned
**Requirements**: PREV-02, PREV-03, PREV-04, PREV-05, PREV-06
**research_required**: true
**Research question**: Determine the correct mechanism to call the Firebase App Hosting Rollouts API from a Next.js route handler without spawning a child process. Evaluate: (a) `googleapis` Node SDK `firebaseapphosting.v1beta.projects.locations.backends.rollouts.create`, (b) Firebase MCP (`mcp__firebase__`) rollout management, (c) GitHub Actions `workflow_dispatch` as intermediary. Do not design the route handler until resolved.
**Success Criteria** (what must be TRUE):
  1. Customer admin sees a "Preview this branch" button next to each RC on the releases page; clicking it triggers a Firebase App Hosting rollout to deploy that branch on the project's dev backend
  2. While a branch swap is in flight, all RC rows show a banner "branch X currently previewing — set N minutes ago by user@email" and all competing Preview buttons are disabled with a tooltip
  3. The page polls rollout state at 5-second intervals via SWR; when the rollout reaches SUCCEEDED or FAILED the preview lock auto-clears and the page reflects terminal state
  4. A failed rollout (build error, bad branch name) surfaces an error inline with a link to the Firebase App Hosting console; the preview lock is cleared so another swap can be attempted
  5. An 8-minute hard timeout clears a preview lock that never reaches terminal state, preventing permanent UI lockout
**Plans**: 3 plans
- [x] 13-01-PLAN.md — TDD fah-rollout lib (jose JWT mint + FAH REST client) + add swr/jose deps (PREV-03 lib layer)
- [x] 13-02-PLAN.md — POST swap route (atomic UPDATE-with-WHERE-IS-NULL lock) + GET status route (8-min timeout + branch-guarded auto-clear) (PREV-03/05/06)
- [x] 13-03-PLAN.md — BranchPreviewClient client island (SWR polling) + ReleasesClient integration + human-verify checkpoint + v2.7.0 (PREV-02/04/05)

### Phase 14: Customer Page Integration
**Goal**: The customer release page surfaces all the pipeline intelligence built in Phases 8–13 in a form customers can use — filterable by entry type, with a "what's coming to prod" summary and branch swap controls directly in the branch section headers
**Depends on**: Phase 12 (entry type filter is only meaningful once linkage data is populated), Phase 13 (branch swap UI integrates the swap button from PREV-02/PREV-03)
**Requirements**: CUST-01, CUST-02, CUST-03, DIFF-02
**Success Criteria** (what must be TRUE):
  1. Filter chips "Bug fixes / Features / Other" appear above the RC list on `/projects/<slug>/releases`; clicking a chip filters release entries to that type; filter state is reflected in the URL (`?type=bug`) and survives browser back navigation
  2. Filter chips show counts ("Bug fixes (4)", "Features (2)") derived from `release_log_links` data; chips with no entries show "(0)" and remain visible but dimmed
  3. A "What's coming to prod" summary card appears at the top of the customer release page showing entry count and type breakdown (collapsed by default; customer expands to see the full entry list)
  4. A "Preview this branch" button appears in each branch section header on the customer release page, integrated with the swap concurrency state from Phase 13 — in-flight swap disables all competing swap buttons site-wide
**Plans**: 3 plans
- [x] 14-01-PLAN.md — Server-side entry-type counts + WhatsComing summary lib + page.tsx wiring (CUST-01/02, DIFF-02 data layer)
- [x] 14-02-PLAN.md — FilterChips + WhatsComingCard client islands + ReleasesClient URL-state filter math (CUST-01, CUST-02, DIFF-02)
- [x] 14-03-PLAN.md — BranchPreviewClient split (banner singleton + per-section buttons) + BranchSection header integration + human-verify checkpoint + v2.8.0 (CUST-03)

### Phase 15: Operational Prework
**Goal**: Repository, DNS, OAuth, and FAH backend prerequisites exist so deploy pipeline is provable on a skeleton before any app code lands.
**Depends on**: Nothing (parallel-safe ops work — first phase of v2.2)
**Requirements**: OPS-01, OPS-02, OPS-03, OPS-04, OPS-05
**Success Criteria** (what must be TRUE):
  1. `MyAlterLego/triarch-portal` repo exists with `.github/workflows/ci-cd.yml` calling shared-workflows@v4 — a no-op push to `main` reaches the deploy stage
  2. Two new Firebase App Hosting backends `portal-prod` and `portal-dev` exist in `triarch-dev-website` and serve a 200-OK landing page
  3. `https://portal.triarch.dev` resolves via GoDaddy DNS and returns 200-OK with valid TLS
  4. Google OAuth client `Triarch Dev` accepts callbacks at both `portal.triarch.dev` and `localhost:3002` redirect URIs
  5. `PORTAL_NEXTAUTH_SECRET` exists in `triarch-vault` with secretAccessor binding granted to both portal runtime SAs
**Plans**: 5 plans
- [x] 15-01-PLAN.md — Create MyAlterLego/triarch-portal repo + local clone (OPS-01)
- [x] 15-02-PLAN.md — GoDaddy DNS for portal.triarch.dev (OPS-03)
- [x] 15-03-PLAN.md — PORTAL_NEXTAUTH_SECRET in triarch-vault + secretAccessor IAM (OPS-05)
- [x] 15-04-PLAN.md — Firebase App Hosting backends portal-prod + portal-dev (OPS-02)
- [x] 15-05-PLAN.md — Google OAuth client redirect URI updates (portal prod + localhost:3002) (OPS-04)

### Phase 16: Shared Package Extraction
**Goal**: Drizzle schema and shared helpers extracted into a private GitHub Packages npm module that both apps consume; admin remains migration authority.
**Depends on**: Phase 15
**Requirements**: PKG-01, PKG-02, PKG-03, PKG-04
**Success Criteria** (what must be TRUE):
  1. `packages/triarch-shared/` directory exists in admin repo with schema.ts + auth-context.ts + sanitize-commit.ts + slack-status.ts and a publish workflow firing on tag `shared/v*`
  2. `@myalterlego/triarch-shared@0.1.0` is installable from GitHub Packages via `npm install` with `NODE_AUTH_TOKEN` set
  3. Admin imports schema + helpers from `@myalterlego/triarch-shared`, version bumps to 2.9.0, all 324+ Vitest tests stay GREEN, `next build` clean
  4. CI rejects an admin PR that touches `packages/triarch-shared/schema.ts` without bumping the shared package's version field
**Plans**: 4 plans
- [x] 16-01-PLAN.md — Scaffold packages/triarch-shared/ skeleton (package.json with subpath exports, tsconfig.json, .gitignore, README.md, src/index.ts stub) — PKG-01 partial
- [x] 16-02-PLAN.md — Add publish-shared.yml (tag-driven npm publish) + check-shared-version.yml (PR gate against version drift) workflows — PKG-02 infra + PKG-04
- [x] 16-03-PLAN.md — MOVE schema + 4 helpers + db.ts into packages/triarch-shared/src/; admin source becomes 1-line re-export shims; bump 2.8.1 → 2.9.0; vitest + next build GREEN — PKG-01 + PKG-03
- [x] 16-04-PLAN.md — Tag shared/v0.1.0, push, watch publish workflow, verify package installable from GitHub Packages — PKG-02

### Phase 17: Hostname Guard Inventory
**Goal**: Audit every host-check in admin and harden the v2.1 hostname-aware routing so cutover has a known cleanup target and admin fails closed for unknown hosts.
**Depends on**: Phase 15
**Requirements**: HOST-01, HOST-02
**Success Criteria** (what must be TRUE):
  1. `.planning/host-guard-inventory.md` lists every `host ===`, `headers().get('host')`, and `x-forwarded-host` reference in admin codebase with file:line + current behavior
  2. Curling admin with `Host: portal.triarch.dev` or any non-`admin.triarch.dev`/`localhost:300x` value returns 404 (not the marketing fallback)
**Plans**: 2 plans
- [x] 17-01-PLAN.md — Audit admin src/ and write `.planning/host-guard-inventory.md` (5 known sites cataloged + Phase 26 cleanup checklist) — HOST-01
- [x] 17-02-PLAN.md — Harden src/proxy.ts to fail-closed 404 for unknown hosts + Vitest test (8 cases) + bump v2.9.0 → v2.9.1 — HOST-02

### Phase 18: Portal Auth Scaffolding
**Goal**: Customer-only Google OAuth on portal with brand-isolated cookies and a staff "Switch to admin.triarch.dev" callout instead of a 401.
**Depends on**: Phase 16, Phase 17
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, AUTH-06, AUTH-07
**Success Criteria** (what must be TRUE):
  1. Portal `Set-Cookie` for the session token uses `__Host-` prefix in production and contains no `Domain=` attribute (Vitest assertion, AUTH-05)
  2. Portal JWTs signed with `PORTAL_NEXTAUTH_SECRET` cannot be validated by admin (and vice versa) — different secrets prove cross-replay impossible
  3. A user with no `project_members` row attempting Google sign-in is rejected at signIn callback; a staff user is allowed in but sees the persistent "Switch to admin.triarch.dev" callout banner; a customer admin/viewer sees no banner
  4. Vitest grep-test confirms no portal source file references the OAuth `sub` claim (everywhere keys on `email`, AUTH-06)
  5. Unauthenticated visit to portal `/` redirects to `/login`; post-login, a 0-membership user lands on an empty state with "Contact your project admin" copy, a 1-membership user auto-redirects to that project, a 2+ membership user lands on `/projects`
**Plans**: 5 plans
- [x] 18-01-PLAN.md — Portal Next.js scaffold (package.json, configs, apphosting yamls, ci-cd.yml, layout/page skeletons) — AUTH-01 baseline (cookie config plumbing)
- [x] 18-02-PLAN.md — NextAuth core (src/lib/auth.ts with host-only cookies + STUB signIn, route handler, login page) — AUTH-01, AUTH-02
- [x] 18-03-PLAN.md — signIn callback (real customer-membership rule via getCurrentUserContext) + StaffCallout banner in layout — AUTH-03, AUTH-04
- [x] 18-04-PLAN.md — Post-login routing decision tree at src/app/page.tsx + /no-memberships + /projects stubs — AUTH-07
- [x] 18-05-PLAN.md — Vitest tests (cookies shape, no-.sub grep guard, signIn callback unit tests) + portal v0.2.0 deploy — AUTH-05, AUTH-06

### Phase 19: Database Connectivity
**Goal**: Portal connects to the same CockroachDB cluster via `pg.Pool` using a DML-only role; admin remains sole migration authority and rogue schema writes from portal are blocked at the database.
**Depends on**: Phase 16
**Requirements**: DB-01, DB-02, DB-03, DB-04
**Success Criteria** (what must be TRUE):
  1. Portal `src/lib/db.ts` reuses `DATABASE_URL` (or `DATABASE_URL_DEV` on dev backend) and successfully reads `projects` rows
  2. CRDB role `portal_runtime` exists with SELECT/INSERT/UPDATE/DELETE on v2.2 tables and zero DDL grants; portal connects with this role
  3. Portal `package.json` contains no `db:push` or `db:generate` script — `grep -r "db:push" portal/package.json` returns no matches
  4. From portal runtime, executing `ALTER TABLE projects ADD COLUMN test text` returns CockroachDB permission denied (DB-04 smoke test)
**Plans**: 2 plans
- [x] 19-01-PLAN.md — Provision CRDB portal_runtime role (DML-only) + GCP secret DATABASE_URL_PORTAL + secretAccessor IAM (DB-02, DB-04)
- [x] 19-02-PLAN.md — Portal src/lib/db.ts re-export + db.test.ts smoke test + apphosting.yaml DATABASE_URL_PORTAL bind + portal v0.2.1 (DB-01, DB-03)

### Phase 20: URL Centralization (admin)
**Goal**: Admin emits all customer-facing URLs through a single helper before portal ships, so the cutover redirect doesn't strand bookmarks in Slack messages or release notes.
**Depends on**: Phase 15
**Requirements**: URL-01, URL-02, URL-03
**Success Criteria** (what must be TRUE):
  1. `src/lib/urls.ts` in admin exports `customerProjectUrl`, `customerReleaseUrl`, `customerBugUrl`, `customerFeatureUrl` reading `PORTAL_BASE_URL` (default `https://portal.triarch.dev`)
  2. All admin Slack message builders, OttoBot Block Kit constructors, GitHub release-note templates, and email templates call the helpers — `grep -r 'admin.triarch.dev/projects/' src/` returns matches only inside `src/lib/urls.ts`
  3. ESLint `no-restricted-syntax` rule blocks raw `https://admin.triarch.dev/projects/` literals outside `src/lib/urls.ts`; CI fails on any new violation
**Plans**: 2 plans
- [x] 20-01-PLAN.md — src/lib/urls.ts (4 helpers + PORTAL_BASE_URL reader) + Vitest suite (6 cases) + admin v2.9.2 bump — URL-01/URL-02
- [x] 20-02-PLAN.md — eslint.config.mjs no-restricted-syntax rule + apphosting.yaml PORTAL_BASE_URL binding — URL-03

### Phase 21: Release Page Port (Read)
**Goal**: Customer release page and project list render on portal as a faithful lift-and-shift of v2.1, with non-member access returning 404 and read paths mobile-responsive.
**Depends on**: Phase 18, Phase 19
**Requirements**: PORTAL-01, PORTAL-02, PORTAL-03, PORTAL-04
**Success Criteria** (what must be TRUE):
  1. Portal `/projects/[slug]/releases` renders FilterChips, WhatsComingCard, BranchSection, ReleasesClient, and lifecycle timeline visually identical to admin's v2.1 surface (side-by-side screenshot match)
  2. Portal `/projects` renders membership-filtered project tile list using `getProjectPipelineSummaries()` from the shared package — non-members of any project see an empty state, not a leak
  3. Authenticated non-member requesting `/projects/<not-mine>/releases` (or any sub-route) receives HTTP 404, not 403 — no membership-existence leak
  4. Portal release list, bug list, feature list, and project list render correctly on mobile viewport (375px width); approve/branch-swap controls remain desktop-optimized
**Plans**: 6 plans completed (21-01 through 21-06) — portal v0.3.0 shipped
**Status**: Complete (2026-05-08)

### Phase 22: Release Page Port (Write)
**Goal**: Customers approve, reject, leave feedback, and trigger branch preview swap from portal end-to-end, with portal owning Slack notification posting and admin retaining GitHub App custody via HMAC-signed dispatch.
**Depends on**: Phase 21
**Requirements**: WRITE-01, WRITE-02, WRITE-03, WRITE-04, WRITE-05
**research_required**: true
**Research question**: Operational mechanics of the HMAC-proxy pattern for portal→admin GitHub workflow dispatch — exact request/response contract, replay-window, key-rotation procedure, error-surface for portal client. Settled at SUMMARY level; operational details TBD before plan.
**Success Criteria** (what must be TRUE):
  1. Customer admin clicking Approve on portal hits `POST /api/projects/[slug]/releases/[releaseId]/approve` which writes `release_approvals.actor_source='portal'` and dispatches `promote-branch.yml` via admin HMAC proxy — release_logs gets the same dispatch metadata as a Slack-origin approve
  2. Customer admin clicking "Preview this branch" on portal swaps the FAH dev backend successfully via portal-owned `FAH_PROMOTER_SA_KEY`, with atomic lock acquisition, branch regex guard, 8-min timeout, and branch-guarded auto-clear all preserved from v2.1
  3. Slack notification of customer approval posts via `PORTAL_SLACK_BOT_TOKEN` (portal-owned credential) — admin's GitHub App key is never exposed to portal runtime
  4. Two-step approve UX, conflict badge with hidden approve button, and branch lock disable propagation behave identically to v2.1 admin behavior on the portal surface
**Plans**: 5 plans
- [x] 22-01-PLAN.md — Shared internal-hmac module + admin /api/internal/dispatch endpoint + INTERNAL_HMAC_SECRET secret + admin v2.10.0 (WRITE-04 foundation)
- [x] 22-02-PLAN.md — Portal approve/reject/feedback (POST + DELETE) handlers with HMAC dispatch to admin + portal v0.3.1 (WRITE-01, WRITE-04)
- [x] 22-03-PLAN.md — Portal branch preview swap (POST + GET status) with portal-owned FAH_PROMOTER_SA_KEY + portal v0.3.2 (WRITE-02, WRITE-03)
- [x] 22-04-PLAN.md — Portal Slack notifications (PORTAL_SLACK_BOT_TOKEN) + un-stub ReleasesClient + BranchPreviewClient handlers + portal v0.3.3 (WRITE-04, WRITE-05)
- [x] 22-05-PLAN.md — WRITE-05 dedicated tests + mobile viewport + portal v0.3.4 phase-close hardening (WRITE-05)

### Phase 23: Bug + Feature Customer Surface
**Goal**: Customers view and submit bugs and features on portal — list, detail, and new-submission forms — closing the two primitives that don't yet exist anywhere in the codebase.
**Depends on**: Phase 21
**Requirements**: BUG-01, BUG-02, BUG-03, FEAT-01, FEAT-02, FEAT-03
**Success Criteria** (what must be TRUE):
  1. Portal `/projects/[slug]/bugs` and `/features` render membership-scoped lists with status pills; a customer cannot see another project's bugs or features even via direct URL probing
  2. Portal `/projects/[slug]/bugs/[id]` and `/features/[id]` render detail pages with `ReleasedInSidebar` showing "Released in vX.Y dev / vA.B prod" — read-only customer view with no staff edit controls
  3. Portal `/projects/[slug]/bugs/new` and `/features/new` accept customer submissions; POST creates `bug_reports`/`feature_requests` row with `reporter_email = session email` and `project_key` derived from URL slug
  4. Cross-project POST attempt (e.g. submitting a bug to a project the user isn't a member of) returns 404, not 403, and creates no row
**Plans**: 4 plans
- [x] 23-01-PLAN.md — ReleasedInSidebar fork + StatusPill foundation (BUG-01/02 + FEAT-01/02 components)
- [x] 23-02-PLAN.md — Bug list + detail customer surface (BUG-01, BUG-02)
- [x] 23-03-PLAN.md — Feature list + detail customer surface (FEAT-01, FEAT-02)
- [x] 23-04-PLAN.md — Bug + feature submission write surface + portal v0.4.0 phase close (BUG-03, FEAT-03)

### Phase 23.1: Portal UI Polish
**Goal**: Close the navigability + status-clarity gaps reported on portal v0.4.6 first sign-in. Customers gain a sub-nav linking Releases/Bugs/Features, a fixed status column rendering real release lifecycle status, human-readable empty-state copy on project tiles, and a staff preview-as-customer toggle for end-to-end testing.
**Depends on**: Phase 23
**Requirements**: UX-01, UX-02, UX-03, UX-04
**Success Criteria** (what must be TRUE):
  1. Sub-nav (Releases / Bugs / Features) renders on every `/projects/[slug]/*` surface via Next.js nested layout — active tab visible, mobile horizontal-scroll affordance for <=320px viewports
  2. Releases table renders real `releaseLogs.status` (pending_approval, approved, rejected, promoted, superseded, dev) with saturated accent palette per CONTEXT.md UX-02; ENV column is separate; pending-approval rows visually highlighted; section headers show pending count badge; "Pending review only" filter chip narrows table
  3. Project tiles with no prod/dev release row render `Prod: Not yet released` / `Dev: Not yet released` (no `--`); timestamps hidden when no row to time-relate; tile style remains standard (no greyed inactive treatment)
  4. Staff "preview as customer" toggle in StaffCallout sets a 1-hour cookie (`__Host-portal-preview-as-customer` in prod, HttpOnly+SameSite=Lax+Secure-in-prod, no Domain) that suppresses staff banner + flips userRole derivation to skip staff bypass; PreviewModeBanner shows the eye-emoji "Preview mode active (Xm remaining) — Exit preview" affordance; non-staff users with cookie set see ZERO change (security boundary)
**Plans**: 4 plans
- [x] 23.1-01-PLAN.md — Sub-nav layout component + Next.js nested layout + portal v0.4.7 (UX-01) (completed 2026-05-09)
- [x] 23.1-02-PLAN.md — ReleaseStatusPill + ENV column split + pending-approval row highlight + section badge + Pending-only filter chip + portal v0.4.8 (UX-02) (completed 2026-05-09)
- [x] 23.1-03-PLAN.md — Empty-state "Not yet released" copy + hidden timestamps on project tiles + portal v0.4.9 (UX-03) (completed 2026-05-09)
- [x] 23.1-04-PLAN.md — Staff preview-as-customer toggle (cookie helper + API route + PreviewModeBanner + StaffCallout mod + cookie-aware userRole across pages) + portal v0.5.0 phase close (UX-04) (completed 2026-05-10)

### Phase 24: CI/CD Deploy Safety
**Goal**: Cross-app deploy disasters are impossible — wrong-repo-to-wrong-Firebase-project deploys fail at CI, missing env vars fail container start, and per-repo deploy SAs limit blast radius.
**Depends on**: Phase 15, Phase 23
**Requirements**: CI-01, CI-02, CI-03, CI-04
**research_required**: true
**Research question**: Whether `MyAlterLego/shared-workflows@v4` is immutable in practice or can accept the new `verify-deploy-target` job + `repo_name` input via v5 tag; resolve before planning to avoid a per-repo equivalent regression in the consumer.
**Success Criteria** (what must be TRUE):
  1. `verify-deploy-target` job in `MyAlterLego/shared-workflows` (or admin's per-repo equivalent) fails the pipeline when `${{ github.repository }}` doesn't match the expected `firebase_project_id` per a committed lookup table — proven by a deliberately wrong-target test branch that gets rejected
  2. Portal deploys via `portal-deployer@triarch-vault.iam.gserviceaccount.com` and admin deploys via its own distinct deploy SA — neither SA has IAM on the other app's backend
  3. Booting portal with a missing required env var (e.g. unset `PORTAL_NEXTAUTH_SECRET`) fails container start with a clear error message; container does not serve a partially-broken surface
  4. CI step `validate-apphosting.ts` reads `apphosting.yaml` and `apphosting.dev.yaml` against an env-name TypeScript schema and fails the build on a missing or typo'd binding (proven by a deliberately broken test branch)
**Plans**: 4 plans
- [ ] 24-01-PLAN.md — Per-repo verify-deploy-target job + .github/deploy-targets.yml lookup table in BOTH admin and portal (CI-01) — SKIPPED per scope decision (2026-05-10)
- [x] 24-02-PLAN.md — instrumentation.ts + assertEnv.ts + env-schema.ts + Vitest in BOTH repos (CI-03) — admin v2.11.0 commit 42e29b3 + portal v0.5.1 commit cafeb44 (completed 2026-05-10)
- [x] 24-03-PLAN.md — scripts/validate-apphosting.ts + new CI step + Vitest in BOTH repos (CI-04) — admin v2.11.1 PR #55 (commits fad2268+a33000f) + portal v0.5.2 PR #27 (commits f5ef27f+a2cb5d4) (completed 2026-05-09)
- [ ] 24-04-PLAN.md — HUMAN-VERIFY runbook for portal-deployer SA + IAM + missing portal Actions secrets + live CI-01/CI-04 acceptance tests (CI-02) — SKIPPED per scope decision (2026-05-10)

### Phase 25: Cutover
**Goal**: Customers are routed from admin to portal — 301 redirect, email blast, Slack message URL refresh, telemetry on residual traffic, and a kill-switch in case portal regresses.
**Depends on**: Phase 22, Phase 23, Phase 24, Phase 20
**Requirements**: CUT-01, CUT-02, CUT-03, CUT-04, CUT-05
**Success Criteria** (what must be TRUE):
  1. Hitting `https://admin.triarch.dev/projects/<slug>/releases` returns HTTP 301 with `Location: https://portal.triarch.dev/projects/<slug>/releases` (path + query preserved); same for bug, feature, and any other `/projects/[slug]/*` route
  2. Email blast sent to all `project_members` rows with `role IN ('admin','viewer')` notifying the URL change, 90-day grace period, and new login URL — send confirmed via mail provider receipts
  3. Slack message URL update sweep run on last 30 days of `slack_action_audit` recreates active threads with portal URLs (sweep log committed to repo)
  4. Admin's redirect middleware emits `redirect_hits` metric (count + path) visible in monitoring; metric decays as customers update bookmarks
  5. Setting `PORTAL_REDIRECT_DISABLED=true` in admin env reverts admin to in-place serving without a code deploy — kill-switch verified by exercising it on dev backend
**Plans**: TBD

### Phase 26: Sunset (T+90)
**Goal**: Final cleanup once telemetry shows minimal residual traffic — delete deprecated routes, dead hostname-guard branches, and bump admin to v3.0.0 to mark the major surface change.
**Depends on**: Phase 25 (plus 90-day grace period)
**Requirements**: SUN-01, SUN-02, SUN-03
**Note**: Execution deferred until T+90 days after Phase 25 cutover lands. Reasonable to fold into a v2.3 milestone if grace period extends; included here so v2.2 requirement coverage is complete.
**Success Criteria** (what must be TRUE):
  1. Admin `/projects/[slug]/*` server components and API routes (the customer surface) are deleted from the admin repo — `git log --diff-filter=D` shows the removal commit
  2. v2.1 hostname-aware route guards in admin (`page.tsx`, `admin/layout.tsx`, `projects/layout.tsx`, `login/layout.tsx`) are deleted; admin only serves `admin.triarch.dev` host paths now — host-guard inventory file from Phase 17 is updated to reflect deletions
  3. Admin `package.json` bumped to v3.0.0 to mark the major surface-removal change; release notes call out the removed routes

## Progress

**Execution Order (v2.2):** 15 → (16, 17, 20 in parallel) → (18, 19) → 21 → (22, 23) → 24 → 25 → [T+90] → 26
(Phase 15 ops first; 16/17/20 parallel-safe; 18 needs 16+17; 19 needs 16; 21 needs 18+19; 22+23 need 21; 24 needs 23; 25 needs 22+23+24+20; 26 deferred T+90 after 25)

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Schema + Membership Migration | v1.14.0 | 6/6 | Complete | 2026-05-04 |
| 1.1. Membership Enforcement Audit | v1.14.0 | 6/6 | Complete | 2026-05-03 |
| 2. Customer Releases Page | v1.14.0 | 4/4 | Complete | 2026-05-05 |
| 3. Slack Interactive Approval | v1.14.0 | 3/3 | Complete | 2026-05-04 |
| 4. GitHub App Promotion | v1.14.0 | 3/4 | Complete | 2026-05-04 |
| 5. Round-trip + shared-workflows + Pilot | v1.14.0 | 5/5 | Complete | 2026-05-05 |
| 1. Central Secrets Vault | v2.0 | 6/6 | Complete | 2026-05-04 |
| 2. shared-workflows Hardening | v2.0 | 4/4 | Complete | 2026-05-05 |
| 3. Schema + GitHub App Permissions | v2.0 | 3/3 | Complete | 2026-05-04 |
| 4. promote-branch Workflow | v2.0 | 4/4 | Complete | 2026-05-05 |
| 5. Customer Page RC UI | v2.0 | 5/5 | Complete | 2026-05-05 |
| 6. promoteAndAudit Rewrite | v2.0 | 4/4 | Complete | 2026-05-05 |
| 7. OttoBot Dispatcher Hardening | v2.0 | 6/6 | Complete | 2026-05-05 |
| 7.5. Dev Cluster + Admin Dev Backend | v2.0 | 5/5 | Complete | 2026-05-05 |
| 8. Admin Home Pipeline Visibility | v2.1 | 3/3 | Complete   | 2026-05-08 |
| 9. Per-Project Pipeline Page and Web-UI Promote | v2.1 | 5/5 | Complete    | 2026-05-08 |
| 10. Schema Gate | v2.1 | 1/1 | Complete    | 2026-05-08 |
| 11. Commit Parser and Tracker Linkage Authoring | v2.1 | 5/5 | Complete    | 2026-05-08 |
| 12. Bug and Feature Detail Pages | v2.1 | 3/3 | Complete    | 2026-05-08 |
| 13. Branch Preview Swap | v2.1 | 3/3 | Complete    | 2026-05-08 |
| 14. Customer Page Integration | v2.1 | 3/3 | Complete    | 2026-05-08 |
| 15. Operational Prework | v2.2 | 5/5 | Complete    | 2026-05-08 |
| 16. Shared Package Extraction | v2.2 | 4/4 | Complete    | 2026-05-08 |
| 17. Hostname Guard Inventory | v2.2 | 2/2 | Complete    | 2026-05-08 |
| 18. Portal Auth Scaffolding | v2.2 | 5/5 | Complete    | 2026-05-08 |
| 19. Database Connectivity | v2.2 | 2/2 | Complete    | 2026-05-08 |
| 20. URL Centralization | v2.2 | 2/2 | Complete    | 2026-05-08 |
| 21. Release Page Port (Read) | v2.2 | 4/6 | Complete    | 2026-05-08 |
| 22. Release Page Port (Write) | v2.2 | 4/5 | Complete    | 2026-05-09 |
| 23. Bug + Feature Customer Surface | v2.2 | 3/4 | Complete    | 2026-05-09 |
| 23.1. Portal UI Polish | v2.2 | 4/4 | Complete    | 2026-05-10 |
| 24. CI/CD Deploy Safety | v2.2 | 2/4 | Complete    | 2026-05-10 |
| 25. Cutover | v2.2 | 0/0 | Not started | - |
| 26. Sunset (T+90) | v2.2 | 0/0 | Not started | - |


### Phase 36: Inclusion Approval State Machine

**Goal:** Add an explicit "decide what goes IN the next build" gate. Schema + admin UI + commit-parser extension + read-only customer portal page. Closes the gap that today lets every committed bug/feature reference auto-flow to the next prod deploy without a deliberate decision step. Pilot scope: TMI; rollout to other projects deferred to post-30-day-dogfooding review.
**Requirements:** INCL-01..08 (8 reqs)
**Depends on:** Phase 35
**Success criteria:**
- Schema migration adds `inclusion_state` + `next_release_log_id` to `bug_reports` and `feature_requests`; `npx drizzle-kit check` clean
- Admin `/admin/modules/next-build-plan/{slug}` page lists `approved_for_build` items with inline remove-from-build action
- Commit-parser auto-flips `approved_for_build → built` on commit ingest with proper `next_release_log_id` stamping; 100% of v2.1 Phase 11 tests still GREEN
- Prod deploy completion auto-flips `built → deployed` (verified end-to-end against TMI pilot)
- Portal `/projects/{slug}/upcoming` page renders the "what's coming" view, fetching from `/api/portal/projects/{slug}/upcoming` with cookie-based membership auth

**Plans:** 0 plans (to be planned)
- [ ] TBD (run /gsd:plan-phase 36 to break down)

### Phase 37: Claude Code Build Trigger

**Goal:** Bridge "build plan approved" → "Claude Code executing the build" with one click. Generates a structured GSD-compatible prompt from the approved items, presents two trigger modes (copy-to-clipboard for paste into existing session, deep-link for fresh-session launch), and stores a per-project preference for which mode the button defaults to. Audit-logs every trigger event.
**Requirements:** TRIG-01..06 (6 reqs)
**Depends on:** Phase 36
**Success criteria:**
- `src/lib/build-prompt.ts` generator produces a prompt that successfully drives a Claude Code session through `/gsd:plan-phase` for a pilot TMI item (manual UAT)
- "Generate build" button on Next Build Plan page is disabled when 0 items approved, enabled otherwise
- Both modes work: clipboard mode confirms via toast; deep-link mode opens Claude Code locally (manual UAT)
- `projects.build_trigger_mode` column with check constraint; per-project preference editable from project admin UI
- Every trigger writes a row to `approval_events` with the prompt excerpt for audit; visible in existing Slack audit page

**Plans:** 0 plans (to be planned)
- [ ] TBD (run /gsd:plan-phase 37 to break down)

### Phase 38: Managed Agent Variant RFC

**Goal:** Design (not implement) the Anthropic Managed Agent variant of the build trigger. Produce a written RFC covering platform fit, webhook contract, agent playbook, failure modes, opt-in mechanic, and trust boundary. Sets up v2.5 to make a quick implementation decision.
**Requirements:** AGENT-01 (1 req)
**Depends on:** Phase 37
**Success criteria:**
- `.planning/research/MANAGED-AGENT-RFC.md` exists with all six required sections (platform fit / webhook contract / playbook / failure modes / opt-in / trust boundary)
- RFC explicitly states: agent only dispatches pre-existing workflows; cannot push code directly; cannot mutate admin schema; failure modes route to existing human-checkpoint admin paths
- No code changes ship in this phase

**Plans:** 0 plans (to be planned)
- [ ] TBD (run /gsd:plan-phase 38 to break down)

---

## v2.4 — Build Cycle Workflow (active)

| Phase | Name | Reqs | Status |
|-------|------|------|--------|
| 36 | Inclusion Approval State Machine | INCL-01..08 | Not started |
| 37 | Claude Code Build Trigger | TRIG-01..06 | Not started |
| 38 | Managed Agent Variant RFC | AGENT-01 | Not started |

**v2.4 coverage:** 15/15 requirements mapped to phases.
**Pilot:** TMI only. Soft prescription for 30 days post Phase 37 ship → evaluate hard gate as v3.0 candidate.

---

(end of roadmap entries below)
- [ ] TBD (run /gsd:plan-phase 38 to break down)
