---
phase: 36-inclusion-approval-state-machine
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/triarch-shared/src/schema.ts
  - packages/triarch-shared/package.json
  - src/db/migrations/0020_inclusion_state.sql
  - src/db/migrations/meta/_journal.json
  - src/lib/inclusion-state.ts
  - src/lib/inclusion-state.test.ts
  - package.json
  - package-lock.json
autonomous: false
requirements: [INCL-01, INCL-02]
must_haves:
  truths:
    - "bug_reports and feature_requests tables have inclusion_state column (varchar(32), default 'triaged', NOT NULL)"
    - "bug_reports and feature_requests tables have next_release_log_id UUID FK to release_logs.id (nullable, ON DELETE SET NULL)"
    - "DB CHECK constraint rejects any inclusion_state value not in the 7-value allowlist"
    - "@triarchsecurity/triarch-shared v0.4.0 published to GitHub Packages and consumed by admin via npm install"
    - "src/lib/inclusion-state.ts exports INCLUSION_STATES tuple and canManuallyTransition helper"
    - "MANUAL_TRANSITIONS does NOT include 'rejected' as a target from any state other than itself (no UI path drives 'rejected' in Phase 36 — see 36-CONTEXT.md amendments block). 'rejected' remains in the INCLUSION_STATES tuple for DB back-compat and as a v3.0 candidate; 'rejected → triaged' recovery path is preserved."
    - "PKG-04 drift gate passes on the PR (shared package version bumped in same commit as schema change)"
  artifacts:
    - path: "packages/triarch-shared/src/schema.ts"
      provides: "bugReports + featureRequests inclusionState + nextReleaseLogId columns"
      contains: "inclusionState"
    - path: "packages/triarch-shared/package.json"
      provides: "shared package version bump"
      contains: "\"version\": \"0.4.0\""
    - path: "src/db/migrations/0020_inclusion_state.sql"
      provides: "DDL: ADD COLUMN + FK + CHECK constraint + partial indexes for both tables"
      contains: "inclusion_state"
    - path: "src/lib/inclusion-state.ts"
      provides: "state machine validator: INCLUSION_STATES tuple + canManuallyTransition + InclusionState type"
      exports: ["INCLUSION_STATES", "canManuallyTransition", "InclusionState"]
  key_links:
    - from: "packages/triarch-shared/src/schema.ts"
      to: "release_logs.id"
      via: "FK on next_release_log_id with onDelete: 'set null'"
      pattern: "onDelete:\\s*'set null'"
    - from: "src/db/migrations/0020_inclusion_state.sql"
      to: "bug_reports.inclusion_state CHECK constraint"
      via: "raw-SQL CHECK constraint append"
      pattern: "CHECK \\(inclusion_state IN"
    - from: "package.json"
      to: "@triarchsecurity/triarch-shared@^0.4.0"
      via: "npm dependency pin update"
      pattern: "@triarchsecurity/triarch-shared.*0\\.4"
---

<objective>
Land the shared package schema additions (`inclusion_state` + `next_release_log_id` columns on both `bug_reports` and `feature_requests`), bump `@triarchsecurity/triarch-shared` from 0.3.1 → 0.4.0, publish via `shared/v0.4.0` tag, re-install in admin, generate the Drizzle migration with hand-appended CHECK constraint + partial indexes, run `db:push` against prod cluster, and ship the `src/lib/inclusion-state.ts` state-machine validator. This plan is the Wave 0 dance that gates every other plan in Phase 36 — until the package publishes and admin re-installs, downstream plans cannot reference the new columns.

Purpose: Establish the inclusion-state primitive (column + audit-table-ready type + transition validator) that all of Phase 36 depends on, while satisfying the PKG-04 drift gate via in-commit version bump.
Output: Migration applied to prod cluster, package@0.4.0 published, admin pinned to ^0.4.0, state-machine helper module ready for import by 36-02/03/04.
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/execute-plan.md
@~/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/36-inclusion-approval-state-machine/36-CONTEXT.md
@.planning/phases/36-inclusion-approval-state-machine/36-RESEARCH.md

# Source-of-truth references
@packages/triarch-shared/src/schema.ts
@packages/triarch-shared/package.json
@src/db/migrations/0016_release_log_links_and_preview_lock.sql

<interfaces>
<!-- Key types and call signatures executors will use. Extracted from codebase. -->

From packages/triarch-shared/src/schema.ts (line 144 — releaseLogs is the FK target):
```typescript
export const releaseLogs = pgTable('release_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  // ...
});
```

From packages/triarch-shared/src/schema.ts (line 305 — bugReports table being extended):
```typescript
export const bugReports = pgTable('bug_reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  // ... 23 existing columns including status: varchar('status', { length: 32 }) ...
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
```

From packages/triarch-shared/src/schema.ts (line 332 — featureRequests table being extended):
```typescript
export const featureRequests = pgTable('feature_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  // ... existing columns including status: varchar('status', { length: 32 }) ...
});
```

