-- deploy_gate_check table + covering index for CL-6 enforcement (Phase 27).
--
-- Audit + lookup target for two routes:
--   1. POST /api/platform/cicd/gate-verdict — writes rows from shared-workflows
--      gate runs (verdict='pass' or 'fail') BEFORE a prod deploy fires.
--   2. POST /api/platform/ingest/release-logs — when env='prod' and
--      CL6_ENFORCEMENT_MODE != 'off', reads the most-recent row for the
--      project in the prior 15 minutes and asserts (verdict='pass',
--      target_version match, api_key_hash match). Writes a synthetic
--      verdict='reject_no_pair' row when the pair is missing.
--
-- Covering index (project_key, created_at DESC) supports the lookback query
-- at scale; primary filter is project_key, secondary order is created_at.
--
-- 90-day audit retention is OUT OF SCOPE for this migration — manual cleanup
-- or a separate maintenance phase will handle retention.

BEGIN;

CREATE TABLE IF NOT EXISTS deploy_gate_check (
  id                uuid                       PRIMARY KEY DEFAULT gen_random_uuid(),
  project_key       text                       NOT NULL,
  target_version    text                       NOT NULL,
  verdict           text                       NOT NULL,   -- 'pass' | 'fail' | 'reject_no_pair' — validated in route handler
  dev_version       text                       NOT NULL,
  api_key_hash      text                       NOT NULL,   -- SHA-256 hex of Bearer token (never plaintext)
  reason            text,
  workflow_run_url  text,
  created_at        timestamp with time zone   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS deploy_gate_check_project_created_at_idx
  ON deploy_gate_check (project_key, created_at DESC);

COMMIT;
