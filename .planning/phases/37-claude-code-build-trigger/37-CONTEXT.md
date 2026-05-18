# Phase 37: Claude Code Build Trigger - Context

**Gathered:** 2026-05-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Bridge "build plan approved" → "Claude Code executing the build" with one click. Phase 37 ships: (1) a `src/lib/build-prompt.ts` generator producing GSD-compatible prompts from `approved_for_build` items; (2) a Generate Build button on the Phase 36 `/admin/modules/next-build-plan/{slug}` page; (3) two trigger modes — clipboard (Mode A) and `claude-code://` deep-link (Mode B); (4) a per-project preference column `projects.build_trigger_mode` with three values (`local_claude` / `managed_agent` / `manual`); (5) audit logging via a new `approval_events` table (NOT the assumed pre-existing one — discovered during smart discuss); (6) supporting NEW `projects.local_path` column for deep-link `cwd`. Maps requirements TRIG-01..06.

</domain>

<decisions>
## Implementation Decisions

### Audit Table for Build Triggers (NEW finding)
- TRIG-06's assumed "existing `approval_events` table from v2.x" does NOT exist — closest matches are `release_approvals` (release-scoped) and `slack_action_audit` (Slack-only). Plan must CREATE the table.
- Schema: `approval_events(id uuid PK, subject_type varchar(32), subject_id varchar(128), decision varchar(32), surface varchar(16), actor_email varchar(256), comment text NULL, metadata jsonb DEFAULT '{}', project varchar(64), created_at timestamptz DEFAULT now())`
- Entity-agnostic on purpose — ready for v3.0 customer approval surface and other future event sources
- Lives in shared package `packages/triarch-shared/src/schema.ts` → bumps shared 0.5.0 → 0.6.0 (PKG-04 gate)
- Indexes: `(subject_type, subject_id, created_at desc)` for entity history, `(project, created_at desc)` for project timeline

### Build Prompt Generator (TRIG-01)
- Format: Markdown with YAML frontmatter (`project`, `version`, `items`) + sections: Context / Approved Items / Approach / Guardrails
- Per-item structure: `id` (REQ-ID + uuid) + `type` + `title` + `description` (full) + `acceptance_criteria` (from `build_plan` jsonb if present, else bullet from description) — matches `/gsd:plan-phase` input contract
- Project context: compact — `project` name + `currentVersion` + `githubRepo` URL + `deployedUrl` + reference to `./CLAUDE.md` (do NOT inline content; Claude Code reads it fresh in the new session)
- Approach + Guardrails: fixed boilerplate appended to every prompt — "Run `/gsd:plan-phase NEXT`" + "Do NOT exceed scope of listed items" + "Use existing patterns" + "Bump version + open PR per CLAUDE.md"

### Trigger UX + Deep-Link Mechanics
- Generate Build button placement: top-right of next-build-plan page, sticky in header area; disabled when 0 approved items with tooltip explaining why; primary violet styling matching existing buttons
- Click handler opens a MODAL showing the generated prompt preview + 2 action buttons (Copy / Open in Claude Code) per chosen mode — modal previews avoid accidental-click surprise
- `cwd` for deep-link comes from a NEW `projects.local_path` column (varchar(512), nullable) — staff sets it per-project on the project admin page. When null, deep-link omits `cwd` param and Claude Code opens in its last-used directory
- Deep-link fallback if scheme not registered: toast "Couldn't open Claude Code — copy prompt manually below" + auto-fallback to clipboard mode + show prompt in textarea. No silent failure.

### Per-Project Preference (TRIG-05)
- `projects.build_trigger_mode` varchar(32) with CHECK constraint `('local_claude','managed_agent','manual')`, default `'local_claude'`. Same pattern as Phase 36 `inclusion_state`.
- UI editor: new section on existing project edit/admin page; radio-group with 3 options + helper text per mode
- `manual` mode behavior: Generate Build modal shows ONLY Copy button (deep-link hidden). Same as Mode A. For staff who want to manually paste into any session/IDE.
- `managed_agent` mode behavior: button DISABLED with tooltip "Managed Agent variant ships in v2.5" (Phase 38 RFC produces design; v2.5 implements). Placeholder ensures the mode is selectable but the UI shows it's not yet wired.
- `local_claude` mode behavior: shows both Copy + Open buttons; deep-link is the primary action.

