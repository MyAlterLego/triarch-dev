# Phase 36: Inclusion Approval State Machine - Context

**Gathered:** 2026-05-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Add an explicit "decide what goes IN the next build" gate across the bug/feature lifecycle. Phase 36 delivers: (1) schema additions to `bug_reports`/`feature_requests` for an `inclusion_state` lifecycle column + `next_release_log_id` FK, (2) admin UI surfaces for staff to move items through the state machine, (3) extension of the v2.1 commit-parser to auto-flip `approved_for_build → built` on commit ingest, (4) prod-deploy auto-flip `built → deployed`, and (5) a read-only customer-facing `/projects/{slug}/upcoming` page on portal. Pilot scope: TMI only; rollout decision deferred to 30-day-dogfooding review. Maps requirements INCL-01..08.

</domain>

<decisions>
## Implementation Decisions

### Schema & State Machine
- Use `varchar(32)` column with DB CHECK constraint for `inclusion_state` — matches existing `bug_reports.status` / `release_logs.status` pattern; avoids PG enum migration pain
- Allow backward transitions, but only via the INCL-05 "Remove from build" action (`approved_for_build → pending_inclusion`); auto-flips (`built`, `deployed`) are forward-only and driven by commit/deploy ingestion
- Commits referencing items NOT in `approved_for_build` (still `triaged`/`pending_inclusion`): still write `release_log_links` row (preserves v2.1 commit-parser behavior) but do NOT flip `inclusion_state`; log soft-warning to commit-parser stats so staff sees orphan-link signal
- All `inclusion_state` transitions audit via existing `workflow_transitions` table — entity_type=`'bug_report'`/`'feature_request'`, from/to state captured, transitionedBy + reason populated

### Admin UI Placement & UX
- "Propose for next build" / "Approve for build" actions live on the detail page primary, with a compact dropdown action on list rows for triage speed — mirrors v2.1 Phase 12 detail-page pattern
- Bug/feature list pages gain a dedicated `Inclusion` column with color-coded pills: violet=`approved_for_build`, teal=`built`, blue=`deployed`, zinc=`triaged`/`pending_inclusion` — parallels v2.1 status column treatment
- `/admin/modules/next-build-plan/{slug}` page = single table grouping bugs + features mixed (sorted by approval date desc) with `?type=` filter chips reusing v2.1 FilterChips pattern
- No bulk action support — single-row "Remove from build" only; TMI pilot has low item count, bulk-ops deferred to post-pilot review

### Customer Portal /upcoming Page
- Display items in `approved_for_build` + `built` states (both are "coming next"); exclude `triaged`/`pending_inclusion` (still under staff consideration)
- Same `getProjectAccess(slug)` membership gating as `/releases` — 404 for non-members (no membership-existence leak; matches PORTAL-03)
- Customer-visible fields: title + type-pill (bug/feature) + severity (bugs only) + state pill (approved/built) + relative timestamp on state change. NO `triarchNotes`, NO internal Slack thread references
- New admin endpoint `GET /api/portal/projects/{slug}/upcoming` (per INCL-08 spec); portal fetches via existing HMAC internal-call pattern from Phase 22 (admin authoritative for inclusion data)

### Auto-Flip Integration with v2.1 Commit-Parser & Prod-Deploy Path
- `built → deployed` batch-flip on prod ingest lives in the same transaction as the release row status update in `src/app/api/releases/promoted/route.ts` (atomic with the promotion, matches the existing transaction pattern at lines 81-103)
- Idempotency on re-ingestion enforced via WHERE clause: `inclusion_state='built' AND next_release_log_id=<row.id>` — re-runs are no-ops because already-deployed rows don't match the filter
- Auto-flip writes audit row to `workflow_transitions`: `transitionedBy='commit-parser:{commit_sha}'`, `reason='auto-flip from commit'`, `from_state='approved_for_build'`, `to_state='built'`
- `next_release_log_id` stamping uses the DEV release_logs row at commit-ingest time — preserves "which dev release first carried this item"; prod join is reached via `release_logs.version` lookup at deploy time without losing original dev-row provenance

