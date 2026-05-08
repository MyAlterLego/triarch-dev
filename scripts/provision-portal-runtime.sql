-- scripts/provision-portal-runtime.sql
-- Provision portal_runtime CRDB role with DML-only grants
--
-- Purpose: Defense-in-depth — portal connects with this role; admin retains sole migration authority.
--   A rogue or buggy operation from portal cannot mutate the schema (no CREATE/ALTER/DROP/TRUNCATE).
--   See REQUIREMENTS.md DB-02 (DML-only) and DB-04 (live ALTER rejection evidence).
--
-- Apply against the dev cluster:
--   cockroach sql --url "$ADMIN_CRDB_URL" -f scripts/provision-portal-runtime.sql
--
-- After applying this script, set the password out-of-band (never committed to VCS):
--   cockroach sql --url "$ADMIN_CRDB_URL" -e "ALTER USER portal_runtime WITH PASSWORD '<generated>';"
--   Password generation: openssl rand -base64 24 | tr -d '/+=' | head -c 32
--
-- Idempotent: CREATE USER IF NOT EXISTS is a no-op if portal_runtime already exists.
-- GRANT statements are safe to re-run — CockroachDB silently ignores duplicate grants.
-- Re-running after a partial failure is safe.
--
-- Single role shared between prod + dev portal backends (simpler RBAC profile — no portal_runtime_dev).
-- Admin's existing role and DATABASE_URL secret are NOT modified by this script.

-- Step 1: Create the role (IF NOT EXISTS makes this idempotent)
CREATE USER IF NOT EXISTS portal_runtime;

-- Step 2: Grant database-level CONNECT permission
GRANT CONNECT ON DATABASE triarch_dev TO portal_runtime;

-- Step 3: Grant schema-level USAGE (required to resolve table references inside public schema)
GRANT USAGE ON SCHEMA public TO portal_runtime;

-- Step 4: DML-only grants on ALL existing tables in public schema
-- Explicitly does NOT include CREATE, ALTER, DROP, TRUNCATE, REFERENCES, or ALL
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO portal_runtime;

-- Step 5: USAGE on all existing sequences in public schema
-- Ensures INSERT statements that use sequence-backed default values (e.g. unique_rowid()) can execute
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO portal_runtime;

-- Step 6: ALTER DEFAULT PRIVILEGES — future tables added by admin (via drizzle-kit push) auto-grant DML
-- to portal_runtime immediately on creation, preventing drift between schema landing and grant rollout.
-- Run as the session user (admin), so future tables created by admin inherit these grants.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO portal_runtime;

-- Step 7: ALTER DEFAULT PRIVILEGES — future sequences auto-grant USAGE to portal_runtime
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE ON SEQUENCES TO portal_runtime;


-- =============================================================================
-- Verification queries (commented out — copy-paste to verify after applying)
-- =============================================================================

-- Confirm portal_runtime user exists:
-- SHOW USERS;

-- Check database-level grants:
-- SHOW GRANTS ON DATABASE triarch_dev FOR portal_runtime;

-- Check schema-level grants:
-- SHOW GRANTS ON SCHEMA public FOR portal_runtime;

-- Check grants on all tables in public schema:
-- SHOW GRANTS ON TABLE * FOR portal_runtime;

-- Sanity check one specific table:
-- SHOW GRANTS ON TABLE projects FOR portal_runtime;

-- Check default privilege configuration (replace <admin-role> with the admin SQL user, e.g. triarch_admin):
-- SHOW DEFAULT PRIVILEGES FOR ROLE <admin-role> IN SCHEMA public;
