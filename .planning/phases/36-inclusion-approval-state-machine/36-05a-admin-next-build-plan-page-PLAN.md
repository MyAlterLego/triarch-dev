---
phase: 36-inclusion-approval-state-machine
plan: 05a
type: execute
wave: 3
depends_on: [36-02]
files_modified:
  - src/app/admin/modules/next-build-plan/[slug]/page.tsx
  - src/app/admin/modules/next-build-plan/[slug]/NextBuildPlanClient.tsx
  - src/app/admin/modules/next-build-plan/[slug]/NextBuildPlanClient.test.tsx
autonomous: false
requirements: [INCL-05]
must_haves:
  truths:
    - "Navigating to /admin/modules/next-build-plan/{slug} renders a single table of approved_for_build items for that project, mixing bugs and features sorted by approval-event timestamp desc"
    - "Each row shows: type-pill (bug/feature), title, severity (bugs only), approved-at timestamp, and a 'Remove from build' button"
    - "Clicking 'Remove from build' calls PATCH /api/platform/{bug-reports|feature-requests}/{id} with {inclusionState: 'pending_inclusion'}, refreshes the list, and removes the row from view"
    - "Filter chips (?type=all|bug|feature) reuse FilterChips component from /projects/[slug]/releases — same styling, same keyboard handling"
    - "Staff-only auth guard on the new page (requireSignedIn + getCurrentUserContext + isStaff check); non-staff gets 404 (no membership leak)"
    - "Full Vitest coverage on NextBuildPlanClient — 7 test cases covering render, filter chips, Remove action, optimistic update, failure rollback, empty state"
  artifacts:
    - path: "src/app/admin/modules/next-build-plan/[slug]/page.tsx"
      provides: "Server-component page: auth gate + project lookup + initial query for approved_for_build bugs+features + render NextBuildPlanClient"
      contains: "approved_for_build"
    - path: "src/app/admin/modules/next-build-plan/[slug]/NextBuildPlanClient.tsx"
      provides: "Client component: filter chips, table render, Remove-from-Build action, optimistic update"
      contains: "Remove from build"
    - path: "src/app/admin/modules/next-build-plan/[slug]/NextBuildPlanClient.test.tsx"
      provides: "Full Vitest coverage for the new client component"
      contains: "describe"
  key_links:
    - from: "src/app/admin/modules/next-build-plan/[slug]/NextBuildPlanClient.tsx"
      to: "PATCH /api/platform/{bug-reports|feature-requests}/[id]"
      via: "fetch with body {inclusionState: 'pending_inclusion'}"
      pattern: "inclusionState: 'pending_inclusion'"
    - from: "src/app/admin/modules/next-build-plan/[slug]/page.tsx"
      to: "bugReports + featureRequests inclusionState='approved_for_build'"
      via: "drizzle SELECT WHERE eq(inclusionState, 'approved_for_build') AND eq(project, slug)"
      pattern: "inclusionState, 'approved_for_build'"
---

<objective>
Build the new admin page surface for INCL-05: `/admin/modules/next-build-plan/[slug]` (staff-only) that lists `approved_for_build` items for a project with inline "Remove from build" action. Reuses the existing `FilterChips` component for the type filter (bugs / features / all) per CONTEXT D-UI. This plan is the NEW PAGE only — the list/detail extensions on existing bug-reports/feature-requests pages are in Plan 36-05b (split per M-2 fix to ensure dedicated test coverage on each surface).

Purpose: Staff need a workflow surface to review and unapprove items currently in approved_for_build (INCL-05). This is the operational dashboard for "what's in the next build."
Output: One new server-component page + client component + Vitest test file; visual verification via a human-checkpoint task.

**Plan split rationale (M-2 fix in revision pass):** Original 36-05 touched 4 list/detail files plus 3 new files for the next-build-plan page. The list/detail edits had no test coverage. Split into 36-05a (new page, tested) and 36-05b (list/detail extensions, also tested). Both can execute in parallel within Wave 3 because they touch DISJOINT file sets (no overlap).
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/execute-plan.md
@~/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/36-inclusion-approval-state-machine/36-CONTEXT.md
@.planning/phases/36-inclusion-approval-state-machine/36-RESEARCH.md
@.planning/phases/36-inclusion-approval-state-machine/36-02-admin-patch-transitions-PLAN.md

# Source-of-truth references
@src/app/admin/modules/pipeline/[slug]/page.tsx
@src/app/projects/[slug]/releases/FilterChips.tsx
@src/lib/inclusion-state.ts

