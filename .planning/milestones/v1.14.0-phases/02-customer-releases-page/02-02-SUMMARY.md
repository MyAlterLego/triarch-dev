---
phase: 02-customer-releases-page
plan: 02
subsystem: customer-ui
tags: [nextjs, layout, server-component, auth, drizzle, membership-guard, route-shell]

# Dependency graph
requires:
  - phase: 02-01
    provides: "releaseLogsRelations, releaseFeedbackRelations, releaseApprovalsRelations in schema.ts"
provides:
  - "ProjectsLayout at src/app/projects/layout.tsx — session guard + customer page chrome"
  - "CustomerHeader at src/app/projects/CustomerHeader.tsx — Triarch wordmark + sign-out"
  - "/projects/[slug]/releases route (server component) — membership-gated, 404-no-leak"
  - "Shared types in src/app/projects/[slug]/releases/types.ts — ReleaseRow, FeedbackItem, ApprovalItem, UserRole"
  - "Placeholder ReleasesClient.tsx — unblocks Plan 05 development"
affects:
  - 02-03  # feedback API routes reference types.ts UserRole
  - 02-04  # approve/reject API routes reference types.ts ApprovalItem
  - 02-05  # ReleasesClient.tsx is replaced by Plan 05 with full production component

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "ProjectsLayout as server component: getServerSession + redirect('/login') for unauthenticated"
    - "CustomerHeader as client component: signOut from next-auth/react with callbackUrl='/login'"
    - "Server page: project lookup by slug=projects.key, then membership 404-no-leak before any data fetch"
    - "Drizzle relational query: db.query.releaseLogs.findMany({ with: { feedback, approvals } })"
    - "coalesce(deployedAt, releasedAt) DESC sort for legacy-compatible ordering"
    - "+1 fetch pattern for hasMore pagination without separate count query"

key-files:
  created:
    - src/app/projects/layout.tsx
    - src/app/projects/CustomerHeader.tsx
    - src/app/projects/[slug]/releases/page.tsx
    - src/app/projects/[slug]/releases/types.ts
    - src/app/projects/[slug]/releases/ReleasesClient.tsx
  modified: []

key-decisions:
  - "CustomerHeader is a client component (not server) — requires signOut from next-auth/react which is client-only"
  - "CustomerHeader rendered inside page.tsx (not in layout.tsx) — header needs projectName which is a per-page concern"
  - "notFound() called twice: once for missing project, once for non-member — both return same 404 (no info leak)"
  - "userRole maps staff + membership.role=admin → admin; viewer membership → viewer"

# Metrics
duration: 2min
completed: 2026-05-04
---

# Phase 02 Plan 02: Customer Releases Page — Route Shell Summary

**Customer-only layout, CustomerHeader, and server-component releases page with membership-enforced 404-no-leak gate (GATE-01) and Drizzle relational fetch with feedback + approvals join**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-05-04T02:01:31Z
- **Completed:** 2026-05-04T02:03:35Z
- **Tasks:** 2
- **Files created:** 5

## Accomplishments

- Created `src/app/projects/layout.tsx` — thin server layout; session guard redirects unauthenticated users to `/login`; no AdminSidebar, no DynamicSidebar — outside `/admin/*` shell per UI-SPEC lines 159-219
- Created `src/app/projects/CustomerHeader.tsx` — client component; renders `Triarch Dev · {projectName}` wordmark (text-only, no logo), sign-out button with `callbackUrl='/login'`; matches UI-SPEC lines 197-214 exactly; no `--accent-gold` token
- Created `src/app/projects/[slug]/releases/types.ts` — shared TypeScript types: `ReleaseRow`, `FeedbackItem`, `ApprovalItem`, `UserRole`, `ReleaseStatus`, `ReleaseEnv`; consumed by Plans 03/04/05
- Created `src/app/projects/[slug]/releases/page.tsx` — server component; looks up project by `slug = projects.key`; calls `notFound()` for missing projects AND non-members (GATE-01 404-no-leak); Drizzle relational query with `{ feedback, approvals }` join; `coalesce(deployedAt, releasedAt) DESC` sort; +1 fetch for `hasMore`; serialises all Date objects to ISO strings before passing to client
- Created `src/app/projects/[slug]/releases/ReleasesClient.tsx` — placeholder client component matching the Props interface Plan 05 expects; renders project name + release count in `<pre>`

