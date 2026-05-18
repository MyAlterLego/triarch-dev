---
phase: 36-inclusion-approval-state-machine
plan: 05
type: execute
wave: 3
depends_on: [36-02]
files_modified:
  - src/app/admin/modules/next-build-plan/[slug]/page.tsx
  - src/app/admin/modules/next-build-plan/[slug]/NextBuildPlanClient.tsx
  - src/app/admin/modules/next-build-plan/[slug]/NextBuildPlanClient.test.tsx
  - src/app/admin/modules/bug-reports/page.tsx
  - src/app/admin/modules/feature-requests/page.tsx
  - src/app/admin/modules/bug-reports/[id]/page.tsx
  - src/app/admin/modules/feature-requests/[id]/page.tsx
autonomous: false
requirements: [INCL-03, INCL-04, INCL-05]
must_haves:
  truths:
    - "Navigating to /admin/modules/next-build-plan/{slug} renders a single table of approved_for_build items for that project, mixing bugs and features sorted by approval-event timestamp desc"
    - "Each row shows: type-pill (bug/feature), title, severity (bugs only), approved-at timestamp, and a 'Remove from build' button"
    - "Clicking 'Remove from build' calls PATCH /api/platform/{bug-reports|feature-requests}/{id} with {inclusionState: 'pending_inclusion'}, refreshes the list, and removes the row from view"
    - "Filter chips (?type=all|bug|feature) reuse FilterChips component from /projects/[slug]/releases — same styling, same keyboard handling"
    - "Bug-reports and feature-requests list pages gain an 'Inclusion' column with color-coded pills (violet=approved_for_build, teal=built, blue=deployed, zinc=triaged|pending_inclusion, gray=deferred|rejected) and a dropdown action (Propose for next build / Approve / Defer / Remove from build) per row"
    - "Bug-reports and feature-requests DETAIL pages gain primary action buttons (Propose for next build / Approve for build / Mark as deferred / Mark as rejected) based on current inclusion_state"
    - "Action buttons are gated by canManuallyTransition — disabled (or hidden) for forbidden transitions"
    - "Staff-only auth guard on the new page (requireSignedIn + getCurrentUserContext + isStaff check); non-staff gets 404 (no membership leak)"
  artifacts:
    - path: "src/app/admin/modules/next-build-plan/[slug]/page.tsx"
      provides: "Server-component page: auth gate + project lookup + initial query for approved_for_build bugs+features + render NextBuildPlanClient"
      contains: "approved_for_build"
    - path: "src/app/admin/modules/next-build-plan/[slug]/NextBuildPlanClient.tsx"
      provides: "Client component: filter chips, table render, Remove-from-Build action, optimistic update"
      contains: "Remove from build"
    - path: "src/app/admin/modules/bug-reports/page.tsx"
      provides: "Existing list-page extended with Inclusion column + dropdown action"
      contains: "INCLUSION_COLORS"
    - path: "src/app/admin/modules/feature-requests/page.tsx"
      provides: "Existing list-page extended with Inclusion column + dropdown action"
      contains: "INCLUSION_COLORS"
    - path: "src/app/admin/modules/bug-reports/[id]/page.tsx"
      provides: "Detail page extended with inclusion-state primary action buttons"
      contains: "Propose for next build"
    - path: "src/app/admin/modules/feature-requests/[id]/page.tsx"
      provides: "Detail page extended with inclusion-state primary action buttons"
      contains: "Propose for next build"
  key_links:
    - from: "src/app/admin/modules/next-build-plan/[slug]/NextBuildPlanClient.tsx"
      to: "PATCH /api/platform/{bug-reports|feature-requests}/[id]"
      via: "fetch with body {inclusionState: 'pending_inclusion'}"
      pattern: "inclusionState: 'pending_inclusion'"
    - from: "src/app/admin/modules/next-build-plan/[slug]/page.tsx"
      to: "bugReports + featureRequests inclusionState='approved_for_build'"
      via: "drizzle SELECT WHERE eq(inclusionState, 'approved_for_build') AND eq(project, slug)"
      pattern: "inclusionState, 'approved_for_build'"
    - from: "src/app/admin/modules/bug-reports/page.tsx"
      to: "GET /api/platform/bug-reports?inclusion_state=..."
      via: "fetch URL param when staff selects inclusion filter dropdown"
      pattern: "inclusion_state="
