# Phase 10: Schema Gate - Context

**Gathered:** 2026-05-08
**Status:** Ready for planning (infrastructure phase — minimal context)

<domain>
## Phase Boundary

One isolated Drizzle migration that lands the schema changes Phases 11–13 require — `release_log_links` join table (with FK indexes) for tracker linkage, and `projects.preview_branch_locked` + `preview_branch_locked_at` columns for branch swap concurrency lock. No application logic; pure schema + verification.

**Delivers:** LINK-01, PREV-01.
**Does NOT deliver:** any code that consumes the new schema (Phase 11–13 territory).

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion

All implementation choices are at Claude's discretion — pure infrastructure phase. Constraints from research/synthesis that must be honored:

- `release_log_links` schema: columns `id` (uuid pk), `release_id` (uuid fk → release_logs), `link_type` (varchar — values: `bug` / `feature` / `external`), `bug_id` (uuid fk → bug_reports, nullable), `feature_id` (uuid fk → feature_requests, nullable), `source` (varchar — `commit` / `manual`), `external_url` (text, nullable, for `link_type='external'`), `created_at` (timestamptz default now)
- FK indexes on `release_id`, `bug_id`, `feature_id` (each separately, for fast lookup in either direction)
- CHECK constraint or app-level validation: when `link_type='bug'`, `bug_id` must be non-null and `feature_id` null; when `link_type='feature'`, `feature_id` non-null and `bug_id` null; when `link_type='external'`, `external_url` non-null and both bug/feature null. Implement as a multi-statement CHECK or via upstream enforcement — Claude picks.
- `projects.preview_branch_locked` (text, nullable) — branch name currently being deployed to dev backend
- `projects.preview_branch_locked_at` (timestamptz, nullable) — when lock was acquired (for stale-lock cleanup; 8-min timeout is route-side logic, not DB)
- Drizzle schema in `src/db/schema.ts` updated with: new `releaseLogLinks` table export, new `releaseLogLinksRelations` relations declaration, two new columns on the `projects` table
- Migration generated via `drizzle-kit generate`; SQL file numbered consecutively (likely 0016 since 0014 + 0015 already shipped in Phase 9)
- Verification: `drizzle-kit check` reports no drift; `tsc --noEmit` passes; types are properly inferred when read in tests

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/db/schema.ts` — existing Drizzle schema with `releaseLogs`, `bugReports`, `featureRequests`, `projects`, established relations() pattern
- Existing migrations 0001..0015 in `src/db/migrations/` — `meta/_journal.json` tracks the sequence
- `src/lib/db.ts` — pg.Pool client (no changes needed for this phase)

### Established Patterns
- All FK columns use uuid type with `references(() => parentTable.id)` declaration
- `created_at`/`updated_at` use `timestamp({ withTimezone: true }).notNull().defaultNow()`
- Indexes declared in second-arg array of `pgTable()` (matches Phase 8 + 9 pattern)
- Relations declared via separate `relations()` calls below the table definitions
- Migrations applied to dev cluster CRDB via `cockroach sql --url <DATABASE_URL_DEV> -f <file>` (canonical pattern from Phase 7.5 work)

### Integration Points
- This phase only modifies `src/db/schema.ts`, `src/db/migrations/0016_*.sql`, `src/db/migrations/meta/0016_snapshot.json`, `src/db/migrations/meta/_journal.json`
- No application code touched
- Phase 11 (commit parser) reads from this schema; Phase 13 (branch swap) reads from this schema

</code_context>

<specifics>
## Specific Ideas

No specific requirements — infrastructure phase. Two design notes:

- The CHECK constraint approach: CockroachDB supports CHECK constraints; prefer DB-level enforcement over Drizzle-level for cross-row consistency. If CHECK syntax is awkward across the multi-discriminant case, fall back to app-level validation in Phase 11 — but this phase should still attempt DB-level first.
- `preview_branch_locked` column type is `text` (not `varchar(N)`) — branch names can be long (`feature/long-descriptive-name-here-xyz`), no need to bound

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>
