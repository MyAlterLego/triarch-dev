---
phase: 20-url-centralization-admin
plan: 02
subsystem: infra
tags: [eslint, eslint-flat-config, no-restricted-syntax, apphosting, env-vars]

# Dependency graph
requires:
  - phase: 20-url-centralization-admin
    provides: "Plan 20-01 delivers src/lib/urls.ts helpers — plan 02 enforces that helpers are the sole legal URL source via ESLint"
provides:
  - "ESLint no-restricted-syntax rule blocking raw admin.triarch.dev/projects/ literals (Literal + TemplateElement selectors)"
  - "eslint.config.mjs exemption for src/lib/urls.ts, src/lib/urls.test.ts, eslint.config.mjs"
  - "PORTAL_BASE_URL=https://portal.triarch.dev plain-value RUNTIME binding in apphosting.yaml"
affects: [20-url-centralization-admin, 21-release-page-portal, 22-write-surface, 25-portal-cutover]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "ESLint flat config file-scoped exemption: add target file to files[] in a separate override block with rule: 'off'"
    - "ESLint no-restricted-syntax with AST selector regex to block URL pattern in literals and template elements"
    - "apphosting.yaml plain value (not secret) for public hostname env vars"

key-files:
  created: []
  modified:
    - eslint.config.mjs
    - apphosting.yaml

key-decisions:
  - "Exempt eslint.config.mjs from no-restricted-syntax rule — the selector string itself contains the pattern as a regex fragment and triggers against itself without exemption"
  - "PORTAL_BASE_URL bound as plain value: not a secret, public hostname"
  - "RUNTIME-only availability for PORTAL_BASE_URL — Next.js reads it at request time, BUILD access not needed"

patterns-established:
  - "ESLint flat config self-exemption: files containing rule patterns in their source must be in the exemption files[] array"

requirements-completed: [URL-03]

# Metrics
duration: 8min
completed: 2026-05-08
---

# Phase 20 Plan 02: ESLint URL Guard + apphosting.yaml Binding Summary

**ESLint no-restricted-syntax rule blocks raw admin.triarch.dev/projects/ literals (plain and template) in all files except urls.ts and eslint.config.mjs; PORTAL_BASE_URL=https://portal.triarch.dev bound as RUNTIME plain value in apphosting.yaml**

## Performance

- **Duration:** 8 min
- **Started:** 2026-05-08T19:05:00Z
- **Completed:** 2026-05-08T19:12:29Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- ESLint no-restricted-syntax rule added to eslint.config.mjs targeting `Literal[value=/admin\.triarch\.dev\/projects/]` and `TemplateElement[value.raw=/admin\.triarch\.dev\/projects/]`
- src/lib/urls.ts, src/lib/urls.test.ts, and eslint.config.mjs exempted via files-scoped override block
- PORTAL_BASE_URL: https://portal.triarch.dev added to apphosting.yaml as plain RUNTIME value immediately after DEPLOY_WEBHOOK_URL
- next build clean (55 routes), vitest 338/338 green, spot-test confirmed rule fires on deliberate violation

## Task Commits

Each task was committed atomically:

1. **Task 1: Add no-restricted-syntax ESLint rule + urls.ts exemption** - `901bb31` (feat)
2. **Task 2: Add PORTAL_BASE_URL plain-value RUNTIME binding to apphosting.yaml** - `d9b8623` (feat)

**Plan metadata:** committed with final docs commit

## Files Created/Modified
- `eslint.config.mjs` - Added no-restricted-syntax rule with Literal + TemplateElement selectors and file-scoped exemptions
- `apphosting.yaml` - Added PORTAL_BASE_URL: https://portal.triarch.dev as plain RUNTIME env binding

## Decisions Made
- Exempt `eslint.config.mjs` from no-restricted-syntax: the selector strings themselves contain the pattern `admin\.triarch\.dev\/projects` as a regex fragment, causing false-positive violations. The file-scoped exemption resolves this cleanly.
- PORTAL_BASE_URL is a public hostname and needs no Firebase secret wrapping — plain `value:` binding matches the NEXTAUTH_URL pattern at the top of the env list.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] eslint.config.mjs self-referencing false positive**
- **Found during:** Task 1 (ESLint baseline check)
- **Issue:** The Literal and TemplateElement selector strings in eslint.config.mjs contain the pattern `admin.triarch.dev/projects` as a literal substring. Running `npx eslint .` produced 2 errors from the config file itself (lines 27 and 32 — the selector string values).
- **Fix:** Added `eslint.config.mjs` to the files[] array in the exemption override block alongside src/lib/urls.ts and src/lib/urls.test.ts.
- **Files modified:** eslint.config.mjs
- **Verification:** Re-ran `npx eslint src/ eslint.config.mjs` — no no-restricted-syntax errors. Spot-test still fired on violation file.
- **Committed in:** 901bb31 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Auto-fix essential for correctness — without it the rule would block itself on every lint run. No scope creep.

## Issues Encountered
None — pre-existing `packages/triarch-shared/dist/schema.d.ts` lint errors (`@typescript-eslint/no-empty-object-type`) were confirmed pre-existing before this plan and are out of scope.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- URL-03 satisfied: ESLint gate is live. Any Phase 21+ code that emits a raw `admin.triarch.dev/projects/` literal will fail CI.
- PORTAL_BASE_URL env binding in place for production — urls.ts helpers (Plan 20-01) will read the correct base URL at deploy time.
- Combined with Plan 20-01: URL-01 + URL-02 + URL-03 all delivered. Phase 20 complete.

---
*Phase: 20-url-centralization-admin*
*Completed: 2026-05-08*
