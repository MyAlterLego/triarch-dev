# Phase 2: shared-workflows Hardening - Research

**Researched:** 2026-05-04
**Domain:** GitHub Actions reusable workflows, Firebase App Hosting CLI, admin endpoint contracts
**Confidence:** HIGH (endpoint contracts verified from source; workflow structure verified from live repo; FAH URL behavior verified via official docs)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Bearer token via `Authorization: Bearer ${{ secrets.ADMIN_API_TOKEN }}` header. Each consuming repo holds its own `ADMIN_API_TOKEN` Actions secret valued with that project's `projects.apiKey` from CRDB. No vault read needed for this token.
- **D-02:** Admin verifies via existing `requireApiKey` middleware — no admin-side auth changes needed.
- **D-03:** Callback step uses `continue-on-error: true`. Failed POST does NOT fail the workflow. Writes `::warning::` annotation to workflow summary.
- **D-04:** No retry inside workflow. Admin's existing reconciliation handles drift.
- **D-05:** New input `git_branch` on `deploy-firebase.yml`. Unset or `main` → unchanged behavior (`--git-branch main`). Non-main → `firebase apphosting:rollouts:create <backend> --git-branch <git_branch>`.
- **D-06:** Preview URL follows FAH's standard pattern; workflow captures URL from rollout output or constructs deterministically; passes as `previewUrl` in release-logs ingest payload.
- **D-07:** Preview URLs go to a SEPARATE `release_logs` row (env=dev, branch=<git_branch>). Not the existing main-branch dev row.
- **D-08:** Dev deploy callback payload (POST `/api/platform/ingest/release-logs`):
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
- **D-09:** Prod deploy callback payload (POST `/api/releases/promoted`):
  ```json
  {
    "version": "<APP_VERSION>",
    "commit_sha": "<github.sha>",
    "deployed_at": "<ISO-8601>",
    "deployed_by": "<github.actor>"
  }
  ```
- **D-10:** Changes land on `MyAlterLego/shared-workflows` `main` branch, tagged `v2`. `v1` stays stable.
- **D-11:** Admin and CRM bump `@v1` → `@v2`. Other repos opt in later.
- **D-12:** `release_logs.branch` column is ALREADY shipped (SCHEMA-01, Phase 3 complete). No schema change for branch.
- **D-13:** `previewUrl` is a NEW field — Claude's discretion: dedicated column vs `metadata` JSONB.

### Claude's Discretion

- Exact bash for extracting `previewUrl` from `firebase apphosting:rollouts:create` output
- Whether to add `previewUrl` as a dedicated DB column or store in `metadata` JSONB
- How to derive `releaseType` (patch/minor/major) — heuristic or always `"patch"`
- Workflow step ordering and naming conventions
- Whether to extract a reusable `notify-admin/action.yml` composite action vs inline shell in each workflow

### Deferred Ideas (OUT OF SCOPE)

- `promote-branch.yml` workflow (Phase 4 / WORKFLOW-04)
- Slack conflict notifications (Phase 5 / WORKFLOW-05)
- `releaseType` heuristic based on semver diff
- Reusable composite action extraction
- Bumping other Triarch repos to v2 (portal, darksouls, thisnthat, etc.)
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| WORKFLOW-01 | `shared-workflows/deploy-firebase.yml` POSTs dev deploy completion to admin's `/api/platform/ingest/release-logs` with version, commitSha, deployedAt, releasedBy, env=dev | Endpoint accepts all required fields; `requireApiKey` pattern confirmed; workflow already extracts APP_VERSION |
| WORKFLOW-02 | `shared-workflows/deploy-prod.yml` POSTs prod deploy completion to admin's `/api/releases/promoted` with version, commit_sha, deployed_at, deployed_by | Endpoint verified: resolves by (project, version, env=dev); all four fields required; snake_case wire format; `deploy-prod.yml` does NOT yet exist in shared-workflows |
| WORKFLOW-03 | `shared-workflows/deploy-firebase.yml` accepts `git_branch` input; calls `firebase apphosting:rollouts:create --git-branch <branch>` for non-main branches | FAH CLI syntax confirmed; CRITICAL URL caveat documented below (same backend URL, not per-branch preview URL) |
</phase_requirements>

---

## Summary

Phase 2 modifies `MyAlterLego/shared-workflows` — a separate repo currently at `v1.4` tag — to close the notification gap between deployed state and admin's control plane. Three distinct additions are required:

