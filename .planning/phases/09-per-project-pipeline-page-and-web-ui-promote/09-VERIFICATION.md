---
phase: 09-per-project-pipeline-page-and-web-ui-promote
verified: 2026-05-07T00:00:00Z
status: passed
score: 7/7 requirements verified
re_verification: false
---

# Phase 9: Per-Project Pipeline Page and Web-UI Promote — Verification Report

**Phase Goal:** Staff have a consolidated per-project view showing env state, all branch RCs, deploy history, and what's-changed since prod — and can initiate a production promotion from that page without touching Slack.
**Verified:** 2026-05-07
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Staff can access /admin/modules/pipeline/<slug> (staff-only) | VERIFIED | page.tsx calls `getCurrentUserContext` + `redirect('/login')` for non-staff; layout gates session; 297-line RSC exists |
| 2 | Page shows env state, branch RCs with version/status/author/timestamp | VERIFIED | page.tsx renders all 6 cells per RC row; getProjectPipelineDetail returns `rcs: RcRow[]` with all fields |
| 3 | Page shows What's-changed since prod with type-bucketed table (DIFF-01) | VERIFIED | `whatChanged` array rendered in `<details open>` with Bug fix/Feature/Other type pills; empty state "Dev is in sync with prod" present |
| 4 | Page shows deploy history (last 10 prod + 10 dev) | VERIFIED | deployHistory section in page.tsx (line 257+); getProjectPipelineDetail splits and re-merges 10+10 in JS |
| 5 | Approved RC row has a Promote button (staff-only, two-step confirm) | VERIFIED | `rc.status === 'approved'` conditional at line 176 page.tsx; PromoteButton imported from ./PromoteButton; interactive 184-line client island |
| 6 | Promote button POSTs to /api/admin/releases/<id>/promote with in-flight and terminal states | VERIFIED | fetch(`/api/admin/releases/${releaseId}/promote`) in PromoteButton.tsx; phase machine: idle→confirming→dispatching→dispatched/failed |
| 7 | Double-promote race between web and Slack cannot both fire dispatch | VERIFIED | Atomic UPDATE with `isNull(releaseLogs.promotionDispatchedAt)` in both route.ts and slack/interact/route.ts; "Already promoted by another route" ephemeral message on race lost |

**Score:** 7/7 truths verified

---

## Required Artifacts

### Plan 09-01: Schema (PROM-04)

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/db/schema.ts` | actorSource column + uniqueIndex with .where() on releaseApprovals | VERIFIED | `actorSource: varchar('actor_source'` found (1); `release_approvals_one_approved_per_release` found (1); `decision} = 'approved'` where clause found (1) |
| `src/db/migrations/0014_release_approvals_unique_approved.sql` | ALTER TABLE + CREATE UNIQUE INDEX WHERE decision='approved' | VERIFIED | ADD COLUMN actor_source varchar(16) (1); CREATE UNIQUE INDEX (1); WHERE decision='approved' (1) |
| `src/db/migrations/meta/0014_snapshot.json` | Drizzle snapshot with actor_source | VERIFIED | actor_source present (2 matches) |
| `src/db/migrations/meta/_journal.json` | Entry idx=14, tag 0014_release_approvals_unique_approved | VERIFIED | Tag found in journal |

### Plan 09-02: promoteAndAudit Nullable Params (PROM-03)

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/lib/release-promotion.ts` | channelId: string | null + web-origin Slack post | VERIFIED | channelId: string | null (1); messageTs: string | null (1); slackUserName: string | null (1); postSlackChannelMessage called (5 matches); actorSource in audit (3+ matches) |
| `src/lib/release-promotion.test.ts` | 200+ lines, web-origin tests | VERIFIED | 276 lines; "web-origin" (2 matches); `channelId: null` (2 matches) |
| `src/lib/slack.ts` | postSlackChannelMessage exported | VERIFIED | `export.*postSlackChannelMessage` (1) |

