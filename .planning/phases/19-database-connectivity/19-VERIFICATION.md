---
phase: 19-database-connectivity
verified: 2026-05-08T14:05:00Z
status: passed
score: 17/17 must-haves verified
re_verification: false
---

# Phase 19: Database Connectivity Verification Report

**Phase Goal:** Portal connects to the same CockroachDB cluster via `pg.Pool` using a DML-only role; admin remains sole migration authority and rogue schema writes from portal are blocked at the database.
**Verified:** 2026-05-08T14:05:00Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | CRDB role `portal_runtime` exists in cluster with DML-only grants | VERIFIED | `19-01-CRDB-VERIFY.md`: SHOW GRANTS confirms SELECT/INSERT/UPDATE/DELETE on `projects`; no CREATE/ALTER/DROP visible |
| 2 | `portal_runtime` can SELECT from existing tables (DML works) | VERIFIED | `19-01-CRDB-VERIFY.md`: `SELECT count(*) FROM projects` returns 7 rows as portal_runtime |
| 3 | Connecting as `portal_runtime` and running ALTER TABLE returns CRDB permission denied (DB-04 live) | VERIFIED | `19-01-CRDB-VERIFY.md` verbatim: `ERROR: must be owner of table projects or have CREATE privilege on table projects` SQLSTATE: 42501 |
| 4 | Future tables created by admin auto-grant DML to `portal_runtime` | VERIFIED | `scripts/provision-portal-runtime.sql` lines 42-47: two `ALTER DEFAULT PRIVILEGES` statements for TABLES and SEQUENCES |
| 5 | GCP secret `DATABASE_URL_PORTAL` exists in `triarch-vault` with version 1 ENABLED | VERIFIED | `gcloud secrets describe` returns `projects/125442121919/secrets/DATABASE_URL_PORTAL`; version 1 state: enabled (confirmed live) |
| 6 | FAH compute SA has `roles/secretmanager.secretAccessor` on `DATABASE_URL_PORTAL` | VERIFIED | Live IAM policy: `firebase-app-hosting-compute@triarch-dev-website.iam.gserviceaccount.com` → secretAccessor; covers both portal-prod + portal-dev (same SA per Phase 15-03 pattern) |
| 7 | Portal `src/lib/db.ts` re-exports `db` from shared package (no duplicate Pool) | VERIFIED | File confirmed: 1-line `export { db } from '@myalterlego/triarch-shared/db'`; no Pool constructor in portal |
| 8 | Portal `apphosting.yaml` binds `DATABASE_URL` from `DATABASE_URL_PORTAL` | VERIFIED | File confirmed: `secret: DATABASE_URL_PORTAL` with provenance comment |
| 9 | Portal `apphosting.dev.yaml` binds `DATABASE_URL` from `DATABASE_URL_PORTAL` | VERIFIED | File confirmed: `secret: DATABASE_URL_PORTAL` with CONTEXT decision comment |
| 10 | Portal `package.json` has NO `db:push` and NO `db:generate` scripts | VERIFIED | `grep -E "db:push\|db:generate" package.json` returns no matches; scripts block contains only dev/build/start/lint/test/test:watch |
| 11 | Portal version bumped to 0.2.1 | VERIFIED | `package.json` `"version": "0.2.1"` confirmed |
| 12 | Portal vitest suite passes with 4 db.test.ts tests covering DB-01/DB-04 | VERIFIED | `npx vitest run src/lib/db.test.ts` exits 0: 4/4 tests pass (re-export integrity, instance identity, Pool ctor receives DATABASE_URL, CRDB permission-denied propagation) |
| 13 | Portal v0.2.1 squash-merged to main | VERIFIED | `git log`: `7575bb6 v0.2.1: db connectivity (Phase 19 DB-01/03 portal-side + DB-02/04 mirror) (#6)` on main |
| 14 | Rotation procedure documented | VERIFIED | `19-01-CRDB-VERIFY.md` contains 6-step rotation runbook (lines 143-177) |
| 15 | `scripts/provision-portal-runtime.sql` is idempotent and DML-only | VERIFIED | 70-line file: `CREATE USER IF NOT EXISTS`, `GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES`, no `GRANT CREATE/ALTER/DROP/TRUNCATE/REFERENCES/ALL` |
| 16 | DB-04 CRDB permission-denied error propagates unswallowed through Drizzle in portal | VERIFIED | `db.test.ts` Test 4 checks `error.message` OR `error.cause.message` matches `/permission\|CREATE privilege/i`; 4/4 green |
| 17 | `19-01-CRDB-VERIFY.md` committed with verbatim ALTER rejection error | VERIFIED | File exists at 177 lines; contains `SQLSTATE: 42501` and verbatim error text; committed at `352ddcb` |

