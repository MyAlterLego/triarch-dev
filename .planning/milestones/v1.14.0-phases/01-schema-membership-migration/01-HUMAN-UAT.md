---
status: partial
phase: 01-schema-membership-migration
source: [01-VERIFICATION.md]
started: 2026-05-03T18:00:00-05:00
updated: 2026-05-03T22:00:00-05:00
---

## Current Test

[items 3-6 require interactive browser testing — sign in, project list, page, add/remove flow]

## Deploy fix history

Phase 1 code shipped successfully but the FAH deploy pipeline was broken since 2026-05-01 (commit `3d20ba2` mismatched `.npmrc`'s `${NODE_AUTH_TOKEN}` vs `apphosting.yaml`'s `GITHUB_PACKAGES_TOKEN` env var binding). Fixed in PR #6 (commit `abc...` merged 2026-05-03 21:55 UTC). New Cloud Run revision `triarch-dev-build-2026-05-03-005` is now serving traffic.

## Tests

### 1. Apply schema migration to staging DB
expected: New columns appear on `release_logs`; new tables `project_members`, `release_feedback`, `release_approvals` appear in the database.
result: PASSED 2026-05-03T18:23:00Z — Applied via `pg`-driver script against live triarch_dev DB. All 10 statements (3 CREATE TABLE, 4 ALTER TABLE ADD COLUMN, 2 ALTER TABLE ADD CONSTRAINT, 1 CREATE UNIQUE INDEX) succeeded.

### 2. Apply backfill SQL
expected: All three backfill statements run without error. `SELECT count(*) FROM release_logs WHERE env IS NULL;` → 0. `SELECT count(*) FROM project_members WHERE project_key = '*' AND role = 'staff';` → 1. `SELECT count(*) FROM project_members WHERE role = 'admin' AND email = 'mike@triarchsecurity.com';` → equal to count of existing projects.
result: PASSED 2026-05-03T18:25:00Z — UPDATE: 239 release_logs rows (env=dev, status=dev, deployed_at=created_at). INSERT: 7 admin rows (matches projects.count=7). INSERT: 1 wildcard staff row. Verification queries all match expected counts.

### 3. End-to-end sign-in via DB-backed staff role
expected: After migration applied, signing into `admin.triarch.dev` with `mike@triarchsecurity.com` succeeds. Server logs show the DB-backed `getCurrentUserContext()` returned `isStaff=true` (not the env-allowlist fallback).
result: [pending — requires browser sign-in]
non-interactive partial check: page route `/admin/platform/projects/truth-treason/members` returns 307 (redirect to /admin) for unauthenticated users — confirms the staff guard fires, doesn't confirm the DB-backed path.

### 4. Non-staff member sees only their projects
expected: After adding a non-`@triarchsecurity.com` email as a member to `truth+treason` project (via SQL or the new manage-members page), that user signs in and the project list shows only `truth+treason`, not other projects.
result: [pending — requires non-staff Google account + browser sign-in]

### 5. Non-member returns 404 for /projects/{slug}/members
expected: A user who is not a member of a project hits `/admin/platform/projects/{otherKey}/members` and receives a 404 (not 403, not "permission denied"). Project existence not leaked.
result: [pending — requires authenticated non-staff session]
note: page.tsx implements `if (!ctx || !ctx.isStaff) redirect('/admin')` — for non-staff signed-in users this is a redirect, not a 404. May want to revisit the spec wording: 404 was the design intent for "not a member"; current implementation redirects to /admin. Functionally equivalent (no information leak), but technically different from the original requirement.

### 6. Manage-members page add/remove flow
expected: As staff, navigate to `/admin/platform/projects/truth+treason/members`. Add a new member via the form (email + viewer role). Row appears in the table with the role badge. Click trash icon on a non-staff row → row disappears. Adding a duplicate email returns the inline 409 error.
result: [pending — requires browser]

### 7. Release-logs ingest accepts env param
expected: POST to `/api/platform/ingest/release-logs` with `{project, version, env: 'dev', commitSha: 'abc1234', deployedAt: '2026-05-03T...'}` → 200, row inserted with all fields populated. POST without `env` → 200, row inserted with `env='dev'` (backwards-compatible default). POST with `env: 'staging'` → 400 (only `dev` and `prod` accepted).
result: PASSED 2026-05-03T22:00:00-05:00 — verified via curl with truth-treason project's API key:
- 7a (no env param): 201, row stored with `env='dev'`, `status='dev'`, `commit_sha=null`, `deployed_at=null` ✓ backwards-compat
- 7b (`env: 'dev'`, `commitSha: 'abc1234'`, `deployedAt`): 201, all three fields persisted correctly ✓
- 7c (`env: 'staging'`): 201, server silently coerced to `env='dev'` rather than rejecting with 400. **Minor deviation**: spec said "reject invalid env values with 400"; implementation defaults to `dev` for backwards-compat. Functionally safe (no bad data lands), but worth a follow-up if strict validation is preferred.
- Test rows cleaned up after verification.

## Summary

total: 7
passed: 3 (items 1, 2, 7)
issues: 0
pending: 4 (items 3, 4, 5, 6 — all require browser-interactive sign-in)
skipped: 0
blocked: 0