---

<objective>
Build the admin UI surface for INCL-03/04/05: the new `/admin/modules/next-build-plan/[slug]` page (staff-only) that lists `approved_for_build` items for a project with inline "Remove from build" action, PLUS extensions to the existing `/admin/modules/bug-reports` and `/admin/modules/feature-requests` list pages (add `Inclusion` column + dropdown action) and detail pages (add primary action buttons for state transitions). All UI consumes the PATCH endpoints already shipped in Plan 36-02 and the LIST filter param also from Plan 36-02. Reuses the existing `FilterChips` component for the type filter (bugs / features / all) per CONTEXT D-UI.

Purpose: Staff need a workflow surface to (a) move items into approved_for_build (INCL-03/04 — list + detail dropdown/primary actions) and (b) review and unapprove items currently in approved_for_build (INCL-05 — the new page). This is the operational dashboard for the Triarch build-cycle workflow.
Output: One new server-component page + client component + tests; four existing pages extended with inclusion-state UI; visual verification via a human-checkpoint task.
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
@src/app/admin/modules/bug-reports/page.tsx
@src/app/admin/modules/feature-requests/page.tsx
@src/app/admin/modules/bug-reports/[id]/page.tsx
@src/app/admin/modules/feature-requests/[id]/page.tsx
@src/app/admin/modules/pipeline/[slug]/page.tsx
@src/app/projects/[slug]/releases/FilterChips.tsx

<interfaces>
<!-- Existing module page structure to mirror. From src/app/admin/modules/pipeline/[slug]/page.tsx — read first to copy the auth-gate + slug param + server-component shape. -->

