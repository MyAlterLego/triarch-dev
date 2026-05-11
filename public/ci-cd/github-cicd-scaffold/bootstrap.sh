#!/usr/bin/env bash
# bootstrap.sh — idempotent setup of GitHub repo + environments + secrets + ruleset.
# Read README.md §3 before running.
#
# Usage:
#   ./bootstrap.sh              # standard run
#   ./bootstrap.sh --dry-run    # print what would happen, change nothing
#   ./bootstrap.sh --apply-org-policy   # also set org-level allowed-actions policy

set -Eeuo pipefail
trap 'echo "ERROR on line $LINENO" >&2' ERR

DRY_RUN=0
APPLY_ORG_POLICY=0
for a in "$@"; do
  case "$a" in
    --dry-run) DRY_RUN=1 ;;
    --apply-org-policy) APPLY_ORG_POLICY=1 ;;
    *) echo "Unknown arg: $a" >&2; exit 2 ;;
  esac
done

run() {
  if [[ $DRY_RUN -eq 1 ]]; then
    echo "DRY-RUN: $*"
  else
    eval "$@"
  fi
}

# ---------- 1. preconditions ---------------------------------------------------

[[ -f bootstrap.config.env ]] || { echo "Create bootstrap.config.env first (see README §3)"; exit 1; }
# shellcheck disable=SC1091
source bootstrap.config.env

: "${GITHUB_ORG:?}"; : "${GITHUB_REPO:?}"; : "${DEFAULT_BRANCH:=main}"
: "${AWS_ACCOUNT_ID_DEV:?}"; : "${AWS_ACCOUNT_ID_STAGING:?}"; : "${AWS_ACCOUNT_ID_PROD:?}"
: "${AWS_REGION:?}"
: "${TEAM_ENG:=engineering}"; : "${TEAM_RELEASE_MANAGERS:=release-managers}"; : "${TEAM_SECURITY:=security}"
: "${CREATE_TEAMS:=0}"

for cmd in gh git jq tofu; do
  command -v "$cmd" >/dev/null || { echo "missing: $cmd"; exit 1; }
done

gh auth status >/dev/null || { echo "Run: gh auth login --scopes 'repo,workflow,admin:org,write:packages'"; exit 1; }

REPO="${GITHUB_ORG}/${GITHUB_REPO}"
echo "==> Bootstrapping ${REPO}"

# ---------- 2. ensure repo exists ---------------------------------------------

if ! gh repo view "${REPO}" >/dev/null 2>&1; then
  echo "==> Repo does not exist; creating private repo"
  run "gh repo create '${REPO}' --private --disable-wiki --confirm"
fi

# ---------- 3. teams -----------------------------------------------------------

if [[ "${CREATE_TEAMS}" == "1" ]]; then
  for slug in "${TEAM_ENG}" "${TEAM_RELEASE_MANAGERS}" "${TEAM_SECURITY}"; do
    if ! gh api "orgs/${GITHUB_ORG}/teams/${slug}" >/dev/null 2>&1; then
      echo "==> Creating team ${slug}"
      run "gh api -X POST 'orgs/${GITHUB_ORG}/teams' -f name='${slug}' -f privacy=closed"
    fi
  done
fi

# Grant teams access to the repo
for slug in "${TEAM_ENG}" "${TEAM_RELEASE_MANAGERS}" "${TEAM_SECURITY}"; do
  perm="push"
  [[ "$slug" == "${TEAM_RELEASE_MANAGERS}" || "$slug" == "${TEAM_SECURITY}" ]] && perm="maintain"
  run "gh api -X PUT 'orgs/${GITHUB_ORG}/teams/${slug}/repos/${REPO}' -f permission=${perm}"
done

# ---------- 4. repository settings --------------------------------------------

echo "==> Applying repository settings"
run "gh api -X PATCH 'repos/${REPO}' \
  -F allow_squash_merge=true \
  -F allow_merge_commit=false \
  -F allow_rebase_merge=false \
  -F delete_branch_on_merge=true \
  -F allow_auto_merge=true \
  -F has_issues=true \
  -F has_projects=false \
  -F has_wiki=false \
  -F default_branch=${DEFAULT_BRANCH}"

# Vulnerability alerts + automated security fixes
run "gh api -X PUT 'repos/${REPO}/vulnerability-alerts'"
run "gh api -X PUT 'repos/${REPO}/automated-security-fixes'"

