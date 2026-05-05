---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: Multi-Branch RC + Central Vault + OttoBot Brain
status: executing
stopped_at: "Completed 07.5-01-PLAN.md: scripts/provision-dev-dbs.sql created (ENV-01 code deliverable)"
last_updated: "2026-05-05T19:25:32.069Z"
progress:
  total_phases: 9
  completed_phases: 6
  total_plans: 37
  completed_plans: 32
---

# Triarch Dev Admin — Project State

## Project Reference

See: `.planning/PROJECT.md` (last updated 2026-05-04 — v2.0 milestone started)

**Core value:** One control plane to create, manage, and ship Triarch projects — including a dev-to-prod gating workflow that lets customers approve releases before they go live.
**Current focus:** Phase 07.5 — Dev Cluster + Admin Dev Backend

## Current Position

Phase: 07.5 (Dev Cluster + Admin Dev Backend) — EXECUTING
Plan: 2 of 5

## Active Milestone: v2.0 — Multi-Branch RC + Central Vault + OttoBot Brain

**Goal:** Three intertwined initiatives — multi-branch parallel RCs with auto-rebase-and-merge promotion, central credential vault on GCP Secret Manager, OttoBot dispatcher hardening with expanded Slack scopes.
**Phases:** 8 (reset to Phase 1 for v2.0)
**Requirements:** 31 mapped (VAULT ×7, SCHEMA ×3, WORKFLOW ×5, RC ×8, OTTOBOT ×6, PILOT ×2)
**Status:** Ready to execute

## Performance Metrics

**Velocity:**

- Total plans completed: 0 (v2.0 start)
- Average duration: — (no data yet)
- Total execution time: —

*Updated after each plan completion*

## Accumulated Context

### Decisions

Active decisions from v1.14.0 that carry forward into v2.0:

- [v1.14 Phase 04]: promoteAndAudit fire-and-forget dispatch pattern (Slack 3-sec rule) — v2.0 Phase 6 extends same pattern
- [v1.14 Phase 03]: Per-project Bearer auth on `/api/releases/promoted` — Phase 2 shared-workflows must include token
- [v1.14 Phase 04]: apphosting.yaml RUNTIME-only (no availability field) for secrets — vault migration must follow same pattern
- [v1.14 Phase 05]: YAML field case distinction: ci-cd.yml camelCase / deploy-prod.yml snake_case — Phase 2 must respect both conventions
- [Phase 03]: Three verification options in SCHEMA-03 runbook (existing workflow / one-shot / direct API) — Option A recommended; avoids Option B overhead when write-capable workflow already exists
- [Phase 03-01]: branch column left nullable (no .notNull()) to match v1.14 env/status precedent; DEFAULT handles new inserts, backfill UPDATE handles legacy rows
- [Phase 03-01]: DB push deferred to Mike post-merge — DATABASE_URL is Firebase App Hosting secret; same precedent as v1.14 Phase 02-01/04-01
- [Phase 03]: actor_email nullable in slack_action_audit — unmapped Slack users have null email; actor_slack_id always present
- [Phase 03]: No relations() block for slackActionAudit — audit logs are immutable standalone; no FK to any other table
- [Phase 02-02]: All ${{ }} expressions moved to env: blocks in run: steps — required for actionlint/shellcheck compliance; standard pattern for shared-workflows steps
- [Phase 02-02]: snake_case payload enforced (commit_sha, deployed_at, deployed_by) in deploy-prod.yml — /api/releases/promoted requires snake_case (different from dev endpoint camelCase)
- [Phase 02-01]: previewUrl stored in metadata JSONB (not new column) — keeps Phase 2 schema-free per D-13
- [Phase 02-01]: Two mutually-exclusive FAH deploy steps in deploy-firebase.yml: main vs branch-preview, driven by git_branch input
- [Phase 02-03]: v2 tag moved from merge commit to fix commit after canary exposed version extraction bug — acceptable since v2 had no consumers at initial tag time
- [Phase 02-03]: branch column added via ALTER TABLE (not drizzle-kit push) because drizzle-kit hung on CockroachDB — direct SQL is reliable fallback for schema changes
- [Phase 02-03]: notify.yml@v1 coexists with deploy-firebase.yml@v2 with no conflicts — confirmed by admin canary; CRM can safely bump deploy ref without touching notify ref
- [Phase 02-shared-workflows-hardening]: CRDB projects table uses api_key (snake_case) not apiKey — raw SQL must use api_key; Drizzle maps to apiKey in TypeScript
- [Phase 02-shared-workflows-hardening]: CRM flush-changelog (legacy RELEASE_LOGS_API_URL) coexists with WORKFLOW-01 deploy-firebase@v2 callback — two separate release_logs rows per deploy
- [Phase 02-shared-workflows-hardening]: CRM version.ts (v-prefixed literal) is out of sync with package.json — separate CRM ops concern; WORKFLOW-01 callback works correctly with whichever version is extracted
- [Phase 04-01]: No CHECK constraint on result in promote_attempts — runtime validation in route handler, consistent with Phase 3 slack_action_audit pattern
- [Phase 04-01]: No relations() block for promoteAttempts — audit logs are immutable standalone; no FK to any other table (mirrors slackActionAudit decision)
- [Phase 04-01]: db:push for migration 0012 deferred to Mike pre-Plan 04-04 UAT — DATABASE_URL is Firebase App Hosting secret; same precedent as Phase 03-01
- [Phase 04]: promote-branch.yml inlines CI (npm ci + build + vitest) — nested workflow_call impossible per GitHub Actions architectural limitation; captures conflict files BEFORE git rebase --abort
- [Phase 04]: result validation uses VALID_RESULTS array (no CHECK constraint) — consistent with Phase 3 pattern
- [Phase 04]: conflict_files defaults to [] (not null) when wire payload omits it — matches jsonb DEFAULT column default
- [Phase 05-01]: environmentMatchGlobs over workspace config — simpler single-file approach for jsdom/node env split
- [Phase 05-01]: vitest.setup.ts at repo root imports jest-dom matchers — required for toBeDisabled/toHaveAttribute in Wave 0 stubs
- [Phase 05-02]: Transitional stub in ReleasesClient flattens initialSections to preserve flat table render until Plan 05-04 accordion UI lands
- [Phase 05-02]: conflict auto-clear (D-16) implemented in groupIntoSections pure helper — reused server+client
- [Phase 05-customer-page-rc-ui]: vitest 4.x silently ignores environmentMatchGlobs — replaced with environment: jsdom as default; all tsx test files in [slug] directory now get jsdom correctly
- [Phase Phase 05-04]: renderExpandedPanel callback pattern keeps all per-row mutable state in ReleasesClient while BranchSection handles structural render
- [Phase Phase 05-04]: RTL v16 auto-cleanup requires afterEach global; vitest uses explicit imports — vitest.setup.ts registers afterEach(cleanup) explicitly
- [Phase 05-05]: Idle Approve aria-label simplified to 'Approve for Production' — prior value had version in middle of string, breaking /approve for production/i regex used by RC-03 test
- [Phase 05-05]: BranchSection <tr> rows get aria-label='Release {id}' — enables unique row identification when both sections expanded with same version string (RC-03 test requirement)
- [Phase 06-01]: D-01/D-02: workflowFile='promote-branch.yml', inputs={branch: release.branch ?? 'main'} — tag input removed
- [Phase 06-01]: D-08/D-09: sql jsonb_set COALESCE merge writes metadata.dispatch.{slackChannelId,slackMessageTs,dispatchedAt} without destroying metadata.previewUrl (Pitfall 1 guard)
- [Phase 06-02]: Option A (RESEARCH §2): signPayload unchanged — branch travels through DB row, not Slack button value
- [Phase 06-02]: null branch falls back to literal 'main' via branchDisplay = input.branch ?? 'main'
- [Phase 06]: buildPromoteReplyText exported at module scope; release lookup runs AFTER insert (promote_attempts is source of truth per D-15)
- [Phase 06]: Per-transaction closure mock in release-concurrent.test.ts: each db.transaction() invocation gets isolated localInsertValues array, proving no cross-contamination across parallel Promise.all calls
- [Phase 07]: Wave 0 uses dynamic import (await import()) for production modules in RED tests — defers resolution so tests fail with 'Failed to resolve import' at runtime rather than crashing at parse time
- [Phase 07]: redirectMock typed with explicit _url param in page.test.tsx to satisfy TypeScript (vi.fn infers () => never without parameter)
- [Phase 07-02]: void recordSlackAudit() placed directly before each return (not try/finally) — mechanical insertion avoids reshaping handler and eliminates regression risk
- [Phase 07]: status subcommand open to all callers (ephemeral, bounded risk) — avoids project_members DB roundtrip per command
- [Phase 07]: slack-status.ts extracted as shared module — fetchProjectStatus + buildStatusBlocks consumed by both /commands and /events (plan 07-04)
- [Phase 07]: url_verification bypasses HMAC entirely — Slack sends it before signing relationship exists (D-19)
- [Phase 07]: Dedup short-circuits BEFORE recordSlackAudit — duplicate events must not write duplicate audit rows
- [Phase 07-05]: Pitfall 7 mitigation: ilike only when emailFilter.trim() non-empty to avoid excluding null-email rows
- [Phase 07-05]: router.push (not replace) for URL mirroring — matches pushMock test expectation
- [Phase 07-06]: AdminSidebar is DB-driven: nav entry added via SQL INSERT not component edit (RESEARCH §10 + Pitfall 10)
- [Phase 07-06]: SLACK_BOT_TOKEN does NOT need rotation on workspace reinstall unless Slack issues a new token (CONTEXT D-22)
- [Phase 07.5-01]: No GRANT statements in provision-dev-dbs.sql (D-07): default admin role on dev cluster; per-DB roles deferred to v3

### Pending Todos

None yet.

### Blockers/Concerns

- VAULT-05 and VAULT-06 require deploying to two separate Firebase projects (triarch-dev admin + triarchsecurity-admin CRM) — coordinate deploy order with Phase 1 plan
- SCHEMA-03 (GitHub App permission upgrade) requires manual re-authorization in GitHub — human action required; plan must include runbook step
- WORKFLOW-01/02 (shared-workflows cross-repo changes) require pushing to MyAlterLego/shared-workflows repo — different repo from triarch-dev; plan must note this

## Session Continuity

Last session: 2026-05-05T19:25:32.067Z
Stopped at: Completed 07.5-01-PLAN.md: scripts/provision-dev-dbs.sql created (ENV-01 code deliverable)
Resume file: None
