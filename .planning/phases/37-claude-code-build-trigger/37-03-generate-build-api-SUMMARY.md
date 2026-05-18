---
phase: 37-claude-code-build-trigger
plan: 03
subsystem: api
tags: [nextjs-16, drizzle, vitest, audit-logging, staff-auth, build-trigger, async-params]

requires:
  - phase: 37
    plan: 01
    provides: "approvalEvents pgTable + projects.buildTriggerMode + projects.localPath columns + BuildTriggerMode type"
  - phase: 37
    plan: 02
    provides: "buildPrompt() pure-function generator + BuildPromptInput/BuildPromptItem/BuildPromptProject types"

provides:
  - "POST /api/admin/projects/[slug]/generate-build endpoint (staff-gated)"
  - "Response shape: 200 {prompt, mode, item_count} | 404 project_not_found | 409 no_approved_items | 400 managed_agent_not_available | 403 Forbidden"
  - "Audit row contract: subject_type='build_trigger', subject_id=project.id, decision='triggered', surface='web', actor_email=session.email, comment=prompt.slice(0,200), metadata={mode, item_count}, project=project.key"
  - "10/10 Vitest cases covering happy path, error branches, audit shape, async-params regression guard"

affects:
  - 37-05 (Generate Build modal — fetches this endpoint and consumes {prompt, mode, item_count})
  - 37-06 (Approval-events audit page — renders the rows this endpoint writes)

tech-stack:
  added: []  # no new deps; pure composition of existing helpers
  patterns:
    - "Vitest db-select chain mock with .where()→{then,limit} duck-typing so both .limit(1) and direct-await terminate on the same mocked promise (handles projects vs bugs/features asymmetry in one mock)"
    - "Audit row written AFTER buildPrompt() so the comment field is sourced from the EXACT prompt returned to the caller (single source of truth — no client-side regeneration drift)"
    - "Early-return on managed_agent BEFORE issuing items queries (saves 2 DB calls on blocked-mode hits)"

key-files:
  created:
    - src/app/api/admin/projects/[slug]/generate-build/route.ts
    - src/app/api/admin/projects/[slug]/generate-build/route.test.ts
  modified: []

key-decisions:
  - "Used --no-verify on both commits per phase context constraint (parallel wave 2 — 37-02/37-04 agents committing concurrently on main checkout; hooks would lock-contend)"
  - "Project lookup ordered FIRST so the 404 and 400-managed_agent branches short-circuit before the parallel bugs/features queries — saves wasted DB roundtrips on the most common error paths"
  - "Audit row INSERTED outside an explicit transaction: there is exactly one write per request and the 200 response is sent after .values() resolves; a tx would add overhead with zero atomicity benefit"
  - "Test 8 (Pitfall 9 regression) uses a setTimeout-deferred Promise.resolve to make the await observable — if the handler ever drops the await, accessing .slug on the unresolved promise would throw and the test would fail"
  - "Test mock for db.select uses .where() returning a thenable that ALSO exposes .limit() so the projects lookup (terminates on .limit(1)) and the bugs/features lookups (terminate on .where()) share one mock chain — mirrors upcoming/route.test.ts but adapted to async/await terminators instead of .orderBy()"

patterns-established:
  - "Pattern: 'first-200-chars audit comment' from buildPrompt() output keeps audit-row size bounded while preserving enough context for staff to grep their build history"
  - "Pattern: 'managed_agent placeholder' returns 400 (not 501) because the UI button is supposed to be disabled — receiving the call is a UI bug to surface, not a server-not-implemented condition"

requirements-completed: [TRIG-06]

duration: ~9 min
completed: 2026-05-18
---

# Phase 37 Plan 03: Generate-Build API Summary

**POST /api/admin/projects/[slug]/generate-build — staff-gated endpoint composing 37-02 buildPrompt() with single-row approval_events audit write; locks the {prompt, mode, item_count} contract that 37-05 modal will fetch.**

## Performance

- **Duration:** ~9 min
- **Started:** 2026-05-18T20:03:48Z (approx — first read in this session)
- **Completed:** 2026-05-18T20:12:44Z
- **Tasks:** 1/1 (single TDD task: RED → GREEN, no REFACTOR needed)
- **Files created/modified:** 2 new (route + test)
- **Test count:** 10 (target was >= 7; landed 10 for full branch coverage)

## Accomplishments

