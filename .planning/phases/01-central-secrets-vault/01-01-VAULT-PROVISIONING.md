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
