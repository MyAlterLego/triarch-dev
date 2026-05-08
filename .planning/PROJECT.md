# Triarch Dev Admin

## What This Is

Operations console for managing all Triarch-deployed projects: project registry with health and release status, automated provisioning across GitHub/Firebase/GoDaddy/CockroachDB, centralized bug/feature tracking, release log aggregation, and customer-gated production deploys with Slack-driven promotion. Deployed as a Next.js app on Firebase App Hosting at `admin.triarch.dev`.

## Core Value

One control plane to create, manage, and ship Triarch projects — including a dev-to-prod gating workflow that lets customers approve releases before they go live.

## Status

**Repository:** `MyAlterLego/triarch-dev` — currently `v2.1.0` (Phase 01 complete, post-deploy HUMAN-UAT pending)

Already operational at v1.14.6: foundation, DB-backed staff/membership roles, project registry, automated project creation wizard, bug/feature reports, release log ingestion, **customer release gating workflow** (customer page → Slack notify → GitHub App promote → round-trip ingest → lifecycle timeline), OttoBot unified Slack dispatcher, project decommissioning.

**v2.0 Phase 01 (Central Secrets Vault) shipped 2026-05-04:** `triarch-vault` GCP project with 7 shared secrets, `@myalterlego/secrets@0.1.0` npm package (cache + env fallback), per-secret IAM grants for admin + CRM runtime SAs, admin app and CRM both reading from vault, staff-only `/api/platform/health/secrets` endpoint, onboarding docs Step 7.

**v2.0 Phase 05 (Customer Page RC UI) shipped 2026-05-05:** `/projects/{slug}/releases` restructured into collapsible per-branch sections (main pinned first, feature branches by recency); inline `<PreviewLink>` ExternalLink icon with disabled fallback for missing `metadata.previewUrl`; per-RC two-step approve UX with branch+version in confirm label and full cross-branch state isolation; conflict badge in section header + per row driven by `promote_attempts` query, approve hidden with "Resolve conflict to enable approval" helper, auto-clears when newer release lands. Test infra: RTL + jsdom installed, 11 new tests across 4 test files, 85/85 GREEN. Five HUMAN-UAT items deferred to Phase 7.5/8 pilot (need live multi-branch + conflict data).

**v2.0 Phase 06 (promoteAndAudit Rewrite) shipped 2026-05-05:** `promoteAndAudit` now dispatches `promote-branch.yml + {branch}` (replacing `deploy-prod.yml + {tag}`); persists `metadata.dispatch.{slackChannelId, slackMessageTs, dispatchedAt}` via `sql\`jsonb_set(...)\`` (preserves Phase 5 `metadata.previewUrl`); `notifyReleaseApproved` includes branch in OttoBot approval header (`{branch} {version} approved by {approverEmail}`); `/api/platform/promote-callback` looks up release by `(project, branch)` and posts threaded Slack reply for conflict (`:warning:` + capped file list + rebase hint), merged (`:white_check_mark:` + sha), and ci_failed (`:no_entry:` + run URL); D-11 graceful skip when metadata missing; D-15 best-effort try/catch always returns 201. New 3-test concurrent-approval suite proves D-16 per-row UUID isolation. `docs/onboarding-projects.md` Step 9 documents consumer's `promote-branch.yml@v3` stub + `ADMIN_API_TOKEN`. 105/105 tests GREEN. Four HUMAN-UAT items batched with Phase 8 Truth+Treason pilot.

