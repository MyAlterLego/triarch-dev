---
phase: 37-claude-code-build-trigger
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/triarch-shared/src/schema.ts
  - packages/triarch-shared/package.json
  - src/db/migrations/0021_build_trigger_and_approval_events.sql
  - src/db/migrations/meta/_journal.json
  - src/lib/build-trigger-mode.ts
  - src/lib/build-trigger-mode.test.ts
  - package.json
  - package-lock.json
autonomous: false
requirements: [TRIG-05, TRIG-06]
must_haves:
  truths:
    - "projects table has build_trigger_mode varchar(32) NOT NULL DEFAULT 'local_claude' with CHECK constraint ('local_claude','managed_agent','manual')"
    - "projects table has local_path varchar(512) NULLABLE (no constraint)"
    - "New approval_events table exists with columns: id uuid PK, subject_type varchar(32), subject_id varchar(128), decision varchar(32), surface varchar(16), actor_email varchar(256), comment text NULL, metadata jsonb DEFAULT '{}', project varchar(64), created_at timestamptz DEFAULT now()"
    - "approval_events has two indexes: (subject_type, subject_id, created_at DESC) for entity history, (project, created_at DESC) for project timeline"
    - "@triarchsecurity/triarch-shared v0.6.0 published to GitHub Packages and consumed by admin via npm install"
    - "src/lib/build-trigger-mode.ts exports BUILD_TRIGGER_MODES tuple, BuildTriggerMode type, and isValidBuildTriggerMode validator"
    - "PKG-04 drift gate passes on the PR (shared package version bumped in same commit as schema change)"
    - "DB CHECK constraint rejects any build_trigger_mode value not in the 3-value allowlist"
  artifacts:
    - path: "packages/triarch-shared/src/schema.ts"
      provides: "projects.buildTriggerMode + projects.localPath columns; new approvalEvents table export"
      contains: "approvalEvents"
    - path: "packages/triarch-shared/package.json"
      provides: "shared package version bump"
      contains: "\"version\": \"0.6.0\""
    - path: "src/db/migrations/0021_build_trigger_and_approval_events.sql"
      provides: "DDL: ALTER projects ADD COLUMN ×2 + CHECK constraint + CREATE TABLE approval_events + 2 indexes"
      contains: "approval_events"
    - path: "src/lib/build-trigger-mode.ts"
      provides: "Validator: BUILD_TRIGGER_MODES tuple + BuildTriggerMode type + isValidBuildTriggerMode helper"
      exports: ["BUILD_TRIGGER_MODES", "BuildTriggerMode", "isValidBuildTriggerMode"]
  key_links:
    - from: "packages/triarch-shared/src/schema.ts"
      to: "approval_events table"
      via: "pgTable('approval_events', ...) export"
      pattern: "pgTable\\('approval_events'"
    - from: "src/db/migrations/0021_build_trigger_and_approval_events.sql"
      to: "projects.build_trigger_mode CHECK constraint"
      via: "raw-SQL ADD CONSTRAINT append"
      pattern: "CHECK \\(build_trigger_mode IN"
    - from: "package.json"
      to: "@triarchsecurity/triarch-shared@^0.6.0"
      via: "npm dependency pin update"
      pattern: "@triarchsecurity/triarch-shared.*0\\.6"
---

<objective>
Land the shared package schema additions for Phase 37: (a) two new nullable-where-appropriate columns on `projects` — `build_trigger_mode` (varchar(32) NOT NULL default 'local_claude' with 3-value CHECK) and `local_path` (varchar(512) nullable), (b) one wholly new entity-agnostic table `approval_events` with 9 columns + 2 indexes, (c) bump `@triarchsecurity/triarch-shared` from 0.5.0 → 0.6.0, (d) publish via `shared/v0.6.0` tag, (e) re-install in admin, (f) generate the Drizzle migration with hand-appended CHECK constraint + indexes, (g) run `db:push` against prod cluster, and (h) ship `src/lib/build-trigger-mode.ts` validator. This plan is the Wave 1 dance that gates every other plan in Phase 37 — until the package publishes and admin re-installs, downstream plans cannot reference the new columns or table.

Purpose: Establish the trigger-mode primitive and the entity-agnostic audit table that Phase 37 depends on, while satisfying the PKG-04 drift gate via in-commit version bump.
Output: Migration applied to prod cluster, package@0.6.0 published, admin pinned to ^0.6.0, build-trigger-mode helper module ready for import by 37-03/04/05.
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/execute-plan.md
@~/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/37-claude-code-build-trigger/37-CONTEXT.md
@.planning/phases/36-inclusion-approval-state-machine/36-01-shared-schema-bump-PLAN.md
@.planning/phases/36-inclusion-approval-state-machine/36-01-shared-schema-bump-SUMMARY.md

# Source-of-truth references
@packages/triarch-shared/src/schema.ts
@packages/triarch-shared/package.json
@src/db/migrations/0020_inclusion_state.sql
@src/lib/inclusion-state.ts

