---
phase: 36-inclusion-approval-state-machine
plan: 05a
subsystem: admin-ui
tags: [next-app-router, server-component, client-component, drizzle, vitest, state-machine, filter-chips, optimistic-update]

requires:
  - phase: 36
    plan: 01
    provides: "inclusion_state column on bug_reports + feature_requests; partial index on inclusion_state='approved_for_build'"
  - phase: 36
    plan: 02
    provides: "PATCH /api/platform/{bug-reports|feature-requests}/[id] accepting {inclusionState} body; transitions validated by canManuallyTransition + audited in db.transaction"

provides:
  - "/admin/modules/next-build-plan/[slug] page (server component): staff-only auth gate, project lookup, drizzle query of approved_for_build bugs+features mixed and sorted by updated_at desc"
  - NextBuildPlanClient.tsx (client component): type filter chips (all/bug/feature), URL state via ?type=, optimistic Remove-from-Build per row, error indicator on failure
  - NextBuildPlanClient.test.tsx — 8 Vitest cases covering render, filter chips, URL update, Remove (bug + feature paths), failure rollback, empty state
  - INCL-05 surface: the only manual backward transition (approved_for_build → pending_inclusion) reachable from this page

affects:
  - 36-05b (companion list/detail extensions on bug-reports + feature-requests admin pages — disjoint file scope; can land in parallel)
  - 36-07 (portal /upcoming page can rely on inclusion_state IN ('approved_for_build','built') as the customer-visible "what's coming" set; this admin page is staff-side counterpart)
  - Mike's TMI dogfooding workflow — this becomes the source of truth for "what's queued for this build"

tech-stack:
  added: []  # zero new deps; reuses next/navigation, drizzle-orm, react useState/useMemo/useCallback, @testing-library/react, @testing-library/user-event, vitest
  patterns:
    - "Server component + colocated client component + colocated client test (matches admin/modules/* convention)"
    - "Optimistic UI: setState filter row out, fetch PATCH, on !ok restore previous list + setErrorMessage; minimal state surface (items / typeFilter / removingId / errorMessage)"
    - "Staff-only auth: getServerSession + getCurrentUserContext + isStaff check returning notFound() (no membership-leak: same 404 as bad slug)"
    - "URL state for filter: useSearchParams + router.replace pattern preserving back-button semantics"
    - "Local FilterChips duplication (NextBuildPlanFilterChips) instead of import — upstream chips have a different type set (fix/feature/other), this page needs (bug/feature)"
    - "Pitfall 9 honored: `params: Promise<{ slug: string }>` awaited in body (Next.js 16)"
    - "next/navigation Vitest mock pattern with module-scope mockReplace + mockSearchParams.value swap per test"

key-files:
  created:
    - src/app/admin/modules/next-build-plan/[slug]/page.tsx
    - src/app/admin/modules/next-build-plan/[slug]/NextBuildPlanClient.tsx
    - src/app/admin/modules/next-build-plan/[slug]/NextBuildPlanClient.test.tsx
  modified: []

key-decisions:
  - "FilterChips DUPLICATED locally as NextBuildPlanFilterChips, not imported from /projects/[slug]/releases/FilterChips. Upstream chip set is typed as 'all'|'fix'|'feature'|'other' (release-entry buckets). This page needs 'all'|'bug'|'feature' (entity types). Generalizing the upstream component would expand scope outside Phase 36; duplication keeps styling parity (violet/blue gradient active, zinc inactive, opacity-50 zero counts) while the type set differs. Per CONTEXT D-Admin-UI Discretion."
  - "Auth uses getServerSession + getCurrentUserContext + isStaff check returning notFound(), NOT redirect('/login'), because the plan explicitly requires 'no membership leak' — same 404 as a bad slug. (Pipeline page redirects to /login; bug detail page redirects to /login; this page diverges intentionally per the plan's M-2 fix lineage.)"
  - "Severity rendered for bugs only ('—' placeholder for features). The query selects severity from bug_reports; features have no severity column. Pill colors reuse the existing bug-reports severity palette (critical/high/medium/low) for visual continuity."
  - "Type-pill chosen as the visual differentiator instead of inclusion-state pill, because every row on this page IS approved_for_build — a uniform state pill would carry zero information. Bug=red, Feature=teal mirrors the existing bug-reports severity/status palette."
  - "Relative-time formatter implemented inline (relativeTime helper) instead of importing formatRelativeTime from /projects/[slug]/releases/format to avoid a cross-feature coupling that would pull additional shared code into the admin client bundle. Same output ('5m ago', '2h ago', etc.); 18 LOC; zero deps."
  - "Optimistic update with explicit rollback: setItems drops the row before fetch; on !ok, setItems(previous) restores it AND setErrorMessage surfaces the failure via role=alert. fetch network errors (catch block) also rollback. removingId disables the button during in-flight to prevent double-PATCH."

