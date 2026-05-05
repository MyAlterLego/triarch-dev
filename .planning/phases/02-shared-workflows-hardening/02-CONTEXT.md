# Phase 2: shared-workflows Hardening - Context

**Gathered:** 2026-05-05 (auto mode)
**Status:** Ready for planning

<domain>
## Phase Boundary

Modify `MyAlterLego/shared-workflows` so every deploy notifies the admin control plane:

1. `deploy-firebase.yml` POSTs dev deploy completion to admin's `/api/platform/ingest/release-logs` (creates a `release_logs` row with env=dev)
2. `deploy-prod.yml` POSTs prod deploy completion to admin's `/api/releases/promoted` (transitions an existing dev release to env=prod)
3. `deploy-firebase.yml` accepts a `git_branch` input; non-main branches call `firebase apphosting:rollouts:create --git-branch <branch>` to create a preview deploy at FAH's branch URL

Out of scope: the `promote-branch.yml` workflow (Phase 4 / WORKFLOW-04), Slack conflict notifications (Phase 5 / WORKFLOW-05), DB schema changes (Phase 3 already shipped — `release_logs.branch` column is already in place per SCHEMA-01).

</domain>

<decisions>
## Implementation Decisions

### Auth pattern for shared-workflows → admin callbacks

- **D-01:** Bearer token via `Authorization: Bearer ${{ secrets.ADMIN_API_TOKEN }}` header. Each consuming repo holds its own `ADMIN_API_TOKEN` Actions secret valued with that project's `projects.apiKey` from CRDB. No vault read needed for this token (it's per-project, not shared).
- **D-02:** Admin verifies the token via the existing `requireApiKey` middleware in `src/lib/api-key-auth.ts` — already in place, no changes needed on the admin side for auth.

### Callback failure behavior

- **D-03:** The callback step uses `continue-on-error: true`. A failed POST does NOT fail the workflow run — deploy is the source of truth. The callback writes a `::warning::` annotation to the workflow summary so missed callbacks are visible.
- **D-04:** No retry inside the workflow. If the callback misses, admin's existing `recover-deploy` reconciliation (or a future cron) handles drift. Keep the workflow simple.

### Branch preview deploy semantics (WORKFLOW-03)

- **D-05:** New input `git_branch` on `deploy-firebase.yml`. When unset OR equals `main`, behavior is unchanged (current `--git-branch main` rollout). When non-main, the workflow runs `firebase apphosting:rollouts:create <backend> --git-branch <git_branch>` against the same backend.
- **D-06:** Preview URL pattern follows FAH's standard: `https://<sanitized-branch>--<backend>.<region>.hosted.app`. The workflow captures the URL from the rollout output (or constructs it deterministically from inputs) and passes it as `previewUrl` in the `release-logs` ingest payload.
- **D-07:** Preview URLs go to a SEPARATE `release_logs` row (env=dev, branch=<git_branch>). NOT the existing main-branch dev row. Phase 7 (multi-branch RC) will surface these by branch.

### Payload contracts

- **D-08:** Dev deploy callback (POST `/api/platform/ingest/release-logs`) sends:
  ```json
  {
    "version": "<extracted from APP_VERSION>",
    "releaseType": "patch",
    "env": "dev",
    "commitSha": "<github.sha>",
    "deployedAt": "<ISO-8601>",
    "releasedBy": "<github.actor>",
    "branch": "<github.ref_name or git_branch input>",
    "previewUrl": "<FAH URL or empty for main>"
  }
  ```
  `releaseType` defaulted to `"patch"` for now; Claude's discretion to refine if version diff implies major/minor.
- **D-09:** Prod deploy callback (POST `/api/releases/promoted`) sends:
  ```json
  {
    "version": "<APP_VERSION>",
    "commit_sha": "<github.sha>",
    "deployed_at": "<ISO-8601>",
    "deployed_by": "<github.actor>"
  }
  ```
  Endpoint resolves the matching release row by `(project, version)` and updates env=prod.

### Workflow versioning

- **D-10:** Modifications land on `MyAlterLego/shared-workflows` `main` branch and are tagged `v2`. The existing `v1` tag stays in place for any consumer that hasn't migrated.
- **D-11:** Each consuming repo (admin, CRM, future Triarch projects) bumps `@v1` → `@v2` in their `.github/workflows/ci-cd.yml` references. Admin and CRM bumps are part of this phase; other repos opt in later (`triarchsecurity-portal`, `darksouls-rpg`, `thisnthat`, etc.).

### Schema interaction

- **D-12:** `release_logs.branch` column is ALREADY shipped in admin (SCHEMA-01 from Phase 3 of v1.14). The ingest endpoint already accepts `branch` (defaults to `'main'` if omitted). No admin schema changes needed in this phase.
- **D-13:** `previewUrl` is a NEW field. Add as a nullable `previewUrl` column on `release_logs` (or as a key in the existing `metadata` JSONB column) — **Claude's discretion** to decide column vs. metadata based on how often it's queried.

### Claude's Discretion

