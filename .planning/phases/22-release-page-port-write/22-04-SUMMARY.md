---
phase: 22-release-page-port-write
plan: 04
subsystem: ui
tags: [next.js, swr, slack, react, rtl, vitest, portal-auth, fire-and-forget]
status: complete
started: 2026-05-08
updated: 2026-05-08
tasks: 3/3

# Dependency graph
requires:
  - phase: 22-release-page-port-write
    provides: "22-01 shared internal-hmac module + admin /api/internal/dispatch endpoint; 22-02 portal release-mutations + internal-dispatch helpers + approve/reject/feedback POST + feedback DELETE routes; 22-03 portal branch preview swap (POST + status GET) + fah-rollout lib"
  - phase: 21-release-page-port-read
    provides: "ReleasesClient + BranchPreviewClient stubs (TODO Phase 22 markers) ready to wire"
  - phase: 16-shared-package-extraction
    provides: "@myalterlego/triarch-shared/sanitize-commit (sanitizeForSlack) used at customer-data boundary"
provides:
  - "Portal-owned Slack notification on customer-side approve/reject (PORTAL_SLACK_BOT_TOKEN)"
  - "Slack post fires BEFORE HMAC dispatch in approve handler (3-sec customer feedback budget)"
  - "Un-stubbed ReleasesClient mutation handlers — handleApprove / handleReject / handlePostFeedback / handleDeleteFeedback"
  - "Un-stubbed BranchPreviewClient — SWR polling against portal status endpoint + POST against portal swap endpoint"
  - "WRITE-04 — portal-owned PORTAL_SLACK_BOT_TOKEN end-to-end (no admin proxy)"
  - "WRITE-05 — two-step approve UX, conflict badge propagation, branch lock disable propagation all preserved verbatim from v2.1"
affects: [22-05, 25-cutover]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Slack-before-HMAC ordering in portal approve route: post first (3-sec budget), dispatch second; both fire-and-forget; neither failure rolls back the approval"
    - "vi.fn().mock.invocationCallOrder for cross-mock call-order assertions in Vitest (Slack-before-dispatch test)"
    - "Sanitize-at-boundary: every customer-derived field (version, branch, feedback, reason) wraps in sanitizeForSlack BEFORE composition (Pitfall 11)"
    - "Portal Block Kit composition omits action_ids slack_promote / slack_reject — those use SLACK_PAYLOAD_SECRET (admin-only). Portal posts plain section blocks."
    - "useSWR cache-key sharing across BranchPreviewBanner + every BranchPreviewButton mount → singleton-by-cache-key polling; one request per 5s regardless of mount count"
    - "RTL row-must-be-expanded-first pattern for portal release tests: getAllByRole('row') → find by version → click → ExpandedPanel actions become reachable"

key-files:
  created:
    - "portal/src/lib/portal-slack.ts"
    - "portal/src/lib/portal-slack.test.ts"
    - "portal/src/app/projects/[slug]/releases/BranchPreviewClient.test.tsx"
  modified:
    - "portal/src/app/api/projects/[slug]/releases/[releaseId]/approve/route.ts (Slack post BEFORE dispatchPromotion + feedback excerpt query)"
    - "portal/src/app/api/projects/[slug]/releases/[releaseId]/approve/route.test.ts (+6 22-04 cases)"
    - "portal/src/app/api/projects/[slug]/releases/[releaseId]/reject/route.ts (post-INSERT Slack rejection notification)"
    - "portal/src/app/api/projects/[slug]/releases/[releaseId]/reject/route.test.ts (+4 22-04 cases)"
    - "portal/src/app/projects/[slug]/releases/ReleasesClient.tsx (4 mutation handlers un-stubbed; handleLoadMore deferred)"
    - "portal/src/app/projects/[slug]/releases/ReleasesClient.test.tsx (+9 RTL cases for un-stubbed handlers)"
    - "portal/src/app/projects/[slug]/releases/BranchPreviewClient.tsx (Phase 21 stub replaced with SWR-polling + POST + cross-branch lock disable)"
    - "portal/apphosting.yaml (PORTAL_SLACK_BOT_TOKEN secret + SLACK_RELEASE_APPROVAL_CHANNEL plain value)"
    - "portal/apphosting.dev.yaml (PORTAL_SLACK_BOT_TOKEN re-bind + dev override SLACK_RELEASE_APPROVAL_CHANNEL=#release-approvals-test)"
    - "portal/package.json (v0.3.2 → v0.3.3)"
    - "portal/package-lock.json (synced)"

