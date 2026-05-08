---
phase: 13-branch-preview-swap
verified: 2026-05-08T00:00:00Z
status: human_needed
score: 9/9 automated must-haves verified
re_verification: false
human_verification:
  - test: "SA setup and end-to-end dispatch"
    expected: "POST /api/projects/tmi/branch/preview with valid session dispatches a real FAH rollout; GET /status polls every 5s and transitions PENDING -> SUCCEEDED/FAILED; lock clears on terminal"
    why_human: "FAH_PROMOTER_SA_KEY secret and release-promoter SA IAM grants are operational setup not provisioned yet; no way to verify the token-exchange path end-to-end without live GCP credentials"
  - test: "In-flight banner UX and all-disabled-buttons behavior"
    expected: "Banner appears at top of releases list during an in-flight swap; ALL branch buttons disabled with tooltip; correct branch name + relative time + email in banner copy"
    why_human: "Visual layout, tooltip interactivity, and relative-time rendering require browser verification"
  - test: "FAILED pill with FAH console deep-link"
    expected: "Error pill shows errorMessage; 'View in Firebase console' link opens correct URL in new tab"
    why_human: "Link target and tab behavior require browser verification"
  - test: "Timeout pill after 8-min cap"
    expected: "Pill shows 'Preview did not complete in 8 minutes — preview slot was reset'; buttons re-enable; DB lock is null"
    why_human: "Requires either waiting 8 min or manually backdating previewBranchLockedAt in DB"
  - test: "Non-admin viewer sees no Preview buttons"
    expected: "Viewer session sees informational banner if in-flight, but zero Preview buttons rendered"
    why_human: "Requires viewer-role session in a real browser"
  - test: "5-second polling cadence stops on terminal"
    expected: "Network tab shows ~5s requests while in-flight; requests stop after terminal=true arrives"
    why_human: "Requires DevTools observation during a live rollout"
---

# Phase 13: Branch Preview Swap — Verification Report

**Phase Goal:** Customer admins can click "Preview this branch" on any RC to deploy that branch to the project's dev backend, with concurrency lock and SWR polling, ending in SUCCEEDED/FAILED/timeout terminal state with auto-clear.

**Verified:** 2026-05-08
**Status:** human_needed (all automated checks passed; 6 items require human verification post-SA-provisioning)
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | fah-rollout.ts exports mintFahAccessToken, createFahRollout, getFahRolloutState, resetTokenCacheForTests | VERIFIED | src/lib/fah-rollout.ts lines 70, 141, 185, 231 — all four exported |
| 2 | Token mint uses jose RS256 JWT + oauth2.googleapis.com/token exchange with 50-min module-level cache and single-flight latch | VERIFIED | fah-rollout.ts: OAUTH_TOKEN_URL constant, SignJWT chain, cached/inflight module vars, TOKEN_TTL_MS = 50*60*1000 |
| 3 | POST /api/projects/[slug]/branch/preview acquires atomic lock via isNull(previewBranchLocked) WHERE guard, calls createFahRollout, stores rolloutName in metadata via jsonb_set | VERIFIED | route.ts line 74: isNull(projects.previewBranchLocked); line 111: createFahRollout(); line 125: jsonb_set nested call |
| 4 | POST race-lost path returns 409 lock_held without calling FAH; POST FAH-failure path releases lock before returning 502 | VERIFIED | route.ts lines 88-93: 409 with lock_held; lines 113-118: lock release + 502 on FAH error |
| 5 | GET /status enforces 8-min timeout BEFORE FAH poll; returns timeout terminal state with force-clear | VERIFIED | status/route.ts: TIMEOUT_MS = 8*60*1000; ageMs > TIMEOUT_MS check at line 89 fires before getFahRolloutState |
| 6 | GET terminal states (SUCCEEDED/FAILED/CANCELLED) auto-clear lock with branch-guarded UPDATE (PREV-06) | VERIFIED | status/route.ts lines 134-143: terminal array check, branch-guarded WHERE with eq(projects.previewBranchLocked, branch) at lines 92 and 141 |
| 7 | BranchPreviewClient uses useSWR with refreshInterval function form (terminal pause), renders per-branch Preview buttons admin-only, all disabled during in-flight | VERIFIED | BranchPreviewClient.tsx line 76: refreshInterval: (latest) => (latest?.terminal ? 0 : 5000); line 246: disabled={inFlight} (not per-branch) |
| 8 | BranchPreviewClient POST dispatch calls mutate() on 202 for immediate re-fetch; 409/400/502 surface toasts | VERIFIED | BranchPreviewClient.tsx lines 103-127: mutate() on 202, distinct toast messages for 400/409/502 |
| 9 | ReleasesClient renders BranchPreviewClient at top-of-list when branchPreviewEnabled=true; page.tsx derives flag from project.firebaseProjectId | VERIFIED | ReleasesClient.tsx lines 29, 463-470; page.tsx lines 32, 191-192 |

