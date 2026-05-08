---
phase: 14-customer-page-integration
plan: "02"
subsystem: ui
tags: [vitest, tdd, filter-chips, url-state, whatscomincard, releases-client, usememo]

requires:
  - phase: 14-customer-page-integration
    plan: "01"
    provides: entryCountsByRelease (Record<string,EntryTypeCounts>) + whatsComing (WhatsComingSummary|null) on ReleasesClient props

provides:
  - FilterChips client island (fully controlled, URL-state driven by parent)
  - WhatsComingCard client island (collapsed by default, gradient count, expand toggle)
  - ReleasesClient wired with URL param filter math + filteredSections via useMemo
  - FilterType type exported from FilterChips.tsx
  - router.replace shallow URL update for filter chips (quality gate met)

affects:
  - 14-03 (BranchSection relocation — builds on top of this scaffolding; FilterChips/WhatsComingCard slots are in place)

tech-stack:
  added: []
  patterns:
    - TDD RED→GREEN for two client islands (FilterChips, WhatsComingCard)
    - URL-mirrored filter state via router.replace + useSearchParams (NOT router.push)
    - useMemo release-as-unit filter math (fixes-take-precedence: fix > feature > other)
    - Gradient text for KPI counts: bg-gradient-to-r from-violet-400 to-blue-400 bg-clip-text text-transparent
    - Gradient outline chips: border-violet-400 + from-violet-500/10 to-blue-500/10 bg
    - vi.mock hoisting pattern for next/navigation in RTL tests

key-files:
  created:
    - src/app/projects/[slug]/releases/FilterChips.tsx
    - src/app/projects/[slug]/releases/FilterChips.test.tsx
    - src/app/projects/[slug]/releases/WhatsComingCard.tsx
    - src/app/projects/[slug]/releases/WhatsComingCard.test.tsx
  modified:
    - src/app/projects/[slug]/releases/ReleasesClient.tsx
    - src/app/projects/[slug]/releases/ReleasesClient.test.tsx

key-decisions:
  - "URL param uses 'bug' (CUST-02 spec), internal FilterType uses 'fix' (matching release-entry-summary naming) — mapping happens at the URL boundary in ReleasesClient handleFilterChange only"
  - "router.replace with {scroll:false} over router.push — avoids history stack pollution from chip toggling (quality gate requirement)"
  - "WhatsComingCard ships with expanded-view placeholder ('Detailed entry list available in admin pipeline page') not a full entry table — per Plan 02 decision (entry table deferred; oneliner + collapse toggle is the must-have for v2.1)"
  - "release-as-unit bucketing precedence in filteredSections: fix (has fixes>0) > feature (no fixes, features>0) > other (no typed counts or both zero) — mirrors Plan 01's server-side bucketing"
  - "vi.mock must be at module top level with factory function to correctly capture mockReplace reference — nested vi.mock inside describe gets hoisted but loses the outer variable binding"

patterns-established:
  - "FilterChips is fully controlled — parent (ReleasesClient) owns URL state, FilterChips receives active+counts+onChange; zero internal useState"
  - "URL state → activeFilter → filteredSections chain is fully sync (no loading states, no server round-trips)"
  - "WhatsComingCard entries prop defaults to [] and shows placeholder; future plan can wire WhatChangedEntry[] through page.tsx → ReleasesClient → WhatsComingCard without component changes"

requirements-completed: [CUST-01, CUST-02, DIFF-02]

duration: 8min
completed: 2026-05-08
---

# Phase 14 Plan 02: FilterChips + WhatsComingCard client islands + ReleasesClient URL-state filter math Summary

**Two new client component islands (FilterChips, WhatsComingCard) with full Vitest RTL coverage, wired into ReleasesClient via URL-mirrored filter state (router.replace shallow) and client-side useMemo filter math — delivers CUST-01, CUST-02, DIFF-02 visible surface**

## Performance

- **Duration:** 8 min
- **Started:** 2026-05-08T06:53:26Z
- **Completed:** 2026-05-08T07:01:xx Z
- **Tasks:** 3 (Task 1 TDD FilterChips, Task 2 TDD WhatsComingCard, Task 3 wiring)
- **Files modified:** 6

## Accomplishments

