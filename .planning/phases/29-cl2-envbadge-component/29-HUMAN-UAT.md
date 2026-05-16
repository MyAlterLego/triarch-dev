# Phase 29 — Human UAT Runbook

**Scope:** Ship @triarchsecurity/shared-ui v1.5.0 (EnvBadge) then push + PR + merge 5 consumer repos.
**Milestone:** v2.3 Dev/Prod Contract Adoption — CL-2 EnvBadge
**Critical:** Section A (preflight) → Section B1 (shared-ui FIRST) → wait for npm publish → Section B2 (consumers IN PARALLEL) → Section C (verify) → Section D (prod promotion) → Section E (cleanup)

**DO NOT push consumer PRs until npm publish is confirmed (Section B1 complete).** Their CI builds reference `@triarchsecurity/shared-ui@^1.5.0` which will 404 until the package is on the registry.

---

## Section A — Preflight Check

Run these commands to confirm local branches are in the expected state before touching GitHub.

```bash
# shared-ui
cd /Users/mikegeehan/claude/triarch/shared/shared-ui
git branch --show-current          # expected: feat/v1.5.0-envbadge
git log -1 --oneline               # expected: 78f2771 v1.5.0: feat: EnvBadge component...
grep '"version"' package.json      # expected: "version": "1.5.0"
grep 'EnvBadge' src/index.ts       # expected: 1 match
ls src/components/EnvBadge/        # expected: index.tsx

# platform
cd /Users/mikegeehan/claude/triarch/shared/platform
git branch --show-current          # expected: feat/cl2-envbadge-mount
grep -c 'EnvBadge' src/app/layout.tsx              # expected: 2
grep -c 'NEXT_PUBLIC_ENV' apphosting.dev.yaml      # expected: 1
grep -c 'NEXT_PUBLIC_ENV' apphosting.yaml          # expected: 0

# dev-portal
cd /Users/mikegeehan/claude/triarch/shared/dev-portal
git branch --show-current          # expected: feat/cl2-envbadge-mount
git log -1 --oneline               # expected: 55060c2 v0.7.5: feat(cl-2)...
grep -c 'EnvBadge' src/app/layout.tsx              # expected: 2

# darksouls
cd /Users/mikegeehan/claude/triarch/shared/darksouls
git branch --show-current          # expected: feat/cl2-envbadge-mount
git log -1 --oneline               # expected: f0706fb v7.7.13: feat(cl-2)...
grep -c 'EnvBadge' src/app/layout.tsx              # expected: 2

# tmi
cd /Users/mikegeehan/claude/triarch/shared/tmi
git branch --show-current          # expected: feat/cl2-envbadge-mount
git log -1 --oneline               # expected: 69450e4 v4.44.2: feat(cl-2)...
grep -c 'EnvBadge' src/app/layout.tsx              # expected: 2

# truthtreason
cd /Users/mikegeehan/claude/triarch/shared/truthtreason
git branch --show-current          # expected: feat/cl2-envbadge-mount
git log -1 --oneline               # expected: 2ec6cd7 v1.1.19: feat(cl-2)...
grep -c 'EnvBadge' src/app/layout.tsx              # expected: 2
```

If all match, proceed to Section B.

---

## Section B — Push + PR + Merge Sequence

### B1. shared-ui FIRST (MUST complete before any consumer)

