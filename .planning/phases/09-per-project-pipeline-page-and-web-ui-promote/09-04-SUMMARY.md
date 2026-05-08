---
phase: 09-per-project-pipeline-page-and-web-ui-promote
plan: "04"
subsystem: pipeline
tags: [pipeline, per-project, server-component, tdd, vitest, what-changed, deploy-history]
dependency_graph:
  requires:
    - 08-02 (getProjectPipelineSummaries helper + PipelineSummary type)
    - 08-03 (pipeline tile on admin home)
  provides:
    - getProjectPipelineDetail(slug) → PipelineDetail | null
    - RcRow, WhatChangedEntry, DeployHistoryRow, PipelineDetail types
    - /admin/modules/pipeline/[slug] RSC with four sections
    - PromoteButton.tsx stub (plan 09-05 replaces with interactive island)
  affects:
    - 09-05 (PromoteButton.tsx stub → interactive island)
    - Phase 14 (getProjectPipelineDetail reuse in customer page integration)
tech_stack:
  added: []
  patterns:
    - TDD RED/GREEN in Vitest (7 new tests, 17 total in pipeline-summary.test.ts)
    - db.execute(sql`...`) for DISTINCT ON / complex ordering queries
    - JS-side branch grouping and sorting (safe, avoids dynamic SQL)
    - v2.1 violet-gradient header per DESIGN-REFERENCE.md
    - Type pill gradient accents (red-rose for Bug fix, teal-emerald for Feature)
    - <details open> HTML element for collapsible What's-changed section
key_files:
  created:
    - src/app/admin/modules/pipeline/[slug]/page.tsx
    - src/app/admin/modules/pipeline/[slug]/PromoteButton.tsx
  modified:
    - src/lib/pipeline-summary.ts (new types + getProjectPipelineDetail)
    - src/lib/pipeline-summary.test.ts (7 new tests, describe block for getProjectPipelineDetail)
decisions:
  - "RC ordering: JS-side sort after grouping (matches SQL ORDER BY semantics; defensive against mock/test ordering)"
  - "Staff auth: layout only validates session, not role; page adds getCurrentUserContext + redirect for staff-only guard"
  - "Deploy history: JS split into 10 prod + 10 dev then re-merge sorted desc (avoids complex SQL UNION)"
  - "Type pill colors: gradient accents per DESIGN-REFERENCE.md v2.1 Phase 9 specifics (not semantic tokens)"
  - "PromoteButton.tsx: inert disabled button stub; plan 09-05 swaps in two-step interactive island"
  - "bucketEntryTypeSingle() added as sibling to existing bucketEntries() for per-entry type bucketing"
metrics:
  duration: "~15 minutes"
  completed: "2026-05-07"
  tasks_completed: 2
  files_changed: 4
---

# Phase 9 Plan 04: Per-Project Pipeline Page Summary

**One-liner:** RSC at /admin/modules/pipeline/[slug] with violet-gradient header, branch RC table, gradient-pill what-changed table, and deploy history; backed by getProjectPipelineDetail() returning the consolidated PipelineDetail shape.

## What Was Built

### Task 1: getProjectPipelineDetail helper (TDD)

**RED commit:** `e99e279` — 7 new failing tests in a new `describe('getProjectPipelineDetail')` block appended to `src/lib/pipeline-summary.test.ts`. All 10 existing tests kept passing.

**GREEN commit:** `dda1f8c` — Full implementation in `src/lib/pipeline-summary.ts`.

New exports in `src/lib/pipeline-summary.ts`:

```typescript
export interface RcRow {
  id: string; branch: string; version: string;
  status: 'dev' | 'pending_approval' | 'approved' | 'rejected' | 'promoted' | null;
  author: string | null; deployedAt: string | null; releasedAt: string;
  promotionDispatchedAt: string | null;
}

export interface WhatChangedEntry {
  releaseId: string; type: 'fix' | 'feature' | 'other';
  title: string; branch: string; author: string | null; date: string;
}

export interface DeployHistoryRow {
  id: string; env: 'dev' | 'prod'; version: string;
  deployedAt: string | null; releasedAt: string; releasedBy: string | null;
}

export interface PipelineDetail {
  project: { key: string; name: string };
  summary: PipelineSummary;
  rcs: RcRow[];
  whatChanged: WhatChangedEntry[];
  deployHistory: DeployHistoryRow[];
}

export async function getProjectPipelineDetail(slug: string): Promise<PipelineDetail | null>;
```

Private helper added: `bucketEntryTypeSingle(type?: string): 'fix' | 'feature' | 'other'`

Implementation flow:
1. Looks up project in `projects` table — returns null if not found
2. Calls `getProjectPipelineSummaries([slug])` for the Phase 8 summary shape
3. Queries all dev-env RC rows via raw SQL, groups by branch in JS, sorts branches by max deployedAt desc, sorts within each branch desc
4. Queries dev rows after prod cutoff, expands `entries[]` JSONB into `WhatChangedEntry[]` with `bucketEntryTypeSingle()` bucketing
5. Queries release_logs for deploy history, splits into 10 prod + 10 dev in JS, re-merges sorted desc

