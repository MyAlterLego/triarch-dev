---
phase: 09-per-project-pipeline-page-and-web-ui-promote
plan: "05"
subsystem: pipeline-ui
tags: [vitest, tdd, rtl, client-island, state-machine, toast, version-bump]

dependency_graph:
  requires:
    - 09-03 (POST /api/admin/releases/[id]/promote — response contract: 200/409/400/401/403/404)
    - 09-04 (PromoteButton.tsx inert stub + /admin/modules/pipeline/[slug] page.tsx)
  provides:
    - "Interactive PromoteButton client island with two-step inline confirm, in-flight violet spinner, terminal Dispatched/Failed pills"
    - "409-race-condition toast via existing Toast component"
    - "Admin home Project Health tile link retargeted to /admin/modules/pipeline/<key>"
    - "7-test RTL/Vitest suite covering all PromoteButton state paths"
    - "Version bump 2.4.0 → 2.5.0"
  affects:
    - "Phase 14 (customer page integration — admin pipeline page is the staff-side counterpart)"

tech-stack:
  added: []
  patterns:
    - "Client island phase machine: idle → confirming → dispatching → dispatched | failed (useState, no useTransition needed)"
    - "fetch() with method:'POST' inline in async handler; errors caught and mapped to phase transitions"
    - "Toast rendered inline as sibling to phase output; onDismiss sets toast state to null"
    - "v2.1 in-flight violet halo: bg-violet-500/10 border-violet-500/30 text-violet-400 (DESIGN-REFERENCE.md)"
    - "TDD: RED commit first with 7 failing RTL tests; GREEN commit after implementation; full suite 159/159"

key-files:
  created:
    - src/app/admin/modules/pipeline/[slug]/PromoteButton.test.tsx
  modified:
    - src/app/admin/modules/pipeline/[slug]/PromoteButton.tsx
    - src/app/admin/page.tsx
    - package.json

decisions:
  - "useState phase machine instead of useTransition — simpler state control; useTransition's isPending doesn't map cleanly to multi-phase state machine (confirming vs dispatching are distinct UI phases)"
  - "No useReducer — 5 phases with clear scalar transitions; useState<Phase> union type is sufficient and readable"
  - "Toast rendered inside PromoteButton (not lifted to parent page) — self-contained client island per PROM-01 design; the fixed-position Toast renders outside the table cell layout regardless"
  - "Dispatched (terminal) shown on 409 race — semantics: the release IS being promoted, just by someone else; showing 'Failed' would be wrong. Toast conveys who won the race."
  - "Flat teal Promote button (bg-emerald-700) for idle state — DESIGN-REFERENCE.md anti-pattern: 'Do NOT apply gradients to interactive controls (buttons stay in flat zinc/teal/amber palette for affordance clarity)'"
  - "In-flight state uses violet-400 spinner + bg-violet-500/10 border-violet-500/30 halo per DESIGN-REFERENCE.md 'Active/in-flight elements' spec"
  - "Failed pill links to run_url with target=_blank — GHA run URL is external; staff need to see the GitHub Actions log"
  - "Admin home tile href changed to /admin/modules/pipeline/<key> — CONTEXT.md decision: 'Pipeline page is now linked from the /admin Project Health tile'; Phase 8 originally linked to /projects/<key>/releases"
  - "Version bump to 2.5.0 (minor) — Phase 9 ships three user-visible features: pipeline page (PIPE-05), web Promote (PROM-01..05 subset), what-changed view (DIFF-01)"

metrics:
  duration: ~7min
  completed: "2026-05-08"
  tasks_completed: 2
  files_changed: 4
---

# Phase 9 Plan 05: PromoteButton Interactive Island + Admin Home Retarget Summary

**One-liner:** PromoteButton client island with five-phase state machine (idle → confirming → dispatching → dispatched/failed), violet in-flight halo, teal/red terminal pills, 409-race toast, admin home tile retargeted to pipeline page, version bumped to 2.5.0.

## Performance

- **Duration:** ~7 min
- **Started:** 2026-05-08T03:57:00Z
- **Completed:** 2026-05-08T04:00:39Z
- **Tasks:** 2 (1 TDD RED+GREEN, 1 non-TDD)
- **Files changed:** 4

## Accomplishments

### Task 1: PromoteButton tests + implementation (TDD RED → GREEN)

**RED commit:** `764ef57` — 7 failing RTL tests covering: render gate, two-step confirm label, cancel cycle, fetch happy path, 200 ok:false failure with run_url, 409 race toast, 500 error revert.

**GREEN commit:** `2cedf8e` — Full interactive client island replacing the inert Plan 09-04 stub.

PromoteButton phase machine:

