---
phase: 15-operational-prework
plan: 03
subsystem: infra
tags: [gcp, secret-manager, iam, firebase-app-hosting, nextauth]

# Dependency graph
requires: []
provides:
  - "GCP secret PORTAL_NEXTAUTH_SECRET in triarch-vault with one ENABLED version (32-byte random base64)"
  - "secretAccessor IAM granted to firebase-app-hosting-compute@triarch-dev-website.iam.gserviceaccount.com"
  - "Distinct NextAuth signing key for portal — Pitfall 1 (cross-app JWT replay) defended at credential layer"
affects:
  - "18-portal-auth-scaffolding (Phase 18 wires PORTAL_NEXTAUTH_SECRET into apphosting.yaml NEXTAUTH_SECRET binding)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "FAH secret pattern: mirror NEXTAUTH_SECRET IAM bindings — secretAccessor to firebase-app-hosting-compute@triarch-dev-website.iam.gserviceaccount.com"
    - "Secret payload never written to disk: generated via `openssl rand -base64 32 | gcloud secrets versions add --data-file=-` (stdin pipe)"

key-files:
  created: []
  modified: []

key-decisions:
  - "Mirror admin NEXTAUTH_SECRET IAM pattern verbatim — only firebase-app-hosting-compute@triarch-dev-website.iam.gserviceaccount.com granted secretAccessor (least-privilege)"
  - "Distinct PORTAL_NEXTAUTH_SECRET separate from admin NEXTAUTH_SECRET — closes Pitfall 1 at credential layer; JWTs from portal cannot be validated by admin even with same OAuth client"
  - "Secret payload generated in-process via openssl stdin pipe — never written to disk or logged"
  - "Phase 18 will bind this secret name to NEXTAUTH_SECRET env var in portal apphosting.yaml — no apphosting.yaml changes in Phase 15"

patterns-established:
  - "New FAH-bound secrets in triarch-vault: grant secretAccessor to firebase-app-hosting-compute@triarch-dev-website.iam.gserviceaccount.com (mirrors admin pattern)"

requirements-completed: [OPS-05]

# Metrics
duration: 10min
completed: 2026-05-08
---

# Phase 15 Plan 03: PORTAL_NEXTAUTH_SECRET Summary

**GCP secret `PORTAL_NEXTAUTH_SECRET` created in `triarch-vault` with 32-byte random payload and FAH compute SA secretAccessor binding — distinct from admin's NEXTAUTH_SECRET to close Pitfall 1 (cross-app JWT replay)**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-05-08T00:00:00Z
- **Completed:** 2026-05-08T00:00:00Z
- **Tasks:** 3 (2 auto + 1 human-verify checkpoint, approved)
- **Files modified:** 0 (GCP-only — no repo files changed)

## Accomplishments

- Discovered admin's FAH secret IAM pattern: single `firebase-app-hosting-compute@triarch-dev-website.iam.gserviceaccount.com` SA granted `roles/secretmanager.secretAccessor`
- Created `PORTAL_NEXTAUTH_SECRET` in `triarch-vault` (project `125442121919`) with `--replication-policy=automatic` and labels `app=portal,owner=mike,phase=15`
- Added one ENABLED version via `openssl rand -base64 32 | gcloud secrets versions add --data-file=-` (payload never on disk)
- Granted `roles/secretmanager.secretAccessor` to `firebase-app-hosting-compute@triarch-dev-website.iam.gserviceaccount.com` — mirrors admin's binding exactly
- Human verified in GCP Console (Task 3 checkpoint approved)

## Task Commits

This plan had no file-system changes — all work was GCP API calls. No per-task source commits.

**Plan metadata:** (docs commit — this SUMMARY.md + STATE.md + ROADMAP.md)

## Files Created/Modified

None — plan produced GCP infrastructure only (Secret Manager secret + IAM binding). No repo files were created or modified.

## Decisions Made

- **Mirror admin pattern verbatim:** Admin's `NEXTAUTH_SECRET` uses only `firebase-app-hosting-compute@triarch-dev-website.iam.gserviceaccount.com` for secretAccessor. The plan reference mentioned a potential FAH service agent (`service-<projectNumber>@gcp-sa-firebaseapphosting.iam.gserviceaccount.com`) as well, but the actual admin policy had only the compute SA. Mirrored exactly — no extra members added.
- **Distinct secret enforced:** `PORTAL_NEXTAUTH_SECRET` is a separate GCP secret from admin's `NEXTAUTH_SECRET`. JWTs minted by portal cannot be validated by admin (different signing keys) even though both apps use the same Google OAuth client. This closes Pitfall 1 at the credential layer before any portal auth code is written.
- **Phase 18 deferred:** The `apphosting.yaml` secret binding (`NEXTAUTH_SECRET: $PORTAL_NEXTAUTH_SECRET`) is Phase 18 work, not Phase 15. This plan only creates the storage and IAM half.

## Deviations from Plan

None — plan executed exactly as written. The FAH service agent member mentioned in the plan reference was a best-effort default; admin's actual policy had only the compute SA, so only that member was granted (correct behavior per plan's "mirror admin pattern" instruction).

## Issues Encountered

None.

## GCP Resources Created

| Resource | Project | Details |
|----------|---------|---------|
| `PORTAL_NEXTAUTH_SECRET` (secret) | `triarch-vault` (`125442121919`) | `--replication-policy=automatic`, labels: `app=portal,owner=mike,phase=15` |
| Version 1 (secret version) | same | State: ENABLED; payload: 32-byte random base64 via `openssl rand -base64 32` |
| IAM binding | same | `roles/secretmanager.secretAccessor` → `serviceAccount:firebase-app-hosting-compute@triarch-dev-website.iam.gserviceaccount.com` |

## Next Phase Readiness

- OPS-05 satisfied: `PORTAL_NEXTAUTH_SECRET` exists in `triarch-vault` with correct IAM — Phase 18 can bind it in `apphosting.yaml`
- `portal-dev` and `portal-prod` FAH backends (Plan 15-04) will use the same `firebase-app-hosting-compute@triarch-dev-website.iam.gserviceaccount.com` SA — IAM is already in place
- No blockers for Phase 15 continuation

---
*Phase: 15-operational-prework*
*Completed: 2026-05-08*
