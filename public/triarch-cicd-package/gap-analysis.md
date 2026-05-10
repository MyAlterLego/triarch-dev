# Triarch CI/CD — Gap Analysis Prompt

**For:** a Claude Code session
**Output:** `gap-analysis-<org>-<repo>-<YYYYMMDD>.html`
**Branding:** Triarch Security Advisors · burnt-yellow palette · matches `cicd-movie.html` / `cicd-overview.html` / `cicd-walkthrough.html`

---

## 0. What this is

You (Claude Code) are running a **gap analysis** against a customer's GitHub organization and one of their repositories, comparing the current state against the **Triarch SMB CI/CD framework**.

The framework defines three tiers:

- **REQUIRED** — without these, there's no real CI/CD
- **RECOMMENDED** — defaults in this framework; skip only with a documented reason
- **OPTIONAL** — high-value additions when capacity allows

Your job is to:

1. Run safe metadata-only discovery commands (no secrets are printed)
2. Score each item in the validation matrix as `pass` / `partial` / `fail`
3. For every gap, write specific remediation steps with the exact commands the customer's team should run
4. Render the result as a single self-contained HTML page using the embedded template at the bottom of this document

You do **not** need to fix anything. You produce the report only.

---

## 1. Inputs you need from the user before starting

Ask the user (using AskUserQuestion if available, otherwise just ask in chat):

| Required | Question |
|---|---|
| Yes | What is the GitHub organization name? |
| Yes | What is the repository name? |
| Yes | Which cloud do they use (or plan to use)? AWS / GCP / Firebase / Azure / Cloudflare-only / none yet |
| Optional | If AWS: do you have read access to their AWS account(s)? (will run `aws sts get-caller-identity` etc.) |
| Optional | What's their compliance scope, if any? SOC 2 / HIPAA / PCI / GDPR / multiple / none |

Do **not** ask for credentials. The customer must already have `gh auth login` set up in the shell you'll use.

---

## 2. Step-by-step execution

### Step 1 — Confirm tooling

```bash
gh --version
git --version
gh auth status
```

If `gh` is not authenticated, stop and tell the user to run:

```bash
gh auth login --hostname github.com --git-protocol https \
  --scopes "repo,read:org,workflow"
```

### Step 2 — Run the discovery sweep

Substitute `ORG` and `REPO` with the user-supplied values throughout. Capture every command's output into structured variables you can analyze (don't just print to terminal).

```bash
# === ORG-LEVEL ===

# Plan tier (Free / Team / Enterprise)
gh api orgs/$ORG --jq '{plan:.plan.name, two_factor:.two_factor_requirement_enabled, public:.public_repos, private:.total_private_repos}'

# Teams that exist
gh api orgs/$ORG/teams --jq '.[].slug'

# Org-level Actions policy
gh api orgs/$ORG/actions/permissions

# Org-level allowed actions
gh api orgs/$ORG/actions/permissions/selected-actions 2>/dev/null

# === REPO-LEVEL ===

# Basic repo metadata
gh api repos/$ORG/$REPO --jq '{visibility, default_branch, has_issues, allow_squash_merge, allow_merge_commit, allow_rebase_merge, delete_branch_on_merge, allow_auto_merge}'

# Branch protection on main (or default branch)
DEFAULT_BRANCH=$(gh api repos/$ORG/$REPO --jq '.default_branch')
gh api repos/$ORG/$REPO/branches/$DEFAULT_BRANCH/protection 2>/dev/null

# Rulesets (preferred over legacy branch protection)
gh api repos/$ORG/$REPO/rulesets

# Environments
gh api repos/$ORG/$REPO/environments --jq '.environments[] | {name, protection_rules}'

# Workflows
gh api repos/$ORG/$REPO/contents/.github/workflows 2>/dev/null --jq '.[].name'

# CODEOWNERS
gh api repos/$ORG/$REPO/contents/.github/CODEOWNERS 2>/dev/null --jq '.content' | base64 -d 2>/dev/null

# Dependabot config
gh api repos/$ORG/$REPO/contents/.github/dependabot.yml 2>/dev/null

# Pull request template
gh api repos/$ORG/$REPO/contents/.github/pull_request_template.md 2>/dev/null

# Threat model directory
gh api repos/$ORG/$REPO/contents/.threatmodel 2>/dev/null

# IaC presence (look for terraform / opentofu files)
gh api repos/$ORG/$REPO/contents/iac 2>/dev/null
gh api repos/$ORG/$REPO/git/trees/$DEFAULT_BRANCH?recursive=1 2>/dev/null \
  --jq '.tree[] | select(.path | test("\\.(tf|tofu)$")) | .path'

# Recent workflow runs (look for security scanning patterns)
gh run list --repo $ORG/$REPO --limit 30 --json name,conclusion,event,workflowName,createdAt

# Configured environment secrets (names only — values never visible)
for env in dev staging prod; do
  echo "--- $env secrets ---"
  gh api repos/$ORG/$REPO/environments/$env/secrets 2>/dev/null --jq '.secrets[].name'
  echo "--- $env vars ---"
  gh api repos/$ORG/$REPO/environments/$env/variables 2>/dev/null --jq '.variables[].name'
done

# Repo-level secrets and vars
gh secret list --repo $ORG/$REPO
gh variable list --repo $ORG/$REPO

# Vulnerability alerts enabled?
gh api repos/$ORG/$REPO/vulnerability-alerts -i 2>&1 | head -1

# Code scanning alerts (requires GHAS or public repo)
gh api repos/$ORG/$REPO/code-scanning/alerts 2>/dev/null --jq '.[] | {rule: .rule.id, severity: .rule.severity, state}' | head -50
```

