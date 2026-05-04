# v1.14.0 Master HUMAN-UAT — Customer Release Gating Milestone Closeout

Single source of truth for shipping v1.14.0. Consolidates all deferred manual steps from Phases 2, 3, 4, and 5 plus the cross-repo work (shared-workflows + Truth+Treason pilot) and the final end-to-end smoke test.

Work through the sections in order. Each section ends with a checklist. The final section is the milestone-closeout signoff.

**Related per-phase runbooks (linked in sections below — do not duplicate, do reference):**
- Phase 2: [02-HUMAN-UAT.md](../02-customer-releases-page/02-HUMAN-UAT.md) — DB migration 0008 context
- Phase 3: [03-HUMAN-UAT.md](../03-slack-interactive-approval/03-HUMAN-UAT.md) — Slack App setup runbook
- Phase 4: [04-HUMAN-UAT.md](../04-github-app-promotion/04-HUMAN-UAT.md) — GitHub App setup runbook

---

## Prerequisites

- All Phase 1–5 admin-repo plans merged to main and deployed to https://admin.triarch.dev
- Firebase CLI logged in (`firebase login`) against the `triarch-dev-admin` App Hosting backend
- Org admin permissions on github.com/MyAlterLego
- Production CockroachDB connection string available (in Firebase secrets — not in local shell; retrieve via `firebase apphosting:secrets:access DATABASE_URL` or from 1Password)
- Slack workspace admin (or App-management permissions) on the Triarch workspace
- Access to the `MyAlterLego/shared-workflows` repo (separate session — not the admin repo)
- Access to the `MyAlterLego/triarchsecurity-portal` repo (Truth+Treason pilot)

---

## Section A — Phase 2 deferred: DB push of migration 0008 (reason column)

Phase 2 plan 02-01 emitted `src/db/migrations/0008_yielding_hellcat.sql` adding the `reason` column to `release_approvals` (REJECT-01 requirement). DB push was deferred per the established pattern — `DATABASE_URL` is a Firebase secret, not available in the local shell at plan execution time. The STATE.md note reads: "[Phase 02-01]: DB push deferred to human — DATABASE_URL is Firebase secret, not in local shell; same pattern as Phase 01-01."

See [02-HUMAN-UAT.md](../02-customer-releases-page/02-HUMAN-UAT.md) for the full Phase 2 test suite (12 tests all pending this DB push).

### A.1 — Retrieve the production DATABASE_URL

```bash
firebase apphosting:secrets:access DATABASE_URL --backend triarch-dev-admin
```

Copy the output (a CockroachDB connection string starting with `postgresql://` or `postgres://`).

### A.2 — Apply migration 0008

Option A — drizzle-kit push (recommended if DATABASE_URL resolves locally):

```bash
cd /path/to/admin
DATABASE_URL="<connection string from A.1>" npm run db:push
```

Option B — apply the SQL directly via cockroach sql:

```bash
cockroach sql --url "<connection string from A.1>" \
  < src/db/migrations/0008_yielding_hellcat.sql
```

The migration adds one column: `reason text` to `release_approvals`. Existing rows remain unchanged (reason will be NULL for all existing approvals — correct per the schema decision in STATE.md).

### A.3 — Verify the column exists

Connect to the production DB and run:

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'release_approvals'
  AND column_name = 'reason';
```

Expected result: one row — `reason | text | YES`.

Verify existing rows are unaffected:

```sql
SELECT COUNT(*) FROM release_approvals WHERE reason IS NOT NULL;
```

Expected: `0` (all prior approvals have NULL reason — correct).

### A.4 — Confirm no runtime errors

After the push, check Cloud Run logs for startup errors:

```bash
gcloud run services logs read triarch-dev-build \
  --project angular-concord-489522-c4 --limit 30
