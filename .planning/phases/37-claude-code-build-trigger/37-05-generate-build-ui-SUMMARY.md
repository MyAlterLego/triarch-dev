---
phase: 37-claude-code-build-trigger
plan: 05
subsystem: admin-ui
tags: [nextjs-16, react-19, vitest, rtl, modal, deep-link, build-trigger, tdd, async-params]

requires:
  - phase: 36
    plan: 05a
    provides: "NextBuildPlanClient (projectName/projectSlug/initialItems) + page.tsx (async-params staff-gated server component)"
  - phase: 37
    plan: 01
    provides: "projects.buildTriggerMode + projects.localPath columns + BuildTriggerMode type"
  - phase: 37
    plan: 03
    provides: "POST /api/admin/projects/{slug}/generate-build endpoint — returns {prompt, mode, item_count}"

provides:
  - "GenerateBuildModal default-export — dialog (role=dialog aria-modal=true) + buildDeepLink pure helper named-export"
  - "NextBuildPlanClient extended — accepts project + approvedCount props; renders Generate Build button + manages modal open/close state"
  - "page.tsx extended — selects projects.id + buildTriggerMode + localPath; passes project + approvedCount to client"
  - "13/13 modal Vitest cases + 5 new client Vitest cases (total 26 cases in dir suite)"
  - "Locked tooltip strings + locked fallback hint string anchored in repo (grep targets)"

affects:
  - 37-06 (Approval-events audit page already shipped in parallel wave — renders rows this modal triggers via 37-03 endpoint)
  - Phase 38 (Managed Agent RFC — the v2.5 placeholder copy lives here; Phase 38 unblocks the disabled state when it ships)

tech-stack:
  added: []
  patterns:
    - "Pure helper extracted from side-effect (buildDeepLink ↔ window.location.href) — W-4 testability pattern; tests assert URL contract directly without JSDOM window.location proxy fragility"
    - "Fetch-on-mount-once via fetchedRef guard (StrictMode-safe) so the API endpoint is hit exactly once per modal mount even under React 19 double-invoke in dev"
    - "Real-timer waitFor(3s) for 2-sec setTimeout assertion — fake timers + fetch microtask chain interleave fragile in Vitest 4; real timers reliable"
    - "Header restructured to flex-justify-between with shrink-0 button — preserves title/subtitle column width while pinning button top-right per CONTEXT.md UX"
    - "Backdrop click-to-close via target===currentTarget check (no extra listener needed)"

key-files:
  created:
    - src/app/admin/modules/next-build-plan/[slug]/GenerateBuildModal.tsx
    - src/app/admin/modules/next-build-plan/[slug]/GenerateBuildModal.test.tsx
  modified:
    - src/app/admin/modules/next-build-plan/[slug]/page.tsx
    - src/app/admin/modules/next-build-plan/[slug]/NextBuildPlanClient.tsx
    - src/app/admin/modules/next-build-plan/[slug]/NextBuildPlanClient.test.tsx

key-decisions:
  - "Task 0 (prop reconciliation) merged into Task 1 commit — verification-only with no code change; merging avoids an empty-content commit while preserving the audit trail in the commit body"
  - "page.tsx Props extended (project + approvedCount) BEFORE Task 3 (button impl) so build stays green commit-to-commit; existing 36-05a tests updated to pass the new required props in the same commit (no test-shape regression)"
  - "buildDeepLink exported as named export from same module as default-export modal — colocates the pure helper with its only consumer, avoids src/lib/ pollution for a single-call helper, and the test imports both from one path"
  - "Special-character path encoding test (I-1) added: ampersand/space/hash/parens all round-trip through encodeURIComponent — catches the most likely deep-link escape bug class"
  - "Retry button resets fetchedRef before re-firing — without the reset, the StrictMode-once guard would block the retry; explicit set-then-set is clearer than a single conditional"
  - "Used --no-verify on all 4 commits — parallel wave 3 (37-05 + 37-06 agents on shared feat/build-trigger branch); pre-commit hook lock-contend; phase context explicitly authorizes this"
  - "Real-timer waitFor(3s) chosen over fake-timer advanceTimersByTimeAsync for the 2-second fallback hint test after the fake-timer approach failed (fetch microtask chain didn't flush despite advanceTimersByTimeAsync(0))"

requirements-completed: [TRIG-02, TRIG-03, TRIG-04]

