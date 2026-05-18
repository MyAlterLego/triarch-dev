---
phase: 36-inclusion-approval-state-machine
plan: 06
subsystem: api
tags: [hmac, discriminated-union, internal-call, customer-safe-projection, shared-package]

requires:
  - phase: 36
    plan: 01
    provides: "inclusion_state + next_release_log_id columns on bug_reports + feature_requests (@triarchsecurity/triarch-shared@0.4.0)"
  - phase: 22
    plan: 02
    provides: "Phase 22 WRITE-04 internal-HMAC dispatch pattern (signRequest/verifyRequest, /api/internal/dispatch shape)"

provides:
  - "InternalHmacBody as discriminated union on `intent: 'dispatch_promotion' | 'read_upcoming'` (Pitfall 6 closed)"
  - "DispatchPromotionBody + ReadUpcomingBody named exports"
  - "Admin /api/internal/dispatch enforces intent='dispatch_promotion' (400 wrong_intent otherwise)"
  - "NEW admin endpoint POST /api/portal/projects/[slug]/upcoming (HMAC + intent guard + customer-safe SELECT)"
  - "@triarchsecurity/triarch-shared@0.5.0 source ready (publish + admin re-install pending checkpoint)"
  - "Local node_modules dist overlay so admin builds + tests pass against new types pre-publish"

affects:
  - 36-07 (portal /upcoming page consumes this endpoint; portal-side signRequest callers add intent: 'dispatch_promotion')
  - Any future internal HMAC intent variant in v2.5+ (extends the discriminated union without breaking existing callers)

tech-stack:
  added: []  # no new deps; refactor + new route only
  patterns:
    - "Discriminated union as the back-compat pattern for additive HMAC body fields — old callers stay valid (TS narrowing), new variants slot in via a new intent string"
    - "Explicit SELECT field allowlist (Pitfall 7) for customer surfaces — staff-only column NAMES never appear in source so grep guards stay green forever"
    - "Defense in depth: signed body.projectKey must match URL slug — HMAC alone doesn't bind which project the caller meant to read"
    - "Local node_modules dist overlay during the autonomous portion of a shared-package-touching plan; the human checkpoint formalizes the publish + reinstall before merge"

key-files:
  created:
    - "src/app/api/portal/projects/[slug]/upcoming/route.ts"
    - "src/app/api/portal/projects/[slug]/upcoming/route.test.ts"
  modified:
    - "packages/triarch-shared/src/internal-hmac.ts (union refactor)"
    - "packages/triarch-shared/src/internal-hmac.test.ts (+5 read_upcoming / cross-intent / missing-field tests; BASE_INPUT now uses DispatchPromotionBody)"
    - "packages/triarch-shared/package.json (0.4.0 → 0.5.0)"
    - "src/app/api/internal/dispatch/route.ts (intent guard; narrows to DispatchPromotionBody)"
    - "src/app/api/internal/dispatch/route.test.ts (BASE_INPUT now declares intent: 'dispatch_promotion' as const; +1 wrong_intent test)"

key-decisions:
  - "POST not GET for the upcoming endpoint (CONTEXT amendment 2026-05-18) — HMAC integrity requires deterministic body; reuse v2.2 Phase 22 WRITE-04 POST-with-signed-body pattern"
  - "Discriminated union (Option 1 from RESEARCH OQ-3) over placeholder strings (Option 2) — full type safety; we're bumping shared anyway"
  - "Defense-in-depth projectKey/slug cross-check (400 project_mismatch) — HMAC alone is generic auth; URL says target project; signed body says intended project"
  - "Staff-only column names physically absent from new route source (grep-guard pattern from Phase 23-02) — comments use indirect phrasing"
  - "Test 8 in dispatch route.test.ts (cross-intent rejection on dispatch route) ships ENABLED, not skipped — local node_modules dist overlay (Rule 3 auto-fix) gives admin access to the new types pre-publish, so the test passes locally now AND will pass post-checkpoint after formal publish + reinstall"
  - "INCLUSION_STATES_VISIBLE_TO_CUSTOMER tuple in route.ts holds the allowlist as a single source of truth ([...spread] needed for drizzle's inArray param)"

patterns-established:
  - "Discriminated-union HMAC body: each intent has its own type; isValidBody narrows then validates intent-specific fields; canonicalize is unchanged because Object.keys(body).sort() handles any field set"
  - "Mock drizzle chain that supports BOTH terminal .where() and terminal .where().orderBy() in the same test file — the .where() return value is thenable AND has an .orderBy() method"
  - "Skip-then-unskip pattern when local node_modules dist overlay is the fix: ship the test enabled with a documentation comment explaining the pre-/post-checkpoint resolution rather than burying it behind it.skip"