**Score:** 17/17 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `scripts/provision-portal-runtime.sql` | Idempotent CRDB role + DML grants + default privileges | VERIFIED | 70 lines; contains `CREATE USER IF NOT EXISTS portal_runtime`, `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public`, 2x `ALTER DEFAULT PRIVILEGES`; no DDL grants |
| `.planning/phases/19-database-connectivity/19-01-CRDB-VERIFY.md` | Verification log with verbatim ALTER rejection, GCP secret + IAM evidence, rotation runbook | VERIFIED | 177 lines; contains `SQLSTATE: 42501`, `DATABASE_URL_PORTAL`, `secretaccessor`, rotation procedure |
| `portal/src/lib/db.ts` | 1-line re-export of `db` from shared package | VERIFIED | Exists; single export line; 17 lines total (comment header + export) |
| `portal/src/lib/db.test.ts` | 4-test vitest suite; contains "permission denied" pattern | VERIFIED | 75 lines; 4 tests; contains `CREATE privilege` / `42501` mock error |
| `portal/apphosting.yaml` | Contains `DATABASE_URL_PORTAL` secret binding | VERIFIED | `secret: DATABASE_URL_PORTAL` present with provenance comment |
| `portal/package.json` | Version 0.2.1, no db:push/db:generate | VERIFIED | `"version": "0.2.1"`; scripts block clean |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `scripts/provision-portal-runtime.sql` | CRDB cluster triarchdev-24092 / triarch_dev | `cockroach sql --url $ADMIN_CRDB_URL -f` | VERIFIED (live) | Apply transcript in `19-01-CRDB-VERIFY.md`: CREATE ROLE + 4x GRANT + 2x ALTER DEFAULT PRIVILEGES confirmed executed |
| `scripts/provision-portal-runtime.sql` | Future drizzle-kit push outputs | `ALTER DEFAULT PRIVILEGES IN SCHEMA public` | VERIFIED | Pattern present at lines 42-47 of SQL file; 4 occurrences of `ALTER DEFAULT PRIVILEGES` in file |
| `portal/apphosting.yaml` | GCP secret `DATABASE_URL_PORTAL` | FAH secret binding `secret: DATABASE_URL_PORTAL` | VERIFIED | Pattern confirmed in file; secret exists in triarch-vault with version 1 ENABLED |
| `portal/src/lib/db.ts` | `@myalterlego/triarch-shared/db` | ESM re-export `from '@myalterlego/triarch-shared/db'` | VERIFIED | Single export line confirmed in file |
| `portal/src/lib/db.test.ts` | `portal/src/lib/db.ts` | `vi.mock('pg') + import { db }` | VERIFIED | `vi.mock('pg')` present; `import('./db')` used in 3 of 4 tests; 4/4 green |
| `GCP secret DATABASE_URL_PORTAL` | Portal FAH compute SA | `roles/secretmanager.secretAccessor` | VERIFIED | Live IAM policy confirmed: `firebase-app-hosting-compute@triarch-dev-website.iam.gserviceaccount.com` has secretAccessor; same SA serves both portal-prod and portal-dev per Phase 15-03 pattern |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| DB-01 | 19-02 | Portal `src/lib/db.ts` connects to CockroachDB via `pg.Pool`; reuses `DATABASE_URL` secret | SATISFIED | `portal/src/lib/db.ts` re-exports from shared package (which constructs Pool); `apphosting.yaml` binds `DATABASE_URL` from `DATABASE_URL_PORTAL`; v0.2.1 on main |
| DB-02 | 19-01 | CRDB user `portal_runtime` with DML-only grants; portal connects with this role; admin retains admin role | SATISFIED | SHOW GRANTS in `19-01-CRDB-VERIFY.md`: SELECT/INSERT/UPDATE/DELETE on `projects` for portal_runtime; no CREATE/ALTER/DROP; ALTER DEFAULT PRIVILEGES for future tables |
| DB-03 | 19-02 | Portal `package.json` does NOT include `db:push` or `db:generate` scripts | SATISFIED | Live grep confirms zero matches; scripts block: dev/build/start/lint/test/test:watch only |
| DB-04 | 19-01 + 19-02 | Smoke test: `ALTER TABLE projects ADD COLUMN test text` returns CRDB permission denied | SATISFIED | Live CRDB evidence in `19-01-CRDB-VERIFY.md` (SQLSTATE 42501); portal-side propagation test in `db.test.ts` passes |

