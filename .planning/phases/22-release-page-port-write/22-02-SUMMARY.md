---
plan: 22-02
phase: 22-release-page-port-write
subsystem: api
tags: [next.js, route-handlers, portal, hmac-dispatch, write-paths, drizzle, vitest]
status: complete
started: 2026-05-08
updated: 2026-05-08
tasks: 2/2

# Dependency graph
requires:
  - phase: 22-release-page-port-write
    provides: "22-01 shared internal-hmac module + admin /api/internal/dispatch endpoint + INTERNAL_HMAC_SECRET in triarch-vault"
provides:
  - "portal customer-side approve/reject/feedback POST + feedback DELETE route handlers"
  - "WRITE-01 — release_approvals.actor_source='portal' on every customer mutation"
  - "WRITE-04 portal-side wiring — dispatchPromotion HMAC-signed POST to admin /api/internal/dispatch"
affects: [22-03, 22-04, 22-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Portal route auth: getPortalSession() → 401 if no email → getCurrentUserContext({user:{email}}) → 401 if null → project lookup → 404 non-member → 403 viewer"
    - "Fire-and-forget dispatch on fresh approve only (not idempotent re-approve, not on reject)"
    - "dispatchPromotion failure does NOT roll back the approval (returns 201 anyway, logs warning)"
    - "Canonical body construction must match signRequest's internal canonicalize: JSON.stringify(body, Object.keys(body).sort())"

key-files:
  created:
    - "portal/src/lib/release-mutations.ts"
    - "portal/src/lib/release-mutations.test.ts"
    - "portal/src/lib/internal-dispatch.ts"
    - "portal/src/app/api/projects/[slug]/releases/[releaseId]/approve/route.ts"
    - "portal/src/app/api/projects/[slug]/releases/[releaseId]/approve/route.test.ts"
    - "portal/src/app/api/projects/[slug]/releases/[releaseId]/reject/route.ts"
    - "portal/src/app/api/projects/[slug]/releases/[releaseId]/reject/route.test.ts"
    - "portal/src/app/api/projects/[slug]/releases/[releaseId]/feedback/route.ts"
    - "portal/src/app/api/projects/[slug]/releases/[releaseId]/feedback/route.test.ts"
    - "portal/src/app/api/projects/[slug]/releases/[releaseId]/feedback/[feedbackId]/route.ts"
    - "portal/src/app/api/projects/[slug]/releases/[releaseId]/feedback/[feedbackId]/route.test.ts"
  modified:
    - "portal/apphosting.yaml (INTERNAL_HMAC_SECRET secret + ADMIN_INTERNAL_DISPATCH_URL plain value)"
    - "portal/apphosting.dev.yaml (ADMIN_INTERNAL_DISPATCH_URL dev override)"
    - "portal/package.json (v0.3.0 → v0.3.1; @myalterlego/triarch-shared ^0.2.0 → ^0.3.0)"
    - "portal/package-lock.json (synced)"

key-decisions:
  - "actor_source='portal' hardcoded in approveReleasePortal/rejectReleasePortal (NOT 'web' — that's admin's path)"
  - "dispatchPromotion is fire-and-forget; failure logged, never rolls back the approval"
  - "Canonical rawBody = JSON.stringify(body, Object.keys(body).sort()) to match signRequest's internal canonicalize so admin's verifyRequest succeeds"
  - "Slack notification (PORTAL_SLACK_BOT_TOKEN) INTENTIONALLY DEFERRED to plan 22-04 — this plan ships dispatch path correctly first"
  - "UI un-stub deferred to 22-04 — ReleasesClient mutation handlers still show TODO Phase 22 toast"
  - "Author check on feedback DELETE is case-insensitive (project-wide email convention)"
  - "Feedback DELETE 24h window enforced; older comments return 403 (not 410 Gone — matches admin's pattern)"

patterns-established:
  - "Portal write-route auth ladder: 401 unauth → 404 unknown project → 404 non-member → 403 viewer → 4xx domain-specific → 201/200 success"
  - "Fire-and-forget HMAC dispatch in approve handler with try/catch + warn-log; helper internally swallows errors"
  - "Vitest mock pattern for sequential select() chains: counter increments + branch on call number"
  - "vi.useFakeTimers() + vi.setSystemTime() for time-sensitive 24h window tests"

requirements-completed: [WRITE-01, WRITE-04]

# Metrics
duration: ~12min
completed: 2026-05-08
---

# Phase 22 Plan 02: Customer Write Paths + HMAC Dispatch Summary

**Four portal API routes (approve / reject / feedback POST / feedback DELETE) with portal-session auth, actor_source='portal' DB writes, and fire-and-forget HMAC-signed dispatch to admin's /api/internal/dispatch on fresh approves.**

## Performance

- **Duration:** ~12 minutes wall clock
- **Started:** 2026-05-08T21:45Z
- **Completed:** 2026-05-08T21:55Z
- **Tasks:** 2
- **Files created:** 11 (3 lib + 4 routes + 4 route tests)
- **Files modified:** 4 (2 apphosting yamls + package.json + package-lock.json)
- **New tests:** 42 (9 release-mutations + 11 approve + 7 reject + 7 feedback POST + 8 feedback DELETE)
- **Total portal vitest:** 96 GREEN / 1 skipped (was 54 baseline)

## Accomplishments

### Portal lib helpers
- `src/lib/release-mutations.ts` — `approveReleasePortal` / `rejectReleasePortal` port admin's `release-actions.ts` verbatim with two adjustments:
  1. `actorSource: 'portal'` hardcoded on every INSERT (admin defaults to `'web'`).
  2. Schema imports come from `@myalterlego/triarch-shared/schema` rather than admin's local `@/db/schema` shim — keeps portal's deps to the shared package only.
  - Exports `REASON_MAX_CHARS = 500` and `FEEDBACK_MAX_CHARS = 2000`.
- `src/lib/internal-dispatch.ts` — `dispatchPromotion()` wraps `signRequest` from `@myalterlego/triarch-shared/internal-hmac` (shared@0.3.0 from 22-01) and POSTs to `ADMIN_INTERNAL_DISPATCH_URL` with `X-HMAC-Signature` header.
  - **Critical:** `rawBody = JSON.stringify(body, Object.keys(body).sort())` exactly matches `signRequest`'s internal canonicalize so admin's `verifyRequest` recomputes the same signature.
  - Failure model: never throws, returns `ok: false` with truncated detail (200 char cap), never logs the secret or rawBody.

### release-mutations vs admin's release-actions: differences
| Aspect | admin/release-actions.ts | portal/release-mutations.ts |
|---|---|---|
| Function names | `approveRelease` / `rejectRelease` | `approveReleasePortal` / `rejectReleasePortal` (renamed to disambiguate) |
| `actorSource` on INSERT | Caller-controlled, defaults to `'web'` | Hardcoded `'portal'` (no caller override) |
| Schema imports | `@/db/schema` (admin's local re-export shim) | `@myalterlego/triarch-shared/schema` (no admin-relative imports) |
| Status state-machine | Identical: `dev → approved/rejected`; `approved` short-circuits as idempotent; any other status = `invalid_status` | **Identical** (preserves single source of truth for the state machine) |
| `REASON_MAX_CHARS` | 500 (re-exported) | 500 (re-exported) |
| `FEEDBACK_MAX_CHARS` | Not exported here (lives in admin's feedback route) | **Newly exported** here for portal feedback POST to import |

### Portal API routes (all under `/api/projects/[slug]/releases/[releaseId]`)
- `approve/route.ts` (146 lines) — POST: portal session auth, 401 / 404-no-leak / 403-viewer ladder, calls `approveReleasePortal`, fire-and-forget `dispatchPromotion` only on fresh approve (NOT idempotent), returns 201 with `{ ok, alreadyApproved, release, approval }`.
- `reject/route.ts` (114 lines) — POST: same auth ladder, calls `rejectReleasePortal`, NO dispatch (rejection ends the flow), 400 invalid_reason / 409 invalid_status / 200 success.
- `feedback/route.ts` (110 lines) — POST: customer comment INSERT into `release_feedback` with `author_email = ctx.email`, FEEDBACK_MAX_CHARS=2000 cap, 400 on empty/oversized.
- `feedback/[feedbackId]/route.ts` (115 lines) — DELETE: author + 24h-window enforcement, case-insensitive author match, joined-through-releaseLogs to prevent cross-project tampering.

### Test results (portal Vitest)
- 96 / 97 GREEN (1 pre-existing skip from PORTAL-03 page test).
- Baseline 54 (Phase 21) + 42 new = 96 (target was ≥ 79).

| Test file | Cases | All GREEN |
|---|---|---|
| `release-mutations.test.ts` | 9 | yes |
| `approve/route.test.ts` | 11 | yes |
| `reject/route.test.ts` | 7 | yes |
| `feedback/route.test.ts` | 7 | yes |
| `feedback/[feedbackId]/route.test.ts` | 8 | yes |

### apphosting bindings
- `apphosting.yaml`:
  - `INTERNAL_HMAC_SECRET` → `secret: INTERNAL_HMAC_SECRET` (same triarch-vault secret as admin from 22-01)
  - `ADMIN_INTERNAL_DISPATCH_URL` → plain value `https://admin.triarch.dev/api/internal/dispatch`, RUNTIME-only
- `apphosting.dev.yaml` overrides `ADMIN_INTERNAL_DISPATCH_URL` → `https://admin-dev.triarch.dev/api/internal/dispatch`

### Builds
- `npx next build` — clean. All 4 new routes registered as dynamic server-rendered routes (`ƒ`).

## Task Commits (portal repo)

1. **Task 1** — `6f2dba4` `feat(22-02): portal release-mutations + internal-dispatch helpers`
2. **Task 2** — `b587c8b` `v0.3.1: customer approve/reject/feedback routes + HMAC dispatch`

## Decisions Made

- **`actor_source='portal'` is the WRITE-01 invariant.** Hardcoded in helper, never caller-controlled — every customer-side approve/reject row carries provenance distinct from staff approves on admin (`'web'`) and OttoBot (`'slack'`).
- **Slack notification deferred to 22-04** per plan. The dispatch path is the WRITE-01 critical path; Slack noise is additive and depends on `PORTAL_SLACK_BOT_TOKEN` which is a 22-04 deliverable.
- **UI un-stub deferred to 22-04.** ReleasesClient's mutation handlers (from Phase 21) still TODO; they get wired against these endpoints in 22-04 once Slack lands.
- **Fire-and-forget dispatch failure does NOT roll back the approval.** Mirrors admin's Slack-notify pattern; customer's release IS approved even if downstream GitHub Actions dispatch hiccups (admin can retry from admin-side controls).
- **Author check is case-insensitive** for feedback DELETE — project-wide email convention from v1.14.
- **No `release-mutations.ts.test.ts` for `internal-dispatch.ts`.** Per plan: "no runtime test yet — exercised end-to-end in route tests next task." The approve route test asserts `dispatchPromotion` was called exactly once with the correct args on fresh approves and not at all on idempotent / invalid_status / auth-failure paths.

## Deviations from Plan

### [Rule 3 — Blocking issue] Portal `node_modules` had stale `@myalterlego/triarch-shared@0.2.x`

**Found during:** Task 1 prep — verifying `@myalterlego/triarch-shared/internal-hmac` import target.

**Issue:** Portal's `package.json` pinned `^0.2.0`, and the installed `node_modules` reflected that — 0.2.x has no `internal-hmac` subpath. Plan 22-01's tag (`shared/v0.3.0`) IS pushed and 0.3.0 IS published to GitHub Packages (verified with `npm view @myalterlego/triarch-shared versions` using gh CLI token). The 22-01-SUMMARY note "TAG NOT YET PUSHED" is stale; orchestrator follow-ups completed.

**Fix:** Ran `npm install @myalterlego/triarch-shared@^0.3.0 --save` in portal, which:
1. Bumped the dep in `package.json` from `^0.2.0` → `^0.3.0`
2. Refreshed `package-lock.json` to lock 0.3.0
3. Pulled the 0.3.0 tarball into `node_modules` (now contains `dist/internal-hmac.{js,d.ts}`)

**Files modified:** `portal/package.json`, `portal/package-lock.json` (committed as part of Task 1's commit since the dep is structurally required for Task 1's tests to compile).

**Commit:** `6f2dba4` (Task 1)

This was anticipated by the plan in Task 2 step 8: *"set the dependency to a `file:` link locally for development; ensure CI's `npm ci` resolves to a real published version before merging this PR."* The actual situation was better than that — the published version is already available, so we pin to the registry version directly (no `file:` link needed).

### [Rule 1 — Bug] Test fixture had `releaseType: null` violating schema NOT NULL

**Found during:** Task 1 typecheck (`npx tsc --noEmit`).

**Issue:** My initial `release-mutations.test.ts` fixture used `releaseType: null` but the Drizzle schema requires `string` for that column.

**Fix:** Changed fixture to `releaseType: 'minor'`. Tests still pass; type errors gone for files I created.

**Commit:** Folded into Task 1 commit `6f2dba4`.

## Auth Gates / User Setup Required

### Verified already in place (from 22-01)
- `INTERNAL_HMAC_SECRET` exists in `triarch-vault` GCP Secret Manager.
- `secretAccessor` IAM granted to `firebase-app-hosting-compute@triarch-dev-website.iam.gserviceaccount.com`. **Same compute SA serves admin AND portal in shared `triarch-dev-website` project**, so this binding inherited from 22-01 covers portal automatically.

### Pending Mike's review (PR open, NOT merged)
- Portal PR (https://github.com/MyAlterLego/triarch-portal/pull/...) — review and merge to main when ready. Merge to main triggers Firebase App Hosting deploy of portal-prod.
- Admin PR (https://github.com/MyAlterLego/triarch-dev/pull/...) — docs-only PR with this SUMMARY.md + STATE updates. No app code change → no admin redeploy.

### Pre-existing (out of scope, tracked in `deferred-items.md`)
- Three `TS2561` errors in `portal/src/lib/auth.test.ts` from Phase 18 (`projectKey` vs `project_key` snake_case). Tests still pass (Vitest bypasses types in mocks); fix in a future maintenance plan or alongside Phase 23.

## Issues Encountered

- npm CLI couldn't `npm view` GitHub-Packages-private without explicit `NODE_AUTH_TOKEN` env var. Used `gh auth token` to provide one inline.
- No issues during route TDD — all 33 route tests passed on first execution after the test files were written.

## Known Stubs

None new from this plan. Pre-existing stubs in portal's `ReleasesClient.tsx` (4 mutation handlers with TODO Phase 22 toast) are unchanged — they wire against these new endpoints in 22-04 (deferred per plan).

## Next Phase Readiness

- **22-03** (branch swap write paths) can now follow this plan's auth-ladder pattern.
- **22-04** wires ReleasesClient mutation handlers against these endpoints AND lands `PORTAL_SLACK_BOT_TOKEN` for Slack notification on approve.
- **22-05** publishes any final shared package bumps and closes the milestone.
- Live smoke test (customer admin clicks Approve in portal-dev → release_approvals row + admin-dev workflow dispatch) deferred to a 22-04 cross-cutting verification step once Slack feedback closes the loop.

## Self-Check: PASSED

All claimed files exist on disk; all claimed commits exist in portal history.

- 11 files created — verified with `[ -f "$f" ]`
- 3 files modified — verified
- 2 commits in portal — `6f2dba4` Task 1 + `b587c8b` Task 2 — verified with `git log --oneline | grep`
- `must_haves.key_links` 4/4 present:
  - `approveReleasePortal\(` in approve route — yes
  - `dispatchPromotion\(` in approve route — yes
  - `signRequest\(` in internal-dispatch — yes
  - `X-HMAC-Signature` header in internal-dispatch — yes
- `must_haves.truths` 7/7 covered by code + tests (Slack-related "non-noisy" path is structural, not asserted by test).
- `apphosting.yaml` + `apphosting.dev.yaml` both contain `INTERNAL_HMAC_SECRET` + `ADMIN_INTERNAL_DISPATCH_URL` bindings — verified with grep.

---
*Phase: 22-release-page-port-write*
*Completed: 2026-05-08*
