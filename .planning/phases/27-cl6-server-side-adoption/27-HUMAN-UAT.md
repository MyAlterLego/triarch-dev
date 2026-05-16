---
status: partial
phase: 27-cl6-server-side-adoption
source: [27-VERIFICATION.md]
started: 2026-05-16T12:30:00Z
updated: 2026-05-16T12:30:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Apply migration 0019 to CockroachDB (PRE-DEPLOY BLOCKER)
expected: `deploy_gate_check` table exists in CRDB with all columns from `src/db/schema.ts:77-95` and the composite index `deploy_gate_check_project_created_at_idx` on `(project_key, created_at DESC)`.
instructions:
  ```bash
  firebase apphosting:secrets:access DATABASE_URL --project triarch-dev-website
  DATABASE_URL='<url-from-secret>' npm run db:push
  ```
verify: `psql "$DATABASE_URL" -c "\d deploy_gate_check"` shows all 9 columns; `psql "$DATABASE_URL" -c "\di deploy_gate_check*"` shows the composite index.
result: [pending]

### 2. Live consumer workflow test (CL6-04 operational portion)
expected: With shared-workflows v8.2 wired (Phase 28 deliverable), a consumer workflow whose `needs: gate` is stripped will trigger a 409 from the ingest endpoint and a `verdict='reject_no_pair'` audit row in `deploy_gate_check`. Unit path is GREEN (Test 3 in route.test.ts). This UAT item is the live-fire verification.
instructions: Defer until Phase 28 ships shared-workflows v8.2 with the gate-verdict POST step. Then strip `needs: gate` from a test consumer workflow, run prod deploy, confirm 409 in admin logs and `reject_no_pair` row in `deploy_gate_check`.
result: [pending — Phase 28 dependency]

### 3. Compliance matrix CL-6 cell renders
expected: `/admin/modules/ci-cd` shows a CL-6 column per project with green/red badge based on `deploy_gate_check` recent rows.
instructions: Defer until Phase 35 ships the matrix UI extension.
result: [pending — Phase 35 dependency]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