## Task Commits

1. **Task 1: Customer layout + header** — `3b211bc` (feat)
2. **Task 2: Releases page server component + types + placeholder client** — `794643f` (feat)

## Files Created/Modified

- `src/app/projects/layout.tsx` — session guard + customer page chrome (bg-zinc-950 full-screen flex-col)
- `src/app/projects/CustomerHeader.tsx` — client component, h-14 header matching UI-SPEC spec
- `src/app/projects/[slug]/releases/page.tsx` — server component, project lookup, membership guard, release list fetch
- `src/app/projects/[slug]/releases/types.ts` — shared TS types for the full Phase 2 surface
- `src/app/projects/[slug]/releases/ReleasesClient.tsx` — placeholder (Plan 05 replaces)

## Decisions Made

- **CustomerHeader is a client component:** `signOut` from `next-auth/react` is client-only; no way to call it in a server component. Header receives `projectName` as a prop from `page.tsx`.
- **Header in page.tsx, not layout.tsx:** `projectName` is derived from the DB lookup inside the server page component. Placing the header in the layout would require a server-action approach or additional DB lookup in the layout — both are more complex than the correct pattern (header in page).
- **Both `notFound()` paths use the same call:** Missing project and non-member both call `notFound()`. This ensures the 404 response is indistinguishable regardless of whether the project key exists — per GATE-01 "does not leak project existence".
- **`userRole` derived server-side:** `isStaff || membership.role === 'admin'` → `'admin'`; otherwise `'viewer'`. Passed to client so action buttons can gate without client-side auth calls.

## Membership Check Pattern (404-no-leak)

```typescript
// Look up project by slug = projects.key
const [project] = await db.select(...).from(projects).where(eq(projects.key, slug));
if (!project) notFound();  // project doesn't exist → 404

// Membership check: 404 to non-members (no project-existence leak per GATE-01)
const membership = ctx?.memberships.find((m) => m.project_key === project.key);
const isMember = !!ctx && (ctx.isStaff || !!membership);
if (!isMember) notFound();  // non-member → same 404 as missing project
```

Both paths call `notFound()` identically. A non-member cannot distinguish between "project doesn't exist" and "project exists but you're not a member". This mirrors the API pattern from `src/app/api/platform/release-logs/[id]/route.ts` lines 23-28, adapted for server components (using `notFound()` instead of `NextResponse.json(404)`).

## Notes for Plan 05

`ReleasesClient.tsx` is a placeholder — Plan 05 replaces it entirely with the full interactive table. The Props interface is stable:

```typescript
interface Props {
  projectSlug: string;
  projectName: string;
  userRole: UserRole;
  currentUserEmail: string;
  initialReleases: ReleaseRow[];
  total: number;
  hasMore: boolean;
  pageSize: number;
}
```

Import shared types from `./types` (same directory).

## Notes for Plans 03/04

Import shared types from `src/app/projects/[slug]/releases/types`:

```typescript
import type { ReleaseRow, ApprovalItem, FeedbackItem, UserRole } from '@/app/projects/[slug]/releases/types';
```

Or use relative paths from within the same route tree.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

- `ReleasesClient.tsx` is intentionally a placeholder. It renders `userRole` and `count` as a `<pre>` block. Plan 05 owns the production replacement. This is documented as required output in the PLAN.md — not an accidental stub.

## Self-Check: PASSED

All files found. Both commits verified in git log.
