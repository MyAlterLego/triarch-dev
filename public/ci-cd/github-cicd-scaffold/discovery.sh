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

    # GHAS probe — detects whether the framework's ci.yml needs the GHAS-aware
    # variant. The default-setup endpoint returns 403 with "Advanced Security
    # must be enabled" when GHAS is unavailable on a private repo. Public repos
    # get GHAS features (code scanning, secret scanning) free, so 200 there
    # confirms availability.
    section "GitHub: $ORG/$REPO GHAS state (Advanced Security availability)"
    GHAS_PROBE=$(gh api "repos/$ORG/$REPO/code-scanning/default-setup" 2>&1)
    if echo "$GHAS_PROBE" | grep -q "Advanced Security must be enabled"; then
      echo "ghas: NOT AVAILABLE" | tee -a "$OUT"
      echo "(this repo is private and the org does not have GHAS — the framework's ci.yml" | tee -a "$OUT"
      echo " must be applied with security-events:write COMMENTED OUT and continue-on-error:true" | tee -a "$OUT"
      echo " on each upload-sarif step, otherwise the workflow is rejected at scheduling)" | tee -a "$OUT"
    elif echo "$GHAS_PROBE" | grep -q "state"; then
      echo "ghas: AVAILABLE" | tee -a "$OUT"
      echo "$GHAS_PROBE" | head -3 | tee -a "$OUT"
    else
      echo "ghas: UNKNOWN — probe returned:" | tee -a "$OUT"
      echo "$GHAS_PROBE" | head -3 | tee -a "$OUT"
    fi

    # Plan-tier capability inference (read-only — no state change).
    # The framework assumes Team (or higher) as the baseline. Free + private is
    # the degraded-fallback path: branch protection, rulesets, AND
    # environments-with-reviewers are all blocked there. The 2020 "branch
    # protection became free" change applies to PERSONAL Free accounts, NOT
    # org Free. Public repos under any plan have full pipeline-gate features.
    section "GitHub: $ORG/$REPO plan-tier capability inference"
    PLAN_TIER=$(gh api "orgs/$ORG" --jq '.plan.name' 2>/dev/null)
    VIS=$(gh api "repos/$ORG/$REPO" --jq '.visibility' 2>/dev/null)
    echo "plan=$PLAN_TIER visibility=$VIS" | tee -a "$OUT"
    if [ "$PLAN_TIER" = "free" ] && [ "$VIS" = "private" ]; then
      echo "capability: BRANCH PROTECTION + RULESETS + PROTECTED ENVIRONMENTS = BLOCKED (degraded-fallback path)" | tee -a "$OUT"
      echo "(R-4, C-1, C-4, C-5, C-8 cannot be enforced on this repo without plan upgrade)" | tee -a "$OUT"
      echo "(deploy.md routes this to file-only remediations: CODEOWNERS, Dependabot, threat-model, ci-lite.yml)" | tee -a "$OUT"
    elif [ "$PLAN_TIER" = "free" ] && [ "$VIS" = "public" ]; then
      echo "capability: ALL FEATURES AVAILABLE (public repo on Free has full GitHub feature set)" | tee -a "$OUT"
    elif [ "$PLAN_TIER" = "team" ] || [ "$PLAN_TIER" = "business" ] || [ "$PLAN_TIER" = "enterprise" ]; then
      echo "capability: ALL FEATURES AVAILABLE (Team/Business/Enterprise — framework's baseline path)" | tee -a "$OUT"
      echo "(branch protection, rulesets, environments-with-reviewers, signed commits, linear history all enforceable)" | tee -a "$OUT"
    else
      echo "capability: plan tier '$PLAN_TIER' — assuming all features available (verify before applying ruleset)" | tee -a "$OUT"
    fi

    section "GitHub: $ORG/$REPO environments (names only)"
    gh api "repos/$ORG/$REPO/environments" --jq '.environments[] | {name, protection_rules}' 2>&1 | tee -a "$OUT"

    section "GitHub: $ORG/$REPO workflow files"
    gh api "repos/$ORG/$REPO/contents/.github/workflows" --jq '.[].name' 2>&1 | tee -a "$OUT"

    # Promotion-flow probe — added 2026-05-15. The framework's SMB-CICD-Framework.md and
    # firebase-2env-pattern.md prescribe a non-default promotion branch (dev or staging)
    # with a verify-dev-deployed CI gate so prod can only deploy commits that already
    # baked on the dev backend. The previous gap-analysis only scored branch protection
    # on the default branch and missed cases where main was protected but no dev branch
    # existed (security-admin shape: PRs land straight on main with no dev path).
    section "GitHub: $ORG/$REPO promotion-flow state (dev/staging branch + gate jobs)"
    PROMOTION_BRANCH=""
    for cand in dev staging; do
      if gh api "repos/$ORG/$REPO/branches/$cand" --silent >/dev/null 2>&1; then
        PROMOTION_BRANCH="$cand"
        echo "promotion_branch: $cand (exists on origin)" | tee -a "$OUT"
        gh api "repos/$ORG/$REPO/branches/$cand/protection" --jq '{required_pull_request_reviews:.required_pull_request_reviews.required_approving_review_count, restrict_pushes:.restrictions != null, signatures:.required_signatures.enabled}' 2>&1 | tee -a "$OUT" || echo "  (no protection on $cand)" | tee -a "$OUT"
        break
      fi
    done
    if [ -z "$PROMOTION_BRANCH" ]; then
      echo "promotion_branch: NONE — neither origin/dev nor origin/staging exists" | tee -a "$OUT"
      echo "(R-7 fails — without a promotion branch, all merges go straight to the default branch)" | tee -a "$OUT"
    fi

    # C-14 probe — is the promotion branch protected from deletion?
    if [ -n "$PROMOTION_BRANCH" ]; then
      DEV_RULESET_PROTECTED=0
      for rid in $(gh api "repos/$ORG/$REPO/rulesets" --jq '.[].id' 2>/dev/null); do
        rs_json=$(gh api "repos/$ORG/$REPO/rulesets/$rid" 2>/dev/null)
        covers=$(printf '%s' "$rs_json" | jq -r --arg ref "refs/heads/$PROMOTION_BRANCH" '.conditions.ref_name.include // [] | index($ref)' 2>/dev/null)
        has_deletion=$(printf '%s' "$rs_json" | jq -r '[.rules[].type] | index("deletion")' 2>/dev/null)
        if [ "$covers" != "null" ] && [ "$has_deletion" != "null" ]; then
          DEV_RULESET_PROTECTED=1
          break
        fi
      done
      AUTO_DELETE=$(gh api "repos/$ORG/$REPO" --jq '.delete_branch_on_merge' 2>/dev/null)
      echo "C-14 promotion_branch_protected_from_deletion=$DEV_RULESET_PROTECTED auto_delete_on_merge=$AUTO_DELETE" | tee -a "$OUT"
      if [ "$DEV_RULESET_PROTECTED" -eq 0 ] && [ "$AUTO_DELETE" = "true" ]; then
        echo "(C-14 fails — delete_branch_on_merge is true and no ruleset protects the promotion branch; every dev→main merge will silently delete origin/$PROMOTION_BRANCH)" | tee -a "$OUT"
      fi
    fi

    # C-15 probe — is merge-commit method actually mergeable to main?
    ALLOW_MERGE_COMMIT=$(gh api "repos/$ORG/$REPO" --jq '.allow_merge_commit' 2>/dev/null)
    LEGACY_LINEAR=$(gh api "repos/$ORG/$REPO/branches/$DEFAULT_BRANCH/protection" --jq '.required_linear_history.enabled // false' 2>/dev/null)
    RULESET_LINEAR=0
    for rid in $(gh api "repos/$ORG/$REPO/rulesets" --jq '.[].id' 2>/dev/null); do
      rs_json=$(gh api "repos/$ORG/$REPO/rulesets/$rid" 2>/dev/null)
      covers_main=$(printf '%s' "$rs_json" | jq -r --arg ref "refs/heads/$DEFAULT_BRANCH" '.conditions.ref_name.include // [] | index($ref)' 2>/dev/null)
      has_linear=$(printf '%s' "$rs_json" | jq -r '[.rules[].type] | index("required_linear_history")' 2>/dev/null)
      if [ "$covers_main" != "null" ] && [ "$has_linear" != "null" ]; then
        RULESET_LINEAR=1
        break
      fi
    done
    echo "C-15 allow_merge_commit=$ALLOW_MERGE_COMMIT legacy_linear_history=$LEGACY_LINEAR ruleset_linear_history=$RULESET_LINEAR" | tee -a "$OUT"
    if [ "$ALLOW_MERGE_COMMIT" != "true" ] || [ "$LEGACY_LINEAR" = "true" ] || [ "$RULESET_LINEAR" -eq 1 ]; then
      echo "(C-15 fails — dev→main can't use merge-commit. Squash will create a new SHA that fails verify-dev-deployed's ancestry check.)" | tee -a "$OUT"
    fi

    # Per-workflow: extract on.push.branches and on.pull_request.branches, plus job-name fingerprints
    # for verify-dev-deployed / gate-prod-version. These are framework-prescribed and the gap-analysis
    # validators (R-8, C-12, C-13) read this section.
    section "GitHub: $ORG/$REPO workflow promotion-gate fingerprints"
    WFLIST=$(gh api "repos/$ORG/$REPO/contents/.github/workflows" --jq '.[] | select(.name | test("\\.(yml|yaml)$")) | .name' 2>/dev/null)
    if [ -z "$WFLIST" ]; then
      echo "(no workflow files)" | tee -a "$OUT"
    else
      ANY_DEV_TRIGGER=0
      ANY_VERIFY_DEV=0
      ANY_GATE_PROD_VERSION=0
      while IFS= read -r wf; do
        [ -z "$wf" ] && continue
        body=$(gh api "repos/$ORG/$REPO/contents/.github/workflows/$wf" --jq '.content' 2>/dev/null | base64 -d 2>/dev/null || echo "")
        push_branches=$(printf '%s' "$body" | awk '/^on:/,/^[a-zA-Z]/' | awk '/push:/,/pull_request:|workflow_/' | grep -oE "(main|dev|staging|master|release/[*][*]|hotfix/[*][*])" | sort -u | tr '\n' ',' | sed 's/,$//')
        pr_branches=$(printf '%s' "$body" | awk '/pull_request:/,/^[a-zA-Z_]+:/' | grep -oE "(main|dev|staging|master)" | sort -u | tr '\n' ',' | sed 's/,$//')
        # Strip comments before fingerprinting so a `# TODO add gate-prod-version` line
        # doesn't read as a present gate. We look for two canonical shapes:
        #   1. job declaration:  `^  verify-dev-deployed:` (or _underscore variant)
        #   2. shared-workflow uses ref: `uses: .../verify-dev-deployed.yml@...`
        body_nocomments=$(printf '%s' "$body" | sed 's/#.*$//')
        has_verify_dev=$(printf '%s' "$body_nocomments" | grep -cE "(^[[:space:]]+verify[-_]dev[-_]deployed:|uses:.*verify[-_]dev[-_]deployed\.ya?ml)" || true)
        has_gate_prod_ver=$(printf '%s' "$body_nocomments" | grep -cE "(^[[:space:]]+gate[-_]prod[-_]version:|uses:.*gate[-_]prod[-_]version\.ya?ml)" || true)
        has_env_select=$(printf '%s' "$body_nocomments" | grep -cE "^[[:space:]]+env-select:" || true)
        echo "$wf: push=[${push_branches:-none}] pr=[${pr_branches:-none}] verify-dev-deployed=$has_verify_dev gate-prod-version=$has_gate_prod_ver env-select=$has_env_select" | tee -a "$OUT"
        if printf '%s' ",$push_branches,$pr_branches," | grep -qE ",(dev|staging),"; then
          ANY_DEV_TRIGGER=1
        fi
        [ "$has_verify_dev" -gt 0 ] && ANY_VERIFY_DEV=1
        [ "$has_gate_prod_ver" -gt 0 ] && ANY_GATE_PROD_VERSION=1
      done <<< "$WFLIST"
      echo "SUMMARY: any_workflow_listens_on_dev_or_staging=$ANY_DEV_TRIGGER verify_dev_deployed_present=$ANY_VERIFY_DEV gate_prod_version_present=$ANY_GATE_PROD_VERSION" | tee -a "$OUT"
      [ "$ANY_DEV_TRIGGER" -eq 0 ] && echo "(R-8 fails — no workflow triggers on a non-default branch; promotion gate has no entry point)" | tee -a "$OUT"
      [ "$ANY_VERIFY_DEV" -eq 0 ] && echo "(C-12 fails — no verify-dev-deployed job; prod can deploy commits never seen by dev)" | tee -a "$OUT"
      [ "$ANY_GATE_PROD_VERSION" -eq 0 ] && echo "(C-13 fails — no gate-prod-version job; version-invariants on prod promotion not enforced)" | tee -a "$OUT"
    fi

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

    # Workflow-success-rate probe — detects "ci.yml present but never succeeds"
    # (the symptom of shipping the wrong variant of the framework). If ci.yml
    # exists but has 0 successful runs in its last 20, the deploy.md applier
    # likely shipped ci-full.yml on a repo that should have gotten ci-lite.yml.
    section "GitHub: $ORG/$REPO ci.yml health (last 20 runs)"
    if gh api "repos/$ORG/$REPO/contents/.github/workflows/ci.yml" >/dev/null 2>&1; then
      TOTAL=$(gh run list --repo "$ORG/$REPO" --workflow ci.yml --limit 20 --json conclusion --jq 'length' 2>/dev/null || echo 0)
      SUCCESS=$(gh run list --repo "$ORG/$REPO" --workflow ci.yml --limit 20 --json conclusion --jq '[.[] | select(.conclusion=="success")] | length' 2>/dev/null || echo 0)
      FAILURE=$(gh run list --repo "$ORG/$REPO" --workflow ci.yml --limit 20 --json conclusion --jq '[.[] | select(.conclusion=="failure")] | length' 2>/dev/null || echo 0)
      echo "ci.yml runs: total=$TOTAL success=$SUCCESS failure=$FAILURE" | tee -a "$OUT"
      if [ "$TOTAL" -gt 0 ] && [ "$SUCCESS" -eq 0 ]; then
        echo "ci.yml-health: WORKFLOW NEVER SUCCEEDS — likely shipped wrong variant" | tee -a "$OUT"
        echo "(if you applied the framework's ci.yml: replace with ci-lite.yml)" | tee -a "$OUT"
        echo "(see deploy.md §5/R-2 decision tree for which variant fits this repo)" | tee -a "$OUT"
      elif [ "$TOTAL" -eq 0 ]; then
        echo "ci.yml-health: workflow file present but no runs yet — push or PR will trigger" | tee -a "$OUT"
      fi
    else
      echo "ci.yml not present in repo — see deploy.md §5/R-2 to choose lite vs full" | tee -a "$OUT"
    fi
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
