---
phase: 27-cl6-server-side-adoption
plan: 03
subsystem: api
tags: [cl6, enforcement, ingest, release-logs, vitest, tdd, apphosting, version-bump]
dependency_graph:
  requires:
    - deployGateCheck Drizzle table (from Plan 27-01)
    - POST /api/platform/cicd/gate-verdict (from Plan 27-02 — writes rows Plan 03 reads)
    - requireApiKey (from @/lib/api-key-auth — unchanged)
    - db (from @/lib/db — unchanged)
  provides:
    - CL-6 pre-check in POST /api/platform/ingest/release-logs (additive modification)
    - reject_no_pair audit row written on prod ingest rejection
    - 409 CL6-VIOLATION response shape (enforcement mode)
    - CL6_ENFORCEMENT_MODE=warn in apphosting.yaml and apphosting.dev.yaml
    - route.test.ts with 9 GREEN Vitest scenarios covering CL6-02, CL6-03, CL6-04
  affects:
    - src/app/api/platform/ingest/release-logs/route.ts (modified, additive only)
    - src/app/api/platform/ingest/release-logs/route.test.ts (created, 237 lines)
    - apphosting.yaml (CL6_ENFORCEMENT_MODE binding added)
    - apphosting.dev.yaml (CL6_ENFORCEMENT_MODE binding added)
    - package.json (version bumped to 2.13.14)
tech_stack:
  added: []
  patterns:
    - CL6 pre-check inserted between env determination and db.insert(releaseLogs) — purely additive
    - SHA-256 Bearer hashing via node:crypto createHash — byte-identical to Plan 02's gate-verdict route
    - 15-min lookback via Drizzle gte(deployGateCheck.createdAt, cutoff) + orderBy(desc).limit(1)
    - enforcementMode read at call time (process.env.CL6_ENFORCEMENT_MODE ?? 'warn') — testable via env mutation
    - reject_no_pair audit write wrapped in try/catch (stampLinksFromCommit pattern)
    - warn mode falls through to releaseLogs insert; enforce mode returns early with 409
key_files:
  created:
    - src/app/api/platform/ingest/release-logs/route.test.ts (237 lines, 9 scenarios)
  modified:
    - src/app/api/platform/ingest/release-logs/route.ts (+91 lines, additive pre-check block)
    - apphosting.yaml (CL6_ENFORCEMENT_MODE: warn RUNTIME entry added)
    - apphosting.dev.yaml (CL6_ENFORCEMENT_MODE: warn RUNTIME entry added)
    - package.json (2.13.13 -> 2.13.14)
decisions:
  - "CL6_ENFORCEMENT_MODE read at call time inside POST handler — mirrors PORTAL_BASE_URL pattern; allows test override via process.env mutation and per-request runtime config"
  - "reject_no_pair audit row write wrapped in try/catch — ensures audit failure never blocks warn-mode fall-through (stampLinksFromCommit precedent)"
  - "enforce mode returns early with 409 before releaseLogs insert — ensures no release row on rejection"
  - "warn mode writes audit row AND falls through — same audit trail as enforce mode but non-blocking (Phase 27 ships as warn; flip to enforce is manual post-Phase 28)"
  - "CL6_ENFORCEMENT_MODE=warn as plain value (not secret) in apphosting yamls — matches SLACK_RELEASE_APPROVAL_CHANNEL/PORTAL_BASE_URL pattern"
requirements: ["CL6-02", "CL6-03", "CL6-04"]
metrics:
  duration: "~4 minutes"
  completed_date: "2026-05-16"
  tasks: 4
  files_modified: 4
  files_created: 1
---

# Phase 27 Plan 03: CL-6 Server-Side Enforcement (Ingest Pre-Check) Summary

**One-liner:** Additive CL-6 pre-check in `POST /api/platform/ingest/release-logs` with SHA-256 bearer matching, 15-min Drizzle lookback, reject_no_pair audit writes, and `CL6_ENFORCEMENT_MODE=warn` shipped safely behind a plain-value env binding.

