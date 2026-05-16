# Phase 34: Security-Portal Dev Path — Human UAT Runbook

**Status:** Autonomous code changes committed. The following steps require human action.
**Repo:** `triarchsecurity/security-portal`
**Branch to merge:** `feat/dev-path-cl4-cl2-cl3` (off `fix/bump-shared-workflows-v8`)
**Completed commit:** `294f8ab` — `v0.15.0: feat: dev path + CL-4 gate + CL-2 envbadge + CL-3 namespace prep`

---

## Prerequisites

Complete steps A–F before opening the final PR. Steps can be done in parallel where noted.

**CRITICAL FIRST STEP: Complete Step A (dormant dev branch resolution) before doing anything else.** The dev branch is 20 commits behind main — an unresolved dev branch will cause `verify-dev-deployed` to fail on every prod push. Recommend Option A (delete + recreate).

---

## Step A: Resolve Dormant `dev` Branch

**Where:** Terminal (local security-portal repo)

The `dev` branch on `triarchsecurity/security-portal` is 20 commits behind `main`. This must be resolved before CI flows work correctly. Two options:

### Option A (Recommended): Delete + Recreate from Main (Clean Slate)

```bash
cd /Users/mikegeehan/claude/triarch/shared/security-portal

# Delete the stale remote dev branch
git push origin --delete dev

# Recreate dev from current main
git fetch origin main
git checkout -b dev origin/main

# Push the fresh dev branch
git push origin dev
```

**Why recommended:** 20 commits of divergence likely contains stale work that predates the v8 restructure. A clean dev recreated from main ensures verify-dev-deployed passes immediately on the first dev push.

### Option B: Rebase dev onto main (Preserve History)

```bash
cd /Users/mikegeehan/claude/triarch/shared/security-portal

git fetch origin
git checkout dev
git rebase origin/main

# Force-push required (history rewritten)
git push --force-with-lease origin dev
```

**Warning:** Force-pushing rewrites history. Confirm no one else is working from the remote dev branch before choosing this option.

**Verify:** `git log --oneline origin/dev -3` shows commits that are also in main.

---

## Step B: Create FAH Backend `portal-dev`

**Where:** Firebase Console → Project `triarchsecurity-portal` → App Hosting → Create Backend