### Step 3 — If cloud access is granted, also run

```bash
# === AWS ===
aws sts get-caller-identity
aws iam list-open-id-connect-providers
aws iam list-roles --query 'Roles[?starts_with(RoleName, `github`)].{Name:RoleName,Arn:Arn,TrustPolicy:AssumeRolePolicyDocument}' --output json
aws organizations list-accounts --query 'Accounts[*].{Id:Id,Name:Name,Status:Status}' --output table 2>/dev/null

# === GCP ===
gcloud auth list 2>/dev/null
gcloud projects list 2>/dev/null
gcloud iam workload-identity-pools list --location=global 2>/dev/null

# === Firebase ===
firebase projects:list 2>/dev/null
```

---

## 3. Validation matrix

For each row below, evaluate the discovery output and assign a status. Use the exact item IDs in the HTML output — they are referenced for sorting and filtering.

### TIER: REQUIRED — without these, no CI/CD

| ID | Item | How to evaluate | Pass criterion |
|---|---|---|---|
| R-1 | GitHub repo with Actions enabled | `gh api repos/$ORG/$REPO` returns 200; `.has_actions` not explicitly `false` | Repo exists and Actions are not disabled |
| R-2 | At least one CI workflow on PR | List `.github/workflows/`; check at least one has `on: pull_request` | ≥1 workflow runs on PR |
| R-3 | At least one deploy workflow | List `.github/workflows/`; check for `deploy*.yml` or workflow with `environment:` block | ≥1 workflow deploys somewhere |
| R-4 | Branch protection on default branch | `gh api repos/$ORG/$REPO/branches/$BRANCH/protection` returns 200, OR a ruleset targets `refs/heads/$BRANCH` | Direct pushes to default branch blocked |
| R-5 | Deploy credentials configured | Either env-secret `AWS_DEPLOY_ROLE_ARN` (OIDC) OR static creds (`AWS_ACCESS_KEY_ID`) exist for at least one env | At least one path to deploy auth exists |
| R-6 | A target hosting environment | Customer-stated cloud + at least one resource visible (account, project, Firebase project, etc.) | Confirmed in inputs |

### TIER: RECOMMENDED — framework defaults

| ID | Item | How to evaluate | Pass / Partial / Fail criteria |
|---|---|---|---|
| C-1 | 3 protected environments (dev / staging / prod) | `gh api repos/$ORG/$REPO/environments` returns all 3 with `protection_rules` populated | Pass: all 3 with reviewers/wait timers · Partial: 1–2 exist · Fail: none |
| C-2 | OIDC instead of long-lived tokens | Trust policy on the IAM role binds `repo:$ORG/$REPO:environment:*`; OR no static `AWS_ACCESS_KEY_ID` secrets | Pass: OIDC trust + zero static keys · Partial: OIDC for some envs · Fail: only static keys |
| C-3 | CODEOWNERS file present | `.github/CODEOWNERS` exists and references at least one team or user | Pass: covers `/.github/`, `/iac/`, default · Partial: file exists but minimal · Fail: missing |
| C-4 | Required signed commits | Branch protection has `required_signatures` or ruleset has `required_signatures` rule | Pass / Fail |
| C-5 | Required PR review (CODEOWNERS-aware) | Protection requires ≥1 review AND `require_code_owner_reviews=true` | Pass / Partial / Fail |
| C-6 | Required status checks (security scans) | Status check list includes Semgrep / OSV / Gitleaks / Checkov / similar | Pass: ≥3 of {SAST, SCA, secrets, IaC} · Partial: 1–2 · Fail: none |
| C-7 | Dependabot or Renovate configured | `.github/dependabot.yml` exists OR Renovate config present | Pass / Fail |
| C-8 | Linear history required | Protection has `required_linear_history=true` | Pass / Fail |
| C-9 | Threat model checked into repo | `.threatmodel/` directory exists OR `THREATMODEL.md` / `docs/threat-model.md` | Pass / Partial (file but minimal) / Fail |
| C-10 | IaC checked into repo | `iac/`, `terraform/`, `infra/`, or `infrastructure/` dir contains `.tf` / `.tofu` files | Pass / Partial (some IaC) / Fail (click-ops) |
| C-11 | Audit log routed somewhere | GitHub Enterprise audit-log streaming OR `aws s3 ls` shows audit bucket OR Loki/Splunk visible | Pass / Partial / Fail |

### TIER: OPTIONAL — capacity-allowing additions