```bash
cd /Users/mikegeehan/claude/triarch/shared/shared-ui

# Push the feature branch
git push -u origin feat/v1.5.0-envbadge

# Open PR against main
gh pr create \
  --base main \
  --head feat/v1.5.0-envbadge \
  --title "v1.5.0: feat: EnvBadge component (CL-2 dev chrome marker)" \
  --body "$(cat <<'EOF'
## Summary

Phase 29 — builds `<EnvBadge env={...}/>` in @triarchsecurity/shared-ui for CL-2 dev chrome marker.

- Renders fixed-position DEV/STAGING pill (bottom-right, z-index 9000) when `env` is `dev` or `staging` (case-insensitive); returns null in prod
- Emits `data-env="dev"` (normalized lowercase) for Phase 35 compliance scan HTML assertion
- Yellow (#facc15) for dev, orange (#fb923c) for staging; inline CSS-in-JS (no Tailwind)
- 6-scenario vitest suite (all pass): undefined, prod, dev, DEV uppercase, staging, unknown-env
- Exports `EnvBadge` from src/index.ts; dist/ rebuilt via tsup

## Requirements

Closes CL2-01 (component exists), CL2-02 (data-env attribute for compliance scan)

## Checklist

- [x] vitest 64/65 passing (1 pre-existing SortableList failure unrelated to this change)
- [x] dist/ rebuilt (tsup)
- [x] EnvBadge exported from src/index.ts
EOF
)"
```

**Wait for CI to pass. Then merge the PR on GitHub.**

```bash
# After merge — tag to trigger npm publish
cd /Users/mikegeehan/claude/triarch/shared/shared-ui
git checkout main
git pull

git tag v1.5.0
git push origin v1.5.0
# CI publish workflow fires on tag push → publishes @triarchsecurity/shared-ui@1.5.0 to GitHub Packages
```

**Wait for CI publish workflow to complete.** Monitor at:
`https://github.com/triarchsecurity/shared-ui/actions` (look for a "Publish" or "Release" workflow run triggered by the `v1.5.0` tag)

**Verify package is available before proceeding to B2:**

```bash
npm view @triarchsecurity/shared-ui@1.5.0 version --registry https://npm.pkg.github.com
# Expected output: 1.5.0
# If 404 or not found — wait; the publish CI job is still running
```

---

### B2. Consumer repos IN PARALLEL (only after B1 publish is confirmed)

Run these in any order (or in parallel in separate terminal tabs). Each step is identical in structure.

#### platform

```bash
cd /Users/mikegeehan/claude/triarch/shared/platform

# Install the now-published package (updates package-lock.json)
npm install

# Verify build passes
npx next build

# Stage lockfile if it changed
git add package-lock.json

# If lockfile changed, amend the existing feat commit (adds lockfile without changing commit message)
git diff --cached --quiet || git commit --amend --no-edit

# Push
git push -u origin feat/cl2-envbadge-mount

# Open PR against dev (platform uses dev as promotion base per workspace CLAUDE.md)
# First confirm the current platform version (should be 2.13.16):
grep '"version"' package.json

gh pr create \
  --base dev \
  --head feat/cl2-envbadge-mount \
  --title "v2.13.16: feat(cl-2): mount <EnvBadge/> in root layout" \
  --body "$(cat <<'EOF'
## Summary

Phase 29 — mounts CL-2 env badge in platform root layout.

- Imports `EnvBadge` from `@triarchsecurity/shared-ui@^1.5.0` and mounts as last child of `<body>`
- Sets `NEXT_PUBLIC_ENV=dev` in `apphosting.dev.yaml` (BUILD + RUNTIME) — baked into dev bundle
- `apphosting.yaml` (prod) has no `NEXT_PUBLIC_ENV` — badge renders null in prod
- Fixes stale `transpilePackages` entry: replaced `@myalterlego/shared-ui` → `@triarchsecurity/shared-ui`

## Verification

After FAH dev deploy: visit admin-dev.triarch.dev — yellow DEV pill should appear bottom-right.
Curl: `curl -s https://admin-dev.triarch.dev/ | grep 'data-env="dev"'` — expected 1 match.

## Requirements

Closes CL2-03, CL2-04 for platform.

## Dependency

Requires @triarchsecurity/shared-ui@1.5.0 published (Phase 29 shared-ui PR merged + tagged + CI publish complete).
EOF
)"
```

#### dev-portal

```bash
cd /Users/mikegeehan/claude/triarch/shared/dev-portal
npm install
npx next build
git add package-lock.json
git diff --cached --quiet || git commit --amend --no-edit
git push -u origin feat/cl2-envbadge-mount