<interfaces>
<!-- Key types and contracts executors will use. Extracted from codebase. -->

From packages/triarch-shared/src/schema.ts (line 17 — projects table being extended):
```typescript
export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: varchar('key', { length: 64 }).notNull(),
  name: varchar('name', { length: 256 }).notNull(),
  // ... 18+ existing columns ending at:
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('projects_key_idx').on(table.key),
]);
```

From packages/triarch-shared/src/schema.ts (line 394 — pattern for the new approvalEvents table; slackActionAudit shows the audit-table shape):
```typescript
export const slackActionAudit = pgTable('slack_action_audit', {
  id: uuid('id').primaryKey().defaultRandom(),
  actionId: varchar('action_id', { length: 128 }).notNull(),
  actorEmail: varchar('actor_email', { length: 256 }),
  // ...
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('slack_action_audit_created_at_idx').on(table.createdAt.desc()),
]);
```

From src/lib/inclusion-state.ts — pattern for the new build-trigger-mode validator (golden precedent):
```typescript
export const INCLUSION_STATES = ['triaged', ...] as const;
export type InclusionState = typeof INCLUSION_STATES[number];
```

The 3 allowed build_trigger_mode values (locked by CONTEXT.md TRIG-05):
`'local_claude', 'managed_agent', 'manual'`

