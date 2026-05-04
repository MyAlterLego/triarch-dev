---
phase: 03-slack-interactive-approval
plan: "01"
subsystem: security/crypto
tags: [slack, crypto, hmac, identity, vitest, tdd]
dependency_graph:
  requires: []
  provides:
    - signPayload (src/lib/slack-crypto.ts)
    - verifyPayload (src/lib/slack-crypto.ts)
    - verifySlackSignature (src/lib/slack-crypto.ts)
    - SLACK_USER_MAP (src/lib/slack-identity.ts)
    - resolveSlackUserEmail (src/lib/slack-identity.ts)
  affects:
    - 03-03 (notifyReleaseApproved uses signPayload for button values)
    - 03-04 (interact route uses verifyPayload + verifySlackSignature + resolveSlackUserEmail)
tech_stack:
  added:
    - vitest ^4.1.5 (test runner — no prior test infra in project)
    - "@vitest/ui ^4.1.5"
  patterns:
    - HMAC-SHA256 via node:crypto (no new deps)
    - timingSafeEqual for all cryptographic comparisons
    - Secrets read at call time (not module load) for apphosting.yaml compatibility
    - TDD red-green commit cycle
key_files:
  created:
    - src/lib/slack-crypto.ts
    - src/lib/slack-identity.ts
    - src/lib/__tests__/slack-crypto.test.ts
  modified:
    - package.json (vitest + @vitest/ui added as devDependencies; test/test:watch scripts added)
decisions:
  - "Packed payload uses '.' separator (not JWT) — compact within Slack 2000-char value limit"
  - "safeEqHex compares hex strings by converting to Buffer — timingSafeEqual requires equal-length buffers"
  - "safeEqB64url compares base64url strings as UTF-8 Buffers — correct because both sides encode same-length HMAC output"
  - "SLACK_USER_MAP initially empty — Mike populates during HUMAN-UAT (plan 03-05)"
  - "verifySlackSignature accepts injectable now param for deterministic replay-window tests"
  - "Boundary condition: 300s drift accepted (not stale) — Math.abs > 300 means 301+ is stale"
metrics:
  duration_secs: 134
  completed_date: "2026-05-04"
  tasks_completed: 2
  tasks_total: 2
  files_created: 3
  files_modified: 1
  tests_added: 20
---

# Phase 03 Plan 01: Crypto + Identity Foundation Summary

**One-liner:** HMAC-SHA256 payload signing and Slack v0 signature verification primitives with timingSafeEqual throughout, plus hardcoded SLACK_USER_MAP identity resolver — full Vitest suite (20 tests) covering round-trip, tamper, stale, and no-secret paths.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 (RED) | slack-crypto tests (failing) | 00b07e8 | src/lib/__tests__/slack-crypto.test.ts, package.json |
| 1 (GREEN) | slack-crypto.ts primitives | 497e19e | src/lib/slack-crypto.ts, package.json |
| 2 | slack-identity.ts | a546d86 | src/lib/slack-identity.ts |

## What Was Built

### src/lib/slack-crypto.ts

Three exported functions:

- **signPayload(releaseId, action, nonce?)** — signs a release action for embedding in a Slack button value. Format: `{releaseId}.{nonce}.{base64url(HMAC-SHA256(SLACK_PAYLOAD_SECRET, "{releaseId}:{action}:{nonce}"))}`. Nonce auto-generated via `crypto.randomBytes(8).toString('hex')` if omitted.

- **verifyPayload(packed, expectedAction)** — splits the packed value, recomputes the HMAC for the given action, compares via `timingSafeEqual`. Returns typed result: `{ ok: true, releaseId, nonce }` or `{ ok: false, reason: 'malformed' | 'bad_signature' | 'no_secret' }`.

- **verifySlackSignature({ rawBody, timestamp, signature, now? })** — implements the Slack v0 signing scheme exactly: `v0:{ts}:{body}` basestring, hex HMAC with `SLACK_SIGNING_SECRET`, 5-minute replay window, constant-time comparison. Returns `{ ok: true }` or `{ ok: false, reason: 'no_secret' | 'stale' | 'bad_signature' | 'malformed' }`.

Internal helpers `safeEqHex` and `safeEqB64url` use `timingSafeEqual` from `node:crypto` — no raw `===` on any cryptographic material.

### src/lib/slack-identity.ts

- **SLACK_USER_MAP** — exported `Record<string, string>` keyed by Slack `user_id`, value is staff email. Initially empty; Mike populates during HUMAN-UAT (plan 03-05).
- **resolveSlackUserEmail(userId)** — returns the mapped email or `null` for unmapped/null/undefined input.

### src/lib/__tests__/slack-crypto.test.ts

20 Vitest tests across two describe blocks:

- signPayload/verifyPayload: round-trip with explicit nonce, auto-generated nonce, wrong action, tampered sig byte, tampered releaseId, malformed (2 segments), malformed (empty segment), no_secret in verify, no_secret throws in sign.
- verifySlackSignature: round-trip fixture, stale (>300s), boundary (exactly 300s accepted), tampered sig byte, tampered body, wrong secret, no_secret, null timestamp, null signature, missing v0= prefix, non-numeric timestamp.

### Test Infrastructure

Vitest was not present in the project. Installed `vitest ^4.1.5` and `@vitest/ui ^4.1.5` as devDependencies. Added `test` and `test:watch` scripts to package.json.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Vitest not installed**
- **Found during:** Task 1 setup
- **Issue:** package.json had no test runner — plan requires `npx vitest run` but the binary was absent
- **Fix:** `npm install --save-dev vitest @vitest/ui`; added `test`/`test:watch` scripts to package.json
- **Files modified:** package.json, package-lock.json
- **Commit:** 00b07e8 (included in RED phase commit)

**2. [Rule 2 - Correctness] Doc comment pattern matched user_id grep check**
- **Found during:** Task 2 acceptance verification
- **Issue:** JSDoc example `"U01ABCDEF"` matched the `grep -E "U[0-9A-Z]{8,}"` acceptance check (9-char pattern). The plan specifies "no real Slack user_ids hardcoded — TODO comment only"
- **Fix:** Removed the inline example from the doc comment — the TODO comment in the map body is sufficient per plan intent
- **Files modified:** src/lib/slack-identity.ts

## Known Stubs

- `SLACK_USER_MAP` is intentionally empty. This is not a data stub that prevents plan goals — the plan explicitly states Mike populates it during HUMAN-UAT (plan 03-05). The resolver is fully functional; it will return `null` until entries are added.

## Self-Check: PASSED

Files confirmed present:
- src/lib/slack-crypto.ts — FOUND
- src/lib/slack-identity.ts — FOUND
- src/lib/__tests__/slack-crypto.test.ts — FOUND

Commits confirmed:
- 00b07e8 — FOUND (RED phase)
- 497e19e — FOUND (GREEN phase + implementation)
- a546d86 — FOUND (Task 2)

Verification results:
- `npx vitest run src/lib/__tests__/slack-crypto.test.ts` — 20/20 passed
- `npx tsc --noEmit` — clean
- `grep -c "timingSafeEqual" src/lib/slack-crypto.ts` — 4 (>= 2 required)
- `grep -E "===\s*sig|sig\s*===" src/lib/slack-crypto.ts` — 0 matches (GOOD)