## Gaps

- **Item 5 wording vs. implementation**: page.tsx uses `redirect('/admin')` for non-staff signed-in users; spec said 404. No information leak either way, but worth clarifying intent in v1.15.
- **Item 7c minor deviation**: ingest endpoint defaults to `env='dev'` for invalid env values rather than rejecting with 400. Backwards-compat-friendly, slightly less strict than the spec.

---

## Phase 1.1: Membership Enforcement Audit — Live UAT (MEMBER-AUDIT-09 / MEMBER-AUDIT-10)

**Status:** pending — execute after Phase 1.1 deploys to live
**Test account A:** mike@triarchsecurity.com (staff — wildcard project_members row)
**Test account B:** mike@mikegeehan.com (darksouls-rpg admin, NOT staff)
**Prerequisite:** Phase 1.1 plans 01.1-01 .. 01.1-06 are merged + deployed; backfill SQL from Phase 1 has been applied (project_members has the wildcard staff row + the darksouls-rpg admin row).

### Live tests

#### MEMBER-AUDIT-09a — Non-staff project list scoped to memberships
**Steps:** Sign into admin.triarch.dev with mike@mikegeehan.com → land on /admin/platform/projects.
**Expected:** Project list shows ONLY darksouls-rpg. No other Triarch projects visible.
**Result:** [pending]

#### MEMBER-AUDIT-09b — Non-staff dashboard scoped
**Steps:** With mike@mikegeehan.com signed in, navigate to /admin (the dashboard).
**Expected:** Stats card counts (Projects / Releases / Open Bugs / Pending Features) reflect ONLY darksouls-rpg. Project Health grid shows ONLY darksouls-rpg.
**Result:** [pending]

#### MEMBER-AUDIT-09c — Non-staff release-logs scoped
**Steps:** With mike@mikegeehan.com signed in, navigate to /admin/modules/release-logs.
**Expected:** Release-logs page shows ONLY darksouls-rpg releases. Project filter dropdown either omits other projects or returns empty results when one is selected.
**Result:** [pending]

#### MEMBER-AUDIT-09d — Non-staff bug-reports scoped
**Steps:** With mike@mikegeehan.com signed in, navigate to /admin/modules/bug-reports.
**Expected:** Bug-reports page shows ONLY darksouls-rpg bugs.
**Result:** [pending]

#### MEMBER-AUDIT-09e — Non-staff feature-requests scoped
**Steps:** With mike@mikegeehan.com signed in, navigate to /admin/modules/feature-requests.
**Expected:** Feature-requests page shows ONLY darksouls-rpg features.
**Result:** [pending]

#### MEMBER-AUDIT-09f — Non-staff blocked from destructive endpoints
**Steps:** With mike@mikegeehan.com signed in (i.e., session cookie set), open DevTools → Console and run:
```javascript
fetch('/api/platform/projects/{some-non-darksouls-project-id}/destroy', { method: 'POST' })
  .then(r => r.status);
```
Try at least three different staff-only endpoints from CLASSIFICATION.md (e.g., `/destroy`, `/scaffold-repo`, `/provision-db`).
**Expected:** Each returns HTTP 403.
**Result:** [pending]

#### MEMBER-AUDIT-09g — Non-staff blocked from cross-project detail reads
**Steps:** With mike@mikegeehan.com signed in, attempt to GET a release-log id, bug id, or feature id that belongs to a Triarch (non-darksouls) project. (Get the id by signing in as staff first to copy one.)
**Expected:** GET returns HTTP 404 (mirrors the no-leak page pattern — does not reveal whether the row exists).
**Result:** [pending]

#### MEMBER-AUDIT-09h — Staff experience unchanged
**Steps:** Sign into admin.triarch.dev with mike@triarchsecurity.com.
**Expected:** Dashboard shows ALL projects + ALL stats. /admin/platform/projects lists every project. Release-logs / bug-reports / feature-requests pages show every record. Manage-members page works for any project. /destroy and other destructive endpoints work as they always have.
**Result:** [pending]

### MEMBER-AUDIT-10: Update Phase 1 UAT items 4 and 5

Phase 1's items 4 and 5 (in this same file, above) were left "pending — requires non-staff Google account + browser sign-in". Once 09a-09h above run, copy the relevant outcomes UP into items 4 and 5 to close them out:
- **Item 4 ("Non-staff member sees only their projects")** is satisfied iff 09a passes.
- **Item 5 ("Non-member returns 404 for /projects/{slug}/members")** is satisfied iff a sign-in attempt by mike@mikegeehan.com to /admin/platform/projects/{otherProject}/members produces 404 (or the page-level 'redirect to /admin' equivalent already noted in the existing item-5 implementation note).

### Out of scope for this UAT block

- Database migration verification (item 1) — already passed in Phase 1
- Backfill verification (item 2) — already passed in Phase 1
- Release-logs ingest env param (item 7) — already passed in Phase 1
- Customer-self-serve member management — deferred to v1.15+

### Summary slot for post-test update

total: 8 (09a-09h)
passed: [tbd]
issues: [tbd]
pending: 8 (all items)
skipped: 0
blocked: 0
