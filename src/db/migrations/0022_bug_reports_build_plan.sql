-- Phase: Centralize build-plan generation + Build Queue Kanban (v2.16.0)
--
-- Adds the three plan columns to `bug_reports` so the new
-- /api/platform/bug-reports/[id]/generate-plan route can write back a
-- Claude-generated build plan, plus seeds the Modules nav with a
-- Build Queue page pointing at /admin/modules/build-queue.
--
-- Background:
-- - feature_requests already has these three columns in the shared schema
--   (@triarchsecurity/triarch-shared). bug_reports does NOT — the centralization
--   work in security-admin@c2ed391 left bug_reports without the plan fields
--   because admin.triarch.dev never had a generate-plan surface for bugs.
-- - This migration mirrors the feature columns onto bugs so both entity
--   types share the same plan-status lifecycle from now on.
--
-- CRDB constraint (per ~/.claude/MEMORY/feedback_crdb_split_alter_backfill.md):
-- CockroachDB rejects UPDATE on a newly-added column in the same batch as
-- the ALTER. We don't UPDATE here, but we still split each ALTER into its
-- own statement so this file stays safe to re-run via psql -f even if a
-- future hand-edit adds a backfill.
--
-- HOW TO APPLY (manual; SQL migrations don't auto-run in this app):
--   1. Read DATABASE_URL from .env.local (already populated for prod CRDB)
--   2. npx tsx scripts/run-migration-0022.ts
--   3. Verify in psql: \d bug_reports — confirm build_plan, build_plan_status,
--      estimated_effort columns exist.
--   4. Verify nav: psql ... -c "SELECT s.label, p.label, p.path FROM menu_pages p
--      JOIN menu_sections s ON s.id = p.section_id WHERE s.project='triarch-dev'
--      AND s.key='modules' AND p.key='build-queue';"

BEGIN;

-- ── 1. bug_reports plan columns (3 separate ALTERs per CRDB constraint) ────

ALTER TABLE bug_reports ADD COLUMN IF NOT EXISTS build_plan JSONB;

ALTER TABLE bug_reports ADD COLUMN IF NOT EXISTS build_plan_status VARCHAR(16) DEFAULT 'pending';

ALTER TABLE bug_reports ADD COLUMN IF NOT EXISTS estimated_effort VARCHAR(16);

-- ── 2. menu_pages row for /admin/modules/build-queue ───────────────────────
-- The 'modules' section under 'triarch-dev' already exists (seeded out of
-- band before migration tracking started). Existing pages in that section
-- max out at sort_order=5 (tracker..reports). Build queue gets 6.
-- ON CONFLICT keeps the migration idempotent on re-runs.

INSERT INTO menu_pages (section_id, key, label, icon, path, sort_order, is_active, min_role)
SELECT
  ms.id            AS section_id,
  'build-queue'    AS key,
  'Build Queue'    AS label,
  'kanban-square'  AS icon,
  '/admin/modules/build-queue' AS path,
  6                AS sort_order,
  true             AS is_active,
  'staff'          AS min_role
FROM menu_sections ms
WHERE ms.project = 'triarch-dev'
  AND ms.key = 'modules'
ON CONFLICT (section_id, key) DO NOTHING;

COMMIT;

-- Verification (run separately):
-- SELECT column_name, data_type FROM information_schema.columns
--  WHERE table_name='bug_reports'
--    AND column_name IN ('build_plan','build_plan_status','estimated_effort');
--
-- SELECT s.label AS section, p.label AS page, p.path
--   FROM menu_pages p JOIN menu_sections s ON s.id = p.section_id
--  WHERE s.project='triarch-dev' AND p.key='build-queue';
