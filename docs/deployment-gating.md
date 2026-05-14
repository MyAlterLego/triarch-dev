# Deployment Gating — How Triarch Ships to Prod

> **No bypass.** Per the 2026-05-14 directive: prod can never be a higher version than dev, and the exact version going to prod must have been deployed to dev first — regardless of how many corners anyone wants to cut. There is no `force`, `--skip`, or `workflow_dispatch` escape hatch.

## The five invariants

The reusable workflow [`shared-workflows/gate-prod-version.yml@v8`](https://github.com/triarchsecurity/shared-workflows/blob/main/.github/workflows/gate-prod-version.yml) enforces all of these before any prod deploy is allowed to proceed:

| ID | Rule | Failure mode |
|----|------|--------------|
| INV-1 | A dev release exists for the project | First-time projects: deploy to dev first |
| INV-2 | `target_version ≤ dev_version` | Can't promote a version dev hasn't seen |
| INV-3 | `target_version > prod_version` | No backward rolls via prod deploy (use a hotfix branch with bumped version) |
| INV-4 | `target_version == dev_version` | Exact-match: no skipping — the version dev saw is the version that ships |
| INV-5 | `dev_age ≥ 300s` | Let dev bake. Adjustable via `min_dev_age_seconds` input. |

## Where the gate gets its data

The gate calls `GET https://admin.triarch.dev/api/platform/projects/{key}/versions` with the per-project bearer token (`projects.apiKey`). The endpoint returns:

```json
{
  "project": "triarchsecurity-admin",
  "dev":  { "version": "v3.54.0", "deployed_at": "2026-05-14T00:18:13Z", "commit_sha": "...", "released_by": "...", "status": "dev" },
  "prod": { "version": "v3.36.1", "deployed_at": "2026-05-05T03:06:16Z", "commit_sha": "...", "released_by": "...", "status": "promoted" }
}
```

Either side can be `null` for projects with no release in that environment yet.

## Visibility

Staff can see the current gate state for every project at:

**[admin.triarch.dev/admin/modules/ci-cd](https://admin.triarch.dev/admin/modules/ci-cd)**

The page shows, per project: latest dev version, latest prod version, and what the gate would decide right now if dev were promoted. Verdicts:

- `gate would pass` — dev > prod, dev is old enough, ready to promote
- `first promotion ready` — never promoted to prod, dev is old enough
- `gate would block` — explains which invariants are failing
- `no dev release` — INV-1 fails; deploy to dev first

## How a consuming project wires it in

Every project's CI/CD workflow that deploys to prod must declare the gate as a `needs:` prerequisite:

```yaml
jobs:
  version:
    runs-on: ubuntu-latest
    outputs:
      version: ${{ steps.read.outputs.version }}
    steps:
      - uses: actions/checkout@v4
      - id: read
        run: echo "version=$(node -p \"require('./package.json').version\")" >> $GITHUB_OUTPUT

  gate:
    needs: version
    uses: triarchsecurity/shared-workflows/.github/workflows/gate-prod-version.yml@v8
    with:
      project_key: triarchsecurity-admin   # MUST match projects.key in admin DB
      target_version: ${{ needs.version.outputs.version }}
    secrets:
      ADMIN_API_TOKEN: ${{ secrets.ADMIN_API_TOKEN }}

  deploy:
    needs: gate     # ← cannot run unless gate passes
    uses: triarchsecurity/shared-workflows/.github/workflows/deploy-prod.yml@v8
    with:
      firebase_project_id: triarchsecurity-admin
      app_hosting_backend: admin
    secrets:
      FIREBASE_SA_KEY: ${{ secrets.PROD_FIREBASE_SA_KEY }}
      ADMIN_API_TOKEN: ${{ secrets.ADMIN_API_TOKEN }}
```

## How env tagging works (post-v8)

In `deploy-firebase.yml@v7` (and earlier), the admin notify payload hardcoded `"env":"dev"` — every deploy, regardless of target, was recorded as `env=dev`. This is why most projects' `latest_prod_at` was `null` despite serving live prod URLs.

**`@v8` fixes this**: pass `environment: prod` to the reusable workflow and the release record will be tagged `prod`. Default is still `prod` for backward compat with the old `app_hosting_backend` consumers, but projects with separate dev backends (admin, darksouls, etc.) need to explicitly distinguish:

```yaml
jobs:
  deploy-dev:
    if: github.ref == 'refs/heads/main'
    uses: triarchsecurity/shared-workflows/.github/workflows/deploy-firebase.yml@v8
    with:
      firebase_project_id: triarchsecurity-admin
      app_hosting_backend: admin       # prod backend (unused on dev path)
      dev_backend: admin-dev           # dev backend
      environment: dev                 # ← tag the release as dev
    secrets:
      FIREBASE_SA_KEY: ${{ secrets.DEV_FIREBASE_SA_KEY }}
      ADMIN_API_TOKEN: ${{ secrets.ADMIN_API_TOKEN }}

  deploy-prod:
    needs: gate
    if: startsWith(github.ref, 'refs/heads/release/') || startsWith(github.ref, 'refs/heads/hotfix/')
    uses: triarchsecurity/shared-workflows/.github/workflows/deploy-firebase.yml@v8
    with:
      firebase_project_id: triarchsecurity-admin
      app_hosting_backend: admin
      environment: prod                # ← tag the release as prod
    secrets:
      FIREBASE_SA_KEY: ${{ secrets.PROD_FIREBASE_SA_KEY }}
      ADMIN_API_TOKEN: ${{ secrets.ADMIN_API_TOKEN }}
```

## Rollout

This is being rolled out per project. Backfill audit at [admin.triarch.dev/admin/modules/ci-cd](https://admin.triarch.dev/admin/modules/ci-cd) shows current state.

Pinned version `@v8` ships once both shared-workflows PRs (the env-payload fix and the gate workflow) merge. Until then, consumer projects continue on their existing pins; nothing breaks.

## Audit trail

Every gate check (pass or fail) writes an audit-log row to `admin.triarch.dev`:

```
action: deploy_gate_check
tool:   shared-workflows/gate-prod-version
metadata: { project_key, target_version, dev_version, prod_version, verdict, run_id, actor }
```

Failed gates also surface as a `::error::` annotation on the workflow run, with all failing invariants listed.

## FAQ

**Q: I made a hotfix and pushed it straight to a hotfix/ branch. Why does the gate block me?**
A: Because dev never saw the hotfix. The hotfix path is: bump version on a hotfix branch → deploy to dev first → gate passes → deploy to prod. Cutting the hotfix straight to prod was specifically called out as the corner Mike asked not to be allowed.

**Q: How do I deploy a security patch right now?**
A: Bump the version, push the branch, let CI deploy to dev (~3-5 min), then the gate's `min_dev_age_seconds` clears (5 min), then prod deploy proceeds. ~10 minutes end-to-end. If true zero-downtime is needed, the bake time input can be lowered for that one run — but the version-monotonicity invariants stay.

**Q: Can I bypass the gate as admin?**
A: No. There is no admin override, no service-account override, no `[skip gate]` commit message magic. The gate is a `needs:` prerequisite on the deploy job — without a pass, the deploy job doesn't run.

**Q: What if the admin endpoint is down?**
A: The gate fails closed. No-info-no-prod. Once the endpoint recovers, re-run the failed workflow.