```

Look for clean startup — no schema mismatch errors from Drizzle.

### Section A checklist

- [ ] Migration 0008 applied to production CockroachDB
- [ ] `release_approvals.reason` column verified present (data_type=text, nullable=YES)
- [ ] Existing approval rows confirm reason IS NULL (no data corruption)
- [ ] No runtime errors in Cloud Run logs after the push

---

## Section B — Phase 3 deferred: Slack App + 3 secrets

Phase 3 ships secure code that depends on a real Slack App in the Triarch workspace. The full step-by-step runbook lives at [03-HUMAN-UAT.md](../03-slack-interactive-approval/03-HUMAN-UAT.md) — run that document in full for the first-time setup.

Quick summary of what must be done (details in 03-HUMAN-UAT.md):

1. **Create Slack App**: https://api.slack.com/apps → "Create New App" → "From scratch" → name `Triarch Release Gate` → your workspace. Note the Signing Secret.
2. **Add bot scope**: OAuth & Permissions → Bot Token Scopes → `chat:write` → Install to Workspace → copy the `xoxb-` Bot User OAuth Token.
3. **Generate payload secret**: `openssl rand -base64 32` — this is distinct from the Slack signing secret.
4. **Push 3 secrets**:
   ```bash
   firebase apphosting:secrets:set SLACK_BOT_TOKEN
   firebase apphosting:secrets:set SLACK_SIGNING_SECRET
   firebase apphosting:secrets:set SLACK_PAYLOAD_SECRET
   ```
5. **Wire interactivity**: Slack app → Interactivity & Shortcuts → toggle ON → Request URL: `https://admin.triarch.dev/api/slack/interact` → Save.
6. **Invite bot to channel**: In Slack: `/invite @Triarch Release Gate` in `#release-approvals`.
7. **Populate SLACK_USER_MAP**: Edit `src/lib/slack-identity.ts` with your Slack member ID → `mike@triarchsecurity.com` mapping. Commit + push.

Refer to [03-HUMAN-UAT.md Steps 1–7](../03-slack-interactive-approval/03-HUMAN-UAT.md) for exact dashboard navigation paths, OAuth scope screenshots guidance, and troubleshooting.

### Section B checklist

- [ ] Slack App created with `chat:write` bot scope
- [ ] `SLACK_BOT_TOKEN` pushed via `firebase apphosting:secrets:set`
- [ ] `SLACK_SIGNING_SECRET` pushed via `firebase apphosting:secrets:set`
- [ ] `SLACK_PAYLOAD_SECRET` pushed via `firebase apphosting:secrets:set`
- [ ] Interactivity Request URL set to `https://admin.triarch.dev/api/slack/interact`
- [ ] Bot invited to `#release-approvals` channel
- [ ] `SLACK_USER_MAP` populated with `mike@triarchsecurity.com` mapped to Slack user ID and pushed to main

---

## Section C — Phase 4 deferred: GitHub App + 3 secrets + migration 0009

Phase 4 ships secure code that depends on a GitHub App installed in the MyAlterLego org. The full step-by-step runbook lives at [04-HUMAN-UAT.md](../04-github-app-promotion/04-HUMAN-UAT.md) — run that document in full for the first-time setup.

Quick summary of what must be done (details in 04-HUMAN-UAT.md):

1. **Create GitHub App**: https://github.com/organizations/MyAlterLego/settings/apps → "New GitHub App" → name `triarch-dev-promotion` → Homepage URL `https://admin.triarch.dev` → uncheck Webhook Active. Note the App ID.
2. **Set repository permissions**: Actions (Read and write), Contents (Read-only), Metadata (Read-only). All others: No access.
3. **Generate private key**: Sidebar → Private keys → "Generate a private key" → download `.pem` file. Keep open for step 5.
4. **Install App on org**: Sidebar → Install App → MyAlterLego → "All repositories" → Install. Note the installation ID from the URL (`/settings/installations/<NUMBER>`).
5. **Push 3 secrets**:
   ```bash
   firebase apphosting:secrets:set GITHUB_APP_ID
   # paste the numeric App ID from step 1

   firebase apphosting:secrets:set GITHUB_APP_PRIVATE_KEY
   # paste ENTIRE PEM contents including -----BEGIN RSA PRIVATE KEY----- and -----END RSA PRIVATE KEY----- lines

   firebase apphosting:secrets:set GITHUB_APP_INSTALLATION_ID
   # paste the numeric installation ID from step 4
   ```
