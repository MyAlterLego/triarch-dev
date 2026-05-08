---
phase: 18-portal-auth-scaffolding
verified: 2026-05-08T13:30:00Z
status: human_needed
score: 7/7 must-haves verified
human_verification:
  - test: "Visit https://portal.triarch.dev/login and click 'Sign in with Google'"
    expected: "Google OAuth consent screen appears; after sign-in with a customer account, session cookie is named __Host-next-auth.session-token with no Domain= attribute; user is routed correctly based on membership count"
    why_human: "Live OAuth round-trip requires OPS-04 (Mike's Console add of portal redirect URIs to the Google OAuth client) — gated on a human action"
  - test: "Sign in as a Triarch staff email; observe portal layout"
    expected: "Amber 'Switch to admin.triarch.dev' callout banner renders at top of page; link navigates to https://admin.triarch.dev/admin"
    why_human: "Conditional banner rendering depends on live session.user.isStaff=true, which requires a real OAuth sign-in"
  - test: "Sign in as a user with 0 project memberships"
    expected: "User is rejected at signIn callback and returned to /login (NextAuth error), OR if manually navigated to /, redirected to /no-memberships with 'Contact your project admin' copy"
    why_human: "Requires a real non-member Google account and live OAuth"
  - test: "Sign in as a user with exactly 1 membership"
    expected: "Redirected automatically to /projects/{projectKey}/releases (will 404 until Phase 21; the 404 confirms routing fired)"
    why_human: "Requires a real 1-membership customer account and live OAuth"
  - test: "Sign in as a user with 2+ memberships"
    expected: "Lands on /projects with a list of their project keys as links"
    why_human: "Requires a real multi-membership customer account and live OAuth"
  - test: "Confirm portal.triarch.dev returns HTTP 200 after first Firebase App Hosting deploy completes"
    expected: "200 OK from portal.triarch.dev; FAH deploy succeeded; DNS resolving correctly"
    why_human: "Firebase App Hosting deploy is gated on Mike adding FIREBASE_SA_KEY + ADMIN_API_TOKEN to triarch-portal GitHub Actions secrets"
---

# Phase 18: Portal Auth Scaffolding Verification Report

**Phase Goal:** Customer-only Google OAuth on portal with brand-isolated cookies and a staff "Switch to admin.triarch.dev" callout instead of a 401.
**Verified:** 2026-05-08T13:30:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #  | Truth                                                                                       | Status     | Evidence                                                                                  |
|----|---------------------------------------------------------------------------------------------|------------|-------------------------------------------------------------------------------------------|
| 1  | Portal has a deployable Next.js scaffold with required configs                              | VERIFIED   | `next build` exits 0; all 17 scaffold files present at portal/                           |
| 2  | Portal apphosting.yaml binds PORTAL_NEXTAUTH_SECRET to NEXTAUTH_SECRET env var             | VERIFIED   | `secret: PORTAL_NEXTAUTH_SECRET` in apphosting.yaml; no `domain` attribute set           |
| 3  | Portal NextAuth config uses __Host- cookie prefix in production with NO domain attribute   | VERIFIED   | auth.ts line: `__Host-next-auth.session-token`; grep confirms zero `domain:` references  |
| 4  | Portal uses a distinct NEXTAUTH_SECRET (PORTAL_NEXTAUTH_SECRET) from admin's secret        | VERIFIED   | apphosting.yaml secret binding is PORTAL_NEXTAUTH_SECRET; auth.ts reads process.env.NEXTAUTH_SECRET |
| 5  | signIn callback enforces customer-membership rule with staff bypass                         | VERIFIED   | getCurrentUserContext imported; rejects null ctx, 0-membership non-staff; allows staff and members |
| 6  | Staff users see "Switch to admin.triarch.dev" callout; customers do not                    | VERIFIED   | StaffCallout.tsx reads isStaff; returns null for non-staff; amber banner with admin link for staff |
| 7  | Post-login routing decision tree: unauth→/login, 0-mem→/no-memberships, 1-mem→auto-redirect, 2+→/projects | VERIFIED | All 4 redirect() branches present in page.tsx; no-memberships + projects pages exist |
| 8  | Vitest asserts __Host- prefix and no Domain= on session cookie (AUTH-05)                  | VERIFIED   | cookies.test.ts: 6 assertions; all 18 tests pass (`npx vitest run` 3 files, 18 tests)   |
| 9  | Vitest grep-test enforces no .sub claim in portal source (AUTH-06)                        | VERIFIED   | no-sub-claim.test.ts passes; comment-only .sub reference in auth.ts JSDoc correctly filtered |
| 10 | Live OAuth click-through and first FAH deploy                                              | HUMAN NEEDED | Gated on OPS-04 (Console redirect URI add) and GitHub Actions secrets for deploy         |