All 4 requirements marked `[x]` in REQUIREMENTS.md and mapped Phase 19 Complete in the requirements table.

---

### Anti-Patterns Found

None detected. Files scanned: `scripts/provision-portal-runtime.sql`, `portal/src/lib/db.ts`, `portal/src/lib/db.test.ts`, `portal/apphosting.yaml`, `portal/apphosting.dev.yaml`, `portal/package.json`.

- No TODO/FIXME/placeholder comments in production files
- `portal/src/lib/db.ts` is a substantive 1-line re-export, not a stub
- No hardcoded empty data flowing to user-visible output
- `return null` / `return {}` patterns absent from the phase-modified files
- `portal/src/lib/db.test.ts` Test 4 uses a real try/catch assertion, not a stub `console.log`

---

### Human Verification Deferred (Non-blocking)

One item was explicitly deferred in 19-02-SUMMARY.md and is not a gap for phase goal achievement:

**Post-deploy live signin verification**
- **Test:** Hit `https://portal.triarch.dev/login`, sign in with a customer Gmail, tail portal-prod logs for CRDB errors
- **Expected:** Page renders, signin completes (SELECT on `project_members` via portal_runtime succeeds), zero CRDB auth errors in last 10 min
- **Why deferred:** Awaiting OPS-04 (Actions secrets) + portal-prod deploy confirmation. The plan documents this as a post-deploy check, not a gate on phase closure. The code, secret, IAM, and CRDB role are all verified in place.

This deferred item does not block phase goal achievement. The live ALTER rejection (DB-04), the secret existence and IAM bindings, the portal code artifacts, and the vitest suite together provide sufficient evidence that the goal is met.

---

### Notable: Single SA covers both portal-prod and portal-dev

The plan spec said "grant secretAccessor to portal-prod AND portal-dev FAH compute SAs." In practice, both backends share `firebase-app-hosting-compute@triarch-dev-website.iam.gserviceaccount.com` (established in Phase 15-03). The single IAM binding therefore satisfies the requirement for both environments. This is consistent with how `PORTAL_NEXTAUTH_SECRET` is bound.

---

## Summary

Phase 19 goal is achieved. The portal connects to the same CockroachDB cluster via `pg.Pool` using the `portal_runtime` DML-only role. Admin remains sole migration authority: live ALTER rejection captured with SQLSTATE 42501, `scripts/provision-portal-runtime.sql` has no DDL grants, portal `package.json` has no `db:push`, and the CRDB permission-denied error propagates unswallowed through Drizzle to portal callers. All four requirements (DB-01..DB-04) are satisfied with verifiable evidence in the codebase and live infrastructure.

---

_Verified: 2026-05-08T14:05:00Z_
_Verifier: Claude (gsd-verifier)_
