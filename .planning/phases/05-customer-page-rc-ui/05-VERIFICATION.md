---
phase: 05-customer-page-rc-ui
verified: 2026-05-05T11:55:00Z
status: human_needed
score: 4/4 must-haves verified
re_verification: false
human_verification:
  - test: "Visit /projects/{slug}/releases for a project with main + at least one feature branch"
    expected: "Page renders collapsible branch sections with main pinned first; active branches expanded by default; stale branches collapsed"
    why_human: "Default-expansion heuristic (isActive flag based on 30-day window + non-terminal status) cannot be verified without live data in jsdom"
  - test: "Click a PreviewLink icon on a row that has metadata.previewUrl set"
    expected: "Opens the FAH preview URL in a new browser tab; parent row does NOT toggle expansion (stopPropagation working)"
    why_human: "Real browser tab-open and propagation behavior cannot be asserted by RTL — jsdom does not fire anchor navigation"
  - test: "Click Approve on an RC in branch section A while branch section B is also expanded"
    expected: "Section A shows 'Click to confirm — promote feat/... v... (5s)'; Section B's approve button remains 'Approve for Production' (idle); both countdown independently"
    why_human: "Visual simultaneity of two confirm states across sections requires a live browser; RTL only asserts at most-one confirm label appears"
  - test: "For a branch whose latest promote_attempts row has result='conflict' and created_at is newer than the latest release_logs.deployed_at"
    expected: "Section header shows red 'Conflict — N file(s)' badge; file list appears when section is expanded; Approve button is absent; 'Resolve conflict to enable approval' helper text is present in the expanded panel"
    why_human: "Conflict badge visibility requires real DB data; auto-clear logic (new deploy clears badge) requires actual timestamp comparison against live rows"
  - test: "Mobile viewport (375px width): section headers, badge clusters, and conflict file lists"
    expected: "Sections still stack vertically; badge cluster wraps below branch name on narrow screens; no overflow clipping"
    why_human: "Responsive layout requires a real browser or Playwright viewport — jsdom has no layout engine"
---

# Phase 5: Customer Page RC UI Verification Report

**Phase Goal:** The customer releases page shows branches as independent RC groups with preview URLs and per-RC approve buttons, and surfaces conflict status without blocking the rest of the page
**Verified:** 2026-05-05T11:55:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Page groups releases into collapsible branch sections; main pinned first; feature branches sorted by maxDeployedAt desc (SC-1 / RC-01) | VERIFIED | `group-sections.ts` exports `groupIntoSections()` — pure function with documented sort; page.tsx calls it; ReleasesClient renders `sections.map(<BranchSectionComponent .../>)`; 3/3 group-sections tests GREEN |
| 2 | Each RC row shows a clickable preview URL that opens in a new tab; null URL renders disabled icon-button (SC-2 / RC-02) | VERIFIED | `PreviewLink.tsx` exists, 49 lines, exports default `PreviewLink`; renders `<a target="_blank" rel="noopener noreferrer">` for non-null URL; renders `<button disabled aria-label="No preview deployed">` for null; `e.stopPropagation()` present; 2/2 PreviewLink tests GREEN |
| 3 | Each RC row has its own admin-only Approve button; two RCs in different branches can both be in confirm state independently (SC-3 / RC-03) | VERIFIED | `ExpandedPanel` gated by `userRole === 'admin' && status === 'dev' && !isConflict`; `approveStep` keyed by `release.id` — never cross-reads other IDs; confirm label `Click to confirm — promote ${branch} ${version}`; 1/1 RC-03 isolation test GREEN |
| 4 | Branch with unresolved conflict shows badge; approve button hidden; row remains queryable (SC-4 / RC-07) | VERIFIED | `BranchSection.tsx` renders `Conflict — {n} file(s)` badge in header AND per-row status cell when `section.conflict !== null`; `renderExpandedPanel(release, isConflict)` passes `isConflict=true`; ExpandedPanel hides approve/reject block when `isConflict=true`; renders "Resolve conflict to enable approval" helper text; 3/3 BranchSection tests GREEN |