- **POST endpoint shipped** at `src/app/api/admin/projects/[slug]/generate-build/route.ts`. Staff-only via `requireStaff()`; handles Next.js 16 async params (Pitfall 9) with `params: Promise<{ slug: string }>` then `await params`.
- **Complete error-branch coverage**: 403 (non-staff), 404 (unknown project), 400 (`managed_agent_not_available` placeholder), 409 (`no_approved_items` defensive guard for disabled-button bypass). Each branch tested and ensures NO `approval_events` row is written.
- **Audit row contract locked**: every successful call writes EXACTLY ONE `approval_events` row with `subject_type='build_trigger'`, `subject_id=project.id`, `decision='triggered'`, `surface='web'`, `actor_email=session.email`, `comment=prompt.slice(0,200)`, `metadata={mode, item_count}`, `project=project.key`. 37-06 audit page will render these rows.
- **buildPrompt single-source contract**: the comment field is sourced from the SAME string returned in the response — no client-side regeneration drift between what staff sees and what audit captures.
- **10/10 Vitest GREEN** in 19ms — fast, no flakes. Covers happy path (bugs+features, bugs-only, features-only), all 4 error branches, audit comment trimming at 200 chars, manual mode (valid trigger), and Pitfall 9 async-params regression guard.

## Task Commits

1. **RED — failing test scaffold** — `6ab289d` (`test(37-03): add failing test for generate-build API (RED)`)
   - 333 lines: 10 Vitest cases, mock setup for `@/lib/db`, `@/lib/api-auth`, `@/lib/build-prompt`, `drizzle-orm`
   - Verified RED: `Error: Failed to resolve import "./route"` as expected
2. **GREEN — route implementation** — `3db6d66` (`feat(37-03): implement POST /api/admin/projects/[slug]/generate-build (GREEN)`)
   - 122 lines: full POST handler with auth/project lookup/managed-agent gate/parallel item loads/buildPrompt call/audit insert
   - All 10 tests GREEN; all 7 acceptance grep checks PASS

**Plan metadata commit:** Will be `_metadata_` hash (added at end of executor run).

_Note: No REFACTOR commit — implementation matched plan spec exactly on first GREEN pass, no obvious cleanup needed._

## Files Created/Modified

- `src/app/api/admin/projects/[slug]/generate-build/route.ts` — POST handler (122 lines): requireStaff → await params → project lookup → managed_agent gate → Promise.all(bugs, features) → buildPrompt() → db.insert(approvalEvents) → JSON response
- `src/app/api/admin/projects/[slug]/generate-build/route.test.ts` — Vitest suite (333 lines): 10 cases with hoisted mocks for db chain, drizzle operators, requireStaff, buildPrompt

## Decisions Made

1. **Used --no-verify on both commits** — phase context says parallel wave 2 (37-02/37-04 agents committing concurrently on the main admin/ checkout); pre-commit hooks lock-contend across agents.
2. **Project lookup first, items second** — short-circuits 404 and managed_agent (400) branches before issuing the parallel bugs+features queries. Saves 2 DB roundtrips on the most common error paths.
3. **No explicit transaction around the audit insert** — there is exactly one write per request and the 200 response is sent after `.values()` resolves; a tx adds overhead with zero atomicity benefit (no second write to coordinate with).
4. **Test 8 makes the await observable** — uses `new Promise(r => setTimeout(() => { resolved = true; r({slug}); }, 10))` so the test can assert `resolved===true` after `await POST(...)`. If the handler ever drops the await, accessing `.slug` on the unresolved promise would throw and the test would fail. Stronger regression guard than a grep.
5. **db.select chain mock uses thenable+.limit** — the projects lookup terminates on `.limit(1)` but bugs/features terminate on `.where()`. Single mock returns `{then, limit}` so both shapes resolve through one queue (`mockSelectWhere.mockResolvedValueOnce` calls). Mirrors the upcoming/route.test.ts pattern but adapted to async/await terminators instead of `.orderBy()`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] 37-02 build-prompt module did not yet exist when this plan started**

- **Found during:** Task 1 RED phase setup
- **Symptom:** `src/lib/build-prompt.ts` was missing; only `src/lib/build-prompt.test.ts` existed (37-02 was at RED, not GREEN, when this agent spun up). Direct ES-module import in the route file would have caused TypeScript compile failure and `npx next build` to fail.
- **Root cause:** Parallel wave 2 — 37-02 agent committed RED (cc58f74) but had not yet completed GREEN. My plan declares `depends_on: [37-01, 37-02]`, so 37-02's GREEN must land before my `next build` check.
- **Fix:** Vitest mocks `@/lib/build-prompt` with `vi.mock(...)`, which uses the locked `<interfaces>` contract from the plan — so my tests ran independent of the real module. By the time I ran `npx next build`, 37-02 GREEN had landed (commit 297fd0e), and the build compiled successfully. No code change needed; just sequencing.
- **Files modified:** None (test mocks the module path)
- **Verification:** `npx next build` exits 0 with the new route registered: `├ ƒ /api/admin/projects/[slug]/generate-build`
- **Commit:** N/A (no fix needed — Vitest mock pattern is robust to upstream module not existing yet, and 37-02 landed in time for the final build check)

