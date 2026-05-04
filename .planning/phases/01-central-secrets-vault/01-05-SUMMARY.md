---
phase: 01-central-secrets-vault
plan: 05
subsystem: api

requires:
  - phase: 01-central-secrets-vault
    provides: "@myalterlego/secrets@0.1.0 published, IAM grants for CRM SA on SLACK_BOT_TOKEN + SLACK_SIGNING_SECRET"
provides:
  - "CRM (triarchsecurity-admin) reads Slack creds from triarch-vault via @myalterlego/secrets"
  - "CRM has working .npmrc + NODE_AUTH_TOKEN wiring for @myalterlego/* packages"
  - "GITHUB_PACKAGES_TOKEN Firebase secret created on triarchsecurity-admin (reused admin's value)"
affects: [01-06]

tech-stack:
  added:
    - "@myalterlego/secrets@^0.1.0"
  patterns:
    - "Per-call vault read with env fallback rollback (CONTEXT D-12)"
    - "BUILD-only NODE_AUTH_TOKEN binding via apphosting.yaml availability"

key-files:
  created:
    - ../../../security/admin/.npmrc
  modified:
    - ../../../security/admin/apphosting.yaml (+NODE_AUTH_TOKEN BUILD secret entry)
    - ../../../security/admin/package.json (3.36.1 → 3.37.0, +@myalterlego/secrets)
    - ../../../security/admin/src/lib/slack.ts (getSlackClient + getSlackSigningSecret use vault)

key-decisions:
  - "Reused admin app's GITHUB_PACKAGES_TOKEN value for CRM (one PAT, two Firebase secrets)"
  - "settings table rows for slack_bot_token and slack_signing_secret kept (closeout deferred)"
  - "getChannels() left untouched — channels are not credentials, out of VAULT-06 scope"

patterns-established:
  - "CRM migration shape: vault read in try/catch → env fallback → throw on both missing"

requirements-completed: [VAULT-06]

duration: ~10min
completed: 2026-05-04
---

# Phase 01 Plan 01-05 Summary

**CRM (`triarchsecurity-admin`) now reads SLACK_BOT_TOKEN and SLACK_SIGNING_SECRET from the central triarch-vault. New `.npmrc` + `apphosting.yaml` `NODE_AUTH_TOKEN` BUILD wiring permits `@myalterlego/*` package installs in CI. CRM build green, version bumped to 3.37.0.**

## Performance

- **Tasks:** 3 (Task 1 Firebase secret creation, Task 2 npmrc + install, Task 3 code migration)
- **Files modified:** 4 (1 new, 3 edited) in CRM repo + 1 Firebase secret created
- **Build:** `next build` green
- **Completed:** 2026-05-04

## Accomplishments

- Created `GITHUB_PACKAGES_TOKEN` secret on `triarchsecurity-admin` Firebase project (reused value from admin project's existing secret per plan recommendation)
- Created CRM `.npmrc` (`@myalterlego` scope → npm.pkg.github.com)
- Added `NODE_AUTH_TOKEN` BUILD-only entry to CRM `apphosting.yaml` bound to `GITHUB_PACKAGES_TOKEN`
- Installed `@myalterlego/secrets@^0.1.0`; verified `npm ls` resolves
- Migrated `getSlackClient()` and `getSlackSigningSecret()` to read from vault first, env fallback as rollback
- Removed `crmQuery('SELECT value FROM settings ... slack_bot_token / slack_signing_secret')` lookups
- Bumped version 3.36.1 → 3.37.0

## Task Commits

Commits in CRM repo (`MyAlterLego/triarchsecurity-admin`):
1. **`v3.37.0: migrate slack creds to @myalterlego/secrets`** — single commit covers .npmrc + apphosting.yaml + package.json + slack.ts (`5f0814f`)

Note: Plan 01-01 created the GITHUB_PACKAGES_TOKEN Firebase secret outside the repo (no commit).

## Files Created/Modified

| File | Change |
|------|--------|
| `~/claude/triarch/security/admin/.npmrc` | NEW — 2-line GitHub Packages registry config |
| `~/claude/triarch/security/admin/apphosting.yaml` | Added `NODE_AUTH_TOKEN` ⇒ `GITHUB_PACKAGES_TOKEN` at `BUILD` |
| `~/claude/triarch/security/admin/package.json` | 3.36.1 → 3.37.0, `+@myalterlego/secrets ^0.1.0` |
| `~/claude/triarch/security/admin/src/lib/slack.ts` | `getSlackClient` + `getSlackSigningSecret` read from vault |

## Decisions Made

- Reused admin's `GITHUB_PACKAGES_TOKEN` PAT value for CRM (sharing the same `ghp_...` token across both Firebase projects). Tradeoff: one PAT to rotate vs separate fine-grained PATs. Chose reuse for simpler rotation per plan recommendation.

## Deviations from Plan

**No code deviations.** One workflow side-quirk:

`firebase apphosting:secrets:set --data-file=...` correctly created the secret + version, then errored on the interactive "add to apphosting.yaml?" prompt (we're not in a TTY). Secret itself created successfully — verified via `firebase apphosting:secrets:access`. The apphosting.yaml entry was added manually in Task 2 instead.

## Issues Encountered

- 8 npm audit moderate/high vulnerabilities surfaced during install (carry-over from existing CRM deps, not introduced by `@myalterlego/secrets` which has 0 vulns). Out of scope for this plan.

## User Setup Required

After this plan deploys to CRM (next push to `MyAlterLego/triarchsecurity-admin` main):
1. CI/CD via shared-workflows runs `npm ci` — `.npmrc` + `NODE_AUTH_TOKEN` should resolve `@myalterlego/secrets`
2. Firebase App Hosting deploy reads `GITHUB_PACKAGES_TOKEN` secret at BUILD via `NODE_AUTH_TOKEN`
3. Runtime calls `getSlackClient()` → `getSecret('SLACK_BOT_TOKEN')` → IAM grant to `firebase-app-hosting-compute@triarchsecurity-admin` lets it read from `triarch-vault`
4. Functional smoke: trigger a CRM bug report or feature request — Slack notification should still appear in `#triarch-bugs` or `#triarch-features`

`settings` table rows for `slack_bot_token` and `slack_signing_secret` are NOT deleted in this plan (closeout deferred per CONTEXT.md). They are now dead weight.

## Next Phase Readiness

- Plan 01-06 (docs) can proceed
- After Plan 01-06: deploy admin (`MyAlterLego/triarch-dev` main push) and CRM (`MyAlterLego/triarchsecurity-admin` main push). Both get version bump in commit message and trigger shared-workflows CI/CD.

---
*Phase: 01-central-secrets-vault*
*Completed: 2026-05-04*
