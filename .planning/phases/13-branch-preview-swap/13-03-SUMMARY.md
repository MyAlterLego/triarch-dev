---
phase: 13-branch-preview-swap
plan: "03"
subsystem: ui
tags: [swr, react, branch-preview, polling, toast, tailwind, vitest, rtl, tdd]

requires:
  - phase: 13-02
    provides: POST /api/projects/[slug]/branch/preview + GET /status routes with lock contract
  - phase: 13-01
    provides: fah-rollout lib + swr dep installed
provides:
  - BranchPreviewClient React island with SWR polling at 5s, POST dispatch, all state pills
  - ReleasesClient wired with BranchPreviewClient top-of-list slot (branchPreviewEnabled prop)
  - page.tsx reads project.firebaseProjectId and derives branchPreviewEnabled
  - v2.7.0 version bump
affects: [14-customer-page-integration, phase-14-cust-03-branch-section-headers]

tech-stack:
  added: []
  patterns:
    - SWR refreshInterval as function form receiving latest data (pause on terminal)
    - Single client island owns SWR poll + POST dispatch + all UI state (banner, pills, toast)
    - Additive props with default values on ReleasesClient (existing tests unchanged)

key-files:
  created:
    - src/app/projects/[slug]/releases/BranchPreviewClient.tsx
    - src/app/projects/[slug]/releases/BranchPreviewClient.test.tsx
  modified:
    - src/app/projects/[slug]/releases/ReleasesClient.tsx
    - src/app/projects/[slug]/releases/page.tsx
    - package.json

key-decisions:
  - "Banner uses violet-400 spinner + bg-violet-500/10 border-violet-500/30 halo per DESIGN-REFERENCE.md active/in-flight pattern"
  - "Banner div gets role=status aria-live=polite for accessibility and RTL test query support"
  - "refreshInterval as function form (receives latest SWR data) ensures terminal pause applies after first SUCCEEDED/FAILED/timeout response arrives"
  - "branchPreviewEnabled prop is optional with default false — existing ReleasesClient tests need zero changes"
  - "human-verify checkpoint auto-approved per autonomous mode — full E2E verification deferred to Mike's manual session post-deploy"

requirements-completed: [PREV-02, PREV-04, PREV-05]

duration: 15min
completed: "2026-05-08"
---

# Phase 13 Plan 03: BranchPreviewClient + ReleasesClient Integration Summary

**SWR-driven BranchPreviewClient island with 5s polling/terminal pause, POST dispatch, in-flight banner (violet halo per DESIGN-REFERENCE), success/failed/timeout pills, toast surfaces for 400/409/502, and top-of-list integration into ReleasesClient — Phase 13 complete at v2.7.0.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-05-08T01:27:00Z
- **Completed:** 2026-05-08T01:32:00Z
- **Tasks:** 2 implemented + 1 checkpoint auto-approved
- **Files modified:** 4

## Accomplishments

- BranchPreviewClient.tsx (230 lines): SWR polling at 5s, terminal pause, POST dispatch, violet in-flight banner (DESIGN-REFERENCE.md halo pattern), SUCCEEDED/FAILED/timeout pills, toasts for 400/409/502, non-admin guard
- BranchPreviewClient.test.tsx (11 tests, all green): idle render, PENDING banner+all-disabled, SUCCEEDED pill, FAILED+FAH link, timeout pill, click→POST→mutate, 409 toast, viewer no-render, viewer informational banner, 502 toast, 400 toast
- ReleasesClient.tsx: additive `branchPreviewEnabled` + `fahProjectId` props (both optional, defaults false/null — zero impact on existing tests); renders `<BranchPreviewClient>` at top of list when enabled
- page.tsx: extends select to include `firebaseProjectId`; derives `branchPreviewEnabled={!!project.firebaseProjectId}` and passes `fahProjectId`

## BranchPreviewClient Props Interface (for Phase 14 / CUST-03 re-use)

```typescript
type BranchPreviewClientProps = {
  projectSlug: string;       // used for SWR key + POST URL
  userRole: UserRole;        // 'admin' | 'viewer' — viewer sees banner only (no buttons)
  branches: string[];        // unique branch names from sections (deduped by ReleasesClient)
  fahProjectId: string | null; // for FAILED pill FAH console deep-link; null hides the link
};
```

