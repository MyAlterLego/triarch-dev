# Phase 11: Commit Parser and Tracker Linkage Authoring - Context

**Gathered:** 2026-05-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Auto-stamp bug/feature linkages onto release ingests by parsing commit messages. Add a manual override UI in `/admin/modules/release-logs` so staff can add or remove links per release entry. Sanitize commit content to prevent Slack mrkdwn injection.

**Delivers:** LINK-02, LINK-03, LINK-04, LINK-07.
**Does NOT deliver:** "Released in" badges on bug/feature detail pages (Phase 12), customer page filtering (Phase 14).

</domain>

<decisions>
## Implementation Decisions

### Commit Message Parser (LINK-02)

- **Regex patterns** (case-insensitive, word-boundary anchored to avoid partial-string matches):
  - Bug ID: `\b#?BUG-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b` (UUID format) AND `\b(?:fixes|closes|resolves)\s+#BUG-([0-9a-f-]{36})\b`
  - Feature ID: `\b#?FEAT-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b` AND `\b(?:closes|implements|adds)\s+#FEAT-([0-9a-f-]{36})\b`
  - Generic GitHub-issue style: `\b(?:fixes|closes|resolves)\s+#(\d+)\b` — these are matched but treated as ambiguous; need DB validation against both bug and feature tables
- **Module**: `src/lib/commit-parser.ts` exports `parseCommitRefs(message: string): Array<{type: 'bug'|'feature'|'unknown', id: string, source: 'commit'}>`
- **Validation (LINK-03)**: parser is regex-only; the `release_log_links` writer (`src/lib/link-stamper.ts` or co-located) validates each detected ID against `bug_reports.id` / `feature_requests.id` via `inArray` before INSERT — invalid IDs silently dropped
- For the generic `#N` GitHub-style: lookup against BOTH bug_reports and feature_requests; if found in exactly one, classify; if found in both or neither, drop
- **Performance**: parser is pure (no DB call); validation uses single `inArray` per release ingest (batched, not per-commit)

### Ingest Integration

- Hook into existing `POST /api/platform/ingest/release-logs` route (or its equivalent — the route that creates release_logs rows from CI). Determine the precise hook point at execution time.
- Run `parseCommitRefs(commitMessage)` for each entry's `commit_sha` lookup OR for entries that include the commit message inline (CI may already pass it)
- Write detected + validated links to `release_log_links` with `source='commit'`
- Failure mode: if parser/validator throws, log and continue — never block the release ingest. Linkage is best-effort.

### Manual Link Authoring UI (LINK-04)

- Surface in `/admin/modules/release-logs` — existing release-logs page already shows release rows with `entries[]` JSONB; extend each entry row with a "Links" column or expandable row footer
- **UI pattern**: each entry shows existing links as removable chips ("BUG-abc123 ×"); a "Link bug/feature" button opens a typeahead picker filtered to open bugs/features in this project
- **API routes** (new):
  - `GET /api/admin/release-logs/<id>/links` — returns the current links for a release_log row
  - `POST /api/admin/release-logs/<id>/links` — body `{ link_type, bug_id?, feature_id?, external_url? }`; staff-only; writes `release_log_links` row with `source='manual'`
  - `DELETE /api/admin/release-logs/<id>/links/<link_id>` — staff-only
- Client component handles add/remove with optimistic update + rollback on error; `revalidatePath('/admin/modules/release-logs')` from the routes ensures fresh server-rendered state on next nav

### Slack/Markdown Sanitization (LINK-07)

- New helper `src/lib/sanitize-commit.ts` exports `sanitizeForSlack(text: string): string` and `sanitizeForRender(text: string): string`
- `sanitizeForSlack` strips: `<!channel>`, `<!here>`, `<!everyone>`, `<@U...>` user mentions, RTL override chars (`U+202E`), zero-width chars (`U+200B`–`U+200D`, `U+FEFF`), and Slack `<...|...>` link control chars
- `sanitizeForRender` strips: same RTL/zero-width set, plus HTML angle brackets are encoded; safe for direct DOM insertion (though React's auto-escaping should already cover most cases — defense in depth)
- Apply at TWO chokepoints: (a) before any `notifyReleaseApproved` / `postSlackThreadedReply` / `postSlackChannelMessage` call that includes commit message content; (b) before any server component renders commit content from `release_logs.entries[]` or `release_log_links`
- Existing Slack notification code (`src/lib/slack-status.ts`, `notifyReleaseApproved`, etc.) updated to call `sanitizeForSlack` on any commit-derived strings

### Claude's Discretion

- Exact UI for manual link picker (modal vs popover) at Claude's discretion — match existing project patterns
- Whether to surface a "Auto-detected (commit)" vs "Manual" pill on each link chip — at Claude's discretion (recommended: yes, color-coded)
- Whether to backfill historical release_log entries via a one-shot script — DEFER to v2.1.x (LINK-08 in REQUIREMENTS.md)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/db/schema.ts` — `releaseLogLinks`, `releaseLogs`, `bugReports`, `featureRequests` tables (all in place after Phase 10)
- `src/lib/db.ts` — Drizzle pg.Pool client
- `src/lib/api-auth.ts` — `requireStaff` pattern for new admin routes
- `src/lib/github-app.ts` — `dispatchWorkflow` and the GitHub App auth helpers; if commit message fetching is needed, this is where to extend
- `src/app/admin/modules/release-logs/page.tsx` — existing release-logs UI; client component with releases list

### Established Patterns
- Drizzle `inArray` batched lookups (used in admin/page.tsx for project membership)
- `revalidatePath` from server actions/routes
- Vitest TDD pattern (RED commit, GREEN commit)

### Integration Points
- New: `src/lib/commit-parser.ts` + `src/lib/commit-parser.test.ts`
- New: `src/lib/link-stamper.ts` + `src/lib/link-stamper.test.ts`
- New: `src/lib/sanitize-commit.ts` + `src/lib/sanitize-commit.test.ts`
- New: `src/app/api/admin/release-logs/[id]/links/route.ts` (GET, POST)
- New: `src/app/api/admin/release-logs/[id]/links/[linkId]/route.ts` (DELETE)
- Modified: `src/app/api/platform/ingest/release-logs/route.ts` (call link-stamper after main INSERT)
- Modified: `src/app/admin/modules/release-logs/page.tsx` + new client island (add Links UI per entry)
- Modified: `src/lib/slack-status.ts`, `notifyReleaseApproved`, etc. (apply sanitizeForSlack)

</code_context>

<specifics>
## Specific Ideas

- The "ambiguous `#N` GitHub-style" pattern: since bug/feature IDs are UUIDs, plain `#123` cannot be a valid Triarch ID. These should be treated as external GitHub issue references — link_type='external' with external_url constructed from `projects.github_repo` + `/issues/{N}`
- Auto-detected vs manual distinction: `release_log_links.source` column values `'commit'` (auto) and `'manual'` (staff override) — use to drive the chip color (gradient blue for auto, gradient teal for manual)

</specifics>

<deferred>
## Deferred Ideas

- Historical backfill of past release_logs (LINK-08 in REQUIREMENTS.md — v2.1.x)
- Bulk link operations (link all entries in a release at once)
- Cross-project link visibility ("this bug shipped to project A, B, C") — LINK-09 deferred

</deferred>
