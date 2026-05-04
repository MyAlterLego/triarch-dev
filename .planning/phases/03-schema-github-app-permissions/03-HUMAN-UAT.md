# Phase 3 HUMAN-UAT: GitHub App contents:write Upgrade (SCHEMA-03)

Phase 3's database changes (release_logs.branch column, slack_action_audit table) ship via Drizzle migrations 0010 + 0011. SCHEMA-03 is the third Phase 3 prerequisite — and the only one that cannot be automated. Mike upgrades the existing `Triarch Release Gate` GitHub App's `Contents` permission from `Read-only` to `Read and write` so Phase 4's `promote-branch.yml` can push merge commits.

Without this upgrade, every `promote-branch.yml` run will 403 on the `git push origin main` step after a successful rebase.

## Prerequisites

- The `Triarch Release Gate` GitHub App exists in the MyAlterLego org (created during v1.14 Phase 04-03)
- Mike has org admin permissions on https://github.com/MyAlterLego
- Phase 3 plans 03-01 (release_logs.branch) and 03-02 (slack_action_audit) have shipped — but those are independent code changes; the App permission upgrade can run in parallel
- Phase 4 (promote-branch.yml) is NOT required to be deployed yet — this upgrade unblocks it

## Step 1 - Open the GitHub App settings

1. Visit https://github.com/organizations/MyAlterLego/settings/apps
2. Find `Triarch Release Gate` in the list and click its name
3. Sidebar -> "Permissions & events" (or "Permissions and events" depending on the GitHub UI version)

## Step 2 - Toggle Contents from Read-only to Read and write

Under "Repository permissions":

| Permission | Current | Target |
|------------|---------|--------|
| Actions    | Read and write | unchanged (leave as Read and write) |
| Contents   | **Read-only**  | **Read and write** ← change this |
| Metadata   | Read-only | unchanged (leave as Read-only) |

1. Find the `Contents` row
2. Open the dropdown
3. Select "Read and write"
4. Scroll to the bottom of the page
5. Click "Save changes"

GitHub displays a banner: "Permissions updated. The installation will need to be re-authorized to use the new permissions."

Do NOT modify any other permission. Do NOT add any subscribed events. Keep the App's blast radius minimal.

## Step 3 - Accept the installation re-authorization

1. Visit https://github.com/organizations/MyAlterLego/settings/installations
2. Find `Triarch Release Gate` -> click the gear / Configure
3. A yellow banner shows: "This installation requires updates to its permissions. Review and accept the new permissions."
4. Click "Review request" (or "Accept new permissions")
5. Confirm the new permission set:
   - Actions: Read and write (no change)
   - Contents: Read and write (NEW)
   - Metadata: Read-only (no change)
6. Click "Accept new permissions"

Once accepted, the installation immediately uses the upgraded scope. Existing installation tokens cached in App Hosting (50-min TTL per github-app.ts) continue to work, but new tokens minted from now on carry the upgraded scope. No restart required.

Optional: speed up token rotation by triggering a redeploy in App Hosting — the in-process cache is per-instance and clears on container start.

## Step 4 - Verify with a test workflow_dispatch

Goal: prove that the App can now push to a branch via the GitHub Actions runtime that Phase 4's `promote-branch.yml` will use.

### Option A (recommended) — Use an existing workflow_dispatch test

If the admin repo already has a write-capable workflow that uses the App's installation token (e.g. anything that calls `actions/checkout@v4` with `token: ${{ steps.app-token.outputs.token }}` and then `git push`):

1. From the admin repo root:
   ```bash
   gh workflow list --repo MyAlterLego/triarch-dev-admin
   # find a workflow that writes to the repo, e.g. version-bump.yml
   gh workflow run <workflow-name> --repo MyAlterLego/triarch-dev-admin
   gh run watch --repo MyAlterLego/triarch-dev-admin
   ```
2. Confirm the workflow run completes WITHOUT a 403 on the push step. A green run is the verification.

### Option B — Create a one-shot test workflow

If no existing workflow writes via the App token, add a temporary scratch workflow:

1. Create `.github/workflows/test-contents-write.yml` on a throwaway branch `chore/test-app-contents-write`:
   ```yaml
   name: Test App contents:write
   on:
     workflow_dispatch:
   jobs:
     write-test:
       runs-on: ubuntu-latest
       permissions:
         contents: write
       steps:
         - uses: actions/create-github-app-token@v1
           id: app-token
           with:
             app-id: ${{ vars.GITHUB_APP_ID }}
             private-key: ${{ secrets.GITHUB_APP_PRIVATE_KEY }}
             owner: MyAlterLego
         - uses: actions/checkout@v4
           with:
             token: ${{ steps.app-token.outputs.token }}
             ref: chore/test-app-contents-write
         - name: Write marker and push
           run: |
             git config user.name "triarch-release-gate[bot]"
             git config user.email "triarch-release-gate[bot]@users.noreply.github.com"
             echo "$(date -u)" > .gha-permission-test
             git add .gha-permission-test
             git commit -m "test: verify contents:write"
             git push origin chore/test-app-contents-write
   ```
   (`GITHUB_APP_ID` and `GITHUB_APP_PRIVATE_KEY` must already be configured as repo or org secrets/vars from v1.14 Phase 04-03.)

2. Push the branch and dispatch:
   ```bash
   git checkout -b chore/test-app-contents-write
   git add .github/workflows/test-contents-write.yml
   git commit -m "chore: test contents:write permission"
   git push origin chore/test-app-contents-write
   gh workflow run "Test App contents:write" --ref chore/test-app-contents-write --repo MyAlterLego/triarch-dev-admin
   gh run watch --repo MyAlterLego/triarch-dev-admin
   ```

3. Confirm:
   - Workflow status: green
   - The push step succeeded (no `403 Resource not accessible by integration`)
   - The branch on origin has a new commit with `.gha-permission-test`

4. Clean up:
   ```bash
   git push origin --delete chore/test-app-contents-write
   # locally:
   git checkout main
   git branch -D chore/test-app-contents-write
   ```

### Option C — Direct gh api PUT (smoke test)

Quickest sanity check — does NOT exercise the workflow runtime, just the App credential directly. Useful as a fast preflight before running Option A or B.

Prerequisite: a local installation token. Generate via the App's private key + JWT exchange (or use a dev script if one exists in the repo). Then:

```bash
# Replace $TOKEN with the installation access token
curl -X PUT \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/MyAlterLego/triarch-dev-admin/contents/.gha-permission-test \
  -d '{
    "message": "test: contents:write smoke",
    "content": "'"$(date -u | base64)"'",
    "branch": "chore/test-app-contents-write"
  }'
```

A 201 response confirms the permission upgrade is live. A 403 means the upgrade did not propagate (re-check Step 3's "Accept new permissions").

Clean up: delete the test file via another `PUT` (or merge a PR that removes it).

## Verification checklist

- [ ] App settings page shows Contents = "Read and write" (https://github.com/organizations/MyAlterLego/settings/apps/triarch-release-gate -> Permissions and events)
- [ ] Installation page no longer shows the yellow "permissions update required" banner (https://github.com/organizations/MyAlterLego/settings/installations)
- [ ] Test workflow_dispatch (Option A or B) ran green with a successful push step, OR
- [ ] Direct `gh api PUT` (Option C) returned 201
- [ ] Test artifacts cleaned up (test branch deleted, test workflow file removed if Option B was used)
- [ ] No other App permissions were modified (Actions still Read and write, Metadata still Read-only)

## Rotation / future changes

To revoke contents:write later (e.g. if Phase 4 is rolled back or a security audit demands minimum scope):

1. App settings -> Permissions and events -> Contents -> Read-only
2. Save changes
3. Installation page -> Accept reduced permissions
4. Existing installation tokens minted under contents:write keep working until they expire (50-min TTL); new tokens carry the reduced scope

## Troubleshooting

- "403 Resource not accessible by integration" on push step — installation re-authorization in Step 3 was not accepted. Re-visit https://github.com/organizations/MyAlterLego/settings/installations and accept the pending permissions update
- Test workflow says "App token has insufficient permissions for this resource" — Same root cause; Step 3 not completed
- Step 3 banner does not appear — sometimes the re-authorization request takes 30-60 seconds to propagate. Refresh the installations page. If it still doesn't appear after a minute, revisit Step 2 and confirm "Save changes" was clicked
- `actions/create-github-app-token@v1` fails to mint a token — the App ID or private key may have rotated since v1.14. Re-run the relevant section of v1.14 Phase 04-03's runbook (Step 5) to push fresh secrets via `firebase apphosting:secrets:set` (only relevant for the admin app's runtime; for repo-level workflow tests, secrets/vars live on the GitHub repo or org)
- Multiple Apps named similarly — confirm you're editing `Triarch Release Gate` (the App used by `src/lib/github-app.ts`), NOT a sibling test/sandbox App if any exist
