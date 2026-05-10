# Triarch CI/CD — Deployment Prompt

**For:** a Claude Code session (the same one that ran `gap-analysis.md`, or a new one)
**Input:** the user's findings (HTML report from gap-analysis OR the form output `deploy-customized.md`)
**Output:** files written to the user's repo, ready for them to commit

---

## 0. Read this protocol first — no exceptions

> **You are deploying CI/CD remediations on someone's actual repository.**
> The user trusts you to write workflow files, IaC, and config — but **never to handle their secrets**.

### Credential safety — non-negotiable

You **MUST NOT**:

- Ask the user to paste an API key, token, password, secret, or any credential value into chat.
- Log, echo, persist, or repeat any credential value the user shares despite this rule. If a user pastes one, immediately tell them to rotate it.
- Write any credential value into a workflow file, IaC file, README, or commit message.
- Suggest committing `.env` files, `*.tfvars` containing secrets, or any file that ends up containing a secret value.
- Use `gh secret set NAME --body 'actual-value-from-chat'` form — even briefly.

You **MUST**:

- For every secret the deploy needs, print the `gh secret set` command **without** the `--body` value. The user runs it themselves with their secret typed (or piped) in their own terminal.
- Use **OIDC** (federated identity) for cloud auth wherever possible. Static keys are a last resort.
- Reference secrets in workflow files only by name, e.g. `${{ secrets.WORKOS_API_KEY }}`.
- If a remediation cannot be completed without a credential, stop, surface the gap, and ask the user to set the secret themselves before continuing.
- Tell the user, at the end of the run, exactly which secrets they still need to set and how.

### Acceptable surface area

| OK to write | NOT OK to write |
|---|---|
| Workflow YAML referencing `${{ secrets.NAME }}` | Workflow YAML with a literal token value |
| `gh secret set NAME --env staging --repo ORG/REPO` (no `--body`) | `gh secret set NAME --body 'sk_live_...'` |
| Trust policy ARNs, role names, account IDs | API keys, OAuth tokens, AWS access keys |
| OpenTofu IaC for OIDC trust | OpenTofu provider blocks with hard-coded creds |
| `.env.example` with placeholders | `.env` with real values |

If a step you're about to take violates this, stop and report the issue.

---

## 1. Pre-requisites — confirm authentication state first

Before any deploy work, confirm the user is authenticated to GitHub and to whichever cloud they're targeting. If anything is missing, stop and print the exact login command — never proceed with deploys against an un-authenticated CLI.

```bash
# Required for every flow
gh auth status

# If cloud is in scope (skip whichever doesn't apply)
aws sts get-caller-identity
gcloud auth list
firebase projects:list 2>/dev/null | head -3
az account show
```

If a check fails, print the matching login command and stop until the user confirms they've run it:

#### GitHub (always required)
```bash
gh auth login --hostname github.com --git-protocol https \
  --scopes "repo,workflow,admin:org,write:packages,read:packages,admin:repo_hook"
```
Note `admin:org` is broader than what `gap-analysis.md` needs — `deploy.md` writes rulesets, environments, and team grants, so it needs more scope. The token never enters chat.

#### AWS (if cloud = AWS)
```bash
# Pick whichever the org uses:
aws configure sso && aws sso login          # IAM Identity Center
# OR via federation tool (saml2aws, granted, leapp)
# OR static keys (last resort) — type in YOUR terminal, never in chat
aws configure
```

#### GCP (if cloud = GCP IaaS)
```bash
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
gcloud auth application-default login           # required for Terraform
```

#### Firebase (if cloud = Firebase)
```bash
npm install -g firebase-tools
firebase login
```

#### Azure (if cloud = Azure)
```bash
az login
az account set --subscription "Name or ID"
```

**All of these are interactive browser flows.** The user's tokens land in their CLI config (`~/.config/gh/`, `~/.aws/sso/`, `~/.config/gcloud/`, etc.) — they never enter your chat output, never get written to a file you create, never get logged.

Once everything is green, proceed.

## 2. Inputs

Ask the user (in this order):

1. **Where are the findings?** One of:
   - Path to a `gap-analysis-*.html` from a previous run
   - Path to `deploy-customized.md` from the walkthrough form
   - "I'll list the items inline" (free-form list)
2. **GitHub org / repo** (re-confirm even if findings already specify them)
3. **Cloud target** (AWS / GCP / Firebase / Azure / Cloudflare) — should match what they authenticated to in §1
4. **Are you OK with me writing files to a feature branch and opening a PR?** (yes/no — if no, write to working dir only)

Do **not** ask for any cloud account IDs, role ARNs, or secrets at this stage. Those come from running discovery commands or from the IaC outputs.

## 3. Read the findings

Parse the input source you were given and produce an internal list of `(item_id, status, tier, current_state, fix_action)` tuples.

