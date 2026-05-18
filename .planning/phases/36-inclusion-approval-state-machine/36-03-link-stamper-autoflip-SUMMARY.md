---
phase: 36-inclusion-approval-state-machine
plan: 03
subsystem: link-stamper / commit-ingest
tags: [link-stamper, commit-parser, auto-flip, state-machine, audit, observability, tdd]

requires:
  - phase: 36
    plan: 01
    provides: "inclusion_state column + workflow_transitions table + state-machine helper"
  - phase: 11
    provides: "commit-parser + link-stamper foundation — 100% test baseline preserved"

provides:
  - "stampLinksFromCommit auto-flip: approved_for_build → built on commit reference, with next_release_log_id stamped"
  - "workflow_transitions audit row per flip (transitionedBy='commit-parser:{sha}', reason='auto-flip from commit')"
  - "StampResult extended: { stamped, dropped, autoFlipped, orphanLinks } — back-compat optional commitSha input"
  - "Pitfall 5 idempotency: state-guard WHERE clause makes re-ingest a no-op"
  - "Pitfall 4 orphan-link signal: console.warn structured payload when commit refs items NOT in approved_for_build"
  - "v2.1 Phase 11 commit-parser + link-stamper test baseline preserved (45/45 tests unchanged)"

affects:
  - 36-04 (prod-ingest auto-flip — built→deployed — reads next_release_log_id stamped here)
  - 36-05a, 36-05b (UI shows built/deployed state set by this code path)
  - 36-06 (admin upcoming endpoint reads inclusion_state values driven by this auto-flip)

tech-stack:
  added: []  # no new deps
  patterns:
    - "Vitest mock chain extension: extend existing db mock with db.update(t).set(u).where(c).returning(cols) without breaking existing select/insert chain"
    - "M-5 pre-flight back-compat: apply ONLY benign SELECT-projection change first, verify 100% baseline GREEN, THEN land the load-bearing logic"
    - "Mock returning() echoes INSERTed row fields onto .returning() result — matches real PG/Drizzle .returning() behavior so route can read release.commitSha"
    - "State-guard WHERE for idempotent UPDATE: WHERE id IN (...) AND inclusion_state='approved_for_build' — re-runs match zero rows naturally"

key-files:
  created: []
  modified:
    - src/lib/link-stamper.ts (+86 lines: StampResult extension, inclusion-state maps, auto-flip block, audit writes, updated returns)
    - src/lib/link-stamper.test.ts (+186 lines: db.update mock chain, M-5 pre-flight SELECT-projection change, 7 new tests A-G)
    - src/app/api/platform/ingest/release-logs/route.ts (+15 lines: capture stampResult, pass commitSha, orphan warning)
    - src/app/api/platform/ingest/release-logs/route.test.ts (+82 lines: stamper mock shape, returning() echo, 3 new Phase 36 tests A/B/C)

key-decisions:
  - "commitSha is OPTIONAL (Open Question 1 resolution): preserves back-compat for any non-ingest caller; missing-sha audit row uses transitionedBy='commit-parser:unknown' so audit trail is never dropped"
  - "Orphan-link soft-warning is console.warn (Open Question 2 V1): structured payload {releaseId, project, orphanLinks, autoFlipped, stamped}; durable stats table or Datadog metric deferred to follow-up phase per RESEARCH OQ-2"
  - "State-guard idempotency confirmed via Test G: SELECT may say 'approved_for_build' (stale view) but UPDATE WHERE re-checks the column — empty returning() drives autoFlipped=0 with no audit row written (Pitfall 5 anchored in test)"
  - "Invalid (unknown-to-DB) bug/feature IDs are NOT counted as orphans (Test F) — orphan only counts refs that VALIDATED against the table but had non-approved inclusion_state. Unknown IDs are 'dropped' per existing v2.1 semantics."
  - "M-5 pre-flight verified live: 45/45 pre-existing tests still GREEN with ONLY the SELECT projection expansion applied (no auto-flip code) — proves no v2.1 test asserts on SELECT row shape"
  - "Two pre-existing fast-path tests used toEqual({stamped:0, dropped:0}) strict equality; updated to toEqual({stamped:0, dropped:0, autoFlipped:0, orphanLinks:0}) — direct consequence of StampResult API extension, in scope per Rule 1"