From src/db/migrations/0016_release_log_links_and_preview_lock.sql — established pattern for hand-appended raw-SQL CHECK constraint after drizzle-kit generated DDL:
```sql
ALTER TABLE "release_log_links" ADD CONSTRAINT "release_log_links_link_type_discriminant"
  CHECK ( ... );
```

The 7 allowed inclusion_state values (locked by CONTEXT.md + INCL-01 in REQUIREMENTS.md line 358):
`'triaged', 'pending_inclusion', 'approved_for_build', 'built', 'deployed', 'deferred', 'rejected'`

State machine transitions — UPDATED per 36-CONTEXT.md `<amendments>` block (2026-05-18 revision pass):
- Manual via admin UI: triaged → [pending_inclusion, deferred]
- Manual: pending_inclusion → [approved_for_build, deferred]
- Manual: approved_for_build → [pending_inclusion]  (INCL-05 "Remove from build")
- Manual: deferred → [triaged, pending_inclusion]
- Manual: rejected → [triaged]  (recovery path — kept in case 'rejected' rows exist from DB back-compat or future surfaces)
- Auto-only (NOT manual): built, deployed (driven by commit-parser and prod-ingest)
- 'rejected' is NOT reachable from any other state via any Phase 36 UI surface. The DB CHECK constraint still permits 'rejected' as a value (column DDL is unchanged); we simply don't expose a manual transition path TO it. This matches INCL-04 spec which enumerates only pending_inclusion → approved_for_build OR → deferred.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add inclusion_state + next_release_log_id columns to shared schema and bump package to 0.4.0</name>
  <files>packages/triarch-shared/src/schema.ts, packages/triarch-shared/package.json</files>
  <read_first>
    - packages/triarch-shared/src/schema.ts (current bugReports at line 305, featureRequests at line 332, releaseLogs at line 144)
    - packages/triarch-shared/package.json (current version 0.3.1)
    - .planning/phases/36-inclusion-approval-state-machine/36-CONTEXT.md (Schema & State Machine decisions — locked; AND <amendments> block for B-3 'rejected' clarification)
    - .planning/phases/36-inclusion-approval-state-machine/36-RESEARCH.md (Pitfall 2: onDelete must be 'set null' not 'cascade')
  </read_first>
  <behavior>
    - Adding inclusionState column to bugReports defaults to 'triaged' on new rows (Drizzle default('triaged'))
    - Adding inclusionState column to featureRequests defaults to 'triaged' on new rows
    - nextReleaseLogId is nullable UUID FK to releaseLogs.id with onDelete: 'set null' (NEVER 'cascade')
    - package.json version field strictly equals "0.4.0" (additive schema change = minor bump per Phase 23-04 close precedent)
  </behavior>
  <action>
    Edit `packages/triarch-shared/src/schema.ts`:

    1. In the `bugReports` table definition (currently starts at line 305), AFTER the existing `triarchNotes: text('triarch_notes'),` column and BEFORE `resolvedAt:` (line ~327), add EXACTLY these two columns:
    ```typescript
      // ── v2.4 Phase 36 INCL-01..02: inclusion state machine ──
      inclusionState: varchar('inclusion_state', { length: 32 }).notNull().default('triaged'),
      nextReleaseLogId: uuid('next_release_log_id').references(() => releaseLogs.id, { onDelete: 'set null' }),
    ```

    2. In the `featureRequests` table definition (currently starts at line 332), AFTER the existing `triarchNotes: text('triarch_notes'),` column and BEFORE `upvotes:` (line ~351), add the SAME two columns:
    ```typescript
      // ── v2.4 Phase 36 INCL-01..02: inclusion state machine ──
      inclusionState: varchar('inclusion_state', { length: 32 }).notNull().default('triaged'),
      nextReleaseLogId: uuid('next_release_log_id').references(() => releaseLogs.id, { onDelete: 'set null' }),
    ```

    3. CRITICAL: `onDelete: 'set null'` — NEVER `'cascade'`. Pitfall 2 in RESEARCH.md: cascade would delete every bug/feature pointing at a deleted release_logs row. The bug/feature outlives its release; null means "no release tracked yet."

    4. Edit `packages/triarch-shared/package.json`: change `"version": "0.3.1"` → `"version": "0.4.0"` (line 3). Additive schema change = minor bump per CONTEXT D-Schema and Phase 23-04 close precedent.

    5. Verify no other edits to schema.ts (do not touch other tables, do not reorder existing columns).
  </action>
  <verify>
    <automated>cd packages/triarch-shared &amp;&amp; npx tsc --build &amp;&amp; cd ../.. &amp;&amp; grep -c "inclusionState" packages/triarch-shared/src/schema.ts &amp;&amp; grep -c "onDelete: 'set null'" packages/triarch-shared/src/schema.ts &amp;&amp; jq -r .version packages/triarch-shared/package.json</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "inclusionState: varchar('inclusion_state', { length: 32 }).notNull().default('triaged')" packages/triarch-shared/src/schema.ts` returns >= 2 (one for each table)
    - `grep -c "nextReleaseLogId: uuid('next_release_log_id').references(() => releaseLogs.id, { onDelete: 'set null' })" packages/triarch-shared/src/schema.ts` returns >= 2
    - `grep -c "onDelete: 'cascade'" packages/triarch-shared/src/schema.ts` for the new lines is 0 (cascade is FORBIDDEN for next_release_log_id — Pitfall 2)
    - `jq -r .version packages/triarch-shared/package.json` returns exactly `0.4.0`
    - `cd packages/triarch-shared && npx tsc --build` exits 0 (shared package compiles)
  </acceptance_criteria>
  <done>Shared schema has both columns on both tables with correct FK semantics; package version bumped to 0.4.0; shared package TypeScript compiles.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Generate drizzle migration 0020_inclusion_state.sql with hand-appended CHECK constraint and partial indexes</name>
  <files>src/db/migrations/0020_inclusion_state.sql, src/db/migrations/meta/_journal.json</files>
  <read_first>
    - src/db/migrations/0016_release_log_links_and_preview_lock.sql (canonical pattern for raw-SQL CHECK append after drizzle-generated DDL — lines 17-22)
    - src/db/migrations/0014_release_approvals_unique_approved.sql (partial index syntax example)
    - src/db/migrations/meta/_journal.json (journal — drizzle-kit auto-updates; verify after generate)
    - .planning/phases/36-inclusion-approval-state-machine/36-RESEARCH.md (Pattern 1: Drizzle Schema Addition with Raw-SQL CHECK, lines 148-190)
  </read_first>
  <behavior>
    - Migration file exists at src/db/migrations/0020_inclusion_state.sql
    - Migration contains 2× ADD COLUMN inclusion_state (one per table) with `DEFAULT 'triaged' NOT NULL`
    - Migration contains 2× ADD COLUMN next_release_log_id + FK with `ON DELETE set null`
    - Migration contains 2× CHECK constraint (one per table) listing ALL 7 allowed values
    - Migration contains 2× partial CREATE INDEX `WHERE inclusion_state = 'approved_for_build'` (one per table) for INCL-05 page query
    - `_journal.json` updated by drizzle-kit to reference migration 0020
  </behavior>
  <action>
    1. Run `npx drizzle-kit generate` to auto-generate the column ADD + FK statements. Drizzle will emit something like:
    ```sql
    ALTER TABLE "bug_reports" ADD COLUMN "inclusion_state" varchar(32) DEFAULT 'triaged' NOT NULL;--> statement-breakpoint
    ALTER TABLE "bug_reports" ADD COLUMN "next_release_log_id" uuid;--> statement-breakpoint
    ALTER TABLE "feature_requests" ADD COLUMN "inclusion_state" varchar(32) DEFAULT 'triaged' NOT NULL;--> statement-breakpoint
    ALTER TABLE "feature_requests" ADD COLUMN "next_release_log_id" uuid;--> statement-breakpoint
    ALTER TABLE "bug_reports" ADD CONSTRAINT "bug_reports_next_release_log_id_release_logs_id_fk" FOREIGN KEY ("next_release_log_id") REFERENCES "public"."release_logs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
    ALTER TABLE "feature_requests" ADD CONSTRAINT "feature_requests_next_release_log_id_release_logs_id_fk" FOREIGN KEY ("next_release_log_id") REFERENCES "public"."release_logs"("id") ON DELETE set null ON UPDATE no action;
    ```
    Verify the generated file is named `0020_*.sql` (drizzle-kit assigns the slug; if it picks a non-`inclusion_state` slug like `0020_silly_thing.sql`, rename to `0020_inclusion_state.sql` AND update the corresponding entry in `meta/_journal.json` to match).

    2. HAND-APPEND to the generated file (EXACT strings — order matters; `--> statement-breakpoint` separates each statement):
    ```sql
    --> statement-breakpoint
    ALTER TABLE "bug_reports" ADD CONSTRAINT "bug_reports_inclusion_state_check"
      CHECK (inclusion_state IN ('triaged', 'pending_inclusion', 'approved_for_build', 'built', 'deployed', 'deferred', 'rejected'));
    --> statement-breakpoint
    ALTER TABLE "feature_requests" ADD CONSTRAINT "feature_requests_inclusion_state_check"
      CHECK (inclusion_state IN ('triaged', 'pending_inclusion', 'approved_for_build', 'built', 'deployed', 'deferred', 'rejected'));
    --> statement-breakpoint
    CREATE INDEX "bug_reports_project_approved_for_build_idx"
      ON "bug_reports" ("project") WHERE "inclusion_state" = 'approved_for_build';
    --> statement-breakpoint
    CREATE INDEX "feature_requests_project_approved_for_build_idx"
      ON "feature_requests" ("project") WHERE "inclusion_state" = 'approved_for_build';
    ```

    3. Pitfall 10 (CRDB CHECK validation on existing rows): NOT a risk here because column is being ADDED with DEFAULT 'triaged' which always satisfies the CHECK. But order matters in the file — ADD COLUMN must come before ADD CONSTRAINT.

    4. Run `npx drizzle-kit check` — must exit 0 (validates migration ordering + journal integrity).

    5. DO NOT run `db:push` in this task — `db:push` happens in Task 4 after the package publishes. We want the file committed first.
  </action>
  <verify>
    <automated>npx drizzle-kit check &amp;&amp; ls src/db/migrations/0020_*.sql &amp;&amp; grep -c "inclusion_state IN" src/db/migrations/0020_*.sql &amp;&amp; grep -c "approved_for_build_idx" src/db/migrations/0020_*.sql &amp;&amp; grep -c "ON DELETE set null" src/db/migrations/0020_*.sql</automated>
  </verify>
  <acceptance_criteria>
    - File `src/db/migrations/0020_inclusion_state.sql` exists (rename if drizzle-kit picked a different slug)
    - `grep -c "inclusion_state IN ('triaged', 'pending_inclusion', 'approved_for_build', 'built', 'deployed', 'deferred', 'rejected')" src/db/migrations/0020_*.sql` returns exactly 2
    - `grep -c "ON DELETE set null" src/db/migrations/0020_*.sql` returns exactly 2 (one per FK)
    - `grep -c "WHERE \"inclusion_state\" = 'approved_for_build'" src/db/migrations/0020_*.sql` returns exactly 2 (one per partial index)
    - `npx drizzle-kit check` exits 0
    - `src/db/migrations/meta/_journal.json` references the new migration tag (grep for "0020" returns >=1 match)
  </acceptance_criteria>
  <done>Migration file committed-ready with all 4 ADD COLUMNs, 2 FKs (set null), 2 CHECKs (7 values), 2 partial indexes; drizzle-kit check passes; journal updated.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Create src/lib/inclusion-state.ts state-machine validator with Vitest tests (RED → GREEN)</name>
  <files>src/lib/inclusion-state.ts, src/lib/inclusion-state.test.ts</files>
  <read_first>
    - .planning/phases/36-inclusion-approval-state-machine/36-RESEARCH.md (State transition helper section, lines 437-460 — canonical INCLUSION_STATES tuple + MANUAL_TRANSITIONS map)
    - .planning/phases/36-inclusion-approval-state-machine/36-CONTEXT.md (D-02: backward via "Remove from build" only; auto-flips forward-only; AND <amendments> block at bottom: 'rejected' is NOT a reachable manual target from any Phase 36 UI surface)
    - src/lib/commit-parser.test.ts (Vitest test file pattern for a pure-function module — describe/it structure)
  </read_first>
  <behavior>
    - Exported `INCLUSION_STATES` is a readonly tuple containing exactly 7 strings in this order: 'triaged', 'pending_inclusion', 'approved_for_build', 'built', 'deployed', 'deferred', 'rejected'
    - Exported `type InclusionState` = the union of those 7 string literals
    - Exported `canManuallyTransition(from, to)` returns true only for the explicit allowlist below; false otherwise
    - Test: triaged → pending_inclusion = true
    - Test: triaged → rejected = FALSE (B-3 fix — no UI path drives 'rejected')
    - Test: pending_inclusion → approved_for_build = true
    - Test: pending_inclusion → deferred = true
    - Test: pending_inclusion → rejected = FALSE (B-3 fix — INCL-04 only enumerates approved_for_build OR deferred)
    - Test: approved_for_build → pending_inclusion = true (INCL-05 "Remove from build" backward path)
    - Test: built → deployed = FALSE (auto-only, not manual)
    - Test: deployed → anything = FALSE (terminal for manual surface)
    - Test: triaged → built = FALSE (cannot skip states manually)
    - Test: approved_for_build → built = FALSE (must go through commit-parser auto-flip)
    - Test: deferred → triaged = true (recovery path)
    - Test: rejected → triaged = true (recovery path — kept in case 'rejected' rows exist from DB back-compat)
  </behavior>
  <action>
    1. WRITE TEST FIRST (RED): create `src/lib/inclusion-state.test.ts` matching the Vitest pattern in `src/lib/commit-parser.test.ts` (describe/it; no DB mocks needed — pure function):
    ```typescript
    import { describe, it, expect } from 'vitest';
    import { INCLUSION_STATES, canManuallyTransition, type InclusionState } from './inclusion-state';

    describe('INCLUSION_STATES', () => {
      it('exports exactly 7 values in canonical order', () => {
        expect(INCLUSION_STATES).toEqual([
          'triaged', 'pending_inclusion', 'approved_for_build',
          'built', 'deployed', 'deferred', 'rejected'
        ]);
      });
    });

    describe('canManuallyTransition', () => {
      // Forward manual paths (allowed)
      it('triaged → pending_inclusion = true', () => {
        expect(canManuallyTransition('triaged', 'pending_inclusion')).toBe(true);
      });
      it('triaged → deferred = true', () => {
        expect(canManuallyTransition('triaged', 'deferred')).toBe(true);
      });
      it('pending_inclusion → approved_for_build = true', () => {
        expect(canManuallyTransition('pending_inclusion', 'approved_for_build')).toBe(true);
      });
      it('pending_inclusion → deferred = true', () => {
        expect(canManuallyTransition('pending_inclusion', 'deferred')).toBe(true);
      });

      // B-3 fix: 'rejected' is NOT reachable via any Phase 36 UI surface
      it('triaged → rejected = false (no UI path — B-3 fix per CONTEXT amendments)', () => {
        expect(canManuallyTransition('triaged', 'rejected')).toBe(false);
      });
      it('pending_inclusion → rejected = false (INCL-04 only enumerates approved_for_build OR deferred)', () => {
        expect(canManuallyTransition('pending_inclusion', 'rejected')).toBe(false);
      });

      // INCL-05 "Remove from build" backward (the only manual backward)
      it('approved_for_build → pending_inclusion = true (INCL-05)', () => {
        expect(canManuallyTransition('approved_for_build', 'pending_inclusion')).toBe(true);
      });

      // Recovery paths
      it('deferred → triaged = true', () => {
        expect(canManuallyTransition('deferred', 'triaged')).toBe(true);
      });
      it('rejected → triaged = true (recovery path kept for back-compat)', () => {
        expect(canManuallyTransition('rejected', 'triaged')).toBe(true);
      });

      // Auto-only states (no manual entry)
      it('approved_for_build → built = false (auto-only via commit-parser)', () => {
        expect(canManuallyTransition('approved_for_build', 'built')).toBe(false);
      });
      it('built → deployed = false (auto-only via prod-ingest)', () => {
        expect(canManuallyTransition('built', 'deployed')).toBe(false);
      });

      // Forbidden skips
      it('triaged → built = false (cannot skip states)', () => {
        expect(canManuallyTransition('triaged', 'built')).toBe(false);
      });
      it('triaged → approved_for_build = false (must go through pending_inclusion)', () => {
        expect(canManuallyTransition('triaged', 'approved_for_build')).toBe(false);
      });

      // Terminal states
      it('built → anything-else = false', () => {
        for (const to of INCLUSION_STATES) {
          expect(canManuallyTransition('built', to)).toBe(false);
        }
      });
      it('deployed → anything = false (terminal for manual surface)', () => {
        for (const to of INCLUSION_STATES) {
          expect(canManuallyTransition('deployed', to)).toBe(false);
        }
      });
    });
    ```

    2. Run `npx vitest run src/lib/inclusion-state.test.ts` — MUST FAIL with "Cannot find module './inclusion-state'" (RED phase).

    3. WRITE IMPLEMENTATION (GREEN): create `src/lib/inclusion-state.ts`:
    ```typescript
    /**
     * inclusion-state.ts
     *
     * State machine validator for bug_reports.inclusion_state / feature_requests.inclusion_state.
     * Phase 36 INCL-01..05 — manual transitions only. Auto-flips (built, deployed) are driven
     * by link-stamper (commit ingest) and releases/promoted route (prod deploy), NOT this module.
     *
     * CONTEXT.md D-02: backward transitions allowed only via INCL-05 "Remove from build"
     * (approved_for_build → pending_inclusion). Auto-states (built, deployed) reject all manual entry.
     *
     * CONTEXT.md <amendments> (2026-05-18 plan revision pass / B-3 fix):
     *   'rejected' is NOT exposed as a manual transition target by any Phase 36 UI surface.
     *   INCL-04 only enumerates pending_inclusion → approved_for_build OR deferred.
     *   The DB CHECK constraint still permits 'rejected' as a state value (DDL unchanged);
     *   the 'rejected → triaged' recovery path is preserved in case rows reach 'rejected'
     *   via DB back-compat, manual SQL, or future v3.0 customer-approval surfaces.
     */

    export const INCLUSION_STATES = [
      'triaged',
      'pending_inclusion',
      'approved_for_build',
      'built',
      'deployed',
      'deferred',
      'rejected',
    ] as const;

    export type InclusionState = typeof INCLUSION_STATES[number];

    // Allowed manual transitions. Empty arrays mean "no manual entry" (built/deployed are auto-only).
    // NOTE per B-3 fix: 'rejected' removed from forward target lists — no Phase 36 UI drives it.
    const MANUAL_TRANSITIONS: Record<InclusionState, readonly InclusionState[]> = {
      triaged:            ['pending_inclusion', 'deferred'],
      pending_inclusion:  ['approved_for_build', 'deferred'],
      approved_for_build: ['pending_inclusion'],  // INCL-05 "Remove from build" only
      built:              [],                      // auto-only via link-stamper
      deployed:           [],                      // auto-only via releases/promoted
      deferred:           ['triaged', 'pending_inclusion'],
      rejected:           ['triaged'],             // recovery path kept for back-compat
    };

    export function canManuallyTransition(from: InclusionState, to: InclusionState): boolean {
      return MANUAL_TRANSITIONS[from]?.includes(to) ?? false;
    }
    ```

    4. Run `npx vitest run src/lib/inclusion-state.test.ts` — MUST PASS (GREEN phase).
  </action>
  <verify>
    <automated>npx vitest run src/lib/inclusion-state.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - File `src/lib/inclusion-state.ts` exists and exports `INCLUSION_STATES`, `InclusionState`, `canManuallyTransition`
    - File `src/lib/inclusion-state.test.ts` exists
    - `npx vitest run src/lib/inclusion-state.test.ts` reports 0 failures, >= 14 passing tests (12 baseline + 2 added B-3 negative tests)
    - `grep -c "^export const INCLUSION_STATES = \[" src/lib/inclusion-state.ts` returns 1
    - `grep -c "built:              \[\]" src/lib/inclusion-state.ts` returns 1 (auto-only guard)
    - `grep -c "deployed:           \[\]" src/lib/inclusion-state.ts` returns 1 (terminal manual guard)
    - `grep -E "triaged:\s+\['pending_inclusion', 'deferred'\]" src/lib/inclusion-state.ts | wc -l` returns 1 (no 'rejected' in triaged target list — B-3 fix)
    - `grep -E "pending_inclusion:\s+\['approved_for_build', 'deferred'\]" src/lib/inclusion-state.ts | wc -l` returns 1 (no 'rejected' in pending_inclusion target list — B-3 fix)
  </acceptance_criteria>
  <done>Pure-function state-machine validator shipped with full test coverage of allowed/forbidden transitions; 'rejected' removed from manual forward targets per B-3; downstream plans can import canManuallyTransition.</done>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 4: Human runs the publish + install dance (npm version → git tag → push → npm install → db:push)</name>
  <what-built>Schema + migration + state-machine helper are all ready in working tree on a feature branch. The publish dance requires human-only steps: tag push triggers the publish-shared.yml GitHub workflow which authenticates to GitHub Packages; admin npm install pulls from the private registry; db:push needs human confirmation against prod cluster.</what-built>
  <how-to-verify>
    Run these commands in sequence (each requires your human shell). Per M-1 fix in plan revision pass, each sub-step includes per-step recovery guidance for the most common failure modes — the workflow IS atomic (publish → install → db:push must happen together), so splitting introduces inter-plan dependency risk worse than the single-checkpoint risk. The recovery guidance below makes the single-checkpoint shape safe.

    1. **Create feature branch and commit the schema + migration + helper**:
       ```bash
       cd /Users/mikegeehan/claude/triarch/development/admin
       git checkout -b feat/inclusion-state-machine
       git add packages/triarch-shared/src/schema.ts packages/triarch-shared/package.json src/db/migrations/0020_*.sql src/db/migrations/meta/_journal.json src/lib/inclusion-state.ts src/lib/inclusion-state.test.ts
       git commit -m "feat(36-01): add inclusion_state schema + state-machine helper

       - Schema: bug_reports + feature_requests gain inclusion_state varchar(32) + next_release_log_id uuid FK (set null)
       - Migration 0020: ADD COLUMN + FK + CHECK constraint (7 values) + partial indexes
       - Shared package: 0.3.1 → 0.4.0 (additive schema)
       - State machine: src/lib/inclusion-state.ts + canManuallyTransition + 14 tests
       - B-3: 'rejected' removed from manual transition targets (no Phase 36 UI drives it)
       "
       ```

       **Recovery: if `git add` shows untracked files unexpectedly** — only stage the listed files; do NOT use `git add -A`. If `git commit` fails on pre-commit hook (lint/typecheck), fix the underlying issue and re-stage, do NOT use `--no-verify`.

    2. **Tag and push the shared package** (publish-shared.yml fires on `shared/v*`):
       ```bash
       git tag shared/v0.4.0
       git push origin feat/inclusion-state-machine
       git push origin shared/v0.4.0
       ```

       **Recovery: if `git tag` fails with "tag already exists"** — a previous attempt at 0.4.0 was made. Check `git tag -l 'shared/v0.4.0'`. If the tag points at an older commit, delete it locally + remote (`git tag -d shared/v0.4.0; git push origin :refs/tags/shared/v0.4.0`) then re-tag. If `npm view @triarchsecurity/triarch-shared@0.4.0` already returns metadata, the package was already published — SKIP to step 4. Republishing the same version is impossible (npm registry rejects).

    3. **Watch the publish workflow succeed**:
       ```bash
       gh run watch
       ```
       Expect: "publish-shared" workflow succeeds.

       **Recovery: if Workflow Conclusion = failure** — DO NOT panic. Phase 16-04 documented that "Workflow conclusion:failure was cosmetic-only (Summary step quoting bug); npm publish succeeded." Verify the package was actually published via:
       ```bash
       npm view @triarchsecurity/triarch-shared@0.4.0 version
       # Expected output: 0.4.0
       # If output is "npm ERR! 404" → genuine publish failure; inspect workflow logs with: gh run view --log
       # If output is "0.4.0" → cosmetic failure only; proceed to step 4
       ```

       **Recovery: if `gh run watch` times out or shows "no recent runs"** — workflow may not have triggered. Check that the tag push fired the workflow:
       ```bash
       gh workflow list | grep publish-shared
       gh run list --workflow=publish-shared.yml --limit 3
       ```
       If no run for shared/v0.4.0 tag, re-push the tag: `git push origin :refs/tags/shared/v0.4.0 && git push origin shared/v0.4.0`.

    4. **Update admin pin to ^0.4.0 and re-install**:
       ```bash
       # In admin's package.json, find the @triarchsecurity/triarch-shared line
       # and change "^0.3.1" → "^0.4.0"
       npm install
       # Verify lockfile resolves 0.4.0:
       grep -A 2 "triarchsecurity/triarch-shared" package-lock.json | head -10
       ```

       **Recovery: if `npm install` returns 401/403 from GitHub Packages registry** — npm auth token expired or missing. Check `~/.npmrc` has `@triarchsecurity:registry=https://npm.pkg.github.com` + `//npm.pkg.github.com/:_authToken=ghp_...`. If token expired, refresh via gh: `gh auth refresh -s read:packages` then re-run npm install. **Recovery: if lockfile resolves to wrong version** (e.g., still ^0.3.1) — rm node_modules/@triarchsecurity/triarch-shared + rm package-lock.json + re-run npm install (forces clean resolution).

    5. **Apply the migration to the prod cluster**:
       ```bash
       npm run db:push
       # Drizzle-kit prints the SQL it will apply; confirm with 'y' when prompted.
       # Wait for "Changes applied successfully" message.
       ```

       **Recovery: if `db:push` errors with "DATABASE_URL not set"** — fetch from Firebase secrets first: `firebase apphosting:secrets:access DATABASE_URL --project=$PROJECT_ID > /tmp/dburl` (or whatever the workspace pattern is — check existing scripts in `scripts/`). Export it: `export DATABASE_URL=$(cat /tmp/dburl)` then re-run.

       **Recovery: if `db:push` errors with "constraint validation failed"** — Pitfall 10 risk: some pre-existing row has an inclusion_state value outside the 7-value allowlist (shouldn't happen because column is being ADDED with DEFAULT, but check). Inspect with `psql "$DATABASE_URL" -c "SELECT DISTINCT inclusion_state FROM bug_reports;"` — every row should report 'triaged'. If anything else, drop the constraint (per drizzle-kit error message) and investigate.

       **Recovery: if `db:push` shows "Are you sure?" prompt and the SQL preview includes any DROP COLUMN or DROP TABLE** — ABORT with Ctrl+C immediately. drizzle-kit may have detected drift from the shared package state. Investigate before proceeding.

    6. **Verify columns exist on the live DB**:
       ```bash
       # If a SQL shell is configured, run:
       # SELECT column_name FROM information_schema.columns WHERE table_name = 'bug_reports' AND column_name IN ('inclusion_state', 'next_release_log_id');
       # Expect: 2 rows.
       # SELECT column_name FROM information_schema.columns WHERE table_name = 'feature_requests' AND column_name IN ('inclusion_state', 'next_release_log_id');
       # Expect: 2 rows.
       ```

       **Recovery: if information_schema query returns 0 or 1 rows** — db:push silently failed or partially applied. Re-run `npm run db:push` and watch the output more carefully. If it persistently fails to apply, file the SQL manually via psql.

    7. **Commit the pin update + lockfile + admin version bump (2.13.28 → 2.14.0; minor bump because we land a new capability)**:
       ```bash
       # Edit admin's package.json: "version": "2.13.28" → "2.14.0"
       git add package.json package-lock.json
       git commit -m "v2.14.0: pin @triarchsecurity/triarch-shared@^0.4.0"
       git push origin feat/inclusion-state-machine
       ```

       **Recovery: if PKG-04 drift gate fires red on the PR** — this should NOT happen because the schema bump + package.json bump are in the SAME commit (committed in step 1). If it does fire red, inspect the workflow log; the gate checks that any commit touching `packages/triarch-shared/**` also bumps `packages/triarch-shared/package.json`. The commit in step 1 satisfies that. If the gate still fails, the gate config may have drifted — escalate.

    8. **Open the PR against dev branch** (per workspace CLAUDE.md per-push checklist):
       ```bash
       gh pr create --base dev --head feat/inclusion-state-machine --title "v2.14.0: Phase 36-01 — inclusion_state schema + state-machine helper" --body "Phase 36 Wave 1 foundation. See .planning/phases/36-inclusion-approval-state-machine/36-01-shared-schema-bump-PLAN.md"
       ```

       **Recovery: if `gh pr create` says "no commits between dev and feat/inclusion-state-machine"** — branch was created from main not dev, but main is ahead. Rebase: `git fetch origin && git rebase origin/dev` then re-push and re-try PR create.

    Expected outcomes (all must be true):
    - npm registry has @triarchsecurity/triarch-shared@0.4.0 published (`npm view ...@0.4.0 version` returns 0.4.0)
    - admin package-lock.json resolves @triarchsecurity/triarch-shared to 0.4.0
    - CRDB has `inclusion_state` + `next_release_log_id` columns on both `bug_reports` and `feature_requests` (verified via information_schema query)
    - PR is open against dev with PKG-04 drift gate GREEN (because version was bumped in same commit as schema change)
  </how-to-verify>
  <resume-signal>Type "approved" once the PR is open with PKG-04 GREEN AND db:push succeeded against prod cluster AND `npm view @triarchsecurity/triarch-shared@0.4.0` returns package metadata. If any step blocks beyond the recovery guidance above (PKG-04 red after retry, publish-shared workflow legitimately fails per `npm view` 404, db:push rejects the CHECK constraint), describe the error and stop.</resume-signal>
  <files>none — human-only orchestration of CLI/git/npm/firebase commands</files>
  <action>See &lt;how-to-verify&gt; block above for the full step-by-step sequence the human runs in their shell, including per-step recovery guidance (M-1 fix in plan revision pass). This task gates downstream plans because publish/install/db:push are human-orchestrated.</action>
  <done>Human types "approved" per &lt;resume-signal&gt; after every step in &lt;how-to-verify&gt; passes (or recovery branch resolves cleanly).</done>

</task>

</tasks>

<verification>
- Shared package version is 0.4.0 (verifiable: `jq -r .version packages/triarch-shared/package.json`)
- Both new columns exist on both tables in committed schema (verifiable: `grep -c "inclusionState" packages/triarch-shared/src/schema.ts` returns >= 2)
- FK uses `onDelete: 'set null'` (Pitfall 2 guard — verifiable: `grep -c "onDelete: 'set null'" packages/triarch-shared/src/schema.ts` returns >= 2)
- Migration 0020 exists with CHECK constraint, FK, and partial indexes (verifiable via grep on src/db/migrations/0020_*.sql)
- State-machine helper + tests both exist and pass (verifiable: `npx vitest run src/lib/inclusion-state.test.ts`)
- MANUAL_TRANSITIONS does NOT include 'rejected' as forward target from triaged or pending_inclusion (B-3 fix — verifiable: grep returns 0)
- npm has @triarchsecurity/triarch-shared@0.4.0 published (verifiable: `npm view @triarchsecurity/triarch-shared@0.4.0`)
- admin pins ^0.4.0 (verifiable: `grep -A 1 "triarchsecurity/triarch-shared" package.json`)
- prod CRDB has the new columns (verifiable via information_schema query post db:push)
- PR is open against dev with PKG-04 drift gate GREEN
</verification>

<success_criteria>
- Wave 2 plans (36-02 admin PATCH, 36-03 link-stamper, 36-04 prod-ingest) can now import `bugReports.inclusionState`, `featureRequests.inclusionState`, `bugReports.nextReleaseLogId`, `featureRequests.nextReleaseLogId` from `@triarchsecurity/triarch-shared/schema` without TypeScript errors
- Wave 2 plans can import `INCLUSION_STATES`, `canManuallyTransition`, `InclusionState` from `@/lib/inclusion-state`
- Any future PR touching `packages/triarch-shared/src/schema.ts` without bumping `packages/triarch-shared/package.json` triggers PKG-04 drift gate failure (proven by THIS PR passing it)
- TMI pilot's `bug_reports` and `feature_requests` rows all show `inclusion_state = 'triaged'` (default applied uniformly during db:push)
</success_criteria>

<output>
After completion, create `.planning/phases/36-inclusion-approval-state-machine/36-01-shared-schema-bump-SUMMARY.md` documenting:
- Final shared package version published (0.4.0) + published-at timestamp
- Migration filename actually picked by drizzle-kit (e.g. 0020_inclusion_state.sql or 0020_silly_thing.sql renamed)
- Any PKG-04 / publish-shared workflow quirks encountered (e.g. Phase 16-04 "cosmetic failure" recurrence)
- Admin version bumped to (2.14.0)
- PR URL and merge commit SHA
- Confirmation that information_schema query returned the 4 expected column rows on prod CRDB
- Which recovery branches in Task 4 were exercised (if any) — feeds back into next plan revision pass
</output>
</content>
</invoke>