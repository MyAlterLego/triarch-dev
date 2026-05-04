---
phase: 02-customer-releases-page
plan: 05
subsystem: customer-ui
tags: [nextjs, client-component, react, drizzle, pagination, toast, accessibility, aria, tailwind]

# Dependency graph
requires:
  - phase: 02-02
    provides: "ReleasesClient placeholder + page.tsx Props interface + types.ts"
  - phase: 02-03
    provides: "POST/DELETE /feedback API endpoints"
  - phase: 02-04
    provides: "POST /approve and POST /reject API endpoints"
provides:
  - "Toast.tsx at src/components/Toast.tsx — hand-rolled, reusable for future phases"
  - "GET /api/projects/[slug]/releases — paginated release list with member-aware 404"
  - "Full ReleasesClient.tsx — production interactive table replacing Plan 02 placeholder"
affects:
  - Phase 03: pending_approval is reserved as terminal display-only state; Phase 3 introduces Slack-driven transition

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Toast component: fixed bottom-right, role=status + aria-live=polite, kind-based border (teal/red)"
    - "Two-step approve: setApproveStep record + setInterval countdown + ref-based focus on step-2 button"
    - "Per-release ephemeral state: Record<releaseId, T> pattern avoids sub-component extraction for all action state"
    - "useEffect cleanup: both toast timer and countdown interval return clearTimeout/clearInterval"
    - "updateReleaseInState helper: maps over releases array, patches matching ID, avoids full refetch"
    - "DOM-conditional viewer gating: {userRole === 'admin' && ...} — elements not rendered, not just hidden"
    - "Load more: +1 offset pattern, setOffset(prev + pageSize), setHasMoreState from response"

key-files:
  created:
    - src/components/Toast.tsx
    - src/app/api/projects/[slug]/releases/route.ts
  modified:
    - src/app/projects/[slug]/releases/ReleasesClient.tsx

key-decisions:
  - "Auto-dismiss timer for success toasts lives in ReleasesClient (useEffect on toast state) not in Toast.tsx — Toast is dumb; parent decides dismiss policy based on kind"
  - "Countdown intervals tracked per-releaseId in approveStep Record — supports multiple expanded rows simultaneously"
  - "Reject form rendered inline when showRejectForm[releaseId] is true, replacing the Reject button in the DOM — matches UI-SPEC line 466"
  - "GET pagination endpoint mirrors page.tsx sort exactly (coalesce DESC) for stable offset semantics"
  - "ExpandedPanel extracted as inline sub-component with explicit prop drilling — single-file design per Phase 2 closing guidance"

# Metrics
duration: 4min
completed: 2026-05-04
---

# Phase 02 Plan 05: Full ReleasesClient + Toast + GET Pagination Summary

**Full interactive release-table client with two-step approve countdown, reject inline form, feedback compose/delete, hand-rolled Toast component, error banner, empty state, skeleton, and Load more pagination — Phase 2 feature-complete**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-05-04T02:12:25Z
- **Completed:** 2026-05-04T02:16:25Z
- **Tasks:** 3
- **Files created:** 2 (Toast.tsx, route.ts)
- **Files modified:** 1 (ReleasesClient.tsx — 10-line placeholder → 841-line production component)

## Accomplishments

### Task 1: Hand-rolled Toast component

- Created `src/components/Toast.tsx` — 42 lines, zero new dependencies
- `role="status"` + `aria-live="polite"` per UI-SPEC Accessibility Contract line 682
- `aria-label="Dismiss notification"` on dismiss X button per UI-SPEC fix (PLAN frontmatter)
- Success variant: `border-teal-500/30 text-zinc-200`; Error variant: `border-red-500/30 text-red-400`
- Fixed `bottom-6 right-6 z-50`, `w-80` width per UI-SPEC line 59 spacing contract
- Auto-dismiss timer intentionally NOT in component — lives in ReleasesClient useEffect; Toast.tsx is purely presentational

### Task 2: GET /api/projects/[slug]/releases pagination endpoint

- Created `src/app/api/projects/[slug]/releases/route.ts` — 93 lines
- Member-aware 404-no-leak: `isStaff || memberships.some(m => m.project_key === project.key)`
- Sort: `coalesce(deployedAt, releasedAt) DESC` — identical to `page.tsx` for stable offset semantics
- `+1` fetch pattern: `limit: limit + 1`, `hasMore = rows.length > limit` — no separate count query
- `limit` clamped [1, 100]; `offset` clamped [0, ∞) — safe against malformed query params
- `feedback` ordered `asc(createdAt)`, `approvals` ordered `desc(approvedAt)` — matches Plan 02 pattern
- Returns `{ releases: ReleaseRow[], hasMore: boolean }` — consumed directly by ReleasesClient

### Task 3: Full ReleasesClient.tsx (placeholder replaced)