**Score:** 4/4 truths verified

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/app/projects/[slug]/releases/types.ts` | Extended ReleaseRow + BranchSection / ConflictState / BranchAggregate types | VERIFIED | Line 48: `branch: string \| null`; line 49: `metadata: Record<string, unknown> \| null`; interfaces BranchSection (line 66), ConflictState (line 54), BranchAggregate (line 60) all present |
| `src/app/projects/[slug]/releases/group-sections.ts` | Pure groupIntoSections() + resolvePreviewUrl() helpers | VERIFIED | 96 lines; exports both functions; zero React or Drizzle imports; D-03 sort, D-16 auto-clear, D-02 isActive logic all present |
| `src/app/projects/[slug]/releases/PreviewLink.tsx` | Standalone component: anchor vs disabled button states | VERIFIED | 49 lines; `'use client'`; `target="_blank"`; `rel="noopener noreferrer"`; `e.stopPropagation()`; `aria-label="No preview deployed"` on null path |
| `src/app/projects/[slug]/releases/BranchSection.tsx` | Section header with accordion + conflict badge + per-section table | VERIFIED | 312 lines; `aria-expanded={isExpanded}`; `aria-controls={panelId}`; `hidden={!isExpanded}`; `Conflict — {n} file(s)` badge; `Resolve conflict to enable approval`; PreviewLink wired into version cell |
| `src/app/projects/[slug]/releases/ReleasesClient.tsx` | Restructured to sections.map(BranchSectionComponent); ExpandedPanel with isConflict; confirm label with branch+version | VERIFIED | `useState<BranchSection[]>(initialSections)`; lazy expandedSections initializer; `sections.map()`; `<BranchSectionComponent`; ExpandedPanel `isConflict: boolean` prop; `Click to confirm — promote`; `min-w-[320px]`; `aria-live="polite"` |
| `src/app/projects/[slug]/releases/page.tsx` | Server-side fetch of deployedUrl + promote_attempts; groupIntoSections call; new prop shape to ReleasesClient | VERIFIED | Imports `promoteAttempts` from schema; imports `groupIntoSections`; selects `deployedUrl: projects.deployedUrl`; conflict query with `result='conflict'`; `branch: r.branch ?? null`; passes `initialSections`, `conflictsByBranch`, `projectDeployedUrl` to ReleasesClient; `getServerSession(authOptions)` preserved at line 20 |
| `src/app/api/projects/[slug]/releases/route.ts` | Load-more API surfaces branch + metadata | VERIFIED | Line 124: `branch: r.branch ?? null`; line 125: `metadata: (r.metadata as Record<string, unknown> \| null) ?? null` |
| `vitest.config.ts` | jsdom environment for component tests | VERIFIED (DEVIATION) | Global `environment: 'jsdom'` — differs from plan's `environmentMatchGlobs` approach, but functionally equivalent: all 85 tests pass including API route tests (.test.ts) that ran under node previously. No regressions. |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| page.tsx | promoteAttempts table | `db.select().from(promoteAttempts).where(and(eq(project), eq(result, 'conflict')))` | WIRED | Lines 77–91 of page.tsx; `promoteAttempts` imported from `@/db/schema` |
| page.tsx | groupIntoSections() helper | `import + call before passing initialSections` | WIRED | Line 10 import; line 159 call |
| page.tsx | projects.deployedUrl | `{ key, name, deployedUrl: projects.deployedUrl }` in SELECT | WIRED | Line 28 of page.tsx |
| ReleasesClient.tsx | BranchSectionComponent | `sections.map((section) => <BranchSectionComponent key={section.branch}.../>)` | WIRED | Line 464–563 of ReleasesClient.tsx |
| BranchSection.tsx | PreviewLink component | `<PreviewLink url={resolvePreviewUrl(release, projectDeployedUrl)} />` | WIRED | Line 238 of BranchSection.tsx |
| ReleasesClient handleLoadMore | groupIntoSections() helper | `setSections(groupIntoSections(flat, conflictsMap, projectDeployedUrl))` | WIRED | Line 415 of ReleasesClient.tsx |
| BranchSection conflict path | ExpandedPanel isConflict gating | `renderExpandedPanel(release, isConflict)` callback; ExpandedPanel checks `!isConflict` for approve block | WIRED | BranchSection.tsx line 290; ReleasesClient.tsx line 735 + line 825 |
| PreviewLink anchor onClick | event propagation stop | `e.stopPropagation()` | WIRED | PreviewLink.tsx line 33 |

---

## Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| RC-01 | 05-01, 05-02, 05-04 | Page groups releases by branch — one collapsible section per active feature branch + main section | SATISFIED | groupIntoSections() pure helper + BranchSection component + sections.map() in ReleasesClient; 3 green tests |
| RC-02 | 05-01, 05-03, 05-04 | Each RC row displays preview URL with external-link icon; opens new tab | SATISFIED | PreviewLink.tsx renders anchor with target=_blank; wired into BranchSection version cell; 2 green tests |
| RC-03 | 05-01, 05-05 | Each RC has own Approve button; multiple RCs can be in dev→approved state simultaneously | SATISFIED | approveStep keyed by release.id; ExpandedPanel confirm label includes branch+version; 1 green isolation test |
| RC-07 | 05-01, 05-02, 05-04 | Conflict badge for branches with unresolved conflicts; approve button disabled; row remains queryable | SATISFIED | BranchSection conflict badge in header + per-row; ExpandedPanel hides approve on isConflict; conflict auto-clear in groupIntoSections (D-16); 3 green tests |

No orphaned requirements — all four Phase 5 requirements (RC-01, RC-02, RC-03, RC-07) claimed by plans and verified in code. RC-04/05/06/08 correctly deferred to Phase 6 per CONTEXT.md.

---

## D-01..D-17 Compliance Audit (Load-Bearing Decisions)

| Decision | Description | Compliance | Evidence |
|----------|-------------|------------|---------|
| D-01 | Collapsible accordion sections with ChevronDown/ChevronRight | COMPLIANT | BranchSection.tsx lines 115–124: conditional ChevronDown/ChevronRight on isExpanded; section header is `<button>` with aria-expanded |
| D-07 | Missing previewUrl renders disabled grayed-out icon with tooltip | COMPLIANT | PreviewLink.tsx lines 17–29: `<button disabled aria-label="No preview deployed" title="No preview deployed">` |
| D-10 | Confirm button label includes branch + version: "Click to confirm — promote {branch} {version} ({Ns})" | COMPLIANT | ReleasesClient.tsx lines 755–759: exact string `Click to confirm — promote` with `{release.branch ?? 'main'}` and `{release.version}`; `aria-live="polite"` on countdown span |
| D-13 | Conflict badge appears in BOTH section header AND per-row status cell | COMPLIANT | BranchSection.tsx line 142 (header badge); line 260–267 (per-row badge when `isConflict`) |
| D-15/D-16 | Conflict source from latest promote_attempts where result='conflict'; auto-clear when newer release.deployed_at exists | COMPLIANT | page.tsx lines 77–103: conflict query ordered by `desc(createdAt)`, deduplicated to latest per branch; group-sections.ts lines 37–42: auto-clear — conflict included only when `rawConflict.createdAt > maxDeployedAt` |
| D-17 | Approve button HIDDEN ENTIRELY for conflict branches; replaced by helper text | COMPLIANT | ReleasesClient.tsx line 735: `!isConflict` gates the approve/reject block; line 825: `isConflict && (...)` renders "Resolve conflict to enable approval" |

---

## Anti-Patterns Scan

| File | Pattern | Severity | Assessment |
|------|---------|----------|------------|
| `vitest.config.ts` | Global `environment: 'jsdom'` instead of `environmentMatchGlobs` | Info | Plan 05-01 specified `environmentMatchGlobs`; implementation used global jsdom. All 85 tests pass — API route tests that previously ran in node still pass under jsdom. Not a blocker; the contract was "component tests run in jsdom environment" which holds. If a future API test requires `window` to be undefined, this would need reverting. |
| `ReleasesClient.tsx` line 162 | `conflictsByBranchRef` never reassigned after init | Info | `useRef(conflictsByBranch)` is a stable snapshot intentionally (Pitfall 7 per RESEARCH.md); load-more re-grouping reads `conflictsByBranchRef.current` correctly. This is correct behavior per the design. |

No blockers, no stubs, no placeholder text, no TODO/FIXME comments in Phase 5 files.

---

## Test Suite Results

```
Test Files  12 passed (12)
      Tests  85 passed (85)
   Duration  5.19s
