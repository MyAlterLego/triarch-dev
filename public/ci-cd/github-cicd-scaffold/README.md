# GitHub CI/CD scaffold — from-scratch setup

Drop this directory into a new GitHub repository, fill in three values, run `bootstrap.sh`, and you have a hardened, audit-ready CI/CD pipeline running with three protected environments, OIDC to your cloud, signed builds with SLSA provenance, baked-in SAST/SCA/secrets/IaC scanning, and Claude-Code-native local hooks.

This README is the single source of truth for what you need to provide and what gets created. Read sections **1–3** before running anything.

---

## Contents

```
github-cicd-scaffold/
├── README.md                          ← you are here
├── bootstrap.sh                       ← one-shot setup script (gh CLI)
├── Makefile                           ← convenience targets for day-2 ops
├── .github/
│   ├── CODEOWNERS
│   ├── dependabot.yml
│   ├── pull_request_template.md
│   ├── ISSUE_TEMPLATE/
│   │   └── security-waiver.md
│   ├── rulesets/
│   │   └── main-protection.json       ← applied via gh api
│   └── workflows/
│       ├── enforce-pr-source.yml      ← REQUIRED — fails PRs to main that aren't from dev/release-*/hotfix-*; status check name 'source-check' is required by main-protection rulesets
│       ├── ci-lite.yml                ← DEFAULT — pick this first; 4 unconditional jobs (lint, semgrep, osv, gitleaks); works on ANY plan tier including Free org private (no GHAS / no IaC required)
│       ├── ci-full.yml                ← OPT-IN — adds checkov+tfsec+threat-model-drift via a `detect` job; pick this only when repo has iac/ or Dockerfile or .threatmodel/ AND has GHAS (or is public). See deploy.md §5/R-2 decision tree.
│       ├── build.yml                  ← reusable build+sign+provenance
│       ├── deploy-dev.yml             ← auto on merge to main
│       ├── deploy-staging.yml         ← manual promote, 1 reviewer
│       ├── deploy-prod.yml            ← tag-triggered, 2 reviewers
│       ├── nightly.yml                ← CodeQL + verified secrets + drift
│       └── _reusable-security-scan.yml
├── .pre-commit-config.yaml
├── .gitleaks.toml
├── .semgrepignore
└── iac/
    └── github-oidc-aws/               ← OpenTofu/Terraform module
        ├── main.tf
        ├── variables.tf
        └── outputs.tf
```

---

## 1. Prerequisites — what you must have before running anything

### 1.1 GitHub plan and org-level access

| Need | Plan | Why |
|---|---|---|
| Three protected environments | **GitHub Team** or higher | Free tier only allows protection rules on public repos |
| Branch rulesets with required signed commits | Team or higher | Rulesets are stricter than legacy branch protection |
| CodeQL (default rules) | Free for public, **Advanced Security** seat for private | Skip the CodeQL job if you don't have it |
| Audit log streaming to S3/Splunk | **GitHub Enterprise Cloud** | Optional — without it, audit log is queryable only for 90 days via API |
| Org-level "allowed actions" + SHA pinning policy | Team or higher | Recommended; bootstrap script optionally applies |

### 1.2 Roles you need on the GitHub side

You (or whoever runs `bootstrap.sh`) need:

- **Organization owner** (one-time) — to create teams, set org policy, enable audit log streaming.
- **Repository admin** on the target repo — to apply rulesets, create environments, set secrets.

### 1.3 Tools installed locally

```
gh        ≥ 2.55       # GitHub CLI
git       ≥ 2.40       # Git
jq        ≥ 1.7        # JSON wrangling
tofu      ≥ 1.7        # OpenTofu (or terraform 1.6+)
aws       ≥ 2.15       # AWS CLI (skip if not using AWS)
pre-commit ≥ 3.5       # local git hooks
cosign    ≥ 2.2        # only needed if you want to verify locally
```

Quick install on macOS:

```bash
brew install gh git jq opentofu awscli pre-commit cosign
```

### 1.4 Authenticate `gh` with the right scopes

```bash
gh auth login --hostname github.com --git-protocol https \
  --scopes "repo,workflow,admin:org,write:packages,read:packages,admin:repo_hook"
```

Verify:

```bash
gh auth status
gh api user -q .login
```

### 1.5 Cloud-side prerequisites (AWS reference; Azure / GCP analogues exist)

