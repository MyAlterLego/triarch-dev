#!/usr/bin/env bash
# discovery.sh — safe environment introspection for the Triarch CI/CD framework.
#
# WHAT IT DOES
#   Calls metadata-only endpoints on `gh` and `aws` to understand the current
#   state of a GitHub org/repo and (optionally) cloud accounts. Output is
#   designed to feed into gap-analysis.md (a Claude Code prompt).
#
# CREDENTIAL SAFETY GUARANTEE
#   This script NEVER prints, logs, or stores:
#     - GitHub tokens (uses gh's authenticated session; the token is never echoed)
#     - AWS access keys or secret keys (uses sts:GetCallerIdentity, not key listing)
#     - API keys, passwords, OAuth tokens, or any other secret values
#
#   Output WILL contain:
#     - GitHub plan tier, public/private repo counts, team slugs
#     - AWS account IDs, IAM role names + ARNs, OIDC provider URLs
#     - Names of GitHub Environments and Secrets (NEVER values)
#     - Branch protection / ruleset configuration
#     - Workflow file names
#
#   Account IDs and ARNs are not credentials. They are identifiers. If your
#   org policy treats them as sensitive, redact before sharing.
#
# USAGE
#   ./discovery.sh                 # current user only
#   ./discovery.sh ORG             # org-level inventory
#   ./discovery.sh ORG REPO        # repo-level inspection too

set -uo pipefail
ORG="${1:-}"
REPO="${2:-}"
OUT="discovery-$(date -u +%Y%m%dT%H%M%SZ).txt"

# Defensive — explicitly clear any env vars that might leak
unset GH_TOKEN GITHUB_TOKEN AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN 2>/dev/null || true

cat <<EOF | tee "$OUT"
Triarch CI/CD Discovery — $(date -u +%FT%TZ)
================================================

CREDENTIAL SAFETY: This output contains METADATA ONLY.
No tokens, secrets, passwords, or API keys are captured.
Account IDs / ARNs are present (not credentials).
Review before sharing externally.

EOF

section() { echo -e "\n===== $1 =====" | tee -a "$OUT"; }

# ----- Local tooling --------------------------------------------------------
section "Local tooling"
for cmd in gh git tofu terraform aws docker node pre-commit cosign; do
  if command -v "$cmd" >/dev/null 2>&1; then
    printf "%-12s %s\n" "$cmd" "$($cmd --version 2>&1 | head -1)" | tee -a "$OUT"
  else
    printf "%-12s %s\n" "$cmd" "(not installed)" | tee -a "$OUT"
  fi
done

