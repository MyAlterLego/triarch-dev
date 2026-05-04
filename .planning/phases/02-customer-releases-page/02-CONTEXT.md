# Phase 2: Customer Releases Page - Context

**Gathered:** 2026-05-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Customer-facing release-gating UI at `/projects/{slug}/releases`. Project members see their project's releases; project admins can leave feedback, approve, or reject dev releases. Backend wiring (audit-trail tables, membership API) is already complete from Phases 1 and 1.1 — this phase builds the UI surface and the per-release approve/reject/feedback API endpoints that operate on those tables. Slack notification (the next handoff) is Phase 3 and is OUT of scope here.

</domain>

<decisions>
## Implementation Decisions

### Page Layout & Release List
- **Layout**: Table with expandable rows. One row per release showing version, env badge, status badge, commit_sha (short), deployed_at, approver-or-blank. Click expands → feedback list + textarea + Approve/Reject buttons. Mirrors `/admin/modules/release-logs` viewer pattern.
- **Default sort**: Newest first (`deployed_at DESC`). Same as every existing release viewer.
- **Pagination**: 20 rows initial + "Load more" button → next 20. CRDB query stays bounded.
- **Status badges**: color-coded — `dev` zinc, `pending_approval` amber, `approved` teal, `rejected` red, `promoted` gold. Reuses existing brand palette tokens.

