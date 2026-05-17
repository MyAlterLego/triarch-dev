# Digital Ocean App Platform: 2-env Pattern (sibling of `firebase-2env-pattern.md`)

> **Companion doc.** The framework's contract (`dev-prod-customer-contract.md` CL-1..CL-6), bypass-prevention layers, and discovery+gap-analysis flow are unchanged. This doc covers only the DO-specific implementation of the deploy step.
>
> **Read this if:** your consumer's prod target is DigitalOcean App Platform (or DO Functions / DOKS with similar shape). The Firebase pattern still applies for FAH consumers.

---

## The Triarch default is **2 environments** (dev → prod)

Same defaults as the Firebase pattern. Staging is optional. The dev → prod gate chain (verify-dev-deployed + cl4-gate + CL-6 verdict round-trip) is identical — only the deploy step is DO-specific.

---

## What you'll have when you're done

- Two DigitalOcean App Platform apps per project:
  - `<project>` — prod, deployed from `main` branch
  - `<project>-dev` — dev, deployed from `dev` branch
- DO domain mapping on each app (`<project>.<zone>` / `<project>-dev.<zone>`)
- Per-app environment variables + secrets via DO App Spec
- Either DO managed PostgreSQL or external CockroachDB (per-env URLs)
- Same 5-gate prod chain as Firebase: branch protection → PR base flow → verify-dev-deployed → cl4-gate (INV 1-5 + CL-6 verdict POST) → GitHub Environment binding
- Release_logs ingest to admin.triarch.dev fires as the last CI step (CL-6 round-trip)

---

## How environments are implemented (DO side)

DigitalOcean App Platform has a **two-app** model rather than Firebase's two-backend-one-project model:

| Concept | Firebase App Hosting | DigitalOcean App Platform |
|---------|----------------------|----------------------------|
| Project boundary | One Firebase project, two backends (`<app>`, `<app>-dev`) | Two separate apps (`<project>`, `<project>-dev`) |
| Config file | `apphosting.yaml` + `apphosting.dev.yaml` (FAH auto-overlays based on backend's Environment Name) | One app spec per app (typically `.do/app-prod.yaml` + `.do/app-dev.yaml`) |
| Custom domain | Firebase Console "Add custom domain" + DNS records (A/TXT/CNAME) | DO Console → App → Settings → Domains, OR app spec `domains:` block |
| Secret storage | GCP Secret Manager (referenced from yaml by secret name) | DO encrypted env vars (per-app, set in Console or via `doctl apps update`) |
| Deploy trigger | Push to FAH-configured branch (auto) OR `firebase apphosting:rollouts:create` | Push to App's `git.branch` (auto) OR `doctl apps create-deployment` |
| Logs | `firebase apphosting:fetchlogs` / FAH MCP / GCP Logs Explorer | `doctl apps logs <app-id>` / DO Console runtime logs |

### Naming convention warnings

- DO apps inside a region have name uniqueness — pick `<project>` + `<project>-dev` (or `<project>-prod` + `<project>-dev` if you prefer symmetry)
- DO domain names don't need a special prefix; the CL-1 `<project>-dev.<zone>` convention is just DNS — pointed at the dev app's default ingress
- DO App Platform's default URL pattern is `<app-name>-<random>.ondigitalocean.app` — set up a custom domain so customers don't hit the random subdomain

---

## How the CI workflow calls them

Your consumer's `.github/workflows/ci-cd.yml` calls a reusable workflow that wraps `doctl`. The framework canonical implementation lives in `shared-workflows/.github/workflows/deploy-do.yml` (sibling of `deploy-firebase.yml`).

Per-environment job pattern in the consumer's workflow:

```yaml
# Dev deploy — fires on push to dev branch
deploy-dev:
  needs: [quality-gate, version, env-select]
  if: |
    always() &&
    github.event_name == 'push' &&
    github.ref == 'refs/heads/dev' &&
    needs.quality-gate.result == 'success' &&
    needs.env-select.result == 'success'
  uses: <your-org>/shared-workflows/.github/workflows/deploy-do.yml@v8.2
  with:
    app_id: ${{ vars.DO_APP_ID_DEV }}      # set as repo var, NOT secret
    app_url: https://<project>-dev.<zone>
    environment: dev
    git_branch: ${{ github.ref_name }}
    git_sha: ${{ github.sha }}
  secrets:
    DIGITALOCEAN_ACCESS_TOKEN: ${{ secrets.DIGITALOCEAN_ACCESS_TOKEN }}
    ADMIN_API_TOKEN: ${{ secrets.ADMIN_API_TOKEN }}

# Prod deploy — fires after cl4-gate + verify-dev-deployed
deploy-prod:
  needs: [quality-gate, version, env-select, verify-dev-deployed, cl4-gate]
  if: |
    always() &&
    github.event_name == 'push' &&
    github.ref == 'refs/heads/main' &&
    needs.quality-gate.result == 'success' &&
    needs.env-select.result == 'success' &&
    (needs.verify-dev-deployed.result == 'success' || needs.verify-dev-deployed.result == 'skipped') &&
    (needs.cl4-gate.result == 'success' || needs.cl4-gate.result == 'skipped')
  uses: <your-org>/shared-workflows/.github/workflows/deploy-do.yml@v8.2
  with:
    app_id: ${{ vars.DO_APP_ID_PROD }}
    app_url: https://<project>.<zone>
    environment: prod
    git_branch: ${{ github.ref_name }}
    git_sha: ${{ github.sha }}
  secrets:
    DIGITALOCEAN_ACCESS_TOKEN: ${{ secrets.DIGITALOCEAN_ACCESS_TOKEN }}
    ADMIN_API_TOKEN: ${{ secrets.ADMIN_API_TOKEN }}
```

The reusable `deploy-do.yml`'s responsibilities:
1. `doctl auth init` with the access token (OR `digitalocean/action-doctl@v2`)
2. `doctl apps create-deployment <app_id> --force-rebuild --wait` to push the new revision
3. Poll DO App Platform for rollout state until ACTIVE or fail after timeout (~5 min default)
4. **POST to admin's `/api/platform/ingest/release-logs`** with `{version, env, commitSha, branch, releaseType, deployedAt}` — this is the CL-6 round-trip closer

> **Why the CI does the release_logs ingest, not the container:** On Firebase the container has a boot-time hook that calls admin. On DO App Platform, the runtime container doesn't reliably know admin's apiKey at boot (secrets are env-bound but the boot sequence isn't well-suited for one-shot HTTP calls). Moving the ingest into the CI step gives the same enforcement guarantee with simpler container code.

### Authentication: OIDC if available, token otherwise

DigitalOcean added OIDC trust for GitHub Actions in late 2024. **Strongly recommended** — same pattern as the framework's AWS/GCP OIDC story:

- One-time setup in DO Cloud → API → OAuth → trust GitHub's OIDC issuer
- Per-repo configuration: `id-token: write` permission in the workflow
- `digitalocean/action-doctl@v2` exchanges the GH OIDC token for a short-lived DO API token

Fallback: long-lived `DIGITALOCEAN_ACCESS_TOKEN` as a GitHub repo secret. Works but doesn't match the framework's "zero long-lived keys" principle. Use OIDC if your team can wire it.

---

## How to prevent bypassing dev → straight to prod

Same five layers as the Firebase pattern. NO DO-specific deviation here. The verify-dev-deployed and cl4-gate jobs are pure GitHub Actions; DO is just the deploy target.

The ONLY DO-specific bypass risk is the **DO Console "Force Rebuild & Deploy" button**, which lets a logged-in DO admin trigger a deploy outside of GitHub Actions. Mitigation:

- Lock app spec changes to git-driven only (DO App Platform supports this via "Manual Deployments Only: OFF" + git connection — the spec on the connected branch is the source of truth)
- Limit DO Console access (RBAC, audit log) to the same set of humans who can push to main
- The deploy still fires, but won't ingest release_logs to admin (no CI runs), so the compliance matrix flags the project red and a customer-visible release page lane stays stale — operational signal that someone deployed out-of-band

---

## Secrets and environment-specific config

### 1. App spec files (replaces `apphosting.{dev,}yaml`)

Two committed files per project:

```yaml
# .do/app-prod.yaml — prod app spec
name: customer-app
region: nyc
services:
  - name: web
    git:
      repo_clone_url: https://github.com/<org>/<repo>.git
      branch: main
    build_command: npm run build
    run_command: npm start
    instance_count: 1
    instance_size_slug: basic-xs
    http_port: 3000
    envs:
      # NEXT_PUBLIC_ENV absent or = "prod" — EnvBadge renders nothing in prod chrome
      - { key: DATABASE_URL, scope: RUN_TIME, type: SECRET, value: ${customer-app-prod-db.DATABASE_URL} }
      - { key: NEXTAUTH_SECRET, scope: RUN_TIME, type: SECRET }
      - { key: ADMIN_API_TOKEN, scope: RUN_TIME, type: SECRET }
      - { key: NEXT_PUBLIC_APP_URL, scope: BUILD_TIME, value: https://customer-app.example.com }
databases:
  - name: customer-app-prod-db
    engine: PG
    production: true
domains:
  - domain: customer-app.example.com
    type: PRIMARY
```

```yaml
# .do/app-dev.yaml — dev app spec
name: customer-app-dev
region: nyc
services:
  - name: web
    git:
      repo_clone_url: https://github.com/<org>/<repo>.git
      branch: dev
    build_command: npm run build
    run_command: npm start
    instance_count: 1
    instance_size_slug: basic-xxs   # smaller = cheaper for dev
    http_port: 3000
    envs:
      - { key: NEXT_PUBLIC_ENV, scope: BUILD_AND_RUN_TIME, value: dev }    # ← EnvBadge renders DEV pill
      - { key: DATABASE_URL, scope: RUN_TIME, type: SECRET, value: ${customer-app-dev-db.DATABASE_URL} }
      - { key: NEXTAUTH_SECRET, scope: RUN_TIME, type: SECRET }
      - { key: ADMIN_API_TOKEN, scope: RUN_TIME, type: SECRET }
      - { key: NEXT_PUBLIC_APP_URL, scope: BUILD_TIME, value: https://customer-app-dev.example.com }
databases:
  - name: customer-app-dev-db
    engine: PG
    production: false
domains:
  - domain: customer-app-dev.example.com
    type: PRIMARY
```

> **CL-2 (EnvBadge):** `NEXT_PUBLIC_ENV=dev` must be in `BUILD_AND_RUN_TIME` scope so Next.js bakes it into the client bundle at build. Absent in prod = badge renders null = no visual chrome in prod.
>
> **CL-3 (database namespace):** the two app specs reference different DO managed PG databases (`customer-app-prod-db` and `customer-app-dev-db`). Same cluster is OK; same database name is forbidden. If you use an external CockroachDB cluster, point the two `DATABASE_URL` secrets at different database names within the cluster.

### 2. Separate secrets per environment

DO secrets are scoped to the App. There's no shared org-level secret manager (unlike GCP Secret Manager + IAM). Set each secret per-app:

```bash
# Set DATABASE_URL on prod app
doctl apps update <prod-app-id> --spec .do/app-prod.yaml

# DO will prompt for the actual secret value during the first deploy
# OR set explicitly via:
doctl apps update <prod-app-id> --env-vars '[{"key":"NEXTAUTH_SECRET","value":"...","type":"SECRET","scope":"RUN_TIME"}]'
```

> Discovery check: in admin compliance scan, parse each app spec's `envs[].value` for SECRET-typed entries and assert prod's secrets don't appear in the dev app (or vice versa). Same intent as the Firebase scan that compares `apphosting.yaml` vs `apphosting.dev.yaml`.

### 3. GitHub Actions secrets

| Secret | Used by | Notes |
|--------|---------|-------|
| `DIGITALOCEAN_ACCESS_TOKEN` | deploy-do.yml | scope: read+write on Apps. Prefer OIDC if available. |
| `ADMIN_API_TOKEN` | cl4-gate@v8.2 + deploy-do.yml's release_logs ingest | Same value the framework uses — project's apiKey from admin's CRDB. |

| Var | Used by | Notes |
|-----|---------|-------|
| `DO_APP_ID_DEV` | deploy-do.yml dev path | UUID of the dev app (visible in DO Console URL or `doctl apps list`) |
| `DO_APP_ID_PROD` | deploy-do.yml prod path | UUID of the prod app |

Use **repo variables** for the app IDs (visible to teammates) and **secrets** for tokens.

---

## Prerequisites checklist

Before adopting CL-1..CL-6 with DO:

- [ ] DO account with App Platform enabled
- [ ] OIDC trust configured (optional but recommended) OR a long-lived API token created with App Platform read+write scope
- [ ] Two App Platform apps created (`<project>` + `<project>-dev`), each pointing at a different git branch
- [ ] Two managed databases (or two databases within a shared external cluster) — one per env
- [ ] Custom domains mapped on both apps and DNS records added to your DNS provider
- [ ] `ADMIN_API_TOKEN` set in repo secrets (apiKey from admin's CRDB projects table)
- [ ] `DO_APP_ID_DEV` + `DO_APP_ID_PROD` set as repo variables
- [ ] `.do/app-prod.yaml` + `.do/app-dev.yaml` committed
- [ ] `.github/workflows/ci-cd.yml` includes the deploy-do.yml job blocks above
- [ ] Branch protection on `main`: require PR + status checks (verify-dev-deployed + cl4-gate)
- [ ] dev-protection ruleset preventing `dev` branch deletion (same as Firebase pattern, GitHub-side)

---

## Common failures and what they mean

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| deploy-do.yml step "No app with ID <X> found" | The `DO_APP_ID_*` repo var is wrong (typo, stale) | Run `doctl apps list` to find the right UUIDs and update the repo vars |
| cl4-gate fails INV-2 ("target > dev") | dev hasn't deployed this version yet | Push to dev first; wait for dev deploy to complete; retry prod CI |
| release_logs ingest 409 with `reject_no_pair` | Either cl4-gate didn't fire, or the version strings don't normalize (admin-side bug, fixed v2.13.20) | Check the workflow has `cl4-gate` in the prod deploy job's `needs:` list. Confirm admin version ≥ v2.13.20 |
| EnvBadge missing on dev URL | `NEXT_PUBLIC_ENV` not set in dev app spec OR wrong scope | Check `.do/app-dev.yaml`: must have `NEXT_PUBLIC_ENV=dev` in `BUILD_AND_RUN_TIME` scope |
| Custom domain stays "Pending" in DO Console | DNS records not yet propagated | Check with `dig +short <domain>` — DO needs the A record + verification CNAME |
| `verify-dev-deployed` fails on every prod merge | dev → main was squash-merged (dev's tip no longer ancestor of main HEAD) | Merge using "Create a merge commit" not squash; or push main HEAD back to dev to restore ancestry |

---

## Migration from a 1-environment setup

If the consumer currently has a single DO app deploying from `main`:

1. **Create dev app** (`<project>-dev`) via DO Console: same git repo, branch `dev`, smaller instance size
2. **Create dev database** (`<project>-dev-db`) — managed PG with the same schema (you can `pg_dump` schema from prod and `psql` apply)
3. **Add `dev` branch** to the repo: `git checkout main && git checkout -b dev && git push origin dev`
4. **Add `.do/app-dev.yaml`** to the repo, committed
5. **Add deploy-do.yml job blocks** (deploy-dev + deploy-prod) to `.github/workflows/ci-cd.yml`
6. **Bump shared-workflows reference** to the version that includes `deploy-do.yml@v8.2+` (or wherever the framework canonical lives)
7. **Add the bypass-prevention layers**: branch protection on main, dev-protection ruleset, `verify-dev-deployed` job, `cl4-gate` job
8. **Register with admin**: insert row in admin's `projects` table with project key + apiKey + deployed_url + firebase_project_id (use DO app ID as the project_id-equivalent)
9. **Set `ADMIN_API_TOKEN`** in repo secrets with the apiKey value
10. **First feature → dev → main flow:** open feature branch, PR vs dev, merge, watch dev deploy, then PR dev → main with merge commit, watch cl4-gate fire + prod deploy succeed

Total wallclock for migration: ~2-4 hours, mostly waiting for DO domain provisioning and DNS propagation.

---

## Comparison footnote

The framework treats Firebase App Hosting and DO App Platform as interchangeable from the contract's perspective. A multi-cloud Triarch deployment is supportable: platform itself on FAH (admin.triarch.dev), a customer's apps on DO, and a hypothetical third on AWS Elastic Beanstalk would all use the same CL-1..CL-6 contract + cl4-gate workflow. The pattern doc per cloud documents only the deploy step + secrets layer.

---

## Appendix A — Reference `deploy-do.yml` reusable workflow

Drop into your `shared-workflows` repo as `.github/workflows/deploy-do.yml` and tag (e.g. `@v1.0`). Then consumers reference it as `uses: <your-org>/shared-workflows/.github/workflows/deploy-do.yml@v1.0`. The framework's canonical version will live alongside `deploy-firebase.yml` once a consumer adopts DO.

```yaml
name: Deploy to DigitalOcean App Platform

on:
  workflow_call:
    inputs:
      app_id:
        description: 'DigitalOcean App Platform app UUID (from `doctl apps list`).'
        required: true
        type: string
      app_url:
        description: 'Public-facing URL of the deployed app (used for the post-deploy reachability probe and CL-6 ingest).'
        required: true
        type: string
      environment:
        description: 'dev or prod. Drives the GitHub Environment binding and the release_logs payload.'
        required: true
        type: string
      git_branch:
        description: 'Branch the CI was triggered from (informational — DO already knows from the app spec).'
        required: false
        type: string
        default: ''
      git_sha:
        description: 'Commit SHA being deployed. Used for the release_logs payload.'
        required: false
        type: string
        default: ${{ github.sha }}
      admin_callback_url:
        description: 'Base URL for admin control plane. Override for staging/test.'
        required: false
        type: string
        default: 'https://admin.triarch.dev'
      rollout_timeout_seconds:
        description: 'Max seconds to wait for the DO rollout to reach ACTIVE.'
        required: false
        type: number
        default: 600
    secrets:
      DIGITALOCEAN_ACCESS_TOKEN:
        description: 'DO API token with read+write on Apps. Prefer OIDC (id-token: write at the consumer) over a long-lived token.'
        required: false
      ADMIN_API_TOKEN:
        description: 'Per-project Bearer token for admin callback (valued with projects.apiKey from admin CRDB).'
        required: true
    outputs:
      version:
        description: 'App version (from package.json) at the deployed SHA.'
        value: ${{ jobs.deploy.outputs.version }}
      deployment_id:
        description: 'DO deployment UUID.'
        value: ${{ jobs.deploy.outputs.deployment_id }}

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: ${{ inputs.environment }}  # binds to GitHub Environment for env-scoped secrets/approvals
    permissions:
      contents: read
      id-token: write   # required for OIDC trust with DO
    outputs:
      version: ${{ steps.extract.outputs.version }}
      deployment_id: ${{ steps.create.outputs.deployment_id }}
    steps:
      - uses: actions/checkout@v4

      - name: Extract package.json version
        id: extract
        run: |
          VER=$(node -p "require('./package.json').version")
          if [ -z "$VER" ]; then echo "::error::package.json version is empty"; exit 1; fi
          echo "version=$VER" >> $GITHUB_OUTPUT

      - name: Install doctl (with OIDC if available, fallback to token)
        uses: digitalocean/action-doctl@v2
        with:
          # action-doctl v2 will use OIDC when `id-token: write` is granted AND
          # the DO side trusts the GH OIDC issuer. Falls back to the token if not.
          token: ${{ secrets.DIGITALOCEAN_ACCESS_TOKEN }}

      - name: Sanity check — app exists
        run: |
          doctl apps get ${{ inputs.app_id }} --format Spec.Name,LiveURL,DefaultIngress \
            || { echo "::error::App ${{ inputs.app_id }} not found"; exit 1; }

      - name: Create deployment
        id: create
        run: |
          OUT=$(doctl apps create-deployment ${{ inputs.app_id }} --force-rebuild --format ID --no-header --wait=false)
          if [ -z "$OUT" ]; then echo "::error::create-deployment returned empty deployment id"; exit 1; fi
          echo "deployment_id=$OUT" >> $GITHUB_OUTPUT
          echo "Created DO deployment: $OUT"

      - name: Poll deployment until ACTIVE
        run: |
          DEP_ID="${{ steps.create.outputs.deployment_id }}"
          DEADLINE=$(( $(date +%s) + ${{ inputs.rollout_timeout_seconds }} ))
          while [ $(date +%s) -lt $DEADLINE ]; do
            PHASE=$(doctl apps get-deployment ${{ inputs.app_id }} $DEP_ID --format Phase --no-header)
            echo "phase=$PHASE"
            case "$PHASE" in
              ACTIVE) echo "Deployment ACTIVE"; exit 0 ;;
              ERROR|CANCELED|FAILED) echo "::error::Deployment $PHASE"; exit 1 ;;
            esac
            sleep 10
          done
          echo "::error::Timed out waiting for ACTIVE (${{ inputs.rollout_timeout_seconds }}s)"
          exit 1

      - name: Reachability probe
        run: |
          for i in 1 2 3 4 5; do
            if curl -sf -o /dev/null -w "%{http_code}" "${{ inputs.app_url }}" | grep -qE "^(200|301|302|307|308)$"; then
              echo "URL reachable"
              exit 0
            fi
            sleep 6
          done
          echo "::warning::URL ${{ inputs.app_url }} did not return a 2xx/3xx after 30s — continuing (cold start possible)"

      - name: Ingest release_logs to admin (closes CL-6 loop)
        env:
          ADMIN_API_TOKEN: ${{ secrets.ADMIN_API_TOKEN }}
        run: |
          PAYLOAD=$(cat <<EOF
          {
            "version": "${{ steps.extract.outputs.version }}",
            "env": "${{ inputs.environment }}",
            "commitSha": "${{ inputs.git_sha }}",
            "branch": "${{ inputs.git_branch }}",
            "releaseType": "deploy",
            "deployedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
            "deployTarget": "digitalocean-app-platform",
            "deploymentId": "${{ steps.create.outputs.deployment_id }}",
            "appUrl": "${{ inputs.app_url }}"
          }
          EOF
          )
          HTTP=$(curl -sS -o /tmp/resp.json -w "%{http_code}" \
            -X POST "${{ inputs.admin_callback_url }}/api/platform/ingest/release-logs" \
            -H "Authorization: Bearer $ADMIN_API_TOKEN" \
            -H "Content-Type: application/json" \
            -d "$PAYLOAD")
          echo "admin response status=$HTTP"
          cat /tmp/resp.json
          # 409 reject_no_pair on PROD is fatal — means cl4-gate verdict never landed.
          # On DEV, 409 is unexpected but not fatal (dev has no verdict requirement).
          if [ "${{ inputs.environment }}" = "prod" ] && [ "$HTTP" = "409" ]; then
            echo "::error::Prod ingest rejected (no paired cl4-gate verdict). CL-6 enforcement triggered."
            exit 1
          fi
          if [ "$HTTP" -ge 500 ]; then
            echo "::warning::Admin returned $HTTP — release recorded out-of-band. Investigate but don't fail deploy."
          fi
```

> **Note on `--wait=false` + manual polling.** `doctl apps create-deployment --wait` returns when DO marks the deployment ACTIVE, but the exit code path is inconsistent across older `doctl` versions when the deployment errors mid-stream. Polling gives stable behavior and lets us emit per-iteration phase lines that are easy to read in GitHub Actions logs.

> **Why the ingest is the LAST step, not a separate job.** Same reason as the Firebase pattern: if the deploy succeeds but admin is down, we want a clear retry path. Keeping it in the same job means a manual rerun replays the whole deploy idempotently (DO will skip an already-ACTIVE deployment and just re-fire the curl).
