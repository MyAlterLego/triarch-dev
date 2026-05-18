---
phase: 36-inclusion-approval-state-machine
plan: 01
subsystem: database
tags: [drizzle, cockroachdb, schema-migration, shared-package, state-machine]

requires:
  - phase: 16
    provides: "@triarchsecurity/triarch-shared package + publish workflow"
  - phase: 11
    provides: "commit-parser + link-stamper foundation (consumed by 36-03)"

provides:
  - inclusion_state column (varchar(32) NOT NULL DEFAULT 'triaged') on bug_reports + feature_requests with CHECK constraint over 7-value enum
  - next_release_log_id FK column (uuid, nullable, ON DELETE set null per Pitfall 2) on both tables
  - Partial indexes on (project) WHERE inclusion_state = 'approved_for_build' for fast next-build-plan page rendering
  - src/lib/inclusion-state.ts state-machine validator (canManuallyTransition, MANUAL_TRANSITIONS, 16/16 tests GREEN)
  - @triarchsecurity/triarch-shared@0.4.0 published to GitHub Packages
  - Admin pinned to ^0.4.0; admin bumped v2.13.28 → v2.14.0

affects:
  - 36-02 (PATCH endpoints consume inclusion-state.ts validator)
  - 36-03 (link-stamper auto-flip consumes inclusion_state column)
  - 36-04 (prod-ingest auto-flip consumes inclusion_state column + next_release_log_id FK)
  - 36-05a, 36-05b (UI surfaces consume inclusion_state column + helper)
  - 36-06 (admin upcoming API SELECTs inclusion_state)
  - 36-07 (portal /upcoming page consumes via admin endpoint)

tech-stack:
  added: []  # no new deps; schema-only change
  patterns:
    - "Schema CHECK constraint via raw-SQL append in hand-written migration (matches existing migration 0016 pattern)"
    - "State-machine helper module with explicit MANUAL_TRANSITIONS map and pure canManuallyTransition function"
    - "Direct DDL apply via node-pg when drizzle-kit push hangs on schema introspection"

key-files:
  created:
    - packages/triarch-shared/src/schema.ts (modified)
    - src/db/migrations/0020_inclusion_state.sql
    - src/db/migrations/meta/_journal.json (modified)
    - src/lib/inclusion-state.ts
    - src/lib/inclusion-state.test.ts
  modified:
    - packages/triarch-shared/package.json (version 0.3.1 → 0.4.0)
    - package.json (admin version 2.13.28 → 2.14.0; shared pin ^0.3.0 → ^0.4.0)
    - package-lock.json
    - src/lib/version.ts (v2.13.28 → v2.14.0)

key-decisions:
  - "Migration applied via direct node-pg DDL (not drizzle-kit push) because push hung on schema introspection against CRDB; identical SQL, idempotent statement-by-statement application, all 10 statements logged OK"
  - "Pitfall 2 guard verified live: both new FK constraints use ON DELETE set null (NOT cascade) — deleting a release row will null the FK, never delete bugs/features"
  - "rejected enum value present in schema but EXCLUDED from MANUAL_TRANSITIONS forward targets per B-3 revision — no UI path drives transition to rejected in v2.4"
  - "Partial indexes scoped to inclusion_state = 'approved_for_build' (the hot read path for next-build-plan page) instead of full index"

patterns-established:
  - "State-machine validator: pure function + frozen transition map + comprehensive RED→GREEN test coverage including negative cases"
  - "Migration drift recovery: when drizzle-kit cannot see the local workspace package (because it resolves the registry-installed version), hand-write the migration to match the locked plan DDL and verify via drizzle-kit check"

requirements-completed: [INCL-01, INCL-02]

duration: ~25min
completed: 2026-05-18
---

# Phase 36-01: Shared Schema Bump Summary

**Inclusion-state lifecycle columns + state-machine helper landed across the shared package and admin, with prod CockroachDB migration applied via direct DDL. Gates every other plan in Phase 36.**

## Performance

- **Duration:** ~25 min (Tasks 1-3 ~5 min via executor agent; Task 4 ~20 min for publish + db:push + PR coordination)
- **Started:** 2026-05-18T17:57Z
- **Completed:** 2026-05-18T18:18Z
- **Tasks:** 4/4 (Tasks 1-3 agent-executed; Task 4 user-with-Claude assisted)
- **Files modified:** 9 (5 created/modified by executor + 4 from version bump pass)