<interfaces>
<!-- Existing module page structure to mirror. From src/app/admin/modules/pipeline/[slug]/page.tsx — read first to copy the auth-gate + slug param + server-component shape. -->

Available endpoints from Plan 36-02:
- `PATCH /api/platform/bug-reports/[id]` accepts `{inclusionState: 'pending_inclusion' | 'approved_for_build' | 'deferred'}` (any string in INCLUSION_STATES; server validates transitions; 'rejected' NOT accepted as forward target per B-3 fix)
- `PATCH /api/platform/feature-requests/[id]` same

State-machine helper (from Plan 36-01):
- `canManuallyTransition(from, to)` — use to gate action buttons (disable if false)
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Build /admin/modules/next-build-plan/[slug] server-component page + NextBuildPlanClient with Remove-from-Build action and full Vitest coverage</name>
  <files>src/app/admin/modules/next-build-plan/[slug]/page.tsx, src/app/admin/modules/next-build-plan/[slug]/NextBuildPlanClient.tsx, src/app/admin/modules/next-build-plan/[slug]/NextBuildPlanClient.test.tsx</files>
  <read_first>
    - src/app/admin/modules/pipeline/[slug]/page.tsx (server-component pattern: auth gate via requireSignedIn → isStaff guard → params: Promise<{slug}> → notFound() if !staff)
    - src/app/admin/modules/bug-reports/page.tsx (client-component pattern: useState/useCallback/fetch pattern for PATCH + refresh)
    - src/app/projects/[slug]/releases/FilterChips.tsx (reusable filter chips — props: active, counts, onChange)
    - src/lib/inclusion-state.ts (canManuallyTransition — gate Remove-from-Build button)
    - .planning/phases/36-inclusion-approval-state-machine/36-CONTEXT.md (D-Admin-UI: single table mixing bugs+features sorted by approval date desc; ?type= filter chips; no bulk actions; single-row Remove only)
    - .planning/phases/36-inclusion-approval-state-machine/36-RESEARCH.md (Pitfall 9: Next.js 16 async params; auth pattern at src/app/admin/modules/bug-reports/[id]/page.tsx)
  </read_first>
  <behavior>
    - Test 1 (NextBuildPlanClient render): Given 2 bugs + 1 feature in approved_for_build, render a table with 3 rows, each showing type-pill + title + (severity for bug) + 'Remove' button
    - Test 2 (filter chip 'bug' clicked): URL updates to ?type=bug; only bug rows visible; feature rows filtered out
    - Test 3 (filter chip 'feature' clicked): only feature rows visible
    - Test 4 (filter chip 'all' default): both bugs and features visible
    - Test 5 (Remove action): Click 'Remove' on bug row → fetch PATCH `/api/platform/bug-reports/{id}` with body `{inclusionState: 'pending_inclusion'}` → row optimistically removed from view → re-fetch
    - Test 6 (Remove failure rollback): fetch returns 400 → row stays visible → error toast (or inline error indicator)
    - Test 7 (empty state): Zero approved_for_build items → renders empty-state message 'No items approved for build yet — use the Bug Reports / Feature Requests pages to propose and approve'
  </behavior>
  <action>
    1. CREATE the directory: `src/app/admin/modules/next-build-plan/[slug]/`

    2. WRITE TESTS FIRST. Create `src/app/admin/modules/next-build-plan/[slug]/NextBuildPlanClient.test.tsx` using @testing-library/react and the existing pattern from any test file in src/app/admin/modules/ (or extend the pattern from src/app/projects/[slug]/releases/ReleasesClient.test.tsx). Mock `global.fetch`. Tests 1-7 above.

    3. CREATE `src/app/admin/modules/next-build-plan/[slug]/page.tsx` (server component):
    ```typescript
    import { notFound } from 'next/navigation';
    import { requireSignedIn } from '@/lib/api-auth';
    import { getCurrentUserContext } from '@/lib/auth-context';
    import { db } from '@/lib/db';
    import { bugReports, featureRequests, projects } from '@/db/schema';
    import { eq, and, desc } from 'drizzle-orm';
    import NextBuildPlanClient from './NextBuildPlanClient';

    export default async function NextBuildPlanPage({ params }: { params: Promise<{ slug: string }> }) {
      const { error, session } = await requireSignedIn();
      if (error) {
        // requireSignedIn returns a redirect response — Next handles it
        return error;
      }

      const ctx = await getCurrentUserContext(session);
      if (!ctx?.isStaff) notFound();  // No leak: non-staff sees same 404 as bad slug

      const { slug } = await params;  // Pitfall 9: Next.js 16 async params

      const [project] = await db
        .select({ key: projects.key, name: projects.name })
        .from(projects)
        .where(eq(projects.key, slug));
      if (!project) notFound();

      // Mixed query: approved_for_build bugs + features, project-scoped
      const bugs = await db
        .select({
          id: bugReports.id,
          title: bugReports.title,
          severity: bugReports.severity,
          inclusionState: bugReports.inclusionState,
          updatedAt: bugReports.updatedAt,
        })
        .from(bugReports)
        .where(and(
          eq(bugReports.project, slug),
          eq(bugReports.inclusionState, 'approved_for_build'),
        ))
        .orderBy(desc(bugReports.updatedAt));

      const features = await db
        .select({
          id: featureRequests.id,
          title: featureRequests.title,
          inclusionState: featureRequests.inclusionState,
          updatedAt: featureRequests.updatedAt,
        })
        .from(featureRequests)
        .where(and(
          eq(featureRequests.project, slug),
          eq(featureRequests.inclusionState, 'approved_for_build'),
        ))
        .orderBy(desc(featureRequests.updatedAt));

      // Combine and sort by updatedAt desc (closest-to-approval-event first)
      const items = [
        ...bugs.map(b => ({ ...b, type: 'bug' as const, severity: b.severity })),
        ...features.map(f => ({ ...f, type: 'feature' as const, severity: null })),
      ].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

      return <NextBuildPlanClient projectName={project.name} projectSlug={slug} initialItems={items} />;
    }
    ```

    4. CREATE `src/app/admin/modules/next-build-plan/[slug]/NextBuildPlanClient.tsx` (client component) with:
       - Filter chips at top (reuse `<FilterChips active={typeFilter} counts={counts} onChange={...}/>` — import from `@/app/projects/[slug]/releases/FilterChips` OR duplicate locally per CONTEXT Discretion; if duplicating, name `NextBuildPlanFilterChips` to avoid coupling)
       - Table of items: columns Type, Title, Severity (bugs only), Approved (relative time), Action
       - Type pill uses INCLUSION_COLORS (violet bg for approved_for_build) — actually, all rows here ARE approved_for_build so the pill is uniform. Use the type-pill (bug=red, feature=amber) instead for differentiation.
       - 'Remove from build' button per row → calls `fetch(\`/api/platform/\${type === 'bug' ? 'bug-reports' : 'feature-requests'}/\${id}\`, {method: 'PATCH', headers: ..., body: JSON.stringify({inclusionState: 'pending_inclusion'})})` → optimistic removal from list → on success, no-op; on failure, restore row and surface error
       - Empty-state when items.length === 0: 'No items approved for build for {projectName} yet — use Bug Reports / Feature Requests to propose and approve.'
       - URL state for ?type= filter (URLSearchParams + router.push to preserve URL — match existing v2.1 pattern)

    5. Run `npx vitest run src/app/admin/modules/next-build-plan/` — must PASS all 7 tests.
  </action>
  <verify>
    <automated>npx vitest run src/app/admin/modules/next-build-plan/ &amp;&amp; npx next build 2>&amp;1 | tail -20</automated>
  </verify>
  <acceptance_criteria>
    - Files exist: `src/app/admin/modules/next-build-plan/[slug]/page.tsx`, `NextBuildPlanClient.tsx`, `NextBuildPlanClient.test.tsx`
    - `grep -c "isStaff" src/app/admin/modules/next-build-plan/[slug]/page.tsx` returns >= 1 (staff-only gate)
    - `grep -c "notFound()" src/app/admin/modules/next-build-plan/[slug]/page.tsx` returns >= 2 (non-staff + bad project both 404)
    - `grep -c "inclusionState, 'approved_for_build'" src/app/admin/modules/next-build-plan/[slug]/page.tsx` returns 2 (one per entity-type query)
    - `grep -c "Remove from build" src/app/admin/modules/next-build-plan/[slug]/NextBuildPlanClient.tsx` returns >= 1
    - `grep -c "inclusionState: 'pending_inclusion'" src/app/admin/modules/next-build-plan/[slug]/NextBuildPlanClient.tsx` returns >= 1
    - `grep -c "params: Promise<{ slug: string }>" src/app/admin/modules/next-build-plan/[slug]/page.tsx` returns 1 (Next.js 16 async params — Pitfall 9)
    - All NextBuildPlanClient tests pass (7 tests minimum)
    - `npx next build` exits 0 (per-push checklist)
  </acceptance_criteria>
  <done>New /admin/modules/next-build-plan/{slug} page renders approved_for_build items with Remove action; staff-only access enforced; filter chips work; full test coverage on the client component.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 2: Visual + functional verification of next-build-plan page against TMI pilot</name>
  <what-built>
    - New page at `/admin/modules/next-build-plan/{slug}` (staff-only) with filter chips + Remove-from-Build action
    - Full Vitest test coverage for NextBuildPlanClient (7 tests)
    - Build passes
  </what-built>
  <how-to-verify>
    Run admin locally and step through the TMI dogfood flow against the new page:

    1. **Start admin dev server**:
       ```bash
       cd /Users/mikegeehan/claude/triarch/development/admin
       npm run dev
       ```

    2. **Pre-condition: ensure at least one TMI item is in 'approved_for_build' state** (Plan 36-05b will provide UI to do this; for this checkpoint, use SQL or wait for 36-05b):
       ```bash
       # If needed, manually flip a TMI bug to approved_for_build via direct SQL or via the existing PATCH endpoint:
       # curl -X PATCH "http://localhost:3000/api/platform/bug-reports/<some-tmi-bug-uuid>" \
       #   -H "Content-Type: application/json" \
       #   --cookie "<your-session-cookie>" \
       #   -d '{"inclusionState":"approved_for_build"}'
       # (This requires the bug to be in 'pending_inclusion' first; transition triaged→pending_inclusion→approved_for_build.)
       ```

    3. **Visit the new next-build-plan page for TMI**:
       - URL: http://localhost:3000/admin/modules/next-build-plan/tmi
       - Expected: page renders, lists the approved items
       - Confirm: filter chips show counts (e.g. 1 bug, 0 features, 1 all)
       - Click 'feature' chip → bugs filtered out; if no features approved, "No items approved for build" empty state shown
       - Click 'all' or 'bug' chip → bug visible again
       - Click 'Remove from build' on the bug row → row disappears optimistically; verify by refreshing page (should still be gone — inclusion_state is back to pending_inclusion)

    4. **Non-staff verification**:
       - Use the "Preview as customer" toggle from v2.2 Phase 23.1 — try /admin/modules/next-build-plan/tmi → expect 404

    5. **Empty-state verification**:
       - Visit /admin/modules/next-build-plan/some-project-with-no-approvals → expect the empty-state message
       - OR Remove ALL items from the TMI build → page should show empty state

    Expected outcomes (all must be TRUE):
    - Next-build-plan page renders with correct items + filter chips work
    - Remove-from-Build action removes the row and persists the inclusion_state revert
    - Non-staff users get 404 on next-build-plan page
    - Empty state renders correctly when no approved items
  </how-to-verify>
  <resume-signal>Type "approved" when all 5 verification steps pass. If any step fails (e.g., Remove button doesn't optimistically remove, 404 doesn't fire for non-staff, filter chips broken), describe the issue with screenshots/console-error and stop.</resume-signal>
  <files>none — human-only verification of UI behavior</files>
  <action>See &lt;how-to-verify&gt; block above for the full step-by-step sequence the human runs in their browser + shell.</action>
  <done>Human types "approved" per &lt;resume-signal&gt; after every step in &lt;how-to-verify&gt; passes.</done>

