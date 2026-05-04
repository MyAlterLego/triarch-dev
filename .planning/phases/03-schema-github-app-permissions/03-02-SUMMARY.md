---
phase: 03-schema-github-app-permissions
plan: 02
subsystem: database
tags: [drizzle, cockroachdb, migration, schema, slack-audit, ottobot]

# Dependency graph
requires:
  - "03-01 (migration 0010 snapshot — 0011 delta requires 0010 as base)"
provides:
  - "slackActionAudit pgTable with 8 columns in schema.ts"
  - "Migration 0011_thick_wallow.sql: CREATE TABLE slack_action_audit + CREATE INDEX on (created_at DESC NULLS LAST)"
  - "index() import added to drizzle-orm/pg-core imports in schema.ts"
affects:
  - "07-ottobot-hardening — Phase 7 OTTOBOT-01 dispatcher writes rows; OTTOBOT-06 audit viewer paginates DESC by created_at"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Drizzle non-unique DESC index via index() factory with table.col.desc() in third-arg builder"
    - "Standalone audit table with no FK relations (immutable, actor_slack_id may not map to any other entity)"
    - "Nullable email + required slack_id pattern (SLACK_USER_MAP resolution; unmapped users still audited)"

key-files:
  created:
    - "src/db/migrations/0011_thick_wallow.sql"
    - "src/db/migrations/meta/0011_snapshot.json"
  modified:
    - "src/db/schema.ts"
    - "src/db/migrations/meta/_journal.json"

key-decisions:
  - "actor_email nullable — unmapped Slack users have null email but actor_slack_id is always present (CONTEXT decisions)"
  - "payload_hash text (hex) instead of full payload jsonb — bounded row size for high-volume action_ids (CONTEXT specifics)"
  - "latency_ms integer not bigint — Slack 3-sec rule means values always < 3000ms"
  - "No relations() block — audit logs are immutable standalone; no FK to any other table"
  - "DB push deferred to Mike post-merge — DATABASE_URL is Firebase App Hosting secret (same precedent as 03-01)"

patterns-established:
  - "SCHEMA-02 table placement: v2.0 Phase 3 Slack audit table inserted between accessAuditLogs and Relations block"
  - "Non-unique DESC index pattern: index('name').on(table.col.desc()) in third-arg array builder"

requirements-completed: [SCHEMA-02]

# Metrics
duration: 2min
completed: 2026-05-04
---

# Phase 03 Plan 02: slackActionAudit Table + Migration 0011 Summary

**slackActionAudit pgTable with 8 columns and DESC index added to schema.ts; migration 0011_thick_wallow.sql generated with CREATE TABLE + CREATE INDEX on created_at DESC**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-05-04T22:13:57Z
- **Completed:** 2026-05-04T22:15:44Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Added `index` to drizzle-orm/pg-core imports in schema.ts (first non-unique index in the schema)
- Declared `slackActionAudit = pgTable('slack_action_audit', ...)` with all 8 SCHEMA-02 columns: id (uuid PK), actionId (varchar 128), actorEmail (varchar 256, nullable), actorSlackId (varchar 64), payloadHash (text), responseStatus (integer), latencyMs (integer), createdAt (timestamptz)
- Third-arg builder declares `index('slack_action_audit_created_at_idx').on(table.createdAt.desc())` for Phase 7 OTTOBOT-06 DESC-paginated viewer
- Generated migration `0011_thick_wallow.sql` via `npm run db:generate` — drizzle-kit diffed against 0010 snapshot and produced CREATE TABLE + statement-breakpoint + CREATE INDEX

## Task Commits

1. **Task 1: Add slackActionAudit table to schema.ts** - `ef5c9e5` (feat)
2. **Task 2: Generate Drizzle migration 0011 for slack_action_audit** - `444e258` (feat)

## Files Created/Modified

- `src/db/schema.ts` — Added `index` to pg-core imports; added slackActionAudit pgTable declaration (8 columns + DESC index) between accessAuditLogs and Relations block
- `src/db/migrations/0011_thick_wallow.sql` — Generated migration: `CREATE TABLE "slack_action_audit"` with all 8 columns + `--> statement-breakpoint` + `CREATE INDEX "slack_action_audit_created_at_idx" ON "slack_action_audit" USING btree ("created_at" DESC NULLS LAST)`
- `src/db/migrations/meta/0011_snapshot.json` — Auto-generated Drizzle snapshot for migration 0011
- `src/db/migrations/meta/_journal.json` — Updated by drizzle-kit with 0011 entry (tag `0011_thick_wallow`)

## Migration SQL

```sql
CREATE TABLE "slack_action_audit" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "action_id" varchar(128) NOT NULL,
  "actor_email" varchar(256),
  "actor_slack_id" varchar(64) NOT NULL,
  "payload_hash" text NOT NULL,
  "response_status" integer NOT NULL,
  "latency_ms" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "slack_action_audit_created_at_idx" ON "slack_action_audit" USING btree ("created_at" DESC NULLS LAST);
```

## Column Nullability Confirmation

- `actor_email varchar(256)` — NULLABLE (no NOT NULL) — unmapped Slack users have null email; actor_slack_id is always present
- All other 7 columns — NOT NULL (id via PRIMARY KEY, others via explicit .notNull())

## Decisions Made

- **No metadata jsonb column**: CONTEXT specifics explicitly chose payload_hash (hex string) over full payload — bounds row size for high-volume action_ids
- **No relations() block**: Audit logs are immutable and standalone. actor_slack_id may not map to any other entity; action_id is a free-form identifier owned by the dispatcher
- **DB push deferred to Mike**: DATABASE_URL is a Firebase App Hosting secret not present in dev shell. Mike applies migrations 0010 + 0011 together via `npm run db:push` post-merge

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

**DB push deferred to Mike post-merge.**

After merging this branch, apply both migrations at once:

```bash
npm run db:push
```

This requires `DATABASE_URL` (Firebase App Hosting secret). Both migrations will apply sequentially:
1. Migration `0010_naive_havok.sql` (from Plan 03-01): `ALTER TABLE "release_logs" ADD COLUMN "branch" varchar(256) DEFAULT 'main'` + backfill UPDATE
2. Migration `0011_thick_wallow.sql` (this plan): `CREATE TABLE "slack_action_audit"` + `CREATE INDEX "slack_action_audit_created_at_idx"`

## Next Phase Readiness

- SCHEMA-02 complete at code level — `slack_action_audit` table declared, migration 0011 committed, DESC index on created_at in place
- Phase 7 OTTOBOT-01 can write rows to this table once Mike applies the migration
- Phase 7 OTTOBOT-06 viewer can paginate DESC by created_at efficiently (B-tree DESC index supports this without sort)
- Plan 03-03 (GitHub App permission upgrade) has no dependency on this plan — can proceed in parallel

## Self-Check

- [x] `src/db/schema.ts` modified — slackActionAudit table + index import
- [x] `src/db/migrations/0011_thick_wallow.sql` created
- [x] `src/db/migrations/meta/0011_snapshot.json` created
- [x] `src/db/migrations/meta/_journal.json` updated with 0011 entry
- [x] Task 1 commit `ef5c9e5` — verified in git log
- [x] Task 2 commit `444e258` — verified in git log
- [x] `npx tsc --noEmit` exits 0
- [x] `npx next build` succeeds (49 static pages, 0 errors)

---
*Phase: 03-schema-github-app-permissions*
*Completed: 2026-05-04*