- **841 lines** — exceeds 350-line plan minimum
- All 4 API endpoints wired: `/feedback` POST, `/feedback/{id}` DELETE, `/approve` POST, `/reject` POST + GET pagination
- **Toast integration:** success toasts auto-dismiss after 5s via `useEffect` on `toast` state; error toasts persist until manually dismissed
- **Two-step approve:** Step 1 → `setApproveStep('confirm')` + `setCountdown(5)`; `useEffect` `setInterval` decrements per second; expires → resets to `'idle'`; confirm click → `handleApprove`; `useEffect` moves focus to step-2 button via ref after state transition
- **Reject inline form:** `showRejectForm[releaseId]` toggles form vs button; `autoFocus` textarea; 500-char limit, warn at 450; `Confirm Rejection` disabled while empty; Cancel restores focus to Reject button via ref
- **Feedback compose:** admin-only (`{userRole === 'admin' && ...}`); 2000-char limit, warn at 1900; Post Comment disabled while empty; `Loader2` spinner while submitting
- **Feedback list:** chronological ascending; Trash2 delete only for author within 24h; `canDeleteFeedback` checks email (case-insensitive) + DELETE_WINDOW_MS
- **Audit trail line:** `approved by {email} on {date}` / `rejected by {email}: {80-char excerpt}` / `promoted by … on …`
- **Error banner:** `role="alert"` + `aria-live="assertive"`; Retry calls `handleLoadMore`
- **Empty state:** "No releases yet" + project-name body copy per UI-SPEC lines 583-591
- **Skeleton:** `aria-busy="true"` on `<tbody>` — activates when `releases.length === 0` and loading
- **Load more:** appends to `releases` state, increments `offset`, updates `hasMoreState`
- **Viewer role:** action buttons + feedback textarea not in DOM — DOM-conditional, not CSS-hidden; screen readers never encounter hidden action elements
- **All UI-SPEC color tokens used:** STATUS_BADGE_COLORS + ENV_BADGE_COLORS per lines 113-127; no `--accent-gold` usage
- **All accessibility attributes:** `aria-expanded`, `aria-controls`, `id="panel-{id}"`, `aria-label` on every interactive element per lines 670-696

## Endpoint URLs

| Endpoint | When Called |
|----------|-------------|
| `POST /api/projects/{slug}/releases/{id}/feedback` | Post Comment click |
| `DELETE /api/projects/{slug}/releases/{id}/feedback/{fid}` | Trash2 click (author, within 24h) |
| `POST /api/projects/{slug}/releases/{id}/approve` | Confirm approval click (step 2) |
| `POST /api/projects/{slug}/releases/{id}/reject` | Confirm Rejection click |
| `GET /api/projects/{slug}/releases?limit={n}&offset={n}` | Load more click |

## Task Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Hand-rolled Toast component | `3477f80` | Toast.tsx (created, 42 lines) |
| 2 | Pagination GET endpoint | `501546a` | route.ts (created, 93 lines) |
| 3 | Full ReleasesClient.tsx | `59fdb52` | ReleasesClient.tsx (841 lines, replaced placeholder) |

## Verification

**Automated:** `npx tsc --noEmit` passes, `npx next build` passes with all 5 customer routes in manifest:
- `/projects/[slug]/releases` (Dynamic)
- `/api/projects/[slug]/releases` (Dynamic — new GET endpoint)
- `/api/projects/[slug]/releases/[releaseId]/approve`
- `/api/projects/[slug]/releases/[releaseId]/feedback`
- `/api/projects/[slug]/releases/[releaseId]/reject`
- `/api/projects/[slug]/releases/[releaseId]/feedback/[feedbackId]`

**Manual UAT:** Requires live DB with seeded data (deferred to post-deploy).
Expected UAT pass cases per plan verification section:
- GATE-01: non-member → Next.js 404
- GATE-02: release table with version, env/status badges, SHA, deployed_at, approver
- GATE-03: feedback post/list/delete (admin); viewer has no textarea in DOM
- GATE-04/05/06: two-step approve → status badge updates → audit line → action buttons gone
- REJECT-01: reject with reason → status badge → audit excerpt
- Pagination: Load more appends next 20; button disappears when no more

## Notes for Phase 3

- `status === 'pending_approval'` is reserved in the State Matrix (UI-SPEC line 423) — Phase 2 treats it as terminal display-only (no action buttons). Phase 3 introduces the Slack-driven transition from `dev → pending_approval` and may add Phase-3-specific UI affordances for this state.
- The `promoted` status is display-only in Phase 2 — audit trail shows "approved by … on …" without "promoted on" segment (Phase 5 populates the promoted timestamp when deploy round-trip lands).

## Deviations from Plan

None — plan executed exactly as written. UI-SPEC scaffolds followed verbatim. All color tokens, copywriting strings, and accessibility attributes applied per spec.

## Known Stubs

None — ReleasesClient is the production component. All API endpoints are wired end-to-end. No hardcoded empty values flow to UI rendering.

## Self-Check: PASSED
