---
status: partial
phase: 01-schema-membership-migration
source: [01-VERIFICATION.md]
started: 2026-05-03T18:00:00-05:00
updated: 2026-05-03T18:00:00-05:00
---

## Current Test

[awaiting human testing — gated on running `db:push` + `psql -f v1.14.0-backfill.sql` against the staging DB]

## Tests

### 1. Apply schema migration to staging DB
expected: New columns appear on `release_logs`; new tables `project_members`, `release_feedback`, `release_approvals` appear in the database.
result: PASSED 2026-05-03T18:23:00Z — Applied via `pg`-driver script against live triarch_dev DB. All 10 statements (3 CREATE TABLE, 4 ALTER TABLE ADD COLUMN, 2 ALTER TABLE ADD CONSTRAINT, 1 CREATE UNIQUE INDEX) succeeded.

### 2. Apply backfill SQL
expected: All three backfill statements run without error. `SELECT count(*) FROM release_logs WHERE env IS NULL;` → 0. `SELECT count(*) FROM project_members WHERE project_key = '*' AND role = 'staff';` → 1. `SELECT count(*) FROM project_members WHERE role = 'admin' AND email = 'mike@triarchsecurity.com';` → equal to count of existing projects.
result: PASSED 2026-05-03T18:25:00Z — UPDATE: 239 release_logs rows (env=dev, status=dev, deployed_at=created_at). INSERT: 7 admin rows (matches projects.count=7). INSERT: 1 wildcard staff row. Verification queries all match expected counts.

### 3. End-to-end sign-in via DB-backed staff role
expected: After migration applied, signing into `admin.triarch.dev` with `mike@triarchsecurity.com` succeeds. Server logs show the DB-backed `getCurrentUserContext()` returned `isStaff=true` (not the env-allowlist fallback).
result: [pending]

### 4. Non-staff member sees only their projects
expected: After adding a non-`@triarchsecurity.com` email as a member to `truth+treason` project (via SQL or the new manage-members page), that user signs in and the project list shows only `truth+treason`, not other projects.
result: [pending]

### 5. Non-member returns 404 for /projects/{slug}/members
expected: A user who is not a member of a project hits `/admin/platform/projects/{otherKey}/members` and receives a 404 (not 403, not "permission denied"). Project existence not leaked.
result: [pending]

### 6. Manage-members page add/remove flow
expected: As staff, navigate to `/admin/platform/projects/truth+treason/members`. Add a new member via the form (email + viewer role). Row appears in the table with the role badge. Click trash icon on a non-staff row → row disappears. Adding a duplicate email returns the inline 409 error.
result: [pending]

### 7. Release-logs ingest accepts env param
expected: POST to `/api/platform/ingest/release-logs` with `{project, version, env: 'dev', commitSha: 'abc1234', deployedAt: '2026-05-03T...'}` → 200, row inserted with all fields populated. POST without `env` → 200, row inserted with `env='dev'` (backwards-compatible default). POST with `env: 'staging'` → 400 (only `dev` and `prod` accepted).
result: [pending]

## Summary

total: 7
passed: 0
issues: 0
pending: 7
skipped: 0
blocked: 0

## Gaps

(none until human testing surfaces them)
