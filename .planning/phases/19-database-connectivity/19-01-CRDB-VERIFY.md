# 19-01 CRDB Verification Log

**Date:** 2026-05-08
**Cluster:** triarchdev-24092.j77.aws-us-east-2.cockroachlabs.cloud:26257
**Database:** triarch_dev
**Executed by:** GSD executor (claude-sonnet-4-6), gcloud authed as mike@triarchsecurity.com

---

## Apply Transcript

Script applied via:
```
cockroach sql --url "$ADMIN_URL" -f scripts/provision-portal-runtime.sql
```

Output (verbatim):
```
CREATE ROLE
GRANT
GRANT
GRANT
GRANT
ALTER DEFAULT PRIVILEGES
ALTER DEFAULT PRIVILEGES
```

Password set out-of-band via:
```
cockroach sql --url "$ADMIN_URL" -e "ALTER USER portal_runtime WITH PASSWORD '<redacted>';"
```
Output: `ALTER ROLE`

---

## SHOW GRANTS Output

### SHOW USERS (grep portal_runtime)
```
portal_runtime  {}  {}  NULL
```
Confirms: portal_runtime user exists in cluster.

### SHOW GRANTS ON DATABASE triarch_dev FOR portal_runtime
```
database_name   grantee          privilege_type   is_grantable
triarch_dev     portal_runtime   CONNECT          f
triarch_dev     public           CONNECT          f
```
Confirms: CONNECT granted, no DDL database-level privileges.

### SHOW GRANTS ON SCHEMA public FOR portal_runtime
```
database_name   schema_name   grantee          privilege_type   is_grantable
triarch_dev     public        portal_runtime   USAGE            f
triarch_dev     public        public           CREATE           f
triarch_dev     public        public           USAGE            f
```
Confirms: USAGE on schema public granted. No CREATE for portal_runtime (public role has CREATE, not portal_runtime).

### SHOW GRANTS ON TABLE projects FOR portal_runtime
```
database_name   schema_name   table_name   grantee          privilege_type   is_grantable
triarch_dev     public        projects     portal_runtime   DELETE           f
triarch_dev     public        projects     portal_runtime   INSERT           f
triarch_dev     public        projects     portal_runtime   SELECT           f
triarch_dev     public        projects     portal_runtime   UPDATE           f
```
Confirms: DML-only (SELECT, INSERT, UPDATE, DELETE). No CREATE, ALTER, DROP, TRUNCATE, REFERENCES, or ALL visible.

---

## DB-04 ALTER Rejection (Live Evidence)

### Sanity check — SELECT succeeds (DML works)

Connected as portal_runtime (password redacted, URL-encoded in connection string):
```
cockroach sql --url "$PORTAL_URL" -e "SELECT count(*) FROM projects;"
```
Output:
```
count
7
```
DML SELECT confirmed working.

### Smoke test — ALTER must fail (DB-04 live evidence)
```
cockroach sql --url "$PORTAL_URL" -e "ALTER TABLE projects ADD COLUMN test_phase19 text;"
```
Output (verbatim):
```
ERROR: must be owner of table projects or have CREATE privilege on table projects
SQLSTATE: 42501
Failed running "sql"
```

**DB-04 SATISFIED.** Connecting as `portal_runtime` and attempting DDL (ALTER TABLE) returns CockroachDB permission denied. The error text above is the verbatim rejection message.

---

## GCP Secret + IAM Evidence

### gcloud secrets versions list DATABASE_URL_PORTAL
```
NAME  STATE    CREATED              DESTROYED
1     enabled  2026-05-08T18:48:53  -
```
Confirms: Secret `DATABASE_URL_PORTAL` exists in `triarch-vault` with version 1 ENABLED.

### gcloud secrets get-iam-policy DATABASE_URL_PORTAL
```
bindings:
- members:
  - serviceAccount:firebase-app-hosting-compute@triarch-dev-website.iam.gserviceaccount.com
  role: roles/secretmanager.secretAccessor
- members:
  - serviceAccount:service-276081117950@gcp-sa-firebaseapphosting.iam.gserviceaccount.com
  role: roles/secretmanager.secretVersionManager
etag: BwZRUtmS2Js=
version: 1
```
Confirms: `roles/secretmanager.secretAccessor` granted to FAH compute SA; `roles/secretmanager.secretVersionManager` granted to FAH service agent.

Secret value: NOT shown here (never written to disk or logs). Value is the portal_runtime PostgreSQL connection string.

---

## Password Lifecycle

- Generated locally via `openssl rand -base64 24 | tr -d '/+=' | head -c 32`
- Applied to CRDB cluster out-of-band via `ALTER USER portal_runtime WITH PASSWORD '...'`
- Piped directly to `gcloud secrets versions add --data-file=-` (never written to disk or log)
- Local temp file destroyed via `rm -P` (secure overwrite)
- Password not in VCS, not in log files, not in this document

---

## Rotation Procedure

To rotate `portal_runtime` password when needed:

1. **Generate new password locally:**
   ```bash
   NEW_PW=$(openssl rand -base64 24 | tr -d '/+=' | head -c 32)
   ```

2. **Update CRDB role password:**
   ```bash
   cockroach sql --url "$ADMIN_URL" \
     -e "ALTER USER portal_runtime WITH PASSWORD '$NEW_PW';"
   ```

3. **URL-encode and compose new connection string:**
   ```bash
   NEW_PW_ENC=$(printf '%s' "$NEW_PW" | python3 -c \
     'import urllib.parse,sys;print(urllib.parse.quote(sys.stdin.read(), safe=""))')
   NEW_URL="postgresql://portal_runtime:${NEW_PW_ENC}@triarchdev-24092.j77.aws-us-east-2.cockroachlabs.cloud:26257/triarch_dev?sslmode=verify-full"
   ```

4. **Add new GCP secret version:**
   ```bash
   printf '%s' "$NEW_URL" | \
     gcloud secrets versions add DATABASE_URL_PORTAL --project=triarch-vault --data-file=-
   ```

5. **Trigger portal redeploy** — FAH picks up the new secret version on cold start (or next deploy).

6. **After portal confirmed running on new version, optionally disable old version:**
   ```bash
   gcloud secrets versions disable <old-version-number> \
     --secret=DATABASE_URL_PORTAL --project=triarch-vault
   ```

Note: Admin's `DATABASE_URL` is completely independent — only `DATABASE_URL_PORTAL` (and the CRDB `portal_runtime` user) are changed during a portal password rotation.