# ---------- 5. branch ruleset (two-phase: baseline now, lite after ci runs) ----
#
# PHASE 1 (this script): apply main-protection-baseline.json
#   Rules: deletion + non_fast_forward + required_linear_history + pull_request.
#   NO required_status_checks → safe to apply on day-1, before ci-lite.yml has
#   run on main even once. Won't block merges on missing check names.
#
# PHASE 2 (manual, after ci-lite.yml has run on main once → check names register):
#   Upgrade to main-protection-lite.json (for standalone ci-lite callers) OR
#   main-protection-lite-callers.json (for shared-workflows quality-gate callers).
#   Command printed at the end of this script. See deploy.md §5/R-4 for context.
#
# Earlier framework versions used main-protection.json (full-fat: required_signatures
# + 7 required_status_checks). That blocks PRs on the named checks even when the
# producing workflows aren't on main yet — the foot-gun this two-phase model avoids.

echo "==> Applying baseline ruleset to ${DEFAULT_BRANCH}"
RULESET_JSON=".github/rulesets/main-protection-baseline.json"

# Render ruleset with the customer's actual default-branch substituted
TMP_RULESET=$(mktemp)
jq --arg branch "refs/heads/${DEFAULT_BRANCH}" \
   '.conditions.ref_name.include = [$branch]' \
   "$RULESET_JSON" > "$TMP_RULESET"

# Delete any existing ruleset of the same name, then create fresh (idempotent)
EXISTING=$(gh api "repos/${REPO}/rulesets" --jq ".[] | select(.name==\"main-protection-baseline\") | .id" 2>/dev/null || true)
if [[ -n "$EXISTING" ]]; then
  run "gh api -X DELETE 'repos/${REPO}/rulesets/${EXISTING}'"
fi
run "gh api -X POST 'repos/${REPO}/rulesets' --input '${TMP_RULESET}'"

echo ""
echo "==> Phase 1 baseline ruleset applied."
echo "    After ci-lite.yml has run on ${DEFAULT_BRANCH} at least once,"
echo "    upgrade to lite for required-status-check enforcement:"
echo ""
echo "      OLD_ID=\$(gh api repos/${REPO}/rulesets --jq '.[] | select(.name==\"main-protection-baseline\") | .id')"
echo "      gh api -X DELETE repos/${REPO}/rulesets/\$OLD_ID"
echo "      gh api -X POST   repos/${REPO}/rulesets --input .github/rulesets/main-protection-lite.json"
echo ""

# ---------- 6. environments ---------------------------------------------------

create_env() {
  local env="$1"
  local reviewers_json="$2"
  local wait_timer="$3"
  local can_admin_bypass="$4"   # true / false
  local prevent_self_review="$5"  # true / false
  local custom_branch_policies_json="$6"

  echo "==> Creating environment: $env"
  run "gh api -X PUT 'repos/${REPO}/environments/${env}' \
    --input - <<JSON
{
  \"wait_timer\": ${wait_timer},
  \"prevent_self_review\": ${prevent_self_review},
  \"reviewers\": ${reviewers_json},
  \"deployment_branch_policy\": ${custom_branch_policies_json}
}
JSON"
}

# Resolve team IDs
ENG_ID=$(gh api "orgs/${GITHUB_ORG}/teams/${TEAM_ENG}" -q .id 2>/dev/null || echo null)
RM_ID=$(gh api "orgs/${GITHUB_ORG}/teams/${TEAM_RELEASE_MANAGERS}" -q .id 2>/dev/null || echo null)

# dev: no reviewers, branch=main only, no wait
create_env "dev" "[]" 0 "true" "false" \
  '{"protected_branches": false, "custom_branch_policies": true}'

# staging: 1 reviewer (eng team), 5-min wait, prevent self-review
create_env "staging" "[{\"type\":\"Team\",\"id\":${ENG_ID}}]" 5 "false" "true" \
  '{"protected_branches": false, "custom_branch_policies": true}'

# prod: 2 reviewers (release managers + eng), 30-min wait, prevent self-review, tags only
create_env "prod" "[{\"type\":\"Team\",\"id\":${RM_ID}},{\"type\":\"Team\",\"id\":${ENG_ID}}]" 30 "false" "true" \
  '{"protected_branches": false, "custom_branch_policies": true}'

