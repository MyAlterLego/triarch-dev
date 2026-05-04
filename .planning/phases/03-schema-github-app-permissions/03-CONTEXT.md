# Phase 3: Schema + GitHub App Permissions - Context

**Gathered:** 2026-05-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Database and GitHub App configuration prerequisites for Phases 4 (promote-branch workflow) and 7 (OttoBot dispatcher hardening). No user-facing behavior in this phase — purely a foundation update. Three discrete units of work: a column add, a new table with index, and a one-time GitHub App permission upgrade.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion

All implementation choices are at Claude's discretion — pure infrastructure phase. Standard patterns apply:

- **Migrations**: Use Drizzle Kit `db:generate` per existing convention (Phase 02-01 of v1.14, migration 0008; Phase 04-01, migration 0009 — this phase produces 0010 and 0011)
- **Backfill strategy for `release_logs.branch`**: All existing rows get `branch = 'main'` since v1.14 only tracked single-branch flow. New rows from v1.14's ingest endpoint default to `'main'` until shared-workflows (Phase 2) starts passing branch context
- **`slack_action_audit` columns**: Match the registry pattern — capture both `actor_email` (resolved via SLACK_USER_MAP) AND `actor_slack_id` (raw); for unmapped users, `actor_email` is null but `actor_slack_id` is always present
- **DB push convention**: Same pattern as v1.14 (npm run db:generate → migration committed → Mike applies via `npm run db:push` against prod DATABASE_URL post-merge); apply locally is not feasible since `DATABASE_URL` is a Firebase App Hosting secret
- **GitHub App permission upgrade (SCHEMA-03)**: Human action — Mike navigates to App settings, toggles `contents` from `read` to `read & write`, accepts the installation re-authorization. Plan emits a HUMAN-UAT step rather than attempting automation

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/db/schema.ts` — existing Drizzle schema with `releaseLogs`, `releaseFeedback`, `releaseApprovals`, `releaseLogsRelations`. Add `branch` column to `releaseLogs`; add new `slackActionAudit` table.
- `src/db/migrations/0009_promotion_dispatch_audit.sql` — most recent migration (v1.14 Phase 4). New migrations: 0010 for branch column + 0011 for audit table.
- `src/lib/github-app.ts` — JWT signer + token cache + dispatchWorkflow. Already uses Bearer token pattern; the `contents:write` permission upgrade affects what API calls succeed but does not change the helper's interface.
- v1.14 SCHEMA pattern: column add via Drizzle, generate migration, commit migration file + meta journal, defer DB push to Mike post-merge.

### Established Patterns
- Drizzle ORM for schema definitions (camelCase TypeScript names, snake_case database columns)
- `pgTable` factory with explicit column types, nullable defaults, indexes
- Migration files committed alongside schema.ts changes
- Index naming: `<table>_<column>_idx` (e.g. `slack_action_audit_created_at_idx`)
- Foreign keys with `onDelete: 'cascade'` for child tables (matches release_feedback / release_approvals pattern)

### Integration Points
- `release_logs` table — new `branch` column queried by Phase 5 (customer page RC grouping) and written by Phase 6 (promoteAndAudit branch dispatch)
- `slack_action_audit` table — written by `/api/slack/interact` dispatcher (Phase 7 OTTOBOT-01); queried by `/admin/platform/slack-audit` viewer (Phase 7 OTTOBOT-06)
- GitHub App permission upgrade — consumed by Phase 4 `promote-branch.yml` workflow which executes `git push origin main` after rebase; without `contents:write` the push 403s

</code_context>

<specifics>
## Specific Ideas

- Mirror Phase 04-01's pattern exactly for migration generation (no DB push attempt; defer to Mike with a HUMAN-UAT step in the plan)
- For `slack_action_audit`, include `payload_hash` column (hex string) instead of storing full payload — keeps row size bounded for high-volume action_ids
- `latency_ms` column type: `integer` (not bigint) — Slack 3-second rule means values are always < 3000ms

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 03-schema-github-app-permissions*
*Context gathered: 2026-05-04 via smart_discuss (infrastructure-only fast path)*
