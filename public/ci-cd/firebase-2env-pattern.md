# Firebase App Hosting: 2-Environment CI/CD Pattern

**Status:** Production pattern — used by all Triarch internal projects (admin, www, portal, tmi, truthtreason, darksouls).
**Last updated:** 2026-05-11
**Companion docs:** [SMB-CICD-Framework.md](SMB-CICD-Framework.md), [deploy.md](deploy.md), [cicd-overview.html](cicd-overview.html)

The canonical SMB CI/CD framework targets AWS/OIDC with a 3-environment model (dev / staging / prod). This document captures the Firebase variant of that framework — adapted for teams running on **Firebase App Hosting** with a **2-environment** model (dev / prod) and a **single GCP project**.

If you're on AWS, ignore this doc and use the main framework. If you're on Firebase App Hosting and want production-ready CI/CD that prevents accidental prod deploys, this is the pattern.

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
  #    to dev. The mechanical bypass-prevention layer.
  verify-dev-deployed:
    needs: env-select
    if: needs.env-select.outputs.environment == 'prod'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0   # full history needed for ancestor check
      - name: Assert HEAD is on origin/dev (or carries hotfix-bypass token)
        run: |
          COMMIT_MSG=$(git log -1 --format=%B HEAD)
          if echo "$COMMIT_MSG" | grep -qF "[hotfix-bypass-dev]"; then
            echo "::warning::Bypassing dev-deployed check — commit message contains [hotfix-bypass-dev]."
            echo "::warning::This bypass is logged here and visible in git log forever. Use only for genuine hotfixes."
            echo "## ⚠️ Hotfix bypass used" >> "$GITHUB_STEP_SUMMARY"
            echo "" >> "$GITHUB_STEP_SUMMARY"
            echo "Commit \`$(git rev-parse HEAD)\` reached prod without passing through dev." >> "$GITHUB_STEP_SUMMARY"
            echo "Commit message contained \`[hotfix-bypass-dev]\` token. Reason should be in the commit body." >> "$GITHUB_STEP_SUMMARY"
            exit 0
          fi
          git fetch origin dev
          if ! git merge-base --is-ancestor HEAD origin/dev; then
            echo "::error::Refusing to deploy to prod: $(git rev-parse HEAD) has not been deployed to dev yet."
            echo "::error::Merge this commit to dev first, verify it deploys cleanly, then promote to main."
            echo "::error::For genuine hotfixes, add [hotfix-bypass-dev] to the commit message (deliberate, traceable bypass)."
            exit 1
          fi
          echo "Verified: $(git rev-parse HEAD) is an ancestor of origin/dev — safe to promote to prod."

  # 4. GitHub Environment gate — binds to "prod" Environment so reviewer
  #    rules, wait timers, and deployment-branch policies are enforced.
  gate-prod:
    needs: [env-select, verify-dev-deployed]
    if: needs.env-select.outputs.environment == 'prod'
    runs-on: ubuntu-latest
    environment: prod
    steps:
      - run: echo "Production deploy approved for my-app."

  # 5. Deploy — calls shared workflow with branch-resolved environment
  deploy:
    needs: [quality-gate, env-select, gate-prod]
    if: |
      github.event_name == 'push' &&
      (github.ref == 'refs/heads/main' || github.ref == 'refs/heads/dev') &&
      (needs.gate-prod.result == 'success' || needs.gate-prod.result == 'skipped')
    uses: triarchsecurity/shared-workflows/.github/workflows/deploy-firebase.yml@v7.1
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

There are **four layers of defense**, applied together. Each one is a separate enforcement mechanism — they compound.

### Layer 1: Branch protection on `main` (required)

Configure on the repo: Settings → Branches → Add rule for `main`:

- ✅ **Require a pull request before merging** — no direct pushes to main
- ✅ **Require status checks to pass** — list `quality-gate`, `verify-dev-deployed` at minimum
- ✅ **Require branches to be up to date before merging** — forces rebase against latest main
- ✅ **Restrict deletions** — main can't be force-deleted

This stops `git push origin main` from working at all. Every change to main must come through a PR.

### Layer 2: PR base flow (process)

When opening a PR, the base branch should be **`dev`** (not `main`) for feature work. After the feature lands in dev and is verified, open a **second PR** with base `main`, head `dev` — this promotes the verified state of dev to prod.

If you prefer a single-PR flow (base `main`, head feature), Layer 3 (below) catches the bypass.

### Layer 3: `verify-dev-deployed` job (CI hard gate)

This is the **mechanical block** built into the workflow above. Before the prod deploy job runs, the workflow checks:

```bash
git merge-base --is-ancestor HEAD origin/dev
```

If `HEAD` (the commit being deployed to prod) is **not** an ancestor of `origin/dev`, the job fails with a clear error. This means: a commit can only reach prod if it has already been pushed to dev. There is no way around this short of force-pushing dev to include the commit just-in-time — which would be a deliberate end-run, not an accident.

**Hotfix bypass token**: the gate honors `[hotfix-bypass-dev]` in the commit message. If present, the check is skipped and a warning is emitted to the run log + step summary. This is a deliberate, traceable bypass — the token lives forever in `git log`, so the audit trail is preserved. Use only for genuine emergencies (e.g., a customer-impacting security fix where adding a dev pass-through would extend the outage). For everything else, route through dev first.

```bash
# Example hotfix commit:
git commit -m "fix(auth): patch session-fixation CVE-2026-XXXX [hotfix-bypass-dev]

The fix removes the cookie-name reuse path identified in the vulnerability
report. Going through dev would add 30+ minutes to remediation and customers
are actively impacted."
```

After the hotfix lands on main, merge or cherry-pick the same commit to `dev` so future deploys aren't blocked by the divergence.

### Layer 4: GitHub Environment `prod` with branch policy

Configure: Settings → Environments → `prod` → Deployment branches and tags → **Selected branches and tags** → `main` only.

This adds **a defense-in-depth check at the GitHub layer**: even if all the workflow checks were bypassed, GitHub itself refuses to bind `environment: prod` to a job triggered by any branch except `main`. Useful as a backstop against `workflow_dispatch` triggered runs targeting prod from arbitrary branches.

### Layer 5 (optional): GitHub Environment reviewer rules

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
| `verify-dev-deployed` blocks a hotfix push to main | Hotfix commit isn't on `dev` branch yet | Merge the hotfix to dev first, then to main. OR (rare): temporarily comment out the gate, document in commit message |
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

**Option B — use the hotfix bypass token on the bootstrap commit**:

The PR that introduces `verify-dev-deployed` to the workflow has its merge commit on main. That commit can carry `[hotfix-bypass-dev]` in its message so the first post-merge push doesn't fail. Subsequent pushes go via dev as designed.

Option A is cleaner (no commits carry a bypass token). Option B is faster if you don't want to touch the dev branch.

---

## See also

- [SMB-CICD-Framework.md](SMB-CICD-Framework.md) — the broader AWS/OIDC-targeted framework this Firebase variant slots into
- [deploy.md](deploy.md) — Claude-Code-driven deployment runbook (Step 1: pre-requisites includes Firebase backend probe)
- [cicd-overview.html](cicd-overview.html) — exec-level overview with diagrams
- [Firebase docs — multiple environments](https://firebase.google.com/docs/app-hosting/multiple-environments) — the authoritative source on the apphosting.yaml overlay mechanism
- [Triarch shared-workflows](https://github.com/triarchsecurity/shared-workflows) — the `@v7.1` reusable workflows referenced throughout