| ID | Item | How to evaluate | Pass / Partial / Fail |
|---|---|---|---|
| O-1 | SLSA build provenance | Workflow uses `actions/attest-build-provenance` OR `slsa-framework/slsa-github-generator` | Pass / Fail |
| O-2 | Cosign signing | Workflow uses `sigstore/cosign-installer` and runs `cosign sign` | Pass / Fail |
| O-3 | Threat-model drift CI gate | A workflow check named `threat-model-drift` or similar exists | Pass / Fail |
| O-4 | DAST scanning (ZAP) | Workflow uses `zaproxy/action-baseline` or similar | Pass / Fail |
| O-5 | DR drill workflow | Workflow file or scheduled cron mentions backup-restore / DR | Pass / Fail |
| O-6 | Cost guardrail | Scheduled workflow runs Cost Explorer / budgets / similar | Pass / Fail |
| O-7 | License compliance check | Workflow uses `license-checker` / `licensee` / `fossa` / similar | Pass / Fail |
| O-8 | Multiple SAST scanners | Both Semgrep AND CodeQL configured | Pass: both · Partial: one · Fail: none |
| O-9 | Pre-commit hooks committed | `.pre-commit-config.yaml` exists at repo root | Pass / Fail |
| O-10 | Action SHA pinning | Spot-check 5 random workflow files; how many use `@<40-char-sha>` vs `@v1.2.3`? | Pass: ≥80% pinned · Partial: 30-80% · Fail: <30% |

---

## 4. Remediation library

For each item, when status is `partial` or `fail`, surface the remediation copy below in the HTML report. These are short — point the customer at the relevant step in the walkthrough rather than re-deriving the full instructions.