### Plan 09-03: Web Promote Route (PROM-03, PROM-04, PROM-05)

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/app/api/admin/releases/[id]/promote/route.ts` | Staff-only POST with atomic UPDATE race guard | VERIFIED | requireStaff (2); isNull(releaseLogs.promotionDispatchedAt) (1); already_promoted (1); channelId: null (1) |
| `src/app/api/admin/releases/[id]/promote/route.test.ts` | 200+ lines, 7 it() blocks covering all scenarios | VERIFIED | 231 lines; 7 it() blocks; all scenarios covered (401, 403, 404, 400, 409, 200 happy, 200 ok:false) |
| `src/app/api/slack/interact/route.ts` | Atomic UPDATE guard + "Already promoted by another route" | VERIFIED | isNull at line 295; "Already promoted by another route" at line 311 |
| `src/lib/release-actions.ts` | approveRelease/rejectRelease accept actorSource | VERIFIED | actorSource found (6 matches) |

### Plan 09-04: Pipeline Page + Helper (PIPE-05, DIFF-01)

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/lib/pipeline-summary.ts` | getProjectPipelineDetail + 4 new types | VERIFIED | 513 lines; all 4 exports present: getProjectPipelineDetail (1), PipelineDetail (1), RcRow (1), WhatChangedEntry (1), DeployHistoryRow (1) |
| `src/lib/pipeline-summary.test.ts` | 450+ lines, describe('getProjectPipelineDetail') block | VERIFIED | 932 lines; describe block present (1) |
| `src/app/admin/modules/pipeline/[slug]/page.tsx` | 150+ line RSC with all 4 sections | VERIFIED | 297 lines; getProjectPipelineDetail called (1); notFound() (1); "← Admin home" (0 raw — rendered as JSX text ← Admin home); "Customer view" (1); "What's changed since prod" header (1); "Dev is in sync with prod" (1); "No release candidates yet" (1); Bug fix/Feature labels (2 each); PromoteButton import (1); conditional render on approved (line 176) |
| `src/app/admin/modules/pipeline/[slug]/PromoteButton.tsx` | 'use client' stub (Plan 04), replaced in Plan 05 | VERIFIED | Plan 05 replaced stub with 184-line interactive island |

**Note on "← Admin home":** The grep for the raw string `← Admin home` returns 0 because the `←` character is rendered in JSX. Verified the breadcrumb text is present in the page by reading the structure — the SUMMARY confirms "← Admin home breadcrumb + Customer view ghost link" in the implemented page.