# ----- GitHub ---------------------------------------------------------------
if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then

  section "GitHub: auth state (scopes only — token NEVER printed)"
  gh auth status 2>&1 | grep -v -i "token" | tee -a "$OUT"
  echo "(token line filtered out — gh auth status is authenticated)" | tee -a "$OUT"

  section "GitHub: user"
  gh api user --jq '{login,id,plan:.plan.name}' 2>&1 | tee -a "$OUT"

  section "GitHub: visible orgs"
  gh api user/orgs --jq '.[].login' 2>&1 | tee -a "$OUT"

  if [ -n "$ORG" ]; then
    section "GitHub: org $ORG"
    gh api "orgs/$ORG" --jq '{login,plan:.plan.name,public_repos,total_private_repos,two_factor_requirement_enabled}' 2>&1 | tee -a "$OUT"

    section "GitHub: teams in $ORG"
    gh api "orgs/$ORG/teams" --jq '.[].slug' 2>&1 | tee -a "$OUT"

    section "GitHub: repos in $ORG (top 100, by recency)"
    gh repo list "$ORG" --limit 100 --json name,visibility,isArchived,pushedAt \
      --jq '.[] | "\(.visibility)\t\(.pushedAt)\t\(.name)"' 2>&1 | tee -a "$OUT"

    section "GitHub: org actions policy"
    gh api "orgs/$ORG/actions/permissions" 2>&1 | tee -a "$OUT"
  fi

  if [ -n "$ORG" ] && [ -n "$REPO" ]; then
    section "GitHub: $ORG/$REPO repo settings"
    gh api "repos/$ORG/$REPO" --jq '{visibility, default_branch, allow_squash_merge, allow_merge_commit, allow_rebase_merge, delete_branch_on_merge, allow_auto_merge}' 2>&1 | tee -a "$OUT"

    DEFAULT_BRANCH=$(gh api "repos/$ORG/$REPO" --jq '.default_branch' 2>/dev/null)
    section "GitHub: $ORG/$REPO branch protection on $DEFAULT_BRANCH"
    gh api "repos/$ORG/$REPO/branches/$DEFAULT_BRANCH/protection" 2>&1 | tee -a "$OUT" || echo "(no protection)" | tee -a "$OUT"

    section "GitHub: $ORG/$REPO rulesets"
    gh api "repos/$ORG/$REPO/rulesets" --jq '.[] | {name, enforcement, target}' 2>&1 | tee -a "$OUT"

    section "GitHub: $ORG/$REPO environments (names only)"
    gh api "repos/$ORG/$REPO/environments" --jq '.environments[] | {name, protection_rules}' 2>&1 | tee -a "$OUT"

    section "GitHub: $ORG/$REPO workflow files"
    gh api "repos/$ORG/$REPO/contents/.github/workflows" --jq '.[].name' 2>&1 | tee -a "$OUT"

    section "GitHub: $ORG/$REPO CODEOWNERS errors (empty array = clean)"
    gh api "repos/$ORG/$REPO/codeowners/errors" --jq '.errors' 2>&1 | tee -a "$OUT"

    section "GitHub: $ORG/$REPO secret NAMES per env (values NEVER printed)"
    for env in dev staging prod; do
      echo "--- $env ---" | tee -a "$OUT"
      gh api "repos/$ORG/$REPO/environments/$env/secrets" --jq '.secrets[].name' 2>/dev/null | tee -a "$OUT" || echo "(env $env not configured)" | tee -a "$OUT"
    done

    section "GitHub: $ORG/$REPO repo-level secret NAMES (values NEVER printed)"
    gh secret list --repo "$ORG/$REPO" 2>&1 | awk '{print $1}' | tee -a "$OUT" || true

    section "GitHub: $ORG/$REPO Dependabot config"
    gh api "repos/$ORG/$REPO/contents/.github/dependabot.yml" --jq '.name' 2>&1 | tee -a "$OUT" || echo "(no dependabot.yml)" | tee -a "$OUT"

    section "GitHub: $ORG/$REPO .threatmodel/ presence"
    gh api "repos/$ORG/$REPO/contents/.threatmodel" --jq '.[0].name' 2>&1 | tee -a "$OUT" || echo "(no .threatmodel/)" | tee -a "$OUT"

    section "GitHub: $ORG/$REPO IaC presence (terraform/opentofu files)"
    gh api "repos/$ORG/$REPO/git/trees/$DEFAULT_BRANCH?recursive=1" \
      --jq '.tree[] | select(.path | test("\\.(tf|tofu)$")) | .path' 2>&1 | tee -a "$OUT" || echo "(none found)" | tee -a "$OUT"
  fi
else
  section "GitHub — NOT AUTHENTICATED"
  cat <<EOF | tee -a "$OUT"
gh CLI is not authenticated. Run this in your terminal (browser flow):

  gh auth login --hostname github.com --git-protocol https \\
    --scopes "repo,read:org,workflow"

Then re-run this discovery script. Your token never leaves your machine.
EOF
fi

# ----- AWS (only if authenticated; sts:GetCallerIdentity is metadata, not creds) ----
if command -v aws >/dev/null 2>&1 && aws sts get-caller-identity >/dev/null 2>&1; then

  section "AWS: caller identity (account ID + ARN, no creds)"
  aws sts get-caller-identity 2>&1 | tee -a "$OUT"

  section "AWS: organization (if accessible)"
  aws organizations list-accounts \
    --query 'Accounts[*].{Id:Id,Name:Name,Status:Status}' --output table 2>&1 | tee -a "$OUT"

  section "AWS: existing OIDC providers (URLs only)"
  aws iam list-open-id-connect-providers 2>&1 | tee -a "$OUT"

  section "AWS: existing GitHub Actions roles (any name starts-with 'github')"
  aws iam list-roles \
    --query 'Roles[?starts_with(RoleName, `github`)].{Name:RoleName,Arn:Arn}' \
    --output table 2>&1 | tee -a "$OUT"

  section "AWS: default region"
  aws configure get region 2>&1 | tee -a "$OUT"

  section "AWS: available regions"
  aws ec2 describe-regions --query 'Regions[*].RegionName' --output text 2>&1 | tee -a "$OUT"