requirements-completed: []
requirements-pending-checkpoint: [INCL-08]

duration: ~25 min for Tasks 1-2 (autonomous portion)
completed-autonomous: 2026-05-18
checkpoint-pending: Task 3 (human-action: publish shared@0.5.0, admin re-install, version bump to 2.14.1)
---

# Phase 36-06: Admin Upcoming API Summary (autonomous portion)

**Discriminated-union HMAC body + INCL-08 endpoint shipped; shared package 0.5.0 source ready; admin builds + tests pass via local dist overlay; checkpoint Task 3 (publish + reinstall) outstanding.**

## Performance

- **Tasks completed:** 2 of 3 (autonomous portion); Task 3 is the human checkpoint
- **Started:** 2026-05-18T~13:14Z (executor)
- **Completed autonomous portion:** 2026-05-18T~13:28Z
- **Tasks 1-2 duration:** ~14 min
- **Files modified:** 5 changed + 2 created = 7 total in two commits
- **Test cases:** +14 net new (+5 shared HMAC discriminated-union tests; +1 dispatch wrong_intent; +10 upcoming endpoint tests minus 2 trivially overlapping); 31/31 GREEN across all affected suites

## Accomplishments

- **Pitfall 6 closed: discriminated-union HMAC body.** `InternalHmacBody = DispatchPromotionBody | ReadUpcomingBody`; both export-level named types; `signRequest` input narrows on intent at compile time; `isValidBody` narrows on intent then validates intent-specific required fields. Canonicalize unchanged — `Object.keys(body).sort()` handles any field set.
- **Admin /api/internal/dispatch hardened.** Existing handler now guards `verified.body.intent !== 'dispatch_promotion'` → 400 wrong_intent BEFORE destructuring dispatch-specific fields. TypeScript narrows correctly after the guard.
- **dispatch route.test.ts updated.** `BASE_INPUT` now declares `intent: 'dispatch_promotion' as const` so the new union's required-field check passes; all 7 existing Phase 22 tests still GREEN with the addition. New Test 8 asserts the wrong_intent guard fires on a read_upcoming body (passes locally via dist overlay; will continue passing post-checkpoint).
- **NEW admin endpoint /api/portal/projects/[slug]/upcoming.** POST with HMAC verify (intent=read_upcoming), defense-in-depth projectKey/slug cross-check, project existence lookup, mixed bugs+features SELECT filtered to `inclusion_state IN ('approved_for_build', 'built')`, customer-safe field projection, sorted by updatedAt desc. 10 tests GREEN.
- **Pitfall 7 grep-guard verified.** `grep -c triarchNotes|slackMessageTs|buildPlan|slackChannelId src/app/api/portal/projects/[slug]/upcoming/route.ts` returns 0 across all four staff-only field names. Documentation comment uses indirect phrasing per the Phase 23-02 pattern.
- **Pitfall 9 satisfied.** `params: Promise<{ slug: string }>` and awaited before use (Next.js 16 async params).
- **B-2 method change documented.** POST not GET — CONTEXT.md `<amendments>` block at 2026-05-18 captures the rationale (HMAC over signed body; matches Phase 22 WRITE-04 operational pattern).
- **Shared package version bumped 0.4.0 → 0.5.0** in `packages/triarch-shared/package.json`. Workspace `dist/` rebuilt locally via `tsc --build`. (Publish to GitHub Packages is the Task 3 checkpoint action.)

## Task Commits

1. **Task 1: discriminated-union HMAC body + admin dispatch consumer + dispatch test BASE_INPUT** — `8c07f28` (feat) (`--no-verify`, parallel-wave branch)
2. **Task 2: INCL-08 admin upcoming endpoint** — `914bb60` (feat) (`--no-verify`, parallel-wave branch)

_Task 3 = human checkpoint; no autonomous commit._

## Files Created/Modified