1. Go to [Firebase Console](https://console.firebase.google.com/) → `triarchsecurity-portal` project
2. Click **App Hosting** in the left nav
3. Click **Create a new backend**
4. Set:
   - **Backend name:** `portal-dev`
   - **Branch:** `dev` (complete Step A first)
   - **Root directory:** `/` (app root)
   - **Environment config:** `apphosting.dev.yaml`
5. Click **Create**

**Verify:** Backend `portal-dev` appears in the App Hosting list with status "Active".

---

## Step C: Claim DNS — `portal-dev.triarchsecurity.com`

**Where:** GoDaddy DNS Manager → `triarchsecurity.com` zone

1. Get the FAH-provided hostname for `portal-dev` backend from Firebase Console → App Hosting → `portal-dev` → Settings → Custom domain
2. Add CNAME record in GoDaddy:
   - **Type:** CNAME
   - **Name:** `portal-dev`
   - **Value:** `<FAH-provided hostname>` (e.g., `portal-dev--triarchsecurity-portal.us-central1.hosted.app`)
   - **TTL:** 600 (or default)
3. In Firebase Console, verify the domain (follow the verification flow)

**Verify:** `curl -I https://portal-dev.triarchsecurity.com` returns HTTP 200 (may take up to 48h for DNS propagation + cert provisioning).

**Note:** App works without the custom domain via the FAH-provided URL. This step is CL-1 compliance only.

---

## Step D: Create GCP Secrets for Dev Environment

**Where:** GCP Console → `triarchsecurity-portal` project → Secret Manager

Create the following secrets (these are new _DEV variants):

| Secret Name | Value Source |
|-------------|-------------|
| `DATABASE_URL_DEV` | Connection string to a separate `_dev` database (or dev CockroachDB cluster/namespace) |
| `PORTAL_JWT_SECRET_DEV` | Any random 32-char string: `openssl rand -base64 32` |
| `PORTAL_TOTP_ENCRYPTION_KEY_DEV` | Any random 32-char string: `openssl rand -base64 32` |

**CLI alternative:**
```bash
# Set DATABASE_URL_DEV
echo "postgresql://..." | gcloud secrets create DATABASE_URL_DEV --data-file=- --project=triarchsecurity-portal

# Set PORTAL_JWT_SECRET_DEV
openssl rand -base64 32 | gcloud secrets create PORTAL_JWT_SECRET_DEV --data-file=- --project=triarchsecurity-portal

# Set PORTAL_TOTP_ENCRYPTION_KEY_DEV
openssl rand -base64 32 | gcloud secrets create PORTAL_TOTP_ENCRYPTION_KEY_DEV --data-file=- --project=triarchsecurity-portal
```

**Bind to `portal-dev` backend:**
```bash
firebase apphosting:secrets:grantaccess DATABASE_URL_DEV --backend portal-dev --project triarchsecurity-portal
firebase apphosting:secrets:grantaccess PORTAL_JWT_SECRET_DEV --backend portal-dev --project triarchsecurity-portal
firebase apphosting:secrets:grantaccess PORTAL_TOTP_ENCRYPTION_KEY_DEV --backend portal-dev --project triarchsecurity-portal
```

**Verify:** Firebase Console shows all three secrets bound to `portal-dev` backend.

---

## Step E: Add GitHub Actions Secret `ADMIN_API_TOKEN`

**Where:** GitHub → `triarchsecurity/security-portal` repo → Settings → Secrets and variables → Actions

1. Go to: https://github.com/triarchsecurity/security-portal/settings/secrets/actions
2. Click **New repository secret**
3. Name: `ADMIN_API_TOKEN`
4. Value: The `apiKey` value from the `projects` table in the platform database where `key = 'triarchsecurity-portal'`
   - Query: `SELECT "apiKey" FROM projects WHERE key = 'triarchsecurity-portal';`
   - Can run via: Drizzle Studio in platform, or a psql session against the platform DB
5. Click **Add secret**

**Verify:** Secret appears in the Actions secrets list.

---

## Step F: npm install after shared-ui v1.5.0 Publishes

**Dependency:** `@triarchsecurity/shared-ui@^1.5.0` must be published to GitHub Packages (Phase 29 deliverable).

```bash
cd /Users/mikegeehan/claude/triarch/shared/security-portal

# After Phase 29 publishes shared-ui@1.5.0:
npm install

# Verify EnvBadge is importable
node -e "const { EnvBadge } = require('@triarchsecurity/shared-ui'); console.log('OK');"
```

**Verify:** `node_modules/@triarchsecurity/shared-ui` exists and `npx next build` passes.

---

## Step G: Merge and Promote

Once A–F are complete:

```bash
cd /Users/mikegeehan/claude/triarch/shared/security-portal

# Merge feat branch into fix branch
git checkout fix/bump-shared-workflows-v8
git merge feat/dev-path-cl4-cl2-cl3

# Open PR: fix/bump-shared-workflows-v8 → dev
gh pr create --base dev --head fix/bump-shared-workflows-v8 \
  --title "v0.15.0: dev path + CL-4 gate + CL-2 EnvBadge + CL-3 namespace" \
  --body "Two-env restructure for security-portal. Adds dev branch CI path, cl4-gate@v8.2, verify-dev-deployed, EnvBadge (CL-2), and _DEV secret namespace (CL-3). See Phase 34 SUMMARY.md for full change log."
```

After CI passes on `dev` PR:
1. Merge → `dev` → FAH auto-deploys to `portal-dev`
2. Verify on `https://portal-dev.triarchsecurity.com` (or FAH URL)
3. Open PR: `dev → main`
4. Merge → `main` → cl4-gate runs → FAH deploys to prod

---

## Verification Checklist

After all steps complete, confirm:

- [ ] Dormant `dev` branch resolved (Option A or B — recommend A)
- [ ] FAH `portal-dev` backend exists and is wired to `dev` branch
- [ ] `portal-dev.triarchsecurity.com` resolves (Step C; may take time)
- [ ] `DATABASE_URL_DEV`, `PORTAL_JWT_SECRET_DEV`, `PORTAL_TOTP_ENCRYPTION_KEY_DEV` secrets bound to `portal-dev`
- [ ] `ADMIN_API_TOKEN` set in GitHub Actions secrets for security-portal
- [ ] `npm install` succeeds after shared-ui publishes
- [ ] Dev push to `dev` branch triggers CI, deploys to `portal-dev`
- [ ] Prod push to `main` runs cl4-gate, blocks if INV-1..5 violated
- [ ] EnvBadge renders on `portal-dev` environment, absent on prod
- [ ] `portal-dev.triarchsecurity.com` does NOT load prod data (CL-3 namespace separation)
