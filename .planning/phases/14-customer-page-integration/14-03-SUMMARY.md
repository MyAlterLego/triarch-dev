---
phase: 14-customer-page-integration
plan: "03"
subsystem: ui
tags: [vitest, tdd, branch-preview, swr-dedup, banner-singleton, button-per-section, releases-client, branch-section]

requires:
  - phase: 14-customer-page-integration
    plan: "02"
    provides: FilterChips + WhatsComingCard slots in ReleasesClient (BranchPreviewBanner mounts below page header, before WhatsComingCard)
  - phase: 13-branch-preview-swap
    plan: "03"
    provides: BranchPreviewClient Phase 13 single component (split in this plan), API endpoints (/branch/preview POST, /branch/preview/status GET)

provides:
  - BranchPreviewBanner named export (global singleton, no userRole, informational to all roles)
  - BranchPreviewButton named export (per-section, admin-only, shared SWR cache key with Banner)
  - BranchSection header restructured to avoid button-in-button (outer div + toggle button + sibling flex div)
  - ReleasesClient mounts BranchPreviewBanner once; passes branchPreviewEnabled to each BranchSection
  - Back-compat default export shim (BranchPreviewClient composes Banner + Buttons)
  - v2.8.0 (closes v2.1 Pipeline UI milestone)

affects:
  - v2.1 milestone closed (this is the final plan of phase 14, final phase of v2.1)

tech-stack:
  added: []
  patterns:
    - TDD RED→GREEN for BranchPreviewBanner + BranchPreviewButton split
    - Private usePreviewStatus hook with shared SWR cache key — deduplication verified by Test 13
    - Flex sibling layout (outer div → toggle button + right-side div) avoids HTML button-in-button invalidity
    - Named export + default export shim pattern for back-compat with existing callers

key-files:
  created: []
  modified:
    - src/app/projects/[slug]/releases/BranchPreviewClient.tsx
    - src/app/projects/[slug]/releases/BranchPreviewClient.test.tsx
    - src/app/projects/[slug]/releases/BranchSection.tsx
    - src/app/projects/[slug]/releases/BranchSection.test.tsx
    - src/app/projects/[slug]/releases/ReleasesClient.tsx
    - src/app/projects/[slug]/releases/ReleasesClient.test.tsx
    - package.json

key-decisions:
  - "Back-compat shim retained as default export — BranchPreviewClient still importable; any caller outside ReleasesClient continues working without changes"
  - "usePreviewStatus private hook (not exported) ensures both Banner and Button always use identical cache key string — SWR dedupingInterval:2000 guarantees single poll regardless of mount count"
  - "BranchSection header restructured to outer div + toggle button + sibling flex div — HTML button-in-button is invalid and causes click event bubbling; flex layout preserves visual identity"
  - "BranchPreviewBanner returns null on idle state — avoids empty card appearing before first swap"
  - "human_verify: auto-approved-by-autonomous-mode — full E2E (filter chips + summary card + branch swap from section header) deferred to Mike's manual session post-deploy"

requirements-completed: [CUST-03]

duration: 6min
completed: 2026-05-08
---

# Phase 14 Plan 03: BranchPreviewClient Split + BranchSection Integration + v2.8.0 Summary

**BranchPreviewClient split into BranchPreviewBanner (global singleton) + BranchPreviewButton (per-section, admin-only) sharing one SWR cache key; BranchSection header restructured to avoid button-in-button; ReleasesClient mounts singleton banner; v2.8.0 closes v2.1 Pipeline UI milestone**

## Performance

- **Duration:** 6 min
- **Started:** 2026-05-08T07:01:20Z
- **Completed:** 2026-05-08T07:07:28Z
- **Tasks:** 2 executed (Task 3 auto-approved per autonomous mode)
- **Files modified:** 7

## Accomplishments

- `BranchPreviewClient.tsx` rewritten with named exports + back-compat default:
  - `BranchPreviewBanner`: renders status pills (violet halo PENDING, emerald SUCCEEDED, red FAILED, amber timeout) — no userRole, informational to all. Returns null on idle (no empty card).
  - `BranchPreviewButton`: renders per-section Preview button, admin-only early return null for viewer, full POST handler with 202/400/409/502 toast paths, dispatching state.
  - `usePreviewStatus` private module hook — identical cache key `/api/projects/${slug}/branch/preview/status` shared by both components. SWR deduplication verified by Test 13.
  - Default export `BranchPreviewClient` shim composes Banner + Buttons — zero changes needed at any existing import site.
