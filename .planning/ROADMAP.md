# Roadmap: Triarch Dev Admin

## Milestones

- ✅ **v1.14.0 Customer Release Gating** — Phases 1–5 (shipped 2026-05-04) → [`milestones/v1.14.0-ROADMAP.md`](./milestones/v1.14.0-ROADMAP.md)
- ✅ **v2.0 Multi-Branch RC + Central Vault + OttoBot Brain** — Phases 1–7.5 (shipped 2026-05-06)
- 🚧 **v2.1 Pipeline UI** — Phases 8–14 (in progress)

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

### 🚧 v2.1 Pipeline UI (In Progress)

**Milestone Goal:** Make the dev→prod CI/CD pipeline that v2.0 built legible and operable from the admin/customer web surfaces — per-project prod-vs-dev at a glance, on-demand branch previews customers can drive themselves, web-UI promotion, bidirectional bug/feature ↔ release linkage, and what-changed views on both admin and customer pages.

- [x] **Phase 8: Admin Home Pipeline Visibility** - Per-project prod/dev versions, pending-approval count, last-deploy timestamp, clickable tiles, compact what-changed summary (completed 2026-05-08)
- [ ] **Phase 9: Per-Project Pipeline Page and Web-UI Promote** - `/admin/modules/pipeline/[slug]`, PromoteButton island, promote API route, expanded what-changed view, double-promote guard
- [x] **Phase 10: Schema Gate** - `release_log_links` join table, `projects` branch-preview lock columns, Drizzle schema + migration verified (completed 2026-05-08)
- [x] **Phase 11: Commit Parser and Tracker Linkage Authoring** - `commit-parser.ts`, ingest auto-stamp, manual add/remove UI in release-logs (completed 2026-05-08)
- [x] **Phase 12: Bug and Feature Detail Pages** - `/admin/modules/bug-reports/[id]`, `/admin/modules/feature-requests/[id]`, "Released in" sidebar section (completed 2026-05-08)
- [x] **Phase 13: Branch Preview Swap** - `BranchPreviewClient`, `/api/projects/[slug]/branch/preview`, SWR polling, DB lock lifecycle (3 plans, research resolved) (completed 2026-05-08)
- [ ] **Phase 14: Customer Page Integration** - Entry type filter chips, "What's coming to prod" summary card, branch swap UI in section headers

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
- [ ] 14-03-PLAN.md — BranchPreviewClient split (banner singleton + per-section buttons) + BranchSection header integration + human-verify checkpoint + v2.8.0 (CUST-03)

## Progress

**Execution Order:** 8 → 9 → 10 → 11 → 12 → 13 → 14
(Phases 8 and 9 ship before any schema migration risk; Phase 10 is the schema gate; Phase 13 is gated on Firebase API research spike; Phase 14 last because it aggregates all preceding phases and includes navigation/discoverability audit)

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
| 9. Per-Project Pipeline Page and Web-UI Promote | v2.1 | 4/5 | In Progress|  |
| 10. Schema Gate | v2.1 | 1/1 | Complete    | 2026-05-08 |
| 11. Commit Parser and Tracker Linkage Authoring | v2.1 | 5/5 | Complete    | 2026-05-08 |
| 12. Bug and Feature Detail Pages | v2.1 | 3/3 | Complete    | 2026-05-08 |
| 13. Branch Preview Swap | v2.1 | 3/3 | Complete    | 2026-05-08 |
| 14. Customer Page Integration | v2.1 | 2/3 | In Progress|  |