metrics:
  duration: ~8 min
  tasks_completed: 4
  files_created: 2
  files_modified: 3
  commits: 4
  test_count: 13 new modal cases + 5 new client cases = 18 new (26 total in dir suite)
  build_status: clean
  vitest_status: 26/26 GREEN

completed: 2026-05-18
---

# Phase 37 Plan 05: Generate Build UI Summary

**Generate Build button + GenerateBuildModal ship the TRIG-02/03/04 end-to-end UX — staff click a top-right button on the next-build-plan page, fetch the build prompt from the 37-03 endpoint, then either copy it to clipboard or launch a `claude-code://open` deep-link with the project's `localPath` as `cwd`.**

## Performance

- **Duration:** ~8 min (single-session, no checkpoints)
- **Started:** 2026-05-18T20:18:11Z
- **Completed:** 2026-05-18T20:26:16Z
- **Tasks:** 4/4 (Task 0 reconciliation + Tasks 1-3 implementation)
- **Files created/modified:** 2 new + 3 modified
- **Test count:** +18 new cases (13 modal + 5 client) → dir suite 26/26 GREEN

## Accomplishments

- **NextBuildPlanClient prop shape reconciled (Task 0):** confirmed shipped 36-05a baseline is `{ projectName, projectSlug, initialItems }` (not the draft-plan `{ items, slug }`); both Tasks 1 and 3 EXTEND those names with `project` + `approvedCount` rather than renaming, preserving 36-05a behaviour.
- **page.tsx extended (Task 1):** SELECT now includes `projects.id`, `projects.buildTriggerMode`, `projects.localPath`; passes a flat `project` prop + `approvedCount={items.length}` to the client. Pitfall 9 (Next.js 16 async params) preserved (`const { slug } = await params;`).
- **GenerateBuildModal shipped (Task 2 TDD):** new default-export with `role=dialog aria-modal=true`, fetch-on-mount-once via fetchedRef, mode-conditional Copy + Open buttons, 2-sec fallback hint after Open, Escape/X/backdrop close, Toast on copy success/failure, Retry on error.
- **buildDeepLink pure helper extracted (W-4 pattern):** named export from the modal module — `claude-code://open?prompt={enc}[&cwd={enc}]` with proper URL encoding. Tests assert URL contract directly (3 cases) plus a single side-effect smoke test for the window.location.href assignment.
- **Generate Build button wired in (Task 3 TDD):** top-right of NextBuildPlanClient header, locked-tooltip disabled states for both 0-items and managed_agent, modalOpen state mounts/unmounts the modal.
- **18 new Vitest cases GREEN** across 2 files; full dir suite 26/26 GREEN in 2.5s.
- **`npx next build` clean** after every commit.

## Final NextBuildPlanClient Prop Signature (additions vs Phase 36-05a baseline)

```typescript
interface Props {
  // Phase 36-05a baseline — PRESERVED (do NOT rename)
  projectName: string;
  projectSlug: string;
  initialItems: BuildPlanItem[];

  // Phase 37-05 additions — NEW
  project: {
    id: string;
    key: string;
    name: string;
    buildTriggerMode: BuildTriggerMode;
    localPath: string | null;
  };
  approvedCount: number;
}
```

The shipped server component (`page.tsx`) now passes all five props; the test file passes the new two via a shared `defaultProject` fixture so existing 36-05a assertion bodies are unchanged.

## Task Commits

| # | Hash       | Type   | Message                                                                                       | Files |
| - | ---------- | ------ | --------------------------------------------------------------------------------------------- | ----- |
| 1 | `ad029c5`  | feat   | extend next-build-plan page + client to surface project trigger mode + approvedCount (Tasks 0+1) | 3     |
| 2 | `eea3237`  | test   | add failing tests for GenerateBuildModal (RED) — 13 cases                                     | 1     |
| 3 | `ac69413`  | feat   | implement GenerateBuildModal — loading -> preview -> Copy/Open + deep-link fallback (GREEN)   | 2     |
| 4 | `0371b63`  | feat   | wire Generate Build button + modal into NextBuildPlanClient (GREEN)                           | 2     |

_Note: Task 0 (verification-only) merged into Task 1 commit — no separate commit for a no-code-change reconciliation step; the audit trail is captured in the commit body. Task 2 split RED → GREEN per TDD rule._