6. **Delete local .pem file** after secrets are pushed. Never commit it.
7. **Apply migration 0009** — Plan 04-01 emitted `src/db/migrations/0009_promotion_dispatch_audit.sql` (adds `promotion_dispatched_at` and `promotion_dispatched_by` columns to `release_logs`):
   ```bash
   # Option A: drizzle-kit push
   DATABASE_URL="<production URL>" npm run db:push

   # Option B: direct SQL
   cockroach sql --url "<production URL>" \
     < src/db/migrations/0009_promotion_dispatch_audit.sql
   ```
8. **Verify migration 0009**:
   ```sql
   SELECT column_name FROM information_schema.columns
   WHERE table_name = 'release_logs'
     AND column_name IN ('promotion_dispatched_at', 'promotion_dispatched_by');
   ```
   Expected: both rows returned.

9. **Trigger redeploy** after secrets push: `git push` any branch to main (no-op version bump is fine per CLAUDE.md).
10. **Verify clean startup** — no `[github-app] missing required env vars` errors in Cloud Run logs.

Refer to [04-HUMAN-UAT.md Steps 1–7](../04-github-app-promotion/04-HUMAN-UAT.md) for exact dashboard navigation, permission-screen verification, and the detailed error-handling smoke test.

### Section C checklist

- [ ] GitHub App created in MyAlterLego org with permissions: actions:write, contents:read, metadata:read (and nothing else)
- [ ] Private key (.pem) generated and downloaded
- [ ] App installed on MyAlterLego org with access to admin-managed repos
- [ ] `GITHUB_APP_ID` pushed via `firebase apphosting:secrets:set`
- [ ] `GITHUB_APP_PRIVATE_KEY` pushed via `firebase apphosting:secrets:set` (full PEM including BEGIN/END lines)
- [ ] `GITHUB_APP_INSTALLATION_ID` pushed via `firebase apphosting:secrets:set`
- [ ] Local `.pem` file deleted
- [ ] Migration 0009 applied to production CockroachDB
- [ ] `promotion_dispatched_at` and `promotion_dispatched_by` columns verified present in `release_logs`
- [ ] App Hosting redeploy succeeded; no "missing required env vars" in Cloud Run logs

---

## Section D — Phase 5 cross-repo: shared-workflows updates (WORKFLOW-01 + WORKFLOW-02)

The admin repo now has two ingest endpoints:
- `POST /api/platform/ingest/release-logs` — accepts **camelCase** fields (`commitSha`, `deployedAt`, `releasedBy`) for dev deploys. Handler live since Phase 1.
- `POST /api/releases/promoted` — accepts **snake_case** fields (`commit_sha`, `deployed_at`, `deployed_by`) for prod deploys. Handler added in Plan 05-01.

The `MyAlterLego/shared-workflows` repo needs two POST notification steps so every CI/CD run round-trips back to admin. These edits are made in a separate session (likely `/gsd:autonomous` targeting shared-workflows, or hand-edit + PR).

**Note on field name case difference:** The dev ingest endpoint (`/api/platform/ingest/release-logs`) destructures `commitSha` and `deployedAt` from the body (camelCase — see route.ts line 21–24). The prod endpoint (`/api/releases/promoted`) uses `commit_sha`, `deployed_at`, `deployed_by` (snake_case — matches GitHub Actions CI convention, mapped to Drizzle camelCase columns internally). The YAML snippets below reflect this distinction exactly.

### D.1 — Add new workflow inputs and secret to both workflow signatures

In each workflow file that needs to notify admin (`ci-cd.yml`, `deploy-prod.yml`), add three new entries to the `workflow_call` block:

```yaml
on:
  workflow_call:
    inputs:
      # ... existing inputs ...
      notify-admin:
        description: 'POST deploy completion to admin.triarch.dev'
        type: boolean
        default: true
      admin-api-url:
        description: 'Admin API base URL'
        type: string
        default: 'https://admin.triarch.dev'
    secrets:
      # ... existing secrets ...
      ADMIN_API_TOKEN:
        description: 'Per-project admin API key (from projects.api_key column)'
        required: true
```

