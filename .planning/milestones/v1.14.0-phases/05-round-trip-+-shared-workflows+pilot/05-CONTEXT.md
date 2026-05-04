# Phase 5: Round-trip + shared-workflows + Pilot - Context

**Gathered:** 2026-05-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Close the loop on the v1.14 release-gating workflow. In the admin repo: build the prod-deploy ingest endpoint, the release timeline view, and the project onboarding runbook. Out of admin scope but tracked in 05-HUMAN-UAT: shared-workflows repo CI/CD changes, Truth+Treason pilot consumption, and the full end-to-end smoke test that exercises UI → Slack → GitHub App → round-trip together.

</domain>

<decisions>
## Implementation Decisions

### Promoted Ingest Endpoint (Area 1)
- **Auth**: Reuse `requireApiKey` from `src/lib/api-key-auth.ts` (per-project Bearer token via `projects.apiKey` column). Matches the existing `/api/platform/ingest/release-logs` exactly.
- **Idempotency**: If a `release_logs` row already exists with `(project_id, version, env='prod')`, return 200 with the existing row — no double INSERT. Matches Phase 2's GATE-05 idempotency philosophy.
- **Atomic write**: `db.transaction()` — INSERT new prod row + UPDATE matching dev row's status to `promoted` atomically. Both writes succeed or both fail.
- **Required payload fields**: `version` (string, matches dev row), `commit_sha` (string), `deployed_at` (ISO string), `deployed_by` (CI actor email — typically the GitHub Actions bot or the workflow_dispatch initiator).

### Release Timeline View (Area 2)
- **Location**: Inside the existing expandable row on `/projects/{slug}/releases` — adds a "Timeline" subsection above the feedback list. Reuses Phase 2's expansion pattern. NOT a separate detail page (deferred from Phase 2 stays deferred).
- **Events shown**: `deployed-to-dev` → all feedback (chronological inline) → `approved` → `promoted-to-prod` (when promotion_dispatched_at is set) → `deployed-to-prod` (when paired prod row exists with status=promoted). Matches success criterion #3 verbatim.
- **Each event displays**: Title (e.g. "Deployed to dev") + relative timestamp ("2h ago", absolute on hover) + actor email. Audit context preserved.
- **Visual treatment**: Vertical timeline with lucide icons per event type — `GitCommit` (deployed-to-dev), `MessageSquare` (feedback), `ShieldCheck` (approved), `Rocket` (promoted), `Server` (deployed-to-prod). Matches the mid-tech aesthetic of Phase 2 UI-SPEC. Reuses zinc/teal/red color tokens.

### Cross-Repo Work (Area 3 — handled via 05-HUMAN-UAT)
- **shared-workflows changes**: Documented in `05-HUMAN-UAT.md` with exact YAML snippets for the two POST steps. Mike runs in a separate session (likely `/gsd:autonomous` in the `MyAlterLego/shared-workflows` repo, or hand-coded). Not attempted in admin session.
- **Truth+Treason consumption**: HUMAN-UAT step. Mike bumps the `shared-workflows` ref in T+T's deploy job after the workflow changes ship. First dev deploy of T+T tests the full pipeline.
- **End-to-end smoke test (criterion #6)**: HUMAN-UAT. Mike approves a real T+T release end-to-end — UI click → Slack message → Slack button click → GitHub App dispatch → workflow run → round-trip POST → timeline reflects all 5 events with correct timestamps + actors.

### Onboarding Runbook + Plan Structure (Area 4)
- **Runbook content (criterion #7)**: Concrete actionable checklist:
  1. Create project in `/admin/modules/projects` (provision DB, DNS, repo via existing platform tools)
  2. Add staff members to `project_members` with `admin` or `viewer` role
  3. Bump `shared-workflows` ref in the new repo's `.github/workflows/ci-cd.yml` and `deploy-prod.yml`
  4. Verify webhook fires on next push to dev (release_logs row created)
  5. Verify dev release appears at `/projects/{slug}/releases`
  6. Test full approve flow: customer admin approves on customer page → Slack message in `#release-approvals` → staff clicks Promote → workflow_dispatch fires → prod release row appears → timeline complete
- **Runbook location**: Both `.planning/phases/05-.../ONBOARDING-RUNBOOK.md` (planning archive) AND `docs/onboarding-projects.md` (canonical reference, linkable from CLAUDE.md).
- **Phase 5 plans**: 4 plans:
  - 05-01 (Wave 1): Promoted ingest endpoint + Vitest suite
  - 05-02 (Wave 1, parallel with 05-01): Release timeline view component + integration into ReleasesClient
  - 05-03 (Wave 2): Onboarding runbook docs (both locations) + CLAUDE.md update
  - 05-04 (Wave 2): Consolidated 05-HUMAN-UAT.md covering all cross-repo + pilot E2E + all deferred prior-phase HUMAN-UATs in one master checklist
- **UI gate**: Skipped. Timeline component reuses Phase 2 UI-SPEC tokens and patterns — no new design territory.

### Claude's Discretion
- Exact timeline visual implementation details (line color, icon size, spacing) — match Phase 2 patterns
- Whether to extract a separate Timeline component or inline in ReleasesClient (default: separate — reusable if a detail page is added later)
- Vitest mocking strategy for the new ingest endpoint
- Exact CLAUDE.md update location for the onboarding-projects.md reference

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/api-key-auth.ts` — `requireApiKey(req)` helper. Phase 5's new endpoint reuses verbatim.
- `src/app/api/platform/ingest/release-logs/route.ts` — existing ingest pattern (auth + body parse + insert). Template for `/api/releases/promoted`.
- `src/app/projects/[slug]/releases/ReleasesClient.tsx` (Phase 2) — existing expandable row component. Phase 5 adds a Timeline subsection inside the expansion.
- `src/db/schema.ts` — `release_logs` table already supports `env: 'dev' | 'prod'` and `status: 'dev' | 'pending_approval' | 'approved' | 'rejected' | 'promoted'`. Phase 4 added `promotion_dispatched_at` + `promotion_dispatched_by`. No schema changes needed in Phase 5.
- Lucide icons (`lucide-react`) — already in deps.

### Established Patterns
- Per-project Bearer token auth via `projects.apiKey` column
- `db.transaction()` for atomic multi-table writes (Phase 2 + 4 pattern)
- Vitest 4.x with `@/` alias (Phase 3 setup)
- Component-local state in client components; server components for data fetch (Phase 2 pattern)
- Lucide icons keyed to status colors (Phase 2 STATUS_BADGE_COLORS pattern)

### Integration Points
- New POST endpoint: `src/app/api/releases/promoted/route.ts`
- Timeline component: `src/app/projects/[slug]/releases/Timeline.tsx` (new) — imported by ReleasesClient
- Onboarding doc: `docs/onboarding-projects.md` (new directory if not present)
- CLAUDE.md: add reference to onboarding-projects.md in the project-management section

</code_context>

<specifics>
## Specific Ideas

- The 05-HUMAN-UAT.md is the master checklist for v1.14 milestone closeout — consolidates Phase 2 DB push, Phase 3 Slack App creation, Phase 4 GitHub App creation, Phase 4 DB push, shared-workflows changes, T+T consumption, and the full E2E test in one document. References each prior-phase HUMAN-UAT.
- Timeline events are derived purely from existing data — no schema additions. Sort by event timestamp.
- Status `pending_approval` (defined in schema) isn't used in v1.14 (Phase 2 goes `dev → approved`/`rejected` directly). Skip rendering it in the timeline; remains available for future workflows.
- The release_logs `env='prod'` paired-row pattern means a single release version has TWO rows: one `dev` (status=`promoted` after promotion) and one `prod` (status=`promoted`, deployed_at set when GitHub Actions completes). Timeline events come from BOTH rows.

</specifics>

<deferred>
## Deferred Ideas

- **Per-release detail page** at `/projects/{slug}/releases/{id}` — Phase 2 deferred, Phase 5 also defers. Timeline lives in the expandable row.
- **Automated playwright E2E test** for the full pipeline — manual smoke test is the gate for v1.14
- **shared-workflows changes via cross-repo automation** — done manually in a separate session
- **Notification on prod deploy completion** — Slack message when paired prod row arrives (deferred to v1.15)
- **Email notifications for release lifecycle events** — out of scope
- **Multi-environment lifecycle** (staging, canary, etc.) — v1.14 is dev → prod only
- **Automated dependency bump for shared-workflows in pilot project** — manual ref bump is fine for v1.14

</deferred>

---

*Phase: 05-round-trip-+-shared-workflows+pilot*
*Context gathered: 2026-05-04 via smart_discuss (16 grey-area decisions, all accepted as-recommended)*