---

**Total deviations:** 1 auto-fixed (1 blocking — environmental sequencing, no code change)
**Impact on plan:** Zero scope creep. The plan correctly anticipated this via its `<interfaces>` block (executor was instructed to depend on the contract, not the implementation) and via the Vitest mock pattern (which doesn't need the upstream module to exist for tests to compile).

## Issues Encountered

- None during the TDD cycle. RED failed for the expected reason (missing `./route` module). GREEN passed all 10 tests on the first try. All 7 acceptance grep checks returned the expected counts. `npx next build` succeeded end-to-end.

## Authentication Gates

- None. The endpoint USES `requireStaff` (the project's existing staff-gating helper); this plan did not need to call any external CLI that would require auth.

## User Setup Required

None — no external service configuration required. The endpoint uses the project's existing CockroachDB connection (`DATABASE_URL` from FAH secrets) and existing NextAuth session machinery; no new env vars, no new dashboards, no new keys.

## Sample approval_events Row for Manual TMI Integration Test

When a staff user (e.g. `mike@triarch.dev`) hits POST `/api/admin/projects/tmi/generate-build` with 2 approved bugs + 1 approved feature, the inserted row will look like:

```json
{
  "id": "<auto-uuid>",
  "subject_type": "build_trigger",
  "subject_id": "<tmi project.id uuid>",
  "decision": "triggered",
  "surface": "web",
  "actor_email": "mike@triarch.dev",
  "comment": "---\nproject: tmi\nversion: 4.46.1\nitems:\n  - id: <bug-uuid-1>\n    type: bug\n  - id: <bug-uuid-2>\n    type: bug\n  - id: <feat-uuid-1>\n    type: feature\n---\n\n## Context\n\nProject: **TMI Engin",
  "metadata": { "mode": "local_claude", "item_count": 3 },
  "project": "tmi",
  "created_at": "<now>"
}
```

(The `comment` field is the EXACT first 200 chars of the buildPrompt() output that the modal received — the same string the staff member is about to paste into Claude Code.)

## Next Phase Readiness

**For 37-05 (Generate Build UI modal):**
- `fetch('/api/admin/projects/${slug}/generate-build', { method: 'POST' })` returns `{prompt, mode, item_count}` on 200
- Use `mode` to switch UI: `local_claude` → show Copy + Open Claude Code buttons; `manual` → show ONLY Copy button; `managed_agent` → don't even reach this endpoint (button should be disabled at the page level since 37-04 ships the per-project mode picker)
- Use `item_count` for a "Generated for N items" confirmation toast
- On 409 (`no_approved_items`): show error toast "No approved items — refresh the page" (defensive — UI button should already be disabled)
- On 400 (`managed_agent_not_available`): show tooltip "Managed Agent ships in v2.5" (this is the placeholder mode CONTEXT.md called out)
- On 404/403: standard error handling

**For 37-06 (Approval-events audit page):**
- Query: `SELECT * FROM approval_events WHERE subject_type='build_trigger' AND project=? ORDER BY created_at DESC` — index `approval_events_project_idx` exists from 37-01
- Render columns: `created_at`, `actor_email`, `metadata->>'mode'`, `metadata->>'item_count'`, truncated `comment`
- For per-project page: filter by `project=?`; for global staff feed: filter by `subject_type='build_trigger'` only

**No blockers.** Plan executed exactly as specified; the contract is stable.

## Self-Check: PASSED

Verified all claims:
- `src/app/api/admin/projects/[slug]/generate-build/route.ts` — FOUND
- `src/app/api/admin/projects/[slug]/generate-build/route.test.ts` — FOUND
- `.planning/phases/37-claude-code-build-trigger/37-03-generate-build-api-SUMMARY.md` — FOUND
- Commit `6ab289d` (RED) — FOUND
- Commit `3db6d66` (GREEN) — FOUND
- Vitest re-run: 10/10 PASS in 19ms
- `npx next build` exits 0 with route registered: `├ ƒ /api/admin/projects/[slug]/generate-build`
- All 7 acceptance grep checks return expected counts:
  - `params: Promise<{ slug: string }>` → 1
  - `await params` → 1
  - `db.insert(approvalEvents)` → 1
  - `subjectType: 'build_trigger'` → 1
  - `prompt.slice(0, 200)` → 1
  - `'managed_agent_not_available'` → 1
  - `requireStaff` → 2 (import + call)

---
*Phase: 37-claude-code-build-trigger*
*Completed: 2026-05-18*
