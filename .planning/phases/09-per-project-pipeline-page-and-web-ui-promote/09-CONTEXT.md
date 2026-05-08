# Phase 9: Per-Project Pipeline Page and Web-UI Promote - Context

**Gathered:** 2026-05-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Build a staff-only consolidated per-project pipeline page at `/admin/modules/pipeline/<slug>` that surfaces env state, branch RC list, what's-changed-since-prod, and deploy history. Add a Web-UI Promote button on approved RC rows that calls the same `dispatchWorkflow` path as the Slack OttoBot Approve flow — Slack notifications still post; web is an alternative entry point, not a replacement. Schema-side: add a partial unique index on `release_approvals` to prevent double-promote races between web and Slack, plus an `actor_source` column to distinguish origin.

**Delivers:** PIPE-05, PROM-01, PROM-02, PROM-03, PROM-04, PROM-05, DIFF-01.
**Does NOT deliver:** branch preview swap (Phase 13), customer page filter chips (Phase 14), bug/feature detail "released in" sidebar (Phase 12).

</domain>

<decisions>
## Implementation Decisions

### Pipeline Page Sections & Layout
- Page route: `/admin/modules/pipeline/<slug>` — staff-only (existing `requireStaff` pattern in `src/app/admin/layout.tsx`)
- Top-to-bottom sections: (a) **Header** with project name + breadcrumb back to /admin + prod/dev versions ("prod v2.3.5 · 3d ago / dev v2.4.1 · 12m ago"); (b) **Branch RC list** — one row per RC, grouped by branch with branch headers; (c) **"What's changed since prod" expanded table** (DIFF-01); (d) **Deploy history** — last 10 prod rollouts and last 10 dev rollouts side-by-side or stacked
- Each branch RC row: `Branch · Version · Status pill · Author · Timestamp · Promote button` (6 cells, single row)
- Empty state when no RCs: "No release candidates yet — push to a feature branch and tag a version" with muted zinc-500 styling; do not hide the section
- Pipeline page is now linked from the `/admin` Project Health tile (replaces the Phase 8 direct link to `/projects/<slug>/releases`); breadcrumb "← Admin home" on the pipeline page
- The customer release page (`/projects/<slug>/releases`) remains for customer-admin use; staff continue to access it via "Customer view" link from the pipeline page

### Promote Button & Confirm Modal
- Button placement: **right-aligned in the RC row**, only visible when `status='approved'` AND user role is staff; absent for non-approved RCs and non-staff users
- Confirm UX: **two-step inline flow** matching the existing customer Approve pattern (no modal overlay); 1st click toggles the row to confirm state with full label `"Promote feat/audio v1.4.2 to production"` + Confirm/Cancel buttons; 2nd click on Confirm dispatches
- Type-to-confirm explicitly out of scope per REQUIREMENTS.md OUT OF SCOPE list
- After dispatch fires: row cell shows inline spinner ("Dispatching..."); on terminal state replaces with one of:
  - green "merged" pill + short SHA link to the merge commit on GitHub
  - yellow "conflict" pill + count of conflict files (links to the GHA run URL)
  - red "ci_failed" pill linking directly to the GitHub Actions run URL
- Errors link to **`promote_attempts.ci_run_url`** — same field the customer page uses
- After dispatch, the RC row's status pill stays "approved" until the round-trip ingest at `POST /api/releases/promoted` flips it (existing flow); the inline spinner-then-pill is purely UI-side dispatch acknowledgment

### Double-Promote Constraint & Audit Trail
- Schema migration adds **partial unique index**: `CREATE UNIQUE INDEX release_approvals_one_approved_per_release ON release_approvals (release_id) WHERE decision = 'approved'` — only one approved row allowed per release; rejection rows can stack (multiple rejections allowed)
- Schema adds **`actor_source` column** to `release_approvals` (varchar(16), nullable) — values `'web'` or `'slack'` populated by the route that creates the row; existing approval rows have NULL (legacy)
- Web Promote race handling: DB INSERT throws unique-constraint violation → caught by route → returns **HTTP 409 Conflict** with body `{ error: "already_approved", approved_by: "...", approved_via: "slack", approved_at: "..." }`; UI surfaces a toast: "Already promoted by mike@triarchsecurity.com via Slack 12s ago"
- New API route: **`POST /api/admin/releases/<id>/promote`** — staff-only auth (existing `requireStaff` pattern); body empty; reuses `promoteAndAudit()` from `src/lib/release-promotion.ts`; returns 200 on dispatch fired (with `{ ok: true, dispatched_at, run_url? }`), 409 on race, 400 on invalid status (e.g. trying to promote a release already in `'promoted'` status)
- `promoteAndAudit()` signature adjustment: existing function requires `slackChannelId` + `slackMessageTs` — make these **nullable** with web flow passing null. When null, function skips the Slack thread-update path but still posts a fresh Slack notification via `notifyReleaseApproved()` (so Slack always knows about a promotion, regardless of origin)
- Slack OttoBot interactive Approve handler updates `actor_source = 'slack'`; new web route updates `actor_source = 'web'`