gh pr create \
  --base dev \
  --head feat/cl2-envbadge-mount \
  --title "v0.7.5: feat(cl-2): mount <EnvBadge/> in root layout" \
  --body "$(cat <<'EOF'
## Summary

Phase 29 — mounts CL-2 env badge in dev-portal root layout.

- Imports `EnvBadge` from `@triarchsecurity/shared-ui@^1.5.0`; mounts as last child of `<body>`
- `transpilePackages` already had `@triarchsecurity/shared-ui` — no next.config.ts change needed
- Sets `NEXT_PUBLIC_ENV=dev` in `apphosting.dev.yaml` (BUILD + RUNTIME)
- `apphosting.yaml` (prod) has no `NEXT_PUBLIC_ENV`

## Verification

After FAH dev deploy: visit portal dev URL — yellow DEV pill should appear bottom-right.

## Requirements

Closes CL2-03, CL2-04 for dev-portal.
EOF
)"
```

#### darksouls

```bash
cd /Users/mikegeehan/claude/triarch/shared/darksouls
npm install
npx next build
git add package-lock.json
git diff --cached --quiet || git commit --amend --no-edit
git push -u origin feat/cl2-envbadge-mount

gh pr create \
  --base dev \
  --head feat/cl2-envbadge-mount \
  --title "v7.7.13: feat(cl-2): mount <EnvBadge/> in root layout" \
  --body "$(cat <<'EOF'
## Summary

Phase 29 — mounts CL-2 env badge in darksouls root layout.

- Imports `EnvBadge` from `@triarchsecurity/shared-ui@^1.5.0`; mounts as last child of `<body>`
- Adds `@triarchsecurity/shared-ui` to `transpilePackages` in next.config.ts (alongside existing legacy entries)
- Sets `NEXT_PUBLIC_ENV=dev` in `apphosting.dev.yaml` (BUILD + RUNTIME)
- `apphosting.yaml` (prod) has no `NEXT_PUBLIC_ENV`

## Verification

After FAH dev deploy: visit darksouls-dev.triarch.dev — yellow DEV pill should appear bottom-right.

## Requirements

Closes CL2-03, CL2-04 for darksouls.
EOF
)"
```

#### tmi

```bash
cd /Users/mikegeehan/claude/triarch/shared/tmi
npm install
npx next build
git add package-lock.json
git diff --cached --quiet || git commit --amend --no-edit
git push -u origin feat/cl2-envbadge-mount

gh pr create \
  --base dev \
  --head feat/cl2-envbadge-mount \
  --title "v4.44.2: feat(cl-2): mount <EnvBadge/> in root layout" \
  --body "$(cat <<'EOF'
## Summary

Phase 29 — mounts CL-2 env badge in tmi root layout.

- Imports `EnvBadge` from `@triarchsecurity/shared-ui@^1.5.0`; mounts as last child of `<body>`
- Replaces stale `@myalterlego/shared-ui` with `@triarchsecurity/shared-ui` in `transpilePackages`
- Sets `NEXT_PUBLIC_ENV=dev` in `apphosting.dev.yaml` (BUILD + RUNTIME)
- `apphosting.yaml` (prod) has no `NEXT_PUBLIC_ENV`

## Verification

After FAH dev deploy: visit tmi dev URL — yellow DEV pill should appear bottom-right.

## Requirements

Closes CL2-03, CL2-04 for tmi.
EOF
)"
```

#### truthtreason

```bash
cd /Users/mikegeehan/claude/triarch/shared/truthtreason
npm install
npx next build
git add package-lock.json
git diff --cached --quiet || git commit --amend --no-edit
git push -u origin feat/cl2-envbadge-mount

gh pr create \
  --base dev \
  --head feat/cl2-envbadge-mount \
  --title "v1.1.19: feat(cl-2): mount <EnvBadge/> in root layout" \
  --body "$(cat <<'EOF'
## Summary