You need an AWS account where you can:
- Create an **IAM OIDC Identity Provider** for `token.actions.githubusercontent.com`
- Create three IAM Roles (`github-actions-dev`, `github-actions-staging`, `github-actions-prod`) trusted only by your specific repo and environment
- Create resources the workflows will deploy to (S3, ECR, CloudFront, ECS, etc.)

`iac/github-oidc-aws/` does all of this. **No long-lived AWS access keys are ever created or stored.**

---

## 2. The credential & permission matrix

Memorise this. It is the security model.

### 2.1 What lives where

| Credential | Lives in | Scope | Rotation | How workflows get it |
|---|---|---|---|---|
| **`GITHUB_TOKEN`** | Auto-injected by Actions | Per-job, scoped via `permissions:` block | Per-run (1 hour TTL) | Implicit |
| **GitHub OIDC ID token** | Minted by Actions when `id-token: write` is set | Audience = your cloud STS | Per-run (15 min TTL) | `aws-actions/configure-aws-credentials` exchanges it for STS creds |
| **AWS STS session** | Returned by `sts:AssumeRoleWithWebIdentity` | Per-environment IAM role; tightly scoped | Per-run (≤1 hour) | Set as env vars by configure-aws-credentials |
| **GHCR push token** | `GITHUB_TOKEN` with `packages: write` | This repo's package registry | Per-run | Implicit |
| **Cosign keys** | None — keyless via OIDC + Fulcio + Rekor | Identity = workflow + repo + ref | Per-run | `sigstore/cosign-installer` |
| **WorkOS / Auth0 admin API key** | GitHub **Environment** secret (separate per env) | Tenant per env | Quarterly | `${{ secrets.WORKOS_API_KEY }}` |
| **Grafana Cloud API token** | GitHub Environment secret per env | Stack per env | Quarterly | Same |
| **Database connection string** | **Cloud secrets manager** (AWS Secrets Manager / Azure Key Vault) — *not* in GitHub | Per-env DB | Auto-rotated by cloud | Workflow assumes IAM role, reads from Secrets Manager at deploy time |
| **Slack notification webhook** | GitHub Environment secret | Channel per env | Yearly | `${{ secrets.SLACK_WEBHOOK_URL }}` |
| **Container registry creds** | GHCR uses GITHUB_TOKEN; ECR uses STS via OIDC | Per-env | None to rotate | Implicit |

**Hard rule:** if a secret could be replaced by an OIDC exchange, it must be. Static secrets are the last resort.

### 2.2 GitHub Environment secrets the bootstrap creates (empty stubs you fill in)

| Secret name | Environment | Source | Required? |
|---|---|---|---|
| `AWS_DEPLOY_ROLE_ARN` | dev, staging, prod | Output from `iac/github-oidc-aws` | Yes |
| `AWS_REGION` | dev, staging, prod | You choose | Yes |
| `WORKOS_API_KEY` | dev, staging, prod | WorkOS dashboard → API keys (one tenant per env) | Yes if WorkOS |
| `AUTH0_CLIENT_ID` / `AUTH0_CLIENT_SECRET` | dev, staging, prod | Auth0 M2M app per env | Yes if Auth0 |
| `GRAFANA_CLOUD_TOKEN` | dev, staging, prod | Grafana Cloud → Access Policies | Recommended |
| `SLACK_WEBHOOK_URL` | dev, staging, prod | Slack incoming webhooks | Recommended |
| `CHANGE_TICKET_PREFIX` | prod only | Your ticketing system (e.g. `CHG-`) | Recommended |

### 2.3 Workflow `permissions:` blocks you'll see

Every workflow file starts with the **least** permissions needed. Top-of-file `permissions: {}` denies everything; jobs request what they need.

```yaml
# Read-only by default
permissions:
  contents: read

jobs:
  scan:
    permissions:
      contents: read
      pull-requests: write    # to comment on PR
      security-events: write  # to upload SARIF
  build:
    permissions:
      contents: read
      packages: write         # to push to GHCR
      id-token: write         # to mint OIDC token for cosign + AWS
      attestations: write     # to publish SLSA attestation
```

**Never** use `permissions: write-all`. Never.

### 2.4 Required org-level policy (recommended; bootstrap can apply)

Set under Org Settings → Actions → General:

- **Allow actions and reusable workflows:** Allow GitHub-owned + selected non-GitHub actions
- **Required SHA pinning** for non-GitHub actions
- **Allowlist** (initial seed):
  ```
  semgrep/semgrep-action@*
  aquasecurity/trivy-action@*
  anchore/scan-action@*
  google/osv-scanner-action@*
  gitleaks/gitleaks-action@*
  bridgecrewio/checkov-action@*
  aquasecurity/tfsec-action@*
  sigstore/cosign-installer@*
  slsa-framework/slsa-github-generator@*
  hashicorp/setup-terraform@*
  opentofu/setup-opentofu@*
  ```

After the March 2026 `aquasecurity/trivy-action` tag-hijack, **every reference to a non-GitHub action in this scaffold uses `@<commit-sha>` with a trailing `# v<version>` comment**. Dependabot updates the SHA and the comment together.

---

## 3. The 7-step setup flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│  1. Read this README                                                    │
│  2. Copy this directory into your new repo                              │
│  3. Edit bootstrap.config.env with your values                          │
│  4. Run iac/github-oidc-aws (one-time, per cloud account)               │
│  5. Run ./bootstrap.sh (creates env, secrets, ruleset, teams)           │
│  6. Open a PR with these files; CI runs and proves the pipeline works   │
│  7. Merge, then tag v0.1.0 to test the prod path                        │
└─────────────────────────────────────────────────────────────────────────┘
```

### Step 3 — `bootstrap.config.env`

Create this file at the repo root (it's `.gitignore`d):

```bash
# Required
GITHUB_ORG="acme-corp"
GITHUB_REPO="acme-app"
DEFAULT_BRANCH="main"

# Cloud account IDs (one per environment for blast-radius separation)
AWS_ACCOUNT_ID_DEV="111111111111"
AWS_ACCOUNT_ID_STAGING="222222222222"
AWS_ACCOUNT_ID_PROD="333333333333"
AWS_REGION="us-east-1"

# GitHub team slugs (must already exist or set CREATE_TEAMS=1)
TEAM_ENG="engineering"
TEAM_RELEASE_MANAGERS="release-managers"
TEAM_SECURITY="security"
CREATE_TEAMS=1

# Optional — leave blank to skip
WORKOS_TENANT_DEV=""
AUTH0_DOMAIN=""
GRAFANA_CLOUD_STACK=""
SLACK_WEBHOOK_URL=""
```

### Step 4 — Cloud OIDC trust (one-time)

```bash
cd iac/github-oidc-aws
tofu init
tofu apply \
  -var "github_org=acme-corp" \
  -var "github_repo=acme-app" \
  -var "aws_account_id_dev=111111111111" \
  -var "aws_account_id_staging=222222222222" \
  -var "aws_account_id_prod=333333333333"

