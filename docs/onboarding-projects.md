# Project Onboarding Runbook

Add a new project to the v1.14 release-gating workflow. Run through this once per project.

## Prerequisites

- Phase 1–5 of v1.14.0 deployed to admin.triarch.dev
- GitHub App `triarch-dev-promotion` installed on MyAlterLego org with access to the new repo
  (see [.planning/phases/04-github-app-promotion/04-HUMAN-UAT.md](.planning/phases/04-github-app-promotion/04-HUMAN-UAT.md) Steps 1–4 if not yet done)
- Slack App `triarch-release-bot` invited to `#release-approvals`
  (see [.planning/phases/03-slack-interactive-approval/03-HUMAN-UAT.md](.planning/phases/03-slack-interactive-approval/03-HUMAN-UAT.md))
- Staff access to admin.triarch.dev (mike@triarchsecurity.com or another `@triarchsecurity.com` email
  seeded in `project_members` with `project_key='*'` and `role='staff'`)

---

## Step 1 — Create the project record

1. Sign in to https://admin.triarch.dev as mike@triarchsecurity.com (staff role required)
2. Navigate to **Platform → Projects → New Project**
   (URL: `/admin/modules/projects` in the admin module tree)
3. Fill in the project wizard:
   - **Name**: human-readable display name (e.g. "Truth+Treason")
   - **Slug / key**: URL-safe identifier used in routes and `release_logs.project` (e.g. `truth-and-treason`)
   - **Repository**: `MyAlterLego/<repo-name>` — the repo that will run `deploy-prod.yml`
   - The wizard provisions the DB entry, DNS record, and repo association via existing platform tools
4. After creation, the platform shows the project's `apiKey` **once**. Copy it immediately and
   store it in a secure location (password manager). You will need it in Step 3.

Verify the record was created:

```sql
SELECT id, name, key, api_key IS NOT NULL AS has_api_key
  FROM projects
  WHERE key = '<new-project-key>';
```

Should return one row with `has_api_key = true`.

---

## Step 2 — Seed project members

1. Navigate to **Platform → Projects → `<new-project-key>` → Members**
   (URL: `/admin/platform/projects/<new-project-key>/members`)
2. Add the customer admin email with `role = 'admin'`
3. Add any read-only users with `role = 'viewer'`

SQL fallback if the members UI is unavailable:

```sql
-- Customer admin
INSERT INTO project_members (project_key, email, role)
  VALUES ('<new-project-key>', 'customer@example.com', 'admin');

-- Viewer (repeat for each viewer)
INSERT INTO project_members (project_key, email, role)
  VALUES ('<new-project-key>', 'viewer@example.com', 'viewer');
```

Email uniqueness is enforced case-insensitively via `lower(email)` index. If the INSERT fails with
a unique constraint error, the email is already seeded — verify the role is correct.

Verify:

```sql
SELECT email, role FROM project_members WHERE project_key = '<new-project-key>';
```

---

## Step 3 — Wire shared-workflows in the new repo

The new repo needs to call `POST /api/releases/promoted` after each successful prod deploy.
This is handled automatically by the `MyAlterLego/shared-workflows` deploy job — you just need to
bump the ref and inject the API token.

**3a. Bump the shared-workflows ref**

In the new repo, edit `.github/workflows/ci-cd.yml` and `.github/workflows/deploy-prod.yml`.
Update the `uses:` ref to the latest tagged shared-workflows version (or `main` if you've validated
the change in-tree):

```yaml
# .github/workflows/ci-cd.yml
jobs:
  build:
    uses: MyAlterLego/shared-workflows/.github/workflows/ci-cd.yml@v0.4.0
    secrets:
      ADMIN_API_TOKEN: ${{ secrets.ADMIN_API_TOKEN }}
      # ... other existing secrets unchanged
```

```yaml
# .github/workflows/deploy-prod.yml
jobs:
  deploy:
    uses: MyAlterLego/shared-workflows/.github/workflows/deploy-prod.yml@v0.4.0
    secrets:
      ADMIN_API_TOKEN: ${{ secrets.ADMIN_API_TOKEN }}
      # ... other existing secrets unchanged
```

**3b. Set the GitHub Actions secret**

In the new repo's GitHub settings (Settings → Secrets and variables → Actions → New repository secret):

- **Name**: `ADMIN_API_TOKEN`
- **Value**: the `apiKey` copied in Step 1

