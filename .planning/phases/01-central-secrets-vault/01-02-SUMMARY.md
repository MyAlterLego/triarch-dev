---
phase: 01-central-secrets-vault
plan: 02
subsystem: infra

requires: []
provides:
  - "@myalterlego/secrets@0.1.0 published to npm.pkg.github.com"
  - "MyAlterLego/secrets repo (private) with main branch + v0.1.0 tag"
  - "GitHub Actions publish workflow on tag push"
affects: [01-04, 01-05]

tech-stack:
  added:
    - "@myalterlego/secrets (new package)"
    - "@google-cloud/secret-manager ^6.1.2"
  patterns:
    - "Module-level cache with TTL + single-flight inflight latch (mirrors github-app.ts)"
    - "Lazy SecretManagerServiceClient init"
    - "process.env fallback on vault failure (silent)"
    - "SecretNotFoundError with vault console URL"

key-files:
  created:
    - ~/claude/MyAlterLego/secrets/package.json
    - ~/claude/MyAlterLego/secrets/src/index.ts
    - ~/claude/MyAlterLego/secrets/src/index.test.ts
    - ~/claude/MyAlterLego/secrets/.github/workflows/publish.yml
    - ~/claude/MyAlterLego/secrets/README.md
  modified: []

key-decisions:
  - "Used vi.hoisted() + class-based mock for SecretManagerServiceClient (Vitest 4.x: vi.fn().mockImplementation returning a plain object triggers a warning and breaks constructor calls)"
  - "Workflow uses secrets.GITHUB_TOKEN with permissions: packages:write — no PAT required for publish"

patterns-established:
  - "Single-flight cache: getSecret collapses concurrent misses on the same key into one fetch (Map<string, Promise<string>>)"
  - "Test pattern: vi.hoisted({ mockFn, mockCtor }) + class mock for SecretManagerServiceClient"

requirements-completed: [VAULT-04]

duration: ~25min
completed: 2026-05-04
---

# Phase 01 Plan 01-02 Summary

**`@myalterlego/secrets@0.1.0` published to GitHub Packages with cache + env fallback + 9 passing tests; new `MyAlterLego/secrets` repo with green publish workflow.**

## Performance

- **Tasks:** 3 (Task 1 + 3 originally human checkpoints, executed inline; Task 2 autonomous)
- **Files created:** 11 (package, source, test, config, workflow, README, lockfile)
- **Tests:** 9/9 passing
- **Completed:** 2026-05-04

## Accomplishments

- Created `MyAlterLego/secrets` GitHub repo (private)
- Scaffolded TypeScript package with strict tsconfig + Vitest
- Implemented `getSecret(name)` with: 300s TTL cache, single-flight inflight latch, lazy client init, `process.env[name]` fallback, `SecretNotFoundError` with vault console URL
- 9 unit tests cover: cache hit, TTL expiry, key isolation, vault success, env fallback, no-fallback throw, lazy init, single-flight, error name
- Published `@myalterlego/secrets@0.1.0` to `https://npm.pkg.github.com`
- GitHub Actions workflow runs on `v*` tag push, uses `secrets.GITHUB_TOKEN` with `packages: write`

## Task Commits

Commits in `MyAlterLego/secrets` repo (NOT this admin repo):
1. **`v0.1.0: initial @myalterlego/secrets package — getSecret with cache + env fallback`** — single commit covers all package files

Tag: `v0.1.0` → triggers `Publish to GitHub Packages` workflow (run 25349120661, ✓ success in 19s).

## Files Created/Modified

In `~/claude/MyAlterLego/secrets/`:
- `package.json` — name `@myalterlego/secrets`, version `0.1.0`, publishConfig → npm.pkg.github.com
- `tsconfig.json` — strict ESNext bundler resolution, declaration output
- `vitest.config.ts` — node env, no globals
- `.npmrc` — `@myalterlego` scope → npm.pkg.github.com with `${NODE_AUTH_TOKEN}`
- `.gitignore` — node_modules, dist, *.log, .env, coverage
- `src/index.ts` — `getSecret`, `SecretNotFoundError`, `_resetForTests` (test-only)
- `src/index.test.ts` — 9 tests via Vitest with class-based SecretManagerServiceClient mock
- `README.md` — install, usage, IAM pointer
- `.github/workflows/publish.yml` — `actions/checkout@v4` → `setup-node@v4` (registry-url, scope @myalterlego) → `npm ci` → `test` → `build` → `publish` with `NODE_AUTH_TOKEN: secrets.GITHUB_TOKEN`

## Decisions Made

- `vi.hoisted()` instead of plain `const mockFn = vi.fn()` — Vitest hoists `vi.mock` factories above `const`, so any references in the factory must come from `vi.hoisted` to be defined at hoist time
- Class-based mock instead of `vi.fn().mockImplementation(() => ({...}))` — Vitest 4.x logs a warning and (more critically) the constructor pattern with arrow function returning a literal object doesn't work as a `new`-able constructor in this codepath

## Deviations from Plan

**Tests required iteration during implementation.**

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Vitest mock pattern broken**
- **Found during:** Task 2 (`npm test`)
- **Issue:** Plan's mock pattern (`vi.fn().mockImplementation(() => { ... return { accessSecretVersion: mockFn } })`) returned undefined from `accessSecretVersion`, all vault calls fell through to the catch block, 6/9 tests failed
- **Fix:** Switched to `vi.hoisted()` for mock fns + class-based `SecretManagerServiceClient` mock with `constructor()` calling `mockConstructor()` and `accessSecretVersion(args)` delegating to `mockAccessSecretVersion(args)`
- **Files modified:** `~/claude/MyAlterLego/secrets/src/index.test.ts`
- **Verification:** 9/9 tests pass
- **Committed in:** Single `v0.1.0:` commit (squashed during implementation)

**Total deviations:** 1 auto-fixed (test scaffolding pattern incompatible with Vitest 4.x)
**Impact on plan:** No scope creep. Behavior preserved. Plan's test cases all run.

## Issues Encountered

- The published workflow uses `actions/checkout@v4` and `actions/setup-node@v4` which now run on Node 20 — GitHub deprecation notice surfaces, but actions still pass. Bump to `@v5` later if a follow-up action is created.

## User Setup Required

None — `secrets.GITHUB_TOKEN` is auto-provisioned in GitHub Actions and the workflow `permissions:` block grants `packages: write`.

For consumer projects (admin app, CRM), they need `.npmrc` + `GITHUB_PACKAGES_TOKEN` Firebase secret. That setup is in plans 01-04 and 01-05.

## Next Phase Readiness

- `@myalterlego/secrets` is published and installable
- Plan 01-04 (admin migration) can `npm install @myalterlego/secrets@^0.1.0` once admin's `.npmrc` is configured (admin repo already has one — verified)
- Plan 01-05 (CRM migration) needs to add `.npmrc` first (CRM repo has none — confirmed)
- Plan 01-03 (IAM) is the gating prerequisite before any consumer can actually read from the vault

---
*Phase: 01-central-secrets-vault*
*Completed: 2026-05-04*
