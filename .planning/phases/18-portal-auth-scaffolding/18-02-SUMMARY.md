---
phase: 18-portal-auth-scaffolding
plan: "02"
subsystem: auth
tags: [next-auth, jwt, cookies, google-oauth, host-only, portal]

# Dependency graph
requires:
  - phase: 18-01-portal-scaffold
    provides: Next.js portal app skeleton with package.json, next.config.ts, tsconfig.json, vitest config

provides:
  - NextAuth v4 config (src/lib/auth.ts) with __Host- cookie prefix, no domain attribute, STUB signIn callback
  - NextAuth route handler at /api/auth/[...nextauth]
  - Customer-facing /login page with Google sign-in button
  - portal version 0.1.3 on main (PR #2 merged)

affects:
  - 18-03 (signIn callback membership rule wires into this STUB)
  - 18-04 (post-login routing reads session set by this auth config)
  - 18-05 (vitest grep-test for .sub absence guards this file)

# Tech tracking
tech-stack:
  added: []  # next-auth already in package.json from 18-01
  patterns:
    - "NextAuth v4 authOptions pattern with named export for use in route handler + server-side helpers"
    - "__Host- cookie prefix in production with NO domain attribute (host-only, Pitfall 1 guard)"
    - "Separate PORTAL_NEXTAUTH_SECRET binding prevents JWT cross-replay between admin and portal"
    - "STUB signIn callback pattern: Boolean(email) placeholder, TODO comment referencing 18-03"

key-files:
  created:
    - src/lib/auth.ts
    - "src/app/api/auth/[...nextauth]/route.ts"
    - src/app/login/page.tsx
  modified:
    - package.json (version 0.1.0 → 0.1.3)

key-decisions:
  - "signIn callback STUBbed as Boolean(email) — full membership enforcement deferred to 18-03 by plan design"
  - "Comment text 'token.sub' in JSDoc reworded to 'OIDC subject claim' to avoid false positive in 18-05 grep-test"
  - "callbackUrl in login page set to '/' (portal root) — post-login routing logic lives in 18-04"
  - "No refresh token plumbing in portal auth — portal is read-mostly initially; refresh logic deferred to Phase 19+ if needed"

patterns-established:
  - "Portal NextAuth cookie block: sessionToken + csrfToken with __Host- prefix, callbackUrl with __Secure- prefix; NO domain field on any cookie"
  - "JWT session strategy with accessToken forwarded from account to token to session"

requirements-completed: [AUTH-01, AUTH-02]

# Metrics
duration: 12min
completed: 2026-05-08
---

# Phase 18 Plan 02: Portal Auth Scaffolding (NextAuth Core) Summary

**NextAuth v4 wired into portal with `__Host-` host-only cookies, distinct PORTAL_NEXTAUTH_SECRET, Google OAuth provider, and customer-facing /login page; signIn callback intentionally STUBbed for 18-03 handoff**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-05-08T18:00:14Z
- **Completed:** 2026-05-08T18:12:44Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Created `src/lib/auth.ts` with NextAuth v4 config: Google OAuth, JWT strategy, `__Host-` cookie prefix in production, NO `domain` attribute (AUTH-01), `process.env.NEXTAUTH_SECRET` binding (AUTH-02)
- Created `src/app/api/auth/[...nextauth]/route.ts` mounting NextAuth at the canonical App Router path
- Created `src/app/login/page.tsx` customer-facing login page with "Customer Portal" branding and Google sign-in button
- `npx next build` exits 0; `npx vitest run` exits 0; PR #2 merged to main at `a184e21`
- portal version bumped to 0.1.3 in package.json

## Task Commits

Each task was committed atomically:

1. **Task 1: Create portal NextAuth config (src/lib/auth.ts)** - `529c4db` (feat)
2. **Task 2: Create NextAuth route handler + login page** - `754b368` (feat) — includes version bump + route.ts + login page

**PR #2 merged to main:** `a184e21` (squash merge — feat(18-02) NextAuth v4 core)

## Files Created/Modified
- `src/lib/auth.ts` — NextAuth v4 authOptions: Google provider, JWT session, host-only cookies, STUB signIn callback
- `src/app/api/auth/[...nextauth]/route.ts` — App Router NextAuth handler exporting GET + POST
- `src/app/login/page.tsx` — Customer-facing login page, "Customer Portal" brand, signIn('google', { callbackUrl: '/' })
- `package.json` — version bumped from 0.1.0 → 0.1.3

## Decisions Made
- **STUB signIn callback**: By plan design, `signIn` returns `Boolean(email)` (allow any authenticated email). Full customer-membership + staff-flag enforcement deferred to 18-03.
- **JSDoc wording**: Comment text reworded from "NEVER reference token.sub" to "NEVER key on the OIDC subject claim" to avoid false positive in the 18-05 grep-test that scans for `.sub` references.
- **callbackUrl='/'**: Post-login routing (0/1/2+ memberships → different destinations) lives in 18-04; login page sends to `/` as neutral landing.
- **No refresh token plumbing**: Portal is read-mostly initially; refresh token rotation deferred to Phase 19+ if needed (admin already has it, but portal doesn't need it now).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] JSDoc comment text triggered .sub grep-test false positive**
- **Found during:** Task 1 verification
- **Issue:** The JSDoc comment "NEVER reference token.sub for permission decisions" contained the substring `.sub` which the plan's own verification `grep -E "\.sub\b"` would match
- **Fix:** Rewrote comment to "NEVER key on the OIDC subject claim for permission decisions" — identical documentation intent, no grep hit
- **Files modified:** src/lib/auth.ts (comment only)
- **Verification:** `grep -E "\.sub\b" src/lib/auth.ts` returns empty
- **Committed in:** `529c4db` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - comment text false positive)
**Impact on plan:** Zero scope creep. Fix was a comment reword only; no behavioral change.

## Issues Encountered
- Remote branch `feat/nextauth-core` showed in `git branch -a` after merge (stale remote tracking ref). `git push origin --delete feat/nextauth-core` returned "remote ref does not exist" — GitHub had already deleted it during the PR merge. No action required.

## Build Verification

```
npx next build — exit 0
Route (app)
  ○ /
  ○ /_not-found
  ƒ /api/auth/[...nextauth]
  ○ /login
```

```
npx vitest run — exit 0 (no test files yet — expected per plan)
```

## Invariants Confirmed

- `grep "__Host-next-auth.session-token" src/lib/auth.ts` — 1 match
- `grep -E "(domain:|\.sub\b)" src/lib/auth.ts` — empty (no Pitfall 1 or AUTH-06 violations)
- `grep "NextAuth(authOptions)" src/app/api/auth/[...nextauth]/route.ts` — match
- `grep "signIn('google'" src/app/login/page.tsx` — match
- `grep "Customer Portal" src/app/login/page.tsx` — match (NOT "Dev Console")

## Known Stubs

- `src/lib/auth.ts` line ~44: `signIn` callback returns `Boolean(email)` — placeholder stub pending 18-03 membership rule. This is **intentional by plan design**. 18-03 will replace it with `getCurrentUserContext` membership check.

## HUMAN-UAT Gated on OPS-04

Live OAuth round-trip (portal.triarch.dev/login → Google → callback → session cookie with `__Host-` prefix) cannot be verified until Mike adds portal redirect URIs in Google Cloud Console (OPS-04). Code is correct; verification deferred.

## User Setup Required

None — no new external service configuration required for this plan. OPS-04 (Console redirect URI add) was pre-identified as a human action gate, not a setup step for this plan.

## Next Phase Readiness
- 18-03 can now implement the full signIn callback by replacing the STUB in `src/lib/auth.ts` with `getCurrentUserContext` membership check
- `authOptions` is exported and ready for use in server-side `getServerSession` calls (18-04 routing)
- 18-05 grep-test is unblocked — `src/lib/auth.ts` contains zero `.sub` references

---
*Phase: 18-portal-auth-scaffolding*
*Completed: 2026-05-08*