- `FilterChips.tsx`: Fully controlled client island — 4 chips (All / Bug fixes / Features / Other) with aria-pressed, active gradient outline (violet-400→blue-400), zero-count dimming (opacity-50), onKeyDown Enter support. No internal useState.
- `FilterChips.test.tsx`: 7 RTL tests covering all 7 plan test cases — labels, counts, aria-pressed, onChange calls, no-op for active chip, opacity-50 for zero counts, Enter key.
- `WhatsComingCard.tsx`: Client island with useState(false) for collapse. Early return null when whatsComing=null or hasDelta=false. KPI count prefix uses `bg-gradient-to-r from-violet-400 to-blue-400 bg-clip-text text-transparent`. ChevronRight/Down toggle. Expanded view ships with placeholder ("Detailed entry list available in admin pipeline page") per Plan 02 decision.
- `WhatsComingCard.test.tsx`: 8 RTL tests covering hidden states, collapsed default, toggle, gradient class, section label uppercase, placeholder, aria-expanded.
- `ReleasesClient.tsx` wiring: useRouter + useSearchParams, activeFilter derivation from ?type= URL param, handleFilterChange with router.replace (NOT push), useMemo counts aggregation, useMemo filteredSections with empty-section hide, WhatsComingCard and FilterChips rendered above branch sections.
- `ReleasesClient.test.tsx`: 4 new tests (A: chip counts from entryCountsByRelease, B: router.replace with ?type=bug, C: WhatsComingCard hidden when null, D: filter chip triggers replace for feature type).
- 316/316 tests GREEN. TypeScript clean. router.push count = 0.

## Task Commits

1. **Task 1: FilterChips client island** - `55cc1fc` (feat)
2. **Task 2: WhatsComingCard client island** - `86ecd26` (feat)
3. **Task 3: ReleasesClient wiring** - `4f93b33` (feat)

## URL Param ↔ FilterType Mapping

The URL param uses `bug` (matching CUST-02 spec: `?type=bug|feature|other`), but internal FilterType uses `fix` (matching release-entry-summary.ts naming). The mapping is:

| URL `?type=` | Internal FilterType |
|---|---|
| `bug` | `fix` |
| `feature` | `feature` |
| `other` | `other` |
| (absent) | `all` |

Reverse mapping in handleFilterChange: `fix → 'bug'`, others pass-through.

## Release-Bucketing Precedence in Filter Math

Identical to Plan 01 server-side bucketing (fixes-take-precedence):
1. `c.fixes > 0` → **fix** bucket (even if also has features)
2. `c.features > 0 && c.fixes === 0` → **feature** bucket
3. `!c || (c.fixes === 0 && c.features === 0)` → **other** bucket

This ensures `totalEntries == total releases on page` (no release double-counted).

## WhatsComingCard Expanded View Decision

Plan 02 ships the card with the oneliner + collapse toggle as primary deliverable. Expanded view shows "Detailed entry list available in admin pipeline page" placeholder because:
- WhatChangedEntry[] server-side fetch is a non-trivial query (Phase 09 admin pipeline page owns this data)
- The count-oneliner satisfies DIFF-02's customer-facing must-have
- Wiring the full entry table is deferred to a follow-up plan (prop drilling through page.tsx → ReleasesClient → WhatsComingCard when needed)

## Router.replace Nuance

`router.replace(qs ? \`?${qs}\` : '?', { scroll: false })` preserves other existing query params via `new URLSearchParams(searchParams.toString())` — only `type` is set/deleted. The `{scroll: false}` option prevents the page from jumping to the top on chip click.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed vi.mock hoisting in ReleasesClient.test.tsx**
- **Found during:** Task 3 — Tests B and D failing (mockReplace had 0 calls)
- **Issue:** `vi.mock` nested inside `describe` block with a `mockReplace` reference was hoisted by vitest but lost the outer variable binding, causing the mock's `replace` to be a different `vi.fn()` than `mockReplace`
- **Fix:** Moved `vi.mock` to module top level as a factory function; defined `mockReplace = vi.fn()` at module scope before the factory; factory closure captures the same reference
- **Files modified:** `ReleasesClient.test.tsx`
- **Commit:** 4f93b33

**2. [Rule 1 - Bug] Fixed RC-03 existing test (role=row lookup)**
- **Found during:** Task 3 — RC-03 test failed after FilterChips added new button elements
- **Issue:** Original test used `screen.getByRole('row', { name: /rel-main|v0\.15\.0-rc\.1/i })` which relied on accessible name matching; the layout is unchanged but accessible row naming was fragile
- **Fix:** Updated to find rows via `getAllByRole('row')` + `textContent` includes check
- **Files modified:** `ReleasesClient.test.tsx`
- **Commit:** 4f93b33

## Known Stubs

- `WhatsComingCard entries={[]}`: ReleasesClient passes empty entries array to WhatsComingCard — the expanded view shows placeholder text. This is an intentional stub per Plan 02 decision. The card's primary value (oneliner + collapse toggle) is fully functional. Full entry table requires a future plan to wire WhatChangedEntry[] server-side.

## Self-Check: PASSED

Files verified:
- `src/app/projects/[slug]/releases/FilterChips.tsx` — FOUND
- `src/app/projects/[slug]/releases/FilterChips.test.tsx` — FOUND
- `src/app/projects/[slug]/releases/WhatsComingCard.tsx` — FOUND
- `src/app/projects/[slug]/releases/WhatsComingCard.test.tsx` — FOUND
- `src/app/projects/[slug]/releases/ReleasesClient.tsx` (modified) — FOUND

Commits verified:
- `55cc1fc` — FOUND (FilterChips)
- `86ecd26` — FOUND (WhatsComingCard)
- `4f93b33` — FOUND (ReleasesClient wiring)