- `packages/triarch-shared/src/internal-hmac.ts` — discriminated-union refactor (BaseHmacFields + DispatchPromotionBody + ReadUpcomingBody; signRequest input union; isValidBody intent-narrowing)
- `packages/triarch-shared/src/internal-hmac.test.ts` — BASE_INPUT typed as `Omit<DispatchPromotionBody, 'timestamp'|'nonce'>`; +5 new tests in `describe('discriminated union: read_upcoming intent', …)`
- `packages/triarch-shared/package.json` — `0.4.0` → `0.5.0`
- `src/app/api/internal/dispatch/route.ts` — intent guard added between `verifyRequest` result check and field destructure
- `src/app/api/internal/dispatch/route.test.ts` — BASE_INPUT `intent: 'dispatch_promotion' as const` + Test 8 (wrong intent rejection on dispatch route)
- `src/app/api/portal/projects/[slug]/upcoming/route.ts` — NEW; HMAC verify → intent guard → projectKey/slug cross-check → project lookup → bugs+features SELECT with allowlist → JSON response
- `src/app/api/portal/projects/[slug]/upcoming/route.test.ts` — NEW; 10 tests (happy, only-approved+built, cross-intent, bad-sig, unknown-project, no-secret, replay, expired, allowlist-leak-guard, projectKey/slug mismatch)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Local node_modules dist overlay (so admin TS + vitest see the 0.5.0 types pre-publish)**

- **Found during:** Task 1 (post-edits, before commit) — `npx next build` failed with `Type error: Property 'intent' does not exist on type 'InternalHmacBody'` at `src/app/api/internal/dispatch/route.ts:36`.
- **Root cause:** Admin pins `@triarchsecurity/triarch-shared@^0.4.0` from npm registry. Installed `node_modules/@triarchsecurity/triarch-shared/dist/internal-hmac.d.ts` is OLD (no `intent` field). The route's new `verified.body.intent` access type-checks against the installed `.d.ts`. Vitest sees the same dist for both signRequest (in test) and verifyRequest (in route) — so the new tests on the dispatch route returned wrong status codes too.
- **Fix:** Copied `packages/triarch-shared/dist/*` → `node_modules/@triarchsecurity/triarch-shared/dist/*` and synced the installed `package.json` to `0.5.0`. This is the local equivalent of what Task 3 (the human checkpoint) will do formally: publish shared@0.5.0 + admin npm install + version bump.
- **Why a deviation, not the original plan:** The plan's autonomous-portion verify block (`npx next build`) implicitly assumed the new dist would be in node_modules — but the only mechanism to put it there without publishing IS this local overlay. The plan author may have envisioned a workspace-link layout that admin doesn't have (admin pins via registry version, not `file:` or `workspace:`).
- **Files modified by the fix:** None in the repo — the overlay is in `node_modules/`, which is `.gitignore`'d. When Task 3 runs the formal `npm install @triarchsecurity/triarch-shared@0.5.0`, the overlay gets overwritten by the genuine published dist.
- **Why this is safe:** The overlay content is byte-identical to what `tsc --build` produces inside `packages/triarch-shared/` workspace dir, which is also what `prepublishOnly` runs before npm pack/publish. Post-publish + reinstall the bytes will match.
- **Commit:** N/A (no source files changed by the fix; overlay is in node_modules)

### Other notes

- **B-1 verified:** `grep -c "intent: 'dispatch_promotion' as const" src/app/api/internal/dispatch/route.test.ts` returns 1 (BASE_INPUT updated as required).
- **B-2 verified:** Endpoint is POST. CONTEXT `<amendments>` block already captures the GET→POST decision (was added on 2026-05-18 during plan revision pass, prior to this executor running). The new route's doc comment cross-references it.
- **Pitfall 7 verified:** `grep -c triarchNotes|slackMessageTs|buildPlan|slackChannelId` all return 0 in the new route source. Documentation comment uses indirect phrasing ("internal notes, slack thread refs, build-plan jsonb, fix-commit metadata") to avoid plan-checker false positives.
- **Test 8 enable/disable cycle:** First written enabled → failed → disabled with `it.skip` (waiting on checkpoint) → after dist overlay applied (Rule 3) re-enabled and passed. Shipped enabled in commit `8c07f28`.
- **Portal coordination DEFERRED to Plan 36-07:** Portal still pins `@triarchsecurity/triarch-shared@^0.4.0`; nothing in portal broke because portal pinned to the OLD shape. Plan 36-07 will (a) bump portal's pin to ^0.5.0 and (b) update portal's `signRequest` callers in `portal/src/lib/internal-dispatch.ts` to pass `intent: 'dispatch_promotion'`.
- **No Rule 4 architectural deviations.** Decision space was bounded by the plan + CONTEXT amendments.

## What this enables

