---
phase: 18-portal-auth-scaffolding
plan: 03
subsystem: auth
tags: [nextauth, jwt, session, typescript, next.js, react-server-components]

# Dependency graph
requires:
  - phase: 18-02
    provides: NextAuth v4 core wired with host-only cookies + login page (STUB signIn callback replaced here)
  - phase: 16
    provides: "@myalterlego/triarch-shared@0.1.0 published — getCurrentUserContext available"
provides:
  - Real customer-membership signIn enforcement via getCurrentUserContext (AUTH-03)
  - Staff bypass with isStaff flag propagated through JWT → session (AUTH-04)
  - StaffCallout amber banner server component rendered site-wide in layout
  - src/types/next-auth.d.ts type augmentation for session.user.isStaff
  - src/lib/session.ts getPortalSession() server-side helper
affects: [18-04, 18-05, 21, 22, 23]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "signIn callback queries getCurrentUserContext, fails closed on null (DB error → reject)"
    - "jwt callback re-queries ctx on first sign-in to compute isStaff for token"
    - "session callback propagates token.isStaff → session.user.isStaff"
    - "Server component reads session via getPortalSession() helper, renders conditionally"
    - "TypeScript module augmentation in src/types/next-auth.d.ts for extended session fields"

key-files:
  created:
    - src/lib/auth.ts (replaced STUB with real signIn + jwt/session enrichment)
    - src/types/next-auth.d.ts
    - src/lib/session.ts
    - src/components/StaffCallout.tsx
  modified:
    - src/app/layout.tsx
    - package.json (v0.1.3 → v0.1.4)

key-decisions:
  - "Fail closed on null getCurrentUserContext return (DB error rejects sign-in; no bypass for portal)"
  - "jwt callback re-queries DB on initial sign-in for isStaff — avoids relying on user object shape"
  - "StaffCallout uses getPortalSession() helper (not direct getServerSession) for future testability"
  - "Comment-only .sub reference retained in auth.ts to document the invariant (AUTH-06)"

patterns-established:
  - "getPortalSession(): centralized server-side session read for all RSC consumers"
  - "Session type augmentation via src/types/next-auth.d.ts follows NextAuth v4 module augmentation pattern"
  - "StaffCallout pattern: async server component, reads session, returns null early for non-staff"

requirements-completed: [AUTH-03, AUTH-04]

# Metrics
duration: 14min
completed: 2026-05-08
---

# Phase 18 Plan 03: Portal Auth Membership Rule + StaffCallout Summary

**NextAuth signIn now enforces customer-membership via getCurrentUserContext (fail-closed), isStaff propagated JWT→session, amber StaffCallout banner rendered site-wide for staff users**

## Performance

- **Duration:** ~14 min
- **Started:** 2026-05-08T18:15:21Z
- **Completed:** 2026-05-08T18:29:00Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Replaced STUB `signIn` callback with real `getCurrentUserContext` query — rejects 0-membership non-staff, allows staff + members, fails closed on DB error
- Added `jwt` callback to re-query `getCurrentUserContext` on first sign-in, sets `token.isStaff`; `session` callback exposes `session.user.isStaff`
- Created `src/types/next-auth.d.ts` TypeScript module augmentation declaring `Session.user.isStaff` and `JWT.isStaff`
- Created `src/lib/session.ts` with `getPortalSession()` server-side helper
- Created `src/components/StaffCallout.tsx` amber banner server component (renders only when `session.user.isStaff === true`, links to `https://admin.triarch.dev/admin`)
- Wired `<StaffCallout />` above `{children}` in `src/app/layout.tsx`

## Task Commits

Note: squash-merged into a single PR commit on main.

1. **Task 1: real signIn + jwt/session enrichment + type augmentation** — `dd8976c` (feat)
2. **Task 2: StaffCallout + layout integration** — `b339cad` (feat)
3. **Version bump v0.1.4** — `c114ea2` (chore)

