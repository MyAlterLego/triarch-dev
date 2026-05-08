# Phase 14: Customer Page Integration - Context

**Gathered:** 2026-05-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Final integration phase for v2.1. The customer release page (`/projects/<slug>/releases`) gets:
1. Entry-type filter chips (Bug fixes / Features / Other) with URL-mirrored state
2. "What's coming to prod" summary card at the top (collapsed by default)
3. Branch swap UI (Phase 13 client island) integrated into branch section headers — moves from Phase 13's top-of-list slot

**Delivers:** CUST-01, CUST-02, CUST-03, DIFF-02.
**Closes the v2.1 milestone.**

</domain>

<decisions>
## Implementation Decisions

### Filter Chips (CUST-01, CUST-02)

- Chip set: **All / Bug fixes / Features / Other** — 4 chips, "All" is default-active
- Counts shown in chips: "Bug fixes (4)", "Features (2)", "Other (3)" — derived from `release_log_links` joined to current page's release_logs entries
- URL state via `?type=bug|feature|other` (or absent = All) — mirrors existing `SlackAuditClient.tsx` pattern (URL params via `router.replace` shallow)
- Filter applies client-side via `useMemo` over the existing release rows; entries without bug/feature links default to "Other" bucket
- Chip styling per DESIGN-REFERENCE.md: active chip uses gradient outline (violet-400 → blue-400); inactive chips zinc baseline
- Filter persists across pagination (Load more button preserves filter state)
- Chip placement: above branch sections, below "What's coming to prod" card

### "What's coming to prod" Summary Card (DIFF-02)

- Card sits at the TOP of the customer release page, above branch sections
- **Collapsed by default** — header row shows compact summary: "4 entries since prod: 2 bug fixes, 1 feature, 1 other" with a chevron expand
- Expanded view shows the entry table (Type / Title / Branch / Author / Date) — same table shape as admin pipeline page DIFF-01, but read-only and customer-friendly
- Hidden entirely when dev = prod (no delta) OR when the project has no prod deploys yet
- Section header "WHAT'S COMING TO PROD" (uppercase, zinc-500 tracking-wider, design-ref pattern)
- Counts derived from same `release_log_links` join used by filter chips

### Branch Swap Integration (CUST-03)

- Move BranchPreviewClient from Phase 13's "top-of-list slot" into each **BranchSection header** (one swap button per branch row)
- Swap button reuses Phase 13's POST + GET endpoints — no new API
- Concurrency banner stays at the top of the page (single global banner rather than per-section noise)
- When ANY swap is in flight, ALL branch swap buttons across all sections become disabled with the same tooltip ("Branch X currently previewing — wait for it to finish")
- Phase 13's top-of-list slot is REMOVED from ReleasesClient (consolidates into BranchSection headers)

### Discoverability / Nav Polish

- Page-level nav bar (top of customer release page): breadcrumb back to admin home (visible to staff only — customers see project name only)
- Customer-level "View pipeline" link only when user is staff — clicks through to `/admin/modules/pipeline/<slug>`
- "RELEASE PAGE" header label uppercase + tracking-wider matching design-ref convention

### Testing

- New Vitest tests for filter chips (URL state sync, filter math, count display)
- New tests for "What's coming to prod" card (collapse/expand, hidden state)
- Existing BranchPreviewClient tests need re-pointing to new location in BranchSection (non-functional reshuffle)

### Claude's Discretion

- Exact card border radius, banner exit animation, filter chip pill geometry — at Claude's discretion
- Whether to show "Released to prod" sub-summary alongside "What's coming to prod" — DEFER (would be a nice symmetry but out of v2.1 scope)
- Whether to add an "OK to ship?" customer-self-service approval shortcut from the summary card — DEFER (existing per-RC approve flow is sufficient)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/app/admin/platform/slack-audit/SlackAuditClient.tsx` — URL-params filter pattern; CHIP UI; identical-behavior reference
- `src/app/projects/[slug]/releases/ReleasesClient.tsx` — main client island; needs filter chip integration + section restructure for branch swap relocation
- `src/app/projects/[slug]/releases/BranchSection.tsx` — branch group header; receives the relocated BranchPreviewClient
- `src/app/projects/[slug]/releases/BranchPreviewClient.tsx` — Phase 13 deliverable; gets relocated, no internal change
- `src/components/ReleasedInSidebar.tsx` — Phase 12 — pattern for compact entry-type counts
- `src/lib/release-history.ts` — Phase 12 — has the entry-type bucketing logic; reuse helpers
- `src/lib/pipeline-summary.ts` — Phase 8 — `bucketEntryType` helper; reuse for filter math

### Established Patterns
- URL params via `router.replace` shallow + `useSearchParams`
- `useMemo` for client-side filter math
- Lucide icons + zinc/teal/amber/red/blue/violet (Phase 8+ extended palette)

### Integration Points
- Modified: `src/app/projects/[slug]/releases/ReleasesClient.tsx` (filter chips, summary card, banner placement, BranchPreviewClient relocation)
- Modified: `src/app/projects/[slug]/releases/BranchSection.tsx` (accepts BranchPreviewClient slot)
- Modified: `src/app/projects/[slug]/releases/page.tsx` (passes additional props for filter counts)
- New: `src/app/projects/[slug]/releases/FilterChips.tsx` (client component if breaks out cleanly; otherwise inline in ReleasesClient)
- New: `src/app/projects/[slug]/releases/WhatsComingCard.tsx` (server component or client; Claude decides)
- Maybe new: `src/lib/release-filter.ts` (filter helpers, only if non-trivial)

</code_context>

<specifics>
## Specific Ideas

- The "Released to prod" symmetry deferred above is genuinely useful but out of scope — note in deferred section
- Chip "Other" bucket: entries with no `release_log_links` rows OR linked only to external (non-bug/non-feature) URLs
- Mobile responsiveness: chips should wrap or scroll horizontally on narrow viewports — design-ref doesn't dictate, Claude picks
- The "What's coming to prod" card uses violet-gradient text for the headline count per design-ref (big KPI gradient)

</specifics>

<deferred>
## Deferred Ideas

- "Released to prod" sub-summary card (symmetry with "What's coming to prod") — v2.1.x
- Customer-self-service approval shortcut from summary card — v2.1.x; existing per-RC approve flow is sufficient
- Filter persistence across visits (localStorage) — v2.1.x; URL state is sufficient
- Cross-branch filter ("Show me only feat/audio entries") — out of v2.1 scope
- Mobile-specific layout polish — Claude picks reasonable defaults; followup phase if needed

</deferred>
