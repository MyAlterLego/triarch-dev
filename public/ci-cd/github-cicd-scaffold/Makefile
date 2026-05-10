## Day-2 ops.
## All targets are idempotent. Most wrap `gh` CLI.

REPO ?= $(shell gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null)
ENV  ?= dev
TAG  ?=

.PHONY: help install bootstrap pin-actions verify-prod rotate-workos rotate-grafana waivers dr-drill cost-check audit-export

help:
	@echo "Targets:"
	@echo "  install         install local pre-commit hooks"
	@echo "  bootstrap       run ./bootstrap.sh"
	@echo "  pin-actions     pin all third-party Actions to commit SHAs"
	@echo "  verify-prod     verify cosign signature + SLSA on a tag (TAG=v1.4.0)"
	@echo "  rotate-workos   rotate WorkOS API key for ENV=dev|staging|prod"
	@echo "  rotate-grafana  rotate Grafana Cloud token for ENV"
	@echo "  waivers         list active security waivers"
	@echo "  dr-drill        run the DR drill workflow"
	@echo "  cost-check      run the nightly cost-guardrail manually"
	@echo "  audit-export    export last 30d of deploys to JSON"

install:
	pre-commit install -t pre-commit -t commit-msg -t pre-push

bootstrap:
	./bootstrap.sh

pin-actions:
	@command -v pinact >/dev/null || (echo "Install: go install github.com/suzuki-shunsuke/pinact/cmd/pinact@latest" && exit 1)
	pinact run -u
	@echo "Review the diff, then commit."

verify-prod:
	@[[ -n "$(TAG)" ]] || (echo "Pass TAG=v1.4.0"; exit 1)
	@IMG=ghcr.io/$(REPO):$(TAG); \
	cosign verify \
	  --certificate-identity-regexp "^https://github.com/$(REPO)/" \
	  --certificate-oidc-issuer "https://token.actions.githubusercontent.com" $$IMG && \
	cosign verify-attestation --type slsaprovenance \
	  --certificate-identity-regexp "^https://github.com/$(REPO)/" \
	  --certificate-oidc-issuer "https://token.actions.githubusercontent.com" $$IMG

rotate-workos:
	@read -rp "Paste new WorkOS API key for ENV=$(ENV): " key; \
	gh secret set WORKOS_API_KEY --env $(ENV) --repo $(REPO) --body "$$key"
	@echo "Rotated. Trigger a deploy to pick up: gh workflow run deploy-$(ENV).yml"

rotate-grafana:
	@read -rp "Paste new Grafana Cloud token for ENV=$(ENV): " key; \
	gh secret set GRAFANA_CLOUD_TOKEN --env $(ENV) --repo $(REPO) --body "$$key"

waivers:
	gh issue list --label security-waiver --state open --repo $(REPO)

dr-drill:
	gh workflow run dr-drill.yml --repo $(REPO)

cost-check:
	gh workflow run nightly.yml --repo $(REPO) -f only=cost-guardrail

audit-export:
	@gh api -X GET "repos/$(REPO)/actions/runs?per_page=100" \
	  --jq '.workflow_runs[] | select(.name | startswith("deploy-")) | select(.created_at > (now - 30*24*3600 | todate)) | {name, head_sha, actor: .actor.login, conclusion, created_at, html_url}' \
	  > audit-deploys-30d.json
	@echo "Wrote audit-deploys-30d.json"
