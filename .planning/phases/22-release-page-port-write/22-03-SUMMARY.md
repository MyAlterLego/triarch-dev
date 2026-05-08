---
plan: 22-03
phase: 22-release-page-port-write
subsystem: api
tags: [next.js, route-handlers, portal, fah-rollout, branch-preview, atomic-lock, drizzle, vitest, jose]
status: complete
started: 2026-05-08
updated: 2026-05-08
tasks: 2/2

# Dependency graph
requires:
  - phase: 21-release-page-port-read
    provides: "PORTAL-01..04 — portal /projects + /projects/[slug]/releases server components in place; ReleasesClient + BranchPreviewClient stubs ready to wire"
  - phase: 22-release-page-port-write
    provides: "22-01 shared internal-hmac module + admin /api/internal/dispatch endpoint; 22-02 portal session helper + customer auth ladder pattern; portal v0.3.1 baseline"
  - phase: 13-branch-preview-swap
    provides: "admin's src/lib/fah-rollout.ts + atomic-lock + 8-min-timeout + branch-guarded-clear pattern (verbatim port source)"
provides:
  - "portal customer-side branch preview swap POST + status GET endpoints"
  - "WRITE-02 — atomic lock + branch regex + 8-min timeout + branch-guarded auto-clear"
  - "WRITE-03 — portal-owned FAH_PROMOTER_SA_KEY end-to-end (no admin proxy)"
  - "portal/src/lib/fah-rollout.ts (verbatim port from admin) for any future portal-owned FAH calls"
