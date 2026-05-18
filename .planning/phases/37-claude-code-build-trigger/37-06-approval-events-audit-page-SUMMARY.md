---
phase: 37-claude-code-build-trigger
plan: 06
subsystem: admin-platform-audit
tags: [vitest, drizzle, next-app-router, audit-surface, build-trigger, approval-events]

requires:
  - phase: 37
    plan: 01
    provides: "approval_events table + indexes + @triarchsecurity/triarch-shared@0.6.0 export"
  - phase: 37
    plan: 03
    provides: "POST /api/admin/projects/[slug]/generate-build writes approval_events rows (the data source this page surfaces)"

provides:
  - "GET /api/platform/approval-events — staff-gated read endpoint with subject_type + project filters, limit (default 50, cap 200), ORDER BY created_at DESC; response shape {events: ApprovalEventRow[], total: number}"
  - "/admin/platform/approval-audit page — staff-only audit surface for approval_events"
  - "ApprovalAuditClient component — client-side filter UI + URL search-param mirror + comment truncation toggle"

affects:
  - "Phase 37 ROADMAP success criterion 'Every trigger writes a row to approval_events with the prompt excerpt for audit; visible in existing Slack audit page' — satisfied via the new sibling audit page (CONTEXT.md 'or equivalent' interpretation)"
  - "v3.0 customer-approval surface (deferred) — page is forward-compatible via the SUBJECT_TYPE_OPTIONS constant; adding a row to that array is the only change needed to surface new approval types"

tech-stack:
  added: []  # no new deps; reuses lucide-react, next/navigation, drizzle-orm, vitest
  patterns:
    - "Client-only audit page mirroring src/app/admin/modules/access-audit/page.tsx (useProjectOptions + useEffect fetch + URL search-param mirror) — chosen over the heavier slack-audit server-paginated pattern because v2.4 row counts are small"
    - "W-3 single-SELECT response contract — total derived from rows.length client-side; pagination can be added later without breaking the {events, total} shape"
    - "Anchored-regex (I-3) test pattern for truncation assertions — getByText(new RegExp('^...\$')) avoids false-positive whole-DOM matches and is the recommended pattern for any future ellipsis-truncation surface"

key-files:
  created:
    - src/app/api/platform/approval-events/route.ts
    - src/app/api/platform/approval-events/route.test.ts
    - src/app/admin/platform/approval-audit/page.tsx
    - src/app/admin/platform/approval-audit/ApprovalAuditClient.tsx
    - src/app/admin/platform/approval-audit/ApprovalAuditClient.test.tsx
  modified: []

key-decisions:
  - "Built as a NEW sibling page (/admin/platform/approval-audit) rather than extending /admin/modules/access-audit. Reason: access-audit reads access_logs (IAM-event domain); approval_events is a distinct entity-agnostic audit surface designed to grow (v3.0 customer approvals etc). Merging would conflate two unrelated event domains."
  - "W-3: single SELECT query; total = rows.length. No parallel count(*). v2.4 TMI pilot will see <100 events for months — pagination + true totals can be added later without breaking the response contract (consumers see total either way)."
  - "I-3: anchored regex on the truncation test (`^A{60}\\.\\.\\.\$` for truncated, `^A{200}\$` for expanded) prevents accidental whole-DOM matches when both forms could theoretically coexist in the rendered tree."
  - "Sidebar nav DEFERRED: admin sidebar is DB-driven via DynamicSidebar from @triarchsecurity/shared-ui, which fetches /api/platform/navigation backed by the menu_sections table. Adding a row requires a one-shot INSERT (or a seed script) against the prod DB — out of scope for this plan since the page is reachable via direct URL meanwhile. Tracked in 'Outstanding' below."
  - "Used --no-verify on all commits per Phase 37 context constraint (parallel-wave sessions touching main admin/ checkout)."

patterns-established:
  - "Anchored-regex (I-3) Vitest assertion for truncation toggles — see ApprovalAuditClient.test.tsx case 'comment truncates to ~60 chars in the row; Show more toggles to full text'"
  - "W-3 single-SELECT audit-list endpoint shape — see route.ts: total derived from rows.length, no count(*) query"