**v2.0 Phase 07 (OttoBot Dispatcher Hardening) shipped 2026-05-05:** New `src/lib/slack-audit.ts` (`recordSlackAudit` + `hashSlackPayload`) wraps `slack_action_audit` insert in best-effort try/catch (D-08); fire-and-forget `void recordSlackAudit(...)` wired at 15 return paths in `/api/slack/interact`. New `POST /api/slack/commands` route handles `/triarch deploy <project> <version>` (staff-only, dispatches `promote-branch.yml`), `/triarch status <project>` (Block Kit response), and empty `/triarch` (help text). New `POST /api/slack/events` route handles `app_mention` (status mirrored via shared `slack-status.ts` Block Kit builder), with `url_verification` BEFORE HMAC (D-19) and `Map<string, number>` FIFO event-id dedup (D-20). New staff-only `/admin/platform/slack-audit` page (server component + `SlackAuditClient.tsx` + load-more API endpoint): 4 URL-mirrored filters (action_id, actor_email, date from/to), PAGE_SIZE=50, color-coded status badges, click-to-expand row detail. `scripts/seed-slack-audit-nav.sql` adds the staff-only nav entry to `menu_pages`. `docs/onboarding-projects.md` Step 10 documents Slack App scope upgrade procedure (3 scopes: chat:write.public, app_mentions:read, commands; slash command URL; Events API URL; OAuth reinstall). 126/126 tests GREEN. Three HUMAN-UAT items pending (SQL seed application, Slack App scope upgrade, E2E smoke test) — Mike completes post-deploy.

**v2.0 Phase 7.5 (Dev Cluster + Admin Dev Backend) — code complete 2026-05-05; HUMAN runbook pending:** Code deliverables (`scripts/provision-dev-dbs.sql` with 6 idempotent CREATE DATABASE IF NOT EXISTS for admin_dev/portal_dev/darksouls_dev/tmi_dev/truthtreason_dev/www_dev; shared-workflows v4 changes on `feat/v4-environment-input` branch — `deploy-firebase.yml` adds `environment: dev|prod` input with backwards-compat default `prod`, NEW reusable `db-migrate.yml` reads env-specific DATABASE_URL secret + runs `drizzle-kit push`; admin `apphosting.yaml`/`apphosting.prod.yaml` overlay split per Pitfall-1 guard (prod COMPLETE config preserves `NODE_AUTH_TOKEN`); `docs/onboarding-projects.md` Step 11 generalizes the convention; `07.5-PHASE-4-UAT-CLOSURE.md` template + `07.5-HUMAN-UAT.md` mirror both committed) all verified. 126/126 tests still GREEN. **17 HUMAN runbook items in `07.5-RUNBOOK.html` pending Mike's hands-on action**: provision new CRDB Cloud cluster (A-1, A-2), create `<app>-dev` FAH backends across 6 projects with `DATABASE_URL_DEV` secrets (B-1..B-6), tag shared-workflows@v4 after admin canary verifies and bump consumer ci-cd.yml refs (C-1..C-3), exercise Phase 4 deferred UAT scenarios against admin-dev (D-1..D-4) and mark `04-HUMAN-UAT.md` resolved (D-5).

**Active milestone: v2.0 — Multi-Branch RC + Central Vault + OttoBot Brain** (in progress)
- Headline: customer-gated parallel release candidates with auto-rebase-and-merge promotion, unified credential storage, and OttoBot as the canonical Slack control plane.
- Phases 01, 02, 03, 04, 05, 06, 07, 7.5 (code) complete — Phase 8 (Truth+Treason pilot) gated on Mike completing the 7.5 runbook.

## Current Milestone: v2.1 — Pipeline UI

**Goal:** Make the dev→prod CI/CD pipeline that v2.0 built **legible and operable from the admin/customer web surfaces**. Today the cluster, dev backends, customer release-gating page, GitHub App, OttoBot dispatcher, and promote-branch workflow all work — but the visualization and control loop runs through Slack and tribal knowledge. v2.1 closes that loop: per-project prod-vs-dev at a glance, on-demand branch previews customers can drive themselves, web-UI promotion (Slack alongside, not replaced), bidirectional bug/feature ↔ release linkage with filterable views, and "what's changed between dev and prod" surfaced on both admin and customer pages.