# Capture outputs
tofu output -json > ../../bootstrap.oidc.outputs.json
```

`bootstrap.sh` reads this file to populate environment secrets.

### Step 5 — `bootstrap.sh`

```bash
./bootstrap.sh
```

What it does, in order:

1. Asserts `gh auth status`, jq, tofu are installed and authenticated.
2. Creates `engineering`, `release-managers`, `security` teams (if `CREATE_TEAMS=1`).
3. Applies the **ruleset** to `main` from `.github/rulesets/main-protection.json` (signed commits, required reviews, required checks, no force push, no deletion, linear history).
4. Creates the three **environments** (`dev`, `staging`, `prod`) with the right protection rules (reviewer counts, wait timers, ref restrictions).
5. Sets the **environment secrets** from `bootstrap.oidc.outputs.json` and stubs the rest empty so the workflow runs are clean.
6. Sets **repository settings**: squash merge only, auto-delete head branches on, conversation resolution required, linear history required, default branch = main.
7. Configures **Dependabot** (the YAML is committed; this just makes sure security updates are on).
8. (Optional) Applies **org-level allowed-actions policy** if you're an org owner and pass `--apply-org-policy`.

It is idempotent — re-running it never breaks an existing config.

### Step 6 — First PR

```bash
git checkout -b chore/scaffold
git add .
git commit -S -m "chore: scaffold CI/CD pipeline"   # -S = sign
git push -u origin chore/scaffold
gh pr create --fill --base main
```

You'll see CI run all the gates. The PR cannot merge until:
- All checks are green (or have an active waiver issue)
- One CODEOWNERS approval
- Commits are signed
- Conversations resolved

### Step 7 — Tag for prod

```bash
git checkout main && git pull
git tag -s v0.1.0 -m "v0.1.0"
git push origin v0.1.0
```

The tag triggers `deploy-prod.yml`, which **waits** for two reviewers (one from `release-managers`) plus the 30-minute cooling-off timer, then deploys.

---

## 4. What each workflow does

| File | Trigger | Gates |
|---|---|---|
| `ci.yml` | `pull_request`, `push` to non-main | lint, typecheck, unit, Semgrep diff, OSV-Scanner, Gitleaks, Checkov, tfsec, threat-model drift |
| `build.yml` | Reusable, called by deploy-* | Build container, Syft SBOM, Trivy image scan, cosign keyless sign, SLSA provenance attestation, push to GHCR |
| `deploy-dev.yml` | `push` to `main` | Calls build → deploys via OIDC → smoke test → DAST baseline (ZAP) |
| `deploy-staging.yml` | `workflow_dispatch` after dev passes | Same as dev plus integration suite; **1 reviewer** + 5-min wait |
| `deploy-prod.yml` | Push of tag `v*` | Verifies SLSA attestation + cosign sig + change-ticket ref; **2 reviewers** + 30-min wait |
| `nightly.yml` | `schedule: 02:00 UTC` | Full Semgrep, CodeQL, TruffleHog verified, license check, threat-model drift, expired-waiver sweep, cost guardrail |

---

## 5. Day-2 operations

| Task | Command |
|---|---|
| Open a security waiver | `gh issue create --template security-waiver.md` |
| List active waivers | `gh issue list --label security-waiver` |
| Re-run a failed deploy | `gh run rerun <run-id>` |
| Rotate WorkOS keys | `make rotate-workos` (see Makefile) |
| Pin all action SHAs | `make pin-actions` (uses `pinact`) |
| Verify a prod artefact | `make verify-prod TAG=v1.4.0` |
| Run pre-commit on whole repo | `pre-commit run --all-files` |
| DR drill (restore prod backup to staging) | `gh workflow run dr-drill.yml` |

---

## 6. Claude Code integration

The `triarch-cc-plugins` marketplace (separate repo) installs slash commands that mirror this pipeline locally. Without it, `pre-commit` covers the same gates. With it, you also get:

- `/security-review` — runs the same scanners on the diff and posts a review
- `/threat-model` — wraps `josemlopez/threat-modeling-toolkit` with our defaults
- `/iac-review` — runs Checkov + tfsec against IaC diffs
- `/release` — bumps version, generates changelog, opens prod-promotion PR

Same rule everywhere: a finding in Claude Code, in pre-commit, and in CI must produce the same verdict. The rule packs are versioned in one repo and consumed by all three.

---

## 7. Troubleshooting (most common bootstrap failures)

| Symptom | Cause | Fix |
|---|---|---|
| `gh: Resource not accessible by integration` | Token missing `admin:org` scope | Re-run `gh auth login` with the scope list in §1.4 |
| `Could not assume role` in workflow | OIDC trust policy mis-scoped | Check repo + environment in `iac/github-oidc-aws/main.tf` trust condition |
| Cosign sign step times out | Fulcio rate limit on free tier | Add `--rekor-url` override or retry; consider Sigstore community tier |
| `unsigned commit` rejection on push | Local git not configured for signing | `git config --global commit.gpgsign true` and set `user.signingkey` |
| Environment secret reads `***` but value is empty | `bootstrap.oidc.outputs.json` missing | Re-run Step 4, then re-run `./bootstrap.sh` |
| Ruleset apply returns 422 | An older legacy branch protection conflicts | `gh api -X DELETE /repos/$ORG/$REPO/branches/main/protection` then retry |

---

## 8. What this scaffold does **not** do (intentional)

- **Does not** create the cloud account or VPC. Out of scope; assumes those exist.
- **Does not** ship runtime application code. This is the pipeline, not the app.
- **Does not** configure your IDP (WorkOS / Auth0). Use those vendors' Terraform providers in your app's IaC.
- **Does not** provision a SIEM. The audit log lands in S3 with Object Lock; pipe to your SIEM if you have one.
- **Does not** manage cloud cost optimisation beyond a guardrail alert. Use AWS Budgets / Azure Cost Management.

These boundaries are deliberate. Each one is a separate workstream.
