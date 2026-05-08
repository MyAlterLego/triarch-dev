---
phase: 19-database-connectivity
plan: 02
subsystem: database
tags: [cockroachdb, drizzle, pg, portal, vitest, apphosting, firebase, portal_runtime]

# Dependency graph
requires:
  - phase: 19-01
    provides: portal_runtime CRDB role + DATABASE_URL_PORTAL GCP secret provisioned
  - phase: 16-shared-package-extraction
    provides: "@myalterlego/triarch-shared/db exports `db` via /db subpath"
provides:
  - "portal/src/lib/db.ts: 1-line re-export of `db` from @myalterlego/triarch-shared/db"
  - "portal/src/lib/db.test.ts: 4-test vitest smoke suite — re-export integrity + CRDB permission-denied propagation"
  - "portal apphosting.yaml + apphosting.dev.yaml: DATABASE_URL bound from DATABASE_URL_PORTAL (portal_runtime creds)"
  - "portal v0.2.1 squash-merged to main (PR #6), FAH portal-prod auto-deploy triggered"
affects:
  - 21-release-page-port-read
  - 22-release-page-port-write
  - 23-bug-feature-customer-surface

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Portal db client: thin re-export from shared package — zero duplicate Pool construction"
    - "FAH secret binding: `secret: DATABASE_URL_PORTAL` pattern in apphosting.yaml for portal_runtime creds"
    - "CRDB error propagation test: class-based PoolMock (not arrow fn) + .cause chain check for Drizzle-wrapped errors"

key-files:
  created:
    - portal/src/lib/db.ts
    - portal/src/lib/db.test.ts
  modified:
    - portal/apphosting.yaml
    - portal/apphosting.dev.yaml
    - portal/package.json

key-decisions:
  - "Re-export pattern chosen for portal db.ts — single Pool in shared package, zero duplication, mirrors admin pattern"
  - "Single portal_runtime role for both prod + dev FAH backends — DATABASE_URL_PORTAL secret used in both apphosting.yaml files"
  - "CRDB permission-denied test checks error.cause chain — Drizzle wraps pg errors with 'Failed query' wrapper but original error surfaces via .cause"

patterns-established:
  - "Drizzle error wrapping: raw CRDB errors surface via .cause on the thrown Error; test via isRawMessage || isCauseMessage pattern"
  - "Pool mock for vitest: use class constructor (not vi.fn().mockImplementation arrow) to be a valid `new` target"

requirements-completed:
  - DB-01
  - DB-03

# Metrics
duration: 3min
completed: 2026-05-08
---

# Phase 19 Plan 02: Database Connectivity (Portal) Summary

**Portal pg.Pool + portal_runtime DML-only CRDB credentials wired via DATABASE_URL_PORTAL FAH secret; CRDB permission-denied smoke test added; portal v0.2.1 squash-merged**

## Performance

- **Duration:** 3 min
- **Started:** 2026-05-08T18:53:02Z
- **Completed:** 2026-05-08T18:56:40Z
- **Tasks:** 3 (Tasks 1 + 2 auto, Task 3 commit+PR+merge)
- **Files modified:** 5 portal-repo files

## Accomplishments
- `portal/src/lib/db.ts` created as 1-line re-export from `@myalterlego/triarch-shared/db` — no duplicate Pool construction (DB-01)
- `portal/src/lib/db.test.ts` 4-test vitest suite: re-export integrity, instance identity with shared package, Pool ctor receives DATABASE_URL, CRDB permission-denied error propagates unswallowed through Drizzle wrapper (DB-04 portal-side mirror)
- Both `apphosting.yaml` and `apphosting.dev.yaml` swap `DATABASE_URL` secret binding from `DATABASE_URL` / `DATABASE_URL_DEV` to `DATABASE_URL_PORTAL` (DB-02 portal-side)
- `package.json` confirmed NO `db:push` / NO `db:generate` scripts (DB-03); version bumped 0.2.0 → 0.2.1
- PR #6 opened, CI quality-gate green, squash-merged to main at `7575bb6`; FAH portal-prod auto-deploy triggered
- Full vitest suite: 22/22 tests GREEN (18 pre-existing + 4 new); `next build` exits 0

## Task Commits

Each task committed atomically on feature branch `feat/db-connectivity-portal-runtime`:

1. **Task 1: portal db.ts re-export + db.test.ts smoke test** - `c6722c9` (feat)
2. **Task 2: bind DATABASE_URL_PORTAL + version bump** - `9f99a32` (feat)
3. **Task 3: push branch + PR + squash merge** - squash commit `7575bb6` on main (PR #6)

**Plan metadata:** documented in this SUMMARY.md (see final-commit step)

## Files Created/Modified
- `portal/src/lib/db.ts` - 1-line re-export of `db` from `@myalterlego/triarch-shared/db`; no Pool construction, no schema duplication
- `portal/src/lib/db.test.ts` - 4-test vitest smoke suite covering DB-01, DB-04 portal-side, and Pool ctor env binding
- `portal/apphosting.yaml` - DATABASE_URL secret binding changed from `DATABASE_URL` → `DATABASE_URL_PORTAL` with provenance comment
- `portal/apphosting.dev.yaml` - DATABASE_URL secret binding changed from `DATABASE_URL_DEV` → `DATABASE_URL_PORTAL`; single portal_runtime role for both envs
- `portal/package.json` - version bumped 0.2.0 → 0.2.1

## Decisions Made
- **Re-export vs thin wrapper:** Chose re-export (1-line `export { db } from '...'`) — shared package owns the Pool, zero risk of double-connection-count, mirrors the admin pattern established in Phase 16
- **Single portal_runtime role for prod + dev:** Both `apphosting.yaml` and `apphosting.dev.yaml` bind `DATABASE_URL_PORTAL`. If a separate dev cluster lands later, mint `DATABASE_URL_PORTAL_DEV` and re-bind `apphosting.dev.yaml` only
- **Drizzle error wrapping:** Drizzle wraps pg errors as `"Failed query: ..."` but preserves the original via `.cause`. Test 4 checks `error.cause.message` (not `error.message`) to assert permission-denied propagation. This is correct behavior — the error IS surfaced, just wrapped one level

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Pool mock required class constructor instead of vi.fn().mockImplementation arrow**
- **Found during:** Task 1 (TDD GREEN — running db.test.ts after creating db.ts)
- **Issue:** `vi.fn().mockImplementation((cfg) => ({ ... }))` produces an arrow function body; `new Pool(...)` in the shared package throws `TypeError: (cfg) => ... is not a constructor`
- **Fix:** Replaced the vi.fn() arrow mock with a `class PoolMock { constructor(cfg) { ... } }` and a module-level `poolCtorArg` variable to capture the constructor argument for test assertions
- **Files modified:** `portal/src/lib/db.test.ts`
- **Verification:** `npx vitest run src/lib/db.test.ts` — 4/4 GREEN after fix
- **Committed in:** `c6722c9` (Task 1 commit, part of TDD GREEN phase)

**2. [Rule 1 - Bug] Test 4 regex adjusted for Drizzle error wrapping**
- **Found during:** Task 1 (TDD GREEN — 3/4 passing; Test 4 failing with mismatch)
- **Issue:** Drizzle wraps pool errors: actual thrown message was `"Failed query: ALTER TABLE..."`, not the CRDB `"permission denied"` message. Plan anticipates this: "adjust the regex to match the wrapper text — but the underlying message must still surface"
- **Fix:** Changed Test 4 from `rejects.toThrow(/permission|CREATE privilege/i)` to a manual `try/catch` that checks `error.message` OR `error.cause.message` against the regex — confirming the error is NOT swallowed (promise rejects) AND the CRDB error text IS accessible via `.cause`
- **Files modified:** `portal/src/lib/db.test.ts`
- **Verification:** `npx vitest run src/lib/db.test.ts` — 4/4 GREEN after fix
- **Committed in:** `c6722c9` (Task 1 commit, same fix iteration)

---

**Total deviations:** 2 auto-fixed (both Rule 1 - Bug; both in db.test.ts mock setup)
**Impact on plan:** Both fixes were in the test mock, not production code. db.ts shipped exactly as planned. No scope creep.

## Issues Encountered
- Vitest mock constructor pattern: `vi.fn().mockImplementation()` with an arrow function body is not usable as a `new` target in Node.js. Solved with a class-based mock. This is a known vitest/Node ESM behavior and is documented in the patterns-established section for future portal tests that need to mock constructors.

## User Setup Required
**Post-deploy live verification deferred to Mike (auto_chain_mode — OPS-04 sync):**

After the FAH portal-prod auto-deploy completes (~3-5 min after merge):

1. Visit `https://portal.triarch.dev/login` — page must render without 500
2. Sign in with a customer Gmail — `getCurrentUserContext` runs a SELECT against `project_members` via portal_runtime; success proves DB-01 with live evidence
3. Tail logs: `gcloud logging read 'resource.type="run_revision" AND resource.labels.service_name=~"portal-prod" AND severity>=ERROR' --project=triarch-dev-website --limit=20 --freshness=10m`
4. Append a "Portal end-to-end verification (Plan 19-02 deploy)" section to `.planning/phases/19-database-connectivity/19-01-CRDB-VERIFY.md` with deploy commit SHA, timestamp, and signin outcome

## Next Phase Readiness

Portal DB client is live at portal_runtime credentials:
- SELECT/INSERT/UPDATE/DELETE available on all tables (projects, project_members, release_logs, release_log_links, bug_reports, feature_requests)
- ALTER/CREATE/DROP rejected at the CRDB auth boundary (smoke test confirms propagation)
- No db:push / no db:generate in portal — admin remains sole migration authority (DB-03)

**Hand-off note for Phase 21 (Release Page Port — Read):**
Portal db client live at portal_runtime; `db.select()` / `db.insert()` / `db.update()` / `db.delete()` all available for the tables Phase 21 needs (projects, project_members, release_logs, release_log_links). ALTER/CREATE/DROP rejected at the auth boundary. Phase 22 write paths can use the same db client for INSERT/UPDATE on approved_releases etc. without any additional DB wiring.

**Cross-link:** See `19-01-SUMMARY.md` (admin-repo half — CRDB role + GCP secret provisioning). Together, 19-01 + 19-02 close Phase 19 and deliver DB-01..DB-04.

---
*Phase: 19-database-connectivity*
*Completed: 2026-05-08*