---

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Write route.test.ts with 9 scenarios (RED) | `d6e270b` | `src/app/api/platform/ingest/release-logs/route.test.ts` (created, 237 lines) |
| 2 | Modify route.ts to insert CL-6 pre-check (GREEN) | `8458871` | `src/app/api/platform/ingest/release-logs/route.ts` (+91 lines, additive) |
| 3 | Bind CL6_ENFORCEMENT_MODE in apphosting yamls; bump to 2.13.14 | `5a21e68` | `apphosting.yaml`, `apphosting.dev.yaml`, `package.json` |
| 4 | Final build + full test suite verification (phase exit gate) | — | (verification only, no file changes) |

---

## Modified API Surface

### `POST /api/platform/ingest/release-logs` — CL-6 Pre-Check

**Inserted between:** env determination (line 33) and `db.insert(releaseLogs)` (was line 48).

**Logic flow:**

```
enforcementMode = process.env.CL6_ENFORCEMENT_MODE ?? 'warn'

if env == 'dev'        → bypass entirely (no DB read)
if enforcementMode == 'off' → bypass entirely (no DB read)

else (env=prod, mode in {warn, enforce}):
  1. Extract Bearer token hash (SHA-256, same as gate-verdict route)
  2. Query deploy_gate_check: project_key + created_at >= cutoff (15 min) ORDER BY created_at DESC LIMIT 1
  3. Assert: verdict='pass' AND targetVersion (trimmed) == ingest version (trimmed) AND apiKeyHash == currentHash
  
  If NOT matched:
    → write reject_no_pair audit row (try/catch, non-blocking)
    if enforce: return 409 CL6-VIOLATION, do NOT insert releaseLogs
    if warn:    console.error warning, FALL THROUGH to releaseLogs insert
  
  If matched:
    → FALL THROUGH to releaseLogs insert (standard 201 path)
```

**409 body shape (locked):**
```json
{
  "error": "gate_required",
  "code": "CL6-VIOLATION",
  "reason": "<concrete reason string>",
  "expected": {
    "project_key": "<project.key>",
    "target_version": "<normalized version>",
    "max_age_seconds": 900
  },
  "remediation_url": "/admin/modules/ci-cd"
}
```

---

## Test Outcomes — 9/9 GREEN

| # | Scenario | Mode | Env | Status |
|---|----------|------|-----|--------|
| 1 | env=dev bypasses gate entirely (no select call) | enforce | dev | GREEN |
| 2 | mode=off bypasses gate entirely (no select call) | off | prod | GREEN |
| 3 | no verdict row in 15 min → 409 + audit + no release | enforce | prod | GREEN |
| 4 | target_version mismatch → 409, no release insert | enforce | prod | GREEN |
| 5 | api_key_hash mismatch → 409, no release insert | enforce | prod | GREEN |
| 6 | verdict='fail' (not pass) → 409, no release insert | enforce | prod | GREEN |
| 7 | all match → 201, release inserted, no audit row | enforce | prod | GREEN |
| 8 | no verdict row + warn mode → 201 (non-blocking), audit + release both written | warn | prod | GREEN |
| 9 | 409 body shape structurally locked (error, code, expected.max_age_seconds=900, remediation_url) | enforce | prod | GREEN |

**Plan 02 gate-verdict tests:** 7/7 still GREEN (no regression).

**Combined 16 new tests (7 + 9):** all GREEN.

**Full suite:** 341 passed, 40 pre-existing ECONNREFUSED localhost:5432 failures (identical count to Plans 01 and 02 baselines — no regressions introduced).

---

## Verification Results

| Check | Result |
|-------|--------|
| `npx vitest run release-logs/route.test.ts` | 9/9 PASSED |
| `npx vitest run gate-verdict/route.test.ts release-logs/route.test.ts` | 16/16 PASSED |
| `npx vitest run` (full suite) | 341 passed, 40 pre-existing failures |
| `npx tsc --noEmit` | PASS — zero errors |
| `npx next build` | PASS — "Compiled successfully" |
| `/api/platform/cicd/gate-verdict` in build output | CONFIRMED |
| `/api/platform/ingest/release-logs` in build output | CONFIRMED |
| `grep -c "stampLinksFromCommit" route.ts` | 2 (preserved — call + error message) |
| `grep -c "db.insert(releaseLogs)" route.ts` | 1 (preserved exactly once) |
| `grep -c "CL6_ENFORCEMENT_MODE" apphosting.yaml` | 1 |
| `grep -c "CL6_ENFORCEMENT_MODE" apphosting.dev.yaml` | 1 |
| `package.json version` | 2.13.14 |