patterns-established:
  - "Two-step TDD with M-5 pre-flight: apply benign API-shape change → confirm 100% baseline → apply behavior change. Catches projection-shape regressions before load-bearing logic obscures them."
  - "Forgiving stamper with observable signal: console.warn on orphan never throws; existing try/catch envelope in caller absorbs anything else; ingest 201 path never blocked by stamper concerns"

requirements-completed: [INCL-06]

duration: ~6min
completed: 2026-05-18
---

# Phase 36-03: Link-Stamper Auto-Flip Summary

**stampLinksFromCommit now flips approved_for_build → built on commit reference with full audit + idempotency + orphan-link observability — and the v2.1 Phase 11 baseline is 100% preserved.**

## Performance

- **Duration:** ~6 min (Tasks 1-2 via parallel executor agent)
- **Started:** 2026-05-18T18:13:41Z
- **Completed:** 2026-05-18T18:19:55Z
- **Tasks:** 2/2 (TDD RED→GREEN for both)
- **Files modified:** 4

## Accomplishments

- **link-stamper.ts auto-flip block landed AFTER existing INSERT (line 145 insertion point honored)** — the existing `db.insert(releaseLogLinks).values(insertRows)` line and everything above it is byte-untouched.
- **StampResult extended:** `{ stamped, dropped, autoFlipped, orphanLinks }` — old callers see stamped/dropped unchanged; new caller (ingest route) reads autoFlipped/orphanLinks.
- **workflow_transitions audit row written per flip** with `transitionedBy='commit-parser:{sha}'`, `reason='auto-flip from commit'`, `metadata={releaseLogId}` — entityType is `bug_report` or `feature_request` per validated ref type.
- **Pitfall 5 idempotency proven in test:** state-guard WHERE clause `inclusion_state='approved_for_build'` makes re-runs of the same commit return empty from `.returning()` → autoFlipped=0, no audit row written.
- **Pitfall 4 orphan-link signal landed at ingest route:** when commit references an item NOT in approved_for_build, the release_log_links row is STILL written (v2.1 behavior preserved) and `console.warn('[link-stamper] orphan links detected', {releaseId, project, orphanLinks, autoFlipped, stamped})` fires.
- **100% v2.1 Phase 11 commit-parser + link-stamper baseline preserved** — 45 pre-existing tests still GREEN; only 2 pre-existing strict-equality assertions updated to match new StampResult shape (in-scope per Rule 1 — direct consequence of the API extension).
- **64 total tests GREEN** across the three test files in scope (45 link-stamper baseline + 7 new auto-flip A-G; 9 ingest route baseline + 3 new Phase 36 A/B/C).

## M-5 Pre-Flight Result (critical acceptance per plan revision)

**PASSED.** Applied ONLY the SELECT projection expansion (`select({id})` → `select({id, inclusionState})`) on bugReports + featureRequests. Ran `npx vitest run src/lib/link-stamper.test.ts src/lib/commit-parser.test.ts`. Result: **45/45 tests GREEN** with the expanded projection alone — proving NO pre-existing v2.1 test asserts on the SELECT row shape. Then proceeded to land the auto-flip logic on top of a verified-clean baseline.

If any test had failed at the pre-flight step, the failure would have been clearly attributable to the projection change (one isolated edit) rather than getting buried under the auto-flip extension diff. Zero failures observed; the pre-flight is documented evidence that the M-5 mitigation worked as designed.

## Task Commits

1. **Task 1 RED — failing tests for link-stamper auto-flip + orphan tracking** — `b011bf0` (test)
2. **Task 1 GREEN — implement link-stamper auto-flip + orphan tracking (INCL-06)** — `2431e27` (feat)
3. **Task 2 RED — failing tests for ingest route commitSha + orphan warning** — `56afb60` (test)
4. **Task 2 GREEN — ingest passes commitSha + surfaces orphan-link warnings** — `88deee9` (feat)

_Plan SUMMARY.md to be committed separately via gsd-tools._

## Files Created/Modified

