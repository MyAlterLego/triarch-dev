---
phase: 21-release-page-port-read
plan: 03
subsystem: ui
tags: [react, next.js, portal, releases, read-only, vitest, toast, tailwind]

# Dependency graph
requires:
  - phase: 21-02
    provides: FilterChips, WhatsComingCard, Timeline, PreviewLink, format, types — portal releases leaf components
  - phase: 21-01
    provides: "@myalterlego/triarch-shared@0.2.0 with group-sections, groupIntoSections, resolvePreviewUrl"
provides:
  - "Portal BranchPreviewClient.tsx (Phase 21 stub: BranchPreviewBanner returns null, BranchPreviewButton renders button no-op)"
  - "Portal BranchSection.tsx (verbatim port, resolvePreviewUrl via shared package)"
  - "Portal ReleasesClient.tsx (read-only fork: filter math + section rendering + lifecycle timeline; 4 mutation handlers stubbed with TODO Phase 22)"
  - "Portal CustomerHeader.tsx (verbatim port, NextAuth signOut)"
  - "Portal Toast.tsx (verbatim port from admin)"
  - "Tests: BranchSection.test.tsx + ReleasesClient.test.tsx ported; RC-03 approve mutation test it.skip"
  - "Portal v0.2.3"
affects: [21-04, 22-releases-write]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Read-only fork pattern: copy admin component, stub mutation handlers with TODO Phase N comment + toast, mark mutation tests it.skip"
    - "Shared package import rewiring: ./group-sections -> @myalterlego/triarch-shared/group-sections"
    - "Phase N stub pattern for BranchPreviewClient: BranchPreviewBanner returns null, BranchPreviewButton renders with no-op onClick"

key-files:
  created:
    - "src/components/Toast.tsx"
    - "src/app/projects/CustomerHeader.tsx"
    - "src/app/projects/[slug]/releases/BranchPreviewClient.tsx"
    - "src/app/projects/[slug]/releases/BranchSection.tsx"
    - "src/app/projects/[slug]/releases/ReleasesClient.tsx"
    - "src/app/projects/[slug]/releases/BranchSection.test.tsx"
    - "src/app/projects/[slug]/releases/ReleasesClient.test.tsx"
    - "src/app/projects/[slug]/releases/__fixtures__/releases.ts"
  modified:
    - "package.json (v0.2.2 -> v0.2.3)"

key-decisions:
  - "Port BranchSection verbatim: all its dependencies already exist in portal (BranchPreviewClient stub provides the same prop shapes)"
  - "Strip handleLoadMore entirely and hardcode hasMoreState=false — portal Phase 21 renders first page only; load-more wires in Phase 22"
  - "Remove groupIntoSections import from ReleasesClient — only was used by handleLoadMore which is removed"
  - "RC-03 cross-branch approve isolation test marked it.skip — tests mutation handler state transitions that are no-ops in Phase 21"

patterns-established:
  - "Read-only mutation stub: async function handleX(...) { // TODO Phase 22: [description]; showToast('error', 'Action ships in Phase 22'); reset ephemeral state }"
  - "Mutation test skip: it.skip('...', async () => { // TODO Phase 22: re-enable when handlers wire })"

requirements-completed:
  - PORTAL-01

# Metrics
duration: 5min
completed: 2026-05-08
---

# Phase 21 Plan 03: Release Page Port (Read) Summary

**ReleasesClient ported as read-only fork to portal: filter chips + section grouping + lifecycle timeline render identically to admin; 4 mutation handlers (approve/reject/feedback/feedback-delete) stubbed with Phase 22 TODO markers + toast; BranchPreviewClient ships as visible-but-no-op stub**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-05-08T18:52:24Z
- **Completed:** 2026-05-08T18:57:00Z
- **Tasks:** 3
- **Files modified/created:** 9

## Accomplishments
- Toast.tsx, CustomerHeader.tsx ported verbatim — no logic changes needed
- BranchPreviewClient created as Phase 21 stub: BranchPreviewBanner returns null (no SWR polling), BranchPreviewButton renders with correct prop shapes matching admin (so BranchSection ports verbatim)
- ReleasesClient ported read-only: all filter math, what's-coming card, section grouping, lifecycle timeline, feedback display — fully functional; 4 mutation handlers replaced with no-op stubs showing Phase 22 toast
- handleLoadMore stripped; hasMoreState hardcoded false — portal renders first-page-only until Phase 22
- BranchSection.test.tsx + ReleasesClient.test.tsx ported with fixtures; RC-03 mutation test marked it.skip
- vitest: 51 pass, 1 skip; npx next build: clean; portal v0.2.3

## Task Commits

