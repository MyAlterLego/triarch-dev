# Phase 33: Security-Admin Dev Path — Human UAT Runbook

**Status:** Autonomous code changes committed. The following steps require human action.
**Repo:** `triarchsecurity/security-admin`
**Branch to merge:** `feat/dev-path-cl4-cl2-cl3` (off `fix/bump-shared-workflows-v8`)
**Completed commit:** `09346e0f` — `v3.55.0: feat: dev path + CL-4 gate + CL-2 envbadge + CL-3 namespace prep`

---

## Prerequisites

Complete steps A–F before opening the final PR. Steps can be done in parallel where noted.

---

## Step A: Create FAH Backend `admin-dev`

**Where:** Firebase Console → Project `triarchsecurity-admin` → App Hosting → Create Backend

1. Go to [Firebase Console](https://console.firebase.google.com/) → `triarchsecurity-admin` project
2. Click **App Hosting** in the left nav
3. Click **Create a new backend**
4. Set:
   - **Backend name:** `admin-dev`
   - **Branch:** `dev` (create the branch first — see Step B)
   - **Root directory:** `/` (or wherever the app root is)
5. Click **Create**

**Verify:** Backend `admin-dev` appears in the App Hosting list with status "Active".

---

## Step B: Create and Push `dev` Branch

**Where:** Terminal (local security-admin repo)

```bash
cd /Users/mikegeehan/claude/triarch/shared/security-admin

# Create dev off main (or off fix/bump-shared-workflows-v8 if preferred)
git checkout main
git checkout -b dev

# Push to remote
git push origin dev
```

**Verify:** `git branch -r | grep origin/dev` returns `remotes/origin/dev`.

**Also:** After pushing, return to Firebase Console Step A to wire `admin-dev` backend to the `dev` branch.

---

## Step C: Claim DNS — `admin-dev.triarchsecurity.com`

**Where:** GoDaddy DNS Manager → `triarchsecurity.com` zone

1. Get the FAH-provided hostname for `admin-dev` backend from Firebase Console → App Hosting → `admin-dev` → Settings → Custom domain
2. Add CNAME record in GoDaddy:
   - **Type:** CNAME
   - **Name:** `admin-dev`
   - **Value:** `<FAH-provided hostname>` (e.g., `admin-dev--triarchsecurity-admin.us-central1.hosted.app`)
   - **TTL:** 600 (or default)
3. In Firebase Console, verify the domain (follow the verification flow)

**Verify:** `curl -I https://admin-dev.triarchsecurity.com` returns HTTP 200 (may take up to 48h for DNS propagation + cert provisioning).

**Note:** App works without the custom domain via the FAH-provided URL. This step is CL-1 compliance only.

---

## Step D: Create GCP Secrets for Dev Environment

**Where:** GCP Console → `triarchsecurity-admin` project → Secret Manager

Create the following secrets (these are new _DEV variants):

| Secret Name | Value Source |
|-------------|-------------|
| `DATABASE_URL_DEV` | Connection string to a separate `_dev` database (or dev CockroachDB cluster/namespace) |
| `NEXTAUTH_SECRET_DEV` | Any random 32-char string: `openssl rand -base64 32` |

**CLI alternative:**
```bash
# Set DATABASE_URL_DEV
echo "postgresql://..." | gcloud secrets create DATABASE_URL_DEV --data-file=- --project=triarchsecurity-admin

# Set NEXTAUTH_SECRET_DEV
openssl rand -base64 32 | gcloud secrets create NEXTAUTH_SECRET_DEV --data-file=- --project=triarchsecurity-admin
```

**Bind to `admin-dev` backend:**
1. Firebase Console → App Hosting → `admin-dev` → Settings → Environment variables
2. For each secret, add a binding: `DATABASE_URL` → `DATABASE_URL_DEV`, `NEXTAUTH_SECRET` → `NEXTAUTH_SECRET_DEV`

**Alternatively:** Firebase CLI:
```bash
firebase apphosting:secrets:grantaccess DATABASE_URL_DEV --backend admin-dev --project triarchsecurity-admin
firebase apphosting:secrets:grantaccess NEXTAUTH_SECRET_DEV --backend admin-dev --project triarchsecurity-admin
```

**Verify:** Firebase Console shows secrets bound to `admin-dev` backend.

---

## Step E: Add GitHub Actions Secret `ADMIN_API_TOKEN`

**Where:** GitHub → `triarchsecurity/security-admin` repo → Settings → Secrets and variables → Actions

1. Go to: https://github.com/triarchsecurity/security-admin/settings/secrets/actions
2. Click **New repository secret**
3. Name: `ADMIN_API_TOKEN`
4. Value: The `apiKey` value from the `projects` table in the platform database where `key = 'triarchsecurity-admin'`
   - Query: `SELECT "apiKey" FROM projects WHERE key = 'triarchsecurity-admin';`
   - Can run via: Drizzle Studio in platform, or a psql session against the platform DB
5. Click **Add secret**

**Verify:** Secret appears in the Actions secrets list.

---

## Step F: npm install after shared-ui v1.5.0 Publishes

**Dependency:** `@triarchsecurity/shared-ui@^1.5.0` must be published to GitHub Packages (Phase 29 deliverable).

```bash
cd /Users/mikegeehan/claude/triarch/shared/security-admin

# After Phase 29 publishes shared-ui@1.5.0:
npm install

# Verify EnvBadge is importable
node -e "const { EnvBadge } = require('@triarchsecurity/shared-ui'); console.log('OK');"
```

**Verify:** `node_modules/@triarchsecurity/shared-ui` exists and `npm run build` (or `npx next build`) passes.

---

## Step G: Merge and Promote

Once A–F are complete:

```bash
cd /Users/mikegeehan/claude/triarch/shared/security-admin

# Merge feat branch into fix branch (already on fix/bump-shared-workflows-v8)
git checkout fix/bump-shared-workflows-v8
git merge feat/dev-path-cl4-cl2-cl3

# Open PR: fix/bump-shared-workflows-v8 → dev
gh pr create --base dev --head fix/bump-shared-workflows-v8 \
  --title "v3.55.0: dev path + CL-4 gate + CL-2 EnvBadge + CL-3 namespace" \
  --body "Two-env restructure for security-admin. Adds dev branch CI path, cl4-gate@v8.2, verify-dev-deployed, EnvBadge (CL-2), and DATABASE_URL_DEV namespace (CL-3). See Phase 33 SUMMARY.md for full change log."
```

After CI passes on `dev` PR:
1. Merge → `dev` → FAH auto-deploys to `admin-dev`
2. Verify on `https://admin-dev.triarchsecurity.com` (or FAH URL)
3. Open PR: `dev → main`
4. Merge → `main` → cl4-gate runs → FAH deploys to prod

---

## Verification Checklist

After all steps complete, confirm:

- [ ] FAH `admin-dev` backend exists and is wired to `dev` branch
- [ ] `admin-dev.triarchsecurity.com` resolves (Step C; may take time)
- [ ] `DATABASE_URL_DEV` and `NEXTAUTH_SECRET_DEV` secrets bound to `admin-dev`
- [ ] `ADMIN_API_TOKEN` set in GitHub Actions secrets
- [ ] `npm install` succeeds after shared-ui publishes
- [ ] Dev push to `dev` branch triggers CI, deploys to `admin-dev`
- [ ] Prod push to `main` runs cl4-gate, blocks if INV-1..5 violated
- [ ] EnvBadge renders on `admin-dev` environment, absent on prod
- [ ] `admin-dev.triarchsecurity.com` does NOT load prod data (CL-3 namespace separation)