## Accomplishments

- **Schema additions live on prod CockroachDB** — 4 columns (2 per table), 4 constraints (2 CHECK + 2 FK with ON DELETE set null), 2 partial indexes. Verified via information_schema + pg_constraint + pg_indexes queries.
- **`@triarchsecurity/triarch-shared@0.4.0` published** — publish-shared.yml workflow succeeded on `shared/v0.4.0` tag push; admin re-pinned and installed cleanly.
- **State-machine helper shipped** — `src/lib/inclusion-state.ts` exports `canManuallyTransition`, `MANUAL_TRANSITIONS`, allowed-state-list; 16/16 Vitest tests GREEN (RED→GREEN cycle observed). 'rejected' explicitly absent from forward transitions per B-3 revision.
- **Pitfall 2 guard satisfied** — both new FK constraints use `ON DELETE set null`. Live verification: `pg_constraint` shows correct `confdeltype = 'n'`. Zero `cascade` on new FK lines.
- **PR #110 opened against dev** — https://github.com/triarchsecurity/platform/pull/110

## Task Commits

1. **Task 1: Schema + shared package bump** — `d6118b6` (feat)
2. **Task 2: Migration 0020 + journal entry** — `8895c95` (feat)
3. **Task 3 RED: failing test** — `6ac33e8` (test)
3. **Task 3 GREEN: helper implementation** — `0571947` (feat)
4. **Task 4 close: version bump + pin** — `d178d09` (chore — version bump)

_Plan SUMMARY.md to be committed separately via gsd-tools._

## Files Created/Modified

- `packages/triarch-shared/src/schema.ts` — added inclusion_state + next_release_log_id columns to bugReports + featureRequests
- `packages/triarch-shared/package.json` — 0.3.1 → 0.4.0
- `src/db/migrations/0020_inclusion_state.sql` — hand-written 10-statement DDL (ADD COLUMN × 4 + ADD FK × 2 + ADD CHECK × 2 + CREATE INDEX × 2)
- `src/db/migrations/meta/_journal.json` — appended 0020_inclusion_state entry at idx 17
- `src/lib/inclusion-state.ts` — state-machine validator (NEW)
- `src/lib/inclusion-state.test.ts` — 16-test suite (NEW)
- `package.json` — admin version 2.13.28 → 2.14.0; shared pin ^0.3.0 → ^0.4.0
- `package-lock.json` — re-resolved to triarch-shared@0.4.0
- `src/lib/version.ts` — APP_VERSION 'v2.13.28' → 'v2.14.0'

## Deviations & Recoveries

**1. drizzle-kit generate could not see local workspace package**
- Symptom: `npx drizzle-kit generate` produced migrations for old (registry-installed 0.3.1) schema, not the local 0.4.0 with new columns
- Root cause: GitHub Packages installed copy in node_modules takes precedence over `packages/triarch-shared/` workspace path
- Fix: Hand-wrote `0020_inclusion_state.sql` matching the canonical DDL from Plan 36-01 Task 2 step 1; appended journal entry manually; verified via `drizzle-kit check` (exit 0, "Everything's fine")
- Auto-fixed; no scope expansion

**2. drizzle-kit push hung on CRDB schema introspection**
- Symptom: `npm run db:push` spun on "Pulling schema from database..." for >5 minutes without progress; direct node-pg connection to same DATABASE_URL succeeded in <1 sec
- Root cause: drizzle-kit's pg introspection appears to issue queries CRDB takes minutes to answer (large information_schema scan)
- Fix: Applied migration 0020 SQL directly via node-pg statement-by-statement; verified live schema via information_schema/pg_constraint/pg_indexes queries
- Auto-fixed; no scope expansion; SQL identical to the migration file (drizzle-kit push would have generated the same statements)

## What this enables

Wave 2 plans (36-02, 36-03, 36-04, 36-06) can now reference `inclusion_state` and `next_release_log_id` columns in queries, import `canManuallyTransition` from `@/lib/inclusion-state`, and assume the partial indexes exist for fast filtering. Wave 3/4 UI plans consume the data shaped by Wave 2.

## Outstanding from this plan

- PR #110 awaiting merge to dev (then dev → main promotion)
- PKG-04 drift gate should pass — shared package version bump + schema land in same commit `d6118b6`
- After merge: FAH dev backend auto-deploys v2.14.0