`ADMIN_API_TOKEN` is a per-project secret — each project that consumes shared-workflows sets it in its own GitHub repository secrets using the `api_key` value from the admin DB's `projects` table. See Section E.2 for how to look up and set the value for Truth+Treason.

### D.2 — WORKFLOW-01: ci-cd.yml dev-deploy notify step

Append this step to the `build-and-deploy` job in `ci-cd.yml`, after the existing deploy step completes successfully:

```yaml
- name: Notify admin of dev deploy
  if: success() && inputs.notify-admin
  run: |
    curl -fsSL -X POST "${{ inputs.admin-api-url }}/api/platform/ingest/release-logs" \
      -H "Authorization: Bearer ${{ secrets.ADMIN_API_TOKEN }}" \
      -H "Content-Type: application/json" \
      -d "$(jq -n \
        --arg version "${{ inputs.version }}" \
        --arg releaseType patch \
        --arg env dev \
        --arg commitSha "${{ github.sha }}" \
        --arg deployedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        --arg deployedBy "${{ github.actor }}@users.noreply.github.com" \
        '{version: $version, releaseType: $releaseType, env: $env, commitSha: $commitSha, deployedAt: $deployedAt, releasedBy: $deployedBy}')"
```

Field notes:
- `commitSha` and `deployedAt` are **camelCase** — matching the dev ingest endpoint's wire format (route.ts line 21–24)
- `releasedBy` (not `deployedBy`) is the field name the dev endpoint reads — set from the actor email
- `inputs.version` must already be declared upstream in the `ci-cd.yml` inputs (standard in the current shared-workflows setup)
- The admin endpoint is idempotent for the same `(project, version, env)` triple — safe to re-run if the step retries

### D.3 — WORKFLOW-02: deploy-prod.yml prod-deploy notify step

Append this step to the deploy job in `deploy-prod.yml`, after the existing prod deploy step completes successfully:

```yaml
- name: Notify admin of prod promotion
  if: success() && inputs.notify-admin
  run: |
    curl -fsSL -X POST "${{ inputs.admin-api-url }}/api/releases/promoted" \
      -H "Authorization: Bearer ${{ secrets.ADMIN_API_TOKEN }}" \
      -H "Content-Type: application/json" \
      -d "$(jq -n \
        --arg version "${{ inputs.tag }}" \
        --arg commit_sha "${{ github.sha }}" \
        --arg deployed_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        --arg deployed_by "${{ github.actor }}@users.noreply.github.com" \
        '{version: $version, commit_sha: $commit_sha, deployed_at: $deployed_at, deployed_by: $deployed_by}')"
```

Field notes:
- `commit_sha`, `deployed_at`, `deployed_by` are **snake_case** — matching the prod ingest endpoint's wire format (Plan 05-01)
- `inputs.tag` is the input `deploy-prod.yml` already accepts — Phase 4's GATE-10 dispatches with `tag` set to the release version string
- The `/api/releases/promoted` endpoint is idempotent — if a prod row already exists for `(project, version, env=prod)`, it returns 200 with the existing row and does not double-insert (Plan 05-01 idempotency short-circuit)
- The endpoint also atomically updates the matching dev row's status to `promoted` in the same transaction

### D.4 — Tag a new shared-workflows release

After both files are merged to main in shared-workflows:

```bash
# In the shared-workflows repo
git tag v0.4.0   # check existing tags first: git tag --list 'v*'
git push origin v0.4.0
```

Note the tag version here for use in Section E: **Tag used: ________________**

### Section D checklist

- [ ] `notify-admin`, `admin-api-url` inputs added to `ci-cd.yml` workflow_call signature
- [ ] `ADMIN_API_TOKEN` secret added to `ci-cd.yml` workflow_call secrets
- [ ] `notify-admin`, `admin-api-url` inputs added to `deploy-prod.yml` workflow_call signature
- [ ] `ADMIN_API_TOKEN` secret added to `deploy-prod.yml` workflow_call secrets
- [ ] Dev-deploy notify step (D.2) appended to `ci-cd.yml` deploy job
- [ ] Prod-deploy notify step (D.3) appended to `deploy-prod.yml` deploy job
- [ ] Both files merged to main in `MyAlterLego/shared-workflows`
- [ ] New shared-workflows tag pushed (note the version: __________________)

