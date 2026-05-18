---
phase: 36-inclusion-approval-state-machine
plan: 05b
type: execute
wave: 3
depends_on: [36-02]
files_modified:
  - src/app/admin/modules/bug-reports/page.tsx
  - src/app/admin/modules/bug-reports/page.test.tsx
  - src/app/admin/modules/feature-requests/page.tsx
  - src/app/admin/modules/feature-requests/page.test.tsx
  - src/app/admin/modules/bug-reports/[id]/page.tsx
  - src/app/admin/modules/bug-reports/[id]/page.test.tsx
  - src/app/admin/modules/feature-requests/[id]/page.tsx
  - src/app/admin/modules/feature-requests/[id]/page.test.tsx
autonomous: false
requirements: [INCL-03, INCL-04]
must_haves:
  truths:
    - "Bug-reports and feature-requests list pages gain an 'Inclusion' column with color-coded pills (violet=approved_for_build, teal=built, blue=deployed, zinc=triaged|pending_inclusion, amber=deferred, red=rejected) and a dropdown action (Propose for next build / Approve / Defer / Remove from build) per row"
    - "Bug-reports and feature-requests DETAIL pages gain primary action buttons (Propose for next build / Approve for build / Defer / Remove from build) based on current inclusion_state. NO Reject button (per B-3 fix — no INCL requirement covers it; v3.0 candidate with customer approval surface)"
    - "Action buttons are gated by canManuallyTransition — disabled (or hidden) for forbidden transitions"
    - "Each modified file has Vitest test coverage for the new Inclusion column + dropdown action (or for the detail-page action buttons)"
    - "List-page inclusion filter dropdown sends ?inclusion_state= URL param to GET endpoint (Plan 36-02 Task 3 added the server-side filter)"
  artifacts:
    - path: "src/app/admin/modules/bug-reports/page.tsx"
      provides: "Existing list-page extended with Inclusion column + dropdown action + inclusion filter dropdown"
      contains: "INCLUSION_COLORS"
    - path: "src/app/admin/modules/feature-requests/page.tsx"
      provides: "Existing list-page extended with Inclusion column + dropdown action + inclusion filter dropdown"
      contains: "INCLUSION_COLORS"
    - path: "src/app/admin/modules/bug-reports/[id]/page.tsx"
      provides: "Detail page extended with inclusion-state primary action buttons (NO Reject button per B-3)"
      contains: "Propose for next build"
    - path: "src/app/admin/modules/feature-requests/[id]/page.tsx"
      provides: "Detail page extended with inclusion-state primary action buttons (NO Reject button per B-3)"
      contains: "Propose for next build"
  key_links:
    - from: "src/app/admin/modules/bug-reports/page.tsx"
      to: "GET /api/platform/bug-reports?inclusion_state=..."
      via: "fetch URL param when staff selects inclusion filter dropdown"
      pattern: "inclusion_state="
    - from: "src/app/admin/modules/bug-reports/[id]/page.tsx"
      to: "PATCH /api/platform/bug-reports/[id]"
      via: "fetch with body {inclusionState: <target-state>}"
      pattern: "inclusionState:"
    - from: "src/app/admin/modules/bug-reports/[id]/page.tsx"
      to: "canManuallyTransition from @/lib/inclusion-state"
      via: "import + gate action button rendering"
      pattern: "canManuallyTransition"
---

<objective>
Extend the existing `/admin/modules/bug-reports` and `/admin/modules/feature-requests` list pages (add `Inclusion` column + dropdown action + inclusion filter) and detail pages (add primary action buttons for state transitions). All UI consumes the PATCH endpoints already shipped in Plan 36-02 and the LIST filter param also from Plan 36-02. Each modified file MUST gain Vitest test coverage for the new behavior per M-2 fix in the revision pass.

**Plan split rationale (M-2 fix):** Originally 36-05 Task 2 modified these 4 files without test coverage. Split into 36-05b (this plan) which mandates test coverage on every modified file. Parallel-safe with 36-05a in Wave 3 because file sets are disjoint.

**Reject button DROP (B-3 fix):** No INCL requirement enumerates a manual `* → rejected` transition. The v2.4 customer surface is read-only — Reject belongs in v3.0 with the customer-approval surface. Detail-page actions are ONLY: Propose for next build (triaged→pending_inclusion), Approve for build (pending_inclusion→approved_for_build), Defer (pending_inclusion→deferred), Remove from build (approved_for_build→pending_inclusion). The state-machine helper in Plan 36-01 has been updated (per B-3) to remove 'rejected' from manual transition targets — `canManuallyTransition('pending_inclusion', 'rejected')` will return false, so even if an executor renders a Reject button it would be permanently disabled.