requirements-completed: [INCL-05]

duration: ~5min
completed: 2026-05-18
---

# Phase 36-05a: Admin Next-Build-Plan Page Summary

**New staff-only `/admin/modules/next-build-plan/{slug}` page renders approved_for_build items (bugs + features mixed) with type filter chips and an inline Remove-from-Build action that calls the Plan 36-02 PATCH endpoint with optimistic UI + rollback.**

## Performance

- **Duration:** ~5 min (executor agent, parallel wave 3 alongside 36-05b)
- **Started:** 2026-05-18T18:37:59Z
- **Completed:** 2026-05-18T18:42:06Z
- **Tasks completed:** 1/2 (Task 1 autonomous; Task 2 is human-verify checkpoint deferred to user)
- **Files created:** 3 (page + client + test)
- **Tests added:** 8 Vitest cases (plan asked for ≥7)

## Accomplishments

- **New page surface for INCL-05** — `/admin/modules/next-build-plan/[slug]` lists approved_for_build items for a project (staff-only), implementing the one user-facing entry point for the backward transition (approved_for_build → pending_inclusion).
- **Type filter chips with URL state** — `?type=all|bug|feature` chips update URL via router.replace; visible rows derive from typeFilter state; chip counts derived from items state (live update on Remove).
- **Optimistic Remove-from-Build** — row disappears immediately on click, calls PATCH `/api/platform/{bug-reports|feature-requests}/{id}` with body `{inclusionState: 'pending_inclusion'}`. On failure, row is restored and an inline `role="alert"` error message surfaces.
- **Staff-only auth without leak** — non-staff users (and unknown slugs) both get the same 404, matching the PORTAL-03 parallel design.
- **Pitfall 9 honored** — `params: Promise<{ slug: string }>` awaited in body; grep count = 1 (exact match per acceptance criterion).
- **Build passes** — `npx next build` exits 0; the new dynamic route appears in the build manifest as `ƒ /admin/modules/next-build-plan/[slug]`.

## Task Commits

1. **Task 1** — `c6b3ad5` — `feat(36-05a): add /admin/modules/next-build-plan/[slug] page with Remove-from-Build action` (TDD RED→GREEN in a single commit per executor convention — failing tests written first, implementation second, all 8 GREEN before commit)

_Plan SUMMARY.md to be committed in the final metadata commit._

## Tests Added (8 cases, all GREEN)

| # | Behavior |
|---|----------|
| 1 | Render a row per approved_for_build item with type pill, title, severity (bugs only), Remove button |
| 2 | Click "Bugs" chip → URL updates to ?type=bug; feature rows filtered out |
| 3 | Click "Features" chip → bug rows filtered out |
| 4 | Default "All" filter shows everything; aria-pressed=true on All chip |
| 5 | Remove on bug → PATCH /api/platform/bug-reports/{id} with body {inclusionState:'pending_inclusion'}; row removed optimistically |
| 6 | PATCH returns non-ok → row restored; role=alert error surface visible |
| 7 | Empty initialItems → render explanatory empty-state message referencing project name |
| 8 | Remove on feature → PATCH /api/platform/feature-requests/{id} (not bug-reports — distinct endpoint per type) |

**Test sweep:** `npx vitest run src/app/admin/modules/next-build-plan/` → **8/8 GREEN** in ~500ms.

## Acceptance Criteria Verification

| Criterion | Required | Actual |
|-----------|----------|--------|
| Files exist (page + client + test) | 3 | 3 |
| `grep -c "isStaff" page.tsx` | ≥1 | 2 |
| `grep -c "notFound()" page.tsx` | ≥2 | 2 |
| `grep -c "inclusionState, 'approved_for_build'" page.tsx` | 2 | 2 |
| `grep -c "Remove from build" NextBuildPlanClient.tsx` | ≥1 | 4 |
| `grep -c "inclusionState: 'pending_inclusion'" NextBuildPlanClient.tsx` | ≥1 | 2 |
| `grep -c "params: Promise<{ slug: string }>" page.tsx` | ==1 | 1 |
| `grep -c "FilterChips" NextBuildPlanClient.tsx` | ≥1 | 3 |
| Vitest tests pass | ≥7 | 8/8 GREEN |
| `npx next build` exits 0 | true | true (exit 0) |

## FilterChips Decision (per Output spec)

**Duplicated locally as `NextBuildPlanFilterChips`** — NOT imported from `/projects/[slug]/releases/FilterChips`.

**Reason:** the upstream component's `FilterType` is hard-bound to `'all' | 'fix' | 'feature' | 'other'` (release-entry buckets). This page needs `'all' | 'bug' | 'feature'` (entity types). Generalizing the upstream component would be scope expansion outside Phase 36 and risk regression on the 7 existing FilterChips tests for the releases page.

The duplicate keeps full styling parity (violet/blue gradient active state, zinc inactive, opacity-50 zero counts, aria-pressed semantics, Enter-key handling) while differing only in the type-set definition. ~80 LOC, zero coupling.

## next.config.ts Changes

**None.** No new transpilePackages required. No new shared-ui imports. All deps already in admin's package.json.

## Deviations & Recoveries

**1. [Test-only] Test 7 used `getByText(/TMI/)` which matched two DOM nodes**

- **Found during:** First vitest run after writing the client implementation
- **Issue:** The empty-state markup renders the project name in both the subtitle (`<p className="text-sm text-zinc-500">{projectName}</p>`) and the empty-state body span. `screen.getByText(/TMI/)` enforces uniqueness and threw "Found multiple elements".
- **Fix:** Changed the assertion to `screen.getAllByText(/TMI/).length).toBeGreaterThanOrEqual(1)`. Semantically identical (project name appears at least once) and matches the actual UI which legitimately mentions the project in multiple places on the empty-state surface.
- **Files modified:** `src/app/admin/modules/next-build-plan/[slug]/NextBuildPlanClient.test.tsx`
- **Commit:** Folded into the same Task 1 commit (`c6b3ad5`) because the fix landed before commit time.
- **Rule:** Rule 1 — bug in the test, not the implementation; auto-fixed inline.

**2. [Doc-only] Pitfall 9 grep count was 2, criterion required exactly 1**

- **Found during:** Grep verification after build
- **Issue:** The page.tsx header docstring originally contained the literal string `params: Promise<{ slug: string }>` inside a backtick comment, which made the grep count 2 (annotation + comment reference). Acceptance criterion specifies `returns 1`.
- **Fix:** Reworded the comment to describe the pattern without reproducing it verbatim ("params is awaited as an async Promise — see annotation below"). Grep now returns exactly 1.
- **Files modified:** `src/app/admin/modules/next-build-plan/[slug]/page.tsx`
- **Commit:** Folded into Task 1 commit (`c6b3ad5`) before commit time.
- **Rule:** Rule 1 — fix to satisfy spec; auto-fixed inline.