```

Phase 5-specific tests (all GREEN):
- group-sections.test.ts: 3/3 (RC-01 — sort, null-branch, aggregate counts)
- PreviewLink.test.tsx: 2/2 (RC-02 — anchor + disabled button states)
- BranchSection.test.tsx: 3/3 (RC-07 — conflict badge, approve hidden, helper text)
- ReleasesClient.test.tsx: 1/1 (RC-03 — cross-branch confirm isolation)

TypeScript: `npx tsc --noEmit` exits 0 (zero errors).

---

## Human Verification Required

The following items cannot be confirmed programmatically and require a live browser session. These are UX/visual items — no automated test failures are open.

### 1. Branch Section Rendering with Real Data

**Test:** Visit `/projects/{slug}/releases` for a project with `main` + at least one feature branch (e.g. `feat/change-font`), in a browser logged in as staff/admin.
**Expected:** Page renders one collapsible section per distinct branch value; `main` section appears first; feature branches appear below sorted by most recent deploy; active branches (deployed within 30 days or in dev/pending/approved status) are expanded by default.
**Why human:** Default-expansion heuristic (`isActive` flag derived from 30-day window + non-terminal status) cannot be exercised without real rows from CockroachDB.

### 2. Preview URL Click Behavior

**Test:** On a row that has `metadata.previewUrl` populated (a post-Phase-2 deploy), click the ExternalLink icon next to the version badge.
**Expected:** A new browser tab opens with the FAH preview URL. The parent `<tr>` row does NOT expand its ExpandedPanel (stopPropagation working correctly).
**Why human:** RTL/jsdom does not follow `href` navigation; `window.open` is not simulated. Tab-opening and propagation suppression require a real browser.

### 3. Concurrent Confirm States (Visual)

**Test:** On a project with two RC rows in different branch sections both at status `dev`, click Approve on the first RC. While the 5-second countdown is ticking, expand the second RC's section.
**Expected:** First RC shows `Click to confirm — promote feat/branch-a v0.X (Ns)` with countdown ticking. Second RC shows `Approve for Production` (idle state). Both can independently be clicked without interference.
**Why human:** Visual simultaneity of two countdown states across independent sections requires a real browser interaction sequence.

### 4. Conflict Badge with Live Data

**Test:** For a project branch whose latest `promote_attempts` row has `result='conflict'` and `created_at` newer than the latest `release_logs.deployed_at` for that branch — visit the releases page.
**Expected:** Section header shows red `Conflict — N file(s)` badge. Expanding the section shows the conflict file list above the table and "Resolve conflict to enable approval" helper text replacing the Approve button.
**Why human:** Requires real `promote_attempts` data in CockroachDB with a conflict row; auto-clear requires actual timestamp comparison.

### 5. Mobile Viewport (375px)

**Test:** Open the releases page in a browser DevTools at 375px viewport width with at least 2 branch sections.
**Expected:** Sections stack vertically; section header badge clusters wrap below the branch name; no horizontal scroll or clipping; conflict file list is readable.
**Why human:** Responsive layout requires a real browser layout engine — jsdom has no CSS layout.

---

## Gaps Summary

No gaps. All automated checks pass:
- 4/4 ROADMAP success criteria verified in code
- 4/4 requirement IDs (RC-01, RC-02, RC-03, RC-07) satisfied
- 85/85 tests pass (12 test files)
- TypeScript exits 0
- All key links wired end-to-end

The `human_needed` status reflects that Phase 5 is a UI phase where visual hierarchy, real preview URL behavior, and live conflict badge rendering cannot be fully confirmed by static analysis alone. The 5 human verification items above constitute a recommended UAT checklist; automated evidence strongly supports passage on all of them.

---

_Verified: 2026-05-05T11:55:00Z_
_Verifier: Claude (gsd-verifier)_