1. **WORKFLOW-01**: A "Notify admin (dev)" step appended to `deploy-firebase.yml` after the FAH rollout completes. It POSTs to admin's `/api/platform/ingest/release-logs` using a per-project `ADMIN_API_TOKEN` Actions secret. The endpoint is already fully implemented and accepts all the required fields including `branch` (SCHEMA-01) and `metadata` (for `previewUrl` if stored there).

2. **WORKFLOW-02**: A new `deploy-prod.yml` workflow file must be created in shared-workflows — it does NOT currently exist. The prod callback POSTs to `/api/releases/promoted`, which performs an atomic INSERT (prod row) + UPDATE (dev row to `promoted` status) in CockroachDB. The endpoint requires exactly four snake_case fields: `version`, `commit_sha`, `deployed_at`, `deployed_by`. The truthtreason project has an inline `deploy-prod.yml` that can serve as structural reference.

3. **WORKFLOW-03**: The `git_branch` input to `deploy-firebase.yml`. When non-main, the workflow calls `firebase apphosting:rollouts:create <backend> --git-branch <git_branch>` instead of the hardcoded `--git-branch main`. **CRITICAL FINDING**: Firebase App Hosting's `--git-branch` rollout deploys to the SAME backend URL (`backend-id--project-id.region.hosted.app`). There is no per-branch preview subdomain created. The "branch preview URL" is deterministically constructable but is the backend's live URL for whichever branch was last rolled out — this has important implications for how `previewUrl` should be stored and surfaced in Phase 5 UI.

**Primary recommendation:** Build WORKFLOW-01 and WORKFLOW-02 exactly per locked decisions. For WORKFLOW-03, deterministically construct the `previewUrl` as `https://<sanitized-branch>--<backend>.<region>.hosted.app` (where backend = app_hosting_backend input, region = us-central1 unless parameterized) and store it in `metadata` JSONB rather than a new column — Phase 5 RC UI does not require indexed lookup on previewUrl, and avoiding a schema migration keeps this phase self-contained.

---

## Standard Stack

### Core

| Library / Tool | Version | Purpose | Why Standard |
|----------------|---------|---------|--------------|
| GitHub Actions reusable workflows (`workflow_call`) | N/A | Cross-repo shared CI/CD steps | Already the pattern in use across all Triarch projects |
| Firebase CLI (`firebase-tools`) | npm latest (installed via `npm install -g firebase-tools` in workflow) | `apphosting:rollouts:create` for FAH deploys | Already installed in `deploy-firebase.yml@v1` |
| `curl` (bash) | OS-provided on `ubuntu-latest` | POST to admin callback endpoints | Zero-dep, available in all GitHub-hosted runners |
| `google-github-actions/auth@v2` | v2 | GCP service account auth in GitHub Actions | Already used in `deploy-firebase.yml@v1` |
| `google-github-actions/setup-gcloud@v2` | v2 | gcloud SDK (required for firebase CLI auth flow) | Already used in `deploy-firebase.yml@v1` |

### Supporting

| Library / Tool | Version | Purpose | When to Use |
|----------------|---------|---------|-------------|
| `actions/checkout@v4` | v4 | Clone repo in workflow | All jobs that need source code |
| `actions/setup-node@v4` | v4 | Node.js install for npm ci | All Node-based deploy jobs |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Inline `curl` for admin callback | Reusable composite action (`notify-admin/action.yml`) | Composite is cleaner but adds YAML abstraction layer; Claude's discretion defers extraction to later backlog |
| `metadata` JSONB for `previewUrl` | New `previewUrl` column on `release_logs` | Column is more queryable but requires migration 0012 + `db:push` human action; `metadata` keeps Phase 2 schema-free |

**Installation (in workflow, not package.json):**
```bash
npm install -g firebase-tools
```

---

## Architecture Patterns

### Existing deploy-firebase.yml Structure (v1.4 — confirmed live)

The current workflow at `MyAlterLego/shared-workflows/.github/workflows/deploy-firebase.yml` has this step order:

```
1. Checkout code
2. Extract version  (id: version → outputs APP_VERSION)
3. Set up Node.js
4. Authenticate to Google Cloud
5. Set up Cloud SDK
6. Install project dependencies
7. Install Firebase CLI
8. Deploy via App Hosting  ← --git-branch main is hardcoded here
9. Deploy via Hosting + Functions  (if: apphosting deploy_command)
10. Tag deployed commit
11. Deployment summary
```

Phase 2 adds:
- New input `git_branch` (type: string, default: 'main') and `admin_callback_url` (type: string, default: 'https://admin.triarch.dev')
- Step 8 (`Deploy via App Hosting`) branches on `git_branch == 'main'` vs non-main
- Step 12: `Notify admin (dev)` added AFTER step 11, using `continue-on-error: true`