**Score:** 9/9 truths verified

---

## Required Artifacts

| Artifact | Min Lines | Actual Lines | Status | Notes |
|----------|-----------|-------------|--------|-------|
| `src/lib/fah-rollout.ts` | 150 | 234 | VERIFIED | Contains mintFahAccessToken, all exports |
| `src/lib/fah-rollout.test.ts` | 220 | 410 | VERIFIED | 17 test cases across 3 describes |
| `src/app/api/projects/[slug]/branch/preview/route.ts` | 130 | 136 | VERIFIED | Contains isNull(projects.previewBranchLocked) |
| `src/app/api/projects/[slug]/branch/preview/route.test.ts` | 220 | 282 | VERIFIED | 7 test cases (POST suite) |
| `src/app/api/projects/[slug]/branch/preview/status/route.ts` | 110 | 155 | VERIFIED | Contains TIMEOUT_MS = 8*60*1000 |
| `src/app/api/projects/[slug]/branch/preview/status/route.test.ts` | 220 | 308 | VERIFIED | 9 test cases (GET suite) |
| `src/app/projects/[slug]/releases/BranchPreviewClient.tsx` | 200 | 271 | VERIFIED | Contains useSWR |
| `src/app/projects/[slug]/releases/BranchPreviewClient.test.tsx` | 240 | 383 | VERIFIED | 11 test cases |
| `src/app/projects/[slug]/releases/ReleasesClient.tsx` | — | — | VERIFIED | Contains BranchPreviewClient import + render |
| `src/app/projects/[slug]/releases/page.tsx` | — | — | VERIFIED | Contains branchPreviewEnabled prop |
| `package.json` | — | — | VERIFIED | "jose": "^5" and "swr": "^2.4.1" present; version 2.7.0 |

---

## Key Link Verification

