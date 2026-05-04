---
phase: 04-github-app-promotion
verified: 2026-05-03T22:00:00Z
status: human_needed
score: 5/6 success criteria verified (SC-1 and SC-2 are intentionally human tasks; SC-3 through SC-6 all pass)
re_verification: false
human_verification:
  - test: "GitHub App created in MyAlterLego org with permissions actions:write / contents:read / metadata:read"
    expected: "App exists at https://github.com/organizations/MyAlterLego/settings/apps with exactly those three permission levels"
    why_human: "GitHub App creation is a browser/API action outside the codebase; cannot be verified programmatically"
  - test: "App installed on MyAlterLego org with admin-managed repo access"
    expected: "Installation record visible at https://github.com/organizations/MyAlterLego/settings/installations; installation ID matches GITHUB_APP_INSTALLATION_ID secret"
    why_human: "GitHub org installation state is external; no code artifact to check"
  - test: "GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, GITHUB_APP_INSTALLATION_ID pushed to App Hosting via firebase apphosting:secrets:set"
    expected: "Firebase Secret Manager holds all three values; App Hosting redeploy succeeds with no '[github-app] missing required env vars' errors in Cloud Run logs"
    why_human: "Secret values live in Firebase Secret Manager, not in the repo; push is a manual CLI step"
  - test: "Schema migration 0009_promotion_dispatch_audit.sql applied to production CockroachDB"
    expected: "SELECT column_name FROM information_schema.columns WHERE table_name = 'release_logs' AND column_name IN ('promotion_dispatched_at', 'promotion_dispatched_by') returns both rows"
    why_human: "db:push against production DATABASE_URL requires the Firebase secret not available in the repo shell; deferred per Phase 1 and Phase 2 precedent"
  - test: "End-to-end smoke test: Slack 'Approve and Promote' click triggers a real deploy-prod.yml run on a repo in MyAlterLego"
    expected: "GitHub Actions page shows a fresh deploy-prod.yml run started within seconds of the Slack click; DB row has promotion_dispatched_at and promotion_dispatched_by populated; Slack thread shows :rocket: reply"
    why_human: "Requires live GitHub App credentials, real Slack workspace, real CockroachDB — can only be executed by Mike following 04-HUMAN-UAT.md Steps 1-8"
---

# Phase 4: GitHub App Promotion — Verification Report

**Phase Goal:** A successful Slack-button approval dispatches the project's `deploy-prod.yml` via GitHub App installation token (not a PAT).
**Verified:** 2026-05-03T22:00:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| SC-1 | GitHub App created with actions:write / contents:read / metadata:read | ? HUMAN | External — browser/GitHub API; runbook at 04-HUMAN-UAT.md Steps 1-2 |
| SC-2 | App installed on org with admin-managed repos | ? HUMAN | External — org installation record; runbook Step 4 |
| SC-3 | Installation-token retrieval: JWT-signed exchange, cached 50 min, single-flight latch | VERIFIED | `TOKEN_TTL_MS = 50 * 60 * 1000` (line 18), `JWT_LIFETIME_S = 9 * 60` (line 20), `let inflight: Promise<string> | null = null` (line 16), single-flight try/finally (lines 90-98), 12 Vitest tests green |
| SC-4 | Credentials in App Hosting secrets (apphosting.yaml CODE side) | VERIFIED | apphosting.yaml lines 71-78: GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, GITHUB_APP_INSTALLATION_ID all declared RUNTIME-only; HUMAN push deferred to runbook Step 5 |
| SC-5 | Slack approve callback dispatches workflow_dispatch on deploy-prod.yml with `tag` input | VERIFIED | release-promotion.ts line 102: `workflowFile: 'deploy-prod.yml'`, line 103: `ref: 'main'`, line 104: `inputs: { tag: release.version }`; route.ts fire-and-forget call lines 176-184 |
| SC-6 | Slack callback returns 200 within 3 seconds — dispatch async (fire-and-forget) | VERIFIED | route.ts line 176: `promoteAndAudit({...})` — no `await`; `.catch` on line 182 is unhandled-rejection guard; return NextResponse.json fires immediately after (line 188) |