Skip every item with status `pass`. Address remaining items in this order:

1. All `fail` Required items
2. All `partial` Required items
3. All `unknown` Required items (run discovery first to disambiguate)
4. All `fail` Recommended items
5. All `partial` Recommended items
6. All `unknown` Recommended items (run discovery first)
7. All Optional items (only if the user explicitly asks)

Print the planned ordering and ask the user to confirm before proceeding.

## 4. For each item, follow this template

For every gap you address:

```
=== Addressing <ID>: <Title> [<Tier>] ===
Why this matters: <one sentence>
Current state:    <what discovery showed, or what the user reported>
What I'll do:     <files I'll write or commands I'll suggest>
Secrets needed:   <names only, never values>
Verifying via:    <how we'll confirm it worked>
```

After completing each item, mark it done in your internal state and continue.

## 5. Remediation library

Each entry maps a gap-analysis ID to the action you take. Use `github-cicd-scaffold/` (downloaded from the same package as this prompt) as your source of truth for templates.

### R-1 — Enable Actions on the repo
- **Action:** Print: `Repo Settings → Actions → General → Allow all actions and reusable workflows`. This is a console click, not an API call. Confirm with the user before continuing.
- **Verify:** `gh api repos/ORG/REPO --jq '.has_actions'`

### R-2 — Add a CI workflow
- **Action:** Copy `github-cicd-scaffold/.github/workflows/ci.yml` into the user's `.github/workflows/`. Adjust language-specific steps (Node version, package manager) if the repo isn't standard `npm`. **Do not modify the security scanning steps.**
- **Verify:** Once committed and a PR opened, all 7 status checks should appear.

### R-3 — Add deploy workflows
- **Action:** Copy `deploy-dev.yml`, `deploy-staging.yml`, `deploy-prod.yml`, and `build.yml` from the scaffold. Update the `vars.APP_DOMAIN` reference if the user provides one (otherwise leave the default). **Do not** put any cloud account IDs or role ARNs in these files — they reference `${{ secrets.AWS_DEPLOY_ROLE_ARN }}`.
- **Verify:** Workflows exist; environments will be created in C-1.

### R-4 — Apply branch protection ruleset
- **Action:**
  ```bash
  gh api -X POST repos/ORG/REPO/rulesets --input github-cicd-scaffold/.github/rulesets/main-protection.json
  ```
- **Verify:**
  ```bash
  gh api repos/ORG/REPO/rulesets --jq '.[] | {name, enforcement, target}'
  ```

### R-5 — Configure deploy credentials (OIDC preferred)
- **Action:** Run the OIDC IaC:
  ```bash
  cd github-cicd-scaffold/iac/github-oidc-aws
  cp example.tfvars terraform.tfvars
  # User edits terraform.tfvars with their org/repo + 3 AWS account IDs
  tofu init && tofu apply
  tofu output -json > ../../bootstrap.oidc.outputs.json
  ```
  Then set the role-ARN env secrets per environment (no values, just the command):
  ```bash
  # User runs these — values come from bootstrap.oidc.outputs.json
  gh secret set AWS_DEPLOY_ROLE_ARN --env dev     --repo ORG/REPO
  gh secret set AWS_DEPLOY_ROLE_ARN --env staging --repo ORG/REPO
  gh secret set AWS_DEPLOY_ROLE_ARN --env prod    --repo ORG/REPO
  ```
  These role ARNs are not secrets per se (account IDs are visible), but storing them as env secrets keeps the workflow files clean.
- **Cloudflare alternative:** Cloudflare doesn't support GitHub OIDC. Print:
  ```bash
  gh secret set CLOUDFLARE_API_TOKEN --env dev     --repo ORG/REPO
  gh secret set CLOUDFLARE_API_TOKEN --env staging --repo ORG/REPO
  gh secret set CLOUDFLARE_API_TOKEN --env prod    --repo ORG/REPO
  ```
  Tell the user to generate scoped tokens at <https://dash.cloudflare.com/profile/api-tokens> with only the permissions needed per env. Do NOT ask them to share the token with you.

### R-6 — Hosting target
- **Action:** Out of scope for this prompt — point the user at `cicd-walkthrough.html` Stage 1 if they haven't picked / provisioned a cloud yet.

### C-1 — Create 3 protected environments
- **Action:** Run the scaffold's `bootstrap.sh` (preferred). Or, if the user only wants the environments and not the rest:
  ```bash
  # Get team IDs first
  ENG_ID=$(gh api orgs/ORG/teams/engineering --jq .id)
  RM_ID=$(gh api orgs/ORG/teams/release-managers --jq .id)
  # Create environments
  gh api -X PUT repos/ORG/REPO/environments/dev
  gh api -X PUT repos/ORG/REPO/environments/staging \
    --field reviewers="[{\"type\":\"Team\",\"id\":$ENG_ID}]" \
    --field wait_timer=5 --field prevent_self_review=true
  gh api -X PUT repos/ORG/REPO/environments/prod \
    --field reviewers="[{\"type\":\"Team\",\"id\":$RM_ID},{\"type\":\"Team\",\"id\":$ENG_ID}]" \
    --field wait_timer=30 --field prevent_self_review=true
  ```
