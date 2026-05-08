# Requirements: Triarch Dev Admin — v2.1 Pipeline UI

**Defined:** 2026-05-07
**Core Value:** One control plane to create, manage, and ship Triarch projects — including a dev-to-prod gating workflow that lets customers approve releases before they go live.
**Milestone goal:** Make the dev→prod CI/CD pipeline that v2.0 built legible and operable from the admin/customer web surfaces. Today the cluster, dev backends, customer release-gating page, GitHub App, OttoBot dispatcher, and `promote-branch.yml` workflow all work — but the visualization and control loop runs through Slack and tribal knowledge. v2.1 closes that loop.
**Source decisions:** discuss-milestone session 2026-05-07 — branch preview = selector on dev backend, web promote = both (alongside Slack), tracker linkage = bidirectional + filter, bug/feat ID stamping = auto + manual override, what-changed view = both pages, branch switch trigger = customer admin.

---

## v2.1 Requirements

### Pipeline Visibility (PIPE)

- [x] **PIPE-01**: Admin user sees per-project prod version and dev version side-by-side on `/admin` home (replaces single `currentVersion` column)
- [x] **PIPE-02**: Admin user sees pending-approval count badge per project tile (count of RCs with `status='pending_approval'`)
- [x] **PIPE-03**: Admin user sees last-deploy timestamp per project per environment ("dev: 12 min ago / prod: 3 days ago")
- [x] **PIPE-04**: Admin user can click any project tile to navigate directly to `/projects/<slug>/releases`
- [x] **PIPE-05**: Staff user can open a per-project pipeline page at `/admin/modules/pipeline/<slug>` showing consolidated env state, branch RC list, deploy history, and embedded what-changed view
- [x] **PIPE-06**: Admin home tile shows compact one-liner what-changed summary ("4 entries since prod: 2 bug fixes, 1 feature, 1 other")

### Web-UI Promote (PROM)

- [x] **PROM-01**: Staff user sees a Promote button next to any approved RC on the per-project pipeline page
- [x] **PROM-02**: Promote button uses two-step confirm modal with specific label ("Promote feat/audio v1.4.2 to production")
- [x] **PROM-03**: Web Promote dispatches `promote-branch.yml` via the same `dispatchWorkflow` path as the Slack flow; Slack notification posted on every successful dispatch (web or Slack origin)
- [x] **PROM-04**: System prevents double-promote race between web and Slack paths via unique constraint on `release_approvals (release_id, decision='approved')`
- [x] **PROM-05**: After Promote click, button shows in-flight state then surfaces result (merged / conflict / ci_failed) inline; on terminal failure, error pill links to the GitHub Actions run

### What's-Changed Views (DIFF)

- [x] **DIFF-01**: Admin user sees expanded "What's changed" entry-by-entry view on per-project pipeline page (typed table: Type pill, Title, Author, Date, bug/feature link)
- [ ] **DIFF-02**: Customer admin sees "What's coming to prod" summary card at top of `/projects/<slug>/releases` (collapsed by default; counts visible in collapsed state)

### Tracker ↔ Release Linkage (LINK)

- [x] **LINK-01**: System has `release_log_links` join table with FK indexes (links release entries to bug_reports / feature_requests / external)
- [x] **LINK-02**: Release ingest auto-detects bug/feature IDs in commit messages via regex (patterns: `#BUG-123`, `closes FEAT-45`, `fixes #99`) and writes to `release_log_links`
- [x] **LINK-03**: Auto-detected IDs are validated against existing bug/feature IDs in DB before stamping (no false positives surfaced)
- [x] **LINK-04**: Authoring UI in `/admin/modules/release-logs` lets staff manually add or remove links per release entry (override auto-detection)
- [ ] **LINK-05**: Bug detail page (`/admin/modules/bug-reports/<id>`) shows "Released in vX.Y dev / vA.B prod" sidebar section
- [ ] **LINK-06**: Feature detail page (`/admin/modules/feature-requests/<id>`) shows same "Released in" sidebar section
- [x] **LINK-07**: Commit message content is sanitized before any render or Slack post (strip Slack mrkdwn control chars, zero-width / RTL-override chars)

### Branch Preview (PREV)

- [x] **PREV-01**: System has `projects.preview_branch_locked` (text, nullable) and `preview_branch_locked_at` (timestamp with timezone, nullable) columns to coordinate branch swap concurrency
- [ ] **PREV-02**: Customer admin can click "Preview this branch" next to any RC on `/projects/<slug>/releases`
- [ ] **PREV-03**: Branch swap calls Firebase App Hosting programmatic rollout API to deploy the selected branch onto the project's existing dev backend (e.g. `truthtreason-dev`, `tmi-dev`, `darksouls-dev`, etc.)
- [ ] **PREV-04**: While swap is in flight, all RC rows on the page show "branch X currently previewing — set N minutes ago by user@email" banner; competing Preview buttons disabled with tooltip
- [ ] **PREV-05**: System polls rollout state via SWR at 5-second interval until terminal (SUCCEEDED / FAILED); 8-minute hard timeout
- [ ] **PREV-06**: Preview lock auto-clears on rollout terminal state (success or failure); FAILED state surfaces error inline with link to FAH console

### Customer Page Integration (CUST)

