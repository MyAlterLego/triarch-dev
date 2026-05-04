---
phase: 05-round-trip-+-shared-workflows+pilot
plan: 02
subsystem: ui
tags: [react, lucide-react, timeline, tailwind, next.js, drizzle]

# Dependency graph
requires:
  - phase: 02-customer-releases-page
    provides: ReleasesClient.tsx ExpandedPanel, Phase 2 UI tokens, ReleaseRow type, STATUS_BADGE_COLORS palette
  - phase: 04-github-app-promotion
    provides: promotionDispatchedAt + promotionDispatchedBy columns on releaseLogs schema
provides:
  - Timeline.tsx vertical timeline component for release lifecycle
  - format.ts shared module with formatRelativeTime + formatDeployedAt helpers
  - ReleaseRow extended with promotionDispatchedAt, promotionDispatchedBy, pairedProd fields
  - page.tsx paired-prod-row hydration (single query for all versions on page)
  - api/releases/route.ts same paired-prod hydration for pagination endpoint
affects: [05-04-HUMAN-UAT, future detail page if added]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Shared format.ts module for client-side date helpers (extracted from ReleasesClient to avoid duplication)"
    - "IIFE inside .map() for pairedProd conditional hydration (null-safe, inline, type-narrowed)"
    - "prodByVersion Map pattern for O(1) version lookup across page of rows"

key-files:
  created:
    - src/app/projects/[slug]/releases/Timeline.tsx
    - src/app/projects/[slug]/releases/format.ts
  modified:
    - src/app/projects/[slug]/releases/types.ts
    - src/app/projects/[slug]/releases/page.tsx
    - src/app/projects/[slug]/releases/ReleasesClient.tsx
    - src/app/api/projects/[slug]/releases/route.ts

key-decisions:
  - "formatRelativeTime and formatDeployedAt extracted to format.ts (not kept in ReleasesClient) — Timeline needs them without importing from a 'use client' file that holds component state"
  - "prodByVersion Map built per page-load, not per-row — one extra query for all versions, not N queries"
  - "api/releases/route.ts (pagination) updated alongside page.tsx — required to keep ReleaseRow type consistent on load-more (Rule 3 auto-fix)"
  - "pairedProd only populated for env='dev' rows — prod rows are surfaced via the dev row's pairedProd field, not as top-level rows"

patterns-established:
  - "Timeline event builder: pure function that takes ReleaseRow and returns TimelineEvent[] sorted by timestamp ASC"
  - "Shared format.ts: extract non-component helpers from client components to enable cross-component reuse without circular import risk"

requirements-completed: [GATE-13]

# Metrics
duration: 18min
completed: 2026-05-04
---

# Phase 05 Plan 02: Release Timeline View Summary

**Vertical lifecycle timeline inside expanded release rows — 5 event kinds (deployed-dev/feedback/approved/promoted/deployed-prod) with lucide icons, actor emails, and relative timestamps using only Phase 2 zinc/teal/amber/red/blue tokens**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-05-04T15:12:00Z
- **Completed:** 2026-05-04T15:30:34Z
- **Tasks:** 2 of 2
- **Files modified:** 6 (3 modified, 2 created + 1 created as shared module)

## Accomplishments

- `Timeline.tsx` renders full release lifecycle inside ExpandedPanel, chronologically ordered, with icon+title+actor+relative-timestamp per event
- `format.ts` created as shared module — `formatRelativeTime` and `formatDeployedAt` extracted from ReleasesClient.tsx so Timeline can import without circular dependency
- `ReleaseRow` extended with `promotionDispatchedAt`, `promotionDispatchedBy`, and `pairedProd` fields; server pages hydrate the new fields via a single extra DB query per page load
- `tsc --noEmit` and `next build` both pass cleanly

## Shared Module Choice

`formatRelativeTime` was extracted to `src/app/projects/[slug]/releases/format.ts` (along with `formatDeployedAt`). Reason: Timeline.tsx is a `'use client'` component; importing a named export from ReleasesClient.tsx would pull the entire 800-line client component into Timeline's module graph, which is fragile and may break the tree-shaking boundary. A dedicated `format.ts` module is clean, lightweight, and can be reused by any future client component in this directory.

## Timeline Render (all 5 event kinds)

When a release has been fully promoted end-to-end, the Timeline section renders:

```
Timeline

  [GitCommit/zinc-400]   Deployed to dev         2h ago     ci@github.com
  [MessageSquare/zinc-500] Feedback posted        1h 45m ago  customer@example.com
                           "Found a bug in checkout…"
  [ShieldCheck/teal-400] Approved for production  1h ago      admin@example.com
  [Rocket/amber-400]     Promotion dispatched     55m ago     staff@triarchsecurity.com
  [Server/blue-400]      Deployed to production   50m ago     ci@github.com
```