**No scope expansion. No new files outside the plan's 3-file allowlist. No untracked generated artifacts left behind.**

## Task 2 (Checkpoint:human-verify) — Deferred to User

Task 2 is a `checkpoint:human-verify` block in the plan: visual verification of the new page against the TMI pilot. Per parallel-wave executor convention this checkpoint cannot be auto-resolved because:

1. It requires the dev admin server running (`npm run dev`).
2. It requires at least one TMI item in `approved_for_build` state (which depends on 36-05b's UI shipping the Approve action — companion plan in this same wave).
3. It requires a logged-in staff session and the user's browser.

**User action required to close Task 2 (per the plan's `<resume-signal>`):**

```bash
# 1. Start admin dev server
cd /Users/mikegeehan/claude/triarch/development/admin
npm run dev

# 2. Pre-condition: ensure at least one TMI bug/feature is in approved_for_build state
#    (After 36-05b ships, use its Approve action; before then, manual SQL or PATCH via curl
#    with body {"inclusionState":"approved_for_build"} from a prior pending_inclusion row.)

# 3. Visit each URL in a browser logged in as staff:
#    http://localhost:3000/admin/modules/next-build-plan/tmi
#    Confirm: page renders, chip counts show (e.g. 1 bug / 0 features / 1 all)
#
#    Click 'Features' chip → bug filtered out → empty state if no features approved
#    Click 'All' chip → bug visible again
#    Click 'Remove from build' on the bug row → row disappears optimistically
#    Refresh the page → bug stays gone (inclusion_state reverted to pending_inclusion persistently)
#
# 4. Non-staff verification:
#    Toggle "Preview as customer" (v2.2 Phase 23.1) and revisit /admin/modules/next-build-plan/tmi
#    Expected: 404 (no membership-existence leak)
#
# 5. Empty-state verification:
#    Visit /admin/modules/next-build-plan/<project-with-zero-approvals>
#    Expected: "No items approved for build for <name> yet — use Bug Reports / Feature Requests..."

# Resume signal: reply "approved" if all 5 steps pass. Otherwise describe the failure with
# console-error / screenshot and STOP.
```

## What this enables

- **Plan 36-05b** can ship its companion list/detail extensions (Approve / Defer / Remove action wiring on existing pages) knowing the next-build-plan page is the destination view for approved items.
- **Plan 36-07** can rely on `inclusion_state IN ('approved_for_build','built')` as the customer-visible "upcoming" set — this admin page validates the read shape end-to-end before the portal mirrors it.
- **TMI dogfooding** can begin against the admin page immediately on next dev-deploy — staff can review the approved roster and unapprove individual items as priorities shift.

## Outstanding from this plan

- Task 2 (visual human-verify checkpoint) — deferred to user; will be closed by user typing "approved" once dev-deployed and TMI items present.
- No PR opened yet — feature branch `feat/inclusion-state-machine` continues accumulating Wave 3 commits from 36-05b in parallel; phase-close PR opens after all Phase 36 plans complete.
- `--no-verify` was used on Task 1's commit per parallel_execution directive (avoids pre-commit hook contention with the parallel 36-05b agent).

## Self-Check: PASSED

Verified post-write:

- **Files exist on disk:**
  - `src/app/admin/modules/next-build-plan/[slug]/page.tsx` — FOUND
  - `src/app/admin/modules/next-build-plan/[slug]/NextBuildPlanClient.tsx` — FOUND
  - `src/app/admin/modules/next-build-plan/[slug]/NextBuildPlanClient.test.tsx` — FOUND
- **Commits exist:** `c6b3ad5` — FOUND in `git log --oneline -5`
- **Vitest GREEN:** 8/8 pass
- **Build GREEN:** `npx next build` exit 0 (new route present in manifest)
- **Grep acceptance criteria:** all 8 criteria met (see table above)
- **File scope honored:** only the 3 allowed files touched (no edits to /admin/modules/bug-reports/, /admin/modules/feature-requests/, or anywhere outside the plan's scope)