**Plan metadata commit:** Will be `_metadata_` hash (added at end of executor run alongside STATE.md + ROADMAP.md + REQUIREMENTS.md updates).

## Files Created/Modified

### Created
- `src/app/admin/modules/next-build-plan/[slug]/GenerateBuildModal.tsx` — 232 lines: client modal with default-export component + `buildDeepLink` named-export helper
- `src/app/admin/modules/next-build-plan/[slug]/GenerateBuildModal.test.tsx` — 200 lines: 13 Vitest+RTL cases with fetch/clipboard/window.location stubs

### Modified
- `src/app/admin/modules/next-build-plan/[slug]/page.tsx` — extended SELECT (id + buildTriggerMode + localPath) and added 5-prop call to client; +1 BuildTriggerMode type import
- `src/app/admin/modules/next-build-plan/[slug]/NextBuildPlanClient.tsx` — Props interface extended; header restructured (flex-justify-between with shrink-0 button); modalOpen state; conditional `<GenerateBuildModal>` render; +2 imports
- `src/app/admin/modules/next-build-plan/[slug]/NextBuildPlanClient.test.tsx` — `defaultProject` fixture added; all 8 existing render calls extended to pass `project` + `approvedCount`; +5 new describe block tests for Generate Build button + modal integration

## Decisions Made