---

## Section E — Phase 5 pilot: Truth+Treason consumes new shared-workflows (PILOT-01)

Truth+Treason (`MyAlterLego/triarchsecurity-portal`) is the pilot project for v1.14. This section wires it up to the new shared-workflows version and verifies the dev round-trip before the full E2E smoke test in Section F.

### E.1 — Bump shared-workflows ref in Truth+Treason

In the `MyAlterLego/triarchsecurity-portal` repo, update the `uses:` line in the CI workflow files to reference the new shared-workflows tag from Section D.4:

```yaml
# .github/workflows/ci-cd.yml — bump the ref on the uses: line
jobs:
  build:
    uses: MyAlterLego/shared-workflows/.github/workflows/ci-cd.yml@v0.4.0  # ← tag from Section D.4
    secrets:
      ADMIN_API_TOKEN: ${{ secrets.ADMIN_API_TOKEN }}
      # ... existing secrets (FIREBASE_SERVICE_ACCOUNT, GITHUB_PACKAGES_TOKEN, etc.) ...
```

Make the same change in `deploy-prod.yml` — bump to `@v0.4.0` (or whatever tag was used in D.4).

Commit with a version bump per CLAUDE.md (patch bump for the ref change, e.g. current version + 0.0.1).

### E.2 — Set ADMIN_API_TOKEN secret in Truth+Treason's GitHub repo

Look up Truth+Treason's project API key from the admin production DB:

```sql
SELECT key, api_key FROM projects WHERE key = 'triarchsecurity-portal';
```

If `triarchsecurity-portal` is not in the projects table, it needs to be seeded first. Run as staff on https://admin.triarch.dev/admin/modules/projects → "New Project" → key: `triarchsecurity-portal`, name: `Truth+Treason`, or use the admin DB directly.

Set the key as a GitHub Actions secret on the Truth+Treason repo:
1. GitHub → `MyAlterLego/triarchsecurity-portal` → Settings → Secrets and variables → Actions
2. Click "New repository secret"
3. Name: `ADMIN_API_TOKEN`
4. Value: the `api_key` value from the SQL above
5. Click "Add secret"

### E.3 — Trigger a dev deploy and verify the round-trip

Push a no-op commit to Truth+Treason's main branch (version bump per CLAUDE.md is sufficient — change `package.json` version by a patch, commit, push):

```bash
# in MyAlterLego/triarchsecurity-portal
# bump patch version in package.json, then:
git add package.json
git commit -m "v<next>: bump version (shared-workflows ref update)"
git push origin main
```

Wait for the `ci-cd.yml` GitHub Actions run to complete. Then verify in the admin production DB:

```sql
SELECT id, project, version, env, status, commit_sha, deployed_at, released_by
FROM release_logs
WHERE project = 'triarchsecurity-portal'
ORDER BY created_at DESC
LIMIT 3;
```

Expected: at least one row with `env='dev'`, `status='dev'`, `commit_sha` populated (the GitHub sha from the push), `deployed_at` populated (the timestamp from the workflow step).

If no row appears within 2 minutes of the workflow completing: check the GitHub Actions run log for the "Notify admin of dev deploy" step — look for a non-200 HTTP status or a curl error. Common causes: `ADMIN_API_TOKEN` not set, project key mismatch, or the endpoint returned 400 (field validation failure).

### Section E checklist

- [ ] Truth+Treason's `ci-cd.yml` ref bumped to the new shared-workflows tag
- [ ] Truth+Treason's `deploy-prod.yml` ref bumped to the new shared-workflows tag
- [ ] `ADMIN_API_TOKEN` secret set on `MyAlterLego/triarchsecurity-portal` GitHub repo
- [ ] No-op push triggered a `ci-cd.yml` run that completed successfully
- [ ] `release_logs` row for `triarchsecurity-portal` appears in admin DB (`env='dev'`, `status='dev'`, `commit_sha` and `deployed_at` populated)

---

## Section F — Full E2E smoke test (PILOT-01 success criterion)