### Claude's Discretion
- File layout for new admin page (server component patterns, table extraction)
- Specific column ordering / pill copy text within UI guidelines (violet/teal/blue/zinc tokens already locked)
- Exact migration sequencing (single migration vs split add-column + check-constraint)
- Vitest test file organization for new commit-parser branch + new transition paths
- Whether to extract a `src/lib/inclusion-state.ts` helper module or inline transitions

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/commit-parser.ts` — existing pure-regex parser (extends for auto-flip, do NOT rewrite); patterns A/B/C unchanged
- `src/lib/link-stamper.ts` — DB-side commit-parser caller; auto-flip logic plugs in here after `release_log_links` write
- `src/app/api/releases/promoted/route.ts` — existing prod-ingest transaction at lines 81-103; built→deployed flip extends this transaction
- `workflow_transitions` table (schema.ts line 356) — already exists with entity_type/entity_id/from_status/to_status/transitionedBy/reason/metadata cols — perfect for audit
- `getProjectAccess(slug)` membership gating from v2.2 Phase 21 (PORTAL-03) — reuse for portal `/upcoming`
- `FilterChips.tsx` from v2.1 Phase 14 — reuse for next-build-plan page filter
- v2.1 Phase 12 `ReleasedInSidebar` pattern — reuse styling for inclusion pill rendering
- HMAC internal-call pattern from v2.2 Phase 22 WRITE-04 — reuse for portal → admin `/api/portal/projects/{slug}/upcoming` fetch
- `getProjectPipelineSummaries()` from `src/lib/pipeline-summary.ts` — patterns for project-scoped query with index awareness

### Established Patterns
- Status columns: `varchar(32)` with DB CHECK (release_logs.status, bug_reports.status)
- State transitions audit-logged via `workflow_transitions` (entity-agnostic)
- Drizzle migrations: `db:push` against production DATABASE_URL secret (admin retains migration authority)
- API routes: server component + colocated `route.test.ts` Vitest TDD
- Schema lives in `packages/triarch-shared/src/schema.ts` — admin re-exports via shim
- Atomic state changes use `UPDATE ... WHERE current_state = X` pattern (release_logs.promotion_dispatched_at precedent from Phase 9)
- Inclusion pill color tokens: violet/teal/blue/zinc match existing v2.1 release/branch/type pill palette

### Integration Points
- Schema additions land in `packages/triarch-shared/src/schema.ts` (triggers PKG-04 shared-package version bump gate)
- Admin nav under `src/app/admin/modules/` — new `next-build-plan/[slug]/page.tsx` follows existing module layout
- Portal at `~/claude/triarch/development/portal` — new `/projects/[slug]/upcoming/page.tsx` follows v2.2 Phase 23 customer-page pattern (membership-gated server component)
- Commit-parser extension extends `link-stamper.ts` post-link-write; no changes to `commit-parser.ts` pure-regex layer
- Prod-promote ingest transaction (releases/promoted/route.ts) gains the `built → deployed` flip statement before the release row UPDATE

</code_context>

<specifics>
## Specific Ideas

- Pilot scope is TMI only — admin UI and portal `/upcoming` page should still work for all projects (it's per-project membership-gated regardless), but expect TMI to be the only project with non-trivial `approved_for_build` rows in v2.4 dogfooding window
- Soft prescription, not hard gate, in v2.4 — committed code is never REJECTED for lacking `approved_for_build` ancestor (hard gate is v3.0 candidate per ROADMAP)
- Customer surface in v2.4 is STRICTLY read-only — no approve/reject mutation by customer (deferred to v3.0)
- Pre-existing `release_log_links` data must remain untouched — extending commit-parser must not regress 100% of v2.1 Phase 11 tests (success criterion explicit)

</specifics>

<deferred>
## Deferred Ideas

- Bulk "approve all" / "remove all from build" actions — defer to post-30-day-dogfooding review (low TMI item count makes it premature)
- Bug/feature typeahead picker in admin (pre-existing v2.1 limitation, explicit v2.4 out-of-scope)
- Customer-side `inclusion_state` mutation (approve/reject by customer) — explicit v2.4 out-of-scope, v3.0 candidate
- Hard inclusion gate (prod deploy refuses commits without `approved_for_build` ancestor) — v3.0 candidate per soft-vs-hard decision deferred to dogfooding review

</deferred>

<amendments>
## Post-Planning Amendments

**2026-05-18 (plan revision pass):**
- INCL-08 admin endpoint changed from `GET` to `POST` to enable HMAC-over-body signature verification (matches v2.2 Phase 22 WRITE-04 dispatch pattern). Path unchanged: `/api/portal/projects/{slug}/upcoming`. Portal POSTs a signed body `{intent: 'read_upcoming', projectKey, actorEmail, timestamp, nonce}`.
- Reason: HMAC integrity check requires a deterministic body to sign; GET-with-query-string signing was researched and rejected as more complex (signed-headers, timestamp, nonce as headers) for negligible spec benefit. The POST shape is also strictly aligned with the established v2.2 Phase 22 internal-call pattern.
- Affects: Plan 36-06 Task 2 (server endpoint), Plan 36-07 Task 2 (portal client fetcher already POSTs — confirmed aligned).
- INCL-08 spec line "GET /api/portal/projects/{slug}/upcoming" should be read as "the upcoming endpoint at that path"; method is POST per this amendment.

- Plan 36-07 ADMIN_PORTAL_API_URL env var was deferred — reuse the existing `ADMIN_INTERNAL_DISPATCH_URL` env var since both target the same admin host per CL-1 hostname target state (admin.triarch.dev / admin-dev.triarch.dev). Portal helper reads `process.env.ADMIN_INTERNAL_DISPATCH_URL` and appends `/api/portal/projects/{slug}/upcoming`. One less env var to bind in apphosting.yaml.

- Plan 36-05 "Reject" detail-page button DROPPED. No INCL requirement covers a manual `pending_inclusion → rejected` transition. The v2.4 customer surface is strictly read-only and no staff workflow requires a Reject action — that's a v3.0 candidate alongside the customer approval surface. Detail-page primary actions are now: Propose for next build (triaged→pending_inclusion), Approve for build (pending_inclusion→approved_for_build), Defer (pending_inclusion→deferred), Remove from build (approved_for_build→pending_inclusion). State-machine `MANUAL_TRANSITIONS.pending_inclusion` updated to `['approved_for_build', 'deferred']` (removed 'rejected') in Plan 36-01 to match.
</amendments>