This token is the per-project Bearer credential used by `requireApiKey` in `src/lib/api-key-auth.ts`.
The shared-workflows deploy job sends it as `Authorization: Bearer <ADMIN_API_TOKEN>` when posting
to `POST https://admin.triarch.dev/api/releases/promoted`.

Commit + push the workflow file changes to the repo's default branch.

---

## Step 4 — Verify webhook fires on dev push

Trigger a deploy by pushing a commit to the dev branch (or manually re-running the `ci-cd.yml`
workflow in the GitHub Actions tab).

Wait for the workflow run to complete. Then verify in the admin DB:

```sql
SELECT id, version, env, status, commit_sha, deployed_at, released_by
  FROM release_logs
  WHERE project = '<new-project-key>'
  ORDER BY created_at DESC
  LIMIT 5;
```

Expected: a fresh row with `env = 'dev'`, `status = 'dev'`, `commit_sha` populated.

**If the query returns no rows:**

| Symptom | Root cause | Fix |
|---------|-----------|-----|
| 401 in CI logs | `ADMIN_API_TOKEN` secret wrong or not set | Re-check Step 3b; re-run the workflow |
| No CI workflow triggered | `ci-cd.yml` branch trigger not configured, or ref wrong | Check `on.push.branches` in `ci-cd.yml` |
| Row appears but `commit_sha` is NULL | shared-workflows POST payload missing the field | Bump shared-workflows ref to ≥v0.4.0 |
| 403 in CI logs | Project key mismatch — token is for a different project | Verify `ADMIN_API_TOKEN` matches `projects.api_key` for this project key |

---

## Step 5 — Verify customer page renders the dev release

1. Sign out of admin.triarch.dev (or open a private window)
2. Sign in as the customer admin email seeded in Step 2
3. Navigate to `/projects/<new-project-key>/releases`
4. The dev release from Step 4 should appear in the list with:
   - Version string
   - Status badge: `dev`
   - Commit SHA (truncated, with copy button)
5. Expand the row — the Timeline subsection should show "Deployed to dev" with the actor email and
   a relative timestamp ("Xh ago")

If the page returns 404 or an empty list:
- Confirm the member email was seeded in Step 2 (`lower(email)` match — capitalisation matters at
  the insert; lookups are case-insensitive)
- Confirm the project `key` in the URL matches `release_logs.project` exactly

---

## Step 6 — Test full approve flow (E2E)

This step mirrors Step 8 of
[04-HUMAN-UAT.md](.planning/phases/04-github-app-promotion/04-HUMAN-UAT.md)
but targets the new project end-to-end.

1. As the customer admin, click **Approve for Production** on a release in `dev` status → confirm
2. Within a few seconds, a message lands in `#release-approvals` with Approve and Reject buttons
3. As mike@triarchsecurity.com (mapped Slack user), click **Approve & Promote**
4. Verify each event in sequence:

   **Slack:**
   - Main message updates to ":white_check_mark: Promoted to production by @mike (mike@triarchsecurity.com)"
   - Threaded reply appears: ":rocket: Workflow dispatched: deploy-prod.yml run #N"

   **GitHub Actions:**
   - Visit `https://github.com/MyAlterLego/<new-repo>/actions`
   - A fresh `deploy-prod.yml` run is visible with `tag` input matching the release version

   **After deploy-prod.yml completes:**
   - The workflow POSTs to `POST https://admin.triarch.dev/api/releases/promoted`
   - Verify in DB:

     ```sql
     SELECT id, version, env, status, deployed_at, released_by
       FROM release_logs
       WHERE project = '<new-project-key>'
         AND version = '<released-version>'
       ORDER BY env;
     ```

     Expected: two rows — `env='dev'` with `status='promoted'` AND `env='prod'` with `status='promoted'`

   **Customer page (Timeline):**
   - Refresh `/projects/<new-project-key>/releases` as the customer admin
   - Expand the release row
   - Timeline shows all events in order:
     1. Deployed to dev
     2. (Any feedback, chronological)
     3. Approved for production
     4. Promotion dispatched
     5. Deployed to production

---

## Step 7 — Grant vault access