</task>

</tasks>

<verification>
- New page renders at /admin/modules/next-build-plan/[slug] with proper auth gate (verifiable via human checkpoint + grep on isStaff/notFound)
- All Vitest tests pass: `npx vitest run src/app/admin/modules/next-build-plan/` (7 tests minimum)
- `npx next build` exits 0
- Manual TMI dogfood flow completes end-to-end (human checkpoint)
</verification>

<success_criteria>
- The next-build-plan page becomes the source of truth for "what's queued for this build" — Mike refers to it during commit + build sessions
- INCL-05 "Remove from build" is the only manual backward transition reachable from this page
- Plan 36-07 (portal /upcoming) can rely on `inclusion_state IN ('approved_for_build', 'built')` as the customer-visible "what's coming" set
- TMI pilot dogfooding can begin against the next-build-plan page immediately after this plan ships
</success_criteria>

<output>
After completion, create `.planning/phases/36-inclusion-approval-state-machine/36-05a-admin-next-build-plan-page-SUMMARY.md` documenting:
- Whether FilterChips was imported from /projects/[slug]/releases OR duplicated locally (Discretion choice)
- TMI dogfood pilot result from the human checkpoint (any UX surprises Mike flagged?)
- Total Vitest test count added (target ≥7)
- Any next.config.ts changes (should be zero — no new transpilePackages needed)
</output>
</content>
</invoke>