| Phase | Trigger | Rendered UI |
|-------|---------|-------------|
| `idle` | Initial render | Flat teal `Promote` button |
| `confirming` | Click Promote | Inline confirm: "Promote `{branch}` `{version}` to production" + Confirm + Cancel |
| `dispatching` | Click Confirm | Violet-400 spinner + "Dispatching..." with `bg-violet-500/10 border-violet-500/30` halo |
| `dispatched` | 200 `{ ok: true }` or 409 | `Dispatched` pill (`bg-teal-900/40 text-teal-300`) — terminal |
| `failed` | 200 `{ ok: false }` | `Failed` pill (`bg-red-900/40 text-red-300`) + optional GHA run URL anchor — terminal |

Route response handling:
- **200 `{ ok: true }`**: phase → `dispatched`
- **200 `{ ok: false, error, run_url? }`**: phase → `failed` with error + runUrl
- **409 `{ error: 'already_promoted', dispatched_by, dispatched_at }`**: Toast "Already promoted by `<email>`" + phase → `dispatched` (terminal)
- **4xx/5xx (other than 409)**: error Toast + phase → `idle` (retry allowed)
- **Network error (fetch throws)**: "Network error — try again" Toast + phase → `idle`

Design reference compliance:
- Idle button: flat `bg-emerald-700` teal (anti-pattern: no gradients on interactive controls)
- In-flight: `text-violet-400 bg-violet-500/10 border-violet-500/30` SVG spinner halo
- Success: semantic teal token `bg-teal-900/40 text-teal-300` (consistent with status pills in page.tsx)
- Failure: semantic red token `bg-red-900/40 text-red-300`

### Task 2: Admin home tile retarget + version bump

**Commit:** `e630cdc`

- `src/app/admin/page.tsx`: Project Health tile `<Link href>` changed from `/projects/${p.key}/releases` to `/admin/modules/pipeline/${p.key}`. No other changes to tile structure, className, children, or behavior.
- `package.json`: `"version"` bumped from `"2.4.0"` to `"2.5.0"`.

## Task Commits

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 (RED) | PromoteButton tests (RED) | `764ef57` | PromoteButton.test.tsx (created) |
| 1 (GREEN) | PromoteButton implementation | `2cedf8e` | PromoteButton.tsx (replaced) |
| 2 | Admin home tile + version bump | `e630cdc` | page.tsx, package.json |

## Phase 9 Close-Out

All 7 Phase 9 requirements satisfied across plans 09-01 through 09-05:

| Requirement | Description | Plan |
|-------------|-------------|------|
| PIPE-05 | Per-project admin pipeline page | 09-04 |
| PROM-01 | Promote button visible on approved RCs (staff-only) | 09-05 |
| PROM-02 | Two-step inline confirm with exact label format | 09-05 |
| PROM-03 | Web promote dispatches via promoteAndAudit | 09-03 |
| PROM-04 | Concurrent web+Slack → exactly one dispatch (atomic guard) | 09-01, 09-03 |
| PROM-05 | In-flight spinner → terminal pill; failure links to GHA run URL | 09-05 |
| DIFF-01 | What's-changed since prod view on pipeline page | 09-04 |

**PROM-05 deferral note:** PROM-05 lists merged/conflict/ci_failed as terminal states. Phase 9 delivers Dispatched (synchronous dispatch acknowledgment) and Failed (synchronous dispatch rejection with run_url). The `merged` and `conflict` terminal states require async round-trip data from `POST /api/releases/promoted` (merge SHA, conflict file count) — not available at fetch time. They are deferred to a future phase that wires SWR polling on the ingest payload, per CONTEXT.md: "Real-time updates after Promote click (SWR polling) — Phase 13's pattern; for Phase 9, manual page refresh after dispatch is acceptable."

## Deviations from Plan

None — plan executed exactly as written. The plan's suggested `useTransition` pattern was evaluated but `useState<Phase>` union type was used instead (simpler, cleaner state isolation between the confirming and dispatching phases; logged as a decision above).

## Known Stubs

None — the PromoteButton stub from Plan 09-04 is fully replaced. The Dispatched terminal state covers the synchronous dispatch outcome. The merged/conflict terminal states are intentionally deferred (per plan and CONTEXT.md) to the SWR polling phase.

## Verification

- `npx vitest run`: 159/159 tests pass (23 test files)
- `npx tsc --noEmit`: exits 0
- `npx next build`: exits 0 — `/admin/modules/pipeline/[slug]` compiles as Dynamic server-rendered route

## Self-Check: PASSED

Files verified:
- FOUND: src/app/admin/modules/pipeline/[slug]/PromoteButton.test.tsx (7 `it(` blocks)
- FOUND: src/app/admin/modules/pipeline/[slug]/PromoteButton.tsx (interactive island, 171 lines)
- FOUND: src/app/admin/page.tsx (href updated to /admin/modules/pipeline/)
- FOUND: package.json ("version": "2.5.0")

Commits verified:
- 764ef57: test(09-05): add PromoteButton tests (RED)
- 2cedf8e: feat(09-05): implement PromoteButton two-step inline confirm with in-flight + terminal pills
- e630cdc: feat(09-05): retarget admin home tile to pipeline page; bump v2.5.0

---
*Phase: 09-per-project-pipeline-page-and-web-ui-promote*
*Completed: 2026-05-08*