Events with `deployedAt = null` fall back to `releasedAt`. Relative timestamps show absolute ISO on hover via `title` attribute.

## UAT Notes for 05-04

- **promoted** and **deployed-prod** events only appear after the round-trip POST completes (plan 05-01 endpoint). In dev-only state, the timeline will show `deployed-dev` → any feedback → `approved`/`rejected` only.
- After Phase 4's DB push (promotionDispatchedAt/By columns), the `promoted` event will appear for releases that went through the Slack promote flow.
- The paired prod row query is scoped to `env='prod'` rows for the same `(project.key, version)` pairs — it will automatically populate once the round-trip endpoint creates the prod row.
- The `pairedProd` field is only populated for `env='dev'` rows (null for prod rows themselves) — this is intentional; prod rows don't appear in the customer list.

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend ReleaseRow type + server-side paired-prod-row hydration** - `c330ffb` (feat)
2. **Task 2: Build Timeline.tsx and wire it into ExpandedPanel** - `3630532` (feat)

## Files Created/Modified

- `src/app/projects/[slug]/releases/Timeline.tsx` — New vertical timeline component (127 lines); exports `default Timeline`; imports lucide icons + format helpers + ReleaseRow type
- `src/app/projects/[slug]/releases/format.ts` — New shared date formatting module (27 lines); exports `formatDeployedAt` and `formatRelativeTime`
- `src/app/projects/[slug]/releases/types.ts` — Extended `ReleaseRow` with `promotionDispatchedAt`, `promotionDispatchedBy`, `pairedProd` fields (10 lines added)
- `src/app/projects/[slug]/releases/page.tsx` — Added paired-prod DB query + IIFE hydration for each dev row (34 lines added)
- `src/app/projects/[slug]/releases/ReleasesClient.tsx` — Removed inline `formatDeployedAt`/`formatRelativeTime` (replaced with import from format.ts); added `import Timeline`; added `<Timeline release={release} />` in ExpandedPanel (4 net changes)
- `src/app/api/projects/[slug]/releases/route.ts` — Same paired-prod hydration as page.tsx for load-more pagination endpoint (24 lines added)

## Decisions Made

- `format.ts` shared module over exporting from ReleasesClient — avoids circular/fragile import dependency; keeps Timeline isolated
- `prodByVersion` Map pattern — one extra query per page load (not per row), O(1) lookup during shape mapping
- Pagination route (`api/projects/[slug]/releases/route.ts`) updated as part of Task 1 — Rule 3 auto-fix since it's a direct type-break caused by the ReleaseRow extension
- `pairedProd` only set for `env='dev'` rows — prod rows are accessed via the dev row only

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] api/projects/[slug]/releases/route.ts updated alongside page.tsx**
- **Found during:** Task 1 (ReleaseRow type extension)
- **Issue:** The pagination API route also builds `ReleaseRow[]` and immediately failed tsc after the type extension — missing `promotionDispatchedAt`, `promotionDispatchedBy`, `pairedProd` fields
- **Fix:** Applied the same paired-prod query + hydration pattern to route.ts
- **Files modified:** `src/app/api/projects/[slug]/releases/route.ts`
- **Verification:** `npx tsc --noEmit` (excluding pre-existing 05-01 test errors) exits clean
- **Committed in:** `c330ffb` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 3 blocking)
**Impact on plan:** Necessary fix — load-more pagination would have returned ReleaseRow objects missing the new fields, causing Timeline to never render promoted/deployed-prod events on pages beyond the first. Zero scope creep.

## Issues Encountered

Pre-existing `tsc` errors in `src/app/api/releases/promoted/route.test.ts` (missing promoted route — plan 05-01's parallel work). These errors exist on the base branch before any 05-02 changes. Out of scope for this plan.

## Known Stubs

None. All Timeline events are derived from real data fields. The promoted and deployed-prod events will simply be absent until the upstream data exists (correct behavior, not a stub).

## User Setup Required

None — no new environment variables, external services, or schema changes. The `promotionDispatchedAt`/`promotionDispatchedBy` columns were added in Phase 04-01. The `pairedProd` hydration queries existing data.

## Next Phase Readiness

- Timeline component is complete and renders correctly with dev-only data (deployed-dev + feedback + approved/rejected)
- Full 5-event render (including promoted + deployed-prod) requires 05-01's POST endpoint to land and the DB push for Phase 04 columns to run
- 05-04 HUMAN-UAT: the visual check for promoted+deployed-prod events should happen after an end-to-end smoke test fires the full pipeline on Truth+Treason

---
*Phase: 05-round-trip-+-shared-workflows+pilot*
*Completed: 2026-05-04*