# Branch/tag policies
echo "==> Setting deployment branch policies"
run "gh api -X POST 'repos/${REPO}/environments/dev/deployment-branch-policies' -f name='${DEFAULT_BRANCH}'"
run "gh api -X POST 'repos/${REPO}/environments/staging/deployment-branch-policies' -f name='${DEFAULT_BRANCH}'"
run "gh api -X POST 'repos/${REPO}/environments/staging/deployment-branch-policies' -f name='v*' -f type='tag'"
run "gh api -X POST 'repos/${REPO}/environments/prod/deployment-branch-policies' -f name='v*' -f type='tag'"

# ---------- 7. environment secrets --------------------------------------------

echo "==> Setting environment secrets"

OIDC_OUT="bootstrap.oidc.outputs.json"
if [[ ! -f "$OIDC_OUT" ]]; then
  echo "WARN: $OIDC_OUT not found. Did you run 'tofu apply' in iac/github-oidc-aws? Skipping AWS secrets."
else
  ROLE_DEV=$(jq -r '.dev_role_arn.value' "$OIDC_OUT")
  ROLE_STG=$(jq -r '.staging_role_arn.value' "$OIDC_OUT")
  ROLE_PRD=$(jq -r '.prod_role_arn.value' "$OIDC_OUT")

  for env in dev:"$ROLE_DEV" staging:"$ROLE_STG" prod:"$ROLE_PRD"; do
    name="${env%%:*}"; arn="${env##*:}"
    run "gh secret set AWS_DEPLOY_ROLE_ARN --env '${name}' --repo '${REPO}' --body '${arn}'"
    run "gh secret set AWS_REGION          --env '${name}' --repo '${REPO}' --body '${AWS_REGION}'"
  done
fi

# Stub all the optional secrets so workflows don't fail with "secret not found"
for env in dev staging prod; do
  for s in WORKOS_API_KEY AUTH0_CLIENT_ID AUTH0_CLIENT_SECRET GRAFANA_CLOUD_TOKEN SLACK_WEBHOOK_URL; do
    if ! gh secret list --env "$env" --repo "${REPO}" --json name -q ".[].name" 2>/dev/null | grep -qx "$s"; then
      run "gh secret set ${s} --env '${env}' --repo '${REPO}' --body 'PLACEHOLDER_REPLACE_ME'"
    fi
  done
done

# Prod-only
run "gh secret set CHANGE_TICKET_PREFIX --env 'prod' --repo '${REPO}' --body '${CHANGE_TICKET_PREFIX:-CHG-}'"

# ---------- 8. Dependabot --------------------------------------------------------

# The .github/dependabot.yml is committed; ensure security updates are enabled (they default to on).
echo "==> Dependabot configuration committed in .github/dependabot.yml"

# ---------- 9. (optional) org-level allowed-actions policy --------------------

if [[ $APPLY_ORG_POLICY -eq 1 ]]; then
  echo "==> Applying org-level allowed-actions policy"
  run "gh api -X PUT 'orgs/${GITHUB_ORG}/actions/permissions' \
    -F enabled_repositories=all \
    -F allowed_actions=selected"

  run "gh api -X PUT 'orgs/${GITHUB_ORG}/actions/permissions/selected-actions' \
    -F github_owned_allowed=true \
    -F verified_allowed=false \
    -F patterns_allowed[]='semgrep/*@*' \
    -F patterns_allowed[]='aquasecurity/*@*' \
    -F patterns_allowed[]='anchore/*@*' \
    -F patterns_allowed[]='google/osv-scanner-action@*' \
    -F patterns_allowed[]='gitleaks/gitleaks-action@*' \
    -F patterns_allowed[]='bridgecrewio/checkov-action@*' \
    -F patterns_allowed[]='sigstore/cosign-installer@*' \
    -F patterns_allowed[]='slsa-framework/*@*' \
    -F patterns_allowed[]='hashicorp/setup-terraform@*' \
    -F patterns_allowed[]='opentofu/setup-opentofu@*'"
fi

# ---------- 10. summary --------------------------------------------------------

cat <<EOF

==============================================================================
DONE.

Next:
  1. Create a feature branch and push these files:
       git checkout -b chore/scaffold
       git add .
       git commit -S -m "chore: scaffold CI/CD pipeline"
       git push -u origin chore/scaffold
       gh pr create --fill --base ${DEFAULT_BRANCH}
  2. Watch the CI run: gh run watch
  3. Replace PLACEHOLDER_REPLACE_ME secrets with real values when needed:
       gh secret set WORKOS_API_KEY --env staging --body 'sk_...' --repo ${REPO}
==============================================================================
EOF
