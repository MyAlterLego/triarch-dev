---
phase: 12-bug-and-feature-detail-pages
plan: "03"
subsystem: ui
tags: [next16, server-component, drizzle, tailwind, release-history, feature-requests, sidebar, link-wrap]

requires:
  - phase: 12-01
    provides: getReleaseHistoryForFeature function + ReleaseHistoryRow type
  - phase: 12-02
    provides: ReleasedInSidebar shared server component

provides:
  - /admin/modules/feature-requests/[id]: Feature detail page with two-column layout + released-in sidebar
  - Feature list row titles: Link to detail page (LINK-06 navigation affordance)

affects:
  - src/app/admin/modules/feature-requests/page.tsx (Link affordance added)

tech-stack:
  added: []
  patterns:
    - Next 16 async params: params Promise<{ id: string }> destructured after auth guard
    - Server component with parallel Promise.all fetch (feature row + release history)
    - notFound() pattern for missing row (matches pipeline page)
    - Staff guard at page level (layout only validates session, not role)
    - stopPropagation on Link inside button — prevents expand toggle on title click
    - jsonb null check with != null guard (not truthy check) — avoids unknown ReactNode error

key-files:
  created:
    - src/app/admin/modules/feature-requests/[id]/page.tsx
  modified:
    - src/app/admin/modules/feature-requests/page.tsx

key-decisions:
  - "ReleasedInSidebar imported from @/components/ReleasedInSidebar unchanged — zero modifications; 12-02 designed it as a shared component with zero bug-specific logic"
  - "buildPlan rendered as JSON.stringify(...as Record<string,unknown>) in pre block — matches list-page expanded view aesthetic"
  - "jsonb null check uses feat.buildPlan != null (not truthy) to avoid 'unknown not assignable to ReactNode' TypeScript error (Drizzle jsonb infers unknown)"
  - "targetVersion + shippedVersion rendered inline in same flex row when either is set — parallel display mirrors bug fixVersion pattern"
  - "LINK-05 (bug detail) + LINK-06 (feature detail) are both now satisfied — Phase 12 complete"

metrics:
  duration: "3 min"
  started: "2026-05-08T05:40:35Z"
  completed: "2026-05-08T05:43:16Z"
  tasks: 2
  files: 2
---

# Phase 12 Plan 03: Feature Detail Page + List Link Wrap Summary

**Feature detail page at /admin/modules/feature-requests/[id] with staff auth, two-column layout, and ReleasedInSidebar (reused from 12-02) wired to getReleaseHistoryForFeature; feature list row titles now Link to detail page — closes LINK-06 and completes Phase 12**

## Performance

- **Duration:** 3 min
- **Started:** 2026-05-08T05:40:35Z
- **Completed:** 2026-05-08T05:43:16Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- `src/app/admin/modules/feature-requests/[id]/page.tsx` — 213-line server component. Staff guard via `ctx?.isStaff` + `redirect('/login')` (matches 12-02 bug detail pattern). Next 16 async params destructured after auth. `Promise.all([featRows, getReleaseHistoryForFeature(id)])` parallel fetch. `notFound()` for missing feature id. Two-column grid (`lg:grid-cols-3`): main article (col-span-2) with title, status/priority/effort pills, upvotes count, project link to pipeline, requester info, description, useCase (optional), buildPlan (pre block, optional), targetVersion + shippedVersion inline (optional), triarchNotes block (optional). Sidebar (col-span-1): `<ReleasedInSidebar releaseHistory={history} />` — zero modifications to that file.

- `src/app/admin/modules/feature-requests/page.tsx` — Title span converted to `<Link href={'/admin/modules/feature-requests/${feat.id}'} onClick={(e) => e.stopPropagation()}>`. Expand button preserved. `hover:text-violet-300` affordance on title hover.

## Layout Decisions

- Two-column grid: `grid-cols-1 lg:grid-cols-3` — main `lg:col-span-2`, sidebar `lg:col-span-1`. Mobile: stacks vertically.
- Main content card: `rounded-lg bg-zinc-900 border border-zinc-800 p-6` — matches existing card pattern from 12-02.
- Sidebar: `ReleasedInSidebar` renders its own `aside.rounded-lg.bg-zinc-900.border.border-zinc-800.p-4` — wrapped in plain `div.lg:col-span-1`.
- Breadcrumb: `← Feature requests` links to `/admin/modules/feature-requests`.

## ReleasedInSidebar — Reused Unchanged from 12-02