key-decisions:
  - "Slack post fires BEFORE HMAC dispatch in approve route — customer's 3-sec feedback budget. Both fire-and-forget; Slack failure does NOT block dispatch; dispatch failure does NOT roll back Slack."
  - "No double-Slack-posting: portal posts approval announcement to SLACK_RELEASE_APPROVAL_CHANNEL (#release-approvals — single shared stream); admin's promoteAndAudit posts a different message (workflow dispatched) to project.slackChannelId (per-project release channel). Verified by reading admin/src/lib/release-promotion.ts. Two messages, two destinations, two purposes."
  - "Portal Block Kit posts plain section blocks ONLY — no action_ids slack_promote / slack_reject (those need SLACK_PAYLOAD_SECRET, admin-only). Customers click Promote via the portal UI, never via Slack."
  - "'via portal' marker in Slack message headline so staff watching #release-approvals can distinguish portal-origin vs Slack/admin origin at a glance."
  - "Distinct GCP secret name PORTAL_SLACK_BOT_TOKEN (not reusing SLACK_BOT_TOKEN) — Pitfall 9 Slack credential routing. Same underlying value as admin's initially per CONTEXT.md D-01; can fork in v2.3."
  - "Dev overlay SLACK_RELEASE_APPROVAL_CHANNEL=#release-approvals-test so portal-dev smoke tests don't pollute production stream."
  - "handleLoadMore stays stubbed in ReleasesClient: portal does NOT yet have a GET /api/projects/[slug]/releases list endpoint. Deferred to a future plan (folded into 22-05 or beyond)."
  - "BranchPreviewClient ported verbatim from admin (auth differs but the SWR polling + POST + cross-branch lock disable logic is identical). useSWR cache-key sharing means singleton polling regardless of mount count."

patterns-established:
  - "Slack-before-HMAC ordering: portal route handler awaits Slack post inside try/catch, then awaits dispatchPromotion inside try/catch; neither failure short-circuits the response. Both wrapped in independent try/catch blocks."
  - "Slack message Block Kit composition for portal: section blocks only, no action buttons. text='Release Approved (via portal): {project} {version}' fallback for plain-text Slack notifications + accessibility."
  - "Portal-side feedback excerpt query mirrors admin's pattern: select latest by createdAt DESC, slice 200 chars + ellipsis, overflow = max(0, total-1)."
  - "RTL test pattern for portal release rows: render → find row by version text → user.click(row) to expand → ExpandedPanel actions accessible. Encapsulate in renderAndExpand() helper per test suite."

requirements-completed: [WRITE-04, WRITE-05]

# Metrics
duration: ~13min
completed: 2026-05-08
---

# Phase 22 Plan 04: Portal Slack + UI un-stub Summary

**Portal-owned Slack notification posted BEFORE HMAC dispatch on approve (3-sec customer feedback budget), four ReleasesClient mutation handlers wired to the 22-02 routes, BranchPreviewClient un-stubbed with full SWR polling + cross-branch lock disable propagation. v0.3.2 → v0.3.3.**

## Performance