### Pattern 1: Admin Callback Step (inline curl)

**What:** A `continue-on-error: true` step after the deploy step that POSTs to admin with `Authorization: Bearer <token>` and writes a warning annotation on failure.

**When to use:** After any FAH rollout step that represents a completed deploy action (dev or prod).

**Example (dev callback):**
```yaml
- name: Notify admin (dev deploy)
  continue-on-error: true
  env:
    ADMIN_API_TOKEN: ${{ secrets.ADMIN_API_TOKEN }}
    ADMIN_CALLBACK_URL: ${{ inputs.admin_callback_url }}
  run: |
    BRANCH="${{ inputs.git_branch || github.ref_name }}"
    # Construct previewUrl deterministically for non-main branches
    PREVIEW_URL=""
    if [ "$BRANCH" != "main" ]; then
      BACKEND="${{ inputs.app_hosting_backend }}"
      PROJECT="${{ inputs.firebase_project_id }}"
      SANITIZED=$(echo "$BRANCH" | tr '/' '-')
      PREVIEW_URL="https://${SANITIZED}--${BACKEND}.us-central1.hosted.app"
    fi
    PAYLOAD=$(printf '{"version":"%s","releaseType":"patch","env":"dev","commitSha":"%s","deployedAt":"%s","releasedBy":"%s","branch":"%s","previewUrl":"%s"}' \
      "${{ steps.version.outputs.APP_VERSION }}" \
      "${{ github.sha }}" \
      "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
      "${{ github.actor }}" \
      "$BRANCH" \
      "$PREVIEW_URL")
    HTTP_CODE=$(curl -sf --max-time 10 -o /dev/null -w "%{http_code}" \
      -X POST "${ADMIN_CALLBACK_URL}/api/platform/ingest/release-logs" \
      -H "Authorization: Bearer ${ADMIN_API_TOKEN}" \
      -H "Content-Type: application/json" \
      -d "$PAYLOAD" || echo "000")
    if [ "$HTTP_CODE" != "201" ]; then
      echo "::warning::Admin dev callback failed (HTTP $HTTP_CODE). Release row not created for $BRANCH v${{ steps.version.outputs.APP_VERSION }}."
    else
      echo "Admin callback succeeded (201). release_logs row created."
    fi
    echo "## Admin Callback" >> $GITHUB_STEP_SUMMARY
    echo "| Field | Value |" >> $GITHUB_STEP_SUMMARY
    echo "|-------|-------|" >> $GITHUB_STEP_SUMMARY
    echo "| Status | HTTP $HTTP_CODE |" >> $GITHUB_STEP_SUMMARY
    echo "| Branch | $BRANCH |" >> $GITHUB_STEP_SUMMARY
    echo "| Version | ${{ steps.version.outputs.APP_VERSION }} |" >> $GITHUB_STEP_SUMMARY
```

**Source:** Verified against `requireApiKey` in `src/lib/api-key-auth.ts` (Bearer token pattern) and `POST /api/platform/ingest/release-logs` accepted fields.

### Pattern 2: deploy-prod.yml Structure (new file)

**What:** A new reusable workflow that performs a prod Firebase deploy and calls the `/api/releases/promoted` callback. The truthtreason `deploy-prod.yml` serves as structural reference.

**When to use:** Called from consumer repos' prod deploy workflows as `uses: MyAlterLego/shared-workflows/.github/workflows/deploy-prod.yml@v2`.

```yaml
# Skeleton — planner fills out full steps
on:
  workflow_call:
    inputs:
      firebase_project_id: { required: true, type: string }
      app_hosting_backend: { type: string, default: '' }
      admin_callback_url: { type: string, default: 'https://admin.triarch.dev' }
    secrets:
      FIREBASE_SA_KEY: { required: true }
      ADMIN_API_TOKEN: { required: true }
```

After the Firebase deploy step, add the prod callback step:
```yaml
- name: Notify admin (prod deploy)
  continue-on-error: true
  env:
    ADMIN_API_TOKEN: ${{ secrets.ADMIN_API_TOKEN }}
    ADMIN_CALLBACK_URL: ${{ inputs.admin_callback_url }}
  run: |
    PAYLOAD=$(printf '{"version":"%s","commit_sha":"%s","deployed_at":"%s","deployed_by":"%s"}' \
      "${{ steps.version.outputs.APP_VERSION }}" \
      "${{ github.sha }}" \
      "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
      "${{ github.actor }}")
    HTTP_CODE=$(curl -sf --max-time 10 -o /dev/null -w "%{http_code}" \
      -X POST "${ADMIN_CALLBACK_URL}/api/releases/promoted" \
      -H "Authorization: Bearer ${ADMIN_API_TOKEN}" \
      -H "Content-Type: application/json" \
      -d "$PAYLOAD" || echo "000")
    if [ "$HTTP_CODE" != "201" ] && [ "$HTTP_CODE" != "200" ]; then
      echo "::warning::Admin prod callback failed (HTTP $HTTP_CODE). Release not marked promoted for v${{ steps.version.outputs.APP_VERSION }}."
    fi
```