The 9 approval_events columns (locked by CONTEXT.md Decisions block + TRIG-06):
- `id` uuid PK defaultRandom
- `subject_type` varchar(32) NOT NULL  (e.g. 'build_trigger', 'release_approval' in future)
- `subject_id` varchar(128) NOT NULL   (the project.id for build_trigger; entity id in general)
- `decision` varchar(32) NOT NULL       (e.g. 'triggered', 'approved', 'rejected')
- `surface` varchar(16) NOT NULL        (e.g. 'web', 'slack', 'api')
- `actor_email` varchar(256) NOT NULL
- `comment` text NULL                   (TRIG-06: first 200 chars of prompt for build_trigger)
- `metadata` jsonb NOT NULL default '{}'  (mode, item_count for build_trigger)
- `project` varchar(64) NOT NULL        (project.key for filtering)
- `created_at` timestamptz NOT NULL defaultNow
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add build_trigger_mode + local_path columns to projects + new approvalEvents table to shared schema and bump package to 0.6.0</name>
  <files>packages/triarch-shared/src/schema.ts, packages/triarch-shared/package.json</files>
  <read_first>
    - packages/triarch-shared/src/schema.ts (current projects table starts at line 17 ending around line 56; slackActionAudit at line 394 is the model for the new approvalEvents table shape)
    - packages/triarch-shared/package.json (current version 0.5.0)
    - .planning/phases/37-claude-code-build-trigger/37-CONTEXT.md (Decisions block — locked: 3 trigger modes, 9 approval_events columns, 2 indexes, varchar(512) local_path)
    - .planning/phases/36-inclusion-approval-state-machine/36-01-shared-schema-bump-PLAN.md (golden pattern for the in-commit version bump satisfying PKG-04)
  </read_first>
  <behavior>
    - Adding buildTriggerMode column to projects defaults to 'local_claude' on new rows (NOT NULL)
    - Adding localPath column to projects is NULLABLE (no default, no constraint)
    - New approvalEvents table exports with all 9 documented columns; subject_type/subject_id/decision/surface/actor_email/project are NOT NULL; comment is NULLABLE; metadata defaults to '{}'; created_at defaults to now()
    - approvalEvents declares two indexes via the table-builder callback: (subject_type, subject_id, created_at DESC) and (project, created_at DESC)
    - package.json version field strictly equals "0.6.0" (additive schema change = minor bump per Phase 36-01 precedent and CONTEXT D-Schema)
  </behavior>
  <action>
    Edit `packages/triarch-shared/src/schema.ts`:

    1. In the `projects` table definition (starts at line 17), AFTER the existing `previewBranchLockedAt:` column (line ~49) and BEFORE the `metadata:` column (line ~51), add EXACTLY these two columns:
    ```typescript
      // ── v2.4 Phase 37 TRIG-05: build trigger mode preference + local cwd ──
      buildTriggerMode: varchar('build_trigger_mode', { length: 32 }).notNull().default('local_claude'),
      localPath: varchar('local_path', { length: 512 }),
    ```

    2. AFTER the `slackActionAudit` table definition ends (line ~405) and BEFORE the `promoteAttempts` definition (line ~409), add the new `approvalEvents` table:
    ```typescript
    // ── v2.4 Phase 37 TRIG-06: entity-agnostic approval/decision audit ─
    // Created in 37-01 (was assumed pre-existing per TRIG-06 spec but discovered missing during smart discuss).
    // Entity-agnostic shape so v3.0 customer-approval surfaces + other future event sources can reuse.

    export const approvalEvents = pgTable('approval_events', {
      id: uuid('id').primaryKey().defaultRandom(),
      subjectType: varchar('subject_type', { length: 32 }).notNull(),       // e.g. 'build_trigger', 'release_approval' (future)
      subjectId: varchar('subject_id', { length: 128 }).notNull(),          // for build_trigger: project.id
      decision: varchar('decision', { length: 32 }).notNull(),              // e.g. 'triggered', 'approved', 'rejected'
      surface: varchar('surface', { length: 16 }).notNull(),                // e.g. 'web', 'slack', 'api'
      actorEmail: varchar('actor_email', { length: 256 }).notNull(),
      comment: text('comment'),                                              // for build_trigger: first 200 chars of generated prompt (TRIG-06)
      metadata: jsonb('metadata').notNull().default({}),                     // for build_trigger: informal shape `{ mode: string, item_count: number }` — expected but NOT enforced at DB or type layer (intentionally entity-agnostic; consumers self-document via approval_events.subjectType)
      project: varchar('project', { length: 64 }).notNull(),                 // project.key for filtering
      createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    }, (table) => [
      index('approval_events_subject_idx').on(table.subjectType, table.subjectId, table.createdAt.desc()),  // entity history
      index('approval_events_project_idx').on(table.project, table.createdAt.desc()),                       // project timeline
    ]);
    ```

    3. Edit `packages/triarch-shared/package.json`: change `"version": "0.5.0"` → `"version": "0.6.0"` (line 3). Additive schema change = minor bump per CONTEXT D-Schema and Phase 36-01 close precedent.

    4. Verify no other edits to schema.ts (do not touch other tables, do not reorder existing columns; do not edit slackActionAudit).
  </action>
  <verify>
    <automated>cd packages/triarch-shared &amp;&amp; npx tsc --build &amp;&amp; cd ../.. &amp;&amp; grep -c "buildTriggerMode" packages/triarch-shared/src/schema.ts &amp;&amp; grep -c "approvalEvents" packages/triarch-shared/src/schema.ts &amp;&amp; jq -r .version packages/triarch-shared/package.json</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "buildTriggerMode: varchar('build_trigger_mode', { length: 32 }).notNull().default('local_claude')" packages/triarch-shared/src/schema.ts` returns >= 1
    - `grep -c "localPath: varchar('local_path', { length: 512 })" packages/triarch-shared/src/schema.ts` returns >= 1
    - `grep -c "export const approvalEvents = pgTable('approval_events'" packages/triarch-shared/src/schema.ts` returns exactly 1
    - `grep -c "approval_events_subject_idx" packages/triarch-shared/src/schema.ts` returns exactly 1
    - `grep -c "approval_events_project_idx" packages/triarch-shared/src/schema.ts` returns exactly 1
    - `jq -r .version packages/triarch-shared/package.json` returns exactly `0.6.0`
    - `cd packages/triarch-shared && npx tsc --build` exits 0 (shared package compiles)
  </acceptance_criteria>
  <done>Shared schema has both new projects columns + the new approvalEvents table; package version bumped to 0.6.0; shared package TypeScript compiles.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Generate drizzle migration 0021_build_trigger_and_approval_events.sql with hand-appended CHECK constraint</name>
  <files>src/db/migrations/0021_build_trigger_and_approval_events.sql, src/db/migrations/meta/_journal.json</files>
  <read_first>
    - src/db/migrations/0020_inclusion_state.sql (canonical pattern for raw-SQL CHECK append + partial indexes after drizzle-generated DDL — golden Phase 36-01 precedent)
    - src/db/migrations/meta/_journal.json (drizzle-kit auto-updates this; verify after generate)
    - .planning/phases/37-claude-code-build-trigger/37-CONTEXT.md (locked: 3 trigger modes + 9 approval_events columns + 2 indexes)
    - packages/triarch-shared/src/schema.ts (the schema additions just made in Task 1 — drizzle-kit reads this to generate the SQL)
  </read_first>
  <behavior>
    - Migration file exists at src/db/migrations/0021_build_trigger_and_approval_events.sql (rename if drizzle-kit picks a different slug)
    - Migration contains 2× ALTER TABLE "projects" ADD COLUMN (build_trigger_mode + local_path)
    - Migration contains 1× CREATE TABLE "approval_events" with all 9 columns + defaults
    - Migration contains 1× CHECK constraint on projects.build_trigger_mode listing all 3 allowed values
    - Migration contains 2× CREATE INDEX on approval_events (subject + project timelines)
    - `_journal.json` updated by drizzle-kit to reference migration 0021
  </behavior>
  <action>
    **I-2 up-front note:** If `npx drizzle-kit generate` produces SQL that differs from the hand-coded example below (e.g., column order, type aliases like `text` vs `varchar`, default expression formatting like `'{}'::jsonb` vs `'{}'`), ACCEPT the drizzle-generated version verbatim and proceed — drizzle-kit is the source of truth for column DDL ordering. The hand-appended CHECK constraint (step 2) and the rename-to-canonical-slug (step 1 paragraph 2) are the only manual edits that override drizzle's output. The CHECK + indexes acceptance grep below pins behaviour, not exact column ordering.

    1. Run `npx drizzle-kit generate` to auto-generate the ALTER + CREATE TABLE statements. Drizzle will emit something like:
    ```sql
    ALTER TABLE "projects" ADD COLUMN "build_trigger_mode" varchar(32) DEFAULT 'local_claude' NOT NULL;--> statement-breakpoint
    ALTER TABLE "projects" ADD COLUMN "local_path" varchar(512);--> statement-breakpoint
    CREATE TABLE "approval_events" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "subject_type" varchar(32) NOT NULL,
      "subject_id" varchar(128) NOT NULL,
      "decision" varchar(32) NOT NULL,
      "surface" varchar(16) NOT NULL,
      "actor_email" varchar(256) NOT NULL,
      "comment" text,
      "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
      "project" varchar(64) NOT NULL,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL
    );--> statement-breakpoint
    CREATE INDEX "approval_events_subject_idx" ON "approval_events" ("subject_type","subject_id","created_at" DESC);--> statement-breakpoint
    CREATE INDEX "approval_events_project_idx" ON "approval_events" ("project","created_at" DESC);
    ```
    Verify the generated file is named `0021_*.sql`. If drizzle-kit picks a non-descriptive slug (e.g., `0021_silly_thing.sql`), RENAME the file to `0021_build_trigger_and_approval_events.sql` AND update the corresponding entry in `meta/_journal.json` to match.

    2. HAND-APPEND to the generated file (EXACT string — `--> statement-breakpoint` separates each statement):
    ```sql
    --> statement-breakpoint
    ALTER TABLE "projects" ADD CONSTRAINT "projects_build_trigger_mode_check"
      CHECK (build_trigger_mode IN ('local_claude', 'managed_agent', 'manual'));
    ```

    3. Pitfall 10 (CRDB CHECK validation on existing rows): NOT a risk here because column is being ADDED with DEFAULT 'local_claude' which always satisfies the CHECK. But order matters in the file — ADD COLUMN must come before ADD CONSTRAINT.

    4. Run `npx drizzle-kit check` — must exit 0 (validates migration ordering + journal integrity).

    5. DO NOT run `db:push` in this task — `db:push` happens in Task 4 after the package publishes. We want the file committed first.
  </action>
  <verify>
    <automated>npx drizzle-kit check &amp;&amp; ls src/db/migrations/0021_*.sql &amp;&amp; grep -c "build_trigger_mode IN" src/db/migrations/0021_*.sql &amp;&amp; grep -c "approval_events_subject_idx" src/db/migrations/0021_*.sql &amp;&amp; grep -c "approval_events_project_idx" src/db/migrations/0021_*.sql &amp;&amp; grep -c "CREATE TABLE \"approval_events\"" src/db/migrations/0021_*.sql</automated>
  </verify>
  <acceptance_criteria>
    - File `src/db/migrations/0021_build_trigger_and_approval_events.sql` exists (rename if drizzle-kit picked a different slug, AND update journal accordingly)
    - `grep -c "build_trigger_mode IN ('local_claude', 'managed_agent', 'manual')" src/db/migrations/0021_*.sql` returns exactly 1
    - `grep -c "CREATE TABLE \"approval_events\"" src/db/migrations/0021_*.sql` returns exactly 1
    - `grep -c "approval_events_subject_idx" src/db/migrations/0021_*.sql` returns exactly 1
    - `grep -c "approval_events_project_idx" src/db/migrations/0021_*.sql` returns exactly 1
    - `grep -c "local_path" src/db/migrations/0021_*.sql` returns >= 1
    - `npx drizzle-kit check` exits 0
    - `src/db/migrations/meta/_journal.json` references the new migration tag (grep for "0021" returns >=1 match)
  </acceptance_criteria>
  <done>Migration file committed-ready with 2 ADD COLUMNs, 1 CREATE TABLE, 1 CHECK (3 values), 2 indexes; drizzle-kit check passes; journal updated.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Create src/lib/build-trigger-mode.ts validator with Vitest tests (RED → GREEN)</name>
  <files>src/lib/build-trigger-mode.ts, src/lib/build-trigger-mode.test.ts</files>
  <read_first>
    - src/lib/inclusion-state.ts (golden pattern for tuple + type + validator — Phase 36-01 precedent)
    - src/lib/inclusion-state.test.ts (Vitest pattern for a pure-function module — describe/it structure)
    - .planning/phases/37-claude-code-build-trigger/37-CONTEXT.md (Decisions: 3 trigger modes locked — 'local_claude' default, 'managed_agent' disabled placeholder for v2.5, 'manual' copy-only)
  </read_first>
  <behavior>
    - Exported `BUILD_TRIGGER_MODES` is a readonly tuple containing exactly 3 strings in this order: 'local_claude', 'managed_agent', 'manual'
    - Exported `type BuildTriggerMode` = the union of those 3 string literals
    - Exported `isValidBuildTriggerMode(value: unknown): value is BuildTriggerMode` returns true iff value is one of the 3 allowed strings
    - Test: 'local_claude' → true
    - Test: 'managed_agent' → true
    - Test: 'manual' → true
    - Test: 'invalid_mode' → false
    - Test: '' → false
    - Test: null → false
    - Test: undefined → false
    - Test: 42 → false
    - Test: BUILD_TRIGGER_MODES has length 3 with values in canonical order
  </behavior>
  <action>
    1. WRITE TEST FIRST (RED): create `src/lib/build-trigger-mode.test.ts` matching the Vitest pattern in `src/lib/inclusion-state.test.ts` (describe/it; no DB mocks needed — pure function):
    ```typescript
    import { describe, it, expect } from 'vitest';
    import { BUILD_TRIGGER_MODES, isValidBuildTriggerMode, type BuildTriggerMode } from './build-trigger-mode';

    describe('BUILD_TRIGGER_MODES', () => {
      it('exports exactly 3 values in canonical order', () => {
        expect(BUILD_TRIGGER_MODES).toEqual(['local_claude', 'managed_agent', 'manual']);
      });
    });

    describe('isValidBuildTriggerMode', () => {
      it("'local_claude' = true", () => {
        expect(isValidBuildTriggerMode('local_claude')).toBe(true);
      });
      it("'managed_agent' = true", () => {
        expect(isValidBuildTriggerMode('managed_agent')).toBe(true);
      });
      it("'manual' = true", () => {
        expect(isValidBuildTriggerMode('manual')).toBe(true);
      });
      it("'invalid_mode' = false", () => {
        expect(isValidBuildTriggerMode('invalid_mode')).toBe(false);
      });
      it("'' = false", () => {
        expect(isValidBuildTriggerMode('')).toBe(false);
      });
      it('null = false', () => {
        expect(isValidBuildTriggerMode(null)).toBe(false);
      });
      it('undefined = false', () => {
        expect(isValidBuildTriggerMode(undefined)).toBe(false);
      });
      it('42 (number) = false', () => {
        expect(isValidBuildTriggerMode(42)).toBe(false);
      });

      it('narrows the type when true', () => {
        const v: unknown = 'local_claude';
        if (isValidBuildTriggerMode(v)) {
          // TypeScript should narrow v to BuildTriggerMode here.
          const _check: BuildTriggerMode = v;
          expect(_check).toBe('local_claude');
        }
      });
    });
    ```

    2. Run `npx vitest run src/lib/build-trigger-mode.test.ts` — MUST FAIL with "Cannot find module './build-trigger-mode'" (RED phase).

    3. WRITE IMPLEMENTATION (GREEN): create `src/lib/build-trigger-mode.ts`:
    ```typescript
    /**
     * build-trigger-mode.ts
     *
     * Validator for projects.build_trigger_mode. Phase 37 TRIG-05 — per-project preference for how
     * the "Generate build" button on /admin/modules/next-build-plan/{slug} behaves.
     *
     * CONTEXT.md Decisions:
     *   - 'local_claude' (DEFAULT): show Copy + Open buttons; deep-link is primary action
     *   - 'managed_agent': button DISABLED with tooltip "Managed Agent variant ships in v2.5" (Phase 38 RFC)
     *   - 'manual': show ONLY Copy button (deep-link hidden) for staff who paste into any session/IDE
     */

    export const BUILD_TRIGGER_MODES = ['local_claude', 'managed_agent', 'manual'] as const;

    export type BuildTriggerMode = typeof BUILD_TRIGGER_MODES[number];

    export function isValidBuildTriggerMode(value: unknown): value is BuildTriggerMode {
      return typeof value === 'string' && (BUILD_TRIGGER_MODES as readonly string[]).includes(value);
    }
    ```

    4. Run `npx vitest run src/lib/build-trigger-mode.test.ts` — MUST PASS (GREEN phase).
  </action>
  <verify>
    <automated>npx vitest run src/lib/build-trigger-mode.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - File `src/lib/build-trigger-mode.ts` exists and exports `BUILD_TRIGGER_MODES`, `BuildTriggerMode`, `isValidBuildTriggerMode`
    - File `src/lib/build-trigger-mode.test.ts` exists
    - `npx vitest run src/lib/build-trigger-mode.test.ts` reports 0 failures, >= 10 passing tests
    - `grep -c "^export const BUILD_TRIGGER_MODES = \[" src/lib/build-trigger-mode.ts` returns 1
    - `grep -c "'local_claude', 'managed_agent', 'manual'" src/lib/build-trigger-mode.ts` returns >= 1
    - `grep -c "value is BuildTriggerMode" src/lib/build-trigger-mode.ts` returns 1 (type predicate signature)
  </acceptance_criteria>
  <done>Pure-function validator shipped with full test coverage; downstream plans can import isValidBuildTriggerMode + BUILD_TRIGGER_MODES.</done>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 4: Human runs the publish + install dance (npm version → git tag → push → npm install → db:push)</name>
  <what-built>Schema additions + migration 0021 + build-trigger-mode helper are all ready in working tree on the feat/build-trigger branch. The publish dance requires human-only steps: tag push triggers the publish-shared.yml GitHub workflow which authenticates to GitHub Packages; admin npm install pulls from the private registry; db:push needs human confirmation against prod cluster.</what-built>
  <how-to-verify>
    ## Reversibility Map (W-6 — know when crossing a one-way door)

    | Step | Reversible? | How to roll back |
    |------|-------------|------------------|
    | 1. Commit schema + migration + helper | YES — git revert + delete commit | `git reset --hard HEAD~1` (before push); after push: `git revert <sha> && git push` |
    | 2. Tag + push shared/v0.6.0 | YES — local tag delete + remote tag delete | `git tag -d shared/v0.6.0 && git push origin :refs/tags/shared/v0.6.0` (ONLY if step 3 has not yet published) |
    | 3. npm publish via publish-shared.yml | **IRREVERSIBLE** — version 0.6.0 is burned forever on the registry | Cannot unpublish from GitHub Packages without escalation; must bump to 0.6.1 and re-publish if 0.6.0 is wrong. **This is the one-way door — verify steps 1-2 are correct BEFORE pushing the tag.** |
    | 4. Pin admin to ^0.6.0 + npm install | YES — revert package.json + package-lock.json | `git checkout HEAD -- package.json package-lock.json && npm install` (resolves back to 0.5.0) |
    | 5. db:push (apply migration to prod CRDB) | YES (manual) — write a reverse migration | Apply via psql: `ALTER TABLE projects DROP COLUMN build_trigger_mode; ALTER TABLE projects DROP COLUMN local_path; DROP TABLE approval_events;` (data loss for any approval_events rows — none expected pre-37-03) |
    | 6. information_schema verification | YES (read-only query) | n/a |
    | 7. Commit pin + lockfile + admin version bump | YES — revert + force-push (DO NOT if PR already in review) | `git revert <sha>` is the safe path post-push |
    | 8. Open PR against dev | YES — close PR + delete branch | `gh pr close <num> && git push origin --delete feat/build-trigger` |

    **One-way door:** Step 3 (npm publish). Once published, version 0.6.0 cannot be re-used for a different code state. If you discover after step 3 that step 1's schema is wrong, you must roll forward to 0.6.1 with a new commit + tag, NOT re-publish 0.6.0.

    ---

    Run these commands in sequence (each requires your human shell). Each sub-step includes per-step recovery guidance for the most common failure modes per the M-1 fix pattern from Phase 36-01 — the workflow IS atomic (publish → install → db:push must happen together), so splitting introduces inter-plan dependency risk worse than the single-checkpoint risk.

    1. **Commit the schema + migration + helper on the feat/build-trigger branch** (you're already on it — verify with `git branch --show-current`; should output `feat/build-trigger`):
       ```bash
       cd /Users/mikegeehan/claude/triarch/development/admin-phase37
       git add packages/triarch-shared/src/schema.ts packages/triarch-shared/package.json src/db/migrations/0021_*.sql src/db/migrations/meta/_journal.json src/lib/build-trigger-mode.ts src/lib/build-trigger-mode.test.ts
       git commit -m "feat(37-01): add build_trigger_mode + approval_events schema + validator

       - Schema: projects gains build_trigger_mode varchar(32) NOT NULL default 'local_claude' (3-value CHECK) + local_path varchar(512) nullable
       - Schema: new approval_events table (entity-agnostic; 9 cols + 2 indexes)
       - Migration 0021: ALTER projects ADD COLUMN ×2 + CHECK + CREATE TABLE + 2 indexes
       - Shared package: 0.5.0 → 0.6.0 (additive schema)
       - Validator: src/lib/build-trigger-mode.ts + isValidBuildTriggerMode + 10 tests
       "
       ```

       **Recovery: if `git add` shows untracked files unexpectedly** — only stage the listed files; do NOT use `git add -A`. If `git commit` fails on pre-commit hook (lint/typecheck), fix the underlying issue and re-stage, do NOT use `--no-verify`.

       **Recovery: if `git branch --show-current` is NOT `feat/build-trigger`** — STOP. The phase context says we're on a worktree on that branch. If you're not, run `git worktree list` to confirm; this plan must commit to that branch.

    2. **Tag and push the shared package** (publish-shared.yml fires on `shared/v*`):
       ```bash
       git tag shared/v0.6.0
       git push origin feat/build-trigger
       git push origin shared/v0.6.0
       ```

       **Recovery: if `git tag` fails with "tag already exists"** — a previous attempt at 0.6.0 was made. Check `git tag -l 'shared/v0.6.0'`. If the tag points at an older commit, delete it locally + remote (`git tag -d shared/v0.6.0; git push origin :refs/tags/shared/v0.6.0`) then re-tag. If `npm view @triarchsecurity/triarch-shared@0.6.0` already returns metadata, the package was already published — SKIP to step 4. Republishing the same version is impossible (npm registry rejects).

    3. **Watch the publish workflow succeed**:
       ```bash
       gh run watch
       ```
       Expect: "publish-shared" workflow succeeds.

       **Recovery: if Workflow Conclusion = failure** — DO NOT panic. Phase 16-04 documented that "Workflow conclusion:failure was cosmetic-only (Summary step quoting bug); npm publish succeeded." Verify the package was actually published:
       ```bash
       npm view @triarchsecurity/triarch-shared@0.6.0 version
       # Expected output: 0.6.0
       # If output is "npm ERR! 404" → genuine publish failure; inspect workflow logs with: gh run view --log
       # If output is "0.6.0" → cosmetic failure only; proceed to step 4
       ```

       **Recovery: if `gh run watch` times out or shows "no recent runs"** — workflow may not have triggered. Check that the tag push fired the workflow:
       ```bash
       gh workflow list | grep publish-shared
       gh run list --workflow=publish-shared.yml --limit 3
       ```
       If no run for shared/v0.6.0 tag, re-push the tag: `git push origin :refs/tags/shared/v0.6.0 && git push origin shared/v0.6.0`.

    4. **Update admin pin to ^0.6.0 and re-install**:
       ```bash
       # In admin's package.json, find the @triarchsecurity/triarch-shared line
       # and change "^0.5.0" → "^0.6.0"
       npm install
       # Verify lockfile resolves 0.6.0:
       grep -A 2 "triarchsecurity/triarch-shared" package-lock.json | head -10
       ```

       **Recovery: if `npm install` returns 401/403 from GitHub Packages registry** — npm auth token expired or missing. Check `~/.npmrc` has `@triarchsecurity:registry=https://npm.pkg.github.com` + `//npm.pkg.github.com/:_authToken=ghp_...`. If token expired, refresh via gh: `gh auth refresh -s read:packages` then re-run npm install. **Recovery: if lockfile resolves to wrong version** (e.g., still ^0.5.0) — rm node_modules/@triarchsecurity/triarch-shared + rm package-lock.json + re-run npm install (forces clean resolution).

    5. **Apply the migration to the prod cluster**:
       ```bash
       npm run db:push
       # Drizzle-kit prints the SQL it will apply; confirm with 'y' when prompted.
       # Wait for "Changes applied successfully" message.
       ```

       **Recovery: if `db:push` errors with "DATABASE_URL not set"** — fetch from Firebase secrets first: see existing `scripts/` for the pattern, or `firebase apphosting:secrets:access DATABASE_URL --project=$PROJECT_ID`. Export it: `export DATABASE_URL=...` then re-run.

       **Recovery: if `db:push` errors with "constraint validation failed"** — Pitfall 10 risk: some pre-existing row has a build_trigger_mode value outside the 3-value allowlist (shouldn't happen because column is being ADDED with DEFAULT, but check). Inspect with `psql "$DATABASE_URL" -c "SELECT DISTINCT build_trigger_mode FROM projects;"` — every row should report 'local_claude'. If anything else, drop the constraint (per drizzle-kit error message) and investigate.

       **Recovery: if `db:push` shows "Are you sure?" prompt and the SQL preview includes any DROP COLUMN or DROP TABLE** — ABORT with Ctrl+C immediately. drizzle-kit may have detected drift from the shared package state. Investigate before proceeding.

    6. **Verify columns + new table exist on the live DB**:
       ```bash
       # If a SQL shell is configured, run:
       # SELECT column_name FROM information_schema.columns WHERE table_name = 'projects' AND column_name IN ('build_trigger_mode', 'local_path');
       # Expect: 2 rows.
       # SELECT table_name FROM information_schema.tables WHERE table_name = 'approval_events';
       # Expect: 1 row.
       # SELECT count(*) FROM approval_events;
       # Expect: 0 (fresh table).
       ```

       **Recovery: if information_schema query returns 0 rows for approval_events** — db:push silently failed or partially applied. Re-run `npm run db:push` and watch the output more carefully. If it persistently fails to apply, file the SQL manually via psql.

    7. **Commit the pin update + lockfile + admin version bump (current 2.14.1 → 2.15.0; minor bump because Phase 37 ships a new capability surface):**
       ```bash
       # Edit admin's package.json: "version": "2.14.1" → "2.15.0"
       git add package.json package-lock.json
       git commit -m "v2.15.0: pin @triarchsecurity/triarch-shared@^0.6.0"
       git push origin feat/build-trigger
       ```

       **Recovery: if PKG-04 drift gate fires red on the PR** — this should NOT happen because the schema bump + package.json bump are in the SAME commit (committed in step 1). If it does fire red, inspect the workflow log; the gate checks that any commit touching `packages/triarch-shared/**` also bumps `packages/triarch-shared/package.json`. The commit in step 1 satisfies that. If the gate still fails, the gate config may have drifted — escalate.

    8. **Open the PR against dev branch** (per workspace CLAUDE.md per-push checklist):
       ```bash
       gh pr create --base dev --head feat/build-trigger --title "v2.15.0: Phase 37-01 — build_trigger_mode + approval_events schema" --body "Phase 37 Wave 1 foundation. See .planning/phases/37-claude-code-build-trigger/37-01-shared-schema-additions-PLAN.md"
       ```

       **Recovery: if `gh pr create` says "no commits between dev and feat/build-trigger"** — branch was created from feat/inclusion-state-machine, not dev. That's expected per the phase context. Rebase or change base: this is a downstream branch off Phase 36's work; if the dev base errors, target the base branch instead: `gh pr create --base feat/inclusion-state-machine --head feat/build-trigger ...`. Coordinate with Mike on the eventual merge order.

    Expected outcomes (all must be true):
    - npm registry has @triarchsecurity/triarch-shared@0.6.0 published (`npm view ...@0.6.0 version` returns 0.6.0)
    - admin package-lock.json resolves @triarchsecurity/triarch-shared to 0.6.0
    - CRDB has `build_trigger_mode` + `local_path` columns on `projects` AND the `approval_events` table exists (verified via information_schema query)
    - PR is open against dev (or feat/inclusion-state-machine, per recovery branch) with PKG-04 drift gate GREEN
  </how-to-verify>
  <resume-signal>Type "approved" once the PR is open with PKG-04 GREEN AND db:push succeeded against prod cluster AND `npm view @triarchsecurity/triarch-shared@0.6.0` returns package metadata AND information_schema confirms the approval_events table exists. If any step blocks beyond the recovery guidance above (PKG-04 red after retry, publish-shared workflow legitimately fails per `npm view` 404, db:push rejects the CHECK constraint), describe the error and stop.</resume-signal>
  <files>none — human-only orchestration of CLI/git/npm/firebase commands</files>
  <action>See &lt;how-to-verify&gt; block above for the full step-by-step sequence the human runs in their shell, including per-step recovery guidance. This task gates downstream plans because publish/install/db:push are human-orchestrated.</action>
  <done>Human types "approved" per &lt;resume-signal&gt; after every step in &lt;how-to-verify&gt; passes (or recovery branch resolves cleanly).</done>

</task>

</tasks>

<verification>
- Shared package version is 0.6.0 (verifiable: `jq -r .version packages/triarch-shared/package.json`)
- Both new projects columns + new approvalEvents table exist in committed schema (verifiable: `grep -c "buildTriggerMode\|approvalEvents" packages/triarch-shared/src/schema.ts` returns >= 2)
- Migration 0021 exists with CHECK constraint + CREATE TABLE + 2 indexes (verifiable via grep on src/db/migrations/0021_*.sql)
- Validator + tests both exist and pass (verifiable: `npx vitest run src/lib/build-trigger-mode.test.ts`)
- npm has @triarchsecurity/triarch-shared@0.6.0 published (verifiable: `npm view @triarchsecurity/triarch-shared@0.6.0`)
- admin pins ^0.6.0 (verifiable: `grep -A 1 "triarchsecurity/triarch-shared" package.json`)
- prod CRDB has the new columns + approval_events table (verifiable via information_schema query post db:push)
- PR is open with PKG-04 drift gate GREEN
</verification>

<success_criteria>
- Wave 2 plans (37-02 build-prompt generator, 37-03 generate-build API, 37-04 project admin trigger mode editor) can import `projects.buildTriggerMode`, `projects.localPath`, `approvalEvents` from `@triarchsecurity/triarch-shared/schema` without TypeScript errors
- Wave 2/3 plans can import `BUILD_TRIGGER_MODES`, `isValidBuildTriggerMode`, `BuildTriggerMode` from `@/lib/build-trigger-mode`
- Any future PR touching `packages/triarch-shared/src/schema.ts` without bumping `packages/triarch-shared/package.json` triggers PKG-04 drift gate failure (proven by THIS PR passing it)
- All projects' `build_trigger_mode` defaults to `'local_claude'` (default applied uniformly during db:push)
- `local_path` is NULL on all existing projects (no migration data backfill — staff sets per-project later via Plan 37-04 UI)
</success_criteria>

<output>
After completion, create `.planning/phases/37-claude-code-build-trigger/37-01-shared-schema-additions-SUMMARY.md` documenting:
- Final shared package version published (0.6.0) + published-at timestamp
- Migration filename actually picked by drizzle-kit (e.g. 0021_build_trigger_and_approval_events.sql or renamed)
- Any PKG-04 / publish-shared workflow quirks encountered (e.g. Phase 16-04 "cosmetic failure" recurrence)
- Admin version bumped to (2.15.0)
- PR URL and merge commit SHA
- Confirmation that information_schema query returned the expected column rows on prod CRDB AND that approval_events table exists with 0 rows
- Which recovery branches in Task 4 were exercised (if any) — feeds back into next plan revision pass
</output>
</content>
</invoke>