---
status: partial
phase: 31-cl3-db-namespace-audit
source: [31-CONTEXT.md]
started: 2026-05-16T00:00:00Z
updated: 2026-05-16T00:00:00Z
---

# Phase 31 — DB Namespace Manual Runbook

## A. Verify dev/prod secrets point to distinct databases (5 projects)

For each of platform, darksouls, tmi, truthtreason, security-portal — confirm their `DATABASE_URL_DEV` and `DATABASE_URL` secrets resolve to different CRDB databases.

```bash
# 1. Read both secret values (substitute PROJECT_ID for each project's Firebase project)
PROJECT_ID=triarch-dev-website  # or triarchsecurity-admin, triarchsecurity-portal, etc.

DEV_URL=$(firebase apphosting:secrets:access DATABASE_URL_DEV --project $PROJECT_ID)
PROD_URL=$(firebase apphosting:secrets:access DATABASE_URL --project $PROJECT_ID)

# 2. Extract database name from each (last path segment before query string)
echo "Dev DB:  $(echo $DEV_URL | sed 's|.*/||; s|?.*||')"
echo "Prod DB: $(echo $PROD_URL | sed 's|.*/||; s|?.*||')"

# 3. Expect: Dev DB name ends in "_dev" or is otherwise distinct from prod
# Example expected: "triarchsecurity_platform_dev" vs "triarchsecurity_platform"
```

| Project | Firebase project | Expected dev DB | Expected prod DB | Pass? |
|---------|------------------|-----------------|------------------|-------|
| platform | triarch-dev-website | `triarchsecurity_platform_dev` | `triarchsecurity_platform` | [ ] |
| darksouls | triarch-dev-website (?) | `darksouls_dev` | `darksouls` | [ ] |
| tmi | triarch-dev-website (?) | `tmi_dev` | `tmi` | [ ] |
| truthtreason | triarch-dev-website (?) | `truthtreason_dev` | `truthtreason` | [ ] |
| security-portal | triarchsecurity-portal | `portal_dev` | `portal` | [ ] |

If any row's dev DB == prod DB → that project also has the dev-portal-style violation. Apply Section B remediation steps to it.

## B. Fix dev-portal (CONFIRMED VIOLATION)

dev-portal currently binds `DATABASE_URL_PORTAL` to BOTH apphosting.yaml and apphosting.dev.yaml — dev writes leak to prod.

### B.1. Confirm CRDB has portal_dev database (or create it)

```bash
# Connect to CRDB cluster (use prod admin URL — credentials in firebase secrets)
DATABASE_URL=$(firebase apphosting:secrets:access DATABASE_URL_PORTAL --project triarch-dev-website)
psql "$DATABASE_URL" -c "\l" | grep portal_dev

# If row returned: database exists, skip to B.2
# If empty: create the database
psql "$DATABASE_URL" -c "CREATE DATABASE portal_dev;"

# Optional: clone schema from prod (no data — fresh test environment)
pg_dump --schema-only "$DATABASE_URL" | psql "${DATABASE_URL%/portal*}/portal_dev"
```

### B.2. Mint DATABASE_URL_PORTAL_DEV GCP secret

```bash
# Construct the dev URL (same cluster, different database name)
PORTAL_DEV_URL=$(echo $DATABASE_URL | sed 's|/portal\([?]\\|$\\)|/portal_dev\1|')
echo "$PORTAL_DEV_URL" > /tmp/portal_dev_url.txt

firebase apphosting:secrets:set DATABASE_URL_PORTAL_DEV \
  --project triarch-dev-website \
  --data-file /tmp/portal_dev_url.txt
rm /tmp/portal_dev_url.txt

# Grant FAH dev backend access
firebase apphosting:secrets:grantaccess DATABASE_URL_PORTAL_DEV \
  --backend portal-dev \
  --project triarch-dev-website
```

### B.3. Update dev-portal apphosting.dev.yaml

Edit `/Users/mikegeehan/claude/triarch/shared/dev-portal/apphosting.dev.yaml`:

```diff
-  - variable: DATABASE_URL
-    secret: DATABASE_URL_PORTAL
+  - variable: DATABASE_URL
+    secret: DATABASE_URL_PORTAL_DEV
```

Bump dev-portal version + commit + PR per workspace CLAUDE.md.

### B.4. Verify dev-portal post-deploy

```bash
# After dev-portal redeploys to portal-dev backend, hit a read endpoint that logs the database name
curl -sI https://portal-dev.triarch.dev/api/health
# Verify dev backend writes go to portal_dev (e.g., create a test approval in dev, query portal_dev directly to confirm presence)
```

## C. Per-project audit of CRDB databases

```bash
# Query CRDB for all databases — confirm naming pattern is followed
DATABASE_URL=$(firebase apphosting:secrets:access DATABASE_URL --project triarch-dev-website)
psql "$DATABASE_URL" -c "SHOW DATABASES;" | grep -E "^(triarchsecurity_|darksouls|tmi|truthtreason|portal)"

# Expected pattern: each project has both a "<name>" and "<name>_dev" database
# Flag any project that has only one (or shares a database across projects)
```

## D. Success Criteria

- [ ] dev-portal: DATABASE_URL_PORTAL_DEV secret exists, dev backend uses it, portal_dev CRDB database exists
- [ ] platform, darksouls, tmi, truthtreason, security-portal: confirmed via Section A that dev/prod URLs point to distinct databases (or remediated if not)
- [ ] No project's dev backend writes go to its prod database
- [ ] security-admin's apphosting.dev.yaml + DATABASE_URL_DEV created in Phase 33

## Summary

total: 7
passed: 0
issues: 1 (dev-portal confirmed violation; 5 pending value verification; 1 blocked by Phase 33)
pending: 6
skipped: 0
blocked: 1

## Gaps