```yaml
# Format: <ID>: { fix: "...", reference: "Walkthrough Stage 4 Step N" }

R-1:
  fix: "Enable GitHub Actions in Repo Settings → Actions → General → Allow all actions."
  reference: "Walkthrough Stage 4 Step 1 (Foundation)"

R-2:
  fix: |
    Drop the scaffold's `.github/workflows/ci.yml` into the repo. It runs lint/test, Semgrep, OSV, Gitleaks, Checkov, tfsec, and threat-model drift on every PR.
    See the github-cicd-scaffold/.github/workflows/ci.yml file in the framework repo.
  reference: "Walkthrough Stage 4 Step 2"

R-3:
  fix: "Drop the scaffold's deploy-dev.yml / deploy-staging.yml / deploy-prod.yml into .github/workflows/. Each is OIDC-backed and gated by environment protection rules."
  reference: "Walkthrough Stage 4 Step 2"

R-4:
  fix: |
    Apply the included ruleset:
      gh api -X POST repos/$ORG/$REPO/rulesets --input .github/rulesets/main-protection.json
    The ruleset enforces signed commits, linear history, CODEOWNERS review, required checks, no force-push.
  reference: "Walkthrough Stage 4 Step 4 (bootstrap.sh)"

R-5:
  fix: |
    Run iac/github-oidc-aws/ tofu apply to create per-env IAM roles, then:
      gh secret set AWS_DEPLOY_ROLE_ARN --env dev --body 'arn:aws:iam::ACCT:role/github-actions-dev'
    Repeat for staging and prod with their respective ARNs.
  reference: "Walkthrough Stage 4 Step 3 (OIDC IaC) + Step 5 (set secrets)"

R-6:
  fix: "Provision the cloud account (Firebase / AWS / GCP / Azure). See Walkthrough Stage 4 Step 1 — it includes the signup links and account-creation flow per cloud."
  reference: "Walkthrough Stage 4 Step 1"

C-1:
  fix: |
    bootstrap.sh creates all three environments with correct protection rules. Run:
      ./bootstrap.sh
    Or manually:
      gh api -X PUT repos/$ORG/$REPO/environments/dev
      gh api -X PUT repos/$ORG/$REPO/environments/staging  --field reviewers='[{"type":"Team","id":<eng-team-id>}]' --field wait_timer=5
      gh api -X PUT repos/$ORG/$REPO/environments/prod     --field reviewers='[{"type":"Team","id":<rm-team-id>}]'  --field wait_timer=30
  reference: "Walkthrough Stage 4 Step 4"

C-2:
  fix: |
    Migrate from static keys to OIDC. Apply iac/github-oidc-aws/ tofu module, then DELETE the static AWS_ACCESS_KEY_ID secrets:
      gh secret delete AWS_ACCESS_KEY_ID --env dev
      gh secret delete AWS_SECRET_ACCESS_KEY --env dev
      # Repeat per env
  reference: "Walkthrough Stage 4 Step 3 (OIDC IaC)"

C-3:
  fix: "Drop the scaffold's .github/CODEOWNERS into the repo, edit team/user references to match your org. Branch ruleset's require_code_owner_review will then enforce it."
  reference: "github-cicd-scaffold/.github/CODEOWNERS"

C-4:
  fix: "In the ruleset JSON, add `{ \"type\": \"required_signatures\" }` then re-apply. Developers must run `git config --global commit.gpgsign true` and configure a signing key."
  reference: "Walkthrough Stage 4 Step 4"

C-5:
  fix: "Update the ruleset's `pull_request` rule to set `required_approving_review_count: 1` and `require_code_owner_review: true`."
  reference: ".github/rulesets/main-protection.json in the scaffold"

C-6:
  fix: |
    Drop the scaffold's ci.yml workflow which adds 7 required checks: lint-test, semgrep, osv-scanner, gitleaks, checkov, tfsec, threat-model-drift.
    Then update the ruleset to add these as required_status_checks contexts.
  reference: "Walkthrough Stage 4 Step 2 + Step 4"

C-7:
  fix: "Drop the scaffold's .github/dependabot.yml. Configures weekly updates for github-actions, npm, docker, and terraform with the security team as default reviewer."
  reference: "github-cicd-scaffold/.github/dependabot.yml"

C-8:
  fix: "In the ruleset JSON, add `{ \"type\": \"required_linear_history\" }` then re-apply. Developers will need to rebase instead of merge-commit."
  reference: ".github/rulesets/main-protection.json"

C-9:
  fix: |
    Install the threat-modeling toolkit Claude Code plugin:
      /plugin marketplace add josemlopez/threat-modeling-toolkit
      /plugin install threat-modeling-toolkit@josemlopez
    Then run /tm-init --docs ./docs to bootstrap a STRIDE model into .threatmodel/.
  reference: "Framework markdown §5"

C-10:
  fix: "Add iac/ directory with OpenTofu (or Terraform) modules. The scaffold includes iac/github-oidc-aws/ as a starter — extend with modules per environment."
  reference: "github-cicd-scaffold/iac/"

C-11:
  fix: |
    Two paths:
      1. GitHub Enterprise: Settings → Audit log → Streaming → S3.
      2. GitHub Team: poll the audit-log API nightly via a scheduled workflow and push to S3 / Loki.
  reference: "Framework markdown §7 (audit log)"

O-1:
  fix: |
    Add to your build workflow:
      - uses: actions/attest-build-provenance@v2
        with:
          subject-name: ghcr.io/${{ github.repository }}
          subject-digest: ${{ steps.push.outputs.digest }}
          push-to-registry: true
  reference: "github-cicd-scaffold/.github/workflows/build.yml"

O-2:
  fix: |
    Add to build workflow:
      - uses: sigstore/cosign-installer@v3.7.0
      - run: cosign sign --yes ghcr.io/${{ github.repository }}@${{ steps.push.outputs.digest }}
        env: { COSIGN_EXPERIMENTAL: "1" }
  reference: "build.yml in the scaffold"

O-3:
  fix: "Add the threat-model-drift job from scaffold's ci.yml. Fails if src/ or iac/ changed without .threatmodel/ being touched."
  reference: "ci.yml in the scaffold"

O-4:
  fix: |
    Add to deploy-dev.yml:
      - uses: zaproxy/action-baseline@v0.13.0
        with:
          target: https://dev.${{ vars.APP_DOMAIN }}
          fail_action: false
  reference: "deploy-dev.yml in the scaffold"

O-5:
  fix: "Create a scheduled workflow that restores the latest prod backup into a throwaway staging stack. Quarterly cron. Archive the report as an artifact."
  reference: "Framework markdown §11 (#5: DR drill)"

O-6:
  fix: "Add a nightly workflow that calls AWS Cost Explorer / Cloud Billing API; alert on >25% week-over-week delta."
  reference: "github-cicd-scaffold/.github/workflows/nightly.yml"

O-7:
  fix: |
    Add to nightly workflow:
      - run: npx --yes license-checker --production --excludePrivatePackages \
              --onlyAllow "MIT;Apache-2.0;BSD-2-Clause;BSD-3-Clause;ISC;0BSD"
  reference: "nightly.yml in the scaffold"

O-8:
  fix: |
    Add CodeQL to your nightly workflow:
      - uses: github/codeql-action/init@v3
        with: { languages: javascript-typescript, queries: security-extended }
      - uses: github/codeql-action/autobuild@v3
      - uses: github/codeql-action/analyze@v3
    Requires GitHub Advanced Security on private repos.
  reference: "nightly.yml in the scaffold"

O-9:
  fix: "Drop the scaffold's .pre-commit-config.yaml at repo root. Run `pre-commit install` to enable it locally."
  reference: "github-cicd-scaffold/.pre-commit-config.yaml"

O-10:
  fix: |
    Run `make pin-actions` (uses pinact). Or manually update each action reference from `@v1.2.3` to `@<full-40-char-sha> # v1.2.3`.
    After the March 2026 trivy-action tag-hijack, this is non-negotiable.
  reference: "Makefile in the scaffold"
```

---

## 5. Generate the HTML output

Save the report as `gap-analysis-<ORG>-<REPO>-<YYYYMMDD>.html` in the current directory.

Use the template below verbatim. Replace placeholders (anything in `{{ DOUBLE_BRACES }}`) with the values you computed.

For the items list, build one `<div class="gap-item">` per checklist item. Use the status badge (`pass`/`partial`/`fail`) and the tier badge (`req`/`rec`/`opt`) as classes. Show the remediation block ONLY when status is `partial` or `fail`.

### HTML template (drop in verbatim, swap placeholders)

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Triarch · CI/CD Gap Analysis · {{ORG}}/{{REPO}}</title>
<link rel="icon" type="image/png" href="https://www.triarch.dev/triarch-logo.png" />
<style>
  :root {
    --bg: #0a0a0f;
    --bg-2: #14140e;
    --panel: #1f1d14;
    --panel-2: #2b2818;
    --border: #3a3424;
    --border-strong: #5a4d2c;
    --text: #f5ecd8;
    --text-dim: #c9b88a;
    --text-faint: #8a7956;
    --accent: #e8a317;
    --accent-2: #c97d1a;
    --accent-3: #f5cc5b;
    --accent-cool: #5ac8fa;
    --warn: #d97706;
    --danger: #c84d4d;
    --success: #b8a045;
    --pass: #b8a045;
    --partial: #d97706;
    --fail: #c84d4d;
    --code-bg: #14110a;
    --radius: 10px;
    --radius-sm: 6px;
    --shadow: 0 8px 28px rgba(0,0,0,0.5);
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Inter", system-ui, sans-serif;
    font-size: 15px;
    line-height: 1.6;
    background: var(--bg);
    color: var(--text);
  }
  body::before {
    content: '';
    position: fixed; inset: 0; z-index: 0;
    background:
      radial-gradient(1100px 600px at 10% -10%, rgba(232,163,23,0.18), transparent 65%),
      radial-gradient(800px 500px at 92% 5%, rgba(201,125,26,0.14), transparent 65%),
      radial-gradient(1000px 600px at 50% 110%, rgba(245,204,91,0.06), transparent 65%);
    pointer-events: none;
  }
  main, header, nav, footer { position: relative; z-index: 1; }
  h1 { font-size: 2.4rem; margin-bottom: 0.6rem; letter-spacing: -0.02em; }
  h1 .hl {
    background: linear-gradient(135deg, var(--accent), var(--accent-2));
    -webkit-background-clip: text; background-clip: text;
    -webkit-text-fill-color: transparent; color: transparent;
    display: inline-block;
  }
  h2 { font-size: 1.5rem; margin: 2.5rem 0 0.75rem; letter-spacing: -0.01em; }
  h3 { font-size: 1.05rem; margin: 0; }
  p { color: var(--text-dim); margin: 0.4rem 0; }
  code {
    font-family: ui-monospace, "SF Mono", Menlo, monospace;
    font-size: 0.85em;
    background: var(--code-bg);
    color: #e8d4a4;
    padding: 0.1rem 0.4rem;
    border-radius: 4px;
    border: 1px solid var(--border);
  }
  pre {
    background: var(--code-bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 0.85rem 1rem;
    overflow-x: auto;
    font-family: ui-monospace, Menlo, monospace;
    font-size: 0.82rem;
    line-height: 1.55;
    color: #e8d4a4;
    margin: 0.5rem 0;
  }
  a { color: var(--accent); text-decoration: none; }
  a:hover { text-decoration: underline; }

  .container { max-width: 1100px; margin: 0 auto; padding: 0 1.5rem; }

  /* ---------- Header ---------- */
  header.hero {
    padding: 3rem 0 2rem;
    border-bottom: 1px solid var(--border);
  }
  .brand-row {
    display: flex; align-items: center; gap: 1rem;
    margin-bottom: 1.5rem; padding-bottom: 1.25rem;
    border-bottom: 1px solid var(--border);
  }
  .brand-row img {
    height: 56px;
    border-radius: 6px;
    background: linear-gradient(135deg, rgba(232,163,23,0.06), rgba(201,125,26,0.06));
    padding: 4px;
    box-shadow: 0 0 0 2px rgba(232,163,23,0.4), 0 0 30px rgba(232,163,23,0.2);
  }
  .brand-row .brand-text {
    display: flex; flex-direction: column; gap: 0.15rem;
  }
  .brand-row .brand-name {
    font-size: 1rem; font-weight: 700;
    letter-spacing: 0.04em; text-transform: uppercase;
  }
  .brand-row .brand-name .mark { color: var(--accent); }
  .brand-row .brand-tag {
    font-size: 0.78rem;
    color: var(--text-dim); font-style: italic;
  }
  .badge {
    display: inline-block;
    padding: 0.22rem 0.7rem;
    background: linear-gradient(135deg, rgba(232,163,23,0.12), rgba(201,125,26,0.08));
    color: var(--accent);
    border: 1px solid rgba(232,163,23,0.3);
    border-radius: 999px;
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin-bottom: 1rem;
  }
  .meta-row {
    display: flex; gap: 1.5rem; flex-wrap: wrap;
    margin-top: 1rem;
    color: var(--text-dim);
    font-size: 0.88rem;
  }
  .meta-row strong { color: var(--text); }

  /* ---------- Summary cards ---------- */
  .summary-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1rem;
    margin: 1.5rem 0;
  }
  @media (max-width: 700px) { .summary-grid { grid-template-columns: 1fr; } }
  .summary-card {
    background: var(--panel);
    border: 1px solid var(--border);
    border-top: 3px solid;
    border-radius: var(--radius);
    padding: 1.25rem 1.4rem;
  }
  .summary-card.req { border-top-color: var(--fail); }
  .summary-card.rec { border-top-color: var(--accent); }
  .summary-card.opt { border-top-color: var(--text-faint); }
  .summary-card .lbl {
    font-size: 0.7rem; font-weight: 700;
    letter-spacing: 0.08em; text-transform: uppercase;
    margin-bottom: 0.4rem;
  }
  .summary-card.req .lbl { color: var(--fail); }
  .summary-card.rec .lbl { color: var(--accent); }
  .summary-card.opt .lbl { color: var(--text-faint); }
  .summary-card .num {
    font-size: 2.4rem; font-weight: 700;
    color: var(--text);
    line-height: 1;
  }
  .summary-card .num .total { color: var(--text-faint); font-size: 1.4rem; font-weight: 500; }
  .summary-card .meter {
    height: 6px; border-radius: 999px;
    background: rgba(255,255,255,0.05);
    margin-top: 0.85rem;
    overflow: hidden;
  }
  .summary-card .meter-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--accent), var(--accent-2));
    border-radius: 999px;
  }
  .summary-card.req .meter-fill { background: linear-gradient(90deg, var(--fail), var(--accent-2)); }

  /* ---------- Filter / sort bar ---------- */
  .filter-bar {
    display: flex; gap: 0.5rem; flex-wrap: wrap;
    margin: 1rem 0;
    padding: 0.75rem 1rem;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    align-items: center;
  }
  .filter-bar .label { font-size: 0.78rem; color: var(--text-faint); margin-right: 0.5rem; }
  .filter-btn {
    padding: 0.35rem 0.85rem;
    background: var(--bg-2);
    border: 1px solid var(--border);
    border-radius: 999px;
    color: var(--text-dim);
    font-size: 0.78rem;
    cursor: pointer;
    font-family: inherit;
    transition: all 0.15s;
  }
  .filter-btn:hover { color: var(--text); border-color: var(--border-strong); }
  .filter-btn.active {
    background: rgba(232,163,23,0.12);
    border-color: var(--accent);
    color: var(--accent);
    font-weight: 600;
  }

  /* ---------- Gap items ---------- */
  .gap-list {
    display: flex; flex-direction: column;
    gap: 0.6rem;
    margin: 1rem 0;
  }
  .gap-item {
    background: var(--panel);
    border: 1px solid var(--border);
    border-left: 4px solid;
    border-radius: var(--radius);
    overflow: hidden;
    transition: border-color 0.15s;
  }
  .gap-item.pass { border-left-color: var(--pass); }
  .gap-item.partial { border-left-color: var(--partial); }
  .gap-item.fail { border-left-color: var(--fail); }
  .gap-item.hidden { display: none; }

  .gap-head {
    display: flex; align-items: center; gap: 0.75rem;
    padding: 0.85rem 1.1rem;
    cursor: pointer;
    user-select: none;
  }
  .gap-head:hover { background: var(--panel-2); }

  .status-icon {
    width: 28px; height: 28px;
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-weight: 700; font-size: 0.95rem;
    flex-shrink: 0;
  }
  .pass .status-icon { background: rgba(184,160,69,0.18); color: var(--pass); }
  .partial .status-icon { background: rgba(217,119,6,0.18); color: var(--partial); }
  .fail .status-icon { background: rgba(200,77,77,0.18); color: var(--fail); }
  .pass .status-icon::before { content: '✓'; }
  .partial .status-icon::before { content: '!'; }
  .fail .status-icon::before { content: '✕'; }

  .gap-id {
    font-family: ui-monospace, monospace;
    font-size: 0.72rem;
    color: var(--text-faint);
    background: var(--bg-2);
    padding: 0.15rem 0.4rem;
    border-radius: 4px;
    border: 1px solid var(--border);
    flex-shrink: 0;
  }

  .gap-title { flex: 1; color: var(--text); font-weight: 500; }

  .tier-badge {
    padding: 0.12rem 0.55rem;
    border-radius: 999px;
    font-size: 0.65rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    border: 1px solid;
    flex-shrink: 0;
  }
  .tier-badge.req { background: rgba(200,77,77,0.1); color: var(--fail); border-color: rgba(200,77,77,0.35); }
  .tier-badge.rec { background: rgba(232,163,23,0.1); color: var(--accent); border-color: rgba(232,163,23,0.35); }
  .tier-badge.opt { background: rgba(138,121,86,0.12); color: var(--text-faint); border-color: rgba(138,121,86,0.3); }

  .toggle { color: var(--text-faint); font-size: 1.2rem; transition: transform 0.2s; flex-shrink: 0; }
  .gap-item.open .toggle { transform: rotate(90deg); }

  .gap-body {
    display: none;
    padding: 0 1.1rem 1.1rem 3.85rem;
    border-top: 1px solid var(--border);
    padding-top: 0.85rem;
    font-size: 0.9rem;
  }
  .gap-item.open .gap-body { display: block; }
  .gap-body .observed {
    background: var(--bg-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 0.65rem 0.85rem;
    margin: 0.5rem 0;
    font-size: 0.85rem;
  }
  .gap-body .observed .lbl {
    font-size: 0.7rem;
    color: var(--text-faint);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin-bottom: 0.25rem;
  }
  .gap-body .fix {
    background: rgba(232,163,23,0.04);
    border-left: 3px solid var(--accent);
    border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
    padding: 0.65rem 0.85rem;
    margin: 0.5rem 0;
  }
  .gap-body .fix .lbl {
    font-size: 0.7rem;
    color: var(--accent);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: 700;
    margin-bottom: 0.3rem;
  }
  .gap-body .ref {
    color: var(--text-faint);
    font-size: 0.8rem;
    margin-top: 0.4rem;
  }
  .gap-body .ref::before { content: '→ '; color: var(--accent); }

  /* ---------- Footer ---------- */
  footer {
    border-top: 1px solid var(--border);
    margin-top: 4rem;
    padding: 2rem 0;
    color: var(--text-faint);
    font-size: 0.85rem;
    background: linear-gradient(180deg, transparent, rgba(232,163,23,0.03));
  }
  footer .container {
    display: flex; justify-content: space-between; align-items: center;
    gap: 1rem; flex-wrap: wrap;
  }
  footer .footer-brand {
    display: flex; align-items: center; gap: 0.6rem;
  }
  footer .footer-brand img { height: 24px; opacity: 0.7; }
  footer .footer-brand strong { color: var(--text-dim); font-weight: 600; letter-spacing: 0.03em; }
</style>
</head>
<body>

<main>
  <header class="hero container">
    <div class="brand-row">
      <img src="https://www.triarch.dev/triarch-logo.png" alt="Triarch" />
      <div class="brand-text">
        <span class="brand-name"><span class="mark">TRIARCH</span> · SECURITY ADVISORS</span>
        <span class="brand-tag">In a market full of noise, we provide the signal.</span>
      </div>
    </div>
    <span class="badge">CI/CD Gap Analysis</span>
    <h1>What <span class="hl">{{ORG}}/{{REPO}}</span> has, and what's missing.</h1>
    <p>Generated by Claude Code from a discovery sweep of GitHub + cloud metadata. No secrets were captured. Compare against the Triarch SMB CI/CD framework's required / recommended / optional tiers.</p>
    <div class="meta-row">
      <span><strong>Org:</strong> {{ORG}}</span>
      <span><strong>Repo:</strong> {{REPO}}</span>
      <span><strong>Cloud:</strong> {{CLOUD}}</span>
      <span><strong>Default branch:</strong> {{DEFAULT_BRANCH}}</span>
      <span><strong>Generated:</strong> {{GENERATED_DATE}}</span>
    </div>

    <div class="summary-grid">
      <div class="summary-card req">
        <div class="lbl">Required</div>
        <div class="num">{{REQUIRED_PASSED}}<span class="total"> / {{REQUIRED_TOTAL}}</span></div>
        <div class="meter"><div class="meter-fill" style="width: {{REQUIRED_PCT}}%"></div></div>
        <p style="font-size:0.85rem;margin-top:0.5rem">{{REQUIRED_FAIL_COUNT}} blocking gap{{REQUIRED_PLURAL}}</p>
      </div>
      <div class="summary-card rec">
        <div class="lbl">Recommended</div>
        <div class="num">{{RECOMMENDED_PASSED}}<span class="total"> / {{RECOMMENDED_TOTAL}}</span></div>
        <div class="meter"><div class="meter-fill" style="width: {{RECOMMENDED_PCT}}%"></div></div>
        <p style="font-size:0.85rem;margin-top:0.5rem">{{RECOMMENDED_FAIL_COUNT}} priority gap{{RECOMMENDED_PLURAL}}</p>
      </div>
      <div class="summary-card opt">
        <div class="lbl">Optional</div>
        <div class="num">{{OPTIONAL_PASSED}}<span class="total"> / {{OPTIONAL_TOTAL}}</span></div>
        <div class="meter"><div class="meter-fill" style="width: {{OPTIONAL_PCT}}%"></div></div>
        <p style="font-size:0.85rem;margin-top:0.5rem">capacity-allowing additions</p>
      </div>
    </div>
  </header>

  <section class="container">
    <h2>Gap detail</h2>
    <p>Click any item to expand its observed state, remediation, and reference. Filter by status or tier below.</p>

    <div class="filter-bar">
      <span class="label">Status:</span>
      <button class="filter-btn active" data-filter-status="all">All</button>
      <button class="filter-btn" data-filter-status="fail">Failing</button>
      <button class="filter-btn" data-filter-status="partial">Partial</button>
      <button class="filter-btn" data-filter-status="pass">Passing</button>
      <span class="label" style="margin-left:1rem">Tier:</span>
      <button class="filter-btn active" data-filter-tier="all">All</button>
      <button class="filter-btn" data-filter-tier="req">Required</button>
      <button class="filter-btn" data-filter-tier="rec">Recommended</button>
      <button class="filter-btn" data-filter-tier="opt">Optional</button>
    </div>

    <div class="gap-list">
      <!-- Repeat one block per checklist item.
           Replace status class (pass/partial/fail), tier class (req/rec/opt), and content. -->
      {{ITEMS}}
    </div>
  </section>

  <section class="container" style="margin-top:3rem">
    <h2>Next steps</h2>
    <p>Address gaps in tier order — required first, then recommended, then optional.</p>
    <ol style="margin-left:1.5rem;color:var(--text-dim)">
      {{NEXT_STEPS_OL}}
    </ol>
    <p style="margin-top:1rem">For step-by-step remediation with copy-to-clipboard commands, open the
      <a href="cicd-walkthrough.html">interactive walkthrough</a>. For an exec/sponsor view of the framework, see the
      <a href="cicd-overview.html">overview</a> or
      <a href="cicd-movie.html" style="color:var(--accent-2)">▶ interactive movie</a>.
    </p>
  </section>
</main>

<footer>
  <div class="container">
    <div class="footer-brand">
      <img src="https://www.triarch.dev/triarch-logo.png" alt="Triarch" />
      <strong>TRIARCH SECURITY ADVISORS</strong>
      <span style="color:var(--text-faint);margin-left:0.5rem">· Gap analysis v1.0</span>
    </div>
    <div>
      Pairs with <code>github-cicd-scaffold/</code> ·
      <a href="https://www.triarch.dev" target="_blank" rel="noopener">triarch.dev</a>
    </div>
  </div>
</footer>

<script>
  // Toggle expand
  document.querySelectorAll('.gap-head').forEach(h => {
    h.addEventListener('click', () => h.parentElement.classList.toggle('open'));
  });
  // Filter
  let filterStatus = 'all', filterTier = 'all';
  function applyFilters() {
    document.querySelectorAll('.gap-item').forEach(el => {
      const matchesStatus = filterStatus === 'all' || el.classList.contains(filterStatus);
      const matchesTier = filterTier === 'all' || el.classList.contains(filterTier);
      el.classList.toggle('hidden', !(matchesStatus && matchesTier));
    });
  }
  document.querySelectorAll('[data-filter-status]').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('[data-filter-status]').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    filterStatus = b.dataset.filterStatus;
    applyFilters();
  }));
  document.querySelectorAll('[data-filter-tier]').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('[data-filter-tier]').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    filterTier = b.dataset.filterTier;
    applyFilters();
  }));
  // Auto-expand all failing items on load
  document.querySelectorAll('.gap-item.fail').forEach(el => el.classList.add('open'));
</script>

</body>
</html>
```

### Item block template (for each checklist row, paste into `{{ITEMS}}`)

```html
<div class="gap-item {{STATUS}} {{TIER}}">
  <div class="gap-head">
    <span class="status-icon"></span>
    <span class="gap-id">{{ID}}</span>
    <span class="gap-title">{{TITLE}}</span>
    <span class="tier-badge {{TIER}}">{{TIER_LABEL}}</span>
    <span class="toggle">›</span>
  </div>
  <div class="gap-body">
    <div class="observed">
      <div class="lbl">Observed</div>
      {{OBSERVED}}
    </div>
    {{#if NOT_PASS}}
    <div class="fix">
      <div class="lbl">Remediation</div>
      {{REMEDIATION_HTML}}
      <div class="ref">{{REFERENCE}}</div>
    </div>
    {{/if}}
  </div>
</div>
```

Where:
- `{{STATUS}}` ∈ `pass` / `partial` / `fail`
- `{{TIER}}` ∈ `req` / `rec` / `opt`
- `{{TIER_LABEL}}` ∈ `Required` / `Recommended` / `Optional`
- `{{OBSERVED}}` — what you actually found (e.g. "3 environments exist but only `prod` has reviewer protection")
- `{{REMEDIATION_HTML}}` — the matching fix from the Remediation library, formatted as HTML (use `<pre>` for code blocks)
- `{{REFERENCE}}` — the matching reference string from the Remediation library

### Next-steps prioritization

Build the `<ol>` in priority order:

1. **All failing REQUIRED items** (in ID order R-1, R-2, …)
2. **All failing RECOMMENDED items** (in ID order)
3. **All partial RECOMMENDED items**
4. (Optional items not listed unless customer asks — too noisy)

Each list item is one sentence pointing at the gap. Example:

```html
<li><strong>R-4 Branch protection</strong> — apply the included ruleset (<code>./bootstrap.sh</code>).</li>
```

---

## 6. Output checklist before you finish

- [ ] HTML file saved as `gap-analysis-<ORG>-<REPO>-<YYYYMMDD>.html`
- [ ] All three summary cards have correct counts and percentages
- [ ] Every checklist item from §3 has a corresponding `<div class="gap-item">`
- [ ] No raw secrets, tokens, or credentials anywhere in the HTML (account IDs and ARNs are OK)
- [ ] Filter buttons work (test by opening the file in a browser)
- [ ] Failing items are auto-expanded on load
- [ ] Footer mentions Triarch and links to triarch.dev
- [ ] Tell the user the file path and offer to open it for them

---

## 7. Tone for the report

- **Direct, not preachy.** "Branch protection is missing" — not "we noticed that, unfortunately, branch protection is not yet…"
- **Specific.** Cite the API call or file you checked, not vague summaries.
- **Actionable.** Every gap has a one-paragraph remediation that names the exact command or file.
- **Triarch voice.** "In a market full of noise, we provide the signal." Match the existing pages — sharp, no-bullshit, advisory.

---

## 8. Edge cases to handle

| Case | What to do |
|---|---|
| `gh` not authenticated | Stop. Print the `gh auth login` command and exit. |
| Repo doesn't exist or no access | Stop. Tell the user the org/repo combination is invalid or they lack access. |
| AWS credentials not present but cloud=AWS | Note this in the report header; mark cloud-side checks as "not evaluated — credentials not provided" rather than failing them. |
| Customer is on Free GitHub plan | Mark C-1 and C-4 as `fail` with remediation "upgrade to Team — environments + rulesets aren't available on Free for private repos". |
| Repo has zero workflows | All R-2, R-3 fail. Most C-* items will fail too. Recommend running `bootstrap.sh` from the scaffold as the fastest path to remediation. |
| Customer hasn't picked a cloud yet | Skip cloud-side checks. Tier R-6 fails. Recommend Stage 1 + Stage 2 of the walkthrough first. |

---

## 9. Run it

When the user says "run the gap analysis", execute everything above in order. End with:

> Gap analysis complete. **{{REQUIRED_PASSED}}/{{REQUIRED_TOTAL}} required**, **{{RECOMMENDED_PASSED}}/{{RECOMMENDED_TOTAL}} recommended**, **{{OPTIONAL_PASSED}}/{{OPTIONAL_TOTAL}} optional** items are in place.
> Report saved to `gap-analysis-{{ORG}}-{{REPO}}-{{DATE}}.html`. Open it in a browser to walk through the gaps.