- `src/lib/link-stamper.ts` — StampResult extended; bugInclusionStates + featureInclusionStates maps populated from SELECT; auto-flip block inserted AFTER line 145 INSERT and BEFORE return; updated fast-path + catch-block returns to 4-field shape; state-guard WHERE on both bug + feature UPDATEs
- `src/lib/link-stamper.test.ts` — `mockDbUpdateSet/Where/Returning` mock chain added to db mock; M-5 pre-flight SELECT projection change applied; 7 new tests A-G covering happy path, orphan, feature flip, mixed batch, missing-sha fallback, invalid-ID negative-orphan, state-guard idempotency; 2 pre-existing strict-equality assertions updated to new shape
- `src/app/api/platform/ingest/release-logs/route.ts` — stampResult captured; `commitSha: release.commitSha ?? undefined` passed through; `if (stampResult.orphanLinks > 0)` block emits structured console.warn; existing try/catch envelope preserved verbatim
- `src/app/api/platform/ingest/release-logs/route.test.ts` — stamper mock returns proper 4-field StampResult by default; insertValuesMock now echoes inserted row fields onto returning() result (matches real PG behavior so release.commitSha flows); 3 new Phase 36 tests A/B/C cover commitSha passthrough, orphan warning shape, and negative-warn guard

## Deviations & Recoveries

**1. [Rule 1 — Bug] Two pre-existing fast-path tests used strict-equality on StampResult shape**
- **Found during:** Task 1 GREEN verification
- **Issue:** `result).toEqual({stamped: 0, dropped: 0})` failed because the new return shape has 4 fields, not 2 (`toEqual` does deep equality on the full object)
- **Fix:** Updated both assertions to `toEqual({stamped: 0, dropped: 0, autoFlipped: 0, orphanLinks: 0})` to match the new API shape
- **Files modified:** src/lib/link-stamper.test.ts (2 tests: empty message + plain prose fast paths)
- **Rationale:** Direct consequence of the StampResult API extension declared in the plan; the plan action step 3 explicitly anticipated this exact regression and instructed to fix in-scope.
- **Commit:** Folded into `2431e27` (Task 1 GREEN) since it's part of the same atomic API-shape change.

**2. [Rule 1 — Bug] Stamper mock returned `undefined` causing route to crash reading `.orphanLinks`**
- **Found during:** Task 2 RED setup
- **Issue:** The pre-existing test mock `stampLinksFromCommit: vi.fn().mockResolvedValue(undefined)` worked when the route ignored the return value, but Task 2 captures `const stampResult = await stampLinksFromCommit(...)` and then reads `stampResult.orphanLinks` — TypeError on undefined.
- **Fix:** Updated default mock to return proper StampResult shape `{stamped: 0, dropped: 0, autoFlipped: 0, orphanLinks: 0}` and added per-test override pattern via `mockResolvedValueOnce`.
- **Files modified:** src/app/api/platform/ingest/release-logs/route.test.ts
- **Commit:** Folded into `56afb60` (Task 2 RED) since the mock-shape fix is needed to even run the new tests.

