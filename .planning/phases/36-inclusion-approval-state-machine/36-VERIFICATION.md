---
phase: 36-inclusion-approval-state-machine
verified: 2026-05-18T19:09:08Z
status: human_needed
score: 5/5 success-criteria automated-verified; 3 UAT items deferred per phase context
re_verification: null
human_verification:
  - test: "Visual UAT of /admin/modules/next-build-plan/[slug] page"
    expected: "Page renders approved_for_build items as a single sorted table; type filter chips work; Remove from build action calls PATCH and removes row from view; empty state renders when project has zero approved items"
    why_human: "Visual layout, FilterChips keyboard handling, optimistic-update UX, empty-state copy quality — not programmatically verifiable from grep/test runs (Plan 36-05a deferred human-verify checkpoint)"
  - test: "Visual UAT of bug-reports + feature-requests list and detail UI extensions"
    expected: "Both list pages show new Inclusion column with color-coded pills (violet/teal/blue/zinc/amber); per-row dropdown action surfaces correct transition options; detail pages render primary action buttons gated by canManuallyTransition; NO Reject button anywhere (B-3 fix verified visually)"
    why_human: "Visual color tokens, dropdown placement, button disabled-state UX, accessibility of color pills — not programmatically verifiable (Plan 36-05b deferred human-verify checkpoint)"
  - test: "Visual UAT of portal /projects/[slug]/upcoming page + portal PR #43 merge"
    expected: "Portal page renders state pills (Approved violet, Built teal) with relative timestamps; Upcoming tab visible in sub-nav and active when on /upcoming; non-member receives 404 (not 403); zero staff-only fields visible in rendered HTML; portal PR #43 + admin PR #110 merged to dev branches"
    why_human: "Visual rendering, customer-facing copy review, cross-repo merge ceremony (Plan 36-07 deferred human-verify checkpoint, deferred-items.md notes pre-existing portal-slack.test.ts TS errors unrelated to this phase)"
---

# Phase 36: Inclusion Approval State Machine — Verification Report

**Phase Goal:** Add an explicit "decide what goes IN the next build" gate. Schema + admin UI + commit-parser extension + read-only customer portal page. Closes the gap that today lets every committed bug/feature reference auto-flow to the next prod deploy without a deliberate decision step. Pilot scope: TMI; rollout deferred to post-30-day-dogfooding review.

**Verified:** 2026-05-18T19:09:08Z
**Status:** human_needed (5/5 automated success criteria PASS; 3 UAT items deferred per phase plans)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (from ROADMAP Success Criteria)

| # | Truth (ROADMAP success criterion) | Status | Evidence |
|---|-----------------------------------|--------|----------|
| 1 | Schema migration adds `inclusion_state` + `next_release_log_id` to bug_reports and feature_requests; `npx drizzle-kit check` clean | VERIFIED | `src/db/migrations/0020_inclusion_state.sql` adds 2 columns + 2 FK + 2 CHECK constraints + 2 partial indexes across both tables (lines 1-17). `packages/triarch-shared/src/schema.ts:328-329, 355-356` adds Drizzle column definitions. Live DB schema verified per phase context (4 columns, 4 constraints, 2 partial indexes). |
| 2 | Admin `/admin/modules/next-build-plan/{slug}` page lists approved_for_build items with inline remove-from-build action | VERIFIED (auto) + UAT pending | `src/app/admin/modules/next-build-plan/[slug]/page.tsx` (107 lines) renders server-component with staff-only auth (line 32 `if (!ctx?.isStaff) notFound()`) + queries approved_for_build bugs+features sorted desc. `NextBuildPlanClient.tsx:193-318` wires PATCH `/api/platform/{bug-reports,feature-requests}/[id]` with `{inclusionState: 'pending_inclusion'}` body. 7 client tests pass. Visual UAT deferred. |
| 3 | Commit-parser auto-flips approved_for_build → built on commit ingest with proper next_release_log_id stamping; 100% of v2.1 Phase 11 tests still GREEN | VERIFIED | `src/lib/link-stamper.ts:157-229` extends post-INSERT with state-guard `eq(bugReports.inclusionState, 'approved_for_build')` (line 191) + `eq(featureRequests.inclusionState, 'approved_for_build')` (line 214) + audit row `transitionedBy: 'commit-parser:{auditSha}'` (lines 201, 224). `npx vitest run src/lib/{commit-parser,link-stamper,inclusion-state}.test.ts` → **68/68 PASS**. v2.1 Phase 11 baseline preserved. |
| 4 | Prod deploy completion auto-flips built → deployed (verified end-to-end against TMI pilot) | VERIFIED (auto); TMI E2E pilot pending | `src/app/api/releases/promoted/route.ts:103-148` extends existing `db.transaction` with `inclusionState: 'deployed'` UPDATE for bugReports (line 109) + featureRequests (line 118), WHERE state-guard `eq(*.inclusionState, 'built')` (lines 112, 121) makes re-ingest idempotent (Pitfall 5), `tx.insert(workflowTransitions)` for audit (line 148). `npx vitest run src/app/api/releases/promoted/route.test.ts` PASSES (count rolled into 36-test pass). |
| 5 | Portal `/projects/{slug}/upcoming` page renders the "what's coming" view, fetching from `/api/portal/projects/{slug}/upcoming` with cookie-based membership auth | VERIFIED (auto) + UAT pending | Portal `src/app/projects/[slug]/upcoming/page.tsx` (60 lines) does session→ctx→project lookup→membership check (`if (!isMember) notFound()` line 48 — PORTAL-03 404 not 403) → calls `fetchUpcomingFromAdmin(slug, email)` (line 53). Helper at `src/lib/admin-fetch-upcoming.ts` signs HMAC body `{intent: 'read_upcoming', projectKey, actorEmail}` (line 70) and POSTs to admin via `ADMIN_INTERNAL_DISPATCH_URL` (line 55, Mi-2 fix). Admin endpoint at `src/app/api/portal/projects/[slug]/upcoming/route.ts` (153 lines) verifies HMAC + intent + projectKey/slug match + returns customer-safe field projection. Upcoming tab wired in `portal/src/app/projects/layout.tsx:76`. Visual UAT deferred. |