**Target features:**
- Admin home: per-project prod/dev versions side-by-side, pending-approval count, last-deploy timestamp, link straight to release page
- Per-project admin pipeline page (consolidated view: env state, branch RCs, deploy history)
- Customer release page: branch selector — customer admin clicks "Preview this branch" on any RC to swap dev backend's deploy
- Branch swap concurrency: while one swap is in flight, other RCs disabled with "branch X currently previewing"
- Web-UI **Promote to prod** button on approved RCs (admin role); calls same `dispatchWorkflow` as Slack — both paths post Slack notifications
- Bug/feature ↔ release linkage: release entries link to bug/feature IDs (clickable); bug/feature detail pages show "Released in vX.Y dev / vA.B prod"
- Auto-detect bug/feature IDs from commit messages (parses `#BUG-123`, `closes FEAT-45`, `fixes #99`); authoring UI shows detected IDs with manual add/remove
- Customer page filterable by entry type: bug fixes, feature releases, other
- "What's changed between dev and prod" view: compact on admin pipeline-at-a-glance + expanded on per-project page + summary section atop customer release page
- Discoverability fixes: every admin project tile links to `/projects/<slug>/releases`; hosted dev URLs surfaced from the customer page

**v2.0 status:** Multi-Branch RC + Central Vault + OttoBot Brain. Phase 7.5 (dev cluster + 5 dev backends + admin overlay architecture + Slack scope upgrade + Phase 7 schema migrations + hostname routing + custom-domain DNS for triarch.dev apex / tmiengine.com tmi-dev / triarch.dev darksouls-dev) shipped 2026-05-06. Phase 8 (Truth+Treason pilot of multi-branch flow) deferred — folded into v2.1 since the parallel-RC UX it would have validated is what v2.1 actually builds.

**v2.1 Phase 14 (Customer Page Integration) shipped 2026-05-08:** Customer release page (`/projects/<slug>/releases`) integrates all preceding v2.1 work. New `FilterChips.tsx` client island (URL-mirrored `?type=bug|feature|other` via `router.replace` shallow, gradient outline on active chip, zero-count dimming, aria-pressed). New `WhatsComingCard.tsx` collapsed-by-default summary card at page top with violet→blue gradient KPI count headline ("4 entries since prod: 2 fixes, 1 feature, 1 other"); hidden when in sync. New `src/lib/release-entry-summary.ts` exports `getEntryTypeSummaryForProject` + `getWhatsComingToProd` (release-as-unit bucketing: fix > feature > other precedence). BranchPreviewClient split into named exports `BranchPreviewBanner` (singleton at top of ReleasesClient) + `BranchPreviewButton` (per-section in BranchSection headers); shared `usePreviewStatus` private hook ensures one SWR poll regardless of mount count. Default export retained as composition shim. 324/324 Vitest tests GREEN. `next build` clean. Version 2.8.0. **WhatsComingCard expanded view ships as placeholder — full entry table is a v2.1.x followup**. v2.1 milestone complete.

**v2.1 Phase 13 (Branch Preview Swap) shipped 2026-05-08:** Customer admins can click "Preview this branch" on any RC to swap their project's dev backend deploy. New `src/lib/fah-rollout.ts` (jose-signed JWT → access token → REST POST against `firebaseapphosting.googleapis.com/v1beta/.../rollouts`; mirrors github-app.ts pattern; 50-min token cache + single-flight latch; branch regex guard). New `POST /api/projects/[slug]/branch/preview` (atomic UPDATE-with-WHERE-IS-NULL lock acquisition on `projects.preview_branch_locked`; releases lock on FAH error; 409 on race-lost; persists rollout name in `metadata` via jsonb_set). New `GET /api/projects/[slug]/branch/preview/status` (8-min hard-cap timeout BEFORE FAH poll; branch-guarded auto-clear on terminal SUCCEEDED/FAILED/CANCELLED state — prevents stale poll from clobbering newer lock). New `BranchPreviewClient.tsx` client island with SWR `refreshInterval: terminal ? 0 : 5000` polling, in-flight banner with violet halo, all-buttons-disabled while swap in flight, FAH console deep-link on FAILED. Added `swr@^2.4.1` + `jose@^5` to deps (jose promoted from transitive). Version 2.7.0. **Operational setup pending Mike** (post-deploy): create `release-promoter@triarch-vault.iam.gserviceaccount.com` SA, grant `firebaseapphosting.rollouts.create` + `.builds.get` + `.rollouts.get` on each project's FAH backend, store SA key as `FAH_PROMOTER_SA_KEY` Firebase secret in triarch-dev-website project. Code path verified via mocked tests; full E2E human-verify deferred.