Shared Slack and GitHub App credentials live in the central vault (`triarch-vault` GCP project) — accessed via the [`@myalterlego/secrets`](https://github.com/MyAlterLego/secrets) npm package. New projects need:

1. The `@myalterlego/secrets` package installed
2. `.npmrc` pointing to GitHub Packages (read-scoped PAT)
3. `NODE_AUTH_TOKEN` exposed at BUILD time in `apphosting.yaml`
4. The Firebase App Hosting runtime service account granted `roles/secretmanager.secretAccessor` on each secret the project consumes

See [`secrets-vault.md`](secrets-vault.md) for the deep-dive (architecture, rotation, troubleshooting). The summary below covers the onboarding-specific bits.

**7a. Add `.npmrc` to the new repo**

Create `.npmrc` at the repo root:

```
@myalterlego:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

Commit this file. It is required for both local `npm install` (using a developer PAT) and CI/CD (using the `GITHUB_PACKAGES_TOKEN` Firebase secret).

**7b. Set the `GITHUB_PACKAGES_TOKEN` Firebase secret**

On the new project's Firebase App Hosting backend:

```bash
firebase apphosting:secrets:set GITHUB_PACKAGES_TOKEN --project=<new-firebase-project>
# Paste a GitHub PAT with read:packages scope on MyAlterLego org
```

Reuse the existing PAT from `triarch-dev-website` if you have it (one PAT, multiple Firebase projects, simpler rotation).

**7c. Wire `NODE_AUTH_TOKEN` in `apphosting.yaml`**

Add this entry to the new project's `apphosting.yaml`:

```yaml
  - variable: NODE_AUTH_TOKEN
    secret: GITHUB_PACKAGES_TOKEN
    availability:
      - BUILD
```

`availability: BUILD` is critical — exposing the token at RUNTIME would leak it to the running app. Build-only is what `.npmrc` needs for `npm ci`.

**7d. Install the package**

```bash
NODE_AUTH_TOKEN=$(gh auth token) npm install @myalterlego/secrets
```

**7e. Determine which secrets this project needs**

The 7 vault secrets and typical consumer mapping:

| Secret | Used by |
|--------|---------|
| `SLACK_BOT_TOKEN` | Any project posting to Slack |
| `SLACK_SIGNING_SECRET` | Any project that verifies inbound Slack requests |
| `SLACK_PAYLOAD_SECRET` | Admin-style projects with interactive Slack buttons |
| `GITHUB_APP_ID` | Projects that dispatch GitHub Actions workflows |
| `GITHUB_APP_PRIVATE_KEY` | Projects that dispatch GitHub Actions workflows |
| `GITHUB_APP_INSTALLATION_ID` | Projects that dispatch GitHub Actions workflows |
| `SLACK_USER_MAP` | Projects that map Slack user IDs to staff emails |

**Triarch-dev admin** uses all 7 (it is the canonical consumer).
**Triarchsecurity-admin (CRM)** uses 2 (SLACK_BOT_TOKEN, SLACK_SIGNING_SECRET).

Most new projects only need the Slack credentials.

**7f. Identify the runtime service account**

Firebase App Hosting runs your app under a service account named `firebase-app-hosting-compute@<your-firebase-project>.iam.gserviceaccount.com` (per Firebase docs). Verify with:

```bash
gcloud iam service-accounts list --project=<your-firebase-project> --format="table(email)" \
  | grep firebase-app-hosting-compute
```

If the result is empty, the legacy `firebase-adminsdk-fbsvc@<project>...` SA may be used instead. See [`secrets-vault.md`](secrets-vault.md#runtime-service-account-resolution) for the resolution rule.

**7g. Grant `secretAccessor` on each needed secret**

Replace `SA_EMAIL` and the secret list with what your project actually consumes:

```bash
SA_EMAIL="firebase-app-hosting-compute@<your-firebase-project>.iam.gserviceaccount.com"
for SECRET in SLACK_BOT_TOKEN SLACK_SIGNING_SECRET; do
  gcloud secrets add-iam-policy-binding "$SECRET" \
    --project=triarch-vault \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="roles/secretmanager.secretAccessor"
done
```

Verify each binding:

```bash
for SECRET in SLACK_BOT_TOKEN SLACK_SIGNING_SECRET; do
  gcloud secrets get-iam-policy "$SECRET" --project=triarch-vault \
    --format="value(bindings.members)" | grep -q "$SA_EMAIL" \
    && echo "OK: $SECRET" || echo "MISSING: $SECRET"
done
```

All entries must read `OK: <secret>`.

**7h. Use the package in code**

```typescript
import { getSecret } from '@myalterlego/secrets';

const slackToken = await getSecret('SLACK_BOT_TOKEN');
```

The package caches each value in-process for 300 seconds and falls back to `process.env[name]` on vault failure. See [`secrets-vault.md`](secrets-vault.md#failure-modes) for the behavior matrix.

**Verify:** Deploy the new project and call its health endpoint (if present) or trigger a code path that exercises a vault read. In the App Hosting logs, you should see no `PERMISSION_DENIED` errors for `SecretManagerService.AccessSecretVersion`.

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| `PERMISSION_DENIED` accessing a secret | SA email mismatch or grant missing | Re-run 7f then 7g; wait 60s for IAM propagation |
| `npm ci` fails with `404 Not Found` for `@myalterlego/secrets` | `.npmrc` missing or `NODE_AUTH_TOKEN` not set | Confirm 7a + 7b + 7c |
| `getSecret` returns `process.env` value silently | Vault read failed but env var also set — fallback engaged | Check App Hosting logs for the silent-fail warning; verify SA grant |
| `npm install` fails locally with `401 Unauthorized` | Local dev needs a developer PAT in `NODE_AUTH_TOKEN` env | `export NODE_AUTH_TOKEN=$(gh auth token)` before `npm install` |

---

## Step 8 — Admin Callback Token (shared-workflows@v2)

Projects using `shared-workflows@v2` (`deploy-firebase.yml` or `deploy-prod.yml`) must provide an
`ADMIN_API_TOKEN` GitHub Actions secret so the workflow can POST deploy notifications back to
admin's control plane.

### What it is

The token is the project's `api_key` from admin's `projects` table — the same Bearer token that
admin's `requireApiKey` middleware (`src/lib/api-key-auth.ts`) validates. Each project has its own
`api_key`; this is **not** a vault secret.

### How to get it

1. Query admin's CRDB for the project's `api_key` (replace `<project-key>` with the project's
   `key` column value, e.g. `triarch-dev`):

   ```bash
   DATABASE_URL=$(firebase apphosting:secrets:access DATABASE_URL --project triarch-dev-website)
   psql "$DATABASE_URL" -c "SELECT api_key FROM projects WHERE key='<project-key>'"
   ```

2. If no row exists, create the project entry first (see Step 1 of this runbook).

### How to set it

```bash
gh secret set ADMIN_API_TOKEN --repo MyAlterLego/<repo-name>
# Paste the api_key value when prompted.
```

Or pipe it non-interactively (avoid printing the value to stdout):

```bash
printf '%s' "$API_KEY" | gh secret set ADMIN_API_TOKEN --repo MyAlterLego/<repo-name>
```

### Verification

After setting the secret, push to main and watch the deploy run:

```bash
RUN_ID=$(gh run list --workflow ci-cd.yml --branch main --limit 1 --json databaseId --jq '.[0].databaseId')
gh run view "$RUN_ID" --log | grep "Admin dev callback succeeded"
# Expected: "Admin dev callback succeeded (HTTP 201). release_logs row created for main v<X.Y.Z>."
```

Then confirm the row in admin's CRDB:

```bash
DATABASE_URL=$(firebase apphosting:secrets:access DATABASE_URL --project triarch-dev-website)
psql "$DATABASE_URL" -c "SELECT version, env, branch FROM release_logs WHERE project='<project-key>' ORDER BY created_at DESC LIMIT 1"
```

Expected: one row with `env='dev'`, `branch='main'`, `version` matching your package.json version.

### What if the secret is missing?

The workflow runs an empty-token guard (`[ -z "$ADMIN_API_TOKEN" ]`) and emits a
`::warning::ADMIN_API_TOKEN not set` annotation. The deploy still completes — admin just won't see
the release row. Set the secret and re-deploy to register the next push.

### Related

- WORKFLOW-01: `deploy-firebase.yml` dev callback to `/api/platform/ingest/release-logs`
- WORKFLOW-02: `deploy-prod.yml` prod callback to `/api/releases/promoted`
- See also: [secrets-vault.md](secrets-vault.md) for the seven shared vault secrets (different
  concern — vault is for shared credentials, `ADMIN_API_TOKEN` is a per-project token).

---

## Step 9 — Add the local `promote-branch.yml` workflow stub

Phase 6 (`promoteAndAudit`) dispatches `promote-branch.yml` on the consumer repo's `main` branch
when staff click "Approve & Promote" in `#release-approvals`. The repo must therefore host a local
stub at `.github/workflows/promote-branch.yml` that delegates to the reusable workflow in
`MyAlterLego/shared-workflows`. Without this stub, the GitHub Actions `workflow_dispatch` call will
return 404 and the promotion will fail silently with a Slack warning.

### 9a. Create the stub workflow file

In the consumer repo, create `.github/workflows/promote-branch.yml`:

```yaml
name: Promote Branch to Main

on:
  workflow_dispatch:
    inputs:
      branch:
        description: 'Feature branch to rebase + merge into main'
        required: true
        type: string

jobs:
  promote:
    uses: MyAlterLego/shared-workflows/.github/workflows/promote-branch.yml@v3
    with:
      branch: ${{ inputs.branch }}
    secrets:
      ADMIN_API_TOKEN: ${{ secrets.ADMIN_API_TOKEN }}
```

Commit and push this file to `main`. GitHub only recognises `workflow_dispatch` triggers on
workflows that exist on the default branch.

### 9b. Confirm `ADMIN_API_TOKEN` is already set

The `ADMIN_API_TOKEN` secret was added in Step 8 for the `deploy-firebase.yml` / `deploy-prod.yml`
round-trip callbacks. The same per-project Bearer token is passed through to the
`promote-branch.yml` reusable workflow so the shared-workflows step can POST the promotion result
back to `/api/platform/promote-callback`. No new secret value is needed — the existing secret is
forwarded via `secrets: inherit`-equivalent `secrets: { ADMIN_API_TOKEN: ... }` in the stub.

Verify the secret exists:

```bash
gh secret list --repo <owner>/<repo> | grep ADMIN_API_TOKEN
```

If missing, fetch the value from admin's `projects` table (same query as Step 8) and set it:

```bash
printf '%s' "$API_KEY" | gh secret set ADMIN_API_TOKEN --repo <owner>/<repo>
```

### 9c. Verify the workflow is registered

After the stub is merged to `main`:

```bash
gh workflow list --repo <owner>/<repo> | grep "Promote Branch to Main"
```

The workflow should appear with status `active`. If it does not appear, confirm the file was
committed to `main` (not a feature branch) and that the `name:` field in the YAML is set to
`Promote Branch to Main`.

### 9d. Optional: sanity-check the file content

```bash
gh api /repos/<owner>/<repo>/contents/.github/workflows/promote-branch.yml \
  | jq -r .content | base64 -d
```

This decodes and prints the stub YAML directly from the GitHub API — confirms the correct
`promote-branch.yml@v3` ref is in place before triggering a real promotion.

### 9e. Optional: no-op dispatch test

Trigger a manual dispatch from the GitHub UI: **Actions → Promote Branch to Main → Run workflow →
enter `main` as the branch input.** The shared-workflows reusable workflow will rebase `main` on
`main` (no-op), run CI, and POST the `merged` callback to admin. Verify with:

```bash
DATABASE_URL=$(firebase apphosting:secrets:access DATABASE_URL --project triarch-dev-website)
psql "$DATABASE_URL" -c "SELECT branch, result, merge_sha, created_at FROM promote_attempts WHERE project='<project-key>' ORDER BY created_at DESC LIMIT 1"
```

Expected: one row with `branch='main'`, `result='merged'`.

> **Note:** Multi-branch end-to-end validation (`feat/X` + `feat/Y` running in parallel) is
> exercised in the Phase 8 Truth+Treason pilot (PILOT-02). For new project onboarding, the no-op
> sanity check above is sufficient confirmation that the dispatch chain is wired correctly.

---

## Step 10 — OttoBot Slack App scope upgrade + endpoint URL configuration

**One-time per workspace.** This step expands OttoBot's Slack scopes to support slash commands (`/triarch`) and channel mentions (`@OttoBot`). The bot already has `chat:write` from the v1.14 release-gating workflow; this adds the new capabilities and configures the two new admin endpoints introduced in v2.0 Phase 7.

### What's being added

| Scope | Purpose |
|-------|---------|
| `chat:write.public` | Post help/status replies in channels OttoBot is not a member of |
| `app_mentions:read` | Receive `app_mention` events when someone types `@OttoBot ...` |
| `commands` | Receive slash commands at `/api/slack/commands` |

### Procedure

1. **Open the OttoBot Slack App configuration:**
   - Navigate to `https://api.slack.com/apps`
   - Select the OttoBot app

2. **Add the three scopes:**
   - Go to **OAuth & Permissions** then **Scopes** then **Bot Token Scopes**
   - Click **Add an OAuth Scope** and add each of: `chat:write.public`, `app_mentions:read`, `commands`
   - Slack will show a banner prompting workspace reinstall — do NOT reinstall yet, finish steps 3 and 4 first

3. **Register the `/triarch` slash command:**
   - Go to **Slash Commands** then **Create New Command**
   - Command: `/triarch`
   - Request URL: `https://admin.triarch.dev/api/slack/commands`
   - Short Description: `Triarch deploy automation — deploy / status / help`
   - Usage Hint: `[deploy|status] <project> [<version>]`
   - Save

4. **Configure the Events API endpoint:**
   - Go to **Event Subscriptions** then toggle **Enable Events** on
   - Request URL: `https://admin.triarch.dev/api/slack/events`
   - Slack will challenge the URL — admin's `url_verification` handler responds with the challenge automatically (no admin code change needed; the `/api/slack/events` route handles this BEFORE HMAC verification per Phase 7 RESEARCH Pitfall 2)
   - Under **Subscribe to bot events**, add `app_mention`
   - Save

5. **Reinstall the workspace:**
   - Go back to **OAuth & Permissions** then click **Reinstall to Workspace** at the top of the page
   - Approve the new permissions when prompted
   - Slack issues a new bot token IF scopes changed materially. Copy the new `Bot User OAuth Token` from the **OAuth Tokens for Your Workspace** section.

6. **Update SLACK_BOT_TOKEN in triarch-vault (only if the token changed):**
   - In most cases reinstalling a Slack app preserves the existing bot token. Verify by comparing the displayed token's last 8 chars against what's currently in the vault.
   - If the token CHANGED:

     ```bash
     gcloud secrets versions add SLACK_BOT_TOKEN \
       --data-file=- \
       --project=triarch-vault \
       <<< 'xoxb-NEW-TOKEN-VALUE'
     ```

   - Wait roughly 5 minutes for `@myalterlego/secrets`'s 300s in-process cache to expire across admin's running instances, OR redeploy admin to flush the cache.

7. **Verify end-to-end (smoke test):**
   - In any Slack channel where you're a member: type `/triarch` (no args) — expect ephemeral help text listing `deploy` and `status` subcommands.
   - Type `/triarch status admin` — expect ephemeral Block Kit response with Dev / Prod / Active RCs / Last 3 Deploys sections.
   - Mention OttoBot in a channel: `@OttoBot status admin` — expect a threaded reply with the same Block Kit. (OttoBot must be invited to the channel OR `chat:write.public` is in scope, which we just added.)
   - As a non-staff Slack user, type `/triarch deploy admin v0.0.0` — expect ephemeral `:no_entry: This command requires Triarch staff access.`

8. **Confirm audit rows:**
   - Visit `/admin/platform/slack-audit` (after applying `scripts/seed-slack-audit-nav.sql` so the sidebar link appears).
   - Confirm rows for the smoke-test calls above are present with `action_id` values like `slash_help`, `slash_status`, `event_app_mention_status`.

### Notes

- The `chat:write.public` scope is required because the bot may not be a member of every channel where users mention it. Without this scope, threaded replies fail silently with `not_in_channel`.
- The Events API request URL must be reachable from the public internet — admin.triarch.dev satisfies this. Local development against this URL is not directly supported; use Slack's Socket Mode or a tunnel (e.g. `cloudflared`, `ngrok`) for local testing of the events handler.
- If the Slack URL verification fails ("Your URL didn't respond with the value of the challenge parameter"), check that `/api/slack/events` returns the challenge BEFORE HMAC verification and that admin is deployed with the new code (these changes are in Phase 7 plan 07-04).
- Per CONTEXT D-22: `SLACK_BOT_TOKEN` does NOT need rotation IF reinstall preserves the existing token. Slack typically preserves tokens unless scopes change significantly. Always verify before rotating.

---

## Step 11 — Dev Environment (apphosting.yaml overlay + db-migrate.yml)

Every Triarch project has two Firebase App Hosting configs:

| File | Used by | FAH backend | DB secret |
|------|---------|------------|----------|
| `apphosting.yaml` | `deploy-firebase.yml@v4` with `environment: dev` | `<app>-dev` | `DATABASE_URL_DEV` |
| `apphosting.prod.yaml` | `deploy-firebase.yml@v4` with `environment: prod` (default) | `<app>` | `DATABASE_URL` |

The convention generalizes the pattern first established in `truthtreason/apphosting.yaml` + `truthtreason/apphosting.prod.yaml` and now used in admin (see `apphosting.yaml` + `apphosting.prod.yaml` at the admin repo root for a working reference).

### 11a. Create `apphosting.yaml` (dev base)

Copy the project's existing `apphosting.yaml`. Make these changes:

1. Switch the `DATABASE_URL` secret reference from `DATABASE_URL` to `DATABASE_URL_DEV`.
2. Adjust `NEXTAUTH_URL` to the dev FAH URL (`<app-name>-dev.<region>.hosted.app` pattern, captured at backend creation time).
3. Adjust any other URL-bearing env values (`DEPLOY_WEBHOOK_URL`, etc.) to point at the dev host.
4. Lower `runConfig` to dev sizing if desired (e.g. `concurrency: 10`, `minInstances: 0`).

Example (admin):

```yaml
runConfig:
  runtime: nodejs22
  concurrency: 10
  cpu: 1
  memoryMiB: 512
  minInstances: 0
  maxInstances: 2

env:
  - variable: NEXTAUTH_URL
    value: https://admin-dev.triarch.dev
    availability:
      - BUILD
      - RUNTIME

  - variable: DATABASE_URL
    secret: DATABASE_URL_DEV

  - variable: NODE_AUTH_TOKEN
    secret: GITHUB_PACKAGES_TOKEN
    availability:
      - BUILD
  # ... all other secrets identical to apphosting.prod.yaml ...
```

### 11b. Create `apphosting.prod.yaml` (prod overrides)

Duplicate the FINAL prod config (every field from the original `apphosting.yaml`). Keep `DATABASE_URL` secret name. Keep prod `NEXTAUTH_URL`. Set prod `runConfig` (e.g. `concurrency: 20`, `minInstances: 1` for warm starts if needed).

> **Critical (RESEARCH §Pitfall 1):** `apphosting.prod.yaml` must be a COMPLETE config, not a partial diff. The Firebase CLI uses the `--config` file EXCLUSIVELY when specified — it does NOT merge with `apphosting.yaml`. Omitting `NODE_AUTH_TOKEN` (with `availability: [BUILD]`) from the prod file will break `npm ci` on prod builds with `E401 Unauthorized` against GitHub Packages. Every secret declared in `apphosting.yaml` must also appear in `apphosting.prod.yaml`.

### 11c. Verify the overlay convention

```bash
# Dry-run: check both files parse as valid YAML
yamllint -d "{rules: {line-length: disable, document-start: disable, truthy: disable}}" \
  apphosting.yaml apphosting.prod.yaml

# Quick sanity diff: only DATABASE_URL secret name + NEXTAUTH_URL should differ
diff <(grep "secret:" apphosting.yaml | sort) <(grep "secret:" apphosting.prod.yaml | sort)
# Expect: ONE difference — DATABASE_URL_DEV in dev vs DATABASE_URL in prod
```

### 11d. Wire `db-migrate.yml` in `ci-cd.yml` (optional — run manually first)

To run schema migrations against the dev DB without touching prod, use the new reusable workflow:

```yaml
# In .github/workflows/ci-cd.yml, add a dispatch-only job:
  db-migrate-dev:
    uses: MyAlterLego/shared-workflows/.github/workflows/db-migrate.yml@v4
    with:
      environment: dev
      firebase_project_id: <your-firebase-project-id>
      consumer_repo: ${{ github.repository }}
    secrets:
      FIREBASE_SA_KEY: ${{ secrets.FIREBASE_SA_KEY }}
      GH_PAT: ${{ secrets.GH_PAT }}
```

Or trigger it manually via the GitHub Actions UI: navigate to **Actions → DB Migrate → Run workflow**, select `dev` for `environment`, paste the Firebase project ID and consumer repo, then dispatch.

**When to use:** After merging any PR that changes `src/db/schema.ts` to the `dev` branch, run `db-migrate.yml@v4` with `environment: dev` BEFORE testing anything that reads/writes the new columns or tables. This replaces the manual `firebase apphosting:secrets:access DATABASE_URL --project X | psql -f` ritual that previously appeared in Step 8.

**Caveat (RESEARCH §Pitfall 6):** `db-migrate.yml` is for repos that use Drizzle ORM only. The workflow runs `npx drizzle-kit push` and requires a `drizzle.config.ts` at the consumer repo root. Static-site repos (e.g. `www`) without Drizzle should NOT call this workflow.

### 11e. Set `DATABASE_URL_DEV` secret on the dev backend

After Mike has provisioned the dev cluster + per-app database (per `07.5-RUNBOOK.html` step A-2), set the connection string as a Firebase secret on the dev FAH backend:

```bash
firebase apphosting:secrets:set DATABASE_URL_DEV --project <your-firebase-project-id>
# Paste the dev cluster connection URL for <app>_dev database
# Example: postgresql://<user>:<password>@<dev-cluster-host>:26257/<app>_dev?sslmode=require
```

Set `DATABASE_URL` separately on the prod backend (this likely already exists from project bring-up):

```bash
firebase apphosting:secrets:set DATABASE_URL --project <your-firebase-project-id>
# Paste the PROD cluster connection URL for <app> database (unchanged from Step 8)
```

### Cost note

Standing up a dev cluster + per-app dev backends adds approximately $50–100/month across all Triarch projects (smallest CRDB Cloud tier + minimal FAH minInstances). Document this on customer-managed projects so the marginal cost is understood before adoption.

---

## Verification Checklist

- [ ] Project record created; `apiKey` saved to a secure location (password manager)
- [ ] At least one customer admin seeded in `project_members` with `role='admin'`
- [ ] Zero or more viewers seeded with `role='viewer'`
- [ ] `shared-workflows` ref bumped in both `ci-cd.yml` and `deploy-prod.yml`
- [ ] `ADMIN_API_TOKEN` GitHub secret set to the project `apiKey`
- [ ] Dev deploy creates a `release_logs` row with `env='dev'`, `status='dev'`, `commit_sha` populated
- [ ] Customer page at `/projects/<slug>/releases` renders the dev release
- [ ] Full approve flow ends with paired `env='prod'` row + `status='promoted'` in DB
- [ ] Customer page Timeline shows all 5 lifecycle events with correct actors and timestamps
- [ ] `.npmrc` committed with `@myalterlego` registry + `NODE_AUTH_TOKEN` reference
- [ ] `GITHUB_PACKAGES_TOKEN` Firebase secret set on the new project
- [ ] `NODE_AUTH_TOKEN` entry added to `apphosting.yaml` with `availability: [BUILD]`
- [ ] `roles/secretmanager.secretAccessor` granted on each needed secret to the new project's runtime SA
- [ ] `.github/workflows/promote-branch.yml` stub committed to `main` and confirmed `active` via `gh workflow list`
- [ ] `ADMIN_API_TOKEN` secret present on repo (shared with deploy-firebase / deploy-prod callbacks)

---

## Troubleshooting

| Problem | Likely cause | Fix |
|---------|-------------|-----|
| `401` from CI on dev push | `ADMIN_API_TOKEN` not set or copied incorrectly | Re-set secret in GitHub → Settings → Secrets |
| `403` from CI on dev push | Token valid but project key mismatch | Verify token belongs to this project (`SELECT key FROM projects WHERE api_key='...'`) |
| `404` from CI when `deploy-prod.yml` posts `/api/releases/promoted` | `version` in POST payload does not match the `dev` row's `version` — the two workflow files are out of sync | Ensure `ci-cd.yml` and `deploy-prod.yml` use the same version string format |
| Customer page returns 404 | Member email not seeded, or slug in URL does not match `projects.key` | Check `project_members` + `projects.key` in DB |
| Customer page shows release but no Timeline "Deployed to dev" event | `deployedAt` is NULL on the row | Bump shared-workflows to ≥v0.4.0 (sends `deployed_at` in POST) |
| Slack message never arrives | Bot not invited to `#release-approvals`, or `SLACK_BOT_TOKEN` secret missing | See [03-HUMAN-UAT.md](.planning/phases/03-slack-interactive-approval/03-HUMAN-UAT.md) Steps 4–6 |
| `workflow_dispatch` fires but deploy-prod.yml fails immediately | GitHub App not installed on this repo | See [04-HUMAN-UAT.md](.planning/phases/04-github-app-promotion/04-HUMAN-UAT.md) Step 4 (Install App → add repo) |
| Timeline stops at "Promotion dispatched" — no "Deployed to production" event | `deploy-prod.yml` did not POST to `/api/releases/promoted` after completing | Check workflow logs for the POST step; verify shared-workflows ref is ≥v0.4.0 |
| Slack message never arrives AND new project log shows `PERMISSION_DENIED` for `AccessSecretVersion` | Vault SA grant missing for the new project | See Step 7g; grant `secretAccessor` on the Slack secrets to the new project's `firebase-app-hosting-compute@` SA |
| Build fails on `npm ci` with `@myalterlego/secrets` 404 | `.npmrc` not committed or `NODE_AUTH_TOKEN` not exposed at BUILD | See Steps 7a–7c |
