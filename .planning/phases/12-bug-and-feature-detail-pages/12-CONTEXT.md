# Phase 12: Bug and Feature Detail Pages - Context

**Gathered:** 2026-05-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Add detail pages for bug reports and feature requests at `/admin/modules/bug-reports/<id>` and `/admin/modules/feature-requests/<id>` with a "Released in" sidebar showing which release versions (dev / prod) include this item. Closes the bidirectional tracker linkage loop — Phase 11 wrote `release_log_links` rows; Phase 12 surfaces them on the bug/feature side.

**Delivers:** LINK-05, LINK-06.
**Does NOT deliver:** customer page filter (Phase 14), branch swap (Phase 13).

</domain>

<decisions>
## Implementation Decisions

### Page Layout

- Routes: `/admin/modules/bug-reports/[id]/page.tsx` and `/admin/modules/feature-requests/[id]/page.tsx`
- Both pages are **server components** with staff-only auth (existing `requireStaff` pattern + admin layout)
- Two-column layout: main content (left, ~2/3 width) + sidebar (right, ~1/3 width). Mobile: stacks
- **Main content** (left):
  - Title (large), status pill, priority pill (if exists), created/updated timestamps
  - Description / body
  - Project this bug/feature belongs to (clickable → `/admin/modules/pipeline/<slug>`)
  - Existing fields: reporter email, assignee (if any), tags
- **Sidebar** (right):
  - "Released in" section (this phase's PRIMARY deliverable)
  - Optional: status workflow buttons (defer to existing list page if already there)
  - Optional: comments/notes (defer to v2.2)

### "Released in" Sidebar (LINK-05, LINK-06)

- Section header: **"RELEASED IN"** (uppercase, zinc-500 text-xs tracking-wider, per design ref)
- Two stacked rows: **dev** + **prod**
- Each row format: `dev: vX.Y.Z · 3d ago` (relative timestamp via existing `formatRelativeTime`)
- If released in **multiple versions**, show ALL versions per env, vertically stacked (e.g. dev: v2.4.0 → v2.4.1 → v2.5.0). Most recent first.
- If released in dev but NOT yet prod: dev row shows version, prod row shows muted "—" with text "not yet in prod"
- If never released: render as "Not released yet" — single line, muted zinc-500
- Each version is **clickable** to the release_logs row on the per-project pipeline page (`/admin/modules/pipeline/<slug>?release=<version>` — anchor scroll if implemented; otherwise just deep-link to project pipeline)
- Apply gradient styling per DESIGN-REFERENCE.md: version numbers in mono with `text-violet-300` (subtle violet hint, not full headline gradient — this is a sidebar accent)

### Data Query

- New helper `src/lib/release-history.ts` exports `getReleaseHistoryForBug(bugId)` and `getReleaseHistoryForFeature(featureId)` returning `Array<{ version, env, deployed_at, project_slug, release_log_id }>`
- Batch-friendly variants: `getReleaseHistoryForBugs(bugIds[])` and `getReleaseHistoryForFeatures(featureIds[])` returning `Map<id, history[]>` — used by list pages later if needed
- Query: SELECT release_logs.version, release_logs.env, release_logs.deployed_at, release_logs.project (which is project_key), release_logs.id FROM release_log_links JOIN release_logs ON ... WHERE bug_id (or feature_id) = $1 ORDER BY deployed_at DESC NULLS LAST
- Uses Phase 10 `release_log_links` schema with FK indexes — single indexed query, no N+1 risk
- Type signature uses ISO string for timestamps (matches Phase 8 PipelineSummary pattern); page consumer calls `formatRelativeTime`

### Existing List Pages — Add Link from Row

- The existing `/admin/modules/bug-reports` (list) and `/admin/modules/feature-requests` (list) pages render rows; each row should now wrap in or include a `<Link>` to the new detail page
- Don't redesign the list pages this phase — just add the link affordance (cursor-pointer + click target on the title cell)
- Existing actions on rows (status workflow buttons, etc.) preserved

### Performance

- Detail page uses TWO queries: (a) the bug/feature row itself, (b) release history join. Both are indexed; well under 100ms total
- List pages do NOT yet show release history (defer to v2.1.x — would require batched lookup; out of Phase 12 scope per CONTEXT.md note)
- `revalidatePath` not needed in this phase — Phase 12 is read-only render

### Claude's Discretion

- Exact column widths, spacing, sidebar collapse behavior on mobile — at Claude's discretion
- Whether to include a "View raw release_log row" disclosure for staff debug — at Claude's discretion (recommended: yes, behind ⓘ icon)
- Component name for the sidebar (e.g. `<ReleasedInSidebar />`) — at Claude's discretion

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/db/schema.ts` — `bugReports`, `featureRequests`, `releaseLogs`, `releaseLogLinks` all in place
- `src/lib/db.ts` — Drizzle pg.Pool client
- `src/lib/auth-context.ts` + admin layout — staff auth handled at layout level
- `src/lib/pipeline-summary.ts` — pattern for batched data shapes (mirror for getReleaseHistoryForBugs/Features)
- `src/app/projects/[slug]/releases/format.ts` — `formatRelativeTime` (relative time formatting)
- `src/app/admin/modules/bug-reports/page.tsx` (list page — already exists)
- `src/app/admin/modules/feature-requests/page.tsx` (list page — already exists)

### Established Patterns
- Server component + Drizzle relational query pattern (matches /projects/[slug]/releases/page.tsx)
- Two-column layout with grid-cols-1 lg:grid-cols-3 (main: col-span-2, sidebar: col-span-1)
- Lucide icons + zinc/teal/amber/red/blue color tokens
- `notFound()` from `next/navigation` for missing IDs

### Integration Points
- New: `src/app/admin/modules/bug-reports/[id]/page.tsx`
- New: `src/app/admin/modules/feature-requests/[id]/page.tsx`
- New: `src/lib/release-history.ts` + `src/lib/release-history.test.ts`
- New: `src/components/ReleasedInSidebar.tsx` (or co-located in detail pages)
- Modified: `src/app/admin/modules/bug-reports/page.tsx` (add Link wrap on row title)
- Modified: `src/app/admin/modules/feature-requests/page.tsx` (add Link wrap on row title)

</code_context>

<specifics>
## Specific Ideas

- "Released in" semantics: a bug/feature is considered "released in vX.Y.Z" if there's a `release_log_links` row pointing from any release_log of version X.Y.Z to this bug/feature
- Cross-env consistency: a bug fixed in feat-branch v2.4.1-rc.1 (dev) will eventually be merged and re-released as v2.4.1 (prod) — these are SEPARATE release_logs rows linked by project + version. Show both. Don't deduplicate
- For features that span multiple PRs: multiple release_log_links rows may exist; show distinct (version, env) pairs

</specifics>

<deferred>
## Deferred Ideas

- List page release-history column (batched lookup) — defer to v2.1.x
- "Re-link" UI on detail page (add/remove links from this side) — defer; manual link UI lives on release-logs page (Phase 11)
- Comments/notes thread on detail pages — v2.2
- Cross-project visibility ("this bug affects Y other projects") — LINK-09 deferred

</deferred>
