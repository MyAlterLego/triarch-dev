---
phase: 20-url-centralization-admin
verified: 2026-05-08T14:14:50Z
status: passed
score: 7/7 must-haves verified
re_verification: false
---

# Phase 20: URL Centralization (Admin) Verification Report

**Phase Goal:** Admin emits all customer-facing URLs through a single helper before portal ships, so the cutover redirect doesn't strand bookmarks in Slack messages or release notes.
**Verified:** 2026-05-08T14:14:50Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #  | Truth                                                                                          | Status     | Evidence                                                                                         |
|----|-----------------------------------------------------------------------------------------------|------------|--------------------------------------------------------------------------------------------------|
| 1  | `src/lib/urls.ts` exports all four helpers with correct signatures                            | VERIFIED   | All four functions confirmed in file; signatures match LOCKED spec                              |
| 2  | Each helper reads `PORTAL_BASE_URL` from `process.env` at call time, not module load          | VERIFIED   | `getPortalBaseUrl()` called inside each function; Test 5 (env-override at call time) passes green |
| 3  | `src/lib/urls.test.ts` has 6 Vitest cases covering all helpers + env-override, all GREEN      | VERIFIED   | `npx vitest run src/lib/urls.test.ts` → 6 passed (6)                                           |
| 4  | ESLint `no-restricted-syntax` rule blocks `admin.triarch.dev/projects/` literals outside urls.ts | VERIFIED | Rule present for both `Literal` and `TemplateElement` selectors; `src/lib/urls.ts` + `src/lib/urls.test.ts` + `eslint.config.mjs` exempted |
| 5  | `apphosting.yaml` binds `PORTAL_BASE_URL: https://portal.triarch.dev` as plain RUNTIME value  | VERIFIED   | Entry present at line 26–29, `value:` (not `secret:`), `availability: [RUNTIME]`               |
| 6  | `package.json` version bumped to 2.9.2                                                        | VERIFIED   | `python3 -c` → `2.9.2`                                                                         |
| 7  | Full Vitest suite (338 tests) stays GREEN                                                      | VERIFIED   | `npx vitest run` → 37 test files, 338 tests passed                                             |

**Score:** 7/7 truths verified

### Required Artifacts

| Artifact                    | Expected                                             | Status     | Details                                                                                   |
|-----------------------------|------------------------------------------------------|------------|-------------------------------------------------------------------------------------------|
| `src/lib/urls.ts`           | Four helper exports + PORTAL_BASE_URL env reader     | VERIFIED   | 37 lines; all four exports substantive; `getPortalBaseUrl()` called at runtime inside each |
| `src/lib/urls.test.ts`      | 6 Vitest cases, all green                            | VERIFIED   | 58 lines; imports all four helpers from `./urls`; 6/6 pass                               |
| `package.json`              | Version `2.9.2`                                      | VERIFIED   | `"version": "2.9.2"` confirmed                                                           |
| `eslint.config.mjs`         | `no-restricted-syntax` rule + exemption block        | VERIFIED   | Both `Literal` and `TemplateElement` selectors present; exemption on `files` block confirmed |
| `apphosting.yaml`           | `PORTAL_BASE_URL` plain RUNTIME binding              | VERIFIED   | Appears after `DEPLOY_WEBHOOK_URL`, plain `value:`, `RUNTIME`-only availability          |

### Key Link Verification

| From                     | To                                 | Via                                              | Status     | Details                                                                        |
|--------------------------|------------------------------------|--------------------------------------------------|------------|--------------------------------------------------------------------------------|
| `src/lib/urls.ts`        | `process.env.PORTAL_BASE_URL`      | `??` fallback inside `getPortalBaseUrl()`        | WIRED      | `process.env.PORTAL_BASE_URL ?? DEFAULT_PORTAL_BASE_URL` at call time         |
| `src/lib/urls.test.ts`   | `src/lib/urls.ts`                  | `import { ... } from './urls'`                   | WIRED      | All four helpers imported at line 2–7                                         |
| `eslint.config.mjs`      | `src/lib/urls.ts`                  | `files` exemption block                          | WIRED      | `files: ["src/lib/urls.ts", "src/lib/urls.test.ts", "eslint.config.mjs"]`     |
| `apphosting.yaml`        | `process.env.PORTAL_BASE_URL`      | FAH env binding picked up by Next.js runtime     | WIRED      | `variable: PORTAL_BASE_URL`, `value: https://portal.triarch.dev`, `RUNTIME`   |

### Requirements Coverage

| Requirement | Source Plan | Description                                                                                      | Status    | Evidence                                                                                         |
|-------------|-------------|--------------------------------------------------------------------------------------------------|-----------|--------------------------------------------------------------------------------------------------|
| URL-01      | 20-01       | `src/lib/urls.ts` exports four helpers reading `PORTAL_BASE_URL` (default `https://portal.triarch.dev`) | SATISFIED | File exists, exports verified, default confirmed in tests, env read at call time                |
| URL-02      | 20-01       | All admin customer-facing URL emissions go through the helper (vacuously true — zero current emission sites per scout) | SATISFIED | ESLint guard enforces going forward; scout confirmed zero existing `admin.triarch.dev/projects/` emission sites |
| URL-03      | 20-02       | ESLint `no-restricted-syntax` rule blocks raw `admin.triarch.dev/projects/` literals outside `src/lib/urls.ts`  | SATISFIED | Rule in `eslint.config.mjs` with both `Literal` and `TemplateElement` selectors; exemption block confirmed |

### Anti-Patterns Found

None. No TODOs, FIXMEs, placeholder comments, or empty implementations found in `src/lib/urls.ts`, `src/lib/urls.test.ts`, `eslint.config.mjs`, or `apphosting.yaml`.

### Human Verification Required

None. All observable behaviors for this phase are programmatically verifiable (unit tests, grep checks, file inspection).

### Summary

Phase 20 goal is fully achieved. The `src/lib/urls.ts` module provides the four customer-facing URL helpers, each reading `PORTAL_BASE_URL` at call time so test overrides and production env injection both work correctly. The 6-test Vitest suite covers all four helpers plus the env-override behavior and passes green. The ESLint `no-restricted-syntax` rule in `eslint.config.mjs` blocks both string literal and template literal forms of raw `admin.triarch.dev/projects/` URLs in any file outside the exempted set, enforcing the helper as the sole legal path to customer URL emission. The `apphosting.yaml` binding delivers the production base URL to the runtime env. The full suite of 338 tests passes with no regressions. All three requirements (URL-01, URL-02, URL-03) are satisfied.

---

_Verified: 2026-05-08T14:14:50Z_
_Verifier: Claude (gsd-verifier)_
