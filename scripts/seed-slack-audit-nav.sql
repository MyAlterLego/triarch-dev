-- Phase 7 OTTOBOT-06 — seed menu_pages row for /admin/platform/slack-audit
--
-- AdminSidebar is DB-driven via DynamicSidebar from @myalterlego/shared-ui;
-- it fetches navigation from /api/platform/navigation which reads menu_pages.
-- Adding the nav entry requires this INSERT — editing AdminSidebar.tsx has
-- NO effect (RESEARCH §10 + Pitfall 10).
--
-- Idempotent via ON CONFLICT DO NOTHING on the unique index
-- menu_pages_section_key_idx (section_id, key).
--
-- HOW TO APPLY:
--   1. Read DATABASE_URL from Firebase App Hosting secret:
--        firebase apphosting:secrets:access DATABASE_URL --project triarch-dev > /tmp/.db_url
--   2. psql "$(cat /tmp/.db_url)" -f scripts/seed-slack-audit-nav.sql
--   3. Verify:
--        psql "$(cat /tmp/.db_url)" -c "SELECT path, min_role FROM menu_pages WHERE path='/admin/platform/slack-audit';"
--   4. Reload admin in browser as a staff user — 'Slack Audit' link should appear
--      in the sidebar under Platform.
--
-- min_role='staff' ensures DynamicSidebar's role gate hides the entry from
-- customer admins (CONTEXT D-24). The page itself ALSO enforces this via
-- getCurrentUserContext.isStaff in server-component code (defense in depth).
--
-- If this INSERT returns 0 rows affected (verified by the SELECT below):
--   The WHERE clause (project='triarch-dev' AND key='platform') may not match
--   the actual platform menu_section row in production. Inspect actual rows:
--
--     SELECT id, project, key, label FROM menu_sections ORDER BY project, sort_order;
--
--   Then adjust the WHERE clause below to match the correct project and key values.

INSERT INTO menu_pages (
  section_id,
  key,
  label,
  icon,
  path,
  sort_order,
  is_active,
  min_role
)
SELECT
  ms.id            AS section_id,
  'slack-audit'    AS key,
  'Slack Audit'    AS label,
  'shield-check'   AS icon,
  '/admin/platform/slack-audit' AS path,
  100              AS sort_order,
  true             AS is_active,
  'staff'          AS min_role
FROM menu_sections ms
WHERE ms.project = 'triarch-dev'
  AND ms.key = 'platform'
ON CONFLICT (section_id, key) DO NOTHING;

-- Verification query — run after the INSERT to confirm the row landed:
-- SELECT id, label, path, min_role, sort_order FROM menu_pages
-- WHERE path = '/admin/platform/slack-audit';