**Score:** 4/4 automated truths verified; 2/2 human truths correctly flagged for human verification

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/db/schema.ts` | promotionDispatchedAt + promotionDispatchedBy columns on releaseLogs | VERIFIED | Lines 151-152: both nullable, withTimezone:true, varchar(256) |
| `src/db/migrations/0009_promotion_dispatch_audit.sql` | Two ADD COLUMN statements, no constraints | VERIFIED | Exactly two ALTER TABLE statements; no NOT NULL, no DROP, no CONSTRAINT |
| `src/db/migrations/meta/_journal.json` | References 0009_promotion_dispatch_audit | VERIFIED | grep confirms 1 match |
| `src/lib/github-app.ts` | JWT signer + 50-min token cache + dispatchWorkflow | VERIFIED | All four public exports present; crypto.createSign('RSA-SHA256') at line 55 |
| `src/lib/github-app.test.ts` | 11+ Vitest tests covering cache lifecycle, single-flight, security | VERIFIED | 12 tests: signAppJwt describe + getInstallationToken describe + dispatchWorkflow describe; createVerify signature check present |
| `apphosting.yaml` | Three GITHUB_APP_* secret references | VERIFIED | Lines 71-78: all three variable/secret pairs, RUNTIME-only (no availability field) |
| `.planning/phases/04-github-app-promotion/04-HUMAN-UAT.md` | 8-step runbook with GitHub App setup, secret push, db migration, smoke test | VERIFIED | File exists; all 8 steps present; 9-checkbox verification gate |
| `src/lib/release-promotion.ts` | promoteAndAudit encapsulating dispatchWorkflow + DB audit + Slack helpers | VERIFIED | All key patterns present: dispatchWorkflow call, promotionDispatchedAt/By write, postSlackThreadedReply, updateSlackMessage on failure only |
| `src/lib/release-promotion.test.ts` | Vitest suite with mocked deps | VERIFIED | 14 tests; vi.mock for github-app, slack, db; updateSlackMessage not-called assertion on success path |
| `src/lib/slack.ts` | postSlackThreadedReply + updateSlackMessage exports | VERIFIED | Both exported; thread_ts field correct; chat.update URL correct; postSlackMessage remains private |
| `src/app/api/slack/interact/route.ts` | Fire-and-forget promoteAndAudit after approveRelease success | VERIFIED | Import at line 8; call at line 176 (no await); .catch at line 182; !alreadyApproved guard at line 173 |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `route.ts` | `release-promotion.ts` | `promoteAndAudit(...).catch(...)` — no await | WIRED | Line 176: bare call, no await; .catch on line 182 |
| `release-promotion.ts` | `github-app.ts` | `dispatchWorkflow({ workflowFile: 'deploy-prod.yml', ref: 'main', inputs: { tag: release.version } })` | WIRED | Lines 99-105 |
| `release-promotion.ts` | `releaseLogs` (schema) | `db.update(releaseLogs).set({ promotionDispatchedAt, promotionDispatchedBy })` | WIRED | Lines 115-121; columns exist in schema.ts |
| `release-promotion.ts` | `slack.ts` | `postSlackThreadedReply` + `updateSlackMessage` (failure path only) | WIRED | postSlackThreadedReply on lines 50, 73, 125, 134; updateSlackMessage on lines 55, 78, 139 — confirmed absent from dispatchOk=true return block (lines 123-131) |
| `github-app.ts` | `process.env.GITHUB_APP_ID` | `readEnv()` at call time, not import time | WIRED | Lines 28-41: all three env vars read inside readEnv() |
| `apphosting.yaml` | `github-app.ts` | GITHUB_APP_ID/PRIVATE_KEY/INSTALLATION_ID secret bindings consumed by readEnv | WIRED (code side) | apphosting.yaml declares all three; human push pending |

---

## Must-Have Security Properties Verified

| Property | Check | Status |
|----------|-------|--------|
| RS256 via crypto.createSign (no jsonwebtoken/octokit) | `grep -c "createSign('RSA-SHA256')" github-app.ts` = 1; `grep -c "jsonwebtoken|@octokit"` = 0 | VERIFIED |
| TOKEN_TTL_MS = 50 * 60 * 1000 (50-min cache) | Line 18 | VERIFIED |
| JWT_LIFETIME_S = 9 * 60 (9-min lifetime, 1-min under ceiling) | Line 20 | VERIFIED |
| JWT_PAST_SKEW_S = 60 (60-sec iat backdate) | Line 19 | VERIFIED |
| Single-flight latch: `let inflight: Promise<string> | null = null` | Line 16; try/finally clears it on both success and error | VERIFIED |
| Token NEVER logged in template strings | `grep -cE "console.*\${token}"` = 0; `grep -cE "console.*\${jwt}"` = 0 | VERIFIED |
| Private key NEVER logged | `grep -cE "console.*privateKey"` = 0 | VERIFIED |
| chat.update called ONLY on dispatch failure (not on success) | Lines 123-131 (dispatchOk=true branch): only postSlackThreadedReply + return; updateSlackMessage is at line 139 (failure path only) | VERIFIED |
| dispatch is fire-and-forget (`await promoteAndAudit` = 0) | `grep -cE "await promoteAndAudit"` = 0 | VERIFIED |
| DB audit columns written on dispatch ATTEMPT (success or failure); NOT written on project-lookup failure | Lines 115-121 are AFTER the try/catch, BEFORE the dispatchOk branch; project-lookup failures return early before reaching this block | VERIFIED |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| GATE-10 | 04-04 | Slack approve callback dispatches workflow_dispatch on deploy-prod.yml with `tag` input; non-blocking | VERIFIED (code) | route.ts fire-and-forget; release-promotion.ts dispatch call with inputs={tag:release.version}; human smoke test pending |
| GATE-11 | 04-01, 04-02, 04-04 | Dispatch uses GitHub App installation token (NOT PAT) | VERIFIED (code) | github-app.ts: JWT exchange for installation token; no GITHUB_TOKEN PAT used in dispatchWorkflow path |
| GATE-11a | 04-03 | GitHub App created with actions:write, contents:read, metadata:read | HUMAN NEEDED | Runbook documents correct permissions; human must create the App and verify scopes |
| GATE-11b | 04-02 | Installation-token retrieval: JWT-signed, cached 50 min, regenerated on miss | VERIFIED | TOKEN_TTL_MS, JWT_LIFETIME_S, single-flight latch all confirmed; 12-test Vitest suite green |
| ENV-G01 | 04-03 | GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, GITHUB_APP_INSTALLATION_ID in App Hosting secrets | CODE VERIFIED / PUSH HUMAN | apphosting.yaml declares all three; firebase apphosting:secrets:set push is Mike's task |

Note: REQUIREMENTS.md tracking table correctly marks GATE-10, GATE-11, GATE-11a, GATE-11b as "Pending" (awaiting human smoke test close-out) and ENV-G01 as "Complete" (code side). Both statuses are accurate given the intentional HUMAN-UAT deferral.

---

## Anti-Patterns Scan

No blockers or stubs found in phase-modified files. Specific checks:

| File | Pattern | Finding |
|------|---------|---------|
| `src/lib/github-app.ts` | Placeholder returns / empty implementations | None — all three public functions have real implementations |
| `src/lib/github-app.ts` | Token logged in template string | None — `${token}` never appears in a console call |
| `src/lib/release-promotion.ts` | `return null / return {}` stubs | None — all code paths return `{ ok, error? }` with real logic |
| `src/app/api/slack/interact/route.ts` | `await promoteAndAudit` (timing violation) | None — confirmed 0 occurrences |
| `src/app/api/slack/interact/route.ts` | Missing .catch on fire-and-forget | None — `.catch((err) => console.error(...))` at line 182 |
| `src/lib/slack.ts` | postSlackMessage accidentally exported | None — 0 lines matching `^export.*postSlackMessage` |

---

## Human Verification Required

### 1. GitHub App Creation (SC-1, GATE-11a)

**Test:** Follow 04-HUMAN-UAT.md Steps 1-2: create the GitHub App in MyAlterLego org and set permissions.
**Expected:** App exists at the org settings URL; Actions=Read and write, Contents=Read-only, Metadata=Read-only — no other permissions granted.
**Why human:** GitHub App creation is a browser action in the GitHub organization admin UI; cannot be automated or verified from the repo.

### 2. Org Installation (SC-2)

**Test:** Follow 04-HUMAN-UAT.md Step 4: install the App on MyAlterLego org with access to all admin-managed repos.
**Expected:** Installation visible at https://github.com/organizations/MyAlterLego/settings/installations; installation ID matches GITHUB_APP_INSTALLATION_ID secret value.
**Why human:** Org-level GitHub App installation is an interactive action in the GitHub UI.

### 3. Secret Push to App Hosting (SC-4 / ENV-G01 runtime side)

**Test:** Follow 04-HUMAN-UAT.md Step 5: run `firebase apphosting:secrets:set` for all three secrets; trigger a redeploy; confirm no `[github-app] missing required env vars` in Cloud Run logs.
**Expected:** All three secret bindings accepted; next App Hosting deploy starts cleanly.
**Why human:** Firebase Secret Manager push requires CLI credentials and is outside the repo; DATABASE_URL is itself a Firebase secret not available in shell.

### 4. Schema Migration Push (GATE-11 runtime dependency)

**Test:** Follow 04-HUMAN-UAT.md Step 6: apply `0009_promotion_dispatch_audit.sql` to production CockroachDB; verify both columns appear in `information_schema.columns`.
**Expected:** `release_logs` has `promotion_dispatched_at` (timestamp with time zone, nullable) and `promotion_dispatched_by` (varchar 256, nullable).
**Why human:** `db:push` requires `DATABASE_URL` which is a Firebase App Hosting secret, not available in local shell; same precedent as Phase 01-01 and Phase 02-01.

### 5. End-to-End Smoke Test (SC-5 + SC-6 live verification)

**Test:** Follow 04-HUMAN-UAT.md Step 8 (requires Plan 04-04 and all secrets deployed): sign in to admin.triarch.dev, navigate to a project with a `deploy-prod.yml` workflow, approve a dev release, click "Approve and Promote" in Slack.
**Expected:**
- Slack respond-to-action returns within 3 seconds (original message updates to ":white_check_mark: Promoted")
- Within ~10 seconds, a threaded :rocket: reply appears with the workflow dispatch confirmation
- GitHub Actions page shows a fresh `deploy-prod.yml` run with `tag` input matching the release version
- DB row: `promotion_dispatched_at` and `promotion_dispatched_by` populated
**Why human:** Requires live GitHub App credentials, Slack workspace interaction, real CockroachDB, and real GitHub Actions — cannot be simulated with code inspection or unit tests.

---

## Summary

Phase 4's code is fully shipped and substantive. Every automated truth passes:

- `src/lib/github-app.ts` implements the exact RS256/JWT/50-min-cache/single-flight design specified; 12 Vitest tests cover the full contract including credential-leak guards.
- `src/lib/release-promotion.ts` orchestrates the promotion chain correctly: project lookup, dispatchWorkflow, DB audit on attempt (not just success), threaded Slack reply, and chat.update strictly on failure.
- `src/app/api/slack/interact/route.ts` fires `promoteAndAudit` without `await` — the Slack 3-second rule is respected by construction.
- `apphosting.yaml` declares all three GitHub App secret references at RUNTIME-only availability.
- `src/db/migrations/0009_promotion_dispatch_audit.sql` is a clean additive migration (2 ALTER TABLE ADD COLUMN, no constraints, no drops).

The phase status is `human_needed` because two success criteria are explicitly Mike's tasks (GitHub App creation + org installation) and three operational items depend on live credentials (secret push, db:push, smoke test). All five of these are captured in `04-HUMAN-UAT.md` with step-by-step instructions, a 9-checkbox verification gate, rotation policy, and troubleshooting section. None of the deferred items reflect a code gap — they are intentional handoffs documented at plan authoring time.

---

_Verified: 2026-05-03T22:00:00Z_
_Verifier: Claude (gsd-verifier)_