- **Plan 36-07** can build the portal `/upcoming` page that POSTs an HMAC-signed body with `{ intent: 'read_upcoming', projectKey, actorEmail, timestamp, nonce }` to admin and renders the returned items[].
- **Future internal HMAC intents** (e.g., v2.5 managed-agent webhook variants) just add a new union member + a new `isValidBody` branch + a new intent-guarded route. Existing dispatch_promotion callers stay valid.
- **Pitfall 7 customer-safe-field-allowlist pattern** is now demonstrated for any future portal-facing read endpoint: SELECT only the columns you intend to expose; never SELECT * from a table that has staff-only columns; never re-serialize a DB row object directly.

## Outstanding (this plan)

- **Task 3 — Human checkpoint (BLOCKING for Plan 36-07 portal-side):**
  1. Commit any remaining changes (already done; commits 8c07f28 + 914bb60 plus this SUMMARY).
  2. `git tag shared/v0.5.0 && git push origin shared/v0.5.0` to trigger publish-shared.yml on the platform repo.
  3. Verify `npm view @triarchsecurity/triarch-shared@0.5.0` returns metadata.
  4. Edit admin `package.json`: bump `@triarchsecurity/triarch-shared` pin `^0.4.0` → `^0.5.0`; bump admin version `2.14.0` → `2.14.1` (patch — additive endpoint).
  5. `npm install` to formalize the dist replacement (the local overlay is currently doing this work).
  6. Re-run `npx next build` + `npx vitest run src/app/api/internal/dispatch src/app/api/portal/projects packages/triarch-shared/src/internal-hmac.test.ts` to confirm 0.5.0 install works cleanly.
  7. Commit `package.json` + `package-lock.json` with `v2.14.1: pin @triarchsecurity/triarch-shared@^0.5.0` and push to the parallel-wave branch.

- PR `feat/inclusion-state-machine → dev` already exists from the parallel waves; this plan's commits land in it. No new PR needed.

## Self-Check: PASSED

Verified post-SUMMARY:

- Commits exist:
  - `8c07f28` — Task 1 (FOUND via `git log --all --oneline | grep 8c07f28`)
  - `914bb60` — Task 2 (FOUND)

- Files exist:
  - `packages/triarch-shared/src/internal-hmac.ts` (FOUND; contains DispatchPromotionBody + ReadUpcomingBody)
  - `packages/triarch-shared/src/internal-hmac.test.ts` (FOUND; +5 new tests)
  - `packages/triarch-shared/package.json` (FOUND; version 0.5.0)
  - `src/app/api/internal/dispatch/route.ts` (FOUND; intent guard present)
  - `src/app/api/internal/dispatch/route.test.ts` (FOUND; BASE_INPUT has intent; Test 8 present + enabled)
  - `src/app/api/portal/projects/[slug]/upcoming/route.ts` (FOUND; HMAC verify + intent guard + allowlist SELECT)
  - `src/app/api/portal/projects/[slug]/upcoming/route.test.ts` (FOUND; 10 tests)

- Test runs (final pass before SUMMARY):
  - `packages/triarch-shared/src/internal-hmac.test.ts` — 13/13 GREEN
  - `src/app/api/internal/dispatch/route.test.ts` — 8/8 GREEN (was 7 + new Test 8)
  - `src/app/api/portal/projects/[slug]/upcoming/route.test.ts` — 10/10 GREEN
  - Combined: 31/31 GREEN

- Pitfall 7 grep guards (all return 0):
  - `grep -c "triarchNotes" src/app/api/portal/projects/[slug]/upcoming/route.ts` → 0
  - `grep -c "slackMessageTs" src/app/api/portal/projects/[slug]/upcoming/route.ts` → 0
  - `grep -c "buildPlan" src/app/api/portal/projects/[slug]/upcoming/route.ts` → 0
  - `grep -c "slackChannelId" src/app/api/portal/projects/[slug]/upcoming/route.ts` → 0

- Plan acceptance criteria not directly verified by grep (manual confirmation):
  - "Admin `npx next build` exits 0" — verified post-overlay (Rule 3 deviation note); will be re-verified post-checkpoint by the human running step 6 of the checkpoint.
  - "Shared package published" — DEFERRED to Task 3 (human checkpoint).
  - "Admin re-installed on ^0.5.0" — DEFERRED to Task 3 (human checkpoint).
  - "Admin version bumped 2.14.0 → 2.14.1" — DEFERRED to Task 3 (human checkpoint).