1. **Task 1: Port Toast + CustomerHeader + BranchPreviewClient stub** - `4f6fef9` (feat)
2. **Task 2: Port BranchSection + ReleasesClient read-only fork + tests** - `a2b51f8` (feat)
3. **Task 3: PR squash-merge** - `87d7163` (portal main, PR #8)

## Files Created/Modified

Portal working directory (`/Users/mikegeehan/claude/triarch/development/portal`):

- `src/components/Toast.tsx` - Verbatim port from admin; lucide-react X button, success/error kinds
- `src/app/projects/CustomerHeader.tsx` - Verbatim port; NextAuth signOut to /login
- `src/app/projects/[slug]/releases/BranchPreviewClient.tsx` - Phase 21 stub; BranchPreviewBanner→null, BranchPreviewButton→visible+no-op
- `src/app/projects/[slug]/releases/BranchSection.tsx` - Verbatim port; resolvePreviewUrl from @myalterlego/triarch-shared/group-sections
- `src/app/projects/[slug]/releases/ReleasesClient.tsx` - Read-only fork; 4 mutation handlers stubbed + handleLoadMore removed
- `src/app/projects/[slug]/releases/BranchSection.test.tsx` - Ported verbatim (all render/interaction tests pass)
- `src/app/projects/[slug]/releases/ReleasesClient.test.tsx` - Ported; RC-03 it.skip
- `src/app/projects/[slug]/releases/__fixtures__/releases.ts` - makeRelease / makeBranchSection / makeConflict helpers
- `package.json` - v0.2.2 → v0.2.3

## Decisions Made

- Stripped `groupIntoSections` import entirely from ReleasesClient (it was only consumed by the removed `handleLoadMore`). No unused import in portal.
- Removed `conflictsByBranchRef` and `offset`/`setOffset` state from portal ReleasesClient — both were only needed by `handleLoadMore`.
- Kept `conflictsByBranch` and `pageSize` in the Props interface so test files and the upcoming page.tsx server component can pass them unchanged.
- RC-03 test (cross-branch approve isolation) is the only test that needed `it.skip` — it tests mutation handler state machines that are no-ops in Phase 21. All other tests (filter chips, WhatsComingCard, BranchPreviewBanner singleton) are pure render/router-replace assertions and pass unchanged.

## Deviations from Plan

None — plan executed exactly as written. The unused import cleanup (groupIntoSections, ApprovalItem, conflictsByBranchRef) was a minor follow-through from the handleLoadMore removal, addressed inline.

## Issues Encountered

- Pre-existing `auth.test.ts` type errors (`projectKey` vs `project_key`) unrelated to this plan; confirmed pre-existing before any changes; out of scope per deviation rule scope boundary.

## Known Stubs

- `BranchPreviewClient.tsx` — `BranchPreviewBanner` intentionally returns null (Phase 22 wires SWR poll)
- `BranchPreviewClient.tsx` — `BranchPreviewButton.handleClick` is intentionally no-op (Phase 22 wires FAH dispatch)
- `ReleasesClient.tsx` — `handleApprove`, `handleReject`, `handlePostFeedback`, `handleDeleteFeedback` are intentionally no-op stubs (Phase 22 wires portal API routes)

These stubs are by design per Phase 21 read-only mandate. Phase 22 will re-enable each handler and flip the `it.skip` tests back on.

## Next Phase Readiness

- 21-04 (page.tsx server component) can now import `ReleasesClient` from `./ReleasesClient` — prop shapes are identical to admin's
- Phase 22 has a clean target: each mutation handler has a `// TODO Phase 22:` comment with the exact API endpoint to wire
- All 4 mutation-test `it.skip` blocks are ready to be un-skipped when Phase 22 wires the handlers

## Self-Check

Files exist:
- `/Users/mikegeehan/claude/triarch/development/portal/src/components/Toast.tsx` ✓
- `/Users/mikegeehan/claude/triarch/development/portal/src/app/projects/CustomerHeader.tsx` ✓
- `/Users/mikegeehan/claude/triarch/development/portal/src/app/projects/[slug]/releases/BranchPreviewClient.tsx` ✓
- `/Users/mikegeehan/claude/triarch/development/portal/src/app/projects/[slug]/releases/BranchSection.tsx` ✓
- `/Users/mikegeehan/claude/triarch/development/portal/src/app/projects/[slug]/releases/ReleasesClient.tsx` ✓

Commits exist:
- 4f6fef9 ✓
- a2b51f8 ✓
- 87d7163 (squash merge) ✓

## Self-Check: PASSED

---
*Phase: 21-release-page-port-read*
*Completed: 2026-05-08*