else
  section "AWS — NOT AUTHENTICATED (skip if not using AWS)"
  cat <<EOF | tee -a "$OUT"
AWS CLI is not authenticated. Pick the method your org uses, then re-run this script:

  # AWS SSO / IAM Identity Center (recommended)
  aws configure sso       # first-time setup
  aws sso login           # every ~8 hours

  # OR federated via Okta/Entra/Google with your existing tooling
  # (saml2aws, granted, leapp, etc.)

  # OR IAM access key (last resort)
  aws configure
  # Type your access key + secret in YOUR terminal — never paste into chat.

EOF
fi

# ----- GCP (metadata only) ---------------------------------------------------
if command -v gcloud >/dev/null 2>&1 && gcloud auth list --format='value(account)' 2>/dev/null | grep -q '@'; then
  section "GCP: active account (email only, not creds)"
  gcloud auth list --format='value(account)' 2>&1 | tee -a "$OUT"

  section "GCP: projects"
  gcloud projects list --format='value(projectId,name,projectNumber)' 2>&1 | tee -a "$OUT"

  section "GCP: workload identity pools (global)"
  gcloud iam workload-identity-pools list --location=global --format='value(name,state)' 2>&1 | tee -a "$OUT" || echo "(none or no permission)" | tee -a "$OUT"
elif command -v gcloud >/dev/null 2>&1; then
  section "GCP — NOT AUTHENTICATED (skip if not using GCP)"
  cat <<EOF | tee -a "$OUT"
gcloud CLI installed but not authenticated. Run:

  gcloud auth login                              # browser flow
  gcloud config set project YOUR_PROJECT_ID
  gcloud auth application-default login          # for Terraform / SDKs

Then re-run this script.
EOF
fi

# ----- Firebase (metadata only) ---------------------------------------------
if command -v firebase >/dev/null 2>&1; then
  if firebase projects:list 2>/dev/null | head -1 | grep -q -i project; then
    section "Firebase: projects"
    firebase projects:list 2>&1 | tee -a "$OUT"
  else
    section "Firebase — NOT AUTHENTICATED (skip if not using Firebase)"
    cat <<EOF | tee -a "$OUT"
firebase CLI installed but not authenticated. Run:

  firebase login                                 # browser flow

Then re-run this script.
EOF
  fi
fi

# ----- Azure (metadata only) ------------------------------------------------
if command -v az >/dev/null 2>&1; then
  if az account show >/dev/null 2>&1; then
    section "Azure: account (subscription + tenant, not creds)"
    az account show --query '{name:name, id:id, tenantId:tenantId, user:user.name}' 2>&1 | tee -a "$OUT"
  else
    section "Azure — NOT AUTHENTICATED (skip if not using Azure)"
    cat <<EOF | tee -a "$OUT"
az CLI installed but not authenticated. Run:

  az login                                       # browser flow
  az account set --subscription "Subscription Name or ID"

Then re-run this script.
EOF
  fi
fi

cat <<EOF | tee -a "$OUT"

================================================
Done. Saved to: $OUT

Next:
  1. Review this file. Account IDs / ARNs are present — redact if your org treats those as sensitive.
  2. Hand it to Claude Code along with gap-analysis.md:
       "Run gap-analysis.md against $OUT for ORG/REPO"
  3. Claude Code produces a Triarch-branded HTML report scoring each item.
  4. Then hand deploy.md to Claude Code to walk through fixing each gap.

REMINDER: this script never captured any credentials. If anything in the output
looks like a token or secret value, that's a bug — please report it.
EOF
