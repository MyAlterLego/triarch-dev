# Phase 4 HUMAN-UAT: GitHub App Promotion

Phase 4 ships secure code that depends on a real GitHub App installation in the MyAlterLego org. This runbook is the human-side setup. Run through it once for production; re-run for any new staging environment that needs to dispatch workflows.

## Prerequisites

- Phase 4 plans 04-01 (schema migration), 04-02 (github-app.ts + tests), 04-03 (this plan's apphosting.yaml edits) merged to main
- Plan 04-04 NOT yet required - the smoke test in step 8 needs 04-04 wired, but the App can be created and secrets pushed in parallel
- Firebase CLI logged in to the triarch-dev-admin App Hosting backend
- Org admin permissions on github.com/MyAlterLego

## Step 1 - Create the GitHub App

1. Visit https://github.com/organizations/MyAlterLego/settings/apps
2. Click "New GitHub App"
3. Fill in:
   - **GitHub App name**: `triarch-dev-promotion` (or similar - must be globally unique)
   - **Homepage URL**: https://admin.triarch.dev
   - **Webhook**: UNCHECK "Active" (no webhook needed for dispatch-only flow)
   - **Webhook URL / secret**: leave blank
4. Click "Create GitHub App"
5. After creation, note the **App ID** at the top of the General page - this is `GITHUB_APP_ID`

## Step 2 - Set repository permissions

Still on the App's General settings page (or sidebar -> Permissions and events):

| Permission | Level | Why |
|------------|-------|-----|
| Actions    | Read and write | Required for workflow_dispatch (GATE-11a) |
| Contents   | Read-only      | Read repo metadata, default branch |
| Metadata   | Read-only      | Mandatory for all GitHub Apps |

Leave ALL other permissions at "No access". Specifically: no Pull requests, no Issues, no Deployments, no Webhooks subscription. Keep the blast radius minimal.

Save changes.

## Step 3 - Generate the private key

1. Sidebar -> Private keys
2. Click "Generate a private key"
3. Browser downloads a `.pem` file (e.g. `triarch-dev-promotion.2026-05-04.private-key.pem`)
4. Open the PEM file in a text editor. The contents look like:
   ```
   -----BEGIN RSA PRIVATE KEY-----
   MIIEowIBAAKCAQEA...
   ...many lines...
   -----END RSA PRIVATE KEY-----
   ```
5. Keep this file open - you paste the entire contents (including BEGIN/END lines) into Step 5.

Security note: this is the App's master credential. Treat it like SLACK_PAYLOAD_SECRET. Never commit it. After Step 5 succeeds, delete the local `.pem` file.

## Step 4 - Install the App on MyAlterLego

1. Sidebar -> Install App
2. Find "MyAlterLego" -> click "Install"
3. Choose "All repositories" (recommended - admin manages all org repos) OR "Only select repositories" and pick the repos that have a `deploy-prod.yml` workflow (e.g. darksouls-rpg, triarchsecurity-portal, etc.)
4. Click "Install"
5. After install, the URL contains the installation ID:
   ```
   https://github.com/organizations/MyAlterLego/settings/installations/<NUMBER>
   ```
   That `<NUMBER>` is `GITHUB_APP_INSTALLATION_ID`.

Alternative: visit https://github.com/organizations/MyAlterLego/settings/installations and click the gear next to the App's name - the URL on that page contains the installation ID.

## Step 5 - Push 3 secrets to App Hosting

From the admin repo root:

```bash
firebase apphosting:secrets:set GITHUB_APP_ID
# paste the App ID from Step 1 (numeric string)

firebase apphosting:secrets:set GITHUB_APP_PRIVATE_KEY
# paste ENTIRE PEM contents from Step 3, including the
# -----BEGIN RSA PRIVATE KEY----- and -----END RSA PRIVATE KEY----- lines
# Press Enter, then Ctrl-D (or whatever the firebase CLI prompts for) to commit

firebase apphosting:secrets:set GITHUB_APP_INSTALLATION_ID
# paste the installation ID from Step 4 (numeric string)
```

Each command grants the App Hosting backend service-account access to the secret. If the CLI asks "Grant access to backend triarch-dev-admin?" answer yes.

Then trigger a redeploy: `git push` any branch that lands on main (a no-op version bump is fine - see CLAUDE.md).

Note on private key formatting: github-app.ts normalizes literal `\n` sequences to real newlines automatically (see Plan 04-02 readEnv). If the firebase CLI escapes newlines, the code handles it. If it preserves them as actual newlines, the code also handles it. Either form works.

## Step 6 - Apply the schema migration

Plan 04-01 emitted `src/db/migrations/0009_promotion_dispatch_audit.sql`. Apply it to the production CockroachDB:

```bash
# Option A: drizzle-kit push (recommended if DATABASE_URL is in your local shell)
DATABASE_URL=<the production URL from Firebase secrets> npm run db:push

# Option B: apply the SQL manually via cockroach sql
cockroach sql --url <the production URL> < src/db/migrations/0009_promotion_dispatch_audit.sql
```

Verify in the DB:

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'release_logs'
  AND column_name IN ('promotion_dispatched_at', 'promotion_dispatched_by');
```

Should return both rows.

## Step 7 - Confirm code is deployed

1. Wait for App Hosting to finish the redeploy from Step 5
2. Tail the Cloud Run logs:
   ```bash
   gcloud run services logs read triarch-dev-build --project angular-concord-489522-c4 --limit 50
   ```
3. Look for clean startup - no `[github-app] missing required env vars` errors at request time

If you see "missing required env vars" - one of the secrets did not bind. Double-check `firebase apphosting:secrets:set` was run for each, and that the redeploy picked them up. The error message lists the specific missing var(s).

## Step 8 - End-to-end smoke test (requires Plan 04-04 deployed)

Skip this step until Plan 04-04 has shipped (Wave 2). The smoke test exercises the full chain: customer approves -> Slack message posts -> Mike clicks Promote -> dispatchWorkflow fires -> deploy-prod.yml runs.

1. Sign in to https://admin.triarch.dev as a customer-admin email of a project that has a `deploy-prod.yml` in its repo (e.g. darksouls-rpg)
2. Navigate to /projects/darksouls-rpg/releases
3. On a release in `dev` status, click "Approve for Production"
4. Within a few seconds, a message lands in #release-approvals
5. As mike@triarchsecurity.com (mapped Slack user), click "Approve and Promote"
6. Slack message updates to ":white_check_mark: Promoted to production by @mike (mike@triarchsecurity.com)"
7. Within ~10 seconds, a threaded reply appears: ":rocket: Workflow dispatched: deploy-prod.yml run #<N>"
8. Visit https://github.com/MyAlterLego/darksouls-rpg/actions - confirm a fresh `deploy-prod.yml` run started with `tag` input matching the release version
9. Verify in the DB:
   ```sql
   SELECT id, version, status, promotion_dispatched_at, promotion_dispatched_by
     FROM release_logs WHERE id = '<the release id>';
   ```
   - status = 'approved'
   - promotion_dispatched_at = recent timestamp (within the last minute)
   - promotion_dispatched_by = 'mike@triarchsecurity.com'

Failure-mode smoke test (optional - exercises GATE-11/error handling):

1. Temporarily set GITHUB_APP_INSTALLATION_ID to a wrong number (or revoke access to the target repo)
2. Click Promote on another release
3. Slack message updates to "Promoted" (the DB approval succeeds independently of dispatch)
4. Threaded reply: ":warning: Promotion dispatch failed: <reason>"
5. Original message gets `chat.update`'d to ":warning: Approved (promotion failed - see logs)" per CONTEXT.md Area 3
6. Restore the secret/installation, redeploy, retry from the GitHub Actions UI manually

## Verification checklist

- [ ] GitHub App created in MyAlterLego org with permissions: actions:write, contents:read, metadata:read (and nothing else)
- [ ] Private key (.pem) generated and downloaded
- [ ] App installed on MyAlterLego org with access to admin-managed repos
- [ ] GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, GITHUB_APP_INSTALLATION_ID pushed via `firebase apphosting:secrets:set`
- [ ] Local .pem file deleted after secrets pushed
- [ ] Schema migration 0009_promotion_dispatch_audit.sql applied to production CRDB
- [ ] App Hosting redeploy succeeded; no "missing required env vars" errors in logs
- [ ] (Once Plan 04-04 deployed) End-to-end smoke test passed - Slack click triggers a real deploy-prod.yml run
- [ ] Database row for the test release has promotion_dispatched_at and promotion_dispatched_by populated

## Rotation

To rotate the private key (e.g. annually, or on suspected compromise):

1. GitHub App settings -> Private keys -> Generate a private key (keeps the old one valid until you delete it)
2. `firebase apphosting:secrets:set GITHUB_APP_PRIVATE_KEY` with the new PEM
3. Trigger redeploy
4. Confirm Cloud Run logs show successful dispatch on the next promotion
5. GitHub App settings -> delete the old key

Cache implication: the in-process installation token cache (50 min TTL) holds the OLD installation token. After redeploy, fresh containers sign with the NEW key and get a fresh installation token automatically. No action needed - the cache is per-instance.

Rotating GITHUB_APP_INSTALLATION_ID is a transplant - typically only happens if you uninstall and reinstall the App. Same `firebase apphosting:secrets:set` + redeploy flow.

Rotating GITHUB_APP_ID would mean creating a new App entirely - rare; treat as a re-onboarding rather than a rotation.

## Troubleshooting

- "missing required env vars" - one or more of the three secrets did not bind to the App Hosting backend; re-run `firebase apphosting:secrets:set` and confirm the CLI granted the backend service-account access
- "installation token exchange failed: 401" - GITHUB_APP_PRIVATE_KEY is wrong or App Hosting received a corrupted PEM (escaped newlines without the BEGIN/END markers); re-paste the PEM exactly as the .pem file shows
- "installation token exchange failed: 404" - GITHUB_APP_INSTALLATION_ID is wrong; re-check the URL on the org's installations page
- "dispatch failed: 404 Workflow not found" - target repo does not have `.github/workflows/deploy-prod.yml` on its main branch; this is a per-project setup, not a Phase 4 concern (Phase 5 covers workflow file rollout)
- "dispatch failed: 422 No ref found for: main" - the target repo's default branch is not main, OR it has no commits; for Phase 4 we hardcode `ref: 'main'` (per CONTEXT.md Area 2); per-project ref override is deferred
- Threaded Slack reply never arrives - Slack posting failures are logged but swallowed; check Cloud Run logs for `[slack]` warnings
- Slack message reaches "Approved" but `chat.update` doesn't downgrade to ":warning: Approved (promotion failed)" - the bot may not have edit access on its own messages; verify the bot was invited to #release-approvals (Phase 3's Step 6)