### Feedback UX
- **Location**: Inline within the expandable row. List of comments chronologically + textarea below to post. No separate detail page (deferable to v1.15).
- **Visibility**: All project members see all feedback (admins + viewers). Encourages team alignment within a customer.
- **Edit / delete**: Authors can DELETE their own comments within 24h of posting; no edits ever. Deletion either tombstones the row or hard-deletes — implementer chooses (simpler = hard delete; comment IDs aren't referenced elsewhere).
- **Character limit**: 2000 chars enforced server-side (return 400 if exceeded). Client warns at 1900.

### Approval & Reject Flow
- **Approve confirmation**: Inline two-step. First click → button morphs to "Confirm approval?" with a 5-second visible countdown. Second click within window commits. Click anywhere else / timeout → cancels.
- **Reject reason**: Required textarea. Reject button reveals an inline form with a textarea + "Confirm rejection" button. Empty / whitespace-only submissions → 400. Reason persisted on the rejection audit row.
- **After action**: Toast notification (bottom-right) + in-place row update — status badge changes, action buttons disappear and are replaced by "approved by {email} on {timestamp}" or "rejected by {email}: {reason excerpt}".
- **Visual weight**: Approve = teal primary button; Reject = subdued red secondary (outline or ghost style). Approve is the obvious affirmative; reject feels deliberate.

### Edge Cases & Roles
- **Empty state**: Heading "No releases yet". Body: "Once a dev deploy completes for {project name}, releases will appear here for review."
- **Viewer role** (`project_members.role = 'viewer'`): Reads everything (release list, status, all feedback). Cannot post feedback. Cannot approve/reject. Buttons + textarea simply not rendered.
- **Already-approved / -rejected releases**: Action buttons hidden. Status badge shows current state. Adjacent line: "approved by mike@triarchsecurity.com on 2026-05-03 14:23" or "rejected by …: {reason snippet, ellipsized at 80 chars, full reason in expanded row's audit log}".
- **Loading state**: Skeleton rows during initial fetch (matching the table layout). Subsequent "Load more" shows a spinner on the button only.
- **Error state**: Inline banner above the table with the error message + a "Retry" button. The page stays mounted; error doesn't trigger a full reload.

### Claude's Discretion
- Exact tailwind classes / px values — implementer matches existing `/admin/modules/release-logs` and the manage-members page conventions
- Whether to use a hand-rolled toast or pull in a tiny lib (sonner, react-hot-toast) — implementer chooses but **prefer hand-rolled** to avoid adding a dep just for this
- The exact 5-second countdown UX (progress ring vs text countdown vs nothing visible) — implementer chooses
- Whether deletion is hard or tombstone — implementer chooses (default: hard delete, since comment IDs aren't referenced)
- Whether to render feedback in reverse-chronological (newest at bottom near textarea) or chronological (oldest first) — implementer chooses; default newest-at-bottom matches typical chat-like patterns
- Exact short-commit-sha length: 7 or 8 chars (default 7 to match git's default)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `/admin/modules/release-logs/page.tsx` — existing release viewer demonstrates the table-with-expandable-rows pattern, color-coded badges (existing `releaseLogType` colors), and the project filter chip
- `src/lib/auth-context.ts` — `getCurrentUserContext()` returns `{email, isStaff, memberships[]}` with role per project. Already used by Phase 1.1's API filters.
- `src/lib/api-auth.ts` — `requireSignedIn`, `requireMembership(projectKey)`, `requireStaff` from Phase 1.1
- `src/db/schema.ts` — `releaseLogs` (with env/status/commit_sha/deployed_at columns from Phase 1), `release_feedback`, `release_approvals` tables already exist
- `src/app/admin/platform/projects/[id]/members/MembersClient.tsx` — Phase 1's add-member form is a good reference for inline-form-with-validation UX
- `@myalterlego/shared-ui` `DynamicSidebar` — existing sidebar; new project URL `/projects/{slug}/releases` is OUTSIDE the `/admin` admin shell. Decide in PLAN whether the customer page wraps in a customer-facing layout or reuses the admin layout.

### Established Patterns
- All API routes use `requireStaff` / `requireSignedIn` / `requireMembership` from `@/lib/api-auth`
- Drizzle queries: `db.select().from(table).where(...)` + `inArray(col, vals)` for IN-list filters
- Email is case-insensitive everywhere via `lower(email) = lower($input)`
- 401 unauth / 403 forbidden / 404 for non-member detail (no info leak)
- Server-component pages: `getServerSession(authOptions)` → `getCurrentUserContext(session)` at the top → `notFound()` for non-members
- Client components: `'use client'`, `useSession()` from `next-auth/react` for current user info, plain `fetch` for API calls (no library needed)

### Integration Points
- New page route `/projects/[slug]/releases/page.tsx` — outside `/admin/*` per CONTEXT decision. Plus a client `ReleasesClient.tsx` for the interactive bits.
- New API endpoints under `/api/projects/[slug]/releases/` (or `/api/platform/releases-gating/...` — implementer choice)
  - `POST /api/projects/[slug]/releases/[releaseId]/feedback` — post feedback
  - `DELETE /api/projects/[slug]/releases/[releaseId]/feedback/[feedbackId]` — delete own feedback within 24h
  - `POST /api/projects/[slug]/releases/[releaseId]/approve` — approve, transition status, write audit
  - `POST /api/projects/[slug]/releases/[releaseId]/reject` — reject with required reason, write audit
- Existing `releaseLogs` schema expects `status` updates from Phase 2's approve/reject flows; the GATE-12 prod-deploy round-trip is Phase 5
- Drizzle `relations()` declarations for `releaseLogs` ↔ `releaseFeedback` ↔ `releaseApprovals` were deferred from Phase 1 — add here if convenient, or stay table-only with explicit JOINs (implementer choice)

</code_context>

<specifics>
## Specific Ideas

- The customer URL is `/projects/{slug}/releases` — `slug` is the project's `key` value (e.g., `truth-treason`, `darksouls-rpg`). Mirror Phase 1's manage-members `[id]` segment-naming convention (where `[id]` actually contains the key) to avoid Next.js dynamic-segment conflicts at the same path level.
- New Drizzle schema field consideration: `release_approvals` already exists from Phase 1 with a `decision` column (approve|reject) and `ip_address`/`user_agent`. Reuse this single table for both approve and reject events. Add a nullable `reason TEXT` column if it doesn't exist yet — Phase 1's schema may or may not have it.
- For the API endpoints, the standard pattern is:
  1. `requireSignedIn()` + `getCurrentUserContext`
  2. Look up the project by slug; 404 if not found
  3. `requireMembership(project.key)` for non-staff (or 404 to non-members)
  4. Look up the release by id; verify `release.project === project.key`; 404 otherwise
  5. Operation-specific validation (status pre-condition, role check for approve/reject, length check for feedback)
  6. Atomic INSERT into audit table + UPDATE on `releaseLogs.status` (use a CRDB transaction)
- For idempotent approve (re-approving an already-approved release): return the existing `release_approvals` row + 200; don't double-insert. Same for reject.

</specifics>

<deferred>
## Deferred Ideas

- Customer self-serve member management (already deferred from Phase 1)
- Per-release detail page at `/projects/{slug}/releases/{id}` — current scope keeps everything in the expandable row; detail page is a v1.15 candidate if URL sharing becomes a need
- Notifications on new feedback (Slack DM, email) — explicitly deferred from Q5 of Area 2
- Editing feedback (only delete in v1.14)
- Customizing feedback time window (24h delete window is hardcoded)
- Multi-stage approval (N-of-M sign-offs) — already in v2 backlog (GATE-V2-03)
- Comparison view between two releases — not needed for v1.14 gating
- Search / filter within feedback per release — defer until volume justifies it

</deferred>
