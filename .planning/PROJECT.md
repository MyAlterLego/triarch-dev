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

**Active milestone: v2.0 — Multi-Branch RC + Central Vault + OttoBot Brain** (in progress)
- Headline: customer-gated parallel release candidates with auto-rebase-and-merge promotion, unified credential storage, and OttoBot as the canonical Slack control plane.
- Phases 01, 02, 03, 04, 05, 06 complete — Phase 07+ continues.

## Current Milestone: v2.0 — Multi-Branch RC + Central Vault + OttoBot Brain

**Goal:** Three architectural initiatives that unblock the deferred v1.14 cross-repo work and add the parallel-RC pattern for customer-driven release management:
1. Multi-branch parallel RCs — customer reviews each feature branch independently, approval triggers auto-rebase-and-merge so prior work isn't reverted
2. Central credential vault (GCP Secret Manager) — single source of truth for shared creds (Slack, GitHub Apps), end the OttoBot-token-in-2-places drift
3. OttoBot dispatcher hardening — finish the shared-workflows changes v1.14 deferred (deploy-prod.yml, ci-cd notify steps), expand OttoBot scopes (slash commands, app mentions), add audit table for Slack actions

**Target features:**
- `release_logs.branch` column + branch-keyed RC tracking
- Branch preview deploys via FAH `--git-branch <branch>`
- Customer page groups RCs by branch with per-RC Approve buttons
- New `promote-branch.yml` workflow: rebase → CI → merge → conflict-detect
- Slack conflict notification path
- `triarch-vault` GCP project as canonical Secret Manager
- `@myalterlego/secrets` npm package wrapping GCP Secret Manager
- `slack_action_audit` table for OttoBot click compliance trail
- Slack slash commands (`/triarch deploy ...`) + app mentions (`@OttoBot status ...`)
- Truth+Treason E2E pilot of multi-branch flow with parallel font + audio RCs

## Requirements

### v2.0 (Active)

To be defined via `/gsd:new-milestone` — see source draft at `.planning/v1.15-MILESTONE-DRAFT.md`.

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

---
*Last updated: 2026-05-05 — Phase 06 (promoteAndAudit Rewrite) complete*