### Claude's Discretion
- Modal component library/pattern (likely existing v2.1 modal pattern or shadcn dialog)
- Toast notification approach (existing pattern in admin)
- Specific copy text for tooltips and helper labels
- Test file organization for new components
- Whether to extract a `BuildTriggerButton` component or inline in next-build-plan client
- Migration ordering — single migration with both new tables + columns vs split

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/app/admin/modules/next-build-plan/[slug]/NextBuildPlanClient.tsx` — Phase 36 client component; Generate Build button extends this
- `src/app/admin/modules/next-build-plan/[slug]/page.tsx` — Phase 36 server component; loads approved_for_build items
- `packages/triarch-shared/src/schema.ts` — projects table (line 17); add `build_trigger_mode` + `local_path` columns + new `approval_events` table here
- `src/lib/inclusion-state.ts` — pattern reference for varchar+CHECK state-machine validator (mirrors `build_trigger_mode`)
- `featureRequests.buildPlan` jsonb column (existing) — read by build-prompt.ts for acceptance_criteria
- `slack_action_audit` table — reference pattern for new approval_events (audit table with project + entity refs)
- Phase 36 migration 0020 — pattern for hand-written DDL with CHECK constraints + partial indexes

### Established Patterns
- Status/enum-like columns: `varchar(32)` with DB CHECK (release_logs.status, bug_reports.status, bug_reports.inclusion_state)
- State-machine helper module pattern (src/lib/inclusion-state.ts) — pure functions + frozen transition map
- Schema in shared package → PKG-04 version bump → publish via `shared/v*` tag → admin re-pin + reinstall
- Drizzle migrations: hand-written when drizzle-kit can't see workspace package; apply via direct node-pg DDL when push hangs
- Vitest test colocation; --no-verify on parallel-wave commits
- Modal pattern: check existing admin modules for prior modal usage (e.g., promotion confirm) — re-use rather than introduce new dependency

### Integration Points
- `/admin/modules/next-build-plan/[slug]` page — Generate Build button + modal extends NextBuildPlanClient.tsx
- Project admin page (likely `/admin/modules/projects/[slug]/edit` or similar) — `build_trigger_mode` + `local_path` editor section
- New API endpoint `POST /api/admin/projects/[slug]/generate-build` — returns generated prompt (server-side) + writes approval_events audit row
- Build prompt generator: pure function in `src/lib/build-prompt.ts` — no I/O, given (project, items) returns prompt string
- approval_events: shared schema → all consumers (admin + portal future) can read/write
- Visible in existing Slack audit page — admin's `/admin/modules/access-audit` or similar should surface `subject_type='build_trigger'` rows alongside slack_action_audit rows (TRIG-06 explicit)

</code_context>

<specifics>
## Specific Ideas

- Pilot scope is TMI only — but `build_trigger_mode` defaults to `local_claude` for ALL projects (back-compat: existing projects don't break)
- `local_path` is per-project — Mike likely uses `/Users/mikegeehan/claude/triarch/development/{project}` for most projects
- The deep-link URL format: `claude-code://open?prompt={url-encoded}&cwd={url-encoded}` — verify exact scheme matches Claude Code's URL handler (per CLAUDE.md Claude Code is "available as CLI in terminal, desktop app...")
- Generated prompt should be valid markdown that Claude Code can render in chat
- audit row's `comment` field stores prompt's first 200 chars (per TRIG-06 spec) — full prompt NOT persisted (privacy/size — staff can regenerate)
- v2.4 IS pilot for TMI — managed_agent mode is "selectable but disabled" not "hidden"; surface the mode in UI now so staff sees the v2.5 roadmap

</specifics>

<deferred>
## Deferred Ideas

- Managed Agent IMPLEMENTATION — Phase 38 produces RFC only; implementation in v2.5
- Customer-facing build trigger (customer initiates) — v3.0 candidate
- Per-user (instead of per-project) build_trigger_mode — Mi-feedback during plan revision if needed
- Slack-side build trigger (post a button in #releases channel) — v2.5 candidate
- AI-summarized acceptance criteria (LLM call to compress build_plan jsonb) — cost concern; defer
- Prompt template customization by staff — defer; fixed boilerplate is enough for v2.4

</deferred>