| From | To | Via | Status | Detail |
|------|-----|-----|--------|--------|
| mintFahAccessToken | getSecret('FAH_PROMOTER_SA_KEY') | fah-rollout.ts line 88 | VERIFIED | getSecret call present in try-catch |
| mintFahAccessToken | POST https://oauth2.googleapis.com/token | fah-rollout.ts lines 22, 113 | VERIFIED | OAUTH_TOKEN_URL constant + fetch call |
| createFahRollout | POST https://firebaseapphosting.googleapis.com/v1beta/... | fah-rollout.ts lines 23, 151 | VERIFIED | FAH_API_BASE constant + url construction |
| POST route | createFahRollout | route.ts line 8 (import), line 111 (call) | VERIFIED | Awaited; race-won path only |
| POST route (race-lost) | 409 lock_held response | route.ts lines 77-93 | VERIFIED | locked.length === 0 check with re-read |
| GET route | getFahRolloutState | status/route.ts line 8 (import), line 118 (call) | VERIFIED | Awaited; only when not timed-out and rolloutResourcePath present |
| GET terminal branch | branch-guarded UPDATE clear | status/route.ts lines 136-143 | VERIFIED | eq(projects.previewBranchLocked, branch) in WHERE |
| GET timeout branch | force-clear UPDATE + timeout response | status/route.ts lines 89-101 | VERIFIED | ageMs > TIMEOUT_MS fires before FAH poll |
| BranchPreviewClient | GET /api/projects/.../branch/preview/status | BranchPreviewClient.tsx line 71 | VERIFIED | useSWR with refreshInterval function form |
| BranchPreviewClient (onClick) | POST /api/projects/.../branch/preview | BranchPreviewClient.tsx line 94 | VERIFIED | fetch with method: 'POST', body: JSON.stringify({ branch }) |
| BranchPreviewClient (FAILED) | console.firebase.google.com deep-link | BranchPreviewClient.tsx line 188 | VERIFIED | href constructed from fahProjectId prop |
| ReleasesClient | BranchPreviewClient | ReleasesClient.tsx lines 29, 463-470 | VERIFIED | Import present; conditional render in JSX |
| page.tsx | ReleasesClient (new props) | page.tsx lines 32, 191-192 | VERIFIED | firebaseProjectId in select; branchPreviewEnabled + fahProjectId passed |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| PREV-02 | 13-03 | Customer admin can click "Preview this branch" on any RC | SATISFIED | BranchPreviewClient renders per-branch buttons when userRole=admin; wired into ReleasesClient top-of-list slot |
| PREV-03 | 13-01, 13-02 | Branch swap calls FAH programmatic rollout API | SATISFIED | createFahRollout dispatches to firebaseapphosting.googleapis.com REST API; POST route calls it after lock acquisition |
| PREV-04 | 13-03 | In-flight banner + all buttons disabled | SATISFIED | renderBanner() in BranchPreviewClient; disabled={inFlight} on all buttons (not per-branch); in-flight test suite verifies 3 branches all disabled |
| PREV-05 | 13-02, 13-03 | 5s SWR polling + 8-min hard timeout | SATISFIED | refreshInterval function form pauses on terminal; TIMEOUT_MS = 8*60*1000 in GET route fires before FAH poll |
| PREV-06 | 13-02 | Lock auto-clears on terminal state; FAILED surfaces error + FAH console link | SATISFIED | Branch-guarded UPDATE in GET terminal branch; BranchPreviewClient renderFailedPill shows errorMessage + FAH console link |

**Note on REQUIREMENTS.md discrepancy:** PREV-06 shows `- [ ]` (unchecked) and "Pending" status in REQUIREMENTS.md tracking table. The implementation is fully present and tested in the codebase. This is a stale tracking artifact from REQUIREMENTS.md not being updated during phase execution. The code at status/route.ts lines 48, 134-143 and BranchPreviewClient.tsx lines 177-196 satisfies the full PREV-06 contract.

---

## Anti-Patterns Found

No blockers or warnings found.

Reviewed files: fah-rollout.ts, fah-rollout.test.ts, route.ts (POST), route.test.ts (POST), status/route.ts (GET), status/route.test.ts (GET), BranchPreviewClient.tsx, ReleasesClient.tsx, page.tsx.

No TODO/FIXME/placeholder comments. No empty implementations. No hardcoded empty data arrays flowing to UI rendering. The `return null` guards in BranchPreviewClient (renderBanner, renderSucceededPill, etc.) are conditional early returns from render helpers — data populates from the live SWR poll, not hardcoded stubs.

---

## Human Verification Required

All 6 items require a deployed staging environment with SA provisioning complete.

### 1. End-to-End Dispatch (SA prerequisite)

**Test:** With FAH_PROMOTER_SA_KEY provisioned, POST /api/projects/tmi/branch/preview with a valid admin session and an existing branch name.
**Expected:** 202 Accepted with rolloutName; Firebase console shows new rollout in PENDING; GET /status polls to SUCCEEDED/FAILED.
**Why human:** Service account (release-promoter@triarch-vault) + IAM grants on per-project FAH backends + FAH_PROMOTER_SA_KEY secret are operational setup not yet provisioned. The code path is verified correct but cannot be exercised without live GCP credentials.

