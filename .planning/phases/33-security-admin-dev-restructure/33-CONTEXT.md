# Phase 33: security-admin Dev Path Restructure - Context

**Gathered:** 2026-05-16
**Status:** Mixed — repo changes are autonomous-doable; FAH backend creation + DNS + GitHub Secrets are human-only

<domain>
## Phase Boundary

Transform `triarchsecurity/security-admin` from single-env (prod-only) to two-env (dev + prod). Wire CL-4 gate + verify-dev-deployed + EnvBadge (CL-2 deferred work). All workflow file edits autonomous; FAH backend creation + DNS claim + GitHub Actions secret + npm install of @triarchsecurity/shared-ui@^1.5.0 are HUMAN-UAT.

</domain>

<decisions>
## Implementation Decisions

### Autonomous (in security-admin repo)
1. Create `apphosting.dev.yaml` — clone `apphosting.yaml` structure, change secret name suffixes to `_DEV` where applicable (DATABASE_URL → DATABASE_URL_DEV), add `NEXT_PUBLIC_ENV: dev`
2. Modify `.github/workflows/ci-cd.yml`:
   - Add `dev` to `on.push.branches` and `on.pull_request.branches`
   - Add `version` job extracting from package.json
   - Add `verify-dev-deployed` job with v2.13.10 direction (`is-ancestor origin/dev HEAD`)
   - Add `cl4-gate` job using `gate-prod-version.yml@v8.2` with `project_key: triarchsecurity-admin`
   - Add `env-select` or equivalent to route deploy to dev vs prod
   - Add deploy-dev job (uses portion of dev backend) parallel to existing prod deploy
   - Wire deploy-prod `needs: [..., cl4-gate]` and `if:` to allow cl4-gate skipped on dev path
3. Mount EnvBadge in `src/app/layout.tsx` (per CL-2 deferred work from Phase 29):
   - import EnvBadge from `@triarchsecurity/shared-ui`
   - mount inside body
   - Bump `@triarchsecurity/shared-ui` package.json dep to `^1.5.0`
4. Bump security-admin package.json version (current v3.54.1 → v3.55.0 — minor bump for dev path addition)
5. Branch: build ON TOP of existing `fix/bump-shared-workflows-v8` (which is already 1 commit ahead of main with shared-workflows@v8 adoption) — extend that branch with the v8.2 work + dev path

### Human-only (HUMAN-UAT)
A. Create FAH backend `admin-dev` in Firebase project `triarchsecurity-admin` (Console: Firebase App Hosting → Create backend)
B. Add `dev` branch to security-admin: `git checkout -b dev main && git push origin dev`
C. Claim `admin-dev.triarchsecurity.com` DNS (Phase 30 flow — Section B against triarchsecurity.com GoDaddy zone)
D. Create GCP secrets `DATABASE_URL_DEV` (and other _DEV variants) with appropriate values; bind to admin-dev backend
E. Add `ADMIN_API_TOKEN` GitHub Actions secret to security-admin repo (apiKey from admin's projects table where key='triarchsecurity-admin')
F. Run `npm install` in security-admin after shared-ui v1.5.0 publishes (Phase 29 dependency)

### Coordination with existing in-flight branch
The autonomous work builds ON TOP of `fix/bump-shared-workflows-v8` (existing v3.54.1 commit). New branch: `feat/dev-path-cl4-cl2-cl3` off `fix/bump-shared-workflows-v8`. Final PR can squash everything into main once HUMAN-UAT A-F complete.

</decisions>
