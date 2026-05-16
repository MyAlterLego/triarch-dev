---
status: partial
phase: 32-cl4-roll-to-consumers
source: [32-01-SUMMARY.md, 32-02-SUMMARY.md, 32-03-SUMMARY.md]
started: 2026-05-16T00:00:00Z
updated: 2026-05-16T00:00:00Z
---

# Phase 32 — CL-4 Consumer Rollout Manual Runbook

## A. Prerequisites (must complete before any consumer PR can merge productively)

1. **Phase 27 migration 0019 applied to admin CRDB** (carried from 27-HUMAN-UAT)
2. **Phase 28 shared-workflows v8.2 published** (carried from 28-HUMAN-UAT) — without this, `gate-prod-version.yml@v8.2` reference in consumer workflows will fail at GitHub Actions runtime
3. **Phase 27 endpoint live on admin prod** — verify `curl https://admin.triarch.dev/api/platform/cicd/gate-verdict` returns a method-not-allowed (POST-only) or 401, NOT 404

## B. Per-consumer rollout (3 repos)

For each repo: darksouls (v7.7.14), tmi (v4.44.3), truthtreason (v1.1.20)

### B.1. Add ADMIN_API_TOKEN GitHub Actions secret per repo

For each repo, the consumer needs an `ADMIN_API_TOKEN` secret containing that project's `apiKey` from admin's CRDB.

```bash
# 1. Get the apiKey from admin's CRDB (substitute project_key per consumer)
DATABASE_URL=$(firebase apphosting:secrets:access DATABASE_URL --project triarch-dev-website)
psql "$DATABASE_URL" -c "SELECT key, api_key FROM projects WHERE key IN ('darksouls-rpg', 'triarch-dev-tmi', 'truth-treason');"

# 2. For each consumer, add the secret via gh CLI (or Settings UI)
gh secret set ADMIN_API_TOKEN --repo triarchsecurity/darksouls --body '<apiKey from step 1>'
gh secret set ADMIN_API_TOKEN --repo triarchsecurity/tmi --body '<apiKey from step 1>'
gh secret set ADMIN_API_TOKEN --repo triarchsecurity/truthtreason --body '<apiKey from step 1>'
```

### B.2. Push + PR each consumer feature branch

```bash
for repo in darksouls tmi truthtreason; do
  cd /Users/mikegeehan/claude/triarch/shared/$repo
  git push -u origin feat/cl4-consumer-gate
  gh pr create --base main --head feat/cl4-consumer-gate \
    --title "vX.Y.Z: feat(ci-cd): wire gate-prod-version@v8.2 (CL-4)" \
    --body "Phase 32 of v2.3 milestone. See platform repo .planning/phases/32-cl4-roll-to-consumers/ for context."
done
```

### B.3. Contrived dry-run test per consumer

Before merging each consumer PR to main:

```bash
# In feature branch: push a fake version higher than current dev to trigger INV-2 block
# Bump package.json version to something dev hasn't seen
# Watch GitHub Actions — cl4-gate job should FAIL with INV-2 error message
# Revert the version bump after verification
```

### B.4. Merge to main → real prod deploy

After successful PR review + contrived test:
- Merge consumer PR to main
- GitHub Actions runs ci-cd.yml on main push
- cl4-gate job runs `gate-prod-version@v8.2`:
  1. GETs `/api/platform/version-snapshot` (existing v8.1 behavior — verifies INV-1..5)
  2. NEW v8.2: POSTs verdict to `/api/platform/cicd/gate-verdict`
- deploy-prod fires; admin's ingest endpoint verifies paired verdict row exists
- In `warn` mode (current default per Phase 27): logs warning if pair missing, still ingests
- After all 4 consumers + platform are verified end-to-end: flip CL6_ENFORCEMENT_MODE=enforce on admin

## C. dev-portal — DEFERRED (no admin project record)

dev-portal cannot be added to Phase 32's CL-4 rollout autonomously because there is no `projects` row in admin's CRDB for it. Two paths to resolve:

### C.1. Create admin project record for dev-portal

Via admin UI: navigate to /admin/modules/projects → New Project. Suggested key: `dev-portal` or `triarch-dev-portal`. Generate apiKey on creation. Store apiKey for use in C.2.

OR via direct CRDB insert:
```sql
INSERT INTO projects (key, name, ecosystem, deployed_url, status, api_key) VALUES
  ('dev-portal', 'Triarch Dev Portal', 'triarch-dev', 'https://portal.triarch.dev', 'active', '<generate uuid or randomBytes>');
```

### C.2. Wire dev-portal ci-cd.yml

Once dev-portal has a project record + apiKey:
- Repeat the Phase 32 pattern for dev-portal (cl4-gate job @v8.2 with `project_key: dev-portal`)
- Add ADMIN_API_TOKEN secret to dev-portal GitHub Actions
- Push + PR

This can happen at any time after C.1. Track as Phase 32.1 (decimal phase).

## D. Branch divergence note (carried over from Phase 29)

Each consumer now has TWO feature branches with version bumps:
- `feat/cl2-envbadge-mount` (Phase 29): darksouls v7.7.13, tmi v4.44.2, truthtreason v1.1.19
- `feat/cl4-consumer-gate` (Phase 32): darksouls v7.7.14 (off main, missed v7.7.13), tmi v4.44.3 (off main, missed v4.44.2), truthtreason v1.1.20 (off dev which already has v1.1.18 from PR #30)

When merging, the version sequence may need reconcile:
- Suggested: merge Phase 29 PRs first → main lands at vX.Y.{Z+1}
- Then rebase Phase 32 feature branches onto main → bump to vX.Y.{Z+2}
- Force-push the rebased branch (only acceptable on personal feature branches)
- Then merge Phase 32 PRs

## E. Success Criteria

After A + B complete:

- [ ] darksouls ci-cd has cl4-gate @v8.2; ADMIN_API_TOKEN set; PR merged; real prod deploy passes gate + writes deploy_gate_check row
- [ ] tmi same
- [ ] truthtreason same
- [ ] After all 3 verified: flip CL6_ENFORCEMENT_MODE=warn → enforce on admin (apphosting.yaml env var update + redeploy)

After C complete:
- [ ] dev-portal has project record in admin
- [ ] dev-portal ci-cd has cl4-gate; PR merged; verified

## Summary

total: 4 (3 wireable + 1 deferred)
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 1 (dev-portal — no project record)

## Gaps
