---
phase: 27-cl6-server-side-adoption
plan: 01
subsystem: database
tags: [schema, migration, drizzle, crdb, cl6, deploy-gate]
dependency_graph:
  requires: []
  provides:
    - deployGateCheck Drizzle table (importable as @/db/schema)
    - DeployGateCheck type (select inference)
    - NewDeployGateCheck type (insert inference)
    - Migration 0019 SQL ready to apply via db:push
  affects:
    - src/db/schema.ts (extended)
    - src/db/migrations/ (new file 0019)
tech_stack:
  added: []
  patterns:
    - pgTable with second-arg index callback (matches agentIdentities pattern)
    - text column for verdict (no pgEnum — matches promoteAttempts.result pattern)
    - timestamp with time zone in SQL (matches 0018_agent_identities.sql exactly)
    - BEGIN/COMMIT hand-written migration (not drizzle-kit auto-generated format)
key_files:
  created:
    - src/db/migrations/0019_deploy_gate_check.sql
  modified:
    - src/db/schema.ts
decisions:
  - "text (not pgEnum) for verdict column — matches established codebase pattern (promoteAttempts.result)"
  - "deployGateCheck added to src/db/schema.ts local additions file, NOT packages/triarch-shared/ — admin-internal table, no publish step needed"
  - "Composite index (project_key, created_at DESC) — covering index for 15-min lookback query at scale"
metrics:
  duration: "~2 minutes"
  completed_date: "2026-05-16"
  tasks: 2
  files_modified: 1
  files_created: 1
---

# Phase 27 Plan 01: Deploy Gate Check Schema + Migration Summary

**One-liner:** Drizzle `deploy_gate_check` table with 9-column shape and composite `(project_key, created_at DESC)` covering index, plus hand-written SQL migration 0019 in `BEGIN/COMMIT` + `gen_random_uuid()` format — data layer for CL-6 enforcement.

---

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add deployGateCheck table + index + type exports to src/db/schema.ts | `6bba1a7` | `src/db/schema.ts` (+39 lines, 1 modified) |
| 2 | Write 0019_deploy_gate_check.sql migration | `d6e4638` | `src/db/migrations/0019_deploy_gate_check.sql` (created) |

---

## Files Changed

### `src/db/schema.ts`

- Extended `import { pgTable, uuid, text, jsonb, timestamp }` to include `index`
- Appended `deployGateCheck` pgTable definition after `agentHasScope` function
- 9 columns: `id` (uuid PK defaultRandom), `projectKey`, `targetVersion`, `verdict`, `devVersion`, `apiKeyHash`, `reason` (nullable), `workflowRunUrl` (nullable), `createdAt` (timestamptz defaultNow notNull)
- Composite index `deploy_gate_check_project_created_at_idx` on `(project_key, created_at DESC)` via second-arg callback
- Type exports: `DeployGateCheck` (inferSelect), `NewDeployGateCheck` (inferInsert)
- `packages/triarch-shared/` — zero changes (admin-local only, per RESEARCH Pitfall 1)

### `src/db/migrations/0019_deploy_gate_check.sql`

- Hand-written SQL following `0018_agent_identities.sql` format exactly
- `BEGIN;` / `COMMIT;` wrapping
- `CREATE TABLE IF NOT EXISTS deploy_gate_check` with all 9 columns
- `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
- `created_at timestamp with time zone NOT NULL DEFAULT now()`
- `CREATE INDEX IF NOT EXISTS deploy_gate_check_project_created_at_idx ON deploy_gate_check (project_key, created_at DESC)`

---

## New Importable Symbols for Plans 02 and 03

```typescript
import { deployGateCheck, DeployGateCheck, NewDeployGateCheck } from '@/db/schema';
```

- `deployGateCheck` — Drizzle table ref for `.insert()`, `.select().from()`, etc.
- `DeployGateCheck` — TypeScript type for a select result row
- `NewDeployGateCheck` — TypeScript type for an insert values object

---

## CRITICAL: Manual Step Required Before Plan 03 Can Be Tested End-to-End

**PRE-PLAN-03 BLOCKER: Apply migration 0019 to CockroachDB before Plan 03 deploys to FAH dev.**

`DATABASE_URL` is a Firebase App Hosting secret — not available locally (per `CLAUDE.md`). The migration file has been written but NOT applied. The table does not yet exist in the CRDB cluster.

**How to apply:**

```bash
# Step 1: Retrieve the DATABASE_URL secret
firebase apphosting:secrets:access DATABASE_URL --project triarch-dev-website

# Step 2: Apply the migration using the retrieved URL
DATABASE_URL='<url-from-step-1>' npm run db:push
```

**When to do it:** After Plan 02's PR merges to dev (or at minimum before Plan 03's FAH dev backend deploys). Plan 01 and Plan 02 (the gate-verdict endpoint) can be code-complete without the table existing in CRDB. But any FAH dev deploy of Plan 03 (ingest route modification) that tries to query `deploy_gate_check` will crash at runtime until the migration is applied.

**Verification after applying:**

```sql
-- Confirm table and index exist on CRDB cluster:
SHOW CREATE TABLE deploy_gate_check;
SHOW INDEXES FROM deploy_gate_check;
```

---

## Verification Results

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | PASS — zero errors |
| `grep -c "export const deployGateCheck"` | 1 |
| `grep -c "deploy_gate_check_project_created_at_idx"` | 1 |
| `grep -c "export type DeployGateCheck ="` | 1 |
| `grep -c "export type NewDeployGateCheck ="` | 1 |
| `grep -c "pgEnum" src/db/schema.ts` | 0 (none) |
| `grep -c "from 'drizzle-orm/pg-core'"` | 1 (single import, extended) |
| Migration BEGIN/COMMIT | Present |
| Migration all 9 columns | Confirmed |
| Migration `timestamp with time zone` | Confirmed (not bare `timestamp`) |
| Migration `gen_random_uuid()` | Confirmed |
| `git diff --stat packages/` | No output — zero shared-package changes |
| `npx vitest run` | 325/365 passed — pre-existing baseline unchanged; 40 failures are DB-connection errors (`ECONNREFUSED localhost:5432`) in tests unrelated to this plan; confirmed identical failure count before and after changes |

---

## Deviations from Plan

None — plan executed exactly as written.

---

## Known Stubs

None. This plan is schema + migration file only. No application code, no stubs.

---

## Self-Check: PASSED

| Item | Status |
|------|--------|
| `src/db/schema.ts` exists | FOUND |
| `src/db/migrations/0019_deploy_gate_check.sql` exists | FOUND |
| `.planning/phases/27-cl6-server-side-adoption/27-01-SUMMARY.md` exists | FOUND |
| Commit `6bba1a7` (Task 1 schema) | FOUND |
| Commit `d6e4638` (Task 2 migration) | FOUND |