**Score:** 9/9 automated truths verified; 1 truth deferred to human action (not a code gap)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/lib/auth.ts` | NextAuth config with __Host- cookies, Google provider, signIn callback | VERIFIED | 140+ lines; getCurrentUserContext, isStaff, __Host- prefix, no domain:, no .sub in code |
| `src/app/api/auth/[...nextauth]/route.ts` | Route handler exporting GET + POST | VERIFIED | `export { handler as GET, handler as POST }` |
| `src/app/login/page.tsx` | Customer-facing login with Google sign-in button | VERIFIED | 'use client'; `signIn('google', { callbackUrl: '/' })`; "Customer Portal" copy |
| `src/types/next-auth.d.ts` | Module augmentation for isStaff on Session and JWT | VERIFIED | Declares `isStaff?: boolean` on both interfaces |
| `src/components/StaffCallout.tsx` | Server component conditionally rendering staff banner | VERIFIED | 40+ lines; `getPortalSession()`; returns null for non-staff; "Switch to admin.triarch.dev" link |
| `src/app/layout.tsx` | Root layout with StaffCallout above {children} | VERIFIED | Imports and renders `<StaffCallout />` |
| `src/lib/session.ts` | Server-side session helper | VERIFIED | `getPortalSession()` wrapping `getServerSession(authOptions)` |
| `src/app/page.tsx` | Post-login routing decision tree | VERIFIED | All 4 redirect() branches: /login, /no-memberships, /projects/{key}/releases, /projects |
| `src/app/no-memberships/page.tsx` | 0-membership empty state | VERIFIED | "Contact your project admin" copy; sign-out link; displays user email |
| `src/app/projects/page.tsx` | 2+ membership list | VERIFIED | getCurrentUserContext; filters wildcard '*' staff rows; lists project keys as links |
| `src/lib/auth.test.ts` | signIn callback unit tests | VERIFIED | 108 lines; 7 test cases covering all allow/reject paths; mocks getCurrentUserContext |
| `src/lib/cookies.test.ts` | Cookie shape assertions | VERIFIED | 76 lines; 6 assertions; __Host- prefix, no domain property |
| `src/lib/no-sub-claim.test.ts` | Grep-test for .sub references | VERIFIED | 53 lines; execSync grep; comment lines filtered; passes clean |
| `apphosting.yaml` | FAH env bindings including PORTAL_NEXTAUTH_SECRET | VERIFIED | NEXTAUTH_SECRET→PORTAL_NEXTAUTH_SECRET; NEXTAUTH_URL set to portal.triarch.dev |
| `.github/workflows/ci-cd.yml` | CI/CD targeting portal-prod via shared-workflows@v4 | VERIFIED | `app_hosting_backend: portal-prod`; `deploy-firebase.yml@v4` |
| `next.config.ts` | transpilePackages for shared packages | VERIFIED | Both @myalterlego/shared-ui and @myalterlego/triarch-shared present |
| `package.json` | triarch-portal v0.2.0, no db:push/db:generate | VERIFIED | name: triarch-portal, version: 0.2.0 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `apphosting.yaml` | Firebase secret PORTAL_NEXTAUTH_SECRET | `secret: PORTAL_NEXTAUTH_SECRET` binding | WIRED | Confirmed; maps NEXTAUTH_SECRET env var to the portal-specific secret |
| `src/lib/auth.ts` | process.env.NEXTAUTH_SECRET | `secret: process.env.NEXTAUTH_SECRET` field | WIRED | Present in authOptions; indirectly bound to PORTAL_NEXTAUTH_SECRET |
| `src/lib/auth.ts` | `__Host-next-auth.session-token` cookie (no Domain=) | cookies block options omit domain field | WIRED | Confirmed by grep and cookies.test.ts assertions |
| `src/lib/auth.ts` | `@myalterlego/triarch-shared/auth` getCurrentUserContext | signIn callback and jwt callback | WIRED | Two usages in auth.ts; properly imported |
| `src/app/layout.tsx` | StaffCallout | `<StaffCallout />` rendered above {children} | WIRED | Import and JSX usage both present |
| `src/components/StaffCallout.tsx` | session.user.isStaff | `getPortalSession()` → `session?.user?.isStaff` check | WIRED | Reads isStaff; returns null for false; renders amber banner for true |
| `src/app/page.tsx` | Post-login routing | `redirect()` calls to /login, /no-memberships, /projects/{key}/releases, /projects | WIRED | All 4 branches present; getCurrentUserContext call present |
| `.github/workflows/ci-cd.yml` | Firebase App Hosting backend portal-prod | `deploy-firebase.yml@v4` with `app_hosting_backend: portal-prod` | WIRED | Both deploy and notify jobs reference portal-prod |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| AUTH-01 | 18-01, 18-02 | __Host- cookie prefix in production, NO domain attribute | SATISFIED | auth.ts has __Host- names; no domain: in cookies options; cookies.test.ts asserts both |
| AUTH-02 | 18-01, 18-02 | PORTAL_NEXTAUTH_SECRET distinct from admin | SATISFIED | apphosting.yaml binds PORTAL_NEXTAUTH_SECRET; auth.ts uses process.env.NEXTAUTH_SECRET |
| AUTH-03 | 18-03 | signIn enforces membership rule; staff bypass | SATISFIED | getCurrentUserContext used; 0-mem+non-staff rejected; staff allowed; auth.test.ts verifies |
| AUTH-04 | 18-03 | Staff see "Switch to admin.triarch.dev" callout | SATISFIED | StaffCallout.tsx renders conditionally; wired in layout.tsx |
| AUTH-05 | 18-05 | Vitest asserts Set-Cookie __Host- prefix + no Domain= | SATISFIED | cookies.test.ts: 6 assertions; all 18 tests GREEN |
| AUTH-06 | 18-05 | Vitest grep-test: no .sub claim in source | SATISFIED | no-sub-claim.test.ts passes; comment reference in JSDoc correctly filtered |
| AUTH-07 | 18-04 | Login wall + post-login routing (0/1/2+ memberships) | SATISFIED | page.tsx has all 4 redirect branches; no-memberships and projects pages exist |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/lib/auth.ts` | 24 | `* token.sub for permission decisions.` | Info | JSDoc comment documenting the AUTH-06 invariant — not a code violation; no-sub-claim test correctly filters comment lines |

