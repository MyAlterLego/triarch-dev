-- Phase: Help / Feedback nav for cross-project standardization (3/7)
--
-- Seeds the DB-driven nav with a "Help" section + "Bug / Feature Request"
-- page pointing at /feedback in the central admin (triarch-dev). The page
-- itself lives at src/app/feedback/page.tsx and POSTs to the existing
-- same-origin /api/platform/{bug-reports,feature-requests} routes — no
-- API-key auth required because this app IS the destination tracker.
--
-- AdminSidebar is rendered via DynamicSidebar from @triarchsecurity/shared-ui;
-- it fetches navigation from /api/platform/navigation which reads
-- menu_sections + menu_pages. Adding the nav entries requires this INSERT —
-- editing AdminSidebar.tsx has NO effect.
--
-- Idempotent via ON CONFLICT DO NOTHING on the unique indexes
-- menu_sections_project_key_idx (project, key) and
-- menu_pages_section_key_idx (section_id, key).
--
-- HOW TO APPLY (manual; SQL migrations don't auto-run in this app):
--   1. Read DATABASE_URL from Firebase App Hosting secret:
--        firebase apphosting:secrets:access DATABASE_URL --project triarch-dev-website > /tmp/.db_url
--   2. psql "$(cat /tmp/.db_url)" -f src/db/migrations/0020_help_section_feedback_nav.sql
--   3. Verify both rows landed:
--        psql "$(cat /tmp/.db_url)" -c "SELECT s.label AS section, p.label AS page, p.path FROM menu_sections s JOIN menu_pages p ON p.section_id = s.id WHERE s.project='triarch-dev' AND s.key='help';"
--   4. Reload admin in browser as a signed-in user — 'Help → Bug / Feature
--      Request' should appear in the sidebar.

BEGIN;

-- 1. menu_sections row for Help — top-level section that holds the feedback link
INSERT INTO menu_sections (project, key, label, icon, sort_order, is_active, min_role)
VALUES ('triarch-dev', 'help', 'Help', 'circle-help', 100, true, 'user')
ON CONFLICT (project, key) DO NOTHING;

-- 2. menu_pages row for /feedback — joins to the Help section by (project, key)
INSERT INTO menu_pages (section_id, key, label, icon, path, sort_order, is_active, min_role)
SELECT
  ms.id                       AS section_id,
  'feedback'                  AS key,
  'Bug / Feature Request'     AS label,
  'message-square-plus'       AS icon,
  '/feedback'                 AS path,
  0                           AS sort_order,
  true                        AS is_active,
  'user'                      AS min_role
FROM menu_sections ms
WHERE ms.project = 'triarch-dev'
  AND ms.key = 'help'
ON CONFLICT (section_id, key) DO NOTHING;

COMMIT;

-- Verification (run separately after the migration commits):
-- SELECT s.project, s.key AS section_key, s.label AS section_label, s.sort_order,
--        p.key AS page_key, p.label AS page_label, p.path, p.min_role
-- FROM menu_sections s
-- LEFT JOIN menu_pages p ON p.section_id = s.id
-- WHERE s.project = 'triarch-dev' AND s.key = 'help';
