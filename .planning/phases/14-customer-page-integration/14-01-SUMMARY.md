---
phase: 14-customer-page-integration
plan: "01"
subsystem: api
tags: [drizzle, vitest, tdd, release-log-links, pipeline-summary]

requires:
  - phase: 10-schema-gate
    provides: release_log_links table (releaseId, linkType bug|feature|external)
  - phase: 08-admin-home-pipeline-visibility
    provides: getProjectPipelineSummaries() helper + PipelineState type

provides:
  - getEntryTypeSummaryForProject(projectKey, releaseIds) -> Map<releaseId, EntryTypeCounts>
  - getWhatsComingToProd(projectKey) -> WhatsComingSummary
  - EntryTypeCounts type (fixes, features, other, total)
  - WhatsComingSummary type (totalEntries, fixes, features, other, hasDelta, oneliner)
  - EXTERNAL_BUCKET sentinel exported from release-entry-summary.ts
  - page.tsx fetches and passes entryCountsByRelease + whatsComing to ReleasesClient
  - ReleasesClient Props extended with optional entryCountsByRelease + whatsComing

affects:
  - 14-02 (FilterChips + WhatsComingCard — consumes entryCountsByRelease + whatsComing from these helpers)
  - 14-03 (BranchSection relocation — ReleasesClient props interface)

tech-stack:
  added: []
  patterns:
    - TDD RED→GREEN on pure server functions with mocked db and pipeline-summary
    - release-as-unit bucketing with fixes-take-precedence (bug > feature > other)
    - Map→Record conversion at server/client boundary for Next.js prop serialization
    - inArray batch query to avoid N+1 — one DB roundtrip for all releaseIds on a page
    - formatOneliner with zero-bucket omission and plural-awareness

key-files:
  created:
    - src/lib/release-entry-summary.ts
    - src/lib/release-entry-summary.test.ts
  modified:
    - src/app/projects/[slug]/releases/page.tsx
    - src/app/projects/[slug]/releases/types.ts
    - src/app/projects/[slug]/releases/ReleasesClient.tsx

key-decisions:
  - "release-as-unit bucketing (not link-row counting): a release with bug+feature links counts as ONE fix — fixes-take-precedence keeps customer UX simple and totalEntries = total releases on page"
  - "Map -> Record conversion in page.tsx: entryCountsByRelease Map converted to Record<string, EntryTypeCounts> via Object.fromEntries before passing to ReleasesClient (Next.js client props need plain objects)"
  - "external links excluded from typed counts: linkType=external does not increment fixes/features/total; map entry created with zero counts to distinguish 'has links but all external' from 'no links at all' — client uses absence from map as other-bucket signal"
  - "inArray batch query over N+1: single Drizzle select with inArray(releaseLogLinks.releaseId, releaseIds) for all page releases in one roundtrip"
  - "db.execute raw SQL for dev-rows-since-prod query in getWhatsComingToProd: matches Phase 8/9 pattern for COALESCE ordering; JS-side filter by prodCutoffTs for safety per Phase 8 decision"

patterns-established:
  - "Plan 02 can consume entryCountsByRelease as Record<string, EntryTypeCounts> and whatsComing as WhatsComingSummary | null from ReleasesClient props with zero business logic in client components"
  - "Filter math on chips is fully sync: server computed Record, client useMemo — no loading states needed"

requirements-completed: [CUST-01, CUST-02, DIFF-02]

duration: 3min
completed: 2026-05-08
---

# Phase 14 Plan 01: Server-Side Entry Counts + WhatsComing Lib + page.tsx Wiring Summary

**Server-side data layer for Phase 14 customer page: per-release entry-type counts from release_log_links (one inArray batch query) and aggregated "what's coming to prod" summary using release-as-unit bucketing with fixes-take-precedence, wired into page.tsx and passed as optional back-compat props to ReleasesClient**

## Performance

