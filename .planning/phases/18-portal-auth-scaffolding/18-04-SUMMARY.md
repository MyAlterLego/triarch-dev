---
phase: 18-portal-auth-scaffolding
plan: 04
subsystem: auth
tags: [nextauth, routing, next.js, portal, server-components]

# Dependency graph
requires:
  - phase: 18-portal-auth-scaffolding
    plan: 03
    provides: getPortalSession, StaffCallout banner, session.user.isStaff
provides:
  - "AUTH-07: Post-login routing decision tree (unauth/0/1/2+ memberships) in src/app/page.tsx"
  - "/no-memberships empty-state page with Contact-your-admin copy"
  - "/projects minimal stub list for 2+ membership users"
affects:
  - "Phase 21 (PORTAL-02) — replaces /projects stub with full pipeline-summary tile UI"
  - "OPS-04 — HUMAN-UAT depends on live OAuth being configured for 4-way routing validation"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Server component routing decision tree via redirect() in async page.tsx"
    - "Membership-count routing: 0→empty-state, 1→auto-redirect, 2+→list"
    - "project_key snake_case from UserContext (not camelCase)"

key-files:
  created:
    - "portal/src/app/no-memberships/page.tsx"
    - "portal/src/app/projects/page.tsx"
  modified:
    - "portal/src/app/page.tsx"
    - "portal/package.json"

key-decisions:
  - "Staff users with 0 memberships route to /no-memberships (not a separate staff landing) — StaffCallout banner handles guidance site-wide"
  - "Null ctx from getCurrentUserContext treated as 0-membership (redirect to /no-memberships as safe fallback)"
  - "/projects/[slug]/releases intentionally absent — Phase 21 ships it; 1-membership users see 404 in HUMAN-UAT (confirms routing fired)"
  - "project_key field is snake_case in actual UserContext type (plan doc was wrong with camelCase projectKey)"

patterns-established:
  - "Server routing pattern: getPortalSession → check email → getCurrentUserContext → redirect by memberships.length"
  - "/projects page has own auth guard (redirects to /login and /no-memberships) for direct navigation safety"

requirements-completed: [AUTH-07]

# Metrics
duration: 15min
completed: 2026-05-08
---

# Phase 18 Plan 04: Post-Login Routing Decision Tree Summary

**Four-way post-login routing decision tree (unauth/0/1/2+ memberships) with /no-memberships empty-state and /projects stub list, closing AUTH-07**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-05-08T18:15:00Z
- **Completed:** 2026-05-08T18:30:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Replaced placeholder `src/app/page.tsx` with server component implementing the four-way routing tree (unauth → /login, 0 memberships → /no-memberships, 1 membership → /projects/{key}/releases, 2+ → /projects)
- Created `/no-memberships` empty-state page showing signed-in email, "Contact your project admin" copy, and a sign-out link
- Created `/projects` minimal stub list page filtering out wildcard staff rows (project_key='*') and linking each project to its releases page
- Portal build remains green (6 routes, all server-rendered on demand); 9 vitest tests pass; v0.1.5 merged to main

## Task Commits

1. **Task 1 + Task 2: Routing tree + route stubs** - `71a1f10` (feat) — portal/src/app/page.tsx, no-memberships/page.tsx, projects/page.tsx, package.json
2. **PR #4 merge to main** - `4e32c00`

## Files Created/Modified
- `portal/src/app/page.tsx` — Post-login routing decision tree server component
- `portal/src/app/no-memberships/page.tsx` — Empty-state page for 0-membership users
- `portal/src/app/projects/page.tsx` — Minimal stub list for 2+ membership users (Phase 21 replaces)
- `portal/package.json` — Bumped to v0.1.5

## Decisions Made
- **Staff → /no-memberships:** Staff users with 0 memberships see the same empty-state page; StaffCallout banner (from 18-03) already directs them to admin.triarch.dev. Separate staff landing is post-v2.2 polish.
- **Null ctx fallback:** `getCurrentUserContext` returning null redirects to /no-memberships as the safe fallback (signIn callback already rejects null, but transient DB errors can cause null after JWT hydration).
- **Phase 21 placeholder:** `/projects` is a stub; full pipeline-summary tile UI ships in Phase 21 (PORTAL-02).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed camelCase vs snake_case field name in UserContext.memberships**
- **Found during:** Task 1 (page.tsx routing tree) — TypeScript build error
- **Issue:** Plan interface doc specified `projectKey` (camelCase) but actual `@myalterlego/triarch-shared` `UserContext` type declares `project_key` (snake_case). Build failed with: `Property 'projectKey' does not exist on type '{ project_key: string; ... }'`
- **Fix:** Changed all references from `m.projectKey` → `m.project_key` in page.tsx and projects/page.tsx
- **Files modified:** src/app/page.tsx, src/app/projects/page.tsx
- **Verification:** `npx next build` exits 0 after fix
- **Committed in:** 71a1f10 (combined task commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug)
**Impact on plan:** Fix required for correctness. No scope creep.

## Issues Encountered
- The commit initially landed on `feat/auth-tests` (the parallel 18-05 branch) because that was the active branch before checkout. Cherry-picked `ebaef62` to `feat/post-login-routing` and pushed. PR #4 created and merged cleanly.

## User Setup Required
None — HUMAN-UAT deferred to OPS-04 (Mike must add portal OAuth redirect URIs to Google Console). Once OPS-04 lands, the four-way routing tree can be exercised end-to-end:
- 0-membership user → /no-memberships page
- 1-membership user → /projects/{key}/releases (404 until Phase 21 — confirms routing fired)
- 2+ membership user → /projects list

## Next Phase Readiness
- AUTH-07 satisfied; portal routing surface is complete for Phase 18
- Phase 21 (PORTAL-02) can replace `/projects` stub with full getProjectPipelineSummaries tile UI
- OPS-04 HUMAN-UAT unblocked once OAuth redirect URIs are configured

---
*Phase: 18-portal-auth-scaffolding*
*Completed: 2026-05-08*