- `BranchPreviewClient.test.tsx`: 14 tests — 6 Banner (idle null, PENDING banner, SUCCEEDED pill, FAILED pill+link, timeout pill, role-agnostic), 7 Button (idle enabled, in-flight disabled, POST+mutate, viewer null, 409 toast, 502 toast), 1 dedup assertion (same cache key across 3 mounts), 1 shim smoke test.
- `BranchSection.tsx` restructured header: outer `<div>` with `hover:bg-zinc-800/30` wraps toggle `<button>` (text-left flex-1) + right-side `<div>` (badges + BranchPreviewButton). `branchPreviewEnabled` prop gates the button render.
- `BranchSection.test.tsx`: 3 new tests (A: button present for admin with enabled flag, B: button absent when disabled, C: toggle fires correctly with button present — button-in-button regression check).
- `ReleasesClient.tsx`: import swapped from default `BranchPreviewClient` to named `{ BranchPreviewBanner }`. Top-of-list slot replaced with `<BranchPreviewBanner projectSlug fahProjectId />`. `branchPreviewEnabled` passed down to each `<BranchSectionComponent>`.
- `ReleasesClient.test.tsx`: mock updated to include both named exports; 2 new tests (E: singleton banner — `queryAllByTestId('preview-banner')` length === 1 across 3 sections, F: no banner when disabled).
- `package.json`: version `"2.7.0"` → `"2.8.0"`.
- **324/324 Vitest tests GREEN. TypeScript clean (tsc --noEmit). next build passes.**

## Task Commits

1. **Task 1: BranchPreviewClient split** — `8b141a3` (feat)
2. **Task 2: BranchSection integration + ReleasesClient cleanup + v2.8.0** — `3776fb0` (feat)

## Component Split Design

### BranchPreviewBanner (singleton)

```
ReleasesClient
  └── <BranchPreviewBanner projectSlug fahProjectId />   ← ONCE, below page header
```

- Uses `usePreviewStatus` → poll fires only when non-idle
- Renders: violet halo (PENDING/BUILDING/DEPLOYING), emerald (SUCCEEDED), red (FAILED + Firebase link), amber (timeout)
- Returns null on idle — no empty card on page load

### BranchPreviewButton (per-section)

```
ReleasesClient.filteredSections.map
  └── <BranchSectionComponent branchPreviewEnabled={branchPreviewEnabled} ...>
        └── (in header's right-side div)
              <BranchPreviewButton projectSlug branch={section.branch} userRole />
```

- Uses same `usePreviewStatus` → SWR deduplicates — ONE poll for N buttons + 1 banner
- Admin only (early return null for viewer)
- Disabled when `IN_FLIGHT_STATES.has(data.state)` — all buttons across all sections disable simultaneously (shared cache key makes this automatic)

### SWR Deduplication

Both components call `useSWR('/api/projects/${slug}/branch/preview/status', ...)` with:
- `dedupingInterval: 2000` — SWR coalesces concurrent calls within 2s
- `refreshInterval: (latest) => latest?.terminal ? 0 : 5000` — pauses when terminal

Even with 1 Banner + 3 BranchPreviewButtons mounted, only ONE fetch runs every 5 seconds.

## Back-Compat Default Export Shim

The default export `BranchPreviewClient` is retained as a shim:

```tsx
export default function BranchPreviewClient({ projectSlug, userRole, branches, fahProjectId }) {
  return (
    <div>
      <BranchPreviewBanner projectSlug={projectSlug} fahProjectId={fahProjectId} />
      {userRole === 'admin' && branches.length > 0 && branches.map((branch) => (
        <BranchPreviewButton key={branch} projectSlug={projectSlug} branch={branch} userRole={userRole} />
      ))}
    </div>
  );
}
```

No existing callers in the codebase use this path post-Plan 14-03 (ReleasesClient now uses named exports), but the default export guard ensures any future import of `BranchPreviewClient` works without modification.

## HTML-Validity Fix: Button-in-Button Avoided

The original `BranchSection` header was a `<button>` wrapping both the toggle content and the badge area. Nesting `<BranchPreviewButton>` inside would create invalid HTML (`<button>` inside `<button>`), causing click event bubbling issues.

**Before (invalid for Phase 14):**
```tsx
<button onClick={onToggleSection} className="w-full ...">
  <div>{/* chevron + branch name */}</div>
  <div>{/* badges */}  ← BranchPreviewButton would need to go here — invalid!</div>
</button>
```

