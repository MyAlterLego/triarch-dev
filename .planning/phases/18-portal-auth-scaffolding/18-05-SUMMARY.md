---
phase: 18-portal-auth-scaffolding
plan: 05
subsystem: testing
tags: [vitest, nextauth, cookies, auth, security, grep-test]

requires:
  - phase: 18-03
    provides: authOptions with real signIn callback + host-only cookie config

provides:
  - cookies.test.ts: 9 assertions on __Host- prefix + no domain attr (AUTH-05 / Pitfall 1 guard)
  - no-sub-claim.test.ts: grep-based guard failing on any code-level .sub reference (AUTH-06 / Pitfall 2 guard)
  - auth.test.ts: 8 signIn callback unit tests covering full allow/reject matrix (AUTH-03)
  - portal v0.2.0 — full auth scaffolding code-complete

affects:
  - Phase 19 (DB Connectivity)
  - Phase 21 (Release Page Port)
  - Any future portal auth modifications

tech-stack:
  added: []
  patterns:
    - "Source-text assertion via readFileSync + path.resolve(__dirname) for env-conditional config values (avoids module cache issues in Vitest jsdom environment)"
    - "grep-based filesystem scan test filtering comment lines to avoid false positives from documentation"
    - "vi.mock + vi.mocked pattern for @myalterlego/triarch-shared/auth"

key-files:
  created:
    - "portal/src/lib/cookies.test.ts"
    - "portal/src/lib/no-sub-claim.test.ts"
    - "portal/src/lib/auth.test.ts"
  modified:
    - "portal/package.json (0.1.4 → 0.2.0)"

key-decisions:
  - "Source-text assertions (readFileSync) used for __Host- prefix test instead of dynamic import + ENV patching — more stable in Vitest jsdom where NODE_ENV='test' at runtime"
  - "no-sub-claim.test.ts filters JSDoc comment lines to avoid false positives from auth.ts documentation comment warning about .sub"
  - "auth.test.ts has 8 tests (plan required 7+) — added explicit empty-string email test to complement null email test"

patterns-established:
  - "Vitest source-text assertions: readFileSync(path.resolve(__dirname, './file.ts')) for asserting static config strings that vary by NODE_ENV"
  - "grep guard pattern: execSync + filter comment lines + throw with hits.join for actionable failure messages"

requirements-completed:
  - AUTH-05
  - AUTH-06

duration: 15min
completed: 2026-05-08
---

# Phase 18 Plan 05: Portal Auth Test Guards Summary

**Vitest enforcement of Pitfall 1 (cookie leakage) and Pitfall 2 (OAuth sub divergence) via source-text assertions, grep guard, and 8 signIn callback unit tests — portal v0.2.0**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-05-08T18:09:00Z
- **Completed:** 2026-05-08T18:24:09Z
- **Tasks:** 3
- **Files modified:** 5 (3 created, 2 updated)

## Accomplishments

- Created `cookies.test.ts` with 9 assertions: `__Host-` prefix present in source for sessionToken/csrfToken in production, `__Secure-` for callbackUrl, unprefixed dev path present, and all three cookie types have no `domain` property + sessionToken enforces httpOnly/lax/path:/ (AUTH-05 / Pitfall 1 guard)
- Created `no-sub-claim.test.ts` with grep-based scan filtering comment lines — fails if any non-comment code references `.sub` claim (AUTH-06 / Pitfall 2 guard)
- Created `auth.test.ts` with 8 unit tests covering full signIn callback allow/reject matrix: null email, empty string email, null ctx, 0-member non-staff, staff bypass, customer admin, customer viewer, staff+member
- Bumped portal to v0.2.0; PR #5 merged to main (c6f7b96)
- Full vitest suite: 3 test files, 18 tests, all pass; next build exits 0

## Task Commits

Each task was committed atomically:

1. **Task 1: cookies.test.ts** - included in `b8c9682` (merged as `c6f7b96`)
2. **Task 2: no-sub-claim.test.ts** - included in `b8c9682` (merged as `c6f7b96`)
3. **Task 3: auth.test.ts + v0.2.0 bump** - `b8c9682` → squash merge `c6f7b96` (PR #5)

**Plan metadata:** (docs commit below)

## Files Created/Modified

- `portal/src/lib/cookies.test.ts` — 9 assertions: __Host- prefix in source, no domain attr, httpOnly/lax/path:/ on sessionToken (AUTH-05 / Pitfall 1)
- `portal/src/lib/no-sub-claim.test.ts` — grep guard: fails if any non-comment code line in src/ references .sub (AUTH-06 / Pitfall 2)
- `portal/src/lib/auth.test.ts` — 8 signIn callback unit tests with vi.mock of getCurrentUserContext
- `portal/package.json` — version bumped 0.1.4 → 0.2.0
- `portal/package-lock.json` — updated for version bump

## Decisions Made

- **Source-text assertions** used for `__Host-` prefix instead of dynamic import + `NODE_ENV` patching. Vitest jsdom sets `NODE_ENV='test'` at runtime and module caching makes ENV-based branching tests flaky. `readFileSync(path.resolve(__dirname, './auth.ts'))` reads the source and asserts the string is present — equally strong (the test fails when someone removes `__Host-`) and completely stable.
- **Comment filtering in no-sub-claim.test.ts**: `auth.ts` line 24 has a JSDoc comment saying "NEVER reference token.sub". The grep pattern `\.sub\b` matches this. The test filters lines where the content (after file:line: prefix) starts with `*`, `//`, or `/*` — ensuring documentation comments don't trigger false positives.
- **8 tests instead of 7**: Added explicit empty-string email test alongside null-email test; the signIn callback uses `user.email ?? ''` + `if (!email)`, so empty string is a distinct code path worth asserting.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Used `path.resolve(__dirname)` instead of `new URL('./auth.ts', import.meta.url)` for file read**
- **Found during:** Task 1 (cookies.test.ts)
- **Issue:** `import.meta.url` throws "URL must be of scheme file" in Vitest jsdom environment
- **Fix:** Replaced with `path.resolve(__dirname, './auth.ts')` which works in jsdom
- **Files modified:** `src/lib/cookies.test.ts`
- **Verification:** All 9 assertions pass after fix
- **Committed in:** b8c9682 (merged to c6f7b96)

**2. [Rule 2 - Missing Critical] Added comment-line filter to no-sub-claim.test.ts**
- **Found during:** Task 2 (no-sub-claim.test.ts)
- **Issue:** `auth.ts` JSDoc comment "NEVER reference token.sub" would cause a false positive — the grep pattern matches documentation, not code
- **Fix:** Filter lines where content starts with `*`, `//`, or `/*` before asserting zero hits
- **Files modified:** `src/lib/no-sub-claim.test.ts`
- **Verification:** Test passes with current auth.ts; would still fail if `const x = token.sub` were added to any source file
- **Committed in:** b8c9682 (merged to c6f7b96)

---

**Total deviations:** 2 auto-fixed (1 bug/environment incompatibility, 1 missing guard for false-positive prevention)
**Impact on plan:** Both auto-fixes necessary for test correctness. No scope creep.

## Issues Encountered

- Initial cherry-pick needed because `git checkout -b feat/auth-tests` was followed by test files written on the wrong branch. Fixed by cherry-picking the test commit onto `feat/auth-tests` and resetting `feat/post-login-routing`. Rebase onto updated `origin/main` was needed before merge (18-04 PR had been merged in parallel wave).

## Test Results Summary

```
Test Files  3 passed (3)
     Tests  18 passed (18)
  Duration  480ms
```

- `cookies.test.ts`: 9/9 assertions GREEN
- `no-sub-claim.test.ts`: 1/1 assertions GREEN (0 code-level .sub references found)
- `auth.test.ts`: 8/8 assertions GREEN

## Known Stubs

None — all test assertions are wired to actual authOptions and execSync grep results.

## HUMAN-UAT Items (gated on OPS-04)

The following items require a live OAuth round-trip and cannot be Vitest-verified:
- Live Set-Cookie header inspection (real `__Host-` prefix in HTTP response headers)
- Google OAuth sign-in flow end-to-end on portal.triarch.dev
- Staff user sees StaffCallout banner + "Switch to admin" link
- 0-membership customer routed to `/no-memberships`
- 1-membership customer auto-redirected to `/projects/{slug}/releases`
- 2+ membership customer sees `/projects` list page
- portal.triarch.dev returns 200 OK (portal-prod FAH deployment live)

## Phase 18 Completion Status

All 7 AUTH requirements code-complete:
- AUTH-01: `__Host-` cookies + no domain attr — code+test
- AUTH-02: Distinct PORTAL_NEXTAUTH_SECRET binding — config
- AUTH-03: signIn callback membership/staff rule — code+test
- AUTH-04: isStaff propagated to session, StaffCallout banner — code
- AUTH-05: Cookie shape Vitest assertion — test (this plan)
- AUTH-06: no-.sub grep guard — test (this plan)
- AUTH-07: Post-login routing (0/1/2+ memberships) — code (18-04)

Phase 18 deploy validates via portal.triarch.dev once OPS-04 lands and HUMAN-UAT is run.

## Next Phase Readiness

- Phase 19 (DB Connectivity): portal auth is fully scaffolded; DB queries in signIn callback use shared package — Phase 19 hardens the `portal_runtime` DML-only role
- Phase 21 (Release Page Port): auth session available via `getPortalSession()`; membership context available via `getCurrentUserContext`
- Phase 15-05 (OPS-04): Google OAuth redirect URIs still needed for live sign-in to work

---
*Phase: 18-portal-auth-scaffolding*
*Completed: 2026-05-08*
