---
phase: 17-hostname-guard-inventory
plan: 02
subsystem: middleware
tags: [host-guard, security, fail-closed, tdd, proxy]
dependency_graph:
  requires: []
  provides: [fail-closed host middleware, proxy test suite]
  affects: [all inbound requests, Phase 26 sunset scope]
tech_stack:
  added: []
  patterns: [isKnownHost allowlist, NextResponse 404 fail-closed, FAH x-forwarded-host guard]
key_files:
  created:
    - src/proxy.test.ts
  modified:
    - src/proxy.ts
    - package.json
decisions:
  - "KNOWN_EXACT_HOSTS uses Set<string> for O(1) lookup; exact match (not prefix) to prevent admin-dev.triarch.dev.evil.com bypass"
  - "Cloud Run hostname (*.run.app) accepted only when x-forwarded-host independently validates — prevents raw Cloud Run curl bypass while preserving FAH traffic"
  - "new NextResponse(null, { status: 404 }) chosen over NextResponse.rewrite('/_not-found') — no HTML body, lowest overhead for blocked traffic"
metrics:
  duration: "97 seconds"
  completed: "2026-05-08T17:35:05Z"
  tasks_completed: 3
  tasks_total: 3
  files_created: 1
  files_modified: 2
---

# Phase 17 Plan 02: Proxy Harden (Fail-Closed Host Guard) Summary

**One-liner:** Fail-closed isKnownHost allowlist in proxy.ts blocks unknown hosts with 404 before any route is touched — HOST-02 satisfied.

## Objective

Harden `src/proxy.ts` to return 404 for any host not in the known-admin allowlist. Prior behavior: non-admin hosts fell through to `NextResponse.next()` (open), enabling portal.triarch.dev DNS misconfig to silently serve admin UI (Pitfall 5). Phase 17 closes that window before Phase 18 introduces `portal.triarch.dev` as a second valid app.

## Tasks Completed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | Write proxy.test.ts (RED) | acee97e | src/proxy.test.ts (created) |
| 2 | Harden proxy.ts (GREEN) | 1fcb36b | src/proxy.ts (modified) |
| 3 | Bump version to v2.9.1 | fa4a0c9 | package.json |

## What Was Built

### isKnownHost Guard (src/proxy.ts)

Added `KNOWN_EXACT_HOSTS` (Set) and `isKnownHost(host, xForwardedHost)` helper. At the top of the `proxy()` function, unknown hosts are rejected with `new NextResponse(null, { status: 404 })` before any routing logic runs.

Allowlist:
- `admin.triarch.dev` (production)
- `admin-dev.triarch.dev` (dev custom domain)
- `admin-dev--triarch-dev-website.us-central1.hosted.app` (FAH internal hostname for dev)
- `localhost:3000`, `localhost:3001` (local dev)

FAH pattern: Cloud Run internal hostname (`*.run.app`) is accepted only when `x-forwarded-host` independently resolves to a known admin host — preserving FAH proxied traffic while blocking direct Cloud Run curls.

### Vitest Test Suite (src/proxy.test.ts)

8 tests in 2 describe blocks:

**Known hosts pass through (5 tests):**
- `admin.triarch.dev` — direct prod
- `admin-dev.triarch.dev` — dev custom domain
- `localhost:3000` — local dev
- `localhost:3001` — local dev alternate port
- FAH internal `t-abc---triarch-dev-website-uc.a.run.app` with `x-forwarded-host: admin.triarch.dev`

**Unknown hosts fail closed with 404 (3 tests):**
- `portal.triarch.dev` — the primary guard (Phase 18 DNS target)
- `evil.example.com` — arbitrary unknown host
- missing host — fail closed on empty/absent host header

### Version Bump

`package.json` version: `2.9.0` → `2.9.1` (patch — small middleware surface change)

## Verification Results

```
npx vitest run src/proxy.test.ts
  Test Files  1 passed (1)
  Tests  8 passed (8)

npx vitest run
  Test Files  36 passed (36)
  Tests  332 passed (332)   (was 324 before this plan)

npx next build
  ✓ Compiled successfully in 3.0s
  ✓ Running TypeScript — Finished TypeScript in 2.5s
  ✓ Generating static pages (55/55)
```

## Deviations from Plan

### Deliberate Deviation: --no-verify on Commits

**Rule:** Parallel-safety deviation (Wave 1, documented in operational notes).

**Reason:** Plans 17-01 and 17-02 run in parallel (Wave 1). Using `git commit --no-verify` avoids pre-commit hook contention when both agents attempt concurrent commits against the same working tree. The plan's own task instructions say "do NOT use --no-verify" but the orchestrator's operational_notes explicitly override this for parallel execution safety.

**Impact:** Pre-commit hooks (lint, type-check, etc.) were skipped on all three task commits. The `next build` and `npx vitest run` verifications in Task 2 provide equivalent confidence. No quality regression — build is clean and all 332 tests pass.

**Files affected:** All three task commits (acee97e, 1fcb36b, fa4a0c9).

## v2.1 Layout Guards: UNTOUCHED

Per Phase 17 charter, the four v2.1 hostname-aware guards in:
- `src/app/page.tsx`
- `src/app/admin/layout.tsx`
- `src/app/projects/layout.tsx`
- `src/app/login/layout.tsx`

...are NOT modified in this phase. They remain until Phase 26 (Sunset). `git diff src/app/` shows no changes to these files.

## Requirements Satisfied

- **HOST-02**: `src/proxy.ts` returns 404 for unknown hosts — Vitest test proves it, build confirms no regression.

## Known Stubs

None — plan goal achieved fully. No placeholder data, no TODOs in changed files.

## Self-Check: PASSED

- src/proxy.test.ts: FOUND
- src/proxy.ts: FOUND
- 17-02-SUMMARY.md: FOUND
- acee97e (RED test commit): FOUND
- 1fcb36b (GREEN implementation commit): FOUND
- fa4a0c9 (v2.9.1 version bump commit): FOUND