**Squash merge on main:** `5fbceb9` (PR #3)

## signIn Allow/Reject Matrix

| Condition | Result |
|-----------|--------|
| Empty email | reject (false) |
| getCurrentUserContext returns null (DB error) | reject (false) — fail closed |
| ctx.isStaff === true | allow (true) — StaffCallout shown |
| ctx.memberships.length > 0 | allow (true) — no callout |
| 0 memberships AND not staff | reject (false) — back to /login |

## Files Created/Modified

- `src/lib/auth.ts` — Real signIn callback + jwt/session enrichment for isStaff; replaces 18-02 STUB
- `src/types/next-auth.d.ts` — Module augmentation: `Session.user.isStaff?: boolean`, `JWT.isStaff?: boolean`
- `src/lib/session.ts` — `getPortalSession()` server-side helper wrapping `getServerSession(authOptions)`
- `src/components/StaffCallout.tsx` — Async server component; renders amber banner with admin link only when `session.user.isStaff === true`
- `src/app/layout.tsx` — Imports and renders `<StaffCallout />` above `{children}` inside `<body>`
- `package.json` — Version bumped v0.1.3 → v0.1.4

## Decisions Made

- **Fail closed on null ctx:** Portal has no `@triarchsecurity.com` fallback allowlist (unlike admin which had a rollout bridge). DB error → reject is the correct default for a customer portal.
- **jwt re-queries DB for isStaff:** The `user` object in the jwt callback only has what Google returns. Re-querying `getCurrentUserContext` on `account && user?.email` ensures the isStaff flag reflects the actual DB state, not an OAuth claim.
- **getPortalSession() helper:** Wraps `getServerSession(authOptions)` centrally so future server components can import from one place (avoids spreading `authOptions` import everywhere).
- **Comment-only .sub reference in auth.ts:** The `token.sub for permission decisions.` comment in the JSDoc block documents the AUTH-06 invariant. It is not a code reference to `.sub`. The 18-05 Vitest grep-test will target actual source logic, not comments.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all AUTH-03 and AUTH-04 logic is fully wired. The `signIn` STUB from 18-02 has been replaced.

## Issues Encountered

None.

## Invariant Verification

- `grep -E "domain:" src/lib/auth.ts` → no matches in code (only comment `// NO domain field`) — Pitfall 1 preserved
- `grep -E "\.sub\b" src/lib/auth.ts` → 1 comment-only match (`token.sub for permission decisions.`) — AUTH-06 preserved; no code logic uses `.sub`
- `grep "getCurrentUserContext" src/lib/auth.ts` → 7 matches (1 import + 2 callback usages + 4 in JSDoc comments)
- `grep "isStaff" src/types/next-auth.d.ts` → 2 matches (Session.user + JWT interfaces)
- `npx next build` → exits 0
- `npx vitest run` → exits 0 (no test files yet; 18-05 adds cookie/sub grep tests)

## HUMAN-UAT (Deferred to OPS-04)

Live OAuth round-trip verification is deferred until OPS-04 (Console add for OAuth redirect URIs) is complete:
- [ ] 0-membership user signs in → rejected, returned to /login
- [ ] Staff user signs in → authenticated, sees amber "Switch to admin.triarch.dev" callout banner site-wide
- [ ] Customer admin/viewer user signs in → authenticated, no callout visible

## Next Phase Readiness

- AUTH-03 and AUTH-04 fully satisfied
- AUTH-05 (post-login routing: 0-memberships → /no-memberships, 1 → auto-redirect, 2+ → /projects) is handled by 18-04
- AUTH-05 `signIn` is already rejecting 0-membership users; 18-04 wires up the /no-memberships empty state for users who might navigate there directly
- AUTH-06 grep-test and AUTH-07 post-login routing land in 18-04/18-05
- No blockers for 18-04

---
*Phase: 18-portal-auth-scaffolding*
*Completed: 2026-05-08*
