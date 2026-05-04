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