This is the definitive test of the entire v1.14 release-gating workflow on a real project. The chain: customer admin clicks Approve on `/projects/triarchsecurity-portal/releases` → Slack message in `#release-approvals` → staff clicks Promote → GitHub App dispatches `deploy-prod.yml` → workflow completes → POSTs to `/api/releases/promoted` → admin DB has paired prod row → Timeline in the customer page reflects all 5 lifecycle events.

Run through all 14 steps as Mike (or the staff Slack user mapped in `SLACK_USER_MAP`):

**Step 1.** Sign in to https://admin.triarch.dev as a customer admin email seeded in Truth+Treason's `project_members` table. This should be a real customer admin email, or a test email you've seeded with role `admin` for `project_key='triarchsecurity-portal'`.

If no customer admin email is seeded yet:
```sql
INSERT INTO project_members (project_key, email, role)
VALUES ('triarchsecurity-portal', 'test-customer@example.com', 'admin');
```
Then sign in with that email via the admin sign-in flow.

**Step 2.** Navigate to `/projects/triarchsecurity-portal/releases`.

**Step 3.** Find the release created in Section E.3 — its status column should show `dev`. Confirm the version matches the version that was pushed.

**Step 4.** Expand the release row by clicking it. The Timeline subsection (added in Plan 05-02) should show exactly one event: `GitCommit — Deployed to dev — <relative time> — <ci actor email>`.

**Step 5.** Click "Approve for Production". A confirmation button appears: "Confirm approval (5s…)" with a 5-second countdown. Click "Confirm approval" before the countdown expires.

The status badge should change to teal `approved`. An audit row is created in `release_approvals`. The Timeline now shows: `GitCommit → ShieldCheck Approved for production`.

**Step 6.** Within a few seconds (typically under 5 seconds), a Slack message should appear in `#release-approvals` containing:
- Project: `triarchsecurity-portal`
- Version: the version from E.3
- Approved by: the customer admin email from Step 1
- Two action buttons: "Approve and Promote" / "Reject"

If no message arrives within 30 seconds: check Cloud Run logs for `[slack]` warnings — likely `SLACK_BOT_TOKEN` is unset or the bot is not invited to `#release-approvals` (see Section B and 03-HUMAN-UAT.md troubleshooting).

**Step 7.** As `mike@triarchsecurity.com` (the staff account mapped in `SLACK_USER_MAP`), click "Approve and Promote" in Slack.

The Slack message should update to: `:white_check_mark: Promoted to production by @mike (mike@triarchsecurity.com)`.

**Step 8.** Within ~10 seconds, a threaded reply should appear in the same Slack thread: `:rocket: Workflow dispatched: deploy-prod.yml run #<N>`.

If no threaded reply appears: check Cloud Run logs for `[github-app]` errors — likely `GITHUB_APP_PRIVATE_KEY` format issue or wrong `GITHUB_APP_INSTALLATION_ID` (see Section C and 04-HUMAN-UAT.md troubleshooting).

**Step 9.** Visit https://github.com/MyAlterLego/triarchsecurity-portal/actions and confirm a fresh `deploy-prod.yml` run started with the `tag` input matching the release version from E.3.

**Step 10.** Wait for `deploy-prod.yml` to complete. Firebase App Hosting deploys typically take 2–5 minutes.

**Step 11.** After the workflow completes, verify in the admin production DB:

```sql
SELECT id, project, version, env, status, deployed_at, released_by,
       promotion_dispatched_at, promotion_dispatched_by
FROM release_logs
WHERE project = 'triarchsecurity-portal'
  AND version = '<version from E.3>'
ORDER BY env, created_at DESC;
```

Expected: **two rows**:
- **dev row**: `env='dev'`, `status='promoted'`, `promotion_dispatched_at` and `promotion_dispatched_by` populated (set when Mike clicked Promote in Slack — Phase 4 audit column)
- **prod row**: `env='prod'`, `status='promoted'`, `deployed_at` = the `deploy-prod.yml` completion timestamp, `released_by` = the GitHub Actions actor email

