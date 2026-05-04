---
phase: 04-github-app-promotion
plan: "02"
subsystem: auth
tags: [github-app, jwt, rsa, rs256, crypto, vitest, installation-token, single-flight, caching]

# Dependency graph
requires:
  - phase: 03-slack-interactive-approval
    provides: "vitest.config.ts configured with @/ alias + node environment; slack.ts env-at-call-time pattern"

provides:
  - "src/lib/github-app.ts: signAppJwt (RS256 via Node built-in crypto), getInstallationToken (50-min cached, single-flight), dispatchWorkflow, resetTokenCacheForTests"
  - "src/lib/github-app.test.ts: 11 Vitest tests covering cache lifecycle, single-flight latch, error paths, security guarantees"

affects:
  - 04-03 (apphosting.yaml secret bindings for GITHUB_APP_ID/PRIVATE_KEY/INSTALLATION_ID)
  - 04-04 (slack/interact route imports dispatchWorkflow from @/lib/github-app)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "RS256 JWT signing via crypto.createSign('RSA-SHA256') — no new dependency (mirrors raw-fetch pattern from github-push.ts)"
    - "Module-level single-flight latch: let inflight: Promise<string> | null = null cleared in try/finally"
    - "50-min installation token cache (10-min margin under GitHub's 60-min lifetime)"
    - "Env vars read inside readEnv() at call time, not module top — enables test env mutation without re-import"
    - "Firebase \n normalization: replace(/\\\\n/g, '\\n') on GITHUB_APP_PRIVATE_KEY before PEM parsing"

key-files:
  created:
    - src/lib/github-app.ts
    - src/lib/github-app.test.ts
  modified: []

key-decisions:
  - "JWT iat=now-60s, exp=now+9min: 60-sec past-skew handles clock drift; 1-min margin under GitHub's 10-min ceiling"
  - "Token TTL is 50 min not 60 min: 10-min safety margin; fresh tokens last 60 min per GitHub docs"
  - "Single-flight latch prevents thundering-herd JWT signing — concurrent callers share one in-flight Promise"
  - "Error messages contain GitHub's response body only — never echo the JWT, PEM, or installation token"
  - "Test file co-located as github-app.test.ts (not in __tests__/) per plan spec; uses ad-hoc RSA keypair from generateKeyPairSync"

patterns-established:
  - "module-tag log prefix [github-app] matches [slack] pattern from slack.ts"
  - "Exported resetTokenCacheForTests() test helper — keeps test isolation without vi.mock('node:crypto')"

requirements-completed:
  - GATE-11
  - GATE-11b

# Metrics
duration: 2min
completed: "2026-05-04"
---

# Phase 04 Plan 02: GitHub App Auth Library Summary

**RS256 JWT signer + 50-min installation token cache + single-flight latch via Node built-in crypto, with 11-test Vitest suite covering cache lifecycle, concurrency, and credential-leak guards**

## Performance

- **Duration:** 2 min
- **Started:** 2026-05-04T14:57:54Z
- **Completed:** 2026-05-04T15:00:14Z
- **Tasks:** 2 (TDD: RED + GREEN for each)
- **Files modified:** 2

## Accomplishments

- Built `src/lib/github-app.ts` with `signAppJwt` (RS256), `getInstallationToken` (50-min cache + single-flight), `dispatchWorkflow`, and `resetTokenCacheForTests`
- Built `src/lib/github-app.test.ts` with 11 tests — all green; full suite (43 tests) green
- Zero new npm dependencies — crypto is Node built-in; pattern mirrors existing `github-push.ts` raw-fetch style
- All security gates satisfied: no JWT, token, or private key appears in any log or error message

## Task Commits

Each task was committed atomically:

1. **Task 1: github-app.ts implementation** - `48ce134` (feat)
2. **Task 2: github-app.test.ts Vitest suite** - `e8329b7` (test)

## Files Created/Modified

- `src/lib/github-app.ts` — JWT signer + installation token cache + dispatchWorkflow helper
- `src/lib/github-app.test.ts` — Vitest suite, 11 tests, mocked fetch + ad-hoc RSA keypair

## Decisions Made

- JWT iat is `now - 60s` and exp is `now + 9min` — handles clock skew and stays under GitHub's 10-min JWT ceiling
- Token cache TTL is 50 min (not 60) — 10-min margin under GitHub's 60-min installation token lifetime
- Single-flight latch uses `let inflight: Promise<string> | null = null` cleared in `try/finally` — both success and error paths release the latch so the next call retries
- Error messages include GitHub's response body (their safe error JSON) but never echo the JWT string, PEM, or installation token prefix

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed test mock exhaustion in two negative-assertion tests**
- **Found during:** Task 2 TDD GREEN run
- **Issue:** Two tests (`non-2xx response: throws without leaking JWT` and `non-204 status: throws with body but without token`) each called the function twice — once via `expect(...).rejects.toThrow()` and once inside a `try/catch` to inspect the error message. The second call consumed a `Response` whose body was already read, producing "Body is unusable" instead of the expected error body text.
- **Fix:** Changed both `mockFetch` mocks from `.mockResolvedValue(singleResponse)` to `.mockResolvedValueOnce(r1).mockResolvedValueOnce(r2)` — each call gets a fresh `Response` instance with unread body
- **Files modified:** `src/lib/github-app.test.ts`
- **Verification:** `npx vitest run src/lib/github-app.test.ts` — 11/11 tests pass
- **Committed in:** e8329b7 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — bug in test mock reuse)
**Impact on plan:** Minimal — test-only fix; production code unchanged. Security guarantees now correctly verified.

## Issues Encountered

None beyond the mock-exhaustion fix above.

## User Setup Required

None — this plan creates library code only. Env vars (`GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_APP_INSTALLATION_ID`) are wired in Plan 04-03 (apphosting.yaml) and require the GitHub App creation HUMAN-UAT runbook.

## Next Phase Readiness

- Plan 04-04 (`/api/slack/interact` route) can now `import { dispatchWorkflow } from '@/lib/github-app'` with no further setup
- Plan 04-03 (apphosting.yaml secret bindings) runs in parallel in Wave 1 — no dependency on this plan
- The 50-min cache means steady-state production triggers roughly one JWT sign + token exchange every 50 minutes

---
*Phase: 04-github-app-promotion*
*Completed: 2026-05-04*
