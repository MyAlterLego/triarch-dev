# Phase 31: CL-3 DB Namespace Audit + Migration - Context

**Gathered:** 2026-05-16
**Status:** Audit done autonomously; remediation requires CRDB + GCP Secret Manager access (human-only)

<domain>
## Phase Boundary

Audit every project's `apphosting.yaml` (prod) and `apphosting.dev.yaml` (dev) DATABASE_URL secret references. Confirm dev points to `<project>_dev` database and prod points to `<project>` database. Same CRDB cluster is OK; same database is forbidden. Create missing `_dev` databases; rebind dev secrets where they collide on prod.

</domain>

<decisions>
## Implementation Decisions

### Autonomous Audit Results (2026-05-16)

apphosting yaml-level audit across 7 projects:

| Project | apphosting.dev.yaml DATABASE_URL secret | apphosting.yaml DATABASE_URL secret | Yaml-level status |
|---------|------------------------------------------|--------------------------------------|--------------------|
| platform | `DATABASE_URL_DEV` | `DATABASE_URL` | Separate names ✓ (value verification pending) |
| dev-portal | **`DATABASE_URL_PORTAL`** | **`DATABASE_URL_PORTAL`** | **VIOLATION — same secret used for both envs** (comment in file: "mint DATABASE_URL_PORTAL_DEV and re-bind here") |
| darksouls | `DATABASE_URL_DEV` | `DATABASE_URL` | Separate names ✓ (value pending) |
| tmi | `DATABASE_URL_DEV` | `DATABASE_URL` | Separate names ✓ (value pending) |
| truthtreason | `DATABASE_URL_DEV` | `DATABASE_URL` | Separate names ✓ (value pending) |
| security-admin | (no apphosting.dev.yaml — created by Phase 33) | `DATABASE_URL` | Blocked by Phase 33 |
| security-portal | `DATABASE_URL_DEV` | `DATABASE_URL` | Separate names ✓ (value pending) |

**Confirmed structural violation:** dev-portal — same secret name for dev and prod means dev writes go to prod database. Fix required: mint new GCP secret `DATABASE_URL_PORTAL_DEV` pointing to a `triarchsecurity_portal_dev` (or similar) CRDB database, then update apphosting.dev.yaml to reference it.

**Pending value verification:** For projects with separate secret names, the secret VALUES may still point to the same database (a misconfiguration where the secret name is correctly named but the connection string is wrong). Cannot verify without GCP Secret Manager access. HUMAN-UAT includes the verification command per project.

### What this phase does NOT do autonomously
- Does NOT create CRDB databases (requires admin CRDB credentials + would alter live infra)
- Does NOT create or modify GCP secrets (requires `firebase apphosting:secrets:set` + admin access; live infra change)
- Does NOT modify any apphosting.dev.yaml (the dev-portal fix is part of the HUMAN-UAT after the secret is created — yaml change is trivial but only meaningful AFTER the secret exists)

### What this phase DOES (for the human)
- Documents the 1 confirmed violation (dev-portal) with exact remediation steps
- Provides per-project verification commands to confirm whether the other 5 separate-name secrets actually point to distinct databases
- Provides CRDB queries to list `_dev` databases per project and verify schema parity

</decisions>

<deferred>
## Deferred Ideas

- Automated periodic CRDB namespace audit (cron job that fails if any dev secret resolves to a prod-database URL) — out of scope; Phase 35 compliance matrix UI can include this check
- Schema diff alerting (dev schema drift from prod) — outside CL-3 scope; could be a future cleanup
- Migration tooling to create `_dev` from prod snapshot — could leverage the existing `scripts/backfill-prod-from-dev.ts` pattern (PR #78) in reverse; defer

</deferred>
