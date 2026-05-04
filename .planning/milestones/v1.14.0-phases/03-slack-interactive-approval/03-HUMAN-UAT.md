# Phase 3 HUMAN-UAT: Slack Interactive Approval

Phase 3 ships secure code that depends on real-world Slack configuration. This runbook is the human-side setup. Run through it once for production, once for any new env (staging, preview).

## Prerequisites

- Phase 3 plans 01-04 deployed (code is on https://admin.triarch.dev)
- Firebase CLI logged in to the triarch-dev-admin project
- Workspace admin access to the Slack workspace where #release-approvals lives

## Step 1 — Create the Slack App

1. Visit https://api.slack.com/apps → "Create New App" → "From scratch"
2. App Name: `Triarch Release Gate` (or similar)
3. Workspace: select your workspace
4. After creation, you land on the app's Basic Information page. Note the **Signing Secret** under "App Credentials" — copy it now.

## Step 2 — Add bot scope and install

1. Sidebar → OAuth & Permissions
2. Scroll to "Scopes" → "Bot Token Scopes" → Add `chat:write`
3. Top of page → "Install to Workspace" → approve
4. After install, copy the **Bot User OAuth Token** (starts with `xoxb-`)

## Step 3 — Generate the payload secret

Run locally:

```bash
openssl rand -base64 32
```

Copy the output. This is `SLACK_PAYLOAD_SECRET` — distinct from the Slack signing secret.

## Step 4 — Push secrets to App Hosting

From the admin repo root:

```bash
firebase apphosting:secrets:set SLACK_BOT_TOKEN
# paste the xoxb- token from Step 2

firebase apphosting:secrets:set SLACK_SIGNING_SECRET
# paste the signing secret from Step 1

firebase apphosting:secrets:set SLACK_PAYLOAD_SECRET
# paste the openssl output from Step 3
```

Then redeploy (next push to main triggers App Hosting).

## Step 5 — Wire interactivity

Back in https://api.slack.com/apps → your app → "Interactivity & Shortcuts":

1. Toggle "Interactivity" ON
2. Request URL: `https://admin.triarch.dev/api/slack/interact`
3. Save

Slack will ping the URL once with a verification request — the route should accept it (verifySlackSignature passes; payload type !== block_actions returns 400, but Slack is satisfied with the 4xx as long as the signature verifies).

If you see Slack complain about the URL, tail the Cloud Run logs and look for `[slack-interact]` warnings.

## Step 6 — Invite the bot to the channel

In Slack:

```
/invite @Triarch Release Gate
```

in `#release-approvals` (or whatever channel SLACK_RELEASE_APPROVAL_CHANNEL is set to in apphosting.yaml).

## Step 7 — Populate SLACK_USER_MAP

The signed-in staff identity that clicks Approve/Reject in Slack must map to a real staff email (so the audit row's approver_email is correct).

1. In Slack, click your profile photo → "..." menu → "Copy member ID"
2. Open `src/lib/slack-identity.ts`
3. Replace the placeholder comment with:
   ```ts
   export const SLACK_USER_MAP: Record<string, string> = {
     'U01ABCDEF': 'mike@triarchsecurity.com', // Mike — replace with your actual member ID
   };
   ```
4. Commit + push (version bump per CLAUDE.md)

## Step 8 — End-to-end smoke test

1. Sign in to https://admin.triarch.dev as a customer-admin email of a project (e.g. mike@mikegeehan.com on darksouls-rpg, or seed a test project)
2. Navigate to /projects/darksouls-rpg/releases
3. On a release in `dev` status, click "Approve for Production" → confirm
4. Within a few seconds, a message lands in `#release-approvals` with two buttons
5. As mike@triarchsecurity.com (mapped Slack user), click "Approve & Promote"
6. Message updates to ":white_check_mark: Promoted to production by @mike (mike@triarchsecurity.com)"
7. Verify in DB: `release_logs.status = 'approved'`, second `release_approvals` row exists with approver_email='mike@triarchsecurity.com'

Re-click the same button → ephemeral "Already promoted by ... on ..." message; no new audit row.

## Verification checklist

- [ ] Slack App created with chat:write scope
- [ ] Three secrets pushed via `firebase apphosting:secrets:set`
- [ ] Interactivity Request URL set to https://admin.triarch.dev/api/slack/interact
- [ ] Bot invited to #release-approvals
- [ ] SLACK_USER_MAP populated and pushed
- [ ] End-to-end smoke test passed (steps 8.1-8.7)
- [ ] Re-click idempotency confirmed (step 8 final paragraph)

## Rotation

To rotate any secret (Slack-issued or self-generated):

```bash
firebase apphosting:secrets:set <KEY>
# paste new value
```

Then trigger a redeploy (push a no-op version bump). No grace window — old secret invalidates immediately. (CONTEXT.md Area 2: dual-secret rotation is a deferred idea.)

## Troubleshooting

- **Approve clicked, no Slack message:** check Cloud Run logs for `[slack]` warnings — likely SLACK_BOT_TOKEN unset or bot not in channel
- **Slack button click → "Verification failed" toast:** check Cloud Run logs for sig.reason — bad_signature means SLACK_SIGNING_SECRET mismatch; stale means clock skew
- **Slack button click → "not mapped to a staff account":** SLACK_USER_MAP missing the clicker's user_id; refer back to Step 7
- **DB shows status updated but Slack message didn't update:** response_url failures — Slack will sometimes timeout the in-channel update; the DB action still committed