- **Duration:** ~13 minutes wall clock
- **Started:** 2026-05-08T23:13:28Z
- **Completed:** 2026-05-08T23:26:41Z
- **Tasks:** 3
- **Files created:** 3 (portal-slack.ts + 2 test files)
- **Files modified:** 9 (4 route + route-test files, 2 UI client files, 2 apphosting yamls, package.json + package-lock.json)
- **New tests:** 37 (6 portal-slack + 6 approve ordering + 4 reject + 9 ReleasesClient RTL + 12 BranchPreviewClient RTL)
- **Total portal vitest:** **160 GREEN / 1 skipped** (was 123 baseline; +37 new — exceeded plan target of ≥121)

## Accomplishments

### Portal lib — `src/lib/portal-slack.ts`

Wraps Slack `chat.postMessage` API using PORTAL_SLACK_BOT_TOKEN. Two exports:

- `postReleaseApprovalNotification({ releaseId, project, version, branch, approverEmail, feedbackExcerpt?, feedbackOverflowCount? })` — `:rocket: {branch} {version} approved by {email} (via portal)` headline + project / status fields + optional quoted excerpt + optional overflow count line.
- `postReleaseRejectionNotification({ releaseId, project, version, branch, rejecterEmail, reason })` — `:no_entry: {branch} {version} Rejected by {email} (via portal)` headline + reason quote when present.

Both:
- Read `PORTAL_SLACK_BOT_TOKEN` via `getSecret()` from `@myalterlego/secrets`. Vault throw → `{ ok:false, error:'no_token' }`, warning logged, no fetch call.
- Sanitize every customer-derived field with `sanitizeForSlack` from `@myalterlego/triarch-shared/sanitize-commit` BEFORE composition (Pitfall 11).
- Post to `SLACK_RELEASE_APPROVAL_CHANNEL` (env var, default `#release-approvals`).
- NO action buttons. Plain section blocks ONLY. Test 6 enforces no `slack_promote` / `slack_reject` action_ids in the JSON body.
- Slack API `ok:false` → return `{ ok:false, error }` with warning log. Caller logs and continues — never propagates.

**Differences vs admin's `notifyReleaseApproved` in `src/lib/slack.ts`:**

| Aspect | admin/src/lib/slack.ts | portal/src/lib/portal-slack.ts |
|---|---|---|
| Token secret | `SLACK_BOT_TOKEN` | `PORTAL_SLACK_BOT_TOKEN` (distinct name; same value initially) |
| Headline marker | `{branch} {version} approved by {email}` | `... approved by {email} (via portal)` |
| Block Kit `actions` | YES — `slack_promote` + `slack_reject` buttons (signed via SLACK_PAYLOAD_SECRET) | NO — plain section blocks only (admin-only Block Kit per Pitfall 9) |
| Status field source | Caller-controlled | Hardcoded `'approved'` / `'rejected'` |
| Rejection function | Lives in different code path | Native `postReleaseRejectionNotification` |

### Portal route updates — approve + reject handlers

**Approve route ordering (the critical 22-04 change):**
1. Auth + project + release validation (unchanged from 22-02).
2. `approveReleasePortal()` — INSERT release_approvals + UPDATE releaseLogs.status (unchanged from 22-02).
3. **NEW: Fresh approve only — read most-recent feedback for excerpt + overflow.**
4. **NEW: `postReleaseApprovalNotification()` FIRST — 3-sec customer feedback budget.**
5. **NEW: `dispatchPromotion()` SECOND — runs after Slack returns (or fails).**
6. Return 201 with `{ ok, alreadyApproved, release, approval }`.

Both Slack and dispatch wrapped in INDEPENDENT try/catch blocks. Neither failure rolls back the approval. Slack failure does NOT block dispatch (test `22-04: Slack failure does NOT block HMAC dispatch (still 201)` enforces). Dispatch failure does NOT roll back Slack (no Slack delete API ever called from this route — structural assertion).