**Source:** Verified against `POST /api/releases/promoted` in `src/app/api/releases/promoted/route.ts` — required fields are `version`, `commit_sha`, `deployed_at`, `deployed_by` (all snake_case).

### Pattern 3: git_branch Input and Non-Main Rollout

**What:** Conditional step execution based on whether `inputs.git_branch` is set and non-main.

**Example (replace hardcoded `--git-branch main` in step 8):**
```yaml
- name: Deploy via App Hosting (main branch)
  if: inputs.deploy_command == 'apphosting' && (inputs.git_branch == '' || inputs.git_branch == 'main')
  run: |
    BACKEND="${{ inputs.app_hosting_backend }}"
    [ -z "$BACKEND" ] && BACKEND="${{ inputs.firebase_project_id }}"
    firebase apphosting:rollouts:create "$BACKEND" \
      --git-branch main \
      --project ${{ inputs.firebase_project_id }} \
      --non-interactive 2>&1

- name: Deploy via App Hosting (branch preview)
  if: inputs.deploy_command == 'apphosting' && inputs.git_branch != '' && inputs.git_branch != 'main'
  run: |
    BACKEND="${{ inputs.app_hosting_backend }}"
    [ -z "$BACKEND" ] && BACKEND="${{ inputs.firebase_project_id }}"
    firebase apphosting:rollouts:create "$BACKEND" \
      --git-branch "${{ inputs.git_branch }}" \
      --project ${{ inputs.firebase_project_id }} \
      --non-interactive 2>&1
```

**Source:** Firebase CLI syntax verified via firebase.google.com/docs/app-hosting/rollouts. Current v1 workflow structure verified from live repo.

### Anti-Patterns to Avoid

- **Failing the workflow on callback error:** The deploy succeeded; the callback is fire-and-forget. Always `continue-on-error: true` on notification steps.
- **Calling admin BEFORE FAH rollout completes:** The admin row is created with `deployedAt` timestamped by the workflow — if the rollout fails after the callback fires, admin shows a deploy that didn't happen. Callback step must come AFTER the rollout step.
- **Hardcoding `admin.triarch.dev` in the workflow:** Use `inputs.admin_callback_url` with a default of `https://admin.triarch.dev` so consumer repos can override for staging/test environments.
- **Using `github.ref_name` as the branch in non-main rollouts:** When `git_branch` input is explicitly passed, use `inputs.git_branch`, not `github.ref_name` (which reflects the triggering commit, not the branch being rolled out).
- **Force-updating the `v1` tag:** Consumers pinned to `@v1` must not be affected. Tag `v2` on a new commit; never move `v1`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTTP POST in GitHub Actions | Custom action or node script | `curl` inline in `run:` step | curl is pre-installed on `ubuntu-latest`, no dependencies, one-liner |
| Branch name sanitization for URL | Complex regex step | `echo "$BRANCH" \| tr '/' '-'` | Only transformation is slash→dash; no other special chars expected in FAH branch names |
| API key auth on admin endpoints | New auth mechanism | Existing `requireApiKey` middleware (`src/lib/api-key-auth.ts`) | Already validates `Authorization: Bearer <token>` against `projects.apiKey` in CRDB |
| Version extraction | Per-project logic | Existing `steps.version` in `deploy-firebase.yml` | Already handles version.ts, version.js, package.json fallback chain |

**Key insight:** The admin endpoints are already production-hardened and support all required fields. The only work is in shared-workflows — the admin repo has zero code changes for this phase.

---

## CRITICAL: Firebase App Hosting URL Behavior (WORKFLOW-03)

**Finding (MEDIUM confidence — multiple official sources agree, no direct CLI output sample found):**

Firebase App Hosting's `apphosting:rollouts:create --git-branch <branch>` deploys the specified branch's latest commit to the **same backend URL** (`backend-id--project-id.region.hosted.app`). There is **no per-branch preview subdomain automatically created**.

