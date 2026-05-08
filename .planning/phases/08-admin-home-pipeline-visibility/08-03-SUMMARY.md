---
phase: 08-admin-home-pipeline-visibility
plan: 03
subsystem: ui
tags: [next.js, react, tailwindcss, drizzle, pipeline, release-logs, admin-dashboard]

# Dependency graph
requires:
  - phase: 08-admin-home-pipeline-visibility
    plan: 02
    provides: getProjectPipelineSummaries() helper with PipelineSummary type

provides:
  - Admin home server component rendering pipeline-aware project health tiles
  - Prod/dev version rows stacked with mono font and relative timestamp per tile
  - Amber pending-approval pill in top-right (absent when count is 0)
  - What-changed one-liner row (dev-ahead full breakdown, inverted sentinel, parity hidden)
  - Whole tile wrapped in Next.js Link targeting /projects/<key>/releases

affects:
  - 09 (per-project pipeline page reuses same pattern; may reference tile layout decisions)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Promise.all parallel fetch: append new server helper as last entry alongside existing DB queries"
    - "pipelineMap lookup: Object.fromEntries(array.map(s => [s.key, s])) for O(1) merge into health array"
    - "Conditional pill render: count > 0 guard ensures zero counts show nothing (not '0 pending')"
    - "absolute top-2 right-2 for floating pill inside relative Link wrapper"

key-files:
  created: []
  modified:
    - src/app/admin/page.tsx
    - package.json

key-decisions:
  - "formatRelativeTime imported from @/app/projects/[slug]/releases/format — reuses existing helper, no duplication"
  - "Legacy version field kept on ProjectHealth interface (sourced from projects.currentVersion) per CONTEXT.md specifics — other callers may read it; removed from tile rendering but NOT from interface"
  - "Hover border goes zinc-800 to zinc-600 (two steps lighter) per CONTEXT.md intent — one-step zinc-700 too subtle on dark background"
  - "Link target is /projects/<key>/releases per CONTEXT.md decision — per-project admin pipeline page is Phase 9 scope"
  - "pipelineMap[p.key] missing guard: all pipeline fields default to null/0/'parity' — getProjectPipelineSummaries should return entries for all project keys, but defensive coalescing handles any edge case"

patterns-established:
  - "Pipeline tile pattern: relative-positioned Link with absolute pill, stacked label/value rows, bottom-row preserved existing data, optional what-changed footer"

requirements-completed:
  - PIPE-01
  - PIPE-02
  - PIPE-03
  - PIPE-04
  - PIPE-06

# Metrics
duration: 3min
completed: 2026-05-07
---

# Phase 08 Plan 03: Admin Home Pipeline Tile Summary

**Pipeline-aware project health tiles with prod/dev stacked rows, mono version font, relative timestamps, top-right amber pending-approval pill, and what-changed one-liner wired from getProjectPipelineSummaries — version 2.4.0**

## Performance

- **Duration:** 3 min
- **Started:** 2026-05-08T02:45:01Z
- **Completed:** 2026-05-08T02:48:10Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Extended `getDashboardStats` to call `getProjectPipelineSummaries(projectKeys)` as the 8th parallel Promise.all entry, merging pipeline data into every ProjectHealth object with null fallbacks for projects with no release_logs
- Replaced the plain `<div>` project health tile with a `<Link>` wrapper targeting `/projects/${p.key}/releases`, adding stacked prod/dev rows (mono version + relative time), conditional amber pending-approval pill, and what-changed one-liner footer per CONTEXT.md decisions
- Version bumped from 2.3.9 to 2.4.0 (minor — new user-visible pipeline feature); `next build` passes, all 136 vitest tests green

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend getDashboardStats with parallel pipeline summary fetch** - `e8f0e18` (feat)
2. **Task 2: Render pipeline-aware tile JSX with Link wrap, prod/dev rows, pending pill, what-changed one-liner** - `77b0161` (feat)

**Plan metadata:** committed separately

## Files Created/Modified

- `src/app/admin/page.tsx` — Extended ProjectHealth interface (7 new fields), added pipeline-summary import + formatRelativeTime import, extended Promise.all to 8 entries, merged pipelineMap into projectHealth, replaced Project Health tile JSX with pipeline-aware Link-wrapped tile
- `package.json` — Version bumped 2.3.9 → 2.4.0

## Decisions Made

- **formatRelativeTime reuse:** Imported from `@/app/projects/[slug]/releases/format` — the helper already existed and produces the correct output format; no new utility file needed
- **Legacy version field preserved:** `ProjectHealth.version` (sourced from `projects.currentVersion`) remains on the interface per CONTEXT.md "leave the column intact for now" — it is no longer rendered on the tile (prodVersion replaces it per PIPE-01) but kept to avoid breaking any other consumers
- **Hover border zinc-800 → zinc-600:** Two-step lift chosen over one-step (zinc-700) per CONTEXT.md intent; one-step is too subtle on a dark background, so zinc-600 delivers the intended perceived contrast
- **Link target `/projects/<key>/releases`:** Per CONTEXT.md decision — per-project admin pipeline page doesn't exist until Phase 9; click-through goes to customer release page for now
- **Defensive null coalescing on pipeline merge:** `pipeline?.prodVersion ?? null` pattern handles any edge case where `getProjectPipelineSummaries` doesn't return a row for a project key

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Known Stubs

None — all pipeline data fields are live queries from `getProjectPipelineSummaries`. The `formatRelativeTime` helper computes from live ISO timestamps. No hardcoded or placeholder values exist in the rendered tile.

## Next Phase Readiness

- Phase 8 (Admin Home Pipeline Visibility) is complete — all five requirements (PIPE-01, PIPE-02, PIPE-03, PIPE-04, PIPE-06) are satisfied and user-visible on the `/admin` page
- Phase 9 (Per-Project Pipeline Page and Web-UI Promote) can reuse `getProjectPipelineSummaries` without modification; the helper returns the same PipelineSummary shape Phase 9 needs
- The what-changed one-liner pattern and prod/dev row layout established here can be extended in Phase 9's per-project view

---
*Phase: 08-admin-home-pipeline-visibility*
*Completed: 2026-05-07*
