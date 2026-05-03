# Backlog: Triarch Dev Admin

Items deferred from active milestones. Promote to a milestone when prioritized.

## From audit 2026-05-03 (gaps identified vs the original 7-phase scope, not in v1.14.0)

### Project Management (UI gap)

- [ ] **PROJ-03**: Project detail page showing recent releases, open bugs, feature requests for that project. Currently the `/admin/platform/projects` list is the only project surface; v1.14.0 customer pages live at `/projects/{slug}/releases` but a richer staff-facing detail page is a follow-up.

### Bug Tracking

- [ ] **BUG-03**: Kanban board view (Open → In Progress → Resolved → Closed) — list view exists; Kanban is a UX nice-to-have.
- [ ] **BUG-06**: Bulk operations on bugs (assign, change status, change priority).
- [ ] **BUG-04 enhancement**: Full bug detail view with comments + complete status history (partial today via `workflowTransitions` table; UI doesn't yet render the history).

### Feature Requests

- [ ] **FEAT-02 enhancement**: Upvoting UI (table column exists; no submit-vote action in UI).
- [ ] **FEAT-03 verification**: Confirm full status workflow (Proposed → Approved → In Progress → Shipped → Closed) is wired in code.
- [ ] **FEAT-04**: Feature detail page with comments and linked bugs.

### Automated Project Creation

- [ ] **CREATE-03**: Auto-add shared-workflows CI/CD files (`.github/workflows/`) to scaffolded repos as part of project creation.
- [ ] **CREATE-07**: Auto-provision GitHub repo secrets (`DATABASE_URL`, JWT secret, etc.) at project creation.
- [ ] **CREATE-10**: Wizard prompts for one or more initial customer admin email addresses.
- [ ] **CREATE-11**: On successful creation, those emails are inserted into `project_members` with role `admin`. (After v1.14.0 ships, this is the natural retrofit.)

### Release Logs (UI gap)

- [ ] **REL-04**: Release detail page showing changelog entries, linked bugs/features, and env-by-env timeline (note: v1.14.0 GATE-13 builds a customer-facing version of this; staff-facing may need its own surface).

### Data Migration

- [ ] **MIG-01**: Migrate darksouls-rpg `bug_reports` (4 entries) to central `triarch_dev.bug_reports`.
- [ ] **MIG-02**: Migrate darksouls-rpg `release_logs` (21 entries) to central `triarch_dev.release_logs`.
- [ ] **MIG-03**: Update darksouls-rpg to submit bugs/releases to admin API instead of local DB.

### Gating v2 Enhancements (post-pilot)

- [ ] **GATE-V2-01**: Multiple staging environments per project (dev, staging, uat) with sequential approval gates.
- [ ] **GATE-V2-02**: Auto-rollback on prod deploy failure with one-click revert.
- [ ] **GATE-V2-03**: Approval requires N-of-M sign-offs for sensitive projects.

### Monitoring (originally v2)

- [ ] **MON-01**: Health-check polling for each registered project (`/api/health` every 5 min).
- [ ] **MON-02**: Uptime dashboard with availability percentage per project.
- [ ] **MON-03**: Cross-project deploy history timeline.

### Team / Access (originally v2)

- [ ] **TEAM-01**: Multiple admin users with role-based access — extends MEMBER-* with finer-grained roles.
- [ ] **TEAM-02**: Bug/feature assignment to team members.
- [ ] **TEAM-03**: Activity feed showing who did what across all projects.

### Analytics (originally v2)

- [ ] **ANALYTICS-01**: Bug velocity chart (opened vs closed over time).
- [ ] **ANALYTICS-02**: Mean time to resolution by project.
- [ ] **ANALYTICS-03**: Release frequency dashboard.

## Stale doc to reconcile

- `Plans/BUILD_PLAN.md` was the pre-`.planning/` historical plan. It says "ALL PHASES COMPLETE (v0.9.0)" but the repo is now at v1.13.1 with substantially more shipped. Either delete or move under `.planning/archive/` after v1.14.0 ships, so it stops misleading future readers.
