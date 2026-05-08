---
plan: 22-01
phase: 22-release-page-port-write
status: complete
started: 2026-05-08
updated: 2026-05-08
tasks: 2/2
commits:
  - 9e247e1: feat(22-01) — shared internal-hmac module + 7 tests GREEN
  - f040877: v2.10.0 — internal HMAC dispatch endpoint + apphosting bindings + admin v2.10.0
requirements_addressed: [WRITE-04]
---

# Plan 22-01 Summary

## Status: COMPLETE

(Recovery: agent hit API 529 mid-execution after main commits landed; orchestrator verified 352/352 tests GREEN + next build clean before resuming wrap-up.)

## What Shipped

### Shared Package — `@myalterlego/triarch-shared/internal-hmac`
- `signRequest({ body, secret, timestamp?, nonce? })` — canonical-key serialization (`JSON.stringify(body, Object.keys(body).sort())`), HMAC-SHA256 hex digest
- `verifyRequest({ rawBody, signature, secret, options })` — validates signature + 5-min timestamp skew window + 10-min nonce TTL via in-memory `NonceStore`
- 7 Vitest cases: valid, tampered, expired (6 min old), replay (nonce reuse), malformed JSON, missing nonce, no_secret
- Module added to `packages/triarch-shared/src/internal-hmac.ts` + `internal-hmac.test.ts`
- Shared package version (in package.json) bumped to 0.3.0 — TAG NOT YET PUSHED (Phase 22 wrap-up step pending)

### Admin — `/api/internal/dispatch`
- New route at `src/app/api/internal/dispatch/route.ts`
- POST handler reads `X-HMAC-Signature` + raw body
- Calls `verifyRequest` from shared package — rejects 401 on tampered/expired/replay, 500 on missing secret
- Validates project + release ownership before dispatch (defense-in-depth: HMAC alone could be forged)
- Calls `promoteAndAudit` from existing release-promotion lib
- 7 Vitest integration cases: valid signature path → 200, tampered → 401 (promoteAndAudit NOT called), expired → 401, replay → first 200 second 401, missing secret → 500, unknown project → 404, release-not-belongs-to-project → 404

### GCP Secret + IAM
- `INTERNAL_HMAC_SECRET` GCP secret in `triarch-vault` (random 32-byte)
- secretAccessor IAM bound to `firebase-app-hosting-compute@triarch-dev-website` (covers both admin + portal runtime SAs)

### apphosting.yaml Binding
- Admin `apphosting.yaml` adds:
  ```yaml
  - variable: INTERNAL_HMAC_SECRET
    secret: INTERNAL_HMAC_SECRET
  ```

### Admin Version Bump
- `package.json`: 2.9.3 → 2.10.0 (minor — new internal endpoint adds attack surface)

## Test Results

- 7 library tests (internal-hmac.test.ts) — GREEN
- 7 integration tests (dispatch/route.test.ts) — GREEN
- Full admin suite: 352/352 GREEN (338 prior + 14 new)
- `next build` clean

## Pending Wrap-Up (orchestrator handles)

- Push `feat/22-01-internal-hmac-dispatch` branch to origin
- Open PR + squash-merge to admin/main
- Tag `shared/v0.3.0` + push (publish workflow runs)
- Smoke install of @myalterlego/triarch-shared@0.3.0
- STATE.md + ROADMAP.md + REQUIREMENTS.md (WRITE-04 partial — admin endpoint shipped; portal-side wiring lands in 22-02)

## Files

- `packages/triarch-shared/src/internal-hmac.ts`
- `packages/triarch-shared/src/internal-hmac.test.ts`
- `packages/triarch-shared/package.json` (version 0.3.0)
- `src/app/api/internal/dispatch/route.ts`
- `src/app/api/internal/dispatch/route.test.ts`
- `apphosting.yaml` (INTERNAL_HMAC_SECRET binding)
- `package.json` + `src/lib/version.ts` (admin v2.10.0)

## Recovery Note

Agent execution interrupted by API 529 (server overload) at ~75 tool uses. Substantive work landed cleanly via two atomic commits before the error. Orchestrator verified test + build pass independently and is finishing the SUMMARY + push + PR + tag steps.