Phase 29 — mounts CL-2 env badge in truthtreason root layout (first-ever use of @triarchsecurity/shared-ui).

- Adds `@triarchsecurity/shared-ui@^1.5.0` dep (new dependency — first time)
- Adds `transpilePackages: ['@triarchsecurity/shared-ui']` to `next.config.ts` (field did not exist)
- Imports `EnvBadge` and mounts as last child of `<body>`
- Sets `NEXT_PUBLIC_ENV=dev` in `apphosting.dev.yaml` (BUILD + RUNTIME)
- `apphosting.yaml` and `apphosting.prod.yaml` both absent of `NEXT_PUBLIC_ENV`

## Verification

After FAH dev deploy: visit truthtreason dev URL — yellow DEV pill should appear bottom-right.

## Requirements

Closes CL2-03, CL2-04 for truthtreason.
EOF
)"
```

---

### B3. Merge consumer PRs to dev

After each consumer PR's CI passes (it will pass now that shared-ui v1.5.0 is published), merge the PR to `dev`. Firebase App Hosting (FAH) will auto-deploy to each project's dev backend.

---

## Section C — Verify Per-Deploy (Post-FAH-Deploy)

Run these after FAH dev deploy for each repo. Wait 2-3 minutes per project for FAH deployment to complete.

### Visual check (open in browser)

| Project | Dev URL | Expected |
|---------|---------|----------|
| platform | https://admin-dev.triarch.dev | Yellow "DEV" pill — bottom-right corner |
| dev-portal | FAH auto-domain (portal-dev hostname not yet in DNS — Phase 30) | Yellow "DEV" pill |
| darksouls | https://darksouls-dev.triarch.dev | Yellow "DEV" pill |
| tmi | tmi dev URL (hostname TBD — Phase 30) | Yellow "DEV" pill |
| truthtreason | FAH auto-domain (truthtreason-dev hostname not yet in DNS — Phase 30) | Yellow "DEV" pill |

### Compliance scan check (curl — same check Phase 35 will automate)

```bash
# platform (hostname confirmed in DNS)
curl -s https://admin-dev.triarch.dev/ | grep -o 'data-env="dev"'
# Expected: data-env="dev"

# darksouls (hostname confirmed in DNS)
curl -s https://darksouls-dev.triarch.dev/ | grep -o 'data-env="dev"'
# Expected: data-env="dev"

# For repos with no custom dev hostname yet (Phase 30 will add these):
# Use FAH auto-domain from Firebase Console: Project → App Hosting → <dev backend> → Domains
# Example format: https://<backend-id>--<firebase-project>.us-central1.hosted.app
curl -s https://<fah-auto-domain>/ | grep -o 'data-env="dev"'
# Expected: data-env="dev"
```

### Prod check (confirm badge NOT visible)

For each repo, after prod deploy:
- Prod URL (e.g., https://admin.triarch.dev) should NOT render the pill
- `curl -s https://admin.triarch.dev/ | grep 'data-env'` should return 0 lines

---

## Section D — Prod Promotion

After dev verification passes for each project:

```bash
# For each consumer repo: open a dev → main PR
# Platform example:
cd /Users/mikegeehan/claude/triarch/shared/platform
gh pr create \
  --base main \
  --head dev \
  --title "v2.13.16: promote dev → main (Phase 29 EnvBadge)" \
  --body "Merges Phase 29 EnvBadge mount to prod. Badge absent from prod URL (no NEXT_PUBLIC_ENV in apphosting.yaml)."

# Repeat for each consumer repo replacing the version number and description
```

After merge to main: FAH auto-deploys to prod backend. CL-4 gate (platform only currently — others in Phase 32) will require a passing gate-prod-version check before deploy proceeds.

Verify prod URLs do NOT show the DEV badge after deploy — `curl -s https://admin.triarch.dev/ | grep 'data-env'` must return empty.

---

## Section E — Incidental Cleanup

### E1. Delete stale fix/deploy-skip-bug branches (local)

