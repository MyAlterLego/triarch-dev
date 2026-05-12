-- Agent identities & API keys for admin.triarch.dev (Sitting H)
-- Adds the auth surface for the project-health agent MCP integration.
--
-- Pattern mirrors the security-admin migration 0011_agent_identities.sql.
-- This is a SEPARATE table on a SEPARATE database (admin.triarch.dev's CRDB);
-- agent identities are not shared with admin.triarchsecurity.com.
--
-- Scopes used here:
--   read:projects        — list projects + bugs + features + release_logs + derived health
--   write:audit          — every agent gets this (explicit audit log writes; matches sec side)
--
-- Future scopes could include:
--   triage:bugs          — agent flags a bug as duplicate / low-priority, user approves
--   write:features       — agent files a feature request directly (trust-first)
--   read:release_logs    — sub-scope if we ever want finer granularity
--
-- All writes by agents are logged to the existing audit-log surface
-- (see src/lib/agent-auth.ts ported from security-admin).
--
-- ── Membership scoping ──
-- We also insert project_members wildcard rows (project_key='*') for each
-- seeded agent. This lets the existing requireSignedIn → getCurrentUserContext
-- membership-filter code path treat agent identities the same as staff
-- humans without per-route changes.

BEGIN;

CREATE TABLE IF NOT EXISTS agent_identities (
  id                uuid                       PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text                       NOT NULL UNIQUE,                     -- 'operator'
  persona_name      text,                                                            -- 'Cyrus Drake'
  description       text,                                                            -- role summary
  api_key_hash      text                       NOT NULL UNIQUE,                     -- sha256(api_key) hex
  api_key_prefix    text                       NOT NULL,                            -- first 8 chars: 'tak_a1b2'
  scopes            jsonb                      NOT NULL DEFAULT '[]'::jsonb,        -- array of scope strings
  email             text,                                                            -- 'operator@triarch.dev' (Gmail/identity target)
  created_at        timestamp with time zone   NOT NULL DEFAULT now(),
  created_by        text                       NOT NULL,                            -- 'mike@triarchsecurity.com'
  last_used_at      timestamp with time zone,
  disabled_at       timestamp with time zone                                         -- null = active; set to revoke
);

CREATE INDEX IF NOT EXISTS agent_identities_active_idx
  ON agent_identities (disabled_at)
  WHERE disabled_at IS NULL;

CREATE INDEX IF NOT EXISTS agent_identities_name_idx
  ON agent_identities (name);

-- Seed the project-health agents.
-- api_key_hash is set to a per-agent placeholder string so the UNIQUE
-- constraint is satisfied; these are not valid sha256-hex and so will never
-- collide with a real token. They get replaced when the first real token is
-- minted via scripts/mint-agent-token.ts.
INSERT INTO agent_identities (name, persona_name, description, api_key_hash, api_key_prefix, scopes, email, created_by)
VALUES
  ('operator',
   'Cyrus Drake',
   'Read-only ops watch: CI, deploys, alerts, ticket triage. Drafts incident notes. Sources morning-briefing project-health section.',
   'PLACEHOLDER_PENDING_operator',
   'tak_PEND',
   '["read:projects","write:audit"]'::jsonb,
   'operator@triarch.dev',
   'mike@triarchsecurity.com'),

  ('algorithm',
   'Vera Sterling',
   'PAI Algorithm orchestrator. Broad read of project state for multi-step planning.',
   'PLACEHOLDER_PENDING_algorithm',
   'tak_PEND',
   '["read:projects","write:audit"]'::jsonb,
   'algorithm@triarch.dev',
   'mike@triarchsecurity.com')
ON CONFLICT (name) DO NOTHING;

-- ── Wildcard staff membership rows for each agent ──
-- Lets getCurrentUserContext treat the agent's email as having staff-wide read
-- without ad-hoc per-route bypass logic. Role='staff' matches the existing
-- staff wildcard pattern documented in projectMembers schema header.
INSERT INTO project_members (project_key, email, role)
VALUES
  ('*', 'operator@triarch.dev', 'staff'),
  ('*', 'algorithm@triarch.dev', 'staff')
ON CONFLICT DO NOTHING;

COMMIT;