- **Verify:** `gh api repos/ORG/REPO/environments --jq '.environments[].name'`

### C-2 — Migrate from static cloud keys to OIDC
- **Action:** Same as R-5 (apply OIDC IaC). Then explicitly delete the static keys:
  ```bash
  gh secret delete AWS_ACCESS_KEY_ID     --env dev     --repo ORG/REPO
  gh secret delete AWS_SECRET_ACCESS_KEY --env dev     --repo ORG/REPO
  # repeat per env
  ```
- **Verify:** No `AWS_ACCESS_KEY_*` secrets in any environment after migration.

### C-3 — Add CODEOWNERS
- **Action:** Copy `github-cicd-scaffold/.github/CODEOWNERS`. Edit team references to match the user's actual GitHub team slugs. Save to `.github/CODEOWNERS`.
- **Verify:** `gh api repos/ORG/REPO/codeowners/errors --jq '.errors'` returns `[]`.

### C-4 — Require signed commits
- **Action:** Update `main-protection.json` ruleset to include `{ "type": "required_signatures" }` in the `rules` array. Re-apply with the gh api command from R-4.
- **User-side note:** Each developer must run `git config --global commit.gpgsign true` and configure a signing key via `git config --global user.signingkey <KEY-ID>`. Tell the user this; do not configure it for them.

### C-5 — Require code reviews
- **Action:** The default `main-protection.json` already has this. If reviews are missing, ensure the ruleset's `pull_request` rule has:
  ```json
  { "type": "pull_request", "parameters": {
      "required_approving_review_count": 1,
      "require_code_owner_review": true,
      "require_last_push_approval": true,
      "dismiss_stale_reviews_on_push": true,
      "required_review_thread_resolution": true
  }}
  ```
  Re-apply with R-4's command.