1. **Task 0 merged into Task 1 commit.** Verification-only with no code changes; an empty-content commit would clutter the log without adding clarity. The reconciliation is documented in the Task 1 commit body.
2. **Extended client Props in Task 1 (not deferred to Task 3).** Otherwise build would break between Tasks 1 and 2 (page.tsx passes props the client doesn't accept). The client only needed the prop in its interface (consumption deferred to Task 3) — minimal change with maximum build-stability payoff.
3. **`buildDeepLink` colocated with modal (not in `src/lib/`).** Single consumer (this modal); colocation keeps the helper close to its caller and lets tests import both default + named from one path.
4. **Real-timer waitFor(3s) for 2-sec fallback test.** Initial fake-timer attempt with `advanceTimersByTimeAsync(2000)` failed: the fetch microtask chain (`mockResolvedValue(Response) → .json() → setPhase`) didn't flush even after `advanceTimersByTimeAsync(0)`. Real timers + `waitFor(timeout: 3000)` is reliable, fast enough (test still finishes in ~2.1s), and avoids reasoning about Vitest 4's timer-microtask interleaving.
5. **Retry button explicitly resets `fetchedRef.current`.** The StrictMode fetch-once guard would otherwise block a manual retry. The reset+set pattern is one extra line vs. a conditional check and is clearer to read.
6. **`--no-verify` on all 4 commits.** Phase context (parallel wave 3 — 37-05 + 37-06 agents on `feat/build-trigger`) explicitly authorizes this for hook lock-contention avoidance. Verified by checking interleaved 37-06 commits in `git log` (commits `aa00de2`, `93f12f7`, `2dee201` from the parallel agent are interleaved with mine without conflict).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Initial fake-timer approach for 2-sec fallback test was unreliable**

- **Found during:** Task 2 GREEN — 12/13 tests passed on first run; the fallback test (`'after 2 seconds following Open click, renders fallback hint'`) failed because the modal was still in `loading` phase when the test attempted to click Open.
- **Root cause:** With `vi.useFakeTimers()` set BEFORE render, `globalThis.fetch().then(res => res.json()).then(body => setPhase(...))` queued microtasks that `advanceTimersByTimeAsync(0)` did not exhaustively flush — the modal never entered the ready phase, so `getByRole('button', { name: /Open in Claude Code/i })` threw.
- **Fix:** Switched to real-timer flow — render under real timers, `waitFor` for the Open button (lets fetch chain settle naturally), click, then `waitFor(3000)` for the fallback text to appear after the modal's internal 2-sec `setTimeout`. Test now stably passes in ~2.1s.
- **Files modified:** `src/app/admin/modules/next-build-plan/[slug]/GenerateBuildModal.test.tsx` (one test body rewritten — no other tests touched)
- **Verification:** `npx vitest run` reports 13/13 GREEN deterministically across 3 consecutive runs
- **Commit:** Bundled into `ac69413` (Task 2 GREEN) — the test was first introduced in `eea3237` (RED) using fake timers; the rewrite happened in the same session before the GREEN commit so there's no separate fix commit.

### Plan Deferrals (none required at runtime)

The plan's draft test snippet in Task 3 used `items=` and `slug=` shorthand — Task 0 reconciliation flagged this as incorrect (shipped 36-05a uses `initialItems`/`projectSlug`). I followed the Task 0 reconciliation guidance verbatim and used the actual shipped prop names in the new test cases. Not technically a deviation since Task 0 was specifically designed to catch this.

---

**Total deviations:** 1 auto-fixed (1 bug — test reliability; no production code change)
**Impact on plan:** Zero scope creep. The plan's W-4 pure-helper pattern was the key insight that kept the side-effect surface small enough to swap timing strategies cleanly.

## Issues Encountered

None other than the fake-timer test issue documented above (resolved within Task 2 GREEN). The plan's `<interfaces>` block + Task 0 reconciliation gave executor enough up-front clarity that there were no other surprises:

- 37-03 endpoint contract (`{prompt, mode, item_count}`) was stable — modal consumed exactly what the SUMMARY-03 declared
- 37-01 schema columns (`buildTriggerMode` + `localPath`) were live in the shared package; drizzle SELECT returned them without query changes beyond the explicit projection
- `lucide-react` icon exports (`X`, `Copy`, `ExternalLink`, `Loader2`) verified before use

## Authentication Gates

- None during execution. The modal calls the staff-gated 37-03 endpoint, but the test stubs `globalThis.fetch` so no real auth happens. Production behaviour: staff session cookie → `requireStaff()` in the API route → success.

## User Setup Required

None — no env vars, no CLI commands, no external service configuration. The modal works end-to-end the first time a staff user navigates to `/admin/modules/next-build-plan/{slug}` after this plan ships:
- Button visible (enabled if items approved + mode=local_claude or manual)
- Click → fetch + modal opens with prompt
- Copy → clipboard set + toast "Prompt copied"
- Open → `claude-code://open?prompt=...&cwd=...` launched (or fallback hint appears after 2s if scheme not registered)

For the deep-link to actually launch Claude Code locally, the user's machine needs the `claude-code://` URL scheme registered (Claude Code Desktop installer handles this — see deferred UAT note below).

## Deep-Link Scheme Deviations Discovered During Manual UAT

**Deferred to phase-close UAT.** The plan's locked URL format `claude-code://open?prompt={enc}[&cwd={enc}]` is implemented as specified; verifying it actually launches Claude Code on Mike's machine is a phase-close manual UAT step (not feasible in this headless executor run). If UAT reveals Claude Code uses a different scheme (e.g., `cursor://`, `vscode-claude://`, different query-string format), the only change needed is the single `buildDeepLink` function in `GenerateBuildModal.tsx` — the helper extraction (W-4 pattern) makes this a one-line scheme-name swap plus updated tests.

**UAT checklist for phase close:**
1. Navigate to `https://admin.triarch.dev/admin/modules/next-build-plan/tmi` (after deploy)
2. Approve at least one bug or feature for TMI (Phase 36 surface)
3. Click Generate Build → modal opens with prompt visible in textarea
4. Click Copy → confirm clipboard contains the prompt (paste in any text editor)
5. Click Open in Claude Code → confirm Claude Code launches with prompt populated and cwd set to TMI's `localPath`
6. If Claude Code did NOT open within 2 seconds → confirm fallback hint "Did Claude Code open? If not, copy the prompt below." appears
7. Verify the new audit row in `approval_events` table (Phase 37-06 audit page should show the trigger event)

## Screenshot Description (deferred to phase-close UAT)

The modal's visual state for the two reachable modes:

**`local_claude` mode (default for all projects):**
- Dark-zinc card centered on black/60 backdrop, ~3xl max-width
- Header bar: "Generate Build for TMI" left + X close button right
- Body: tiny zinc-500 line "3 items approved · mode: local_claude" + h-80 monospace readOnly textarea showing the full generated prompt
- Footer right-aligned: zinc Copy to clipboard button + violet Open in Claude Code button
- After Open click, an amber-text line appears above the textarea: "Did Claude Code open? If not, copy the prompt below."

**`manual` mode:**
- Same as above EXCEPT the Open in Claude Code button is hidden — only the zinc Copy to clipboard button remains in the footer.

**`managed_agent` mode:**
- This modal is never reached. The Generate Build button itself is rendered disabled with title="Managed Agent variant ships in v2.5" tooltip, so click-to-open is blocked at the parent.

## Next Phase Readiness

**For phase close (37 wrap):**
- 37-05 + 37-06 are the only Wave 3 plans; both shipped successfully in parallel without merge conflicts on `feat/build-trigger`
- All TRIG-* requirements complete: 01 (schema), 02 (modal Copy/Open), 03 (deep-link), 04 (button + disabled states), 05 (per-project mode picker — shipped in 37-04), 06 (audit endpoint + 37-06 audit page)
- Ready for manual UAT on Mike's local + dev deploy; ready for merge to `dev` once UAT signs off
- Phase 38 (Managed Agent RFC) will surface as the next milestone; the v2.5 placeholder copy is anchored in this plan's tooltip string and can be removed when 38 ships

**For Phase 38 (Managed Agent RFC):**
- The `managed_agent` disabled tooltip lives in `NextBuildPlanClient.tsx` line ~155 (approx) — search for `'Managed Agent variant ships in v2.5'` to locate it
- When 38 lands, replace the `disabled || isManagedAgent` logic with a route to the managed-agent flow; the `project.buildTriggerMode === 'managed_agent'` branch is the only thing that needs a new behaviour
- No data-model changes — `buildTriggerMode` enum already includes `'managed_agent'` and the projects-admin picker (37-04) already lets staff select it

**No blockers.** Plan executed exactly as specified; the W-4 pattern paid off (one localized timing fix in test, zero production-code rework).

## Self-Check: PASSED

Verified all claims:

**Files exist:**
- `src/app/admin/modules/next-build-plan/[slug]/GenerateBuildModal.tsx` — FOUND
- `src/app/admin/modules/next-build-plan/[slug]/GenerateBuildModal.test.tsx` — FOUND
- `src/app/admin/modules/next-build-plan/[slug]/NextBuildPlanClient.tsx` — FOUND (modified)
- `src/app/admin/modules/next-build-plan/[slug]/NextBuildPlanClient.test.tsx` — FOUND (modified)
- `src/app/admin/modules/next-build-plan/[slug]/page.tsx` — FOUND (modified)
- `.planning/phases/37-claude-code-build-trigger/37-05-generate-build-ui-SUMMARY.md` — FOUND (this file)

**Commits exist (git log --oneline -10 confirmed):**
- `ad029c5` Tasks 0+1 — FOUND
- `eea3237` Task 2 RED — FOUND
- `ac69413` Task 2 GREEN — FOUND
- `0371b63` Task 3 GREEN — FOUND

**Acceptance grep counts:**
- `grep -c "Generate Build" NextBuildPlanClient.tsx` = 4 (>= 1 ✓)
- `grep -c "Generate build" NextBuildPlanClient.tsx` = 0 (capitalization normalized ✓)
- `grep -c "GenerateBuildModal" NextBuildPlanClient.tsx` = 2 (import + render ✓)
- `grep -c "Approve at least one item to generate a build" NextBuildPlanClient.tsx` = 1 ✓
- `grep -c "Managed Agent variant ships in v2.5" NextBuildPlanClient.tsx` = 1 ✓
- `grep -c "claude-code://open" GenerateBuildModal.tsx` = 2 (helper string + comment) ✓
- `grep -c "navigator.clipboard.writeText" GenerateBuildModal.tsx` = 1 ✓
- `grep -c "aria-modal=\"true\"" GenerateBuildModal.tsx` = 1 ✓
- `grep -c "Did Claude Code open" GenerateBuildModal.tsx` = 2 (locked string in JSX + doc comment) ✓
- `grep -c "Managed Agent" GenerateBuildModal.tsx` = 0 (modal never reaches managed_agent ✓)
- `grep -c "export function buildDeepLink" GenerateBuildModal.tsx` = 1 ✓
- `grep -c "approvedCount=" page.tsx` = 1 ✓
- `grep -c "buildTriggerMode" page.tsx` = 3 ✓
- `grep -c "localPath" page.tsx` = 3 ✓
- `grep -c "await params" page.tsx` = 1 (Pitfall 9 anchored ✓)

**Test status:** `npx vitest run src/app/admin/modules/next-build-plan/` → 26/26 GREEN in 2.5s ✓
**Build status:** `npx next build` → exit 0 ✓

---
*Phase: 37-claude-code-build-trigger*
*Completed: 2026-05-18*