Existing list-page pattern (from src/app/admin/modules/bug-reports/page.tsx):
```typescript
'use client';
// State management via useState + useCallback fetchBugs
// Renders <select> filters for project + status; status filter URL param sent as ?status=
async function updateBug(id: string, updates: Record<string, unknown>) {
  await fetch(`/api/platform/bug-reports/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  await fetchBugs();
}
```

Existing STATUS_COLORS pattern (from src/app/admin/modules/bug-reports/page.tsx line 32-41):
```typescript
const STATUS_COLORS: Record<string, string> = {
  submitted: 'bg-zinc-700 text-zinc-300',
  triaged: 'bg-blue-500/20 text-blue-400',
  // etc
};
```

NEW Inclusion color palette (locked by CONTEXT D-UI, parallels v2.1 status column):
```typescript
const INCLUSION_COLORS: Record<string, string> = {
  triaged:            'bg-zinc-700 text-zinc-300',         // unprocessed
  pending_inclusion:  'bg-zinc-600 text-zinc-200',         // staff is considering
  approved_for_build: 'bg-violet-500/20 text-violet-300',  // approved — locked
  built:              'bg-teal-500/20 text-teal-300',      // commit landed in dev — locked
  deployed:           'bg-blue-500/20 text-blue-300',      // shipped to prod — locked
  deferred:           'bg-amber-500/20 text-amber-400',    // explicitly deferred
  rejected:           'bg-red-500/20 text-red-400',        // explicitly rejected
};
```

Available endpoints from Plan 36-02:
- `PATCH /api/platform/bug-reports/[id]` accepts `{inclusionState: 'pending_inclusion' | 'approved_for_build' | 'deferred' | 'rejected'}` (any string in INCLUSION_STATES; server validates transitions)
- `PATCH /api/platform/feature-requests/[id]` same
- `GET /api/platform/bug-reports?inclusion_state=approved_for_build` filters list
- `GET /api/platform/feature-requests?inclusion_state=approved_for_build` filters list

State-machine helper (from Plan 36-01):
- `canManuallyTransition(from, to)` — use to gate action buttons (disable if false)
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Build /admin/modules/next-build-plan/[slug] server-component page + NextBuildPlanClient with Remove-from-Build action</name>
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
    - All NextBuildPlanClient tests pass
    - `npx next build` exits 0 (per-push checklist)
  </acceptance_criteria>
  <done>New /admin/modules/next-build-plan/{slug} page renders approved_for_build items with Remove action; staff-only access enforced; filter chips work; full test coverage.</done>
</task>

<task type="auto">
  <name>Task 2: Extend bug-reports + feature-requests LIST pages with Inclusion column + dropdown action; extend DETAIL pages with primary action buttons</name>
  <files>src/app/admin/modules/bug-reports/page.tsx, src/app/admin/modules/feature-requests/page.tsx, src/app/admin/modules/bug-reports/[id]/page.tsx, src/app/admin/modules/feature-requests/[id]/page.tsx</files>
  <read_first>
    - src/app/admin/modules/bug-reports/page.tsx (current full file — read state-management pattern around lines 1-100; row-render around expandedId pattern)
    - src/app/admin/modules/feature-requests/page.tsx (current full file)
    - src/app/admin/modules/bug-reports/[id]/page.tsx (current detail-page pattern — auth gate + render)
    - src/app/admin/modules/feature-requests/[id]/page.tsx (current)
    - src/lib/inclusion-state.ts (INCLUSION_STATES + canManuallyTransition for gating actions)
    - .planning/phases/36-inclusion-approval-state-machine/36-CONTEXT.md (D-UI: violet/teal/blue/zinc pill palette locked; dropdown on list rows; primary buttons on detail pages)
  </read_first>
  <action>
    1. EDIT `src/app/admin/modules/bug-reports/page.tsx`:

       a. Add INCLUSION_COLORS map near the existing STATUS_COLORS (around line 32):
       ```typescript
       const INCLUSION_COLORS: Record<string, string> = {
         triaged:            'bg-zinc-700 text-zinc-300',
         pending_inclusion:  'bg-zinc-600 text-zinc-200',
         approved_for_build: 'bg-violet-500/20 text-violet-300',
         built:              'bg-teal-500/20 text-teal-300',
         deployed:           'bg-blue-500/20 text-blue-300',
         deferred:           'bg-amber-500/20 text-amber-400',
         rejected:           'bg-red-500/20 text-red-400',
       };
       const INCLUSION_STATES_LIST = ['all', 'triaged', 'pending_inclusion', 'approved_for_build', 'built', 'deployed', 'deferred', 'rejected'];
       ```

       b. Extend the BugReport interface (line 8-23) to include `inclusionState: string;`.

       c. Add an inclusion-state filter dropdown next to the existing status filter (around lines 91-101) — same `<select>` pattern:
       ```typescript
       const [inclusionFilter, setInclusionFilter] = useState('all');
       // ...
       <select value={inclusionFilter} onChange={(e) => setInclusionFilter(e.target.value)} className="...">
         {INCLUSION_STATES_LIST.map((s) => <option key={s} value={s}>{s === 'all' ? 'All Inclusion' : s.replace(/_/g, ' ')}</option>)}
       </select>
       ```

       d. Extend fetchBugs to include `?inclusion_state=` when filter is not 'all':
       ```typescript
       if (inclusionFilter !== 'all') params.set('inclusion_state', inclusionFilter);
       // Add inclusionFilter to useCallback dependency array
       ```

       e. In the bug row render area (around line 115-180), add an Inclusion column showing:
       ```tsx
       <span className={`text-xs px-2 py-1 rounded-md ${INCLUSION_COLORS[bug.inclusionState] ?? INCLUSION_COLORS.triaged}`}>
         {bug.inclusionState.replace(/_/g, ' ')}
       </span>
       ```

       f. Add a small dropdown action (use a `<details>` element or simple `<select>`) per row that calls `updateBug(bug.id, {inclusionState: '<new-state>'})`. Only show transitions where `canManuallyTransition(bug.inclusionState, target)` returns true.

       g. Import `canManuallyTransition, INCLUSION_STATES` from `@/lib/inclusion-state`.

    2. EDIT `src/app/admin/modules/feature-requests/page.tsx` with the IDENTICAL transformation (substitute featureRequests fields/types).

    3. EDIT `src/app/admin/modules/bug-reports/[id]/page.tsx` (detail page) — add primary-action buttons:
       a. Read current inclusion_state of the bug.
       b. Render a "Build inclusion" section with buttons for each valid forward transition:
       ```tsx
       {bug.inclusionState === 'triaged' && (
         <button onClick={() => patchAction({inclusionState: 'pending_inclusion'})}>Propose for next build</button>
       )}
       {bug.inclusionState === 'pending_inclusion' && (
         <>
           <button onClick={() => patchAction({inclusionState: 'approved_for_build'})}>Approve for build</button>
           <button onClick={() => patchAction({inclusionState: 'deferred'})}>Defer</button>
           <button onClick={() => patchAction({inclusionState: 'rejected'})}>Reject</button>
         </>
       )}
       {bug.inclusionState === 'approved_for_build' && (
         <button onClick={() => patchAction({inclusionState: 'pending_inclusion'})}>Remove from build</button>
       )}
       {/* built/deployed: terminal — show pill, no actions */}
       ```
       Use `canManuallyTransition` to gate each button programmatically rather than the explicit if-tree above (cleaner) — render a button for every transition where `canManuallyTransition(current, target)` is true, with a label map.

    4. EDIT `src/app/admin/modules/feature-requests/[id]/page.tsx` with the IDENTICAL transformation.

    5. Verify with `npx next build` (per workspace checklist).
  </action>
  <verify>
    <automated>grep -c "INCLUSION_COLORS" src/app/admin/modules/bug-reports/page.tsx &amp;&amp; grep -c "INCLUSION_COLORS" src/app/admin/modules/feature-requests/page.tsx &amp;&amp; grep -c "Propose for next build" src/app/admin/modules/bug-reports/[id]/page.tsx &amp;&amp; grep -c "Propose for next build" src/app/admin/modules/feature-requests/[id]/page.tsx &amp;&amp; npx next build 2>&amp;1 | tail -10</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "INCLUSION_COLORS" src/app/admin/modules/bug-reports/page.tsx` returns >= 2 (definition + use in row render)
    - `grep -c "INCLUSION_COLORS" src/app/admin/modules/feature-requests/page.tsx` returns >= 2
    - `grep -c "inclusionState" src/app/admin/modules/bug-reports/page.tsx` returns >= 3 (interface field + filter state + row render)
    - `grep -c "inclusionState" src/app/admin/modules/feature-requests/page.tsx` returns >= 3
    - `grep -c "Propose for next build" src/app/admin/modules/bug-reports/[id]/page.tsx` returns 1
    - `grep -c "Propose for next build" src/app/admin/modules/feature-requests/[id]/page.tsx` returns 1
    - `grep -c "Approve for build" src/app/admin/modules/bug-reports/[id]/page.tsx` returns 1
    - `grep -c "canManuallyTransition" src/app/admin/modules/bug-reports/[id]/page.tsx` returns >= 1
    - `grep -c "canManuallyTransition" src/app/admin/modules/feature-requests/[id]/page.tsx` returns >= 1
    - `grep -c "violet-500/20" src/app/admin/modules/bug-reports/page.tsx` returns >= 1 (approved_for_build palette locked per CONTEXT)
    - `npx next build` exits 0
  </acceptance_criteria>
  <done>Bug-reports + feature-requests list pages show Inclusion column + dropdown action; detail pages show primary action buttons gated by canManuallyTransition; CONTEXT pill palette honored; build clean.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: Visual + functional verification of next-build-plan page + list/detail extensions against TMI pilot</name>
  <what-built>
    - New page at `/admin/modules/next-build-plan/{slug}` (staff-only) with filter chips + Remove-from-Build action
    - Inclusion column + dropdown action on /admin/modules/bug-reports and /admin/modules/feature-requests list pages
    - Primary action buttons on detail pages
    - Full test coverage for NextBuildPlanClient
    - Build passes
  </what-built>
  <how-to-verify>
    Run admin locally and step through the TMI dogfood flow:

    1. **Start admin dev server**:
       ```bash
       cd /Users/mikegeehan/claude/triarch/development/admin
       npm run dev
       ```

    2. **Visit a TMI bug detail page**:
       - URL: http://localhost:3000/admin/modules/bug-reports/{tmi-bug-uuid}
       - Confirm: "Propose for next build" button visible (assuming current inclusion_state='triaged')
       - Click it. Page should refresh; the button label should now be one of "Approve for build" / "Defer" / "Reject" (current state is now pending_inclusion).
       - Click "Approve for build". Verify the bug now shows inclusion_state='approved_for_build' (refresh page).

    3. **Visit the new next-build-plan page for TMI**:
       - URL: http://localhost:3000/admin/modules/next-build-plan/tmi
       - Expected: page renders, lists the bug you just approved
       - Confirm: filter chips show counts (1 bug, 0 features, 1 all)
       - Click 'feature' chip → bug filtered out; "No items approved for build" empty state shown
       - Click 'all' or 'bug' chip → bug visible again
       - Click 'Remove from build' on the bug row → row disappears optimistically; verify by refreshing page (should still be gone — inclusion_state is back to pending_inclusion)

    4. **Visit /admin/modules/bug-reports**:
       - Confirm: new "Inclusion" column visible per row
       - Apply inclusion filter `pending_inclusion` → only your test bug visible (assuming TMI is the only project you've been manipulating)

    5. **Try the negative path**:
       - On a bug currently in 'built' state (if you have one), confirm: NO "Propose for next build" / "Approve" / "Remove" buttons are shown (built is auto-only — terminal for manual surface)

    6. **Non-staff verification (optional but recommended)**:
       - Use the "Preview as customer" toggle from v2.2 Phase 23.1 — try /admin/modules/next-build-plan/tmi → expect 404

    Expected outcomes (all must be TRUE):
    - Next-build-plan page renders with correct items + filter chips work
    - Remove-from-Build action removes the row and persists the inclusion_state revert
    - List pages show Inclusion column with correct pill colors (violet for approved_for_build, etc.)
    - Detail-page action buttons appear/disappear correctly per state machine
    - Non-staff users get 404 on next-build-plan page
  </how-to-verify>
  <resume-signal>Type "approved" when all 6 verification steps pass. If any step fails (e.g., Remove button doesn't optimistically remove, action button shows for invalid transition, or 404 doesn't fire for non-staff), describe the issue with screenshots/console-error and stop.</resume-signal>
  <files>none — human-only orchestration of CLI/git/npm/firebase commands</files>
  <action>See &lt;how-to-verify&gt; block below for the full step-by-step sequence the human runs in their shell. This task gates downstream plans because publish/install/db:push are human-orchestrated.</action>
  <verify>
    <automated>MISSING — verification is human-only per &lt;how-to-verify&gt; block</automated>
  </verify>
  <done>Human types "approved" per &lt;resume-signal&gt; after every step in &lt;how-to-verify&gt; passes.</done>

</task>

</tasks>

<verification>
- New page renders at /admin/modules/next-build-plan/[slug] with proper auth gate (verifiable via human checkpoint + grep on isStaff/notFound)
- List pages now show Inclusion column with correct color palette (verifiable: grep for INCLUSION_COLORS + violet-500/20)
- Detail pages now show inclusion-state action buttons gated by canManuallyTransition (verifiable: grep for "Propose for next build" + canManuallyTransition)
- All Vitest tests pass: `npx vitest run src/app/admin/modules/next-build-plan/`
- `npx next build` exits 0
- Manual TMI dogfood flow completes end-to-end (human checkpoint)
</verification>

<success_criteria>
- Mike can move a TMI bug through the full state machine (triaged → pending_inclusion → approved_for_build → [auto] built → [auto] deployed) using only the admin UI
- The next-build-plan page becomes the source of truth for "what's queued for this build" — Mike refers to it during commit + build sessions
- INCL-05 "Remove from build" is the only manual backward transition reachable from the UI (canManuallyTransition + button gating both enforce this)
- Plan 36-07 (portal /upcoming) can rely on `inclusion_state IN ('approved_for_build', 'built')` as the customer-visible "what's coming" set
- TMI pilot dogfooding can begin immediately after this plan ships (no more blocked-by-UI scenarios for staff)
</success_criteria>

<output>
After completion, create `.planning/phases/36-inclusion-approval-state-machine/36-05-admin-next-build-plan-ui-SUMMARY.md` documenting:
- Whether FilterChips was imported from /projects/[slug]/releases OR duplicated locally (Discretion choice)
- Final UX choice on list-page dropdown action: `<select>` vs `<details>` vs custom popover
- TMI dogfood pilot result from the human checkpoint (any UX surprises Mike flagged?)
- Whether the "Defer"/"Reject" buttons made the cut on the detail page (they're allowed by canManuallyTransition but not strictly required by INCL-04 if Mike wants a leaner detail surface)
- Total Vitest test count added
- Any next.config.ts changes (should be zero — no new transpilePackages needed)
</output>
