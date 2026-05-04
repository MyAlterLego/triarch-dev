# Secrets Vault — `triarch-vault`

The canonical store for shared credentials across all Triarch projects. Replaces per-project Firebase secrets and the CRM `settings` table for the seven keys listed below. Per-project secrets that are NOT shared (e.g. `DATABASE_URL`, `NEXTAUTH_SECRET`) stay as Firebase secrets local to each project.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    triarch-vault (GCP)                       │
│  Secret Manager (multi-region, automatic replication)        │
│                                                              │
│   SLACK_BOT_TOKEN              GITHUB_APP_ID                 │
│   SLACK_SIGNING_SECRET         GITHUB_APP_PRIVATE_KEY        │
│   SLACK_PAYLOAD_SECRET         GITHUB_APP_INSTALLATION_ID    │
│   SLACK_USER_MAP                                             │
└────────────┬───────────────────────────────────┬────────────┘
             │ secretAccessor                    │ secretAccessor
             │                                   │
   ┌─────────▼──────────┐              ┌─────────▼──────────┐
   │ triarch-dev-website│              │ triarchsecurity-   │
   │   (admin app)      │              │   admin (CRM)      │
   │   reads all 7      │              │   reads 2          │
   └────────────────────┘              └────────────────────┘

Each consumer:                Each consumer's runtime SA gets:
  import { getSecret }          roles/secretmanager.secretAccessor
    from                          on each secret it consumes
  '@myalterlego/secrets';       (per-secret minimum privilege)
```

## The 7 Vault Keys

| Key | Type | Used by |
|-----|------|---------|
| `SLACK_BOT_TOKEN` | string (xoxb-…) | admin, CRM |
| `SLACK_SIGNING_SECRET` | string (32-hex) | admin, CRM |
| `SLACK_PAYLOAD_SECRET` | string (32-byte base64) | admin |
| `GITHUB_APP_ID` | string (numeric) | admin |
| `GITHUB_APP_PRIVATE_KEY` | PEM (may have literal `\n`) | admin |
| `GITHUB_APP_INSTALLATION_ID` | string (numeric) | admin |
| `SLACK_USER_MAP` | JSON object string `{"<slack_id>":"<email>"}` | admin |

## Client Package: `@myalterlego/secrets`

Source: `MyAlterLego/secrets` GitHub repo. Published to `https://npm.pkg.github.com` under the `@myalterlego` scope. Source URL: https://github.com/MyAlterLego/secrets.

### API

```typescript
import { getSecret, SecretNotFoundError } from '@myalterlego/secrets';

const token = await getSecret('SLACK_BOT_TOKEN');  // Promise<string>
```

### Behavior

- **Module-level cache:** 300-second TTL per key (configurable in v0.2+)
- **Lazy client init:** `SecretManagerServiceClient` not instantiated until first `getSecret` call
- **Single-flight:** concurrent calls during cache miss collapse to one fetch
- **Fallback chain:** vault → `process.env[name]` → `SecretNotFoundError`
- **Quiet fallback:** when vault fails but env value exists, returns env value silently (rollback path)

### Failure Modes

| Vault read | `process.env[name]` | Result |
|------------|---------------------|--------|
| success    | (any)               | returns vault value |
| fails      | set                 | returns env value silently (rollback) |
| fails      | unset               | throws `SecretNotFoundError` with vault console URL |

## IAM Model

Per-secret `roles/secretmanager.secretAccessor` granted to each consumer's App Hosting runtime service account. Minimum privilege — a project that does not consume `GITHUB_APP_*` does not get access to those secrets.

### Runtime service account resolution

Firebase App Hosting docs say the runtime SA is `firebase-app-hosting-compute@<firebase-project>.iam.gserviceaccount.com`. CONTEXT.md for v2.0 Phase 01 originally said `firebase-adminsdk-fbsvc@<project>...`. These are different SAs — granting to the wrong one causes silent `PERMISSION_DENIED` in production.

Resolution rule:

1. Run `gcloud iam service-accounts list --project=<firebase-project> --format="table(email)"`
2. If `firebase-app-hosting-compute@` appears → use that one (matches Firebase docs)
3. Else if `firebase-adminsdk-fbsvc@` appears → use that one (legacy fallback)
4. Else → contact GCP project admin; SA may have been deleted

The verified SA names for the existing two consumers are recorded in `.planning/phases/01-central-secrets-vault/01-03-IAM-GRANTS.md`.

### Granting access to a new project

See [`onboarding-projects.md` Step 7](onboarding-projects.md#step-7--grant-vault-access).

## Rotation Runbook

### Adding a new version of a secret

Secret Manager supports multiple versions per secret. Add a new version (the package always reads `latest`):

```bash
# Add a new version (replaces the live value within ~300s, the package's cache TTL)
echo -n "new-value-here" | gcloud secrets versions add SLACK_BOT_TOKEN \
  --project=triarch-vault \
  --data-file=-

# Verify
gcloud secrets versions list SLACK_BOT_TOKEN --project=triarch-vault --limit=3
# The newest version should be ENABLED; older versions remain (audit trail)
```

Cache propagation: each consumer's in-process cache holds the old value for up to 300 seconds. Restarting the App Hosting backend flushes the cache immediately. For routine rotation, a < 5-minute window of dual-read is acceptable.

### Disabling/destroying old versions

After confirming all consumers have moved to the new version (e.g. > 5 minutes since rotation):

```bash
# Disable the old version (revocable)
gcloud secrets versions disable 1 --secret=SLACK_BOT_TOKEN --project=triarch-vault

# Destroy the old version (irreversible — only after a quarantine period)
gcloud secrets versions destroy 1 --secret=SLACK_BOT_TOKEN --project=triarch-vault
```

### Closeout: removing the duplicate Firebase secret

During the v2.0 Phase 01 migration, the old per-project Firebase secrets (e.g. `SLACK_BOT_TOKEN` in `apphosting.yaml`) were left in place to provide a fallback path. Once both admin and CRM are confirmed reading from vault (via the `/api/platform/health/secrets` endpoint returning all-ok), the closeout step is to delete the duplicate Firebase secrets:

```bash
# On triarch-dev-website
firebase apphosting:secrets:destroy SLACK_BOT_TOKEN --project=triarch-dev-website
# Repeat for the 6 other shared keys

# Edit apphosting.yaml — remove the secret entries for the 6 shared keys
# (SLACK_BOT_TOKEN, SLACK_SIGNING_SECRET, SLACK_PAYLOAD_SECRET,
#  GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, GITHUB_APP_INSTALLATION_ID)
# Note: NODE_AUTH_TOKEN secret entry stays — needed for npm install
```

Closeout is **deferred** for v2.0 Phase 01 — it gets its own plan after migration is verified in production.

## Troubleshooting

| Symptom | Diagnosis | Fix |
|---------|-----------|-----|
| `getSecret` throws `SecretNotFoundError` | Vault returned an error AND `process.env[name]` is unset | Check IAM grant; check secret exists; check SA email |
| `getSecret` returns the wrong value | Stale cache after rotation | Wait 300s OR restart the App Hosting backend |
| `getSecret` succeeds but consumer still fails | Value is correct but format wrong (e.g. PEM newlines) | Check `GITHUB_APP_PRIVATE_KEY` consumers normalize `\n` → actual newlines |
| App Hosting logs show `PERMISSION_DENIED` for `SecretManagerService.AccessSecretVersion` | IAM grant missing for the runtime SA | Re-run grant per Step 7g of onboarding doc; wait 60s for propagation |
| Local dev `npm install @myalterlego/secrets` fails with `401` | Missing or invalid `NODE_AUTH_TOKEN` env var | `export NODE_AUTH_TOKEN=$(gh auth token)` before install |
| CI build fails with `404 Not Found` for `@myalterlego/secrets` | `.npmrc` missing or `NODE_AUTH_TOKEN` not exposed at BUILD | See onboarding Step 7a–7c |
| Two concurrent rotations land out of order | New version 5 is older than version 4 | Disable v4 explicitly with `gcloud secrets versions disable 5` then re-add as v6 |

## References

- Plan files (this milestone): `.planning/phases/01-central-secrets-vault/`
- IAM grant runbook (verified SA names): `.planning/phases/01-central-secrets-vault/01-03-IAM-GRANTS.md`
- Provisioning runbook (project + secrets): `.planning/phases/01-central-secrets-vault/01-01-VAULT-PROVISIONING.md`
- Package source: https://github.com/MyAlterLego/secrets
- Firebase App Hosting docs (runtime SA): https://firebase.google.com/docs/app-hosting/about-app-hosting
- GCP Secret Manager docs: https://docs.cloud.google.com/secret-manager