**Score:** 5/5 truths automated-VERIFIED.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/triarch-shared/src/schema.ts` | inclusionState + nextReleaseLogId on bugReports + featureRequests with onDelete: 'set null' | VERIFIED | Lines 328-329, 355-356 — both tables, both columns, `onDelete: 'set null'` confirmed (Pitfall 2 closed) |
| `packages/triarch-shared/package.json` | Version bumped twice (0.3.x → 0.4.0 → 0.5.0) | VERIFIED | Currently `0.5.0` (final state after 36-06 discriminated-union bump) |
| `src/db/migrations/0020_inclusion_state.sql` | DDL with ADD COLUMN + FK + CHECK + partial indexes | VERIFIED | 17 lines, all 4 elements present per table; FK uses `ON DELETE set null` (lines 5-6) |
| `src/lib/inclusion-state.ts` | INCLUSION_STATES tuple + canManuallyTransition helper + 'rejected' excluded from MANUAL_TRANSITIONS targets | VERIFIED | Lines 19-27 declare 7-state tuple; lines 33-41 `MANUAL_TRANSITIONS` map has no `'rejected'` in any forward target list (B-3 fix); `rejected → triaged` recovery preserved (line 40). 11 unit tests pass. |
| `src/app/api/platform/bug-reports/[id]/route.ts` | PATCH accepts inclusionState, validates via canManuallyTransition, audits in same tx | VERIFIED | Imports `canManuallyTransition` (line 7); `db.transaction` wraps UPDATE + `tx.insert(workflowTransitions)` (lines 66-86, two audit branches for status + inclusionState) |
| `src/app/api/platform/feature-requests/[id]/route.ts` | Same as bug-reports | VERIFIED | Mirror implementation lines 7, 58-78 |
| `src/app/api/platform/bug-reports/route.ts` | GET accepts `?inclusion_state=` filter (Pitfall 8) | VERIFIED | Lines 19-32 read + validate + eq-filter param |
| `src/app/api/platform/feature-requests/route.ts` | Same as bug-reports LIST | VERIFIED | Mirror implementation lines 18-30 |
| `src/lib/link-stamper.ts` | Post-insert auto-flip + orphan counter + audit row + commitSha param | VERIFIED | Lines 33 (commitSha param), 157-229 (flip logic with state guard), 196/219 (audit insert with `commit-parser:{auditSha}` provenance) |
| `src/app/api/platform/ingest/release-logs/route.ts` | Passes commitSha + logs orphan warnings | VERIFIED | Line 183 `commitSha: release.commitSha ?? undefined`; lines 190-194 warn on `orphanLinks > 0` |
| `src/app/api/releases/promoted/route.ts` | Built→deployed flip + audit inside existing tx | VERIFIED | Lines 103-148 extend the existing transaction at 81-103; combined audit insert at line 148 (Pitfall 3 closed for this path) |
| `src/app/admin/modules/next-build-plan/[slug]/page.tsx` | Server-component, staff-only, queries approved_for_build | VERIFIED | 107 lines; auth gate line 32; queries lines 45-77 |
| `src/app/admin/modules/next-build-plan/[slug]/NextBuildPlanClient.tsx` | Filter chips, Remove from build action, PATCH wiring | VERIFIED | 12978 bytes; "Remove from build" string at line 318; PATCH at lines 193-195 with `inclusionState: 'pending_inclusion'` body |
| `src/app/admin/modules/{bug-reports,feature-requests}/page.tsx` | Inclusion column + dropdown action + filter dropdown | VERIFIED | `INCLUSION_COLORS` const + `Propose for next build` action present in all 4 list/detail files (bug-reports + feature-requests, list + detail) |
| `src/app/admin/modules/{bug-reports,feature-requests}/[id]/page.tsx` | Detail action buttons, no Reject button (B-3) | VERIFIED | Action buttons present; grep confirms NO "Reject" button language in any inclusion-state surface |
| `packages/triarch-shared/src/internal-hmac.ts` | InternalHmacBody as discriminated union on intent | VERIFIED | Line 28 `intent: 'dispatch_promotion'` branch; line 37 `intent: 'read_upcoming'` branch; verifyRequest discriminates on intent (line 201-203) |
| `src/app/api/portal/projects/[slug]/upcoming/route.ts` | POST endpoint, HMAC verify, intent guard, project-slug match, customer-safe projection | VERIFIED | 153 lines; line 58 verifyRequest; line 67 intent guard rejects non-`read_upcoming`; line 78 projectKey/slug mismatch guard; lines 97-124 explicit field allowlist SELECT (Pitfall 7 closed) |
| `portal/src/app/projects/[slug]/upcoming/page.tsx` | Membership-gated page, 404 for non-members, calls helper | VERIFIED | 60 lines; line 48 `if (!isMember) notFound()` (PORTAL-03); line 53 helper invocation |
| `portal/src/lib/admin-fetch-upcoming.ts` | Signs HMAC with read_upcoming intent, reuses ADMIN_INTERNAL_DISPATCH_URL | VERIFIED | Line 55 reads `ADMIN_INTERNAL_DISPATCH_URL` (Mi-2 fix); line 70 `intent: 'read_upcoming'` |
| `portal/src/app/projects/[slug]/upcoming/UpcomingClient.tsx` | Renders state pills + relative timestamps, read-only | VERIFIED | 3746 bytes; "Approved" string present per plan contract |
| `portal/src/app/projects/layout.tsx` | Upcoming tab added to sub-nav | VERIFIED | Line 76 — `label: 'Upcoming', path: /projects/${key}/upcoming` |
| `portal/package.json` | Pinned to ^0.5.0 + portal v0.8.0 | VERIFIED | Version 0.8.0; dependency `^0.5.0` |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| schema.ts (bugReports.nextReleaseLogId) | release_logs.id | FK with `onDelete: 'set null'` | WIRED | Pitfall 2 — verified literal `'set null'` in schema.ts and SQL migration |
| 0020_inclusion_state.sql | CHECK constraint 7-value allowlist | raw-SQL CHECK append | WIRED | Lines 7-12 of migration |
| PATCH bug-reports/[id] | workflow_transitions | `tx.insert(workflowTransitions)` inside `db.transaction` | WIRED | Pitfall 3 — verified two `tx.insert` calls inside one transaction block |
| PATCH feature-requests/[id] | workflow_transitions | Same | WIRED | Same |
| link-stamper auto-flip | bugReports.inclusionState='built' | `db.update.set.where(state-guard)` | WIRED | Pitfall 5 idempotency state guard verified |
| link-stamper auto-flip | workflow_transitions | `db.insert(workflowTransitions)` post-update | WIRED (with caveat) | NOTE: Audit insert is NOT inside a wrapping db.transaction with the UPDATE in link-stamper — this is intentional per plan 36-03 (preserves existing v2.1 link-stamper try/catch envelope; original stamper also doesn't wrap in tx). Documented design choice, not a regression. |
| prod-ingest auto-flip | bugReports + featureRequests inclusionState='deployed' | `tx.update.set.where(built+nextReleaseLogId)` | WIRED | Pitfall 5 idempotency verified; same tx as prod row INSERT (Pitfall 3 satisfied) |
| ingest route | stampLinksFromCommit | `commitSha: release.commitSha ?? undefined` | WIRED | Provenance plumbed through |
| portal/upcoming page | fetchUpcomingFromAdmin | helper call with email | WIRED | Server-component fetches via helper |
| portal helper | admin POST endpoint | `signRequest({intent: 'read_upcoming', ...})` + POST to ADMIN_INTERNAL_DISPATCH_URL | WIRED | Cross-repo HMAC contract honored |
| admin endpoint | bugReports + featureRequests | drizzle SELECT WHERE `inArray(inclusionState, ['approved_for_build','built'])` | WIRED | Customer-visible state allowlist enforced |
| portal layout sub-nav | /projects/[slug]/upcoming | menu item entry | WIRED | Active state per route |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| INCL-01 | 36-01 | `inclusion_state` column on both tables, 7-value allowlist, default `triaged` | SATISFIED | schema.ts lines 328, 355 + migration 0020 lines 1, 3 + CHECK constraint lines 7-12 |
| INCL-02 | 36-01 | Nullable `next_release_log_id` UUID FK to release_logs.id | SATISFIED | schema.ts lines 329, 356 with `onDelete: 'set null'`; migration lines 5-6 |
| INCL-03 | 36-02, 36-05b | Staff moves triaged → pending_inclusion via UI action | SATISFIED | PATCH endpoints accept inclusionState; list+detail pages have "Propose for next build" action; canManuallyTransition gate validates transition |
| INCL-04 | 36-02, 36-05b | Staff moves pending_inclusion → approved_for_build OR deferred | SATISFIED | Same PATCH endpoints; MANUAL_TRANSITIONS map includes both targets (inclusion-state.ts line 35); UI surfaces Approve + Defer buttons |
| INCL-05 | 36-05a | `/admin/modules/next-build-plan/[slug]` page lists approved items with Remove from build | SATISFIED | Page + client + tests all present; Remove-from-build wired to PATCH with `pending_inclusion` target |
| INCL-06 | 36-03 | Commit-parser extension flips approved_for_build → built on commit ingest | SATISFIED | link-stamper.ts auto-flip block lines 157-229; v2.1 Phase 11 tests 68/68 GREEN; orphan-link counter present (Pitfall 4) |
| INCL-07 | 36-04 | Prod-deploy promotion batch-flips built → deployed | SATISFIED | releases/promoted/route.ts transaction extended lines 103-148; idempotent re-ingest via state guard; audit inside tx |
| INCL-08 | 36-06, 36-07 | Read-only `/projects/[slug]/upcoming` portal page + admin endpoint | SATISFIED | Admin POST endpoint (153 lines) + portal page (60 lines) + helper + sub-nav all shipped; customer-safe field allowlist enforced; HMAC discriminated union extended for read_upcoming intent |

**ORPHANED requirements:** None. REQUIREMENTS.md line 358-365 maps INCL-01..08 to Phase 36; all 8 are claimed by 36-01..07 plan frontmatter `requirements:` fields. No leftover IDs.

**Note on REQUIREMENTS.md status column drift:** Lines 400-407 in REQUIREMENTS.md show INCL-01, INCL-02, INCL-06, INCL-07 as "Pending" — this is stale status tracking, not a coverage gap. All 8 reqs have shipping code + passing tests verified above. The status column should be updated to "Complete" for all 8 as part of phase close.

### Pitfall Verification Section

| Pitfall | Risk | Verification | Status |
|---------|------|--------------|--------|
| Pitfall 1 (PKG-04 drift) | PR touches shared package without version bump | shared package on 0.5.0 (two coordinated bumps: 0.4.0 in 36-01, 0.5.0 in 36-06); admin pin `^0.5.0` | CLOSED |
| Pitfall 2 (FK CASCADE catastrophe) | Cascade-delete of release_logs row would delete bug/feature rows | `onDelete: 'set null'` literal verified in both schema.ts (lines 329, 356) and migration (lines 5-6) | CLOSED |
| Pitfall 3 (audit row outside tx) | State change with no audit if audit fails after commit | PATCH endpoints (36-02): `tx.insert(workflowTransitions)` inside `db.transaction` — VERIFIED at bug-reports/[id]/route.ts:71, feature-requests/[id]/route.ts:63. Prod-ingest (36-04): `tx.insert(workflowTransitions)` inside the existing tx at releases/promoted/route.ts:148. Link-stamper (36-03): audit is `db.insert` (NOT tx-wrapped) — INTENTIONAL design per plan 36-03 (preserves original v2.1 stamper non-tx pattern; commit-parser path uses try/catch envelope for fault tolerance). Documented exception. | CLOSED (with documented exception for link-stamper) |
| Pitfall 4 (orphan-link soft warning) | Plan forgets to wire commit-parser stats signal | link-stamper.ts:165 `orphanLinks` counter; returned from StampResult; ingest route logs structured console.warn when > 0 (route.ts:190-194) | CLOSED |
| Pitfall 5 (idempotent re-ingest) | Re-running prod ingest flips already-deployed back to built | link-stamper UPDATE WHERE `inclusionState='approved_for_build'` (line 191, 214); prod-ingest UPDATE WHERE `inclusionState='built'` (line 112, 121) — both state guards verified | CLOSED |
| Pitfall 6 (HMAC body schema rigidity) | Existing InternalHmacBody requires fields not applicable to read intent | Discriminated union extended in shared package 0.5.0; admin endpoint narrows on `intent` field (upcoming/route.ts:67) | CLOSED |
| Pitfall 7 (customer surface leaks staff-only fields) | Portal payload exposes triarchNotes/buildPlan/internal-slack refs | Admin endpoint explicit SELECT allowlist (route.ts:97-124) — only `id, title, severity, inclusionState, updatedAt`. Grep across admin endpoint + portal helper + portal client: ZERO matches for `triarchNotes`, `buildPlan`, `slackThread`, `internalNotes` | CLOSED |
| Pitfall 8 (list-page filter not extended) | New Inclusion column rendered but server-side filter missing | GET endpoints accept `?inclusion_state=` param with validation: bug-reports/route.ts:19-32, feature-requests/route.ts:18-30 | CLOSED |
| Pitfall 9 (Next.js 16 async params) | New routes treat params as sync | All new params destructures use `Promise<{slug:string}>` + `await params`: admin next-build-plan page line 27/35, admin upcoming route lines 45/77, portal upcoming page lines 29/36 | CLOSED |
| Pitfall 10 (CRDB CHECK validation on existing rows) | ADD CONSTRAINT fails if existing rows violate | Column added with `DEFAULT 'triaged'` first (always valid value), THEN CHECK constraint added — migration order: lines 1-4 ADD COLUMN, lines 7-12 ADD CONSTRAINT. Live schema verified per phase context (no constraint-validation failures reported). | CLOSED |

### Cross-Repo Wiring Verification

| Aspect | Verification | Status |
|--------|--------------|--------|
| Portal pinned to shared 0.5.0 | `portal/package.json` deps `"@triarchsecurity/triarch-shared": "^0.5.0"` | WIRED |
| `intent: 'read_upcoming'` contract | Portal helper signs with literal; admin endpoint narrows on literal; HMAC test covers cross-intent rejection | WIRED |
| `ADMIN_INTERNAL_DISPATCH_URL` env reuse (Mi-2) | Portal helper reads from this env var; no new ADMIN_PORTAL_API_URL introduced | WIRED |
| Portal sub-nav active state | layout.tsx:76 entry; isActive flag set true | WIRED |
| Portal commits exist | 022eee0, 659bfc5, f2fcbb5 verified via `git cat-file -e` | WIRED |
| Portal PR #43 status | Awaiting review/merge per phase context | PENDING (UAT) |
| Admin PR #110 status | Awaiting review/merge per phase context | PENDING (UAT) |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none in Phase 36 surfaces) | — | — | — | grep across all Phase 36 new files (admin next-build-plan/, admin upcoming/, admin inclusion-state.ts, portal upcoming/, portal admin-fetch-upcoming.ts) found ZERO TODO/FIXME/HACK/PLACEHOLDER/"coming soon"/"not yet implemented" comments |

**Pre-existing unrelated issue (NOT a Phase 36 gap):** `portal/src/lib/portal-slack.test.ts` has ~10 pre-existing TS2352 errors per `deferred-items.md`; reproduced on `dev` branch HEAD with NO Phase 36 changes applied. Documented out-of-scope; recommended as separate hygiene task.

### Test Suite Results

| Suite | Tests | Pass | Phase 36 relevance |
|-------|-------|------|--------------------|
| `src/lib/{commit-parser,link-stamper,inclusion-state}.test.ts` | 68 | 68 | Success criterion #3 (v2.1 Phase 11 baseline preserved) + new INCL-06 auto-flip coverage + new state-machine helper |
| `src/app/api/{releases/promoted, platform/bug-reports/[id], platform/feature-requests/[id], portal/projects/[slug]/upcoming}/route.test.ts` | 36 | 36 | INCL-03, INCL-04, INCL-07, INCL-08 endpoint behavior |
| `src/app/admin/modules/next-build-plan/[slug]/NextBuildPlanClient.test.tsx` + `packages/triarch-shared/src/internal-hmac.test.ts` | 21 | 21 | INCL-05 client UI + HMAC discriminated union |
| `portal/src/lib/admin-fetch-upcoming.test.ts` + `portal/src/app/projects/[slug]/upcoming/UpcomingClient.test.tsx` | 19 | 19 | INCL-08 portal client + cross-repo helper |
| **Total** | **144** | **144** | **100% PASS** |

### Human Verification Required

Three UAT items deferred per phase plans (autonomous=false on 36-01, 36-05a, 36-05b, 36-06, 36-07):

#### 1. /admin/modules/next-build-plan/[slug] visual UAT

**Test:** Navigate to `/admin/modules/next-build-plan/tmi` as a staff session; click a FilterChip; click Remove from build on a row; navigate as non-staff session and expect 404.
**Expected:** Table renders mixed bugs+features sorted by approval desc; FilterChip styling matches v2.1 /releases pattern; Remove from build optimistically removes row + persists via PATCH; empty state copy renders when zero approved items.
**Why human:** Visual layout, color tokens, keyboard handling for chips, optimistic update animation, empty-state copy quality — Vitest covers logic but not pixel-level UX (Plan 36-05a deferred checkpoint).

#### 2. bug-reports + feature-requests list and detail UI extensions visual UAT

**Test:** Open `/admin/modules/bug-reports` and `/admin/modules/feature-requests`; verify Inclusion column color-coded pills (violet/teal/blue/zinc/amber); use the new inclusion filter dropdown; click into a detail page and exercise Propose for next build / Approve for build / Defer / Remove from build buttons in the appropriate states.
**Expected:** All 6 color pills render with correct violet/teal/blue/zinc/amber tokens; dropdown options gated by canManuallyTransition (e.g. no "Approve" option visible when state is `triaged`); NO Reject button anywhere; filter dropdown drives `?inclusion_state=` URL param.
**Why human:** Color token accessibility check, dropdown placement on narrow screens, button disabled-state UX (Plan 36-05b deferred checkpoint).

#### 3. Portal /projects/[slug]/upcoming + cross-repo PR merge UAT

**Test:** Merge portal PR #43 + admin PR #110; navigate to `https://portal-dev.triarch.dev/projects/tmi/upcoming` as TMI customer admin; verify state pills (Approved violet + Built teal); confirm relative timestamps render; non-member user must receive 404 (NOT 403); view-source the rendered HTML and confirm zero occurrences of staff-only field names; click Upcoming tab in sub-nav and confirm active state styling.
**Expected:** Customer-facing copy reads correctly; state pills match design tokens; PORTAL-03 404-not-403 leak prevention holds; sub-nav active state behaves like Releases tab; admin endpoint returns 200 + items[] to authenticated portal session.
**Why human:** Visual rendering, customer-facing copy review, cross-repo merge ceremony, two-environment (dev URL) E2E exercise (Plan 36-07 deferred checkpoint).

### Gaps Summary

**Zero gaps found.** All 5 ROADMAP success criteria automated-verify against the shipped code. All 8 INCL requirements have shipping code, passing tests, and traceable plan ownership. All 10 documented pitfalls are closed (Pitfall 3 has a documented intentional exception in link-stamper that preserves v2.1 test baseline). Cross-repo wiring is in place pending PR merge. 144/144 Phase 36 tests pass.

The phase status is `human_needed` (not `passed`) only because three UI/E2E UAT items were deliberately deferred during execution — these are visual quality checks that automated grep/vitest cannot perform. The code itself is complete, tested, and merged on the working branches; portal PR #43 and admin PR #110 are awaiting reviewer merge per phase context.

---

_Verified: 2026-05-18T19:09:08Z_
_Verifier: Claude (gsd-verifier)_