requirements-completed: [TRIG-06]

duration: ~4 min (2 tasks; agent-executed; TDD RED→GREEN per task)
completed: 2026-05-18
---

# Phase 37-06: Approval Events Audit Page Summary

**TRIG-06 audit surface shipped: staff-gated GET /api/platform/approval-events endpoint + new /admin/platform/approval-audit page renders approval_events rows with subject_type + project filters, comment truncation toggle, and URL-param-mirrored deep-linkable filter state. 21/21 Vitest cases GREEN; build passes.**

## Performance

- **Duration:** ~4 min (2 tasks agent-executed)
- **Started:** 2026-05-18T20:18:39Z
- **Completed:** 2026-05-18T20:22:57Z
- **Tasks:** 2/2 (Task 1 — route; Task 2 — page + client)
- **Files created:** 5 (2 route + 3 page surface)
- **Files modified:** 0
- **Test cases added:** 21 (11 route + 10 client)

## Accomplishments

- **GET /api/platform/approval-events shipped** — staff-gated via `requireStaff`; reads `approvalEvents` (37-01's shared schema export) with optional `?subject_type` and `?project` filters AND-combined via drizzle's `and()`; `?limit` defaults to 50, capped at 200, falls back to default on non-numeric input. `ORDER BY created_at DESC` aligns with 37-01's `approval_events_subject_idx` + `approval_events_project_idx`. W-3: single SELECT, `total = events.length`. Response shape: `{events: ApprovalEventRow[], total: number}`.
- **/admin/platform/approval-audit page shipped** — server-component wrapper enforces staff via `getServerSession` + `getCurrentUserContext` + `ctx.isStaff` (redirects non-staff to `/admin?error=forbidden`, mirrors slack-audit pattern). Client component renders subject-type select (default `build_trigger`, forward-compatible with v3.0 release_approval), project select (reuses `useProjectOptions`), per-row card with decision badge, surface chip, project chip, subject ref, timestamp, and comment truncated to 60 chars with Show more/less toggle.
- **URL search-param mirror** — `router.replace({ scroll: false })` keeps `?subject_type=...&project=...` in the URL so deep-links + back button work. Initial state read from `useSearchParams()` so deep-linking into a filtered view works on first load.
- **TDD RED→GREEN observed for both tasks** — RED commits (failing tests, module not yet existing) precede GREEN commits (implementation passes all cases).
- **Acceptance greps all pass** — `requireStaff`, `desc(approvalEvents.createdAt)`, `MAX_LIMIT`, `total: events.length` on the route; `subject_type=build_trigger`, `useProjectOptions`, `No approval events recorded yet`, `Show more` on the client; `count(*)` returns 0 on the route (W-3 anchor).
- **Both routes registered in `npx next build` output** — `/api/platform/approval-events` and `/admin/platform/approval-audit` both compile and ship.

## Task Commits

1. **Task 1 RED** — `8d90cf5` — `test(37-06): add failing test for GET /api/platform/approval-events` (11 cases)
2. **Task 1 GREEN** — `98a2925` — `feat(37-06): implement GET /api/platform/approval-events`
3. **Task 2 RED** — `aa00de2` — `test(37-06): add failing test for ApprovalAuditClient` (10 cases)
4. **Task 2 GREEN** — `93f12f7` — `feat(37-06): add /admin/platform/approval-audit page + ApprovalAuditClient`

_Plan SUMMARY.md commit follows this writeup (Final-commit step)._

## Files Created/Modified

### Created
- `src/app/api/platform/approval-events/route.ts` — staff-gated GET endpoint; 71 lines; single SELECT with optional `where(and(...))` branch; `{events, total}` JSON shape with `createdAt` ISO serialization.
- `src/app/api/platform/approval-events/route.test.ts` — 11 Vitest cases (179 lines); mirrors `bug-reports/route.test.ts` hoisted-mock pattern; mocks `requireStaff`, `@/lib/db.db.select`, and drizzle `eq`/`and`/`desc` operators.
- `src/app/admin/platform/approval-audit/page.tsx` — 25-line server component; staff-gate redirect + render `<ApprovalAuditClient />`.
- `src/app/admin/platform/approval-audit/ApprovalAuditClient.tsx` — 230-line client component; subject_type select + project select + per-row card layout + Show more/less toggle + URL search-param mirror.
- `src/app/admin/platform/approval-audit/ApprovalAuditClient.test.tsx` — 10 Vitest cases (175 lines); mocks `next/navigation` (useRouter/useSearchParams) + `useProjectOptions`; uses I-3 anchored-regex pattern for truncation assertions.

### Modified
- _(none — pure additions; no existing files were touched)_

## Deviations & Recoveries

**1. [Rule 3 — Blocking] Test file path for client component used `react/jest-dom`-style matchers without jest-dom**
- **Found during:** Task 2 RED — initial draft used `.toBeInTheDocument()` from `@testing-library/jest-dom`.
- **Root cause:** The repo's Vitest setup does not extend with jest-dom matchers — confirmed by checking vitest.config.ts (no setupFiles importing jest-dom).
- **Fix:** Switched assertions to plain `.toBeDefined()` and `.toBeNull()` from Vitest, which is sufficient because `getByText`/`queryByRole` already throw on missing matches (or return null for query*). Tests still cover the intended invariants.
- **Files modified:** `src/app/admin/platform/approval-audit/ApprovalAuditClient.test.tsx` (pre-commit edit; no second commit needed).
- **Commit:** Folded into `aa00de2` (Task 2 RED).

**2. [Plan refinement] Route implementation branches on `conditions.length` instead of building a single `where(undefined)` call**
- **Found during:** Task 1 GREEN — the plan's pseudocode passed `whereClause = conditions.length ? and(...) : undefined` into a single `.where(whereClause)` call. drizzle accepts `undefined` for no-op, but mocking that path requires a `.where()` stub that handles the undefined case, which clutters the test.
- **Fix:** Branched on `conditions.length` at the call site — the route either calls `.where(and(...))` or omits `.where()` entirely from the chain. Behaviorally identical to the plan; cleaner test mock (the "no filters" test asserts `mockWhere` was NOT called, which matches drizzle's recommended pattern of omitting `.where()` when there are no conditions).
- **Files modified:** `src/app/api/platform/approval-events/route.ts`.
- **Commit:** Folded into `98a2925` (Task 1 GREEN).

No Rule 1 (bugs) or Rule 4 (architectural) deviations encountered. The 37-01 schema additions and `approvalEvents` shared-package export landed cleanly; no drift from 37-01's spec.

## Authentication Gates / Pending Human Actions

None during execution. Both endpoints are staff-gated via `requireStaff` (route) and `ctx.isStaff` (page); test mocks provide a staff session by default and verify the forbidden path via mock override.

## What this enables

Wave-3 close + Phase 37 ROADMAP item 6 complete:
- Staff can visit `/admin/platform/approval-audit` after deploy and inspect every Generate-Build click as an approval_events row with full context (actor, prompt excerpt, surface, project, timestamp).
- Phase 37 ROADMAP success criterion "Every trigger writes a row to approval_events with the prompt excerpt for audit; visible in existing Slack audit page" satisfied via the new sibling page (CONTEXT.md "or equivalent" interpretation, justified by the entity-agnostic shape of approval_events vs. the Slack-specific slack_action_audit).
- v3.0 customer-approval surface forward-compatible: add a row to `SUBJECT_TYPE_OPTIONS` in `ApprovalAuditClient.tsx`, and the same page filters customer approvals alongside build triggers.
- 37-03's generate-build endpoint (the writer) now has a verified read path — staff can validate end-to-end after the next deploy.

## Outstanding from this plan

- **Sidebar nav entry DEFERRED** — admin sidebar is DB-driven via DynamicSidebar (shared-ui) fetching `/api/platform/navigation` from the `menu_sections` table. Adding a row requires an INSERT against the prod DB (or a seed script). The page is reachable via direct URL meanwhile. Recommended follow-up: write a one-shot `scripts/seed-approval-audit-nav.mjs` that INSERTs the row and run it post-deploy. This is intentionally out of scope here because (a) sidebar editing pattern across phases varies (some plans add via UI, some via seed) and (b) the page works without it — discoverability is the only thing waiting.
- **`total` is row count, not true total** — by W-3 design. If TMI volume crosses ~200 events/week, add a parallel `count(*)` query and reshape `total` to be the unfiltered match count; client contract `{events, total}` does not change.
- **Manual UAT after deploy** — Mike clicks "Generate build" on `/admin/modules/next-build-plan/tmi`, then visits `/admin/platform/approval-audit` and confirms the new row appears within ~1s with prompt excerpt visible.

## Schema-Drift Audit (vs. 37-01)

Verified 0 drift: read `packages/triarch-shared/src/schema.ts` lines 415-428 — the `approvalEvents` pgTable shape matches what this plan's route + client consume (`id`, `subjectType`, `subjectId`, `decision`, `surface`, `actorEmail`, `comment`, `metadata`, `project`, `createdAt`). Indexes (`approval_events_subject_idx`, `approval_events_project_idx`) align with the route's `ORDER BY desc(createdAt)` so the prod query plan can use either index depending on filter shape.

## Test Inventory

- **Route (`src/app/api/platform/approval-events/route.test.ts`):** 11 cases
  1. 200 default limit when no params
  2. Caps limit at 200 when caller requests more
  3. Honors sane custom limit (?limit=10)
  4. Falls back to default 50 when ?limit is non-numeric
  5. Returns requireStaff error response when non-staff
  6. Applies subject_type filter via eq() to where clause
  7. Applies project filter via eq() to where clause
  8. Combines subject_type + project filters via and()
  9. Does NOT call .where() when no filters provided
  10. Response total equals rows.length (W-3 anchor)
  11. Serializes createdAt Date objects to ISO strings

- **Client (`src/app/admin/platform/approval-audit/ApprovalAuditClient.test.tsx`):** 10 cases
  1. Renders rows after fetch resolves
  2. Fetches with subject_type=build_trigger by default
  3. Changing project filter re-fetches with new project param
  4. Changing subject_type select re-fetches with new subject_type param
  5. Mirrors filter state in URL search params via router.replace
  6. Empty state renders when total === 0
  7. Comment truncates to ~60 chars; Show more toggles to full text (I-3 anchored)
  8. Does NOT render Show more when comment is shorter than truncation threshold
  9. Renders decision badge and surface chip per row
  10. Reads initial subject_type filter from URL search params (deep-link)

## Self-Check: PASSED

Verified all claims:
- `src/app/api/platform/approval-events/route.ts` — FOUND (acceptance greps all pass: `requireStaff`=2, `desc(approvalEvents.createdAt)`=2, `MAX_LIMIT`=2, `count(*)`=0, `total: events.length`=1)
- `src/app/api/platform/approval-events/route.test.ts` — FOUND (11 cases; vitest GREEN)
- `src/app/admin/platform/approval-audit/page.tsx` — FOUND (staff-gate redirect pattern verified)
- `src/app/admin/platform/approval-audit/ApprovalAuditClient.tsx` — FOUND (`useProjectOptions`=3, `No approval events recorded yet`=1, `Show more`=1, `subject_type=build_trigger`-or-`'build_trigger'`=3)
- `src/app/admin/platform/approval-audit/ApprovalAuditClient.test.tsx` — FOUND (10 cases; vitest GREEN; `subject_type=` appears 5 times — filter coverage)
- Commit `8d90cf5` — FOUND (Task 1 RED)
- Commit `98a2925` — FOUND (Task 1 GREEN)
- Commit `aa00de2` — FOUND (Task 2 RED)
- Commit `93f12f7` — FOUND (Task 2 GREEN)
- `npx vitest run` for both new test files: 21/21 PASS
- `npx next build` exits 0; both new routes (`/api/platform/approval-events`, `/admin/platform/approval-audit`) appear in route map
