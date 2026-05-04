# 01-01 Vault Provisioning Runbook

> Reproducible record of all `gcloud` commands executed to provision the
> `triarch-vault` GCP project and populate it with the seven shared secrets.
> Generated 2026-05-04.

---

## Step 1 — Project creation

```bash
$ gcloud projects create triarch-vault \
    --name="Triarch Vault" \
    --set-as-default
Create in progress for https://cloudresourcemanager.googleapis.com/v1/projects/triarch-vault.
Waiting for [operations/create_project.global.6622878684825865839] to finish...
..done.
Enabling service [cloudapis.googleapis.com] on project [triarch-vault]...
Operation finished successfully.
Updated property [core/project] to [triarch-vault].
```

## Step 2 — Billing link

```bash
$ gcloud billing projects link triarch-vault \
    --billing-account=XXXXXX-XXXXXX-60242F
billingAccountName: billingAccounts/XXXXXX-XXXXXX-60242F
billingEnabled: true
name: projects/triarch-vault/billingInfo
projectId: triarch-vault
```

(Same billing account already linked to `triarch-dev-website` — last 6 chars `60242F`.)

## Step 3 — Secret Manager API enabled

```bash
$ gcloud services enable secretmanager.googleapis.com --project=triarch-vault
Operation "operations/acat.p2-125442121919-5ee376bb-270a-467b-876c-946238134ba1" finished successfully.
```

## Step 4 — Verification

```bash
$ gcloud projects describe triarch-vault --format="value(projectId,name,lifecycleState)"
triarch-vault    Triarch Vault    ACTIVE

$ gcloud services list --project=triarch-vault --filter="name:secretmanager" --format="value(name,state)"
projects/125442121919/services/secretmanager.googleapis.com    ENABLED

$ gcloud beta billing projects describe triarch-vault --format="value(billingAccountName,billingEnabled)"
billingAccounts/XXXXXX-XXXXXX-60242F    True
```

Project `triarch-vault` (numeric ID `125442121919`) is `ACTIVE` with Secret Manager
API `ENABLED` and billing linked.

## Step 5 — Secret values captured (REDACTED)

Captured 7 secret values to `/tmp/vault-secret-values/` (chmod 700, gitignored,
deleted after Step 9).

| Secret | Source | Bytes |
|--------|--------|-------|
| SLACK_BOT_TOKEN | `firebase apphosting:secrets:access` (triarch-dev-website) | 60 |
| SLACK_SIGNING_SECRET | `firebase apphosting:secrets:access` (triarch-dev-website) | 33 |
| SLACK_PAYLOAD_SECRET | `firebase apphosting:secrets:access` (triarch-dev-website) | 46 |
| GITHUB_APP_ID | `firebase apphosting:secrets:access` (triarch-dev-website) | 9 |
| GITHUB_APP_PRIVATE_KEY | `firebase apphosting:secrets:access` (triarch-dev-website) | 1676 |
| GITHUB_APP_INSTALLATION_ID | `firebase apphosting:secrets:access` (triarch-dev-website) | 11 |
| SLACK_USER_MAP | hand-built JSON from `src/lib/slack-identity.ts` | 42 |

## Step 6 — Secrets created in vault

```bash
$ gcloud secrets list --project=triarch-vault --format="value(name)" | sort
GITHUB_APP_ID
GITHUB_APP_INSTALLATION_ID
GITHUB_APP_PRIVATE_KEY
SLACK_BOT_TOKEN
SLACK_PAYLOAD_SECRET
SLACK_SIGNING_SECRET
SLACK_USER_MAP
```

All 7 secrets created with `--replication-policy=automatic` (Google-managed
multi-region per CONTEXT.md D-03) and labels
`managed-by=v2-0-phase-1,key-type=shared-credential`.

## Step 7 — Versions added

```bash
$ for KEY in SLACK_BOT_TOKEN SLACK_SIGNING_SECRET SLACK_PAYLOAD_SECRET \
             GITHUB_APP_ID GITHUB_APP_PRIVATE_KEY GITHUB_APP_INSTALLATION_ID SLACK_USER_MAP; do
    gcloud secrets versions list "$KEY" --project=triarch-vault --limit=1 --format="value(name,state)"
  done
SLACK_BOT_TOKEN                1    enabled
SLACK_SIGNING_SECRET           1    enabled
SLACK_PAYLOAD_SECRET           1    enabled
GITHUB_APP_ID                  1    enabled
GITHUB_APP_PRIVATE_KEY         1    enabled
GITHUB_APP_INSTALLATION_ID     1    enabled
SLACK_USER_MAP                 1    enabled
```

## Step 8 — Round-trip verification

Read `SLACK_USER_MAP` via `gcloud secrets versions access latest`:

```bash
$ gcloud secrets versions access latest --secret=SLACK_USER_MAP --project=triarch-vault
{"U0AJM4MP2N6":"mike@triarchsecurity.com"}
```

End-to-end vault read confirmed for the only secret with a non-sensitive
known value.

## Step 9 — Cleanup

`/tmp/vault-secret-values/` removed. No captured secret files remain on disk.
