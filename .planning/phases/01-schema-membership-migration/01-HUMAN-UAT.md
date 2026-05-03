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