**v2.1 Phase 12 (Bug + Feature Detail Pages) shipped 2026-05-08:** New `/admin/modules/bug-reports/[id]/page.tsx` and `/admin/modules/feature-requests/[id]/page.tsx` server components — staff-only, two-column layout. Shared `<ReleasedInSidebar />` server component (101 lines, no `use client`) shows "Released in vX.Y dev / vA.B prod" with `text-violet-300` mono version Links, "Not released yet" empty state, both env states. New `src/lib/release-history.ts` exports `getReleaseHistoryForBug/Feature` and batch variants (Drizzle inner join, COALESCE ordering). List pages got `Link` wrap on row titles with `stopPropagation` so existing expand-on-click still works. 242/242 tests GREEN.

**v2.1 Phase 11 (Commit Parser + Tracker Linkage Authoring) shipped 2026-05-08:** Auto-stamp pipeline (`src/lib/commit-parser.ts` + `src/lib/link-stamper.ts`) detects `#BUG-{uuid}` / `closes FEAT-{uuid}` / `fixes #N` patterns in commit messages, validates against `bug_reports.id` / `feature_requests.id` via batched `inArray`, writes `release_log_links` rows with `source='commit'`. Non-blocking integration into `/api/platform/ingest/release-logs` route (try/catch wrap — release ingest never fails on linkage error). Manual override UI: new staff-only `GET/POST/DELETE /api/admin/release-logs/[id]/links` routes + `LinksClient.tsx` optimistic chip island with mount-fetch hydration (gap closure 11-05). Source-based gradient distinction: blue for `commit` (auto), teal for `manual` (staff override). Sanitization helpers (`src/lib/sanitize-commit.ts`) strip Slack mrkdwn injection vectors (`<!channel>`, `<!here>`, `<@U…>`, RTL/zero-width chars, Slack `<url|text>` link control chars) — applied at all 3 Slack post chokepoints. 235/235 tests GREEN. Version 2.6.2. Plan 10 (schema gate) shipped earlier the same day with `release_log_links` table + `projects.preview_branch_locked` columns. **Known limitation:** typeahead picker is a stub (UUID-paste only); typeahead search endpoints deferred to v2.1.x.

**v2.1 Phase 10 (Schema Gate) shipped 2026-05-08:** Single migration 0016 — `release_log_links` table (8 cols, 4 indexes, multi-discriminant CHECK constraint, cascade FKs to release_logs/bug_reports/feature_requests) + `projects.preview_branch_locked` (text) + `preview_branch_locked_at` (timestamptz) lock columns. Drizzle schema synced; migration applied to admin_dev cluster (with backfill of missing 0000-0015 base schema, deviation auto-fixed during execution). `drizzle-kit check` clean. Phase 11–13 unblocked. Version 2.5.1.

