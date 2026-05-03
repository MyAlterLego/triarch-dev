# Triarch Dev Admin

## What This Is

Operations console for managing all Triarch-deployed projects: project registry with health and release status, automated provisioning across GitHub/Firebase/GoDaddy/CockroachDB, centralized bug/feature tracking, release log aggregation, and customer-gated production deploys with Slack-driven promotion. Deployed as a Next.js app on Firebase App Hosting at `admin.triarch.dev`.

## Core Value

One control plane to create, manage, and ship Triarch projects — including a dev-to-prod gating workflow that lets customers approve releases before they go live.

## Status

**Repository:** `MyAlterLego/triarch-dev` — currently `v1.13.1` (shipped)

Already operational at v1.13.1: foundation, NextAuth Google OAuth with email allowlist, project registry, automated project creation wizard (scaffold-template + GitHub MCP + GoDaddy DNS + CRDB provisioning), bug/feature reports, release log ingestion (webhook backfill from GitHub), Slack outgoing notifications, project decommissioning.

**Active milestone: v1.14.0 — Customer Release Gating** (5 phases)
- See `ROADMAP.md` for phase detail and `REQUIREMENTS.md` for the requirement list.

## Requirements

### v1.14.0 — Customer Release Gating (Active)

- [ ] Customer admin can review releases for their projects on `admin.triarch.dev` and submit feedback
- [ ] Customer admin can approve a release for production with audit trail (approver, timestamp, IP)
- [ ] Approval triggers a Slack message in `#release-approvals` with interactive Approve/Reject buttons
- [ ] Slack approve callback (signature-verified) dispatches the project's `deploy-prod.yml` via GitHub App
- [ ] After successful prod deploy, status round-trips back to admin so the release timeline reflects `dev → approved → promoted`
- [ ] Truth+Treason is the pilot project; once Phase 5 lands the workflow is exercised end-to-end through it

### Already Shipped (v1.13.1)

- Foundation, App Hosting, NextAuth Google OAuth with email allowlist
- Project registry table with status, repo, domain, Firebase project, CRDB cluster/DB
- Automated project creation wizard (scaffold-repo, provision-db, provision-dns)
- Cascading project decommissioning
- Bug reports + feature requests submission, list, ingestion API, status workflow transitions
- Release log table + viewer + GitHub webhook backfill
- Slack outgoing notifications (currently bug/feature actions, not yet release approvals)

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
*Last updated: 2026-05-03 — scope reset post-audit; milestone v1.14.0 defined for Customer Release Gating*