**After (Phase 14):**
```tsx
<div className="w-full flex items-center justify-between px-4 py-3 hover:bg-zinc-800/30 ...">
  <button onClick={onToggleSection} className="flex items-center gap-2 text-left flex-1">
    {/* chevron + branch name + relative time */}
  </button>
  <div className="flex items-center gap-1.5 flex-wrap ml-2">
    {/* status badges */}
    {branchPreviewEnabled && <BranchPreviewButton ... />}  ← sibling, not nested
  </div>
</div>
```

The hover effect (`hover:bg-zinc-800/30 transition-colors`) moved to the outer `<div>` so the visual UX is unchanged.

## v2.8.0 — v2.1 Pipeline UI Milestone Closure

This plan closes:
- **CUST-03**: Per-branch "Preview this branch" button in each BranchSection header
- **v2.1 Pipeline UI milestone**: All 4 customer page integration requirements (CUST-01, CUST-02, CUST-03, DIFF-02) shipped across Plans 14-01, 14-02, 14-03

**v2.1 retrospective bullets:**
- Phase 8 through 14: 7 phases, 23 plans, all executed in a single session on 2026-05-08
- SWR deduplication made the per-section button architecture essentially free (no extra polls)
- The button-in-button restructure was anticipated in the plan (CONTEXT.md note); solution was straightforward flex sibling layout
- WhatsComingCard ships with placeholder expanded view — full entry table deferred to v2.1.x
- Phase 13's single-instance concurrency pattern preserved exactly — Banner singleton + shared cache key

## Human Verify: Auto-Approved

**Status:** Auto-approved by autonomous mode

Full E2E verification checklist (filter chips + WhatsComingCard + branch swap from section header + branchPreviewEnabled flag) deferred to Mike's manual session post-deploy.

Items to manually verify post-deploy:
1. Each branch section header shows "Preview {branch}" button (admin/staff only)
2. Clicking a button → POST → in-flight violet halo banner appears at TOP of page (singleton)
3. While in-flight: ALL section buttons across ALL branches become disabled with tooltip
4. Phase 13 top-of-list slot GONE — buttons only in section headers
5. Successful swap → emerald pill at top, buttons re-enabled
6. Viewer: sees banner only, no buttons
7. v2.8.0 visible in package.json

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed Test C query for BranchSection toggle button**
- **Found during:** Task 2 — Test C failed with "Unable to find an accessible element with name ''"
- **Issue:** Test used `getByRole('button', { name: '' })` but the restructured toggle button now has an accessible name derived from its text content (`"feat/audio 6 days ago"`)
- **Fix:** Changed to `getByRole('button', { name: /feat\/audio/i })` — matches the branch name in button text
- **Files modified:** `BranchSection.test.tsx`
- **Commit:** 3776fb0

**2. [Rule 1 - Bug] Fixed back-compat shim test — require() after named import**
- **Found during:** Task 1 RED→GREEN — back-compat shim test failed with "Cannot find module"
- **Issue:** Using `require('./BranchPreviewClient').default` inside `describe` after the module was already imported via ESM named imports caused module resolution conflict
- **Fix:** Added `import BranchPreviewClientDefault from './BranchPreviewClient'` at top level alongside named imports
- **Files modified:** `BranchPreviewClient.test.tsx`
- **Commit:** 8b141a3

## Known Stubs

None — BranchPreviewBanner and BranchPreviewButton are fully wired. WhatsComingCard expanded-view placeholder is tracked in 14-02-SUMMARY.md Known Stubs (not introduced by this plan).

## Self-Check: PASSED

Files verified:
- `src/app/projects/[slug]/releases/BranchPreviewClient.tsx` — FOUND
- `src/app/projects/[slug]/releases/BranchPreviewClient.test.tsx` — FOUND
- `src/app/projects/[slug]/releases/BranchSection.tsx` — FOUND
- `src/app/projects/[slug]/releases/BranchSection.test.tsx` — FOUND
- `src/app/projects/[slug]/releases/ReleasesClient.tsx` (modified) — FOUND
- `src/app/projects/[slug]/releases/ReleasesClient.test.tsx` (modified) — FOUND
- `package.json` version "2.8.0" — FOUND

Commits verified:
- `8b141a3` — Task 1 (BranchPreviewClient split) — FOUND
- `3776fb0` — Task 2 (BranchSection + ReleasesClient + v2.8.0) — FOUND