### "What's Changed" Expanded Table (DIFF-01)
- Section title: "What's changed since prod" — collapsible, default expanded for staff (can be collapsed via header chevron)
- Table columns: **Type pill (Bug fix / Feature / Other) · Title · Branch · Author · Date**
- Type pill color tokens: red for Bug fix, teal for Feature, zinc for Other
- Entries with linked bug/feature IDs (Phase 11/12 forward) become clickable to those detail pages — but Phase 9 ships with text-only entries; Phase 12 wires the link rendering
- Empty state: "Dev is in sync with prod" — single line, no table

### Claude's Discretion
- Exact column widths, sticky header behavior, deploy history pagination size — at Claude's discretion
- The "Customer view" link styling on the pipeline page — at Claude's discretion (small ghost button is reasonable)
- Whether to render branch RC list as a single table or as per-branch sub-tables — at Claude's discretion based on design ergonomics

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/pipeline-summary.ts` (Phase 8 — `getProjectPipelineSummaries`) — extends naturally to a `getProjectPipelineDetail(slug)` for this single-project view; keep the same `PipelineSummary` shape but include full RC list + deploy history
- `src/lib/release-promotion.ts` (`promoteAndAudit`) — the single dispatch function; needs nullable Slack params adjustment
- `src/lib/db.ts` — Drizzle pg.Pool client
- `src/db/schema.ts` — extend `release_approvals` with `actor_source` + partial unique index; relations already declared
- `src/app/projects/[slug]/releases/page.tsx` — existing customer release page; reference for branch grouping logic and conflict badge pattern (do not duplicate; the staff page is its own component but mirrors structure)
- `src/app/admin/layout.tsx` — existing staff auth gate; pipeline page nests under `/admin` so layout applies automatically
- `src/app/admin/page.tsx` — Project Health tile (Phase 8); update Link target from `/projects/<slug>/releases` to `/admin/modules/pipeline/<slug>` in this phase

### Established Patterns
- Server component fetches all data; client island handles only the Promote two-step flow
- `useTransition` from React for the Promote in-flight state (no SWR yet — comes in Phase 13)
- Drizzle migrations via `drizzle-kit generate` + manual application
- Toast component already exists in `src/components/Toast.tsx` (used by ReleasesClient) — reuse for race-condition surfacing

### Integration Points
- New page `/admin/modules/pipeline/[slug]/page.tsx` (server component)
- New client island `/admin/modules/pipeline/[slug]/PromoteButton.tsx` (handles two-step + spinner + result pill)
- New API route `/api/admin/releases/[id]/promote/route.ts`
- Schema migration `0014_release_approvals_unique_approved.sql` (partial index + actor_source column)
- `src/lib/release-promotion.ts` — adjust `promoteAndAudit()` to accept nullable Slack context
- `src/app/admin/page.tsx` — change Link href from `/projects/<slug>/releases` to `/admin/modules/pipeline/<slug>` (Phase 8 tile target update)

</code_context>

<specifics>
## Specific Ideas

- "Customer view" link on the pipeline page should be small and de-emphasized — staff need to know it exists but the pipeline page is their primary surface
- The deploy history section should show ROLLOUTS (not just release_logs entries) — pull from `release_logs` filtered by env=prod and env=dev separately, not from `promote_attempts` (which only covers branch-merge events)
- Conflict-state RCs should still show the Promote button visible-but-disabled with a tooltip "Resolve conflict to enable" — staff need the affordance to know it exists; the customer page already handles this for the customer Approve flow

</specifics>

<deferred>
## Deferred Ideas

- Real-time updates after Promote click (SWR polling) — Phase 13's pattern; for Phase 9, manual page refresh after dispatch is acceptable
- Bulk promote (multiple RCs at once) — not in v2.1 scope
- Promote with comment ("Why promoting now?") — over-engineered for v2.1; can be added later
- Filter on what-changed table (by type, by author) — fits Phase 14 customer-page filter pattern; defer to consolidation there
- Pipeline page expanded view of bug/feature counts per release — Phase 12 wires the link, not the count display

</deferred>