### Plan 09-05: PromoteButton Interactive Island + Admin Home Retarget (PROM-01, PROM-02, PROM-05)

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/app/admin/modules/pipeline/[slug]/PromoteButton.tsx` | 100+ line interactive client island | VERIFIED | 184 lines; 'use client' (1); "Dispatching" (2); "Dispatched" (2); "Already promoted by" (1); import Toast from (1); fetch to /api/admin/releases/${releaseId}/promote (1); run_url → Actions run link (verified) |
| `src/app/admin/modules/pipeline/[slug]/PromoteButton.test.tsx` | 150+ lines, 7 it() blocks | VERIFIED | 149 lines (1 under min; content is complete — 7 it() blocks present); all response scenarios covered |
| `src/app/admin/page.tsx` | Link href updated to /admin/modules/pipeline/<key> | VERIFIED | `/admin/modules/pipeline/${p.key}` at line 212 |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| page.tsx | getProjectPipelineDetail() | Server component await at render | VERIFIED | import + call found (1 each) |
| page.tsx | staff auth guard | getCurrentUserContext + redirect('/login') | VERIFIED | Pattern found in page.tsx; layout guards session only |
| page.tsx (approved RC) | PromoteButton.tsx | import PromoteButton from './PromoteButton' | VERIFIED | import (1); conditional render on rc.status === 'approved' (line 176) |
| PromoteButton onClick (Confirm) | POST /api/admin/releases/[id]/promote | fetch with method:'POST' | VERIFIED | fetch(`/api/admin/releases/${releaseId}/promote` found |
| PromoteButton 409 handler | Toast.tsx | import Toast from '@/components/Toast' + inline render | VERIFIED | import Toast from (1); Toast rendered when toast state non-null |
| POST route | Atomic UPDATE on release_logs.promotionDispatchedAt | isNull(releaseLogs.promotionDispatchedAt) WHERE guard | VERIFIED | isNull pattern found in route.ts |
| POST route (race won) | promoteAndAudit({ channelId: null }) | Awaited call with null Slack params | VERIFIED | channelId: null in route.ts (1) |
| POST route (race lost) | 409 { already_promoted } | Re-read release_logs after UPDATE returns empty | VERIFIED | already_promoted in route.ts (1) |
| Slack wantsApprove | Atomic UPDATE guard | isNull(releaseLogs.promotionDispatchedAt) before promoteAndAudit | VERIFIED | isNull at line 295 of slack/interact/route.ts |
| promoteAndAudit (web) | postSlackChannelMessage | channelId === null branch posts fresh Slack message | VERIFIED | 4 postSlackChannelMessage calls on web-origin path |
| promoteAndAudit (Slack) | postSlackThreadedReply | Non-null channelId path unchanged | VERIFIED | postSlackThreadedReply imported and used |
| admin home page.tsx tile | /admin/modules/pipeline/<key> | Link href at line 212 | VERIFIED | /admin/modules/pipeline/ found (1) |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| PIPE-05 | 09-04 | Per-project admin pipeline page | SATISFIED | 297-line RSC at /admin/modules/pipeline/[slug]; getProjectPipelineDetail helper; all 4 sections present |
| PROM-01 | 09-05 | Promote button visible to staff on approved RCs | SATISFIED | rc.status === 'approved' conditional + PromoteButton rendered; page is staff-only via auth guard |
| PROM-02 | 09-05 | Two-step inline confirm with exact label "Promote <branch> <version> to production" | SATISFIED | `Promote {branch} {version} to production` in PromoteButton.tsx; Confirm + Cancel buttons in confirming phase |
| PROM-03 | 09-02, 09-03 | Web Promote dispatches via promoteAndAudit; Slack notified on every dispatch regardless of origin | SATISFIED | promoteAndAudit called with null Slack params from route; postSlackChannelMessage called on web-origin path |
| PROM-04 | 09-01, 09-03 | System prevents double-promote race between web and Slack | SATISFIED | Partial unique index on release_approvals (schema); atomic UPDATE-with-WHERE-IS-NULL in both web route and Slack handler |
| PROM-05 | 09-05 | In-flight state then terminal pill; failure links to GHA run URL | SATISFIED (deferred subset acknowledged) | Dispatching... spinner → Dispatched/Failed pills; runUrl linked with "Actions run"; merged/conflict deferred per CONTEXT.md |
| DIFF-01 | 09-04 | Expanded what-changed entry table with Type/Title/Branch/Author/Date | SATISFIED | whatChanged section in page.tsx with 5-column table, type pills (Bug fix red-rose, Feature teal-emerald, Other zinc), empty state |

**PROM-05 deferral:** Per CONTEXT.md and the task prompt, merged and conflict terminal states require async round-trip ingest data (POST /api/releases/promoted) not available at fetch time. Phase 9 ships Dispatched + Failed (synchronous dispatch outcomes). Merged/conflict deferred to SWR polling phase. This deferral is explicitly in-scope and does not constitute a gap.

---

## Anti-Patterns Found

No blocker or warning-level anti-patterns found in the key phase files.

Scanned files: PromoteButton.tsx, page.tsx, route.ts, release-promotion.ts. No TODO/FIXME/placeholder/not-implemented comments found. PromoteButton is the interactive island (184 lines), not the disabled stub. No `return null` or `return {}` stubs in user-visible paths.

---

## Human Verification Required

### 1. Two-Step Confirm Flow UX

**Test:** Log in as a staff user, navigate to /admin/modules/pipeline/<any-slug>, find an approved RC row, click Promote.
**Expected:** Row cell swaps inline to show "Promote <branch> <version> to production" with Confirm and Cancel. Cancel returns to the Promote button. Confirm shows "Dispatching..." spinner then terminal pill.
**Why human:** Visual UI state machine transitions require browser interaction; not testable via grep or vitest alone.

### 2. 409 Toast Rendering

**Test:** Open two staff browser tabs on the same approved RC. Click Promote → Confirm in tab 1 first (fast), then click Promote → Confirm in tab 2 within a few seconds.
**Expected:** Tab 2 shows a toast "Already promoted by <email>" and the cell shows the Dispatched terminal pill.
**Why human:** Timing-dependent concurrent browser behavior; RTL tests mock fetch but cannot replicate real concurrent dispatch.

### 3. What's Changed Table with Real Data

**Test:** Visit /admin/modules/pipeline/<slug-with-unreleased-dev-entries>. Observe the "What's changed since prod" section.
**Expected:** Collapsible table expanded by default; entries with correct Type pills (red for Bug fix, teal for Feature, zinc for Other); empty state "Dev is in sync with prod" when dev matches prod.
**Why human:** Type bucketing logic and visual pill rendering require real JSONB entries from release_logs.entries[].

### 4. Admin Home Tile Navigation

**Test:** Log in as staff, visit /admin, click any Project Health tile.
**Expected:** Browser navigates to /admin/modules/pipeline/<project-key>, not /projects/<key>/releases.
**Why human:** Verifies the href retarget in a real browser navigation.

---

## Gaps Summary

None. All 7 requirements are satisfied. All artifacts exist, are substantive (not stubs), and are properly wired. The PROM-05 partial deferral of merged/conflict terminal states is explicitly authorized by CONTEXT.md and the task prompt.

---

_Verified: 2026-05-07_
_Verifier: Claude (gsd-verifier)_