- Exact bash for extracting `previewUrl` from `firebase apphosting:rollouts:create` output
- Whether to add `previewUrl` as a dedicated DB column or store in `metadata` JSONB
- How to derive `releaseType` (patch/minor/major) — heuristic from semver diff vs. always `"patch"` and let the manual edit fix it
- Workflow step ordering and naming conventions
- Whether to extract a reusable `notify-admin/action.yml` composite action vs inline shell in each workflow

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Admin endpoints (already in place — must NOT break their contracts)
- `src/app/api/platform/ingest/release-logs/route.ts` — Bearer auth via `requireApiKey`; accepts version, releaseType, summary, entries, metadata, releasedBy, env, commitSha, deployedAt, branch
- `src/app/api/releases/promoted/route.ts` — GATE-12 endpoint; accepts version, commit_sha, deployed_at, deployed_by; resolves release by (project, version) and transitions to env=prod
- `src/lib/api-key-auth.ts` — `requireApiKey(req)` reads `Authorization: Bearer <token>` and matches against `projects.apiKey`

### Schema (already shipped)
- `src/db/schema.ts` — `releaseLogs` table; `branch` column lives here
- `.planning/phases/03-schema-github-app-permissions/03-SUMMARY.md` (when read by planner) — confirms SCHEMA-01 done

### Shared workflows source (live in a SEPARATE repo)
- `MyAlterLego/shared-workflows` — repo to modify. Currently at `v1` tag. Files of interest: `.github/workflows/deploy-firebase.yml`, `.github/workflows/deploy-prod.yml`, `.github/workflows/quality-gate.yml`, `.github/workflows/notify.yml`
- Existing `deploy-prod.yml` may already exist or may need to be created — planner verifies via `gh api /repos/MyAlterLego/shared-workflows/contents/.github/workflows/`

### Roadmap
- `.planning/ROADMAP.md` §"Phase 2: shared-workflows Hardening" — three success criteria
- `.planning/REQUIREMENTS.md` — WORKFLOW-01, WORKFLOW-02, WORKFLOW-03

### From Phase 1 (just completed)
- `.planning/phases/01-central-secrets-vault/01-CONTEXT.md` — establishes vault pattern, NOT used in Phase 2 (per-project ADMIN_API_TOKEN stays as Actions secret)
- `.planning/phases/01-central-secrets-vault/01-04-SUMMARY.md` — recent admin code patterns

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`requireApiKey` middleware** (`src/lib/api-key-auth.ts`): admin already verifies Bearer tokens; shared-workflows just sends `Authorization: Bearer ${{ secrets.ADMIN_API_TOKEN }}` and admin handles the rest.
- **`/api/platform/ingest/release-logs`**: full payload schema already supported including `branch` (defaults to `main`).
- **`/api/releases/promoted`**: prod transition endpoint already exists from v1.14.
- **`shared-workflows/deploy-firebase.yml` v1**: already extracts `APP_VERSION` from `version.ts` / `version.js` / `package.json` (logic to reuse).

### Established Patterns

- **Workflow inputs as named keys, not env vars** — current deploy-firebase.yml uses `firebase_project_id`, `app_hosting_backend`, `app_url`, `deploy_command`. Add `git_branch` in the same style.
- **`secrets.GH_PAT || github.token` fallback** — existing convention for token defaults; can mirror for `ADMIN_API_TOKEN` if no fallback is desired (probably not — fail fast if missing).
- **Workflow summary annotations** (`echo "## ..." >> $GITHUB_STEP_SUMMARY`) — used today; reuse for callback success/failure visibility.

### Integration Points

- **shared-workflows deploy-firebase.yml**: ADD a "Notify admin (dev)" step after the deploy step succeeds. New input `git_branch` defaults to `main`. New input `admin_callback_url` defaults to `https://admin.triarch.dev`.
- **shared-workflows deploy-prod.yml** (may not exist yet): CREATE if missing; ADD a "Notify admin (prod)" step. Mirror deploy-firebase.yml structure.
- **Each consumer's `.github/workflows/ci-cd.yml`**: bump `@v1` → `@v2` once shared-workflows v2 is tagged. Admin's ci-cd.yml uses `MyAlterLego/shared-workflows/.github/workflows/deploy-firebase.yml@v1` today.

</code_context>

<specifics>
## Specific Ideas

- The dev deploy callback should fire AFTER the FAH rollout is confirmed live (i.e., after `firebase apphosting:rollouts:create` returns), not before — otherwise we record a "deployed" row for a deploy that didn't actually finish.
- Branch preview URLs follow Firebase App Hosting's documented pattern: `https://<branch>--<backend>.<region>.hosted.app`. For `triarch-dev` backend in `us-central1` with branch `feat/font`, the URL is `https://feat-font--triarch-dev.us-central1.hosted.app` (slash → dash sanitization).
- Workflow ref bumps in admin/CRM repos must be VERY careful — bumping `@v1` → `@v2` on a broken v2 breaks every deploy. Recommend:
  1. Tag v2 only after all 3 success criteria pass on a test branch
  2. Bump admin first as canary
  3. Bump CRM after admin is verified live for one deploy

</specifics>

<deferred>
## Deferred Ideas

- **promote-branch.yml workflow** — WORKFLOW-04, Phase 4
- **Slack conflict notifications from promote-branch** — WORKFLOW-05, Phase 5
- **`releaseType` heuristic** based on semver diff (major/minor/patch detection) — could be its own small refactor task; out of scope for now
- **Reusable `notify-admin/action.yml` composite action** for cross-workflow reuse — Claude's discretion to do this inline vs extract; if extracted later, would be its own backlog item
- **Bumping other Triarch repos to v2** (portal, darksouls, thisnthat, truthtreason, etc.) — opt-in per repo, not in this phase

</deferred>

---

*Phase: 02-shared-workflows-hardening*
*Context gathered: 2026-05-05 via auto mode*
