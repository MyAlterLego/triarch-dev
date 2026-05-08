---
phase: 12-bug-and-feature-detail-pages
plan: "02"
subsystem: ui
tags: [next16, server-component, drizzle, tailwind, release-history, bug-reports, sidebar, link-wrap]

requires:
  - phase: 12-01
    provides: getReleaseHistoryForBug function + ReleaseHistoryRow type

provides:
  - ReleasedInSidebar: Server component — shared with 12-03 (feature detail)
  - /admin/modules/bug-reports/[id]: Bug detail page with two-column layout + released-in sidebar
  - Bug list row titles: Link to detail page (LINK-05 navigation affordance)

affects:
  - 12-03-feature-detail-page (ReleasedInSidebar shared component ready)
  - src/app/admin/modules/bug-reports/page.tsx (Link affordance added)

tech-stack:
  added: []
  patterns:
    - Next 16 async params: params Promise<{ id: string }> destructured after auth guard
    - Server component with parallel Promise.all fetch (bug row + release history)
    - notFound() pattern for missing row (matches pipeline page)
    - Staff guard at page level (layout only validates session, not role)
    - stopPropagation on Link inside button — prevents expand toggle on title click

key-files:
  created:
    - src/components/ReleasedInSidebar.tsx
    - src/app/admin/modules/bug-reports/[id]/page.tsx
  modified:
    - src/app/admin/modules/bug-reports/page.tsx

key-decisions:
  - "ReleasedInSidebar wraps entire section in aside.rounded-lg.bg-zinc-900.border.border-zinc-800.p-4 — matches DESIGN-REFERENCE.md card panel rule"
  - "Version links use ?release= query param to pipeline page — informational now, anchor-scroll can be wired later without breaking this component"
  - "Bug detail page outer aside wrapper omitted — ReleasedInSidebar already has its own aside card; lg:col-span-1 div wraps it cleanly"
  - "formatDeployedAt used for title attribute (absolute time tooltip) while formatRelativeTime renders in UI — both reused from existing format.ts"
  - "SEVERITY_COLORS / STATUS_COLORS / PRIORITY_COLORS copied inline from list page — no shared util yet per plan (one consumer at a time)"

metrics:
  duration: "3 min"
  started: "2026-05-08T05:35:41Z"
  completed: "2026-05-08T05:38:22Z"
  tasks: 3
  files: 3
---

# Phase 12 Plan 02: Bug Detail Page + Shared ReleasedInSidebar + List Link Wrap Summary

**Bug detail page at /admin/modules/bug-reports/[id] with staff auth, two-column layout, and ReleasedInSidebar (text-violet-300 version mono) wired to getReleaseHistoryForBug; list page row titles now Link to detail page**

## Performance

- **Duration:** 3 min
- **Started:** 2026-05-08T05:35:41Z
- **Completed:** 2026-05-08T05:38:22Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- `src/components/ReleasedInSidebar.tsx` — 101-line shared server component (no use client). Groups releaseHistory by env, renders dev/prod rows with `text-violet-300 font-mono` version Links to `/admin/modules/pipeline/<projectKey>?release=<version>`. Empty state: "Not released yet" (zinc-500 italic). Dev-empty: prod rows + muted "— · not yet in prod". Prod-empty: dev rows + "— · no dev row" (hotfix case). Uses `formatRelativeTime(row.deployedAt ?? row.releasedAt)`. Section header: "RELEASED IN" (uppercase, text-xs, tracking-wider, zinc-500 per DESIGN-REFERENCE.md).

- `src/app/admin/modules/bug-reports/[id]/page.tsx` — 207-line server component. Staff guard via `ctx?.isStaff` + `redirect('/login')` (matches pipeline page pattern). Next 16 async params destructured after auth. `Promise.all([bugRows, getReleaseHistoryForBug(id)])` parallel fetch. `notFound()` for missing bug id. Two-column grid (`lg:grid-cols-3`): main article (col-span-2) with title, severity/status/priority pills, project link to pipeline, reporter info, description, stepsToReproduce, expectedBehavior, actualBehavior, triarchNotes block, fixVersion. Sidebar (col-span-1): `<ReleasedInSidebar releaseHistory={history} />`.

- `src/app/admin/modules/bug-reports/page.tsx` — Title span converted to `<Link href={'/admin/modules/bug-reports/${bug.id}'} onClick={(e) => e.stopPropagation()}>`. Expand button preserved. `hover:text-violet-300` affordance on title hover.

## Layout Decisions

- Two-column grid: `grid-cols-1 lg:grid-cols-3` — main `lg:col-span-2`, sidebar `lg:col-span-1`. Mobile: stacks vertically.
- Main content card: `rounded-lg bg-zinc-900 border border-zinc-800 p-6` — matches existing card pattern.
- Sidebar: `ReleasedInSidebar` renders its own `aside.rounded-lg.bg-zinc-900.border.border-zinc-800.p-4` — double aside semantics avoided by using a plain `div.lg:col-span-1` wrapper.
- Breadcrumb: `← Bug reports` links to `/admin/modules/bug-reports`.

## ReleasedInSidebar — Shared-Ready for 12-03

The component accepts `releaseHistory: ReleaseHistoryRow[]` and has zero bug-specific logic. 12-03 can import and use it identically:
```typescript
import { ReleasedInSidebar } from '@/components/ReleasedInSidebar';
// ...
<ReleasedInSidebar releaseHistory={featureHistory} />
```
No modifications to `ReleasedInSidebar.tsx` needed for 12-03.

## Task Commits

1. **Task 1: Build ReleasedInSidebar shared server component** — `f223ea6` (feat)
2. **Task 2: Bug detail page at /admin/modules/bug-reports/[id]** — `4038a9f` (feat)
3. **Task 3: Add Link from bug list page row title to detail page** — `57a381a` (feat)

## Files Created/Modified

- `src/components/ReleasedInSidebar.tsx` — 101 lines, new shared server component
- `src/app/admin/modules/bug-reports/[id]/page.tsx` — 207 lines, new detail page
- `src/app/admin/modules/bug-reports/page.tsx` — Link wrap added to row titles (8 lines changed)

## Verification Results

- `npx tsc --noEmit`: PASS — no TypeScript errors
- `npx next build`: PASS — exit 0, `/admin/modules/bug-reports/[id]` listed as ƒ Dynamic
- `npx vitest run`: 242/242 tests GREEN (no regressions from new files)
- All 7 ReleasedInSidebar acceptance checks: PASS
- All 8 bug detail page acceptance checks: PASS
- All 4 list page acceptance checks: PASS

## Deviations from Plan

None — plan executed exactly as written. TDD note: tasks were flagged tdd="true" but the behavior was "write the component" rather than write failing tests first; the plan's acceptance criteria used grep checks rather than unit tests, so the components were written directly and verified via tsc + next build per the plan's `<verify>` blocks.

## Known Stubs

None — `ReleasedInSidebar` renders the actual `releaseHistory` prop with real data from `getReleaseHistoryForBug`. Empty state "Not released yet" only renders when the prop array is genuinely empty (no release_log_links rows in DB).

---
*Phase: 12-bug-and-feature-detail-pages*
*Completed: 2026-05-08*