If only the dev row exists: the `deploy-prod.yml` notify step (Section D.3) did not fire or returned a non-200 response. Check the GitHub Actions run log for the "Notify admin of prod promotion" step.

If the dev row's `status` is still `approved` (not `promoted`): the `/api/releases/promoted` endpoint's atomic transaction did not update the dev row. This would be a code issue — file a gap.

**Step 12.** Sign back in to https://admin.triarch.dev as the customer admin email from Step 1. Navigate to `/projects/triarchsecurity-portal/releases`. Expand the same release row.

The Timeline should now show **all 5 lifecycle events** in chronological order:
1. `GitCommit` — Deployed to dev — `<ci actor>` — `<dev deployed_at>`
2. `MessageSquare` — Feedback posted — `<customer admin email>` — `<feedback timestamp>` (if any feedback was posted before approval; may not appear if no feedback was added)
3. `ShieldCheck` — Approved for production — `<customer admin email>` — `<approval timestamp>`
4. `Rocket` — Promotion dispatched — `mike@triarchsecurity.com` — `<promotion_dispatched_at timestamp>`
5. `Server` — Deployed to production — `<github actor email>` — `<prod deployed_at>`

Note: If no feedback was posted in Step 5 before approving, the `MessageSquare` event will not appear (correct behavior — it only shows when `release_feedback` rows exist for the release).

**Step 13.** Hover over each relative timestamp (e.g. "2h ago") to confirm the absolute ISO timestamp appears in a title tooltip.

**Step 14 (optional — idempotency sanity check).** In the GitHub Actions UI, re-trigger the `deploy-prod.yml` run manually for the same version using "Re-run all jobs". After it completes, verify the admin DB still has exactly **two rows** for that version (one dev, one prod) — no third row inserted. The `/api/releases/promoted` endpoint's idempotency short-circuit should prevent a duplicate prod row.

```sql
SELECT COUNT(*), env FROM release_logs
WHERE project = 'triarchsecurity-portal'
  AND version = '<version from E.3>'
GROUP BY env;
```

Expected: two rows total — `dev: 1`, `prod: 1`. Not three.

### Section F checklist

- [ ] Customer admin clicks Approve → status badge turns `approved` ≤5 seconds
- [ ] Slack message arrives in `#release-approvals` ≤30 seconds of approval
- [ ] Staff clicks "Approve and Promote" → Slack message updates to promoted state
- [ ] Threaded Slack reply confirms `deploy-prod.yml` dispatched ≤10 seconds of Promote click
- [ ] GitHub Actions shows fresh `deploy-prod.yml` run with correct `tag` input
- [ ] `deploy-prod.yml` completes successfully (green check)
- [ ] Admin DB: dev row has `status='promoted'`, `promotion_dispatched_at` and `promotion_dispatched_by` populated
- [ ] Admin DB: prod row exists with `env='prod'`, `status='promoted'`, `deployed_at` and `released_by` from the workflow
- [ ] Customer page Timeline shows all 5 lifecycle events with correct actors and relative timestamps
- [ ] (Optional) Idempotent re-run: DB still has exactly 2 rows (1 dev + 1 prod) after a second `deploy-prod.yml` run

---

## Section G — Milestone closeout signoff

All sections above complete? v1.14.0 ships.

Final checklist:
- [ ] Section A complete — Phase 2 DB push (migration 0008, `release_approvals.reason` column)
- [ ] Section B complete — Phase 3 Slack App (App created, 3 secrets pushed, bot in channel, `SLACK_USER_MAP` populated)
- [ ] Section C complete — Phase 4 GitHub App (App created, 3 secrets pushed, migration 0009 applied)
- [ ] Section D complete — shared-workflows POST steps added and tagged (`ci-cd.yml` + `deploy-prod.yml`, new tag pushed)
- [ ] Section E complete — Truth+Treason ref bumped, `ADMIN_API_TOKEN` set, dev round-trip verified
- [ ] Section F complete — full E2E smoke test passes end-to-end (all 5 Timeline events visible)

When all six are checked:

1. Bump `package.json` to `1.14.0` in the admin repo:
   ```bash
   # in admin repo
   # edit package.json: "version": "1.14.0"
   git add package.json
   git commit -m "v1.14.0: milestone closeout — customer release gating"
   git push origin main
   ```
