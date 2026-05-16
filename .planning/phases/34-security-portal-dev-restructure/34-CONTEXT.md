# Phase 34: security-portal Dev Path Restructure - Context

**Gathered:** 2026-05-16
**Status:** Mirrors Phase 33 (security-admin pattern); extra: resolve dormant dev branch

<domain>
## Phase Boundary

Same as Phase 33 but for `triarchsecurity/security-portal`. Plus: resolve dormant `dev` branch (20 commits behind `main` per recon). Two options for dev branch: rebase onto main, or delete + recreate from main. Recommendation: delete + recreate (clean slate; 20-commit divergence likely contains stale work).

</domain>

<decisions>
## Implementation Decisions

### Repo-side autonomous work (mirrors Phase 33)
1. Create `apphosting.dev.yaml` from `apphosting.yaml` template with `_DEV` secret variants + `NEXT_PUBLIC_ENV=dev`
2. Modify `ci-cd.yml`:
   - Add `dev` branch to triggers
   - Add `version` job
   - Add `verify-dev-deployed` v2.13.10 direction
   - Add `cl4-gate` @v8.2 with `project_key: triarchsecurity-portal`
   - Add `deploy-dev` job
   - Wire `deploy-prod` with `needs: [..., cl4-gate]`
3. Mount EnvBadge in `src/app/layout.tsx`
4. Bump `@triarchsecurity/shared-ui` to `^1.5.0` (current ^1.4.0)
5. Bump security-portal version v0.14.8 → v0.15.0 (minor — dev path addition)
6. Branch: `feat/dev-path-cl4-cl2-cl3` off `fix/bump-shared-workflows-v8`

### Dormant dev branch handling (special vs Phase 33)
Per recon, security-portal's `dev` branch is 20 commits behind main. Phase 34's HUMAN-UAT will instruct user to:
- Option A (recommended): delete + recreate from main: `git push origin --delete dev` then `git checkout main && git checkout -b dev && git push origin dev`
- Option B: rebase: `git checkout dev && git rebase main && git push --force-with-lease origin dev`
- Recommend A — 20 commits of dormant work likely stale and not worth carrying forward

This is HUMAN-only — autonomous shouldn't force-push branches.

### Human-only items (HUMAN-UAT)
Same as Phase 33:
- Create FAH `portal-dev` backend in triarchsecurity-portal Firebase project
- Resolve dormant dev branch (option A or B above)
- Claim `portal-dev.triarchsecurity.com` DNS
- Create _DEV GCP secrets
- Add ADMIN_API_TOKEN GitHub Actions secret
- npm install after shared-ui 1.5.0 published
- PR merge flow + deploy verification

</decisions>