- [ ] **CUST-01**: Customer admin can filter `/projects/<slug>/releases` by entry type (chips: Bug fixes / Features / Other) with URL-mirrored state
- [ ] **CUST-02**: Filter chips show counts ("Bug fixes (4)", "Features (2)") and follow the established `SlackAuditClient.tsx` URL-params pattern
- [ ] **CUST-03**: Branch swap UI from PREV-02 is integrated into branch section headers on the customer release page

---

## Out of Scope

| Feature | Reason |
|---------|--------|
| Per-branch ephemeral backends | User decided: selector on shared dev backend instead. Per-branch URLs require N Cloud Run services + auto-cleanup, multiplying cost and complexity |
| Real-time deploy log streaming | Logs live in GitHub Actions and Firebase Console; we link to those runs rather than mirror them. SSE/WebSocket also unreliable on FAH's 5-min request timeout |
| Type-to-confirm modal on Promote | Two-step modal with specific button label is sufficient per NN/G + GitLab design guidance |
| Notification configuration UI | Slack channel binding stays in project registry (existing); per-user notification preferences not part of v2.1 |
| Rollback button | Firebase App Hosting does not support deploying past artifacts. Rollback = git revert + redeploy via normal flow |
| Replacing Slack approve flow entirely | User decided "Both": web Promote is alternative not replacement. Slack interactive approve buttons remain functional |
| Branch swap history audit log | Not in v2.1 scope; if needed, add a `preview_swap_history` table later |
| Per-PR ephemeral previews (Vercel-style) | Out of architecture model — would require per-branch backends, contradicts shared-slot decision |
| Sort/filter on admin home | Project count is small; deferred to v2.1.x if it becomes painful |

---

## Future Requirements (v2.1.x or v2.2)

### Customer Page Polish

- **CUST-04**: GitHub Actions run link surfaced from each release row on customer page (already on admin pipeline page)
- **CUST-05**: Per-RC deploy timeline expanded view (intermediate states beyond approved/promoted)

### Pipeline UX

- **PIPE-07**: Sort/filter on admin home (by pending-approval count, by stale-prod, by last-activity)
- **PIPE-08**: Project search box on admin home (currently relies on tile scan)

### Tracker

- **LINK-08**: Bulk re-stamp from commit messages (one-shot retroactive linking for releases ingested before LINK-02 shipped)
- **LINK-09**: Cross-project release-impact view ("this bug affects projects X, Y, Z")

---

## Traceability

Populated by `gsd-roadmapper` 2026-05-07.

| Requirement | Phase | Status |
|-------------|-------|--------|
| PIPE-01 | Phase 8 — Admin Home Pipeline Visibility | Complete |
| PIPE-02 | Phase 8 — Admin Home Pipeline Visibility | Complete |
| PIPE-03 | Phase 8 — Admin Home Pipeline Visibility | Complete |
| PIPE-04 | Phase 8 — Admin Home Pipeline Visibility | Complete |
| PIPE-06 | Phase 8 — Admin Home Pipeline Visibility | Complete |
| PIPE-05 | Phase 9 — Per-Project Pipeline Page and Web-UI Promote | Complete |
| PROM-01 | Phase 9 — Per-Project Pipeline Page and Web-UI Promote | Complete |
| PROM-02 | Phase 9 — Per-Project Pipeline Page and Web-UI Promote | Complete |
| PROM-03 | Phase 9 — Per-Project Pipeline Page and Web-UI Promote | Complete |
| PROM-04 | Phase 9 — Per-Project Pipeline Page and Web-UI Promote | Complete |
| PROM-05 | Phase 9 — Per-Project Pipeline Page and Web-UI Promote | Complete |
| DIFF-01 | Phase 9 — Per-Project Pipeline Page and Web-UI Promote | Complete |
| LINK-01 | Phase 10 — Schema Gate | Complete |
| PREV-01 | Phase 10 — Schema Gate | Complete |
| LINK-02 | Phase 11 — Commit Parser and Tracker Linkage Authoring | Complete |
| LINK-03 | Phase 11 — Commit Parser and Tracker Linkage Authoring | Complete |
| LINK-04 | Phase 11 — Commit Parser and Tracker Linkage Authoring | Complete |
| LINK-07 | Phase 11 — Commit Parser and Tracker Linkage Authoring | Complete |
| LINK-05 | Phase 12 — Bug and Feature Detail Pages | Pending |
| LINK-06 | Phase 12 — Bug and Feature Detail Pages | Pending |
| PREV-02 | Phase 13 — Branch Preview Swap | Pending |
| PREV-03 | Phase 13 — Branch Preview Swap | Pending |
| PREV-04 | Phase 13 — Branch Preview Swap | Pending |
| PREV-05 | Phase 13 — Branch Preview Swap | Pending |
| PREV-06 | Phase 13 — Branch Preview Swap | Pending |
| CUST-01 | Phase 14 — Customer Page Integration | Pending |
| CUST-02 | Phase 14 — Customer Page Integration | Pending |
| CUST-03 | Phase 14 — Customer Page Integration | Pending |
| DIFF-02 | Phase 14 — Customer Page Integration | Pending |

**Coverage:**
- v2.1 requirements: 29 total (enumerated: PIPE×6, PROM×5, DIFF×2, LINK×7, PREV×6, CUST×3)
- Note: REQUIREMENTS.md header originally stated 27; enumeration yields 29. All 29 are mapped.
- Mapped to phases: 29/29
- Unmapped: 0

---
*Requirements defined: 2026-05-07*
*Traceability populated: 2026-05-07 — v2.1 roadmap created (gsd-roadmapper)*
*Last updated: 2026-05-07 — traceability section completed*