The component was imported from `@/components/ReleasedInSidebar` without any modification. The 12-02 SUMMARY explicitly noted it was designed as a zero-bug-specific shared component. This plan confirms that — no fork, no change.

```typescript
import { ReleasedInSidebar } from '@/components/ReleasedInSidebar';
// ...
<ReleasedInSidebar releaseHistory={history} />
```

## Feature-Specific Rendering Decisions

- **buildPlan:** Rendered as `<pre>JSON.stringify(feat.buildPlan as Record<string,unknown>, null, 2)</pre>` — matches list-page expanded panel aesthetics. Used `!= null` check (not truthy) to avoid Drizzle jsonb `unknown` → ReactNode TypeScript error.
- **Version display:** `targetVersion` and `shippedVersion` render inline in the same flex row when either is set. Both show in `font-mono text-violet-300` matching bug detail's `fixVersion` style.
- **Upvotes:** Rendered as a pill in the pills row — only visible when `upvotes > 0`.
- **estimatedEffort:** Rendered as a colored pill (EFFORT_COLORS — small/medium/large/epic) in pills row.
- **STATUS_COLORS + EFFORT_COLORS:** Copied inline from feature list page (same approach 12-02 took with bug tokens; no shared util yet).

## Phase 12 Completion: LINK-05 + LINK-06 Both Satisfied

- **LINK-05** (bug detail page with Released In sidebar): Delivered by 12-02. `/admin/modules/bug-reports/[id]` exists with `ReleasedInSidebar` wired to `getReleaseHistoryForBug`.
- **LINK-06** (feature detail page with Released In sidebar): Delivered by this plan. `/admin/modules/feature-requests/[id]` exists with `ReleasedInSidebar` wired to `getReleaseHistoryForFeature`.
- **Phase 12** is now fully complete. Both list pages have Link affordances on row titles navigating to their respective detail pages.

## Task Commits

1. **Task 1: Feature detail page at /admin/modules/feature-requests/[id]** — `1476c99` (feat)
2. **Task 2: Add Link from feature list page row title to detail page** — `00ce176` (feat)

## Files Created/Modified

- `src/app/admin/modules/feature-requests/[id]/page.tsx` — 213 lines, new detail page
- `src/app/admin/modules/feature-requests/page.tsx` — Link wrap added to row titles (8 lines changed)

## Verification Results

- `npx tsc --noEmit`: PASS — no TypeScript errors
- `npx next build`: PASS — exit 0, `/admin/modules/feature-requests/[id]` listed as ƒ Dynamic
- `npx vitest run`: 242/242 tests GREEN (no regressions)
- All detail page acceptance checks: PASS (async function, ctx?.isStaff, redirect, notFound, getReleaseHistoryForFeature, ReleasedInSidebar JSX, correct import path, lg:grid-cols-3, pipeline link)
- All list page acceptance checks: PASS (next/link import, stopPropagation, expand button preserved)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed Drizzle jsonb `unknown` → ReactNode TypeScript error**
- **Found during:** Task 1
- **Issue:** `feat.buildPlan` is typed as `unknown` by Drizzle for `jsonb` columns. Using `{feat.buildPlan && (...)}` in JSX caused TS2322 — "Type 'unknown' is not assignable to type 'ReactNode'" — because TypeScript evaluates the JSX expression type as `unknown | JSX.Element`.
- **Fix:** Changed conditional from `{feat.buildPlan && ...}` to `{feat.buildPlan != null && ...}`. The `!= null` check (strict null exclusion) narrows the type so TypeScript can evaluate the JSX element branch correctly, without changing behavior.
- **Files modified:** `src/app/admin/modules/feature-requests/[id]/page.tsx`
- **Commit:** Included in task 1 commit `1476c99`

## Known Stubs

None — `ReleasedInSidebar` renders the actual `releaseHistory` prop with real data from `getReleaseHistoryForFeature`. Empty state "Not released yet" only renders when the prop array is genuinely empty (no release_log_links rows in DB for this feature).

---

## Self-Check: PASSED

- `src/app/admin/modules/feature-requests/[id]/page.tsx` — FOUND
- `src/app/admin/modules/feature-requests/page.tsx` — FOUND (modified)
- Task 1 commit `1476c99` — FOUND
- Task 2 commit `00ce176` — FOUND

---
*Phase: 12-bug-and-feature-detail-pages*
*Completed: 2026-05-08*