affects: [22-04, 22-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Verbatim-port-with-auth-swap: only difference vs admin's preview routes is getServerSession(authOptions) → getPortalSession() + getCurrentUserContext({user:{email}}); all DB / FAH / pitfall logic identical"
    - "Portal-owned FAH access: FAH_PROMOTER_SA_KEY bound in portal apphosting.yaml; shared firebase-app-hosting-compute SA's Phase 13 IAM binding covers portal automatically"
    - "Atomic lock guarantee preserved: db.update().where(and(eq(key, slug), isNull(previewBranchLocked))).returning() — single SQL UPDATE; loser sees empty array → 409"
    - "Branch-guarded UPDATE on every lock-clear: WHERE includes eq(previewBranchLocked, $branch) so a stale poll cannot clobber a NEWER lock for a different branch (PREV-06)"
    - "8-min hard timeout BEFORE FAH poll: stuck rollout cannot indefinitely lock UI (Pitfall 2)"
    - "BRANCH_REGEX validated BEFORE any DB or FAH call (defense-in-depth shell-injection guard / Pitfall 5)"

key-files:
  created:
    - "portal/src/lib/fah-rollout.ts"
    - "portal/src/lib/fah-rollout.test.ts"
    - "portal/src/app/api/projects/[slug]/branch/preview/route.ts"
    - "portal/src/app/api/projects/[slug]/branch/preview/route.test.ts"
    - "portal/src/app/api/projects/[slug]/branch/preview/status/route.ts"
    - "portal/src/app/api/projects/[slug]/branch/preview/status/route.test.ts"
  modified:
    - "portal/apphosting.yaml (FAH_PROMOTER_SA_KEY secret binding — WRITE-03)"
    - "portal/apphosting.dev.yaml (FAH_PROMOTER_SA_KEY explicit re-bind on dev overlay)"
    - "portal/package.json (v0.3.1 → v0.3.2)"

key-decisions:
  - "fah-rollout.ts ported verbatim — zero logic deltas vs admin's lib (already self-contained via @myalterlego/secrets)"
  - "Auth swap is the ONLY change between admin and portal preview routes — all atomic-lock / branch-guard / jsonb_set logic identical"
  - "FAH_PROMOTER_SA_KEY explicitly re-bound on apphosting.dev.yaml (not relying on inheritance) for clarity and grep-ability"
  - "BranchPreviewClient UI un-stub deferred to 22-04 per plan — this PR ships the data path correctly first"
  - "Portal version bumped 0.3.1 → 0.3.2 (minor surface — two new attack-surface API endpoints; per workspace rule)"

patterns-established:
  - "Portal data-path-first → UI-wiring-later: 22-02 shipped approve/reject/feedback data, 22-03 ships preview swap data, 22-04 wires both UIs"
  - "Verbatim-port + auth-swap: ANY admin route handler with the same business logic can ship to portal in <1 hour by porting the file and replacing the auth helper call"
  - "Vitest mock pattern for chained drizzle .update().set().where().returning() with per-call queue: updateCallQueue[] + updateCallIndex pointer drives different return values per UPDATE statement in a multi-update flow"

requirements-completed: [WRITE-02, WRITE-03]

# Metrics
duration: ~25min
completed: 2026-05-08
---

# Phase 22 Plan 03: Portal Branch Preview Swap Summary

**Two portal API endpoints (POST swap + GET status) with portal-owned FAH_PROMOTER_SA_KEY end-to-end — verbatim port of admin's Phase 13 endpoints with customer auth swap. Atomic lock, branch regex, 8-min timeout, and branch-guarded auto-clear all preserved.**

## Performance

- **Duration:** ~25 minutes wall clock
- **Started:** 2026-05-08T22:14Z
- **Completed:** 2026-05-08T22:35Z (PRs open, awaiting merge)
- **Tasks:** 2
- **Files created:** 6 (1 lib + 1 lib test + 2 routes + 2 route tests)
- **Files modified:** 3 (2 apphosting yamls + package.json)
- **New tests:** 27 (10 fah-rollout + 8 preview POST + 9 preview status)
- **Total portal vitest:** **123 GREEN / 1 skipped** (was 96 baseline; +27 new — exceeded plan target of ≥106)

## Accomplishments

### Portal lib — `src/lib/fah-rollout.ts`
- Verbatim port of admin's `src/lib/fah-rollout.ts` (Phase 13 / v2.7.0). Zero logic deltas — the module is already self-contained via `@myalterlego/secrets` for vault access and `jose` for JWT signing.
- Exports: `mintFahAccessToken`, `createFahRollout`, `getFahRolloutState`, `resetTokenCacheForTests`.
- 50-min token cache + single-flight latch for OAuth2 access tokens minted from FAH_PROMOTER_SA_KEY service account JWT.
- BRANCH_REGEX `/^[a-zA-Z0-9/_.\-]{1,256}$/` validated BEFORE any token mint or fetch (Pitfall 5).
- Token-exchange errors echo response status + body but never the JWT contents (Pitfall 14).
- `grep -n 'admin' portal/src/lib/fah-rollout.ts` returns only comment lines; no admin-relative imports.

### Portal API — `POST /api/projects/[slug]/branch/preview`
- Verbatim port of admin's preview route (146 lines effective) with auth swap:
  - `import { getPortalSession } from '@/lib/session'` + `getPortalSession()` instead of admin's `getServerSession(authOptions)`.
  - `import { getCurrentUserContext } from '@myalterlego/triarch-shared/auth'` + invoked with `{ user: { email } }` from session.
  - Schema imports stay shared package: `import { projects } from '@myalterlego/triarch-shared/schema'`.
- Atomic lock acquisition: `db.update(projects).set(...).where(and(eq(key, slug), isNull(previewBranchLocked))).returning()` — concurrent loser sees `[]` and gets 409 `lock_held` with current_branch + locked_at + locked_by surfaced.
- Branch regex guard, project_misconfigured handling (firebaseProjectId null → release lock + 500), FAH dispatch failure handling (release lock with branch guard + 502), and metadata jsonb_set stamp for previewRolloutName + previewLockedBy all identical to admin.

### Portal API — `GET /api/projects/[slug]/branch/preview/status`
- Verbatim port of admin's status route (155 lines effective) with same auth swap.
- 8-min `TIMEOUT_MS` enforced BEFORE FAH poll (Pitfall 2 hard cap) — `ageMs > TIMEOUT_MS` triggers branch-guarded force-clear and returns `{ state: 'timeout', terminal: true }` without polling FAH.
- Branch-guarded auto-clear on terminal state (`SUCCEEDED`, `FAILED`, `CANCELLED`): `WHERE eq(previewBranchLocked, branch)` ensures a stale poll cannot clobber a newer lock (PREV-06).
- Race-window handling: lock acquired but `previewRolloutName` not yet in metadata → return `{ state: 'PENDING', terminal: false }` without FAH poll.
- Transient FAH poll error → `{ state: 'PENDING', terminal: false, errorMessage }` with lock NOT cleared so future poll can recover.

### Test results (portal Vitest)

| Test file | Cases | All GREEN |
|---|---|---|
| `src/lib/fah-rollout.test.ts` | 10 | yes |
| `src/app/api/projects/[slug]/branch/preview/route.test.ts` | 8 | yes |
| `src/app/api/projects/[slug]/branch/preview/status/route.test.ts` | 9 | yes |

**Full portal vitest:** 123/124 GREEN (1 pre-existing skip from PORTAL-03 page test) — gain of +27 from 22-02 baseline.

### apphosting bindings (WRITE-03)
- `apphosting.yaml`:
  ```yaml
  - variable: FAH_PROMOTER_SA_KEY
    secret: FAH_PROMOTER_SA_KEY
  ```
- `apphosting.dev.yaml`: explicit re-bind on the dev overlay (same secret value; comments call out grep-ability rationale).
- IAM: shared `firebase-app-hosting-compute@triarch-dev-website.iam.gserviceaccount.com` already has `secretAccessor` on `FAH_PROMOTER_SA_KEY` from Phase 13 (admin binding). No new IAM action required for this plan.

### Builds
- `npx next build` — clean. Two new routes register as dynamic server-rendered (`ƒ`):
  - `ƒ /api/projects/[slug]/branch/preview`
  - `ƒ /api/projects/[slug]/branch/preview/status`

## Task Commits (portal repo)

1. **Task 1** — `3cf1378` `feat(22-03): port fah-rollout lib to portal + Vitest (10 GREEN)`
2. **Task 2** — `d9ed021` `v0.3.2: portal-owned branch preview swap (atomic lock + 8-min timeout + branch-guarded clear)`

## Decisions Made

- **Verbatim port + auth swap.** The admin preview routes were already well-factored — DB lock logic, FAH dispatch, branch guard, jsonb_set metadata, all centralized. The only adjustment for portal is the auth helper call. No business-logic deltas; no test changes beyond mock target swaps.
- **Portal owns FAH key end-to-end.** Per CONTEXT.md D-04: branch swap is a lower-blast-radius operation (FAH SA key scoped per-Firebase-project) than GitHub workflow dispatch (broad GitHub App key admin retains). Direct portal→FAH minimizes latency on the customer-facing branch swap path.
- **FAH_PROMOTER_SA_KEY explicitly re-bound on apphosting.dev.yaml.** Even though the dev overlay merges on top of prod yaml (and would inherit the binding by default), an explicit re-bind makes `grep "FAH_PROMOTER" portal/apphosting*.yaml` find both files. Mirror admin's pattern.
- **BranchPreviewClient UI un-stub deferred to 22-04.** This plan ships the data path correctly. Plan 22-04 wires the un-stubbed BranchPreviewClient onClick handlers against these endpoints alongside the larger ReleasesClient un-stub.

## Deviations from Plan

None. The plan executed exactly as written. Two atomic commits; 27 new tests all GREEN on first run after writing them; build clean; PRs opened.

A few minor implementation choices the plan left to executor judgment:
- Used 10 fah-rollout test cases (vs the 9 specified in plan `<behavior>`). The plan listed 9 distinct behavior assertions; my port covered them as 4 mintFahAccessToken cases (happy/cache/single-flight/vault-fail) + 1 token-exchange-fail + 3 createFahRollout cases (happy/4xx/invalid_branch) + 2 getFahRolloutState cases (happy/invalid_path). Net result is 10 in 9 categories.
- All 8 POST and all 9 GET test cases per the plan's `<behavior>` block landed exactly as specified.

## Auth Gates / User Setup Required

### Verified already in place
- `FAH_PROMOTER_SA_KEY` exists in `triarch-vault` GCP Secret Manager (since Phase 13).
- `secretAccessor` IAM granted to shared `firebase-app-hosting-compute@triarch-dev-website.iam.gserviceaccount.com` SA (from Phase 13 — same compute SA serves admin AND portal in this Firebase project).

### Pending Mike's review (PRs open, NOT merged)
- Portal PR https://github.com/MyAlterLego/triarch-portal/pull/13 — review and merge to main when ready.
- Admin PR (this docs-only PR) — pending creation.

### Live smoke deferred
- Portal-dev branch swap → FAH rollout in Firebase Console: deferred until portal-dev finishes deploying with this code (post-merge).
- Documented as 22-04 cross-cutting verification step alongside the UI wiring + portal Slack notification.

## Issues Encountered

- None. Tests passed first execution; build clean first execution.

## Known Stubs

None new from this plan. Pre-existing stubs in portal's `BranchPreviewClient.tsx` (Phase 21 stub — UI visible but onClick no-ops with TODO Phase 22 toast) are unchanged. They wire against these new endpoints in 22-04 (deferred per plan).

## Next Phase Readiness

- **22-04** wires `BranchPreviewClient.tsx` `onClick` handlers (and the `ReleasesClient` mutation handlers from 22-02) against the now-shipping endpoints. Adds `PORTAL_SLACK_BOT_TOKEN` for Slack notification on approve.
- **22-05** publishes any final shared package bumps and closes the v2.2 milestone Phase 22.
- Live E2E smoke (customer admin clicks "Preview this branch" in portal-dev → projects.preview_branch_locked acquires + portal-dev FAH rollout dispatches + status GET shows in-flight then SUCCEEDED + lock auto-clears) will land as a 22-04 verification step once Slack notification closes the customer-feedback loop.

## Self-Check: PASSED

All claimed files exist on disk; all claimed commits exist in portal history.

- 6 files created — verified with `[ -f "$f" ]` (4 ts + 2 test files)
- 3 files modified — verified with grep on the changed bindings (FAH_PROMOTER_SA_KEY in both yamls; "0.3.2" in package.json)
- 2 commits in portal — `3cf1378` Task 1 + `d9ed021` Task 2 — verified with `git log --oneline | grep`
- `must_haves.key_links` 3/3 present:
  - `createFahRollout\(` in `portal/src/app/api/projects/[slug]/branch/preview/route.ts` — yes (line 144)
  - `getSecret\('FAH_PROMOTER_SA_KEY'\)` in `portal/src/lib/fah-rollout.ts` — yes (line 93)
  - `previewBranchLocked` in `portal/src/app/api/projects/[slug]/branch/preview/status/route.ts` — yes (multiple sites including the branch-guarded UPDATE WHERE clause)
- `must_haves.truths` 6/6 covered by code + tests:
  1. POST acquires atomic lock + dispatches FAH — Test 5 (202 happy path)
  2. Concurrent POST → exactly one wins, other 409 — Test 6 (409 lock_held)
  3. Invalid branch → 400 BEFORE DB/FAH — Test 4 (assertion `updateCallIndex === 0`)
  4. GET /status idle / live / 8-min timeout / auto-clear — Tests 3 (idle) + 4 (SUCCEEDED) + 5 (timeout) + 6 (BUILDING)
  5. FAH dispatch failure releases lock branch-guarded — Test 8 (502 fah_dispatch_failed)
  6. Non-member 404 / viewer 403 / admin 202 — POST Tests 2 + 3 + 5; GET Tests 2
- `must_haves.artifacts` 5/5 present (4 created + apphosting.yaml binding + package.json version)
- `apphosting.yaml` + `apphosting.dev.yaml` both contain `FAH_PROMOTER_SA_KEY` binding — verified with grep
- Portal `package.json` shows `"version": "0.3.2"` — verified

---
*Phase: 22-release-page-port-write*
*Completed: 2026-05-08 (PRs open, awaiting Mike's review)*