Purpose: Staff need a workflow surface to (a) move items into approved_for_build (INCL-03/04 — list + detail dropdown/primary actions) and (b) filter/find items by their inclusion state across the existing bug-reports/feature-requests pages.
Output: 4 existing pages extended with inclusion-state UI + 4 new test files; visual verification handled by Plan 36-05a's checkpoint OR a dedicated checkpoint here (we add one for safety).
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
@src/lib/inclusion-state.ts

<interfaces>
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

NEW Inclusion color palette (locked by CONTEXT D-UI, parallels v2.1 status column):
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
```

Available endpoints from Plan 36-02 (Task 3):
- `GET /api/platform/bug-reports?inclusion_state=approved_for_build` filters list
- `GET /api/platform/feature-requests?inclusion_state=approved_for_build` filters list

State-machine helper (from Plan 36-01):
- `canManuallyTransition(from, to)` — use to gate action buttons. Per B-3 update, returns false for `* → rejected` from any state other than self.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Extend bug-reports + feature-requests LIST pages with Inclusion column + dropdown action + inclusion filter dropdown, with Vitest coverage</name>
  <files>src/app/admin/modules/bug-reports/page.tsx, src/app/admin/modules/bug-reports/page.test.tsx, src/app/admin/modules/feature-requests/page.tsx, src/app/admin/modules/feature-requests/page.test.tsx</files>
  <read_first>
    - src/app/admin/modules/bug-reports/page.tsx (current full file)
    - src/app/admin/modules/feature-requests/page.tsx (current full file)
    - src/lib/inclusion-state.ts (INCLUSION_STATES + canManuallyTransition for gating actions; note 'rejected' is NOT a forward target per B-3)
    - .planning/phases/36-inclusion-approval-state-machine/36-CONTEXT.md (D-UI: violet/teal/blue/zinc pill palette locked; dropdown on list rows; AND <amendments> block for B-3 'rejected' clarification)
  </read_first>
  <behavior>
    - Test 1 (Inclusion column renders): mock fetchBugs returning 3 bugs with various inclusion states; render shows the new Inclusion column with the correct color-coded pill per row
    - Test 2 (Dropdown action triggers PATCH): click the inclusion dropdown on a 'triaged' bug; select 'Propose for next build'; assert fetch called with PATCH /api/platform/bug-reports/{id} body `{inclusionState: 'pending_inclusion'}`
    - Test 3 (Dropdown gates by canManuallyTransition): for a bug in 'built' state, dropdown shows no actions (or all are disabled)
    - Test 4 (Dropdown does NOT include Reject — B-3): for a bug in 'pending_inclusion', dropdown options are Approve for build, Defer, Remove from build — NO 'Reject' option visible
    - Test 5 (Inclusion filter dropdown sends URL param): select 'approved_for_build' from inclusion filter; assert fetch URL includes `?inclusion_state=approved_for_build`
    - Test 6 (back-compat with status filter): existing status filter still works alongside the new inclusion filter
    - Same 6 tests for feature-requests/page.tsx (Test 1-6 with featureRequests substitutions)
  </behavior>
  <action>
    1. WRITE TESTS FIRST. Create `src/app/admin/modules/bug-reports/page.test.tsx` if it does not exist. Use @testing-library/react + the existing pattern from `src/app/admin/modules/next-build-plan/[slug]/NextBuildPlanClient.test.tsx` (created in Plan 36-05a) for fetch mocking. Tests 1-6 above for bug-reports.

    2. ALSO write `src/app/admin/modules/feature-requests/page.test.tsx` with identical 6 tests adapted for feature-requests.

    3. EDIT `src/app/admin/modules/bug-reports/page.tsx`:

       a. Add INCLUSION_COLORS map near the existing STATUS_COLORS (around line 32) using the palette from the interfaces block above.
       Also add: `const INCLUSION_STATES_LIST = ['all', 'triaged', 'pending_inclusion', 'approved_for_build', 'built', 'deployed', 'deferred', 'rejected'];`

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

       f. Add a small dropdown action (use a `<details>` element or simple `<select>`) per row that calls `updateBug(bug.id, {inclusionState: '<new-state>'})`. ONLY show transitions where `canManuallyTransition(bug.inclusionState, target)` returns true. Iterate INCLUSION_STATES and filter — this naturally excludes 'rejected' per B-3 since canManuallyTransition never returns true for it as a target.

       g. Import `canManuallyTransition, INCLUSION_STATES` from `@/lib/inclusion-state`.

    4. EDIT `src/app/admin/modules/feature-requests/page.tsx` with the IDENTICAL transformation (substitute featureRequests fields/types).

    5. Run tests for both list pages — must PASS, then verify build:
    ```bash
    npx vitest run src/app/admin/modules/bug-reports/page.test.tsx src/app/admin/modules/feature-requests/page.test.tsx
    npx next build
    ```
  </action>
  <verify>
    <automated>npx vitest run src/app/admin/modules/bug-reports/page.test.tsx src/app/admin/modules/feature-requests/page.test.tsx</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "INCLUSION_COLORS" src/app/admin/modules/bug-reports/page.tsx` returns >= 2 (definition + use in row render)
    - `grep -c "INCLUSION_COLORS" src/app/admin/modules/feature-requests/page.tsx` returns >= 2
    - `grep -c "inclusionState" src/app/admin/modules/bug-reports/page.tsx` returns >= 3 (interface field + filter state + row render)
    - `grep -c "inclusionState" src/app/admin/modules/feature-requests/page.tsx` returns >= 3
    - `grep -c "violet-500/20" src/app/admin/modules/bug-reports/page.tsx` returns >= 1 (approved_for_build palette locked per CONTEXT)
    - `grep -c "inclusion_state=" src/app/admin/modules/bug-reports/page.tsx` returns >= 1 (URL param when filter active)
    - File `src/app/admin/modules/bug-reports/page.test.tsx` exists with >= 6 passing tests
    - File `src/app/admin/modules/feature-requests/page.test.tsx` exists with >= 6 passing tests
    - `npx next build` exits 0
  </acceptance_criteria>
  <done>Both list pages show Inclusion column + dropdown action + inclusion filter; both have new Vitest coverage; B-3 'rejected' exclusion enforced via canManuallyTransition gating (zero option rendered with target='rejected').</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Extend bug-reports + feature-requests DETAIL pages with primary action buttons (NO Reject button per B-3), with Vitest coverage</name>
  <files>src/app/admin/modules/bug-reports/[id]/page.tsx, src/app/admin/modules/bug-reports/[id]/page.test.tsx, src/app/admin/modules/feature-requests/[id]/page.tsx, src/app/admin/modules/feature-requests/[id]/page.test.tsx</files>
  <read_first>
    - src/app/admin/modules/bug-reports/[id]/page.tsx (current detail-page pattern — auth gate + render)
    - src/app/admin/modules/feature-requests/[id]/page.tsx (current)
    - src/lib/inclusion-state.ts (INCLUSION_STATES + canManuallyTransition; note 'rejected' is NOT a forward manual target — B-3 fix means the natural canManuallyTransition gate already excludes Reject button rendering)
    - .planning/phases/36-inclusion-approval-state-machine/36-CONTEXT.md (D-UI: primary buttons on detail pages; AND <amendments> block: no Reject button in v2.4)
  </read_first>
  <behavior>
    - Test 1 (triaged → shows Propose button): bug in 'triaged' state; page renders "Propose for next build" button; clicking it issues PATCH with `{inclusionState: 'pending_inclusion'}`
    - Test 2 (pending_inclusion → shows Approve + Defer buttons, NO Reject): bug in 'pending_inclusion'; page renders "Approve for build" AND "Defer" buttons; NO "Reject" button visible (B-3 fix)
    - Test 3 (approved_for_build → shows Remove): bug in 'approved_for_build'; page renders "Remove from build" button
    - Test 4 (built/deployed → no action buttons): bug in 'built' or 'deployed'; no inclusion-state action buttons rendered (terminal states for manual surface)
    - Test 5 (gating via canManuallyTransition): assert that the rendered button set exactly matches canManuallyTransition's allowed targets for the current state — no button is rendered for a transition that returns false
    - Same 5 tests for feature-requests/[id]/page.tsx
  </behavior>
  <action>
    1. WRITE TESTS FIRST. Create `src/app/admin/modules/bug-reports/[id]/page.test.tsx`. Mock the data fetching (or render the client portion in isolation if the page is a server component). Tests 1-5 above for bug-reports detail.

    2. ALSO write `src/app/admin/modules/feature-requests/[id]/page.test.tsx` with identical 5 tests.

    3. EDIT `src/app/admin/modules/bug-reports/[id]/page.tsx`:
       a. Read current inclusion_state of the bug.
       b. Render a "Build inclusion" section with buttons. Use `canManuallyTransition` to gate buttons programmatically — render a button for every transition where `canManuallyTransition(current, target)` is true, with a label map:
       ```typescript
       const ACTION_LABELS: Record<string, string> = {
         pending_inclusion: 'Propose for next build',
         approved_for_build: 'Approve for build',
         deferred: 'Defer',
         triaged: 'Reset to triaged',
       };
       // NOTE per B-3: no entry for 'rejected' as a target. canManuallyTransition will never
       // return true for it from non-rejected states, so even if added the button would never render.
       // Omitting the label entry makes the intent explicit.

       // Special case for INCL-05 "Remove from build" relabel:
       const labelFor = (from: string, target: string): string => {
         if (from === 'approved_for_build' && target === 'pending_inclusion') return 'Remove from build';
         return ACTION_LABELS[target] ?? target.replace(/_/g, ' ');
       };

       // Render: for each valid forward transition, show button
       {INCLUSION_STATES
         .filter(target => canManuallyTransition(bug.inclusionState, target))
         .map(target => (
           <button key={target} onClick={() => patchAction({inclusionState: target})}>
             {labelFor(bug.inclusionState, target)}
           </button>
         ))}
       ```

       This iterate-and-filter approach is CLEANER than an explicit if-tree because it auto-respects the state machine. The B-3 fix in Plan 36-01 means no button is ever rendered with target='rejected' because `canManuallyTransition(any, 'rejected')` returns false for all source states except 'rejected' itself (and 'rejected' has no transition path to itself).

    4. EDIT `src/app/admin/modules/feature-requests/[id]/page.tsx` with the IDENTICAL transformation.

    5. Run tests + build:
    ```bash
    npx vitest run "src/app/admin/modules/bug-reports/[id]/page.test.tsx" "src/app/admin/modules/feature-requests/[id]/page.test.tsx"
    npx next build
    ```
  </action>
  <verify>
    <automated>npx vitest run "src/app/admin/modules/bug-reports/[id]/page.test.tsx" "src/app/admin/modules/feature-requests/[id]/page.test.tsx"</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "Propose for next build" src/app/admin/modules/bug-reports/[id]/page.tsx` returns 1 (in ACTION_LABELS map)
    - `grep -c "Propose for next build" src/app/admin/modules/feature-requests/[id]/page.tsx` returns 1
    - `grep -c "Approve for build" src/app/admin/modules/bug-reports/[id]/page.tsx` returns 1
    - `grep -c "Remove from build" src/app/admin/modules/bug-reports/[id]/page.tsx` returns 1
    - `grep -c "canManuallyTransition" src/app/admin/modules/bug-reports/[id]/page.tsx` returns >= 1
    - `grep -c "canManuallyTransition" src/app/admin/modules/feature-requests/[id]/page.tsx` returns >= 1
    - `grep -ci "reject" src/app/admin/modules/bug-reports/[id]/page.tsx` returns 0 (B-3 fix — no Reject button copy on detail page)
    - `grep -ci "reject" src/app/admin/modules/feature-requests/[id]/page.tsx` returns 0 (B-3 fix)
    - File `src/app/admin/modules/bug-reports/[id]/page.test.tsx` exists with >= 5 passing tests
    - File `src/app/admin/modules/feature-requests/[id]/page.test.tsx` exists with >= 5 passing tests
    - `npx next build` exits 0
  </acceptance_criteria>
  <done>Both detail pages render primary inclusion-state action buttons gated by canManuallyTransition; NO Reject button per B-3; full Vitest coverage on both files.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: Visual verification of list-page Inclusion column + detail-page action buttons against TMI</name>
  <what-built>
    - Inclusion column + dropdown action on /admin/modules/bug-reports and /admin/modules/feature-requests list pages
    - Primary action buttons on detail pages (Propose / Approve / Defer / Remove — NO Reject per B-3)
    - 4 new test files (list page test + detail page test for both bug-reports and feature-requests)
    - Build passes
  </what-built>
  <how-to-verify>
    Run admin locally and step through the TMI dogfood flow against the modified list + detail pages:

    1. **Start admin dev server**:
       ```bash
       cd /Users/mikegeehan/claude/triarch/development/admin
       npm run dev
       ```

    2. **Visit a TMI bug detail page**:
       - URL: http://localhost:3000/admin/modules/bug-reports/{tmi-bug-uuid}
       - Confirm: "Propose for next build" button visible (assuming current inclusion_state='triaged')
       - Click it. Page should refresh; the button label should now be one of "Approve for build" / "Defer" (NOT "Reject" — per B-3).
       - Confirm: NO button labeled "Reject" or similar is visible (B-3 fix).
       - Click "Approve for build". Verify the bug now shows inclusion_state='approved_for_build' (refresh page).
       - On the now-approved bug, confirm only "Remove from build" action is visible (INCL-05).

    3. **Visit /admin/modules/bug-reports** (list page):
       - Confirm: new "Inclusion" column visible per row
       - Confirm: each row has correct color-coded pill (violet for approved, teal for built, etc.)
       - Apply inclusion filter `pending_inclusion` → only matching bugs visible
       - Apply inclusion filter `approved_for_build` → only approved bugs visible
       - Reset filter to "All Inclusion" → all bugs visible again
       - Click the dropdown action on a bug → confirm options match canManuallyTransition (no Reject option per B-3)

    4. **Same verification on /admin/modules/feature-requests** + a feature detail page.

    5. **Try the negative path**:
       - On a bug currently in 'built' state (if you have one), confirm: NO action buttons shown (built is auto-only — terminal for manual surface)
       - On a bug currently in 'deferred' state, confirm: only "Reset to triaged" or similar recovery action shown

    Expected outcomes (all must be TRUE):
    - List pages show Inclusion column with correct pill colors (violet for approved_for_build, etc.)
    - List page inclusion filter dropdown filters results correctly
    - Detail-page action buttons appear/disappear correctly per state machine
    - NO Reject button anywhere on detail pages (B-3 enforcement check)
    - Dropdown options on list rows do not include Reject (B-3 enforcement check)
  </how-to-verify>
  <resume-signal>Type "approved" when all 5 verification steps pass. If any step fails (e.g., Reject button still visible somewhere, action button shows for invalid transition, filter dropdown broken), describe the issue with screenshots and stop.</resume-signal>
  <files>none — human-only verification of UI behavior</files>
  <action>See &lt;how-to-verify&gt; block above for the full step-by-step sequence.</action>
  <done>Human types "approved" per &lt;resume-signal&gt; after every step in &lt;how-to-verify&gt; passes.</done>

</task>

</tasks>

<verification>
- List pages now show Inclusion column with correct color palette (verifiable: grep for INCLUSION_COLORS + violet-500/20)
- Detail pages now show inclusion-state action buttons gated by canManuallyTransition (verifiable: grep for "Propose for next build" + canManuallyTransition)
- NO Reject button copy on detail pages (verifiable: `grep -ci "reject" src/app/admin/modules/bug-reports/[id]/page.tsx` returns 0)
- All 4 new Vitest test files pass: `npx vitest run src/app/admin/modules/bug-reports src/app/admin/modules/feature-requests`
- `npx next build` exits 0
- Manual TMI dogfood flow completes end-to-end (human checkpoint)
</verification>

<success_criteria>
- Mike can move a TMI bug through the full state machine (triaged → pending_inclusion → approved_for_build → [auto] built → [auto] deployed) using the existing list + detail pages
- The list page Inclusion filter dropdown lets Mike find all pending_inclusion bugs in one click
- INCL-04 enumeration (pending_inclusion → approved_for_build OR deferred) is exactly what the detail page exposes — no Reject leak (B-3 fix)
- TMI pilot dogfooding can begin against the extended list/detail pages immediately after this plan ships
</success_criteria>

<output>
After completion, create `.planning/phases/36-inclusion-approval-state-machine/36-05b-admin-list-detail-extensions-SUMMARY.md` documenting:
- Final UX choice on list-page dropdown action: `<select>` vs `<details>` vs custom popover
- TMI dogfood pilot result from the human checkpoint (any UX surprises Mike flagged?)
- Confirmation that no Reject button anywhere on the detail pages (B-3 audit pass)
- Total Vitest test count added across the 4 new test files (target ≥22: 6+6+5+5)
- Reject UI affordance dropped — no INCL requirement covers it; v3.0 candidate with customer approval surface (per B-3 fix in revision pass)
- Any next.config.ts changes (should be zero — no new transpilePackages needed)
</output>
</content>
</invoke>