---
phase: 05-customer-page-rc-ui
plan: 02
subsystem: releases-data-layer
tags: [types, groupIntoSections, promoteAttempts, deployedUrl, branch-grouping, RC-01, RC-07]
dependency_graph:
  requires: [05-01]
  provides: [branch-grouping-helper, extended-types, conflict-query]
  affects: [ReleasesClient, page.tsx, load-more-API]
tech_stack:
  added: []
  patterns: [drizzle-select-from-separate-table, pure-grouping-helper, transitional-stub-props]
key_files:
  created:
    - src/app/projects/[slug]/releases/group-sections.ts
  modified:
    - src/app/projects/[slug]/releases/types.ts
    - src/app/projects/[slug]/releases/page.tsx
    - src/app/projects/[slug]/releases/ReleasesClient.tsx
    - src/app/api/projects/[slug]/releases/route.ts
decisions:
  - "Transitional stub in ReleasesClient flattens initialSections to preserve existing flat table render until Plan 05-04 lands accordion UI"
  - "conflict auto-clear (D-16) implemented in groupIntoSections pure helper — same logic reused server-side and client-side"
  - "promoteAttempts fetched via db.select().from(promoteAttempts) (no FK/relations) then deduplicated in TS — two-pass approach per RESEARCH.md"
metrics:
  duration: "~4 minutes"
  completed: "2026-05-05T16:24:27Z"
  tasks_completed: 4
  files_changed: 5
---

# Phase 05 Plan 02: Server-Side Data Layer Summary

**One-liner:** Extended types + pure branch-grouping helper with conflict auto-clear + promoteAttempts query wired into page.tsx and load-more API.

## What Was Built

### Task 1 — Extended types.ts
Added `branch: string | null` and `metadata: Record<string, unknown> | null` to `ReleaseRow`. Added three new interfaces: `ConflictState` (conflict file list + rebaseError + createdAt), `BranchAggregate` (pending/promoted/conflict counts), `BranchSection` (branch grouping shape with releases, conflict, maxDeployedAt, isActive, aggregate).

### Task 2 — groupIntoSections() pure helper
Created `group-sections.ts` with `groupIntoSections(releases, conflictsByBranch, projectDeployedUrl): BranchSection[]` and `resolvePreviewUrl(release, projectDeployedUrl): string | null`. The helper:
- Groups by branch (null → 'main', Phase 3 backfill safety)
- Sorts: main pinned first, then feature branches by maxDeployedAt desc (D-03)
- Implements conflict auto-clear: conflict suppressed when maxDeployedAt > conflict.createdAt (D-16)
- Computes isActive: within 30-day window OR non-terminal status (D-02)
- Zero React or Drizzle imports — runs in both server and client contexts
- `group-sections.test.ts` goes RED → GREEN (3 tests, RC-01)

### Task 3 — page.tsx server query extension
- Project SELECT extended to include `deployedUrl: projects.deployedUrl`
- Added `db.select().from(promoteAttempts)` query filtered by `(project, result='conflict')` ordered by `desc(createdAt)`
- Deduplication in TS to latest conflict per branch → `latestConflictByBranch: Map<string, ConflictState>`
- `releases` ReleaseRow mapper extended with `branch: r.branch ?? null` and `metadata: (r.metadata as Record<string, unknown> | null) ?? null`
- `groupIntoSections()` called server-side to compute `initialSections`
- `conflictsByBranch` serialized to plain object for client prop
- `ReleasesClient` JSX updated: `initialSections`, `conflictsByBranch`, `projectDeployedUrl` passed; `initialReleases` removed
- `getServerSession(authOptions)` preserved verbatim

### Task 4 — Transitional ReleasesClient stub + load-more API
- `ReleasesClient.tsx` Props updated: `initialSections: BranchSection[]`, `conflictsByBranch: Record<string, ConflictState>`, `projectDeployedUrl: string | null` added; `initialReleases` removed
- State init: `useState(initialSections.flatMap((s) => s.releases))` — preserves existing flat table render
- `_conflictsByBranchRef` and `_projectDeployedUrl` held for Plan 05-04 to wire up
- `route.ts` load-more mapper: `branch: r.branch ?? null` and `metadata:` fields added

## Verification

- `npx vitest run group-sections.test.ts` → 3/3 PASS (GREEN)
- `npx tsc --noEmit` → zero errors in files modified by this plan (two pre-existing errors in BranchSection.test.tsx/vitest.config.ts are out-of-scope Wave 0 stubs)
- All success criteria pattern-matches pass (grep checks)

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

- `ReleasesClient.tsx` transitional stub: `initialSections.flatMap((s) => s.releases)` flattens sections back to a flat list for the existing table render. Plan 05-04 replaces this with section state and accordion UI.
- `_conflictsByBranchRef` and `_projectDeployedUrl` are held but not yet wired to the load-more handler. Plan 05-04 connects them.

These stubs are intentional per the plan — visible UI change is deferred to Plan 05-04.

## Self-Check: PASSED
