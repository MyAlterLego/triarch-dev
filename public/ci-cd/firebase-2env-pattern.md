# Firebase App Hosting: 2-Environment CI/CD Pattern

**Status:** Production pattern — used by all Triarch internal projects (admin, www, portal, tmi, truthtreason, darksouls).
**Last updated:** 2026-05-11
**Companion docs:** [SMB-CICD-Framework.md](SMB-CICD-Framework.md), [deploy.md](deploy.md), [cicd-overview.html](cicd-overview.html)

## The Triarch default is **2 environments** (dev → prod)

Most SMBs ship with two environments. The promotion model is cloud-agnostic; this doc captures the Firebase App Hosting implementation specifically — backend provisioning, `apphosting.yaml` overlay loading, the `dev_backend` workflow input, and the **5-layer no-bypass enforcement model** that prevents prod deploys without a dev pass-through (updated 2026-05-14 — bypass token removed per directive: *"regardless of how many corners I want to cut myself"*).

**Staging is an optional, recommended middle state.** Add a third environment when team size, release-candidate discipline, or compliance scope justify the ceremony. See [SMB-CICD-Framework.md §3.1](SMB-CICD-Framework.md#31-promotion-model--2-env-default-3-env-optional) for when to upgrade. The migration is additive — create a third backend, add `apphosting.staging.yaml`, extend `env-select`. Nothing in this doc has to be undone.

If you're on AWS / GCP / Azure with OIDC and want the cloud-agnostic version of this pattern, follow the main framework. The implementation details (`apphosting.yaml`, FAH backends, Console "Environment Name" field) are Firebase-specific; the **enforcement model is universal**.

---

## What you'll have when you're done

- ✅ **Two Firebase App Hosting backends per app** — one tagged `dev`, one tagged `prod`, both in the same GCP project
- ✅ **Branch-gated deploys** — push to `dev` → dev backend, push to `main` → prod backend (no other branch can deploy)
- ✅ **GitHub Environment binding on `prod`** — slot for future reviewer rules + audit trail of who shipped what
- ✅ **Bypass prevention** — a hard CI gate that refuses to deploy to prod unless the commit has already been deployed to dev
- ✅ **Env-specific config overlays** — `apphosting.dev.yaml` auto-loads on the dev backend; production config stays in `apphosting.yaml`
- ✅ **Distinct env-specific secrets** — `DATABASE_URL_DEV` for dev, `DATABASE_URL` for prod (or whatever boundaries you draw)

---

## Architecture in one diagram

```
                    GitHub Repo
                    ───────────
                                   ┌─────────────┐
                              ┌────│  feature/*  │
                              │    └─────────────┘
                              │      PR (gates)
                              ▼
                  ┌────────────────────────┐
                  │      dev branch        │ ─push─┐
                  └────────────────────────┘       │
                              │ PR + merge          ▼
                              ▼              ┌──────────────────┐
                  ┌────────────────────────┐ │ CI: quality-gate │
                  │      main branch       │ │     deploy       │
                  └────────────────────────┘ └────────┬─────────┘
                              │                        │
                              │ env-select             │
                              │   ├── ref=dev  → environment=dev
                              │   └── ref=main → environment=prod
                              │                        │
              ┌───────────────┼────────────────────────┘
              │               │
   gate-prod (env=prod):      │ deploy (any env):
   ─ skipped for dev          │
   ─ binds to GitHub Env      │   firebase apphosting:rollouts:create $BACKEND
     "prod" — fires           │     ─ BACKEND = prod backend name (env=prod)
     reviewer/timer rules     │     ─ BACKEND = explicit dev_backend (env=dev)
     if configured            │
                              ▼
              ┌──────────────────────────────────┐
              │   Firebase App Hosting (GCP)     │
              │                                  │
              │   ┌──────────────┐ ┌───────────┐ │
              │   │  app-dev     │ │   app     │ │
              │   │  backend     │ │   backend │ │
              │   │  (dev env)   │ │   (prod)  │ │
              │   └──────────────┘ └───────────┘ │
              │       │                 │        │
              │       ▼                 ▼        │
              │  apphosting.dev.yaml   apphosting.yaml
              │  + apphosting.yaml     (only)
              │  (overlay)
              └──────────────────────────────────┘
```

---

## How environments are implemented (Firebase side)

For each app you deploy, provision **two App Hosting backends in the same Firebase project**:

| Backend role | Backend name | Environment Name (Console) | Branch wired (Console) | Config loaded |
|---|---|---|---|---|
| Production | `<app>` *or* `<app>-prod` | `prod` (or unset) | `main` | `apphosting.yaml` |
| Development | `<app>-dev` | `dev` ← **critical** | `dev` | `apphosting.yaml` + `apphosting.dev.yaml` overlay |

**The "Environment Name" Console field is what triggers the overlay**: when set to `dev`, FAH automatically loads `apphosting.dev.yaml` and merges it on top of `apphosting.yaml`. Reference: [Firebase docs — multiple environments](https://firebase.google.com/docs/app-hosting/multiple-environments).

### Naming convention warnings

The shared `deploy-firebase.yml@v7+` workflow expects either:

1. **Auto-suffix pattern** (preferred): prod backend named `<name>`, dev backend named `<name>-dev`. v4-compatible — no explicit `dev_backend` input needed.
2. **Explicit dev_backend** (when names diverge): pass `dev_backend: <actual_dev_backend_name>` to override the auto-suffix.

Real-world Triarch examples:

| App | Prod backend | Dev backend | Auto-suffix works? | Needs `dev_backend` input? |
|---|---|---|---|---|
| tmi | `tmi` | `tmi-dev` | ✅ Yes | No |
| truthtreason | `truthtreason` | `truthtreason-dev` | ✅ Yes | No |
| portal | `portal-prod` | `portal-dev` | ❌ No (auto would give `portal-prod-dev`) | Yes |
| darksouls | `darksouls-rpg` | `darksouls-dev` | ❌ No (auto would give `darksouls-rpg-dev`) | Yes |
| admin/www | `triarch-dev` | `admin-dev` | ❌ No (legacy naming) | Yes |

**Lesson learned**: if you're greenfielding a new app, name the backends `<app>` and `<app>-dev` so you don't need the override. If you've inherited non-standard names, just pass `dev_backend` explicitly.

---

## How the CI workflow calls them

The full pattern in your `<repo>/.github/workflows/ci-cd.yml`:

```yaml
name: My App CI/CD

on:
  push:
    branches: [main, dev, 'release/**', 'hotfix/**']
  pull_request:
    branches: [main, dev]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}

permissions:
  contents: write
  packages: read

jobs:
  # 1. Quality gates (build + test + scan)
  quality-gate:
    uses: triarchsecurity/shared-workflows/.github/workflows/quality-gate.yml@v7.1
    with:
      run_qa_tests: false
      run_pentest: false
      needs_server: false
    secrets: inherit

  # 2. Resolve branch → environment + backend name
  env-select:
    needs: quality-gate
    if: github.event_name == 'push' && (github.ref == 'refs/heads/main' || github.ref == 'refs/heads/dev')
    runs-on: ubuntu-latest
    outputs:
      environment: ${{ steps.pick.outputs.env }}
    steps:
      - id: pick
        run: |
          if [ "${{ github.ref }}" = "refs/heads/dev" ]; then
            echo "env=dev" >> $GITHUB_OUTPUT
          else
            echo "env=prod" >> $GITHUB_OUTPUT
          fi

  # 3. Verify the commit being deployed to prod has already been deployed
  #    to dev. The mechanical bypass-prevention layer. NO escape hatch.
  verify-dev-deployed:
    needs: env-select
    if: needs.env-select.outputs.environment == 'prod'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0   # full history needed for ancestor check
      - name: Assert HEAD is on origin/dev
        run: |
          git fetch origin dev
          if ! git merge-base --is-ancestor HEAD origin/dev; then
            echo "::error::Refusing to deploy to prod: $(git rev-parse HEAD) has not been deployed to dev yet."
            echo "::error::Merge this commit to dev first, verify it deploys cleanly, then promote to main."
            echo "::error::No bypass — every prod deploy passes through dev."
            exit 1
          fi
          echo "Verified: $(git rev-parse HEAD) is an ancestor of origin/dev — safe to promote to prod."

  # 4. Read target version (for the gate to compare against).
  version:
    needs: quality-gate
    runs-on: ubuntu-latest
    outputs:
      version: ${{ steps.read.outputs.version }}
    steps:
      - uses: actions/checkout@v4
      - id: read
        run: |
          VER=$(node -p "require('./package.json').version" 2>/dev/null || echo unknown)
          echo "version=${VER}" >> $GITHUB_OUTPUT

  # 5. Version-monotonicity gate (no bypass). Five invariants:
  #    INV-1 dev release exists
  #    INV-2 target_version <= dev_version
  #    INV-3 target_version > prod_version
  #    INV-4 target_version == dev_version (exact match)
  #    INV-5 dev_age >= 300s (bake time)
  gate-prod-version:
    needs: [env-select, version, verify-dev-deployed]
    if: needs.env-select.outputs.environment == 'prod'
    uses: triarchsecurity/shared-workflows/.github/workflows/gate-prod-version.yml@v8.1
    with:
      project_key: my-app                   # must match projects.key in admin.triarch.dev
      target_version: ${{ needs.version.outputs.version }}
    secrets:
      ADMIN_API_TOKEN: ${{ secrets.ADMIN_API_TOKEN }}

  # 6. GitHub Environment binding — branch policy + reviewer rules layer.
  gate-prod:
    needs: [env-select, verify-dev-deployed, gate-prod-version]
    if: needs.env-select.outputs.environment == 'prod'
    runs-on: ubuntu-latest
    environment: prod
    steps:
      - run: echo "Production deploy approved for my-app."

  # 7. Deploy — calls shared workflow with branch-resolved environment.
  # always() prefix REQUIRED: without it, GH Actions auto-skips deploy when
  # any needs dep is in skipped state (legitimate for dev pushes).
  deploy:
    needs: [quality-gate, env-select, verify-dev-deployed, gate-prod-version, gate-prod]
    if: |
      always() &&
      github.event_name == 'push' &&
      (github.ref == 'refs/heads/main' || github.ref == 'refs/heads/dev') &&
      needs.quality-gate.result == 'success' &&
      needs.env-select.result == 'success' &&
      (needs.verify-dev-deployed.result == 'success' || needs.verify-dev-deployed.result == 'skipped') &&
      (needs.gate-prod-version.result == 'success' || needs.gate-prod-version.result == 'skipped') &&
      (needs.gate-prod.result == 'success' || needs.gate-prod.result == 'skipped')
    uses: triarchsecurity/shared-workflows/.github/workflows/deploy-firebase.yml@v8
    with:
      firebase_project_id: my-gcp-project
      app_hosting_backend: my-app           # prod backend
      dev_backend: my-app-dev               # only needed if names break auto-suffix
      environment: ${{ needs.env-select.outputs.environment }}
      deploy_command: apphosting
    secrets: inherit

  # 6. Slack notify
  notify:
    needs: [quality-gate, deploy]
    if: always() && github.event_name == 'push' && (github.ref == 'refs/heads/main' || github.ref == 'refs/heads/dev')
    uses: triarchsecurity/shared-workflows/.github/workflows/notify.yml@v1
    with:
      status: ${{ needs.deploy.result }}
      project_name: My App
      app_url: https://my-app.example.com
      wait_for_fah: true
      app_hosting_backend: my-app
      firebase_project_id: my-gcp-project
    secrets: inherit
```

---

## How to prevent bypassing dev → straight to prod

There are **five layers of defense**, applied together. Each one is a separate enforcement mechanism — they compound. **No bypass token exists** — the prior `[hotfix-bypass-dev]` commit-message escape was removed 2026-05-14.

### Layer 1: Branch protection on `main` (required)

Configure on the repo: Settings → Branches → Add rule for `main`:

- ✅ **Require a pull request before merging** — no direct pushes to main
- ✅ **Require status checks to pass** — list `quality-gate`, `verify-dev-deployed`, `gate-prod-version` at minimum
- ✅ **Require branches to be up to date before merging** — forces rebase against latest main
- ✅ **Restrict deletions** — main can't be force-deleted

This stops `git push origin main` from working at all. Every change to main must come through a PR.

### Layer 2: PR base flow (process)

When opening a PR, the base branch should be **`dev`** (not `main`) for feature work. After the feature lands in dev and is verified, open a **second PR** with base `main`, head `dev` — this promotes the verified state of dev to prod.

Single-PR flow (base `main`, head feature) is caught by Layer 3.

### Layer 3: `verify-dev-deployed` job (CI hard gate)

This is the **mechanical block** built into the workflow above. Before the prod deploy job runs, the workflow checks:

```bash
git merge-base --is-ancestor HEAD origin/dev
```

If `HEAD` (the commit being deployed to prod) is **not** an ancestor of `origin/dev`, the job fails with a clear error. **No bypass token.** A commit can only reach prod if it has already been pushed to dev. The only way around this would be force-pushing dev to include the commit just-in-time — a deliberate end-run, not an accident, and visible in dev's reflog.

### Layer 4: GitHub Environment `prod` with branch policy

Configure: Settings → Environments → `prod` → Deployment branches and tags → **Selected branches and tags** → `main` only.

This adds **a defense-in-depth check at the GitHub layer**: even if all the workflow checks were bypassed, GitHub itself refuses to bind `environment: prod` to a job triggered by any branch except `main`. Backstop against `workflow_dispatch` runs targeting prod from arbitrary branches.

### Layer 5: Version-monotonicity gate (`gate-prod-version`)

Added 2026-05-14. Calls `triarchsecurity/shared-workflows/.github/workflows/gate-prod-version.yml@v8.1` which enforces five invariants by querying `admin.triarch.dev/api/platform/version-snapshot`:

| ID | Rule |
|----|------|
| INV-1 | A dev release exists for the project |
| INV-2 | `target_version ≤ dev_version` |
| INV-3 | `target_version > prod_version` (no rolling backward via prod deploy) |
| INV-4 | `target_version == dev_version` (exact match) |
| INV-5 | `dev_age ≥ 300s` (bake time before promotion) |

No bypass. No `force` input. No `[skip gate]` commit-message magic. The gate is a `needs:` prerequisite — without a pass, the deploy job doesn't run.

Visible at [admin.triarch.dev/admin/modules/ci-cd](https://admin.triarch.dev/admin/modules/ci-cd) — shows per-project current dev/prod versions and what verdict the gate would issue right now.

Per-project requirement: ADMIN_API_TOKEN secret (= projects.apiKey from admin DB) must be set on the repo.

### Layer 6 (optional): GitHub Environment reviewer rules

For multi-developer teams, add: `prod` → **Required reviewers** → list 1+ reviewers. This pauses the deploy at `gate-prod` for human approval before the rollout fires. For solo-dev orgs, this is theater — you'd be approving your own work — and the practical layers above are sufficient.

---

## Secrets and environment-specific config

Three different mechanisms to keep dev and prod separate:

### 1. Apphosting.yaml overlays

`apphosting.yaml` is the **production baseline**. It's loaded for every backend, every environment.

`apphosting.dev.yaml` is the **dev overlay**. FAH auto-loads it on top of `apphosting.yaml` when the backend's Console "Environment Name" field is set to `dev`.

Example pattern — only override what differs:

```yaml
# apphosting.yaml (prod baseline)
env:
  - variable: NEXTAUTH_URL
    value: https://my-app.com
  - variable: DATABASE_URL
    secret: DATABASE_URL
  - variable: GOOGLE_CLIENT_ID
    secret: GOOGLE_CLIENT_ID
```

```yaml
# apphosting.dev.yaml (dev overlay — merges over the above)
env:
  - variable: NEXTAUTH_URL
    value: https://dev.my-app.com
  - variable: DATABASE_URL
    secret: DATABASE_URL_DEV   # different secret on dev
```

When the dev backend boots, FAH effectively sees:
```yaml
env:
  - variable: NEXTAUTH_URL
    value: https://dev.my-app.com   # from dev overlay
  - variable: DATABASE_URL
    secret: DATABASE_URL_DEV         # from dev overlay
  - variable: GOOGLE_CLIENT_ID
    secret: GOOGLE_CLIENT_ID         # inherited from base
```

### 2. Separate secrets per environment

Reference distinct **Firebase Secret Manager** secrets in the overlay. Example: `DATABASE_URL` for prod, `DATABASE_URL_DEV` for dev. Both secrets live in the same GCP project; the dev FAH backend's service account is granted read access to the `_DEV` versions and the prod backend's service account to the prod versions.

Set them via:

```bash
firebase apphosting:secrets:set DATABASE_URL --project my-gcp-project
firebase apphosting:secrets:set DATABASE_URL_DEV --project my-gcp-project
```

Or via `gcloud secrets`. Both work.

### 3. GitHub Actions secrets

These are different from Firebase secrets. They're the secrets the CI workflow needs to actually run (e.g., `FIREBASE_SA_KEY` for the gcloud-auth step, `ADMIN_API_TOKEN` for the admin callback).

These do **not** vary by environment — the same CI process deploys to both backends, so it uses the same Actions secrets. Environment-specific values live in Firebase Secret Manager (above), bound at the FAH backend level.

---

## Prerequisites checklist

Before you adopt this pattern on a new app, confirm:

- [ ] **Two FAH backends exist** for the app: `firebase apphosting:backends:list --project <project-id>`
- [ ] **Each backend's "Environment Name" Console field is set correctly**:
  - dev backend → `dev`
  - prod backend → `prod` (or unset — defaults to prod)
- [ ] **Each backend is wired to its branch** in Console (Backend → Settings → Source):
  - dev backend → `dev` branch
  - prod backend → `main` branch
- [ ] **`apphosting.yaml` exists** in the repo root (prod baseline)
- [ ] **`apphosting.dev.yaml` exists** for any env-specific overrides
- [ ] **GitHub repo is added to the npm package's "Manage Actions access"** list for every internal package the repo consumes (e.g., `@triarchsecurity/shared-ui`)
- [ ] **GitHub Environments `dev` and `prod`** exist on the repo (Settings → Environments)
- [ ] **Branch protection on `main`** — require PR + status checks
- [ ] **`dev` branch exists** in the repo

Missing any of these → CI will fail in a specific predictable way. Use the diagnostic table below.

---

## Common failures and what they mean

| Symptom | Cause | Fix |
|---|---|---|
| `firebase apphosting:rollouts:create` 404 on `<backend>-dev` | Dev backend doesn't exist OR is named differently | Create the backend, OR pass explicit `dev_backend: <actual-name>` input |
| `npm error 401 Unauthorized` on `@triarchsecurity/...` | Consumer repo not in package's "Manage Actions access" list | Add the repo via package settings |
| `npm error 403 Permission installation not allowed` | Trying to use a GitHub App installation token | Use `secrets.GITHUB_TOKEN` instead — GitHub Packages npm registry doesn't honor cross-repo App tokens despite docs claiming otherwise |
| Dev backend deploys but uses prod config | "Environment Name" Console field is not set to `dev` on the dev backend | Set it. FAH only loads `apphosting.dev.yaml` when this field matches |
| `verify-dev-deployed` blocks a hotfix push to main | Hotfix commit isn't on `dev` branch yet | Merge the hotfix to dev first, then to main. There is no in-band bypass — commenting out the gate defeats the framework's entire purpose. |
| `verify-dev-deployed` fails immediately after a squash-merge of dev → main | The squash created a new SHA on main with no path back to dev's history (see §"Promotion merge method" below) | Use **merge-commit** for dev → main PRs (not squash). If you already squash-merged, recover by `git checkout dev && git merge origin/main --no-ff && git push origin dev` then re-run the failed prod workflow. |
| `gate-prod` job stays in "Waiting" forever | GitHub Environment `prod` has reviewer rule but no one to approve | Add a reviewer, or remove the rule if solo-dev |
| Push to main deploys to dev backend | Branch ref evaluation bug in `env-select` job | Check the `if` condition matches `refs/heads/main` exactly |

---

## Migration from a 1-environment setup

If you currently push to main and it deploys to whatever your single backend is (no dev/prod separation), here's the migration path:

1. **Provision the dev backend** in the same GCP project. Name it `<app>-dev` or `<your-dev-name>`. Set its Console "Environment Name" to `dev`.

2. **Create `apphosting.dev.yaml`** with the differences from prod. Start minimal — just the URL and any env-specific secrets.

3. **Set up dev secrets** in Secret Manager. Bind them in the overlay.

4. **Create a `dev` branch** in the repo, branched from current `main`.

5. **Wire backends to branches** in Console: dev backend → `dev` branch, prod backend → `main` branch.

6. **Update `ci-cd.yml`** with the pattern above. Bump shared-workflows ref to `@v7.1` or later.

7. **Create GitHub Environments `dev` and `prod`** (Settings → Environments). Set `prod`'s deployment-branches policy to `main` only.

8. **Add branch protection** on `main` (PR required).

9. **First test**: push a trivial change to `dev` branch. Should deploy to dev backend.

10. **Second test**: PR `dev` → `main`. Merge. Should deploy to prod backend.

11. **Bypass test**: try to push directly to main from a feature branch that isn't on dev. The `verify-dev-deployed` gate should refuse.

### Promotion merge method — why dev → main must be a merge-commit

The `verify-dev-deployed` gate asserts `git merge-base --is-ancestor HEAD origin/dev` on every prod deploy. That assertion is **SHA-level**, not tree-level. Which method GitHub uses to combine the dev → main PR determines whether the assertion can ever pass:

| Merge method | What it does to main's HEAD | `is-ancestor HEAD origin/dev`? |
|---|---|---|
| **Merge commit** | New commit on main with parents `[old_main_tip, dev_tip]`. `dev_tip` is reachable from main. | ✅ **Passes** — dev_tip is literally one of main HEAD's parents. |
| **Squash** | New commit on main with single parent `old_main_tip` and dev's tree squashed in. SHA never existed on dev. | ❌ **Fails** — squash commit is not reachable from origin/dev. |
| **Rebase-and-merge** | dev's commits replayed onto main as new SHAs. None of those SHAs exist on dev. | ❌ **Fails** — same reason. |

The framework defaults: **squash** for feature → dev (clean dev history), **merge-commit** for dev → main (preserves ancestry).

#### Repo config that enables this

`bootstrap.sh` sets both:
- `allow_squash_merge=true`
- `allow_merge_commit=true`

And the main rulesets in `.github/rulesets/` **do not** include `required_linear_history`. That rule forces squash/rebase only and is incompatible with the promotion model — older framework versions had it and produced exactly the failure mode above. Apply or upgrade the ruleset accordingly.

#### Recovery if a dev → main PR was squash-merged by mistake

The failed prod deploy can be unblocked without reverting:

```bash
git checkout dev
git pull origin dev
git merge origin/main --no-ff -m "merge main into dev (post-squash align — closes verify-dev-deployed gap)"
git push origin dev
# Then re-run the failed prod workflow:
gh run rerun <runId> --failed --repo <org>/<repo>
```

This adds a merge commit to dev whose parents include the new main HEAD, restoring the ancestry relationship.

### Bootstrap caveat — first deploy after adding `verify-dev-deployed`

If your repo is in a state where `main` is ahead of `dev` (common when you're retrofitting the gate onto an existing project), the **first push to main after the gate lands will fail** — the new main HEAD won't be on dev's history yet.

Two ways to bootstrap cleanly:

**Option A — sync dev to match main, then add the gate**:

```bash
# Before merging the gate PR:
git checkout dev
git reset --hard origin/main
git push --force-with-lease origin dev
# Now merge the PR that adds verify-dev-deployed.
# Future pushes flow feature → dev → main, satisfying the gate.
```

Option A is the only supported approach as of 2026-05-14 — there is no bypass token. Reset dev once during bootstrap so its first state matches main; from then on, every prod deploy flows through dev.

---

## §3.3 — Adding staging (optional upgrade to 3-env)

The 2-env pattern above is complete on its own. To upgrade to a 3-env model (dev → staging → prod), the migration is **additive** — no existing config is undone.

1. **Create a third FAH backend** named `<app>-staging` in the same GCP project (Console: Build → App Hosting → Create backend → repository = same as prod → branch = `staging` → finish). Set its **Environment Name** Console field to `staging` so it auto-loads `apphosting.staging.yaml`.

2. **Add `apphosting.staging.yaml`** to the repo root — overlay file with only what differs from prod:

    ```yaml
    env:
      - variable: NEXTAUTH_URL
        value: https://staging.<app>.example.com
      - variable: DATABASE_URL
        secret: DATABASE_URL_STAGING   # or share with prod if you accept the risk
    ```

3. **Create a `staging` branch** off `main` and push it. FAH Console wires `<app>-staging` to this branch.

4. **Extend `env-select` in `ci-cd.yml`** to recognize three paths:

    ```yaml
    env-select:
      ...
      steps:
        - id: pick
          run: |
            case "${{ github.ref }}" in
              refs/heads/dev)     echo "env=dev"     >> $GITHUB_OUTPUT ;;
              refs/heads/staging) echo "env=staging" >> $GITHUB_OUTPUT ;;
              refs/heads/main)    echo "env=prod"    >> $GITHUB_OUTPUT ;;
            esac
    ```

5. **Add a `verify-staging-deployed` job** on the prod path (the staging analog of `verify-dev-deployed`):

    ```yaml
    verify-staging-deployed:
      needs: env-select
      if: needs.env-select.outputs.environment == 'prod'
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
          with: { fetch-depth: 0 }
        - run: |
            git fetch origin staging
            if ! git merge-base --is-ancestor HEAD origin/staging; then
              echo "::error::Commit not on staging. Promote to staging first."
              exit 1
            fi
    ```

    `verify-dev-deployed` stays — both must pass. The prod path now requires: HEAD ∈ history(dev) AND HEAD ∈ history(staging). Promotion order is enforced as dev → staging → prod.

6. **Extend the shared `deploy-firebase.yml@v7.1` call** with a `staging_backend` input *or* (simpler) add a third deploy-target branch in `env-select`'s output and a sibling `staging_backend` input on the deploy job. Confirm shared-workflows version supports it before assuming — at @v7.1, the `staging_backend` input does not exist; you'll need to either fork the reusable workflow or use a per-repo inline deploy step for staging.

7. **Configure GitHub Environment `staging`** (Settings → Environments) — typically 1 reviewer, 5-min wait timer (or none on solo-dev), deployment-branches policy = `staging` only.

8. **Branch protection on `staging`** — same shape as `main`: required status checks including `verify-dev-deployed`, no direct pushes, PR-only.

PR flow becomes: `feature → PR base=dev → merge to dev` → `PR base=staging head=dev → merge to staging` → `PR base=main head=staging → merge to main`. Each promotion satisfies the corresponding ancestor check.

---

## See also

- [SMB-CICD-Framework.md](SMB-CICD-Framework.md) — the broader cloud-agnostic framework this Firebase implementation slots into
- [deploy.md](deploy.md) — Claude-Code-driven deployment runbook (Step 1: pre-requisites includes Firebase backend probe; R-F1 for end-to-end bootstrap)
- [cicd-overview.html](cicd-overview.html) — exec-level overview with diagrams
- [Firebase docs — multiple environments](https://firebase.google.com/docs/app-hosting/multiple-environments) — the authoritative source on the apphosting.yaml overlay mechanism
- [Triarch shared-workflows](https://github.com/triarchsecurity/shared-workflows) — the `@v7.1` reusable workflows referenced throughout