---

## Env Var Rollout Note

`CL6_ENFORCEMENT_MODE=warn` ships in both `apphosting.yaml` and `apphosting.dev.yaml` as plain-value RUNTIME bindings (not a Firebase secret — matches `SLACK_RELEASE_APPROVAL_CHANNEL` / `PORTAL_BASE_URL` pattern).

The default `warn` means:
- **No prod ingest is blocked** until manual flip to `enforce`
- **Audit rows ARE written** to `deploy_gate_check` with `verdict='reject_no_pair'` on violations — full audit trail accumulates during warm-up period
- **console.error logs** surface violations in FAH runtime logs for observability

Flip timeline:
1. Phase 28 wires platform's own shared-workflows gate job (golden template)
2. Phase 28 completes and verifies round-trip (gate-verdict + ingest-release both succeed on platform itself)
3. 7-day grace window after Phase 28 ships
4. Manual flip: set `CL6_ENFORCEMENT_MODE: enforce` in apphosting.yaml + redeploy (operational, not in this plan)

---

## Version Bump Note

`package.json`: 2.13.13 → 2.13.14 (patch bump per workspace CLAUDE.md — this is a feature addition but scoped as patch because it's gated behind `warn` default and no existing behavior changes).

Final commit message: `v2.13.14: chore(27-03-03): bind CL6_ENFORCEMENT_MODE=warn in apphosting yamls; bump to 2.13.14`.

---

## Operational Follow-Ups (carry forward to STATE.md)

1. **Migration 0019 db:push** — `DATABASE_URL='<url-from-firebase-secret>' npm run db:push` must be run against prod CockroachDB before FAH dev backend deploys this code. Migration file exists; table does not yet exist in CRDB cluster. (Originally flagged in Plan 27-01 SUMMARY.)

2. **Phase 28** — Wire platform's own `shared-workflows` gate job (golden template) to test the full round-trip: gate-verdict POST → 15-min window → prod ingest receives 201. This is the first consumer to verify the CL-6 contract end-to-end.

3. **Manual `enforce` flip** — After Phase 28 ships and 7-day grace window passes, manually set `CL6_ENFORCEMENT_MODE: enforce` in `apphosting.yaml` and redeploy. Document the flip in a commit per workspace CLAUDE.md rules.

4. **Phase 35** — CL-6 column in compliance matrix UI. The `deploy_gate_check` audit data accumulates from now; Phase 35 surfaces it in `/admin/modules/ci-cd`.

---

## Deviations from Plan

None — plan executed exactly as written. The pre-check block was inserted additively with no changes to existing `deployedAtParsed` parsing, `branchValue` derivation, `db.insert(releaseLogs)`, `stampLinksFromCommit` try/catch, or final 201 response.

---

## Known Stubs

None. The CL-6 enforcement pre-check is fully wired. The `warn` default is intentional and operational (not a stub) — it is the planned safe ship default for Phase 27.

---

## Self-Check: PASSED

| Item | Status |
|------|--------|
| `src/app/api/platform/ingest/release-logs/route.ts` exists with pre-check | FOUND |
| `src/app/api/platform/ingest/release-logs/route.test.ts` exists (237 lines) | FOUND |
| `apphosting.yaml` contains CL6_ENFORCEMENT_MODE | FOUND |
| `apphosting.dev.yaml` contains CL6_ENFORCEMENT_MODE | FOUND |
| `package.json` version is 2.13.14 | FOUND |
| Commit `d6e270b` (Task 1 RED tests) | FOUND |
| Commit `8458871` (Task 2 GREEN implementation) | FOUND |
| Commit `5a21e68` (Task 3 config + version bump) | FOUND |
| 9/9 tests pass | CONFIRMED |
| 16/16 combined tests pass | CONFIRMED |
| tsc clean | CONFIRMED |
| next build clean | CONFIRMED |