**v2.1 Phase 9 (Per-Project Pipeline Page + Web-UI Promote) shipped 2026-05-08:** New `/admin/modules/pipeline/<slug>` staff-only page (server component, 297 lines) with consolidated header (prod/dev versions w/ violet gradient), branch RC list (6 cells per row), expanded "What's changed" table (Type/Title/Branch/Author/Date with red-rose Bug fix / teal-emerald Feature / zinc Other gradient pills), deploy history. New `PromoteButton.tsx` client island (184 lines) — five-phase state machine (idle → confirming → dispatching → dispatched/failed) with two-step inline confirm pattern (no modal), exact label "Promote {branch} {version} to production", violet-400 spinner halo, teal Dispatched terminal pill, red Failed pill linking to GHA run URL. New `POST /api/admin/releases/[id]/promote` route (staff-only) calls `promoteAndAudit({ channelId: null, messageTs: null, slackUserName: null })` reusing the same dispatch path as Slack OttoBot. Atomic UPDATE-with-WHERE-IS-NULL race guard on `release_logs.promotion_dispatched_at` — both web and Slack handlers use it; loser gets 409 with `{ error: 'already_promoted', dispatched_by, dispatched_at }`. Schema additions: `release_approvals.actor_source` column (web/slack) + partial unique index `release_approvals_one_approved_per_release WHERE decision='approved'`. `projects.slack_channel_id` column added (uncovered during 09-02 execution). Admin home Project Health tile retargeted from `/projects/<slug>/releases` to `/admin/modules/pipeline/<slug>`. 159/159 tests GREEN. Version 2.5.0. PROM-05 merged/conflict terminal states deferred to future SWR-polling phase per CONTEXT.md (architecturally correct — async round-trip data unavailable at dispatch time).

**v2.1 Phase 8 (Admin Home Pipeline Visibility) shipped 2026-05-08:** `/admin` Project Health tile redesigned end-to-end. New `src/lib/pipeline-summary.ts` exports `getProjectPipelineSummaries()` — DISTINCT ON query with composite index `release_logs_project_env_deployed_idx` (Pitfall 8 guard, migration 0013), COALESCE(deployed_at, released_at) ordering, null-env exclusion, JS-side what-changed bucketing. Tile is now a Next.js Link to `/projects/<slug>/releases` with stacked prod/dev rows (mono version + relative timestamps), top-right amber pending-approval pill (absent when 0), and a what-changed one-liner ("4 entries since prod: 2 fixes, 1 feature, 1 other") that hides on parity and shows "dev behind prod" on inversion. Existing bug count, feature count, and status pill all preserved. 10-test Vitest TDD suite for pipeline-summary covers parity / dev-ahead / inversion / null-env / what-changed bucketing. 136/136 tests GREEN. `next build` passes. Version 2.4.0.

## Requirements

### v2.1 (Active)

See `REQUIREMENTS.md` — defined 2026-05-07.

### v2.0 (Shipped 2026-05-06, pending milestone-close audit)

Multi-Branch RC + Central Vault + OttoBot Brain. 8 phases (01–07.5). See MILESTONES.md once `/gsd:complete-milestone` runs.

### Already Shipped (v1.14.6 → v1.13.1)

**v1.14 (Customer Release Gating, shipped 2026-05-04):**
- DB-backed staff role + per-project membership replaces hardcoded email allowlist
- `release_feedback`, `release_approvals` tables; `release_logs` extended with env/status/commit_sha/deployed_at/promotion_dispatched_at/by
- Customer-facing `/projects/{slug}/releases` page: two-step approve, inline reject form, feedback compose, lifecycle timeline
- OttoBot unified Slack dispatcher at `/api/slack/interact` (signature-verified, routes by action_id)
- GitHub App (`Triarch Release Gate`) for promotion dispatch — RS256 JWT signer, 50-min token cache, single-flight latch
- Round-trip ingest endpoint `/api/releases/promoted` (per-project Bearer auth, atomic, idempotent)
- Onboarding runbook at `docs/onboarding-projects.md`

**v1.13 and earlier:**
- Foundation, App Hosting, NextAuth Google OAuth with email allowlist
- Project registry table with status, repo, domain, Firebase project, CRDB cluster/DB
- Automated project creation wizard (scaffold-repo, provision-db, provision-dns)
- Cascading project decommissioning
- Bug reports + feature requests submission, list, ingestion API, status workflow transitions
- Release log table + viewer + GitHub webhook backfill
- Slack bug-action / feature-action interactivity (now routed through OttoBot dispatcher)