**Reject route:** `postReleaseRejectionNotification()` called once after `rejectReleasePortal` succeeds; same fire-and-forget try/catch wrapper. No HMAC dispatch (consistent with admin's reject path — rejection ends the workflow).

### ReleasesClient un-stub (4 of 5 mutation handlers wired)

| Handler | Method | URL | On success | On error |
|---|---|---|---|---|
| `handleApprove` | POST | `/api/projects/[slug]/releases/[releaseId]/approve` | `alreadyApproved` → "already approved" toast; fresh → success toast + status='approved' + approval prepended to row's `approvals[]` | error JSON `error` field surfaced via toast |
| `handleReject` | POST | `.../reject` body `{ reason }` | success toast + status='rejected' + approval prepended; close form + clear reason | error JSON `error` field surfaced via toast |
| `handlePostFeedback` | POST | `.../feedback` body `{ body }` | new feedback row appended to release.feedback; clear draft; success toast | error JSON `error` field surfaced via toast |
| `handleDeleteFeedback` | DELETE | `.../feedback/[id]` | row removed from release.feedback; success toast | error JSON `error` field surfaced via toast |
| `handleLoadMore` | — | — | **DEFERRED** — portal lacks GET releases list endpoint. `hasMoreState=false` so the LoadMore button is hidden. | — |

**WRITE-05 invariants preserved verbatim from v2.1:**
- Two-step approve UX: clicking step-1 Approve does NOT call fetch; only the confirm button click does. Confirm label includes branch + version (`Click to confirm — promote {branch} {version} (Ns)`).
- Conflict badge propagation: when `section.conflict !== null`, the per-row Approve/Reject area is replaced by `Resolve conflict to enable approval` helper text; conflict-decorated row also hides Approve in the BranchSection action cell.
- Branch lock disable propagation: handled by BranchPreviewClient (see below).

### BranchPreviewClient un-stub (Phase 21 stub replaced)

Verbatim port of admin's `BranchPreviewClient.tsx`:

- `BranchPreviewBanner` — singleton at top of ReleasesClient. SWR polls portal `/api/projects/[slug]/branch/preview/status` at 5s while non-terminal, 0 when terminal. Renders nothing on `idle` or null data. In-flight banner with violet halo + locked-by + locked-at; SUCCEEDED pill (emerald); FAILED pill (red, with Firebase Console deep-link when fahProjectId set); timeout pill (amber, "did not complete in 8 minutes — preview slot was reset").
- `BranchPreviewButton` — per-BranchSection. Admin only (viewer hidden). Same SWR cache key as Banner (singleton-by-cache-key — one poll across all mounts). On click: POST portal `/api/projects/[slug]/branch/preview` with `{ branch }`. Status mapping:
  - 202 → call `mutate()` to revalidate banner immediately.
  - 400 → toast "Branch name not allowed".
  - 409 with `current_branch` → toast "Another preview is in flight: {current_branch}" + revalidate.
  - 502 with `detail` → toast "Preview dispatch failed: {detail}".
- **WRITE-05 cross-branch lock disable**: when SWR `data.state` is non-terminal (`PENDING` / `BUILDING` / `DEPLOYING`), ALL `BranchPreviewButton` instances on the page are disabled (test `WRITE-05: when ANY branch is in flight, ALL preview buttons are disabled` enforces with two buttons mounted simultaneously).
- Default export: composition shim wrapping both named exports for back-compat.

### Test results (portal Vitest)

| Test file | New cases | Total cases | All GREEN |
|---|---:|---:|---|
| `src/lib/portal-slack.test.ts` (NEW) | 6 | 6 | yes |
| `src/app/api/projects/[slug]/releases/[releaseId]/approve/route.test.ts` | +6 | 17 | yes |
| `src/app/api/projects/[slug]/releases/[releaseId]/reject/route.test.ts` | +4 | 11 | yes |
| `src/app/projects/[slug]/releases/ReleasesClient.test.tsx` | +9 | 15 (+ 1 skip) | yes |
| `src/app/projects/[slug]/releases/BranchPreviewClient.test.tsx` (NEW) | 12 | 12 | yes |

**Full portal vitest:** 160/161 GREEN (1 pre-existing skip from PORTAL-03 + the 22-04-updated RC-03 skip with refreshed comment) — gain of +37 from 22-03 baseline.

### apphosting bindings (WRITE-04)

`apphosting.yaml`:
```yaml
- variable: PORTAL_SLACK_BOT_TOKEN
  secret: PORTAL_SLACK_BOT_TOKEN

- variable: SLACK_RELEASE_APPROVAL_CHANNEL
  value: '#release-approvals'
  availability:
    - RUNTIME
```

`apphosting.dev.yaml`:
```yaml
- variable: PORTAL_SLACK_BOT_TOKEN
  secret: PORTAL_SLACK_BOT_TOKEN

# Dev override: route portal-dev approvals to a dev/test channel
- variable: SLACK_RELEASE_APPROVAL_CHANNEL
  value: '#release-approvals-test'
  availability:
    - RUNTIME
```

### Builds

- `npx next build` — clean. All routes register including the new approve route's added feedback query path (no schema-level changes — feedback table already imported from shared package).

## Task Commits (portal repo)

1. **Task 1** — `725771f` `feat(22-04): portal-slack module + apphosting bindings (WRITE-04)`
2. **Task 2** — `6e51240` `feat(22-04): wire portal-slack into approve/reject — Slack BEFORE HMAC dispatch`
3. **Task 3** — `6031c5b` `v0.3.3: un-stub ReleasesClient + BranchPreviewClient mutation handlers (WRITE-05)`

## Decisions Made

- **Slack post fires BEFORE HMAC dispatch in approve route.** Customer's 3-sec feedback budget — Slack post is one HTTP round-trip to slack.com (fast); dispatch is HMAC-sign + admin verify + GitHub App JWT mint + workflow dispatch (slow). Both wrapped in independent try/catch; neither failure rolls back the approval.
- **No double-Slack-posting verified.** Portal posts to `SLACK_RELEASE_APPROVAL_CHANNEL` (#release-approvals — single shared stream). Admin's `promoteAndAudit` (called by `/api/internal/dispatch` → `release-promotion.ts`) posts a *different* message ("Workflow dispatched by ...") to `project.slackChannelId` (per-project release channel like `#truth-treason-releases`). Two messages, two destinations, two purposes. Verified by reading admin's `release-promotion.ts` line 161-169 (`web-origin` branch with `actorEmail` actor source). The portal-origin path through admin internal dispatch sets `actorSource='web'` which triggers the `slackChannelId` branch — NOT the `notifyReleaseApproved` branch (which only fires from admin's own approve route handler).
- **Portal Block Kit posts plain section blocks only.** No action_ids `slack_promote` / `slack_reject` — those use SLACK_PAYLOAD_SECRET (admin-only). Customers approve/promote via the portal UI, never via Slack. Test 6 enforces this structurally.
- **'via portal' marker in headline.** Staff watching #release-approvals can distinguish portal-origin from Slack/admin origin at a glance.
- **Distinct GCP secret name `PORTAL_SLACK_BOT_TOKEN`** (not reusing admin's `SLACK_BOT_TOKEN`). Pitfall 9 Slack credential routing. Same underlying value initially per CONTEXT.md D-01; can fork in v2.3 if needed.
- **Dev overlay routes Slack to `#release-approvals-test`** so portal-dev smoke tests don't pollute prod.
- **handleLoadMore stays stubbed.** Portal lacks a GET releases list endpoint. Plan explicitly defers this to a future patch. `hasMoreState=false` keeps the button hidden.
- **BranchPreviewClient verbatim port from admin.** SWR polling + POST + cross-branch lock disable logic identical; only the auth context (NextAuth portal session) differs upstream of the route handler. `useSWR` shared cache key means a single poll regardless of how many BranchPreviewButton instances mount.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] RTL test fixture must expand release row before mutation buttons are accessible**

- **Found during:** Task 3 (RTL test write — initial test runs failed because Approve/Reject only render inside ExpandedPanel which requires the row to be clicked first).
- **Issue:** Plan's `<behavior>` specs for ReleasesClient tests assume Approve/Reject are reachable directly via `getByRole('button')` after render, but the v2.1-ported portal layout only shows the per-row action area inside the ExpandedPanel sub-component. Initial implementation of all 9 RTL cases failed with `Unable to find element with role: button, name: /approve for production/i`.
- **Fix:** Added `renderAndExpand()` helper in each test suite that renders, finds the release row by version text, and clicks it to expand before returning the userEvent instance. Each affected test calls `await renderAndExpand()` first.
- **Files modified:** `portal/src/app/projects/[slug]/releases/ReleasesClient.test.tsx`
- **Verification:** All 15 ReleasesClient RTL cases pass GREEN after fix.
- **Committed in:** `6031c5b` (Task 3 commit)

**2. [Rule 1 - Bug] Conflict-state helper text renders in TWO places (BranchSection + ExpandedPanel)**

- **Found during:** Task 3 (RTL test for WRITE-05 conflict badge propagation — `getByText` threw "found multiple elements").
- **Issue:** Plan assumed single render site, but `BranchSection.tsx:320` and `ReleasesClient.tsx:914` both render `Resolve conflict to enable approval` (BranchSection in the row's action cell, ReleasesClient in the ExpandedPanel). This is intentional behavior preserved from v2.1 — both places need the helper.
- **Fix:** Changed `getByText` to `getAllByText(...).length >= 1` in the conflict test.
- **Files modified:** `portal/src/app/projects/[slug]/releases/ReleasesClient.test.tsx`
- **Verification:** Conflict-badge test passes GREEN.
- **Committed in:** `6031c5b` (Task 3 commit)

**3. [Rule 3 - Blocking] Approve test required adding `desc` to drizzle-orm mock + `releaseFeedback` to schema mock + new feedback select chain**

- **Found during:** Task 2 (approve route impl added a feedback query — existing test mock had only 2 db.select() calls; the new feedback query needs `.orderBy(desc(...))` chain ending).
- **Issue:** New impl reads `releaseFeedback` for excerpt + overflow before Slack call. Vitest mocks were 22-02-only — no `desc` from drizzle-orm, no `releaseFeedback` in the schema mock, no third-call branch in the db mock chain.
- **Fix:** Added `desc: vi.fn(() => 'DESC')` to drizzle-orm mock, added `releaseFeedback: { releaseId, body, createdAt }` to schema mock, extended db.select() chain to handle a third `.where()` call returning `{ orderBy: () => Promise.resolve(feedbackResult()) }`. Added `feedbackResult` mock function with default `[]` and overrides in two specific tests.
- **Files modified:** `portal/src/app/api/projects/[slug]/releases/[releaseId]/approve/route.test.ts`
- **Verification:** All 17 approve tests pass (including 11 22-02 baseline + 6 new 22-04 cases).
- **Committed in:** `6e51240` (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (2 bug, 1 blocking)
**Impact on plan:** All deviations were minor test-infrastructure adjustments uncovered during TDD writing. No functional/architectural deviation. No scope creep.

## Issues Encountered

- None blocking. Three minor test-infra adjustments documented above as deviations.

## Auth Gates / User Setup Required

### Pending Mike's hands-on action (HUMAN-VERIFY before merge)

**GCP secret + IAM provisioning:**
```bash
# Read existing SLACK_BOT_TOKEN value (admin's)
gcloud secrets versions access latest --secret=SLACK_BOT_TOKEN --project=triarch-vault > /tmp/bot.token

# Create portal-side mirror with the SAME underlying value
gcloud secrets create PORTAL_SLACK_BOT_TOKEN --project=triarch-vault --data-file=/tmp/bot.token
rm /tmp/bot.token

# Grant secretAccessor IAM to the shared FAH compute SA
gcloud secrets add-iam-policy-binding PORTAL_SLACK_BOT_TOKEN \
  --project=triarch-vault \
  --member=serviceAccount:firebase-app-hosting-compute@triarch-dev-website.iam.gserviceaccount.com \
  --role=roles/secretmanager.secretAccessor

# Verify
gcloud secrets versions list PORTAL_SLACK_BOT_TOKEN --project=triarch-vault
```

Until this is done, portal will start cleanly but log `[portal-slack] PORTAL_SLACK_BOT_TOKEN not set — skipping notification` on every approve/reject (notification is no-op; HMAC dispatch and approval STILL succeed).

### Pending Mike's review (PRs to be opened, NOT merged)

- Portal PR — review and merge to main when ready. Merge to main triggers Firebase App Hosting deploy of portal-prod.
- Admin PR — docs-only PR with this SUMMARY.md + STATE updates. No app code change → no admin redeploy.

### Live smoke test (deferred)

Once both PRs merge + portal-dev redeploys + GCP secret is provisioned:
- Customer admin clicks Approve in portal-dev → release_approvals row stamped `actor_source='portal'` + Slack message in `#release-approvals-test` within 3 sec + admin-dev workflow dispatch fires (round-trip GH workflow).

## Known Stubs

- `handleLoadMore` in `ReleasesClient.tsx`: kept stubbed (no portal GET releases list endpoint exists yet). `hasMoreState=false` keeps the LoadMore button hidden — users see all releases that fit in the initial page (configurable `pageSize` prop, default 20). Documented in plan as deferred to 22-05 or beyond. Will not block customer use because the ReleasesClient currently always renders the full `initialSections` payload (no pagination cutoff in the read query path).

## Pitfall 9 (Slack credential routing) — end-to-end verification

| Concern | Owner | Mechanism | Verified |
|---|---|---|---|
| Slack bot token | Portal | `PORTAL_SLACK_BOT_TOKEN` distinct GCP secret | Test 1 + apphosting bindings |
| Customer-side Slack post | Portal | `postReleaseApprovalNotification` / `postReleaseRejectionNotification` | Test 2-6 + integration in approve/reject routes |
| Customer-derived sanitization | Portal | `sanitizeForSlack` at boundary | Test 3 |
| Admin-only Block Kit (slack_promote/reject) | Admin | Stays in admin's `notifyReleaseApproved` (untouched) | Test 6 (no admin action_ids in portal source) |
| GitHub App key | Admin | `GITHUB_APP_PRIVATE_KEY` (admin-only) | Unchanged from 22-01 |
| Workflow dispatch confirmation Slack post | Admin | `promoteAndAudit` → web-origin → `project.slackChannelId` | Different channel from portal's; verified by code reading |

**Portal owns Slack post; admin owns GitHub App. End-to-end clean separation.**

## Next Phase Readiness

- **22-05** (final shared package bumps + milestone close) can proceed. The five WRITE requirements (WRITE-01..05) are now complete:
  - WRITE-01 ✅ (22-02): release_approvals.actor_source='portal'
  - WRITE-02 ✅ (22-03): atomic lock + branch regex + 8-min timeout + branch-guarded auto-clear
  - WRITE-03 ✅ (22-03): portal-owned FAH_PROMOTER_SA_KEY end-to-end
  - WRITE-04 ✅ (22-04): portal-owned PORTAL_SLACK_BOT_TOKEN end-to-end
  - WRITE-05 ✅ (22-04): two-step approve UX, conflict badge, branch lock disable preserved
- Phase 23 (Bug + Feature Customer Surface) unblocked.
- Live smoke test of customer Approve → Slack → admin workflow dispatch + release_approvals.actor_source='portal' deferred to post-merge with PORTAL_SLACK_BOT_TOKEN provisioned (cross-cutting verification step).

## Self-Check: PASSED

All claimed files exist on disk; all claimed commits exist in portal history.

- 3 files created — verified with `[ -f "$f" ]` (portal-slack.ts + portal-slack.test.ts + BranchPreviewClient.test.tsx)
- 9 files modified — verified with `git status` against portal HEAD
- 3 commits in portal — `725771f` Task 1 + `6e51240` Task 2 + `6031c5b` Task 3 — verified with `git log --oneline -5`
- `must_haves.key_links` 3/3 present:
  - `postReleaseApprovalNotification\(` in `portal/src/app/api/projects/[slug]/releases/[releaseId]/approve/route.ts` — yes (line 135)
  - `fetch.*releases.*approve` in `portal/src/app/projects/[slug]/releases/ReleasesClient.tsx` — yes (line 350)
  - `useSWR.*branch/preview/status` in `portal/src/app/projects/[slug]/releases/BranchPreviewClient.tsx` — yes (line 79 useSWR + line 78 cache key with status)
- `must_haves.truths` 8/8 covered by code + tests:
  1. Customer admin Approve → INSERT release_approvals + Slack BEFORE HMAC dispatch ✅ (test `22-04: posts Slack approval notification BEFORE HMAC dispatch`)
  2. Slack from portal directly (no admin proxy) ✅ (portal-slack.ts uses fetch to slack.com directly)
  3. ReleasesClient un-stubbed: 4 mutation handlers wired ✅ (test suite covers all 4; handleLoadMore stays stubbed per plan)
  4. BranchPreviewClient un-stubbed: SWR polling + POST ✅ (12 BranchPreviewClient tests)
  5. Two-step approve UX preserved ✅ (test `Two-step UX: Approve button alone does NOT call fetch`)
  6. Conflict badge propagation preserved ✅ (test `Conflict state hides Approve button + shows resolve helper text`)
  7. Branch lock disable preserved ✅ (test `WRITE-05: when ANY branch is in flight, ALL preview buttons are disabled`)
  8. Slack post failure does NOT roll back the approval ✅ (test `22-04: Slack failure does NOT block HMAC dispatch (still 201)` + `22-04: Slack throw does NOT block HMAC dispatch`)
- `must_haves.artifacts` 6/6 present:
  - `portal/src/lib/portal-slack.ts` ✅ exports `postReleaseApprovalNotification`, `postReleaseRejectionNotification`
  - `portal/src/app/api/projects/[slug]/releases/[releaseId]/approve/route.ts` ✅ contains `postReleaseApprovalNotification\(` (line 135)
  - `portal/src/app/projects/[slug]/releases/ReleasesClient.tsx` ✅ contains `fetch.*api/projects.*releases` (4 call sites)
  - `portal/src/app/projects/[slug]/releases/BranchPreviewClient.tsx` ✅ contains `useSWR` (line 79)
  - `portal/apphosting.yaml` ✅ contains `PORTAL_SLACK_BOT_TOKEN` + `SLACK_RELEASE_APPROVAL_CHANNEL`
  - `portal/package.json` ✅ contains `"version": "0.3.3"`
- Portal `apphosting.yaml` + `apphosting.dev.yaml` both contain `PORTAL_SLACK_BOT_TOKEN` + `SLACK_RELEASE_APPROVAL_CHANNEL` — verified with grep
- Portal `package.json` shows `"version": "0.3.3"` — verified
- Portal `package-lock.json` shows `"version": "0.3.3"` — verified after `npm install --package-lock-only`
- No `slack_promote` / `slack_reject` action_ids in portal source — verified with grep (only in comments + test assertions)
- Only one `TODO Phase 22` remains — in the skipped RC-03 isolation test with refreshed comment explaining the deferral; the four mutation handler stubs in `ReleasesClient.tsx` are GONE (4 of 5 un-stubbed; handleLoadMore comment block describes the deferral)
- `next build` passes — verified

---
*Phase: 22-release-page-port-write*
*Completed: 2026-05-08 (PRs to be opened, awaiting Mike's review)*