**Test results:** 17/17 tests pass (10 pre-existing + 7 new).

### Task 2: /admin/modules/pipeline/[slug] server component

**Commit:** `4a3f47f` — Two new files.

**`src/app/admin/modules/pipeline/[slug]/page.tsx`** — Staff-only RSC (async server component):

- Auth: session + `getCurrentUserContext` → redirect to `/login` if not staff (layout only guards session)
- 404: calls `getProjectPipelineDetail(slug)`, `notFound()` if null

Page structure (top-to-bottom):

1. **Header:** `← Admin home` breadcrumb + `Customer view` ghost link; project name h1; v2.1 violet-gradient prod/dev version display (`bg-gradient-to-r from-violet-400 to-blue-400 bg-clip-text text-transparent`) with `formatRelativeTime` timestamps
2. **Branch RC list:** Grouped by branch (in sorted order from helper); branch sub-headers with RC count; 6-cell table rows (Branch mono, Version mono tabular, Status semantic pill, Author, Timestamp, PromoteButton slot); empty state "No release candidates yet"
3. **What's changed since prod:** `<details open>` for default-expanded collapsible; 5-column table (Type pill, Title, Branch, Author, Date); v2.1 gradient type pills (Bug fix: red-rose gradient, Feature: teal-emerald gradient, Other: zinc mute); empty state "Dev is in sync with prod"
4. **Recent deploys:** chronological list with env tag (prod emerald/dev zinc), version, author, relative time; empty state "No deploy history"

**`src/app/admin/modules/pipeline/[slug]/PromoteButton.tsx`** — Inert stub:

```tsx
'use client';
export default function PromoteButton({ releaseId, branch, version }) {
  // disabled button; plan 09-05 replaces with two-step interactive island
}
```

## Color / Pill Tokens

| Token | Class |
|-------|-------|
| Status: dev | `bg-zinc-800 text-zinc-300` |
| Status: pending_approval | `bg-amber-900/40 text-amber-300` |
| Status: approved | `bg-emerald-900/40 text-emerald-300` |
| Status: promoted | `bg-teal-900/40 text-teal-300` |
| Status: rejected | `bg-red-900/40 text-red-300` |
| Type: Bug fix | `bg-gradient-to-r from-red-900/50 to-rose-900/50 text-red-300 border border-red-700/30` |
| Type: Feature | `bg-gradient-to-r from-teal-900/50 to-emerald-900/50 text-teal-300 border border-teal-700/30` |
| Type: Other | `bg-zinc-800 text-zinc-400 border border-zinc-700/30` |
| Version header | `bg-gradient-to-r from-violet-400 to-blue-400 bg-clip-text text-transparent` |
| Env prod badge | `bg-emerald-900/40 text-emerald-300` |
| Env dev badge | `bg-zinc-800 text-zinc-400` |

## Empty States

| Section | Empty state text |
|---------|-----------------|
| Branch RC list | "No release candidates yet — push to a feature branch and tag a version" |
| What's changed | "Dev is in sync with prod" |
| Deploy history | "No deploy history" |

## Deviations from Plan

None — plan executed exactly as written.

The only judgment call: staff auth in the page used `getServerSession + getCurrentUserContext + redirect` (the server-component pattern) instead of `requireStaff()` from `api-auth.ts` (which returns `NextResponse` and is intended for API routes only). This is the correct pattern for RSCs and consistent with the rest of the admin tree.

## Known Stubs

| File | Stub | Reason |
|------|------|--------|
| `src/app/admin/modules/pipeline/[slug]/PromoteButton.tsx` | Inert disabled button | Plan 09-05 replaces with two-step interactive client island. The stub allows page.tsx to compile cleanly in Wave 1 parallel execution. |

The stub does NOT prevent the plan's goal (PIPE-05 pipeline page) from being achieved. The "Promote" functionality is plan 09-05's deliverable, not this plan's.

## Verification

- `npx tsc --noEmit` exits 0
- `npx vitest run` — 145/145 tests pass (17 in pipeline-summary.test.ts)
- `npx next build` — compiles `/admin/modules/pipeline/[slug]` as Dynamic server-rendered route

## Self-Check: PASSED

Files exist:
- FOUND: src/lib/pipeline-summary.ts (modified)
- FOUND: src/lib/pipeline-summary.test.ts (modified)
- FOUND: src/app/admin/modules/pipeline/[slug]/page.tsx
- FOUND: src/app/admin/modules/pipeline/[slug]/PromoteButton.tsx

Commits verified:
- e99e279: test(09-04): add getProjectPipelineDetail test scaffold (RED)
- dda1f8c: feat(09-04): implement getProjectPipelineDetail
- 4a3f47f: feat(09-04): add /admin/modules/pipeline/[slug] server component (PIPE-05, DIFF-01)