2. Monitor the Firebase App Hosting deploy at https://console.firebase.google.com (or via `firebase apphosting:backends:list`)
3. Confirm https://admin.triarch.dev is live and healthy after the deploy
4. Update `.planning/STATE.md` milestone status to `complete`

---

## Troubleshooting

### ADMIN_API_TOKEN 401 from CI

The GitHub Actions step returns a 401. Cause: the `ADMIN_API_TOKEN` secret in the consuming repo does not match the `api_key` stored in the admin DB's `projects` table for that project.

Fix:
1. Look up the correct key: `SELECT api_key FROM projects WHERE key = 'triarchsecurity-portal';`
2. Update the GitHub secret: repo → Settings → Secrets → `ADMIN_API_TOKEN` → Update
3. Re-run the failed workflow step

### /api/releases/promoted returns 404 — "no dev row found"

The prod notify step can't find a matching dev row for the version being promoted.

Cause: version string mismatch between what `ci-cd.yml` sent (`inputs.version`) and what `deploy-prod.yml` is sending (`inputs.tag`). Verify both use the same version string — the `ci-cd.yml` post uses `${{ inputs.version }}` and the `deploy-prod.yml` post uses `${{ inputs.tag }}`. These must resolve to the same semver string (e.g. `1.0.5` not `v1.0.5`).

Fix: check the `release_logs` table: `SELECT version FROM release_logs WHERE project = 'triarchsecurity-portal' ORDER BY created_at DESC LIMIT 5;` — compare the stored version to what `deploy-prod.yml` is sending.

### Timeline missing "Promotion dispatched" event

`promotion_dispatched_at` is NULL in the dev row.

Cause: the Slack → GitHub App handler in `/api/slack/interact` (Phase 4 plan 04-04) did not write the audit columns. Check Cloud Run logs for `[github-app]` or `[slack-interact]` errors at the time Mike clicked Promote. The most common causes: GitHub App installation token failure (see 04-HUMAN-UAT.md troubleshooting) or the dispatch call returned an error that was swallowed.

### Timeline missing "Deployed to production" event

`pairedProd` is null — no prod row exists for the release.

Cause: the `deploy-prod.yml` "Notify admin of prod promotion" step either did not fire (`if: success() && inputs.notify-admin` evaluated false) or returned a non-200 response. Check the GitHub Actions run log for that specific step. Common sub-causes: `ADMIN_API_TOKEN` not set at deploy-prod.yml level, or `/api/releases/promoted` returned 400 (field validation failure — check snake_case field names in the curl command match D.3 exactly).

### Slack signing-secret mismatch ("Verification failed" toast)

See [03-HUMAN-UAT.md Troubleshooting](../03-slack-interactive-approval/03-HUMAN-UAT.md) — bad_signature means `SLACK_SIGNING_SECRET` mismatch; stale means clock skew between the admin server and Slack's servers.

### GitHub App installation token 401 or 404

See [04-HUMAN-UAT.md Troubleshooting](../04-github-app-promotion/04-HUMAN-UAT.md) — 401 means corrupted PEM or wrong `GITHUB_APP_ID`; 404 means wrong `GITHUB_APP_INSTALLATION_ID`.

### "dispatch failed: 404 Workflow not found"

Target repo does not have `.github/workflows/deploy-prod.yml` on its `main` branch. For Truth+Treason this should be present — verify the file exists. If this error appears for another project during onboarding, refer to `docs/onboarding-projects.md` for the workflow setup steps.

### Slack button click → "not mapped to a staff account"

`SLACK_USER_MAP` in `src/lib/slack-identity.ts` is missing the clicker's Slack user ID. Refer to [03-HUMAN-UAT.md Step 7](../03-slack-interactive-approval/03-HUMAN-UAT.md) to find your member ID and add the mapping.

---

*Phase: 05-round-trip-+-shared-workflows+pilot*
*Authored: 2026-05-04*
*Covers: Phases 2, 3, 4, 5 deferred work + v1.14.0 milestone closeout*