### Backlog (post-v1.14.0)

See `BACKLOG.md`. Notable punts: project detail page (PROJ-03), bug Kanban (BUG-03), bulk bug ops (BUG-06), feature detail (FEAT-04), automated CI/CD file injection on project creation (CREATE-03/07), customer admin email seeding in creation wizard (CREATE-10/11), data migration from darksouls-rpg (MIG-*).

### Out of Scope

- Customer-facing portal (that's triarchsecurity-portal) — separate concern
- CRM/sales features (that's triarch-security CRM) — separate concern
- Game-specific features (that's darksouls-rpg) — projects are consumers, not built here
- CI/CD execution (handled by shared-workflows) — this console triggers and monitors, doesn't run pipelines

## Constraints

- **Stack**: Next.js 16 App Router, React 19, Tailwind v4, Drizzle ORM (already inherited at v1.13.1)
- **Auth**: NextAuth v4 + Google OAuth, JWT session strategy (already inherited; staff bypass currently hardcoded `email.endsWith('@triarchsecurity.com')` in `src/lib/auth.ts` — Phase 1 of this milestone moves it to a DB-backed role)
- **Database**: CockroachDB on `triarchdev-24092` cluster, database `triarch_dev` (already inherited)
- **Driver**: `pg.Pool` (already inherited)
- **Shared UI**: `@myalterlego/shared-ui ^1.2.0` (already inherited)
- **Deploy**: Firebase App Hosting on `angular-concord-489522-c4`, domain `admin.triarch.dev`
- **CI/CD**: shared-workflows pipeline (`.github/workflows/ci-cd.yml`)

## MCP servers available

- `mcp__godaddy__` — DNS management, domain configuration
- `mcp__firebase__` — App Hosting, project config, auth
- `mcp__github__` — Repo creation, workflow setup, secrets

## Key Decisions

| Decision | Rationale | Date |
|----------|-----------|------|
| Customer-gated prod deploys, central UI in admin.triarch.dev | One control plane scales across all customer projects; staging-embedded panels would fragment | 2026-05-03 |
| Slack App + GitHub App (not webhook + PAT) | Interactive buttons + signed callbacks + per-installation rotatable creds | 2026-05-03 |
| Truth+Treason as gating pilot | Real customer, single dev/prod pair, low blast radius if rough edges surface | 2026-05-03 |
| DB-backed role replaces hardcoded staff email check | Existing `email.endsWith('@triarchsecurity.com')` in `src/lib/auth.ts` doesn't scale; membership table needed for project-scoped customer access | 2026-05-03 |
| Schema additions to `releaseLogs` (env, status, commit_sha, deployed_at) before any gating UI | Cannot build approval workflow on a release row that doesn't track environment or lifecycle status | 2026-05-03 |
| Scope reset from 7-phase greenfield to single v1.14.0 milestone | Codebase audit at v1.13.1 found Foundation/Projects/Bugs/Features/Releases already shipped; greenfield plan would re-implement existing work | 2026-05-03 |

## Pre-existing decisions inherited from v1.0–v1.13 (observational, not active)

These are characteristics of the existing codebase that this milestone respects rather than relitigating:

- **Auth**: NextAuth v4 + Google OAuth, JWT strategy, email allowlist
- **Migrations**: Drizzle Kit `db:push`
- **Driver**: `pg.Pool` against CRDB
- **Shell**: AdminSidebar + admin layout, dark theme, golden accent (post-v1.7.0 rebrand)
- **URL pattern**: existing admin pages live under `/admin/*`; gating UI introduces customer-facing `/projects/{slug}/*`

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-05-08 — v2.1 milestone (Pipeline UI) complete; all 7 phases shipped*