**3. [Rule 1 — Bug] Mock insertValuesMock returned fixed FAKE_RELEASE_ROW (no commitSha echo)**
- **Found during:** Task 2 GREEN verification (Phase 36-A failed)
- **Issue:** The route reads `release.commitSha` (the value returned by `.returning()` after INSERT). The test mock returned a static FAKE_RELEASE_ROW with no commitSha, so the assertion that the stamper received `commitSha: 'sha-abc-123'` saw undefined.
- **Fix:** Updated `insertValuesMock` to use `mockImplementation((row) => ({ returning: vi.fn().mockResolvedValue([{ ...FAKE_RELEASE_ROW, ...row }]) }))` — echoes the inserted row fields onto the returning() result, matching real PG/Drizzle `.returning()` behavior. This is a correctness fix for the mock harness (the previous shape didn't model PG faithfully).
- **Files modified:** src/app/api/platform/ingest/release-logs/route.test.ts (beforeEach mock setup)
- **Commit:** Folded into `88deee9` (Task 2 GREEN) since the mock fix is required for the route change to be verifiable.

**No Rule 4 architectural decisions raised — every change stayed within the locked plan boundaries.**

## Vitest Mock Complexity Notes

- The new `db.update(t).set(u).where(c).returning(cols)` chain was added alongside the existing `db.select(...)...where` and `db.insert(...).values` chains. Required 3 mock fns (`mockDbUpdateSet`, `mockDbUpdateWhere`, `mockDbUpdateReturning`) plus careful chaining so each link returns the next. Default behavior: `.returning()` resolves to `[]` if not seeded, which naturally drives the Pitfall 5 idempotency path in Test G.
- `mockDbInsertValues` is called TWICE per flip path: once for the existing `releaseLogLinks` INSERT (call index 0) and once for the audit `workflowTransitions` INSERT (call index 1). Tests use `mockDbInsertValues.mock.calls[1][0]` to inspect the audit payload. The forgiving error-handling test (existing pre-Phase-36) uses `mockReturnValueOnce(Promise.reject(...))` which still throws on the first INSERT and the try/catch absorbs it cleanly.
- No Promise.resolve wrapping needed for mockDbUpdateReturning beyond the default — Vitest's `.mockReturnValueOnce(Promise.resolve(...))` works as expected.

## Mi-4 SUMMARY Note (per plan revision pass)

The Pitfall 4 orphan-link surface ships as `console.warn('[link-stamper] orphan links detected', {releaseId, project, orphanLinks, autoFlipped, stamped})` — this is **v1 of CONTEXT D-03 "stats surface"**. A proper structured-metrics dashboard surface is deferred to a follow-up phase per RESEARCH OQ-2 recommendation. Track in v2.5 roadmap candidates: **"promote orphan-link console.warn to durable stats table or Datadog metric — pending dogfooding signal on whether the warning frequency justifies it."** The structured console.warn payload is parseable from log aggregation now (Cloud Logging filter `jsonPayload.message="[link-stamper] orphan links detected"`); the dashboard table can be added later without changing the emission shape.

## TMI Smoke-Test Status

Not run as part of this plan (in-repo only — DB-side smoke requires a live TMI commit and ingest round-trip). The success-criterion smoke (find a TMI bug, flip to approved_for_build via API, push commit referencing BUG-{uuid}, verify auto-flip + audit row in workflow_transitions) is the natural UAT for **after** Plans 36-02 (PATCH allowlist) and 36-05 (UI surface) ship, since you need the PATCH endpoint to flip TMI bugs to approved_for_build in the first place. Recorded as deferred verification for the Phase 36 close.

## Forgiving Envelope Confirmation

The existing try/catch envelope at `src/app/api/platform/ingest/release-logs/route.ts:159-201` (the outer try wrapping all link-stamper interactions) is preserved verbatim. The new `if (stampResult.orphanLinks > 0) console.warn(...)` block lives INSIDE the try, so even a console.warn-throwing edge case (improbable) would be caught by the existing `} catch (err) { console.error('[ingest/release-logs] link stamping failed (non-blocking)', err); }`. Net effect: release ingest still returns 201 even if every imaginable thing in the stamper or warning path goes sideways. Verified by grep — `link stamping failed (non-blocking)` count remains 1.

## What this enables

- **36-04 (prod-ingest auto-flip):** can now SELECT rows WHERE `inclusion_state='built' AND next_release_log_id=devRow.id`. This plan is what populates `next_release_log_id` for built items — without it, the prod flip would match nothing.
- **36-05/36-06 (UI + customer surface):** the `built` and `deployed` states are now populated authentically as code ships, not as a manual data backfill. The customer `/upcoming` page will show genuinely-coming items.
- **Observability:** any commit that references a `BUG-{uuid}` whose owner forgot to move it to `approved_for_build` first fires a clear, structured warning. Staff sees the signal immediately; the link is still written for traceability.

## Outstanding from this plan

- TMI smoke-test deferred to Phase 36 close (depends on 36-02 PATCH endpoint to flip TMI bugs to approved_for_build first).
- v2.5 roadmap candidate: promote orphan-link console.warn to durable stats table or Datadog metric (Mi-4 note above).
- No DB migration changes in this plan — schema columns + workflow_transitions table were landed by 36-01. This plan is application-code only.

## Self-Check: PASSED

- src/lib/link-stamper.ts: FOUND (extended)
- src/lib/link-stamper.test.ts: FOUND (extended)
- src/app/api/platform/ingest/release-logs/route.ts: FOUND (extended)
- src/app/api/platform/ingest/release-logs/route.test.ts: FOUND (extended)
- Commit b011bf0 (test RED Task 1): FOUND
- Commit 2431e27 (feat GREEN Task 1): FOUND
- Commit 56afb60 (test RED Task 2): FOUND
- Commit 88deee9 (feat GREEN Task 2): FOUND
- All 4 acceptance-grep counts on link-stamper.ts: MATCHED (autoFlipped=8, orphanLinks=8, commit-parser:=2, auto-flip from commit=2, both state-guards=1+1, commitSha?=3)
- All 4 acceptance-grep counts on route.ts: MATCHED (commitSha: release.commitSha=1, orphan links detected=1, stampResult.orphanLinks > 0=1, link stamping failed (non-blocking)=1)
- 64/64 tests across all 3 files in scope: GREEN
- M-5 pre-flight: PASSED (45/45 v2.1 baseline GREEN with ONLY projection change applied)