### 2. In-Flight Banner and Button Disable UX

**Test:** Click "Preview this branch" on the deployed admin dev site during a live rollout.
**Expected:** Violet banner appears with branch name, relative time, and actor email. ALL preview buttons across all branches are disabled with tooltip "A preview swap is in flight; please wait".
**Why human:** Visual layout, Tailwind rendering, tooltip display on disabled buttons, and relative-time formatting require browser verification.

### 3. FAILED Pill and FAH Console Deep-Link

**Test:** Trigger a rollout against a branch known to fail. Wait for FAILED state.
**Expected:** Red pill shows errorMessage from FAH. "View in Firebase console" link is present and opens `https://console.firebase.google.com/project/<projectId>/apphosting` in a new tab.
**Why human:** Link target attribute, tab opening behavior, and errorMessage propagation through the FAH -> GET status -> SWR -> render chain require browser observation.

### 4. 8-Minute Timeout Pill

**Test:** Either wait 8 minutes with a stuck rollout, or manually UPDATE `preview_branch_locked_at = NOW() - INTERVAL '9 minutes'` in the DB and reload the page.
**Expected:** Amber pill "Preview did not complete in 8 minutes — preview slot was reset" appears. Buttons re-enable. `SELECT preview_branch_locked FROM projects WHERE key='tmi'` returns NULL.
**Why human:** Requires DB manipulation or extended waiting; lock clear verification requires DB read.

### 5. Non-Admin Viewer Role

**Test:** Log in as a viewer-role member on a project with a live rollout in flight.
**Expected:** In-flight banner renders (informational). Zero "Preview this branch" buttons anywhere on the page.
**Why human:** Requires viewer-role session; role-based rendering is a visual assertion.

### 6. 5-Second Polling Cadence and Terminal Pause

**Test:** Open DevTools Network tab filtered to `/branch/preview/status` during an in-flight swap. Wait for terminal.
**Expected:** GET fires approximately every 5 seconds while in-flight. After terminal=true arrives, subsequent GETs stop entirely (SWR paused by refreshInterval returning 0).
**Why human:** Network timing and SWR pause behavior require live browser DevTools observation.

---

## Commits Verified

All phase-13 commits present in git history:

- `8dcfc7f` — test(13-01): add failing fah-rollout tests (RED)
- `2ad4441` — feat(13-01): implement fah-rollout + swr/jose deps (GREEN)
- `2bc6604` — test(13-02): add failing tests for POST route (RED)
- `932c1d6` — feat(13-02): POST route with atomic lock + FAH dispatch (GREEN)
- `9b49e3a` — test(13-02): add failing tests for GET status route (RED)
- `2185e1e` — feat(13-02): GET status with 8-min timeout + branch-guarded auto-clear (GREEN)
- `afc9c4a` — test(13-03): add failing BranchPreviewClient RTL tests (RED)
- `6304290` — feat(13-03): implement BranchPreviewClient (GREEN)
- `9ce897e` — feat(13-03): integrate BranchPreviewClient + v2.7.0

---

## Summary

Phase 13 is complete at the code level. All 9 observable truths are verified. All 11 artifacts exist, are substantive, and are wired correctly. All 13 key links are connected. All 5 PREV requirements (PREV-02 through PREV-06) have implementation evidence.

The REQUIREMENTS.md checkbox for PREV-06 is stale (shows unchecked/Pending) — this is a tracking artifact, not an implementation gap. The auto-clear, branch-guard, and FAILED-pill-with-FAH-console-link code is fully present.

Six human verification items are gated on post-merge operational setup (SA provisioning) and require a deployed staging environment with live GCP credentials. These are explicitly flagged as post-deploy human verification steps in the plan's own `<how-to-verify>` checkpoint.

---

_Verified: 2026-05-08_
_Verifier: Claude (gsd-verifier)_