- **Duration:** 3 min
- **Started:** 2026-05-08T06:47:34Z
- **Completed:** 2026-05-08T06:50:44Z
- **Tasks:** 2 (Task 1 TDD, Task 2 wiring)
- **Files modified:** 5

## Accomplishments

- New `src/lib/release-entry-summary.ts` with two exported async functions, two exported types, and one exported sentinel constant
- 11-test Vitest suite covering happy, empty, external-only, multi-link, empty-releaseIds, cross-project, parity, dev-ahead, no-prod, inverted, and oneliner-formatting cases — all GREEN
- `page.tsx` now fetches `entryCountsByRelease` + `whatsComing` in a single `Promise.all` and passes them as new optional props to `ReleasesClient`

## Task Commits

1. **Task 1 RED: Failing tests** - `82af29a` (test)
2. **Task 1 GREEN: Implementation** - `e056b48` (feat)
3. **Task 2: page.tsx wiring + ReleasesClient props** - `b704031` (feat)

## Helper Signatures (verbatim — for Plan 02 reference)

```typescript
export async function getEntryTypeSummaryForProject(
  _projectKey: string,
  releaseIds: string[],
): Promise<Map<string, EntryTypeCounts>>;

export async function getWhatsComingToProd(projectKey: string): Promise<WhatsComingSummary>;
```

## Type Shapes (verbatim — for Plan 02 reference)

```typescript
export interface EntryTypeCounts {
  fixes: number;
  features: number;
  other: number;    // always 0 on individual releases — "other" is derived client-side via Map absence
  total: number;    // fixes + features
}

export interface WhatsComingSummary {
  totalEntries: number;
  fixes: number;
  features: number;
  other: number;
  hasDelta: boolean;
  oneliner: string | null;
}
```

## Files Created/Modified

- `src/lib/release-entry-summary.ts` — Two async helpers + exported types + EXTERNAL_BUCKET sentinel
- `src/lib/release-entry-summary.test.ts` — 11 Vitest cases, mocked db + pipeline-summary
- `src/app/projects/[slug]/releases/page.tsx` — imports helpers, Promise.all fetch, Map→Record conversion, passes new props
- `src/app/projects/[slug]/releases/types.ts` — re-exports EntryTypeCounts + WhatsComingSummary from lib
- `src/app/projects/[slug]/releases/ReleasesClient.tsx` — optional entryCountsByRelease (default {}) + whatsComing (default null) props added

## Decisions Made

- **Release-as-unit bucketing:** A release with both bug and feature links counts as ONE "fix" (fixes-take-precedence). This keeps `totalEntries` = total releases on page (not total link rows), matching the CONTEXT.md "Bug fixes (4), Features (2), Other (3)" where 4+2+3 = total releases.
- **Map→Record conversion:** `Object.fromEntries(entryCountsByRelease)` in page.tsx before passing to ReleasesClient. Next.js cannot serialize ES6 Maps across the server/client boundary.
- **External links excluded from typed counts:** `linkType='external'` rows do not increment fixes/features/total. A map entry is still created with zero counts so callers can distinguish "has links but all external" from "no links at all". Client uses Map absence (or all-zero) as other-bucket signal.
- **inArray batch query:** Single Drizzle select over all page releaseIds — no N+1 per release.
- **Raw SQL for dev-rows-since-prod:** `db.execute(sql\`...\`)` with COALESCE ordering, then JS-side filter by prodCutoffTs. Matches Phase 8 decision (safer than dynamic SQL, small per-project volume).

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Plan 02 (FilterChips + WhatsComingCard) has all data it needs: `entryCountsByRelease` as `Record<string, EntryTypeCounts>` and `whatsComing` as `WhatsComingSummary | null` available on ReleasesClient props with defaults.
- Filter math on chips will be fully sync (server-computed Record, client `useMemo`) — no loading states needed on chip render (satisfies CUST-02).
- Plan 02 imports types via `@/app/projects/[slug]/releases/types` (single import surface via re-exports).

---
*Phase: 14-customer-page-integration*
*Completed: 2026-05-08*
