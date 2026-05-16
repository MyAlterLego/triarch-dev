---
phase: 27-cl6-server-side-adoption
plan: 02
subsystem: api
tags: [gate-verdict, cicd, cl6, bearer-auth, sha256, drizzle, vitest, tdd]
dependency_graph:
  requires:
    - deployGateCheck Drizzle table (from Plan 27-01 — src/db/schema.ts)
    - requireApiKey (from @/lib/api-key-auth — unchanged)
    - db (from @/lib/db — unchanged)
  provides:
    - POST /api/platform/cicd/gate-verdict (new endpoint)
    - deployGateCheck rows with api_key_hash (SHA-256 of Bearer token)
    - route.test.ts with 7 GREEN Vitest scenarios covering CL6-01
  affects:
    - src/app/api/platform/cicd/gate-verdict/route.ts (created)
    - src/app/api/platform/cicd/gate-verdict/route.test.ts (created)
tech_stack:
  added: []
  patterns:
    - Bearer token extracted from Authorization header BEFORE requireApiKey call (Pitfall 2 guard)
    - SHA-256 hash via node:crypto createHash — no new dependency
    - Static-path route under /api/platform/cicd/ (no [key] dynamic segment — FAH safety)
    - TDD: RED commit first (route.test.ts), GREEN commit second (route.ts)
    - vi.mock('@/db/schema', async () => actual symbols) — table-ref assertion pattern
key_files:
  created:
    - src/app/api/platform/cicd/gate-verdict/route.ts (80 lines)
    - src/app/api/platform/cicd/gate-verdict/route.test.ts (169 lines)
  modified: []
decisions:
  - "Bearer token extracted from Authorization header before requireApiKey call — avoids depending on project.apiKey internal detail (RESEARCH Pitfall 2)"
  - "target_version and dev_version trimmed on write (.trim()) — ensures Plan 03 read comparison matches byte-for-byte without whitespace drift"
  - "verdict validated as exactly 'pass' or 'fail' — 'reject_no_pair' is server-synthesized in Plan 03, never accepted from caller (CONTEXT.md Pitfall 6)"
  - "Static path /api/platform/cicd/gate-verdict (no [key] segment) — follows version-snapshot precedent, avoids FAH route-conflict crash history"
requirements: ["CL6-01"]
metrics:
  duration: "~4 minutes"
  completed_date: "2026-05-16"
  tasks: 2
  files_modified: 0
  files_created: 2
---

# Phase 27 Plan 02: Gate Verdict Endpoint Summary

**One-liner:** `POST /api/platform/cicd/gate-verdict` with Bearer-auth, SHA-256 token hashing, payload validation, and Drizzle insert into `deploy_gate_check` — the write surface that Plan 03's prod ingest pre-check will read.

---

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Write route.test.ts with 7 scenarios (RED) | `ca7c40e` | `src/app/api/platform/cicd/gate-verdict/route.test.ts` (created, 169 lines) |
| 2 | Implement route.ts to make all 7 tests pass (GREEN) | `ae2d523` | `src/app/api/platform/cicd/gate-verdict/route.ts` (created, 80 lines) |

---

## New API Surface

### `POST /api/platform/cicd/gate-verdict`

**Auth:** Bearer token in `Authorization` header (same `requireApiKey` pattern as `version-snapshot`).
- 401 — missing Authorization header
- 403 — invalid Bearer token (project not found)

**Request body:**
```json
{
  "target_version": "v2.13.14",
  "verdict": "pass",
  "dev_version": "v2.13.14",
  "reason": "optional string",
  "workflow_run_url": "optional string"
}
```

**Validation:**
- `target_version` — required non-empty string (400 with `target_version` in error body)
- `dev_version` — required non-empty string (400 with `dev_version` in error body)
- `verdict` — must be exactly `'pass'` or `'fail'` (400 with `verdict` in error body)
- `reason`, `workflow_run_url` — optional; stored as `null` when absent

**Response (201):** The inserted `deploy_gate_check` row as JSON.

**Implementation notes:**
- `api_key_hash` stored as SHA-256 hex of the raw Bearer token — never plaintext
- `target_version` and `dev_version` trimmed before storage for Plan 03 consistency
- `reject_no_pair` verdict is server-synthesized in Plan 03 — never accepted from caller

---

## Test Outcomes — 7/7 GREEN

| # | Scenario | Status |
|---|----------|--------|
| 1 | 401 — no Authorization header | GREEN |
| 2 | 403 — invalid Bearer token (requireApiKey returns 403) | GREEN |
| 3 | 400 — missing target_version | GREEN |
| 4 | 400 — missing dev_version | GREEN |
| 5 | 400 — verdict='maybe' (not in ['pass','fail']) | GREEN |
| 6 | 201 — valid pass payload, insertMock called with SHA-256 hash | GREEN |
| 7 | 201 — valid fail payload, reason field persisted | GREEN |

---

## Verification Results

| Check | Result |
|-------|--------|
| `npx vitest run gate-verdict/route.test.ts` | 7/7 PASSED |
| `npx tsc --noEmit` | PASS — zero errors |
| `npx next build` | PASS — "Compiled successfully" |
| Full `npx vitest run` | 332 passed, 40 failed (all ECONNREFUSED localhost:5432 pre-existing) |
| Net new passing tests vs Plan 01 baseline (325) | +7 (our 7 new scenarios) |
| Static path — no `[key]` segment in `cicd/` | CONFIRMED |
| `grep -c "createHash('sha256')"` in route.ts | 1 |
| `grep -c "from 'node:crypto'"` in route.ts | 1 |
| Bearer extraction BEFORE requireApiKey call | CONFIRMED |

---

## Note for Plan 03 Executor

The `deployGateCheck` Drizzle table is now both **readable** (from `@/db/schema` since Plan 01) and **writable** (via this Plan 02 endpoint). Plan 03 modifies `ingest/release-logs/route.ts` to:
1. Read the most-recent `deploy_gate_check` row for `(project_key)` written in the prior 15 minutes
2. Assert `verdict='pass'` AND `target_version` matches AND `api_key_hash` matches the current request's SHA-256 Bearer hash
3. Return 409 `CL6-VIOLATION` on mismatch, write `reject_no_pair` audit row

Plan 03's tests can mock-read rows in the exact shape this endpoint writes. The `apiKeyHash` field is the SHA-256 hex of the Bearer token from `req.headers.get('authorization')?.slice(7)`.

---

## Deviations from Plan

None — plan executed exactly as written. Both route.ts and route.test.ts match the code from the PLAN.md exactly.

---

## Known Stubs

None. The endpoint is fully wired — no stubbed responses or placeholder data.

---

## Self-Check: PASSED

| Item | Status |
|------|--------|
| `src/app/api/platform/cicd/gate-verdict/route.ts` exists | FOUND |
| `src/app/api/platform/cicd/gate-verdict/route.test.ts` exists | FOUND |
| Commit `ca7c40e` (Task 1 RED tests) | FOUND |
| Commit `ae2d523` (Task 2 GREEN implementation) | FOUND |
| 7/7 tests pass | CONFIRMED |
| tsc clean | CONFIRMED |
| next build clean | CONFIRMED |