No blockers or warnings found. The single info-level item is intentional documentation of the prohibition.

### Human Verification Required

#### 1. Live OAuth Round-Trip

**Test:** Navigate to `https://portal.triarch.dev/login` and click "Sign in with Google" using a customer account.
**Expected:** Google OAuth consent screen appears; after consent, session cookie is set with name `__Host-next-auth.session-token` and no `Domain=` attribute; user is routed based on membership count (0 → /no-memberships, 1 → /projects/{key}/releases, 2+ → /projects).
**Why human:** Gated on OPS-04 — Mike must first add the portal redirect URI to the Google OAuth client in the Google Cloud Console before any OAuth callback will succeed.

#### 2. Staff Callout Banner Visibility

**Test:** Sign in to portal using a Triarch staff email (a `project_members` row with `project_key='*'` and `role='staff'`).
**Expected:** The amber banner at the top of the page reads "You are signed in as Triarch staff. Customer features are read-only here — use the admin console for full access." with a "Switch to admin.triarch.dev →" link to `https://admin.triarch.dev/admin`. Customer accounts must NOT see this banner.
**Why human:** Session.user.isStaff is populated from a live DB query via getCurrentUserContext; requires real sign-in against production DB.

#### 3. 0-Membership Rejection

**Test:** Attempt to sign in with a Google account that has no `project_members` row in the DB.
**Expected:** NextAuth rejects the sign-in (returns false from signIn callback); user is returned to `/login` with an error, OR if the user force-navigates to `/`, they are redirected to `/no-memberships`.
**Why human:** Requires a real non-member Google account and live OAuth.

#### 4. 1-Membership Auto-Redirect

**Test:** Sign in as a user with exactly one project membership.
**Expected:** After OAuth completes, root page (`/`) redirects to `/projects/{projectKey}/releases`. This will 404 until Phase 21 ships the releases page — the 404 confirms routing fired correctly.
**Why human:** Requires a real single-membership customer account.

#### 5. 2+ Membership List

**Test:** Sign in as a user with two or more project memberships.
**Expected:** Lands on `/projects` with a list of their project names as clickable links to `/projects/{key}/releases`.
**Why human:** Requires a real multi-membership customer account.

#### 6. Portal.triarch.dev First Deploy

**Test:** Confirm `https://portal.triarch.dev` returns HTTP 200 after the first successful FAH deploy.
**Expected:** Firebase App Hosting serves the portal app; Triarch branding visible; no 404 or 502.
**Why human:** Deploy is gated on Mike adding `FIREBASE_SA_KEY` and `ADMIN_API_TOKEN` to the `MyAlterLego/triarch-portal` GitHub Actions secrets.

### Build and Test Summary

- `npx vitest run` result: **3 test files, 18 tests — all passed** (638ms)
- `npx next build` result: **exits 0** — routes compiled: /, /api/auth/[...nextauth], /login, /no-memberships, /projects
- Portal version: **0.2.0**
- PRs merged to portal/main: **5** (PRs #1–#5 covering plans 18-01 through 18-05)
- REQUIREMENTS.md: all AUTH-01..AUTH-07 marked [x] complete

### Human-Action Deferred Items (Not Code Gaps)

The following items are blocked on human actions, not on code deficiencies:

1. **OPS-04** (Mike): Add `https://portal.triarch.dev/api/auth/callback/google` to the Google OAuth client's authorized redirect URIs in Google Cloud Console. Required before any live OAuth sign-in attempt.
2. **GitHub Secrets** (Mike): Add `FIREBASE_SA_KEY` and `ADMIN_API_TOKEN` to `MyAlterLego/triarch-portal` repository secrets. Required for the CI/CD deploy workflow to successfully publish to Firebase App Hosting.

Once both human actions are completed, the six human-verification tests above can be executed to confirm end-to-end behavior.

---

_Verified: 2026-05-08T13:30:00Z_
_Verifier: Claude (gsd-verifier)_