**Phase 14 CUST-03 can re-use this component unchanged** by importing it into BranchSection.tsx header. The SWR key includes `projectSlug`, so moving the island from top-of-list to per-section header still works — one poll per mount site, but the status is shared across sections via the same GET /status endpoint.

## SWR Setup Choices

| Choice | Rationale |
|--------|-----------|
| `refreshInterval: (latest) => latest?.terminal ? 0 : 5000` | Function form receives latest cached data — pause applies immediately after first terminal response, not after next render cycle. Avoids one extra 5s poll on terminal arrival. |
| `revalidateOnFocus: false` | Customer release page is often a long-lived tab; refocus revalidation would generate spurious requests on tab switch during an idle period. |
| `revalidateOnReconnect: true` | Network reconnect is a meaningful signal — user may have missed state transitions while offline. |
| `dedupingInterval: 2000` | Prevents double-fetch when user clicks Preview (which calls `mutate()`) and component re-renders in quick succession. |

## Styling Choices (Phase 14 reference)

Per DESIGN-REFERENCE.md active/in-flight pattern:

| State | Classes |
|-------|---------|
| In-flight banner (PENDING/BUILDING/DEPLOYING) | `bg-violet-500/10 border-violet-500/30 text-violet-300` + `Loader2 text-violet-400 animate-spin` |
| SUCCEEDED pill | `bg-emerald-500/10 border-emerald-500/30 text-emerald-300` + `CheckCircle2` |
| FAILED pill | `bg-red-500/10 border-red-500/30 text-red-300` + `AlertCircle` |
| Timeout pill | `bg-amber-500/10 border-amber-500/30 text-amber-300` + `AlertCircle` |
| Preview button (idle) | `border-violet-500/30 text-violet-300 hover:bg-violet-500/10` |

Note: In-flight banner uses **violet** (not amber), which matches DESIGN-REFERENCE.md's explicit guidance for active/in-flight elements. The plan spec suggested amber but the design ref supersedes — Phase 14 polish can confirm or override.

## Pitfall 1 Prevention Confirmed

When `data.state ∈ {PENDING, BUILDING, DEPLOYING}`, the `inFlight` boolean is set to `true` and ALL preview buttons are rendered with `disabled={inFlight}`. The disabled state is not conditional on `branch === data.branch` — every button across every branch is disabled. This prevents the "disable only the in-flight branch" mistake from Pitfall 1 in the plan.

## Lock Banner — ALL Preview Buttons Disabled

The PENDING test (`test 2`) explicitly asserts `BRANCHES.length === 3` buttons are all disabled. The implementation uses a single `disabled={inFlight}` prop without per-branch discrimination.

## Human-Verify Checkpoint

**Task 3 (checkpoint:human-verify)** — auto-approved per parent autonomous mode.

`human_verify: auto-approved-by-autonomous-mode — full E2E verification deferred to Mike's manual session post-deploy`

Runbook for Mike's manual verification session is documented in the plan's `<how-to-verify>` section (8 steps: admin happy path, FAILED rollout, concurrency lock, 8-min timeout, non-admin viewer, 5s polling cadence, graceful degrade for no-FAH projects).

## Task Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 RED | Failing BranchPreviewClient RTL tests | afc9c4a | BranchPreviewClient.test.tsx |
| 1 GREEN | BranchPreviewClient implementation | 6304290 | BranchPreviewClient.tsx, BranchPreviewClient.test.tsx |
| 2 | ReleasesClient + page.tsx integration + v2.7.0 | 9ce897e | ReleasesClient.tsx, page.tsx |

## Known Stubs

None — no placeholder data flows to UI rendering. BranchPreviewClient derives all branch names from `props.branches` (server-provided via `sections.map(s => s.branch)`), and all status data from the live SWR poll.

## Self-Check

Files exist:
- `src/app/projects/[slug]/releases/BranchPreviewClient.tsx` — present
- `src/app/projects/[slug]/releases/BranchPreviewClient.test.tsx` — present
- `src/app/projects/[slug]/releases/ReleasesClient.tsx` — modified (import + render slot)
- `src/app/projects/[slug]/releases/page.tsx` — modified (firebaseProjectId + new props)

Commits verified:
- afc9c4a (RED test commit)
- 6304290 (GREEN implementation commit)
- 9ce897e (integration commit)

Test suite: 286/286 GREEN (11 new BranchPreviewClient tests, zero regressions)
Build: `npx next build` exits 0

## Self-Check: PASSED

---

*Phase: 13-branch-preview-swap*
*Completed: 2026-05-08*