These branches existed in dev-portal, darksouls, and tmi as abandoned backports of platform v2.13.5. They never merged and are unrelated to Phase 29.

```bash
cd /Users/mikegeehan/claude/triarch/shared/dev-portal
git branch -D fix/deploy-skip-bug

cd /Users/mikegeehan/claude/triarch/shared/darksouls
git branch -D fix/deploy-skip-bug

cd /Users/mikegeehan/claude/triarch/shared/tmi
git branch -D fix/deploy-skip-bug
```

### E2. Delete stale branches on remote (if they were pushed)

Check if these exist on the remote first:

```bash
cd /Users/mikegeehan/claude/triarch/shared/dev-portal
git ls-remote --heads origin fix/deploy-skip-bug
# If output is non-empty, the branch exists on remote → delete it:
git push origin --delete fix/deploy-skip-bug

# Repeat for darksouls and tmi
cd /Users/mikegeehan/claude/triarch/shared/darksouls
git ls-remote --heads origin fix/deploy-skip-bug
git push origin --delete fix/deploy-skip-bug  # only if non-empty above

cd /Users/mikegeehan/claude/triarch/shared/tmi
git ls-remote --heads origin fix/deploy-skip-bug
git push origin --delete fix/deploy-skip-bug  # only if non-empty above
```

---

## Section F — Phase 33/34 Dependency Note

**security-admin and security-portal are NOT in Phase 29.** Their mounts are deferred:

- **Phase 33 (security-admin):** Creates FAH dev backend (`admin-dev` in `triarchsecurity-admin` Firebase project), adds `dev` branch, restructures workflow, claims `admin-dev.triarchsecurity.com` DNS, wires CL-4 gate. EnvBadge mount is part of this phase.

- **Phase 34 (security-portal):** Same as Phase 33 for security-portal. Claims `portal-dev.triarchsecurity.com`.

Once Phase 33/34 execute, they will consume `@triarchsecurity/shared-ui@^1.5.0` (already published by then) — no new publish step required for the EnvBadge in those repos.

### CL-2 completion status after Phase 29

| Project | CL2-03 (mount) | CL2-04 (env var) | Status |
|---------|----------------|------------------|--------|
| platform | After Phase 29 PR merge | After Phase 29 PR merge | Handled Phase 29 |
| dev-portal | After Phase 29 PR merge | After Phase 29 PR merge | Handled Phase 29 |
| darksouls | After Phase 29 PR merge | After Phase 29 PR merge | Handled Phase 29 |
| tmi | After Phase 29 PR merge | After Phase 29 PR merge | Handled Phase 29 |
| truthtreason | After Phase 29 PR merge | After Phase 29 PR merge | Handled Phase 29 |
| security-admin | Phase 33 | Phase 33 | Deferred |
| security-portal | Phase 34 | Phase 34 | Deferred |

---

## Checklist Summary

- [ ] A: Preflight checks all pass
- [ ] B1: shared-ui v1.5.0 pushed, PR opened, CI green, PR merged, v1.5.0 tag pushed, CI publish complete
- [ ] B1: `npm view @triarchsecurity/shared-ui@1.5.0 version` returns `1.5.0`
- [ ] B2: platform npm install + build + push + PR opened
- [ ] B2: dev-portal npm install + build + push + PR opened
- [ ] B2: darksouls npm install + build + push + PR opened
- [ ] B2: tmi npm install + build + push + PR opened
- [ ] B2: truthtreason npm install + build + push + PR opened
- [ ] B3: All 5 consumer PRs merged to dev; FAH deploying
- [ ] C: Visual DEV badge visible on each project's dev URL
- [ ] C: `curl <dev-url> | grep 'data-env="dev"'` returns 1 match per project
- [ ] D: dev → main PRs opened and merged for each project
- [ ] D: Prod URLs confirm NO badge visible
- [ ] E: Stale fix/deploy-skip-bug branches deleted (local + remote if pushed)