The URL pattern `https://<branch>--<backend>.<region>.hosted.app` mentioned in CONTEXT.md and REQUIREMENTS.md does NOT correspond to an FAH-native feature. This pattern appears to have been assumed from the Firebase Hosting (legacy) preview channels feature, which is a separate product.

**What this means for implementation:**

The `previewUrl` field in the dev deploy payload is still valuable for Phase 5 RC tracking, but it should be understood as:
- For `main` branch: the live backend URL (`https://<backend>--<project>.us-central1.hosted.app`), or empty
- For non-main branches: the same live backend URL (the rollout has updated that URL to serve the branch), constructed deterministically as `https://<sanitized-branch>--<backend>.<region>.hosted.app`

The `<sanitized-branch>--<backend>` prefix format in the URL is the **backend name format** (not a per-branch subdomain). The correct format is `<backend>--<project>.region.hosted.app` where `backend` is the `app_hosting_backend` input and `project` is the firebase project ID.

**Revised deterministic URL construction for non-main branches:**

Since `--git-branch <branch>` deploys to the same URL as main, and the URL format is `<backend>--<project>.us-central1.hosted.app`, the `previewUrl` for a non-main deploy is the same URL as the main deploy — it just reflects the current live state of that backend after the non-main rollout completes.

**Recommendation for planner:** Store `previewUrl` = `https://<app_hosting_backend>--<firebase_project_id>.us-central1.hosted.app` in `metadata.previewUrl` for ALL branch deploys (main and non-main alike). The distinction in Phase 5 RC UI comes from the `branch` column, not from a different URL. This aligns with D-07 (separate release_logs row per branch deploy) while being honest about what FAH actually provides.

**Confidence:** MEDIUM. Official FAH docs confirm single URL per backend architecture. The per-branch URL pattern is not documented. If Mike knows from first-hand CLI usage that FAH creates per-branch URLs, this finding should be overridden.

---

## Current State of shared-workflows Repo

**Tag status (verified via GitHub API):** v1, v1.1, v1.2, v1.3, v1.4 — next tag will be `v2`

**Files that exist:**
- `.github/workflows/deploy-firebase.yml` — add git_branch input + admin callback
- `.github/workflows/notify.yml` — no changes needed for Phase 2
- `.github/workflows/quality-gate.yml` — no changes needed for Phase 2

**File that does NOT exist:**
- `.github/workflows/deploy-prod.yml` — **must be created from scratch**

**No open issues** in the shared-workflows repo related to Phase 2 work.

**Recent relevant commits (for context):**
- `35871945` — fix: surface apphosting:rollouts:create failures instead of masking (removed `|| echo "::warning::"` that swallowed failures)
- `31beeb96` — fix: FAH wait must never block Slack notification (continue-on-error pattern established)

The pattern of `continue-on-error: true` for "best-effort" side-effect steps is already established in `notify.yml`.

---

## Consumer Repos: v1 → v2 Ref Bump Scope

For Phase 2, only two repos bump from `@v1` to `@v2`:

1. **Admin** (`/Users/mikegeehan/claude/triarch/development/admin/.github/workflows/ci-cd.yml`)
   - Uses: `deploy-firebase.yml@v1`, `quality-gate.yml@v1`, `notify.yml@v1`
   - Must add: `ADMIN_API_TOKEN` Actions secret (valued with admin project's `projects.apiKey`)
   - Must add: `git_branch` input pass-through if the admin app wants branch previews

2. **Truth+Treason** (`/Users/mikegeehan/claude/triarch/development/truthtreason/.github/workflows/ci-cd.yml` and `deploy-prod.yml`)
   - `ci-cd.yml`: uses `quality-gate.yml@v1`, `notify.yml@v1` — does NOT use `deploy-firebase.yml` (uses inline local deploy)
   - `deploy-prod.yml`: uses `quality-gate.yml@v1`, `notify.yml@v1` — has its own inline prod deploy
   - For T+T to use the new `deploy-prod.yml` shared workflow, its inline deploy would need to be replaced with the shared workflow call (this is the Phase 8 pilot wiring)
   - **For Phase 2**: T+T's `ci-cd.yml` inline deploy could optionally add the admin callback inline, or T+T could be updated to use `deploy-firebase.yml@v2` as part of Phase 8

**Repos deferred (out of scope per D-11):** triarch-dev (www), tmi, darksouls-rpg, triarchsecurity-portal, triarchsecurity-admin (CRM)

**Note:** The admin repo's `ci-cd.yml` uses `deploy-firebase.yml@v1` to deploy the admin app itself. Bumping admin to `@v2` means the admin app's own deploys will trigger callbacks to... itself. The admin app must have an `ADMIN_API_TOKEN` secret set to its own `projects.apiKey`. This is self-referential but correct — admin is itself a managed project.

---

## Admin Endpoint Wire Contracts (Verified)

### POST /api/platform/ingest/release-logs

**Auth:** `Authorization: Bearer <projects.apiKey>` — verified in `src/lib/api-key-auth.ts`

**Required fields:** `version` (string), `releaseType` (string)

**Optional fields (all accepted):** `summary`, `entries`, `metadata`, `releasedBy`, `env` (defaults to `'dev'`), `commitSha`, `deployedAt` (ISO string), `branch` (defaults to `'main'`)

**Note on `previewUrl`:** NOT currently a top-level field. Must be sent inside `metadata: { "previewUrl": "..." }` until a new column is added or the route is updated to accept it at top level.

**Response:** `201` with inserted row JSON on success; `400` if version or releaseType missing; `401`/`403` on auth failure.

**Source:** `src/app/api/platform/ingest/release-logs/route.ts` (lines 1-65, read directly)

### POST /api/releases/promoted

**Auth:** Same `requireApiKey` — Bearer token

**Required fields (ALL four required):** `version` (string), `commit_sha` (string), `deployed_at` (ISO string), `deployed_by` (string)

**Behavior:** Looks up dev row by `(project, version, env='dev')`; returns 404 if not found. Idempotency: if prod row already exists for `(project, version, env='prod')`, returns 200 with existing row. Otherwise: atomic INSERT prod row + UPDATE dev row status to `'promoted'`.

**Response:** `201` on new promotion, `200` on idempotent repeat, `404` if no matching dev row, `400` if missing fields.

**Source:** `src/app/api/releases/promoted/route.ts` (lines 1-107, read directly)

### requireApiKey middleware

**Source:** `src/lib/api-key-auth.ts` — reads `Authorization: Bearer <token>`, strips prefix, queries `projects` table by `apiKey` column.

Returns `{ error: null, project }` on success, `{ error: NextResponse(401), project: null }` if no header, `{ error: NextResponse(403), project: null }` if key not found.

---

## previewUrl Storage Decision (Claude's Discretion — Recommendation)

**Decision: Store in `metadata` JSONB, NOT a new column.**

Reasoning:
1. Phase 5 RC UI queries releases grouped by `branch` column (already exists). `previewUrl` is displayed per row but not filtered or indexed on.
2. Adding a `previewUrl` column requires migration 0012, a `db:push` human action, and a route update — all avoidable.
3. `metadata` JSONB is already accepted by the ingest route and defaults to `{}`. Storing `{ "previewUrl": "https://..." }` requires zero admin code changes.
4. The ingest route already passes `metadata: metadata ?? {}` to the DB insert — the workflow just needs to include it in the payload.

**Revised dev payload for non-main branches:**
```json
{
  "version": "0.15.0",
  "releaseType": "patch",
  "env": "dev",
  "commitSha": "abc123",
  "deployedAt": "2026-05-04T20:00:00Z",
  "releasedBy": "github-actions[bot]",
  "branch": "feat/change-font",
  "metadata": { "previewUrl": "https://triarch-dev--triarch-dev-truthtreason.us-central1.hosted.app" }
}
```

For main branch deploys: `"metadata": {}` or omit `previewUrl` key.

---

## Common Pitfalls

### Pitfall 1: Callback Fires Before Rollout Completes

**What goes wrong:** Admin records `env=dev` with `deployedAt=now`, but the FAH rollout fails 30 seconds later. Admin shows a "deployed" release that never went live.

**Why it happens:** The callback step is placed before or concurrent with the Firebase rollout step.

**How to avoid:** The "Notify admin (dev)" step MUST be added AFTER the `Deploy via App Hosting` step. GitHub Actions steps run sequentially in a job — `needs` is not required within a single job, just correct step ordering.

**Warning signs:** Admin shows a release row but the FAH rollout step in GitHub Actions shows as failed.

### Pitfall 2: ADMIN_API_TOKEN Not Set → Silent 401

**What goes wrong:** Callback step fires with an empty `ADMIN_API_TOKEN`. Admin returns 401. The `continue-on-error: true` masks it. No row is created. No error surfaced.

**Why it happens:** `secrets.ADMIN_API_TOKEN` is not set on the consuming repo. The secret evaluates to empty string silently in GitHub Actions (secrets never fail — missing secrets are empty strings).

**How to avoid:** Add an explicit guard at the top of the callback step:
```bash
if [ -z "$ADMIN_API_TOKEN" ]; then
  echo "::warning::ADMIN_API_TOKEN not set — admin callback skipped. Set this secret to enable release tracking."
  exit 0
fi
```

**Warning signs:** Callback step "succeeds" (green) but no release row appears in admin.

### Pitfall 3: Snake_case vs camelCase Payload Mismatch

**What goes wrong:** Dev callback uses `commit_sha` (snake_case) but the ingest route expects `commitSha` (camelCase). Or the prod callback uses `commitSha` but `/api/releases/promoted` requires `commit_sha`.

**Why it happens:** The two endpoints have different case conventions (per the v1.14 decision documented in STATE.md: "YAML field case distinction: ci-cd.yml camelCase / deploy-prod.yml snake_case").

**How to avoid:** Dev callback (`/api/platform/ingest/release-logs`) uses camelCase: `commitSha`, `deployedAt`, `releasedBy`. Prod callback (`/api/releases/promoted`) uses snake_case: `commit_sha`, `deployed_at`, `deployed_by`. Verified directly from route source files.

**Warning signs:** Admin returns `400` with `Missing required field(s): ...` in response body.

### Pitfall 4: Version Extraction Step ID Reference in New Workflow

**What goes wrong:** The new `deploy-prod.yml` workflow doesn't have the `steps.version.outputs.APP_VERSION` step that `deploy-firebase.yml` provides. The prod callback has no version to send.

**Why it happens:** `deploy-prod.yml` is a new file built from scratch. The version extraction step must be explicitly included.

**How to avoid:** Copy the version extraction step from `deploy-firebase.yml` (id: `version`) verbatim into `deploy-prod.yml`. The step tries `version.ts`, then `version.js`, then `package.json` — same heuristic.

**Warning signs:** `steps.version.outputs.APP_VERSION` evaluates to empty string; admin callback receives `""` as version and may fail validation or create a junk row.

### Pitfall 5: Bumping v1 → v2 on a Broken v2 Tag

**What goes wrong:** v2 is tagged before validation. Consumer repos bump to `@v2`. The callback step has a bug. Every deploy starts producing 401s or malformed rows.

**Why it happens:** Tag is applied before end-to-end test of the notification flow.

**How to avoid:** Per D-10 sequencing in CONTEXT.md specifics:
1. Tag `v2` only after all 3 success criteria pass on a test branch
2. Bump admin first as canary
3. Bump CRM/T+T after admin is verified live for one deploy

---

## Code Examples

### Version Extraction Step (existing, verified from live deploy-firebase.yml@v1.4)

```yaml
# Source: MyAlterLego/shared-workflows/.github/workflows/deploy-firebase.yml (live @v1.4)
- name: Extract version
  id: version
  run: |
    if [ -f "src/lib/version.ts" ]; then
      VER=$(grep -oP "APP_VERSION\s*=\s*'[^']*'" src/lib/version.ts | grep -oP "'[^']*'" | tr -d "'")
    elif [ -f "public/js/version.js" ]; then
      VER=$(grep -oP "APP_VERSION\s*=\s*'[^']*'" public/js/version.js | grep -oP "'[^']*'" | tr -d "'")
    elif [ -f "package.json" ]; then
      VER=$(node -p "require('./package.json').version" 2>/dev/null)
    fi
    VER="${VER:-unknown}"
    echo "APP_VERSION=$VER" >> $GITHUB_OUTPUT
```

### Branch Name Sanitization (slash → dash)

```bash
# Source: verified against FAH URL pattern — slashes not valid in subdomains
SANITIZED=$(echo "$BRANCH" | tr '/' '-')
# feat/change-font → feat-change-font
# hotfix/fix-login → hotfix-fix-login
```

### requireApiKey Behavior (verified from source)

```typescript
// Source: src/lib/api-key-auth.ts (read directly)
// Header: Authorization: Bearer <token>
// Returns: { error: null, project } on success
// Returns: { error: NextResponse(401) } if no Authorization header
// Returns: { error: NextResponse(403) } if token not in projects.apiKey
```

### Prod Endpoint Idempotency Behavior (verified from source)

```typescript
// Source: src/app/api/releases/promoted/route.ts (read directly)
// If prod row already exists for (project, version, env='prod') → returns 200 (idempotent)
// If no dev row found for (project, version, env='dev') → returns 404
// Otherwise: atomic INSERT prod + UPDATE dev.status='promoted' → returns 201
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `|| echo "::warning::"` swallowing rollout failures | Direct exit code propagation | shared-workflows commit `35871945` | Rollout failures now fail the workflow — important for reliability of the deploy step Phase 2 adds a callback after |
| Slack credentials from CRDB `settings` table | `@myalterlego/secrets` vault (Phase 1 migration) | Phase 1 (v2.0) | `notify.yml` still reads from CRDB in v1.4; Phase 2 doesn't touch notify.yml; this is a future notify.yml update |
| Per-project hardcoded Firebase project ID | Parameterized via `firebase_project_id` input | v1.0 (original design) | Enables reuse across all Triarch projects |

**Deprecated/outdated patterns to avoid:**
- `ADMIN_API_TOKEN` from vault: Decision D-01 explicitly uses per-project Actions secrets, not vault. Do not add vault reads to shared-workflows for this token.
- Retrying failed callbacks: Decision D-04 says no retry. Admin's `recover-deploy` reconciliation handles drift.

---

## Open Questions

1. **FAH preview URL per-branch behavior**
   - What we know: Official FAH docs show `--git-branch` deploys to same backend URL. The CONTEXT.md assumed a per-branch subdomain exists.
   - What's unclear: Does FAH actually create a per-branch URL in some configurations? Is there a console setting that enables it? Mike may have used this feature directly.
   - Recommendation: Planner should note this as an assumption flag. If Mike confirms branch-per-URL behavior exists, the `previewUrl` construction logic changes (use the branch-specific subdomain). If not confirmed, use the `metadata`-stored deterministic backend URL approach described above.

2. **`apphosting:rollouts:create` CLI output format**
   - What we know: The command deploys and waits for FAH to enqueue (current v1 workflow runs it with `2>&1`). No stdout capture is done currently.
   - What's unclear: Does the Firebase CLI print a URL or rollout ID to stdout that can be parsed to confirm success or extract metadata?
   - Recommendation: The existing notify.yml's FAH wait logic (which uses `apphosting:rollouts:list` to poll state) shows the CLI doesn't reliably output JSON. Deterministic URL construction is safer than parsing CLI output.

3. **T+T pilot scope for Phase 2 vs Phase 8**
   - What we know: T+T's `ci-cd.yml` uses an inline deploy (not `deploy-firebase.yml` shared workflow), so bumping T+T to `@v2` for deploy-firebase.yml doesn't apply without refactoring the inline step.
   - What's unclear: Should Phase 2 refactor T+T's inline deploy to use `deploy-firebase.yml@v2`? Or is that Phase 8?
   - Recommendation: Phase 2 bumps admin as canary; T+T inline deploy migration is Phase 8 pilot work. Phase 2 plans should note T+T inline deploy needs the admin callback step added there as well (or migrate to shared workflow).

---

## Sources

### Primary (HIGH confidence)
- `MyAlterLego/shared-workflows/.github/workflows/deploy-firebase.yml` (fetched via `gh api`) — confirmed inputs, step structure, existing rollout command
- `src/app/api/platform/ingest/release-logs/route.ts` (read directly) — confirmed field names, types, defaults, auth, response codes
- `src/app/api/releases/promoted/route.ts` (read directly) — confirmed required fields, idempotency logic, transaction pattern, response codes
- `src/lib/api-key-auth.ts` (read directly) — confirmed Bearer token extraction and CRDB lookup
- `src/db/schema.ts` (read directly) — confirmed `releaseLogs` table columns, `branch` column exists, no `previewUrl` column

### Secondary (MEDIUM confidence)
- `firebase.google.com/docs/app-hosting/rollouts` — `--git-branch` syntax confirmed; URL behavior (single URL per backend) inferred from architecture description
- `firebase.blog/posts/2024/10/app-hosting-regions/` — confirmed URL format `BACKEND_ID--PROJECT_ID.REGION.hosted.app`
- `github.com/firebase/firebase-tools/pull/7687` — confirmed `--git-branch` option was added as "deploy to same backend from a different branch"
- GitHub Actions `workflow_call` reusable workflow pattern — verified against existing shared-workflows usage

### Tertiary (LOW confidence)
- Branch-specific preview subdomain behavior — NOT found in any official source. The pattern `https://<branch>--<backend>.<region>.hosted.app` appears to be an assumption, not a documented FAH feature.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all tools verified from live workflow files
- Architecture: HIGH — patterns derived from verified source code; endpoint contracts read directly
- Pitfalls: HIGH — two verified from source code inspection (snake_case contracts, version extraction); others from workflow structure analysis
- FAH URL behavior: MEDIUM — multiple official sources confirm single-URL-per-backend, but no direct confirmation of "no per-branch URL exists"

**Research date:** 2026-05-04
**Valid until:** 2026-06-04 (Firebase CLI behavior, shared-workflows tag state)
