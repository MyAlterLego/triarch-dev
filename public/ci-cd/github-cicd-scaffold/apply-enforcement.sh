#!/usr/bin/env bash
# apply-enforcement.sh
#
# Tightens main-branch rulesets across the Triarch portfolio so PRs to main MUST
# come from dev/release-*/hotfix-* (enforced by the enforce-pr-source.yml workflow
# which posts the `source-check` status check).
#
# Run this AFTER every engineering repo has merged its workflow PR — that PR adds
# the workflow file to main. Before the file is on main, requiring `source-check`
# would block all PRs because the check would never run.
#
# Usage:
#   ./apply-enforcement.sh              # apply
#   ./apply-enforcement.sh --dry-run    # preview
#
# Idempotent: re-running on a repo that already has source-check in its ruleset
# is a no-op (the dedup happens before PATCH).

set -Eeuo pipefail
trap 'echo "ERROR on line $LINENO" >&2' ERR

DRY_RUN=0
for a in "$@"; do
  case "$a" in
    --dry-run) DRY_RUN=1 ;;
    *) echo "Unknown arg: $a" >&2; exit 2 ;;
  esac
done

command -v gh >/dev/null  || { echo "missing: gh"; exit 1; }
command -v jq >/dev/null  || { echo "missing: jq"; exit 1; }
gh auth status >/dev/null

# Engineering repos: have dev → main flow, need source-check enforcement
ENG_REPOS=(
  triarchsecurity/platform
  triarchsecurity/security-admin
  triarchsecurity/security-portal
  triarchsecurity/tmi
  triarchsecurity/dev-portal
  triarchsecurity/darksouls
  triarchsecurity/truthtreason
)

# Library / MCP repos: single-branch (no dev), just need basic main protection
LIB_REPOS=(
  triarchsecurity/shared-workflows
  triarchsecurity/shared-ui
  triarchsecurity/shared-utils
  triarchsecurity/secrets
  MyAlterLego/triarch-admin-mcp
  MyAlterLego/triarch-dev-mcp
)

run_gh() {
  if [[ $DRY_RUN -eq 1 ]]; then
    echo "DRY-RUN: gh $*"
    return 0
  fi
  gh "$@"
}

# ---------- engineering repos: add source-check to existing main ruleset ------

for repo in "${ENG_REPOS[@]}"; do
  echo ""
  echo "=== $repo (engineering) ==="

  # Find the main-protection ruleset on this repo (any name containing 'main-protection')
  rs_id=$(gh api "repos/$repo/rulesets" --jq '.[] | select(.name | test("main-protection")) | .id' | head -1)
  if [[ -z "$rs_id" ]]; then
    echo "  WARN: no main-protection ruleset found — skipping (run scaffold bootstrap first)"
    continue
  fi

  # Pull current ruleset, check if source-check already present
  existing=$(gh api "repos/$repo/rulesets/$rs_id")
  has_check=$(echo "$existing" | jq -r '[.rules[] | select(.type=="required_status_checks") | .parameters.required_status_checks[]?.context] | any(. == "source-check")')

  if [[ "$has_check" == "true" ]]; then
    echo "  ✓ source-check already required — no-op"
    continue
  fi

  # Build patched rules: add source-check to required_status_checks if it exists,
  # else add a fresh required_status_checks rule with just source-check.
  patched=$(echo "$existing" | jq '
    .rules = (
      if any(.rules[]; .type=="required_status_checks") then
        .rules | map(
          if .type=="required_status_checks" then
            .parameters.required_status_checks = ([{"context":"source-check"}] + .parameters.required_status_checks)
          else . end
        )
      else
        .rules + [{
          "type":"required_status_checks",
          "parameters":{
            "strict_required_status_checks_policy": false,
            "required_status_checks":[{"context":"source-check"}]
          }
        }]
      end
    )
    | {name, target, enforcement, bypass_actors, conditions, rules}
  ')

  if [[ $DRY_RUN -eq 1 ]]; then
    echo "  DRY-RUN: PATCH repos/$repo/rulesets/$rs_id (would add source-check)"
  else
    echo "$patched" | gh api -X PUT "repos/$repo/rulesets/$rs_id" --input - >/dev/null
    echo "  ✓ source-check added to ruleset $rs_id"
  fi
done

# ---------- library repos: ensure basic main protection ------------------------

for repo in "${LIB_REPOS[@]}"; do
  echo ""
  echo "=== $repo (library) ==="

  # Does it have a main ruleset already?
  rs_id=$(gh api "repos/$repo/rulesets" --jq '.[] | select(.name | test("main-protection")) | .id' | head -1 || true)
  if [[ -n "$rs_id" ]]; then
    echo "  ✓ already has main-protection ruleset ($rs_id) — leaving alone"
    continue
  fi

  # No ruleset → create a basic one (PR required + deletion/force-push blocked, no
  # source-check because libraries don't have dev branches)
  payload='{
    "name": "main-protection-basic",
    "target": "branch",
    "enforcement": "active",
    "bypass_actors": [],
    "conditions": { "ref_name": { "include": ["refs/heads/main"], "exclude": [] } },
    "rules": [
      { "type": "deletion" },
      { "type": "non_fast_forward" },
      {
        "type": "pull_request",
        "parameters": {
          "required_approving_review_count": 0,
          "dismiss_stale_reviews_on_push": true,
          "require_code_owner_review": false,
          "require_last_push_approval": false,
          "required_review_thread_resolution": true
        }
      }
    ]
  }'

  if [[ $DRY_RUN -eq 1 ]]; then
    echo "  DRY-RUN: POST repos/$repo/rulesets (would create main-protection-basic)"
  else
    echo "$payload" | gh api -X POST "repos/$repo/rulesets" --input - >/dev/null
    echo "  ✓ created main-protection-basic ruleset"
  fi
done

echo ""
echo "Done."