### C-6 — Add SAST + SCA + secrets scanning
- **Action:** This is the same as R-2 (drop the scaffold's `ci.yml`). It bundles Semgrep, OSV, Gitleaks, Checkov, tfsec, and threat-model-drift.
- **Verify:** PR opens; check that all 7 status checks run and report results.

### C-7 — Configure Dependabot
- **Action:** Copy `github-cicd-scaffold/.github/dependabot.yml`. Adjust ecosystem mix if the repo isn't `npm` + Docker + Terraform.
- **Verify:** Within 24h of merge, Dependabot opens its first PR.

### C-8 — Require linear history
- **Action:** Add `{ "type": "required_linear_history" }` to ruleset rules; re-apply. Tell developers they must rebase instead of merge-commit.

### C-9 — Add a threat model
- **Action:** Two paths:
  1. **Lightweight:** create `THREATMODEL.md` at repo root with a 1-page STRIDE table (5 columns: Threat, Spoofing/Tampering/etc., Asset, Likelihood, Mitigation). Use the scaffold's structure if present.
  2. **Full:** install the Claude Code plugin, then run its slash commands:
     ```
     /plugin marketplace add josemlopez/threat-modeling-toolkit
     /plugin install threat-modeling-toolkit@josemlopez
     /tm-init --docs ./docs
     /tm-threats
     /tm-verify
     ```
- **Verify:** A `.threatmodel/` directory or `THREATMODEL.md` exists.

### C-10 — Add IaC
- **Action:** Create `iac/` at repo root, copy in `github-oidc-aws/` from the scaffold as starter. For runtime infrastructure (databases, hosting, etc.), this is per-cloud — point the user at the relevant getting-started docs but DO NOT generate cloud-specific IaC unless they ask.

### C-11 — Set up audit log
- **Action:** Two paths depending on plan:
  - **GitHub Enterprise:** Org Settings → Audit log → Streaming → S3. Print the configuration steps; user does the console clicks.
  - **GitHub Team:** Schedule a workflow that polls the audit log API and pushes to S3:
    ```yaml
    # .github/workflows/audit-export.yml
    on: { schedule: [{ cron: "0 */6 * * *" }] }
    jobs:
      export:
        runs-on: ubuntu-latest
        permissions: { id-token: write, contents: read }
        steps:
          - uses: aws-actions/configure-aws-credentials@v4
            with:
              role-to-assume: ${{ secrets.AUDIT_EXPORT_ROLE_ARN }}
              aws-region: us-east-1
          - run: |
              gh api -X GET orgs/ORG/audit-log > audit-$(date -u +%FT%TZ).json
              aws s3 cp audit-*.json s3://acme-audit-bucket/
    ```
  Set `AUDIT_EXPORT_ROLE_ARN` via `gh secret set` (no value).

### Optional (O-1 to O-10)
Apply only if explicitly requested. Each is a single workflow modification or new file. Use the scaffold's `nightly.yml` as the starting point — it bundles SLSA + cosign + CodeQL + license + DR + cost.

---

## 6. Open the PR (if user agreed in §2)

```bash
git checkout -b chore/triarch-cicd-remediation
git add .github/ iac/
git commit -S -m "chore(ci): apply Triarch CI/CD remediations

Addresses gaps from gap-analysis on $(date -u +%F):
- <R-X>: <title>
- <C-X>: <title>
"
git push -u origin chore/triarch-cicd-remediation
gh pr create --title "Triarch CI/CD remediation" --body-file .github/pr-body.md
```

The commit body lists each gap addressed by ID. Do not list secret names in the commit message (they're in the workflows referenced by `${{ secrets.NAME }}` already).

## 7. Hand-off summary

When you finish (or stop because the user must intervene), print this summary:

```
=== Triarch CI/CD remediation — summary ===
Branch:   chore/triarch-cicd-remediation
PR:       <url>

Items addressed:
  [✓] R-2: CI workflow added
  [✓] R-4: Branch ruleset applied
  [✓] C-1: 3 environments created
  [✓] C-3: CODEOWNERS added
  [⏸] R-5: OIDC IaC ready, AWS_DEPLOY_ROLE_ARN secrets STILL TO SET (see commands below)

Items requiring your manual action:
  - Run `tofu apply` in iac/github-oidc-aws/ (your AWS cross-account role required)
  - Set these env secrets — values come from your AWS console / tofu outputs:
      gh secret set AWS_DEPLOY_ROLE_ARN --env dev     --repo ORG/REPO
      gh secret set AWS_DEPLOY_ROLE_ARN --env staging --repo ORG/REPO
      gh secret set AWS_DEPLOY_ROLE_ARN --env prod    --repo ORG/REPO
  - Set up GPG/SSH commit signing on your developer machines:
      git config --global commit.gpgsign true
  - Replace placeholder values in deploy-dev.yml / deploy-staging.yml / deploy-prod.yml's
    deployment commands (currently just `echo "Deploying..."` placeholders)

Items NOT addressed (skipped or out of scope):
  [-] R-6: Cloud account provisioning — see cicd-walkthrough.html Stage 1
  [-] O-* Optional items: ask if you want any added

Secrets you still need to set (names only — values never enter Claude Code's chat):
  - AWS_DEPLOY_ROLE_ARN  (dev / staging / prod)
  - WORKOS_API_KEY       (if using WorkOS — dev / staging / prod)
  - SLACK_WEBHOOK_URL    (optional, for deploy notifications)
  - GRAFANA_CLOUD_TOKEN  (optional, for observability)

Validation:
  - Open the PR and watch CI run. All 7 status checks should appear.
  - Tag v0.1.0 only after the PR merges to test the prod path.
  - Run gap-analysis.md again on the merged repo to confirm gaps closed.
=== End summary ===
```

---

## 8. Edge cases

| Case | Action |
|---|---|
| User pastes a credential value despite the rule | Stop. Tell them to rotate that credential immediately. Don't proceed until they confirm rotation. |
| Findings file unreadable / corrupt | Ask user to re-run gap-analysis or to list items inline. |
| Repo doesn't exist or no access | Stop. Confirm the org/repo and that `gh auth status` shows the right user. |
| User on Free plan | Required items C-1, C-4, C-8 will fail (no protection rules on Free private repos). Mark them blocked, recommend Team upgrade, continue with what's possible. |
| User says "skip the threat model" | Honor that. Skip C-9. Note in the summary. |
| Conflict — file already exists with different content | Diff the two; show the user; ask whether to overwrite, merge, or skip. Default skip. |
| User wants something not in this library | Tell them honestly: "That's not in the scaffold. Would you like me to scope a custom approach, or stick to the framework?" |

---

## 9. Don't deviate

- Don't suggest a different scaffold or framework mid-stream.
- Don't decide unilaterally to add things the findings don't call for.
- Don't write "TODO: replace with your secret here" in a workflow file. Use `${{ secrets.NAME }}`.
- Don't optimize the workflow files (e.g., merging steps, removing scans). They're tuned for Triarch's framework.
- Don't accept a credential value, even if the user insists. Politely decline and explain why.

---

## 10. When you're done

Confirm:

- All `fail` Required items are addressed or explicitly blocked with a reason.
- The user has the list of secrets they still need to set.
- The PR is open (or files are staged in working dir if they declined the PR).
- They know to run `gap-analysis.md` again post-merge to confirm gaps closed.

End with the **§7 hand-off summary**. That's the deliverable.
