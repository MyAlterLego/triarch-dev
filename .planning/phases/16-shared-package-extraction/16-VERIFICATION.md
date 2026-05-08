---
phase: 16-shared-package-extraction
verified: 2026-05-08T17:30:00Z
status: passed
score: 9/9 must-haves verified
re_verification: false
---

# Phase 16: Shared Package Extraction — Verification Report

**Phase Goal:** Drizzle schema and shared helpers extracted into a private GitHub Packages npm module that both apps consume; admin remains migration authority.
**Verified:** 2026-05-08T17:30:00Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | `packages/triarch-shared/` exists with all 5 source files populated | VERIFIED | schema.ts (489L), auth-context.ts (48L), sanitize-commit.ts (84L), slack-status.ts (171L), db.ts (9L) |
| 2 | Package declares 6 subpath exports (`.`, `./schema`, `./auth`, `./sanitize-commit`, `./slack`, `./db`) | VERIFIED | `node -e "require('./packages/triarch-shared/package.json').exports"` returns all 6 keys |
| 3 | Admin source files are 1-line re-export shims pointing at `@myalterlego/triarch-shared` | VERIFIED | `src/db/schema.ts`, `src/lib/{auth-context,sanitize-commit,slack-status,db}.ts` each contain exactly one `export *` line |
| 4 | `@myalterlego/triarch-shared@0.1.0` published to GitHub Packages | VERIFIED | `npm view versions` returns `["0.1.0"]`; publish step emitted `+ @myalterlego/triarch-shared@0.1.0` |
| 5 | Admin version is 2.9.0 and depends on the package | VERIFIED | `package.json` version=`2.9.0`, dep=`file:./packages/triarch-shared` |
| 6 | `next.config.ts` adds package to `transpilePackages` | VERIFIED | Line 5: `transpilePackages: ['@myalterlego/shared-ui', '@myalterlego/triarch-shared']` |
| 7 | 324/324 Vitest tests pass | VERIFIED | `npx vitest run` — 35 test files, 324 tests, all GREEN |
| 8 | `check-shared-version.yml` is active and in enforce-mode | VERIFIED | Workflow state=`active`; `shared/v0.1.0` tag exists so skip path no longer fires |
| 9 | `publish-shared.yml` triggers on `shared/v*` tags and published successfully | VERIFIED | Workflow state=`active`; run 25568953118 published `0.1.0` to registry (workflow marked failure only due to cosmetic Summary step) |

**Score:** 9/9 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/triarch-shared/src/schema.ts` | Drizzle schema (400+ lines) | VERIFIED | 489 lines, 29 exports (pgTable + relations) |
| `packages/triarch-shared/src/auth-context.ts` | getCurrentUserContext() helper | VERIFIED | 48 lines, imports from `./db` and `./schema` (no `@/` aliases) |
| `packages/triarch-shared/src/sanitize-commit.ts` | sanitizeForSlack + sanitizeForRender | VERIFIED | 84 lines, no imports (pure helpers) |
| `packages/triarch-shared/src/slack-status.ts` | fetchProjectStatus + buildStatusBlocks + helpers | VERIFIED | 171 lines, imports from `./db` and `./schema` |
| `packages/triarch-shared/src/db.ts` | drizzle pg.Pool wrapper | VERIFIED | 9 lines, import from `./schema` |
| `packages/triarch-shared/src/index.ts` | Barrel re-exporting all 5 modules | VERIFIED | 5 `export *` lines |
| `packages/triarch-shared/package.json` | name=`@myalterlego/triarch-shared`, version=`0.1.0`, 6 exports | VERIFIED | All fields match; `publishConfig.registry=https://npm.pkg.github.com` |
| `packages/triarch-shared/tsconfig.json` | strict, ES2022, outDir=./dist | VERIFIED | 6 .d.ts files emitted under `dist/` |
| `src/db/schema.ts` | 1-line shim | VERIFIED | `export * from '@myalterlego/triarch-shared/schema';` |
| `src/lib/auth-context.ts` | 1-line shim | VERIFIED | `export * from '@myalterlego/triarch-shared/auth';` |
| `src/lib/sanitize-commit.ts` | 1-line shim | VERIFIED | `export * from '@myalterlego/triarch-shared/sanitize-commit';` |
| `src/lib/slack-status.ts` | 1-line shim | VERIFIED | `export * from '@myalterlego/triarch-shared/slack';` |
| `src/lib/db.ts` | 1-line shim | VERIFIED | `export * from '@myalterlego/triarch-shared/db';` |
| `package.json` | version=2.9.0, dep on triarch-shared | VERIFIED | version=`2.9.0`, dep=`file:./packages/triarch-shared` |
| `next.config.ts` | transpilePackages includes triarch-shared | VERIFIED | Present at line 5 |
| `.github/workflows/publish-shared.yml` | Tag-driven publish on `shared/v*` | VERIFIED | state=active; triggers on `shared/v*`; `packages: write`; `working-directory: packages/triarch-shared` |
| `.github/workflows/check-shared-version.yml` | PR gate for version drift | VERIFIED | state=active; fires on `packages/triarch-shared/**`; diffs against latest `shared/v*` tag |
| git tag `shared/v0.1.0` | Exists locally and on origin | VERIFIED | `git tag -l 'shared/v0.1.0'` returns tag |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/db/schema.ts` | `packages/triarch-shared/src/schema.ts` | subpath re-export | WIRED | `export * from '@myalterlego/triarch-shared/schema'` present |
| `src/lib/db.ts` | `packages/triarch-shared/src/db.ts` | subpath re-export | WIRED | `export * from '@myalterlego/triarch-shared/db'` present |
| `next.config.ts` | `packages/triarch-shared` | transpilePackages array entry | WIRED | `'@myalterlego/triarch-shared'` in transpilePackages at line 5 |
| `package.json` | `packages/triarch-shared` | file: dep | WIRED | `"@myalterlego/triarch-shared": "file:./packages/triarch-shared"` + symlink in node_modules |
| `.github/workflows/publish-shared.yml` | `packages/triarch-shared` | working-directory + npm publish | WIRED | `working-directory: packages/triarch-shared`; `npm publish` confirmed successful |
| `.github/workflows/check-shared-version.yml` | `packages/triarch-shared/package.json` | git diff + version check | WIRED | Diffs `packages/triarch-shared/src/` against latest `shared/v*` tag |
| `packages/triarch-shared/src/auth-context.ts` | `packages/triarch-shared/src/{db,schema}.ts` | relative imports | WIRED | `from './db'` and `from './schema'` — no `@/` aliases remaining |
| `packages/triarch-shared/src/slack-status.ts` | `packages/triarch-shared/src/{db,schema}.ts` | relative imports | WIRED | `from './db'` and `from './schema'` — no `@/` aliases remaining |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| PKG-01 | 16-01, 16-03 | `packages/triarch-shared/` with schema.ts, auth-context.ts, sanitize-commit.ts, slack-status.ts, plus publish workflow on tag `shared/v*` | SATISFIED | All 5 source files exist in package, publish workflow active |
| PKG-02 | 16-04 | `@myalterlego/triarch-shared@0.1.0` published and installable via npm install | SATISFIED | `npm view versions` returns `["0.1.0"]`; package queryable at GitHub Packages |
| PKG-03 | 16-03 | Admin refactored to re-export from `@myalterlego/triarch-shared`; v2.9.0; 324+ tests GREEN | SATISFIED | 5 shims in place; admin v2.9.0; 324/324 tests pass |
| PKG-04 | 16-02 | CI gate prevents merging PRs with schema changes without version bump | SATISFIED | `check-shared-version.yml` active; `shared/v0.1.0` tag exists so gate is in enforce-mode |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `.github/workflows/publish-shared.yml` | Summary step | `$()` subshell in double-quoted `echo` string fails under bash `-e` | Warning | Cosmetic only — the `Summary` step fails after `npm publish` already succeeded. Does not affect package publish or any gate. The workflow shows `conclusion: failure` in the GitHub API but the package is fully published. |

No stub patterns, placeholder comments, or missing implementations found in source files.

---

### Workflow Failure Note

The `publish-shared.yml` run (ID 25568953118) is marked `conclusion: failure` by GitHub. The failure is confined to the final cosmetic `Summary` step:

```
/usr/bin/bash: syntax error near unexpected token '('
```

This is a bash quoting issue in: `echo "## Published @myalterlego/triarch-shared@$(node -p \"require('./package.json').version\")" >> $GITHUB_STEP_SUMMARY`

The `npm publish` step that precedes it completed successfully and emitted:
```
+ @myalterlego/triarch-shared@0.1.0
```

The package is queryable at the registry (`npm view @myalterlego/triarch-shared versions` returns `["0.1.0"]`). This bug should be fixed in a follow-up to prevent false-alarm alerts on future publishes.

---

### Call Site Preservation

Admin import paths unchanged — shims correctly proxy to the package:
- `from '@/db/schema'` — 72 import sites (all preserved by shim)
- `from '@/lib/auth-context'` — 31 import sites (all preserved)
- `from '@/lib/db'` — 71 import sites (all preserved)

---

### Human Verification Required

None. This was an autonomous refactor phase. All outcomes are machine-verifiable.

The one recommended follow-up action (non-blocking for phase completion):

**Fix publish-shared.yml Summary step** — change the double-quoted `echo` with `$()` subshell to a separate `PKG_VER=$(node -p ...)` step before the echo, so future publish runs show `conclusion: success`. This is a workflow cosmetic fix, not a phase requirement.

---

## Summary

Phase 16 goal is fully achieved. The Drizzle schema and shared helpers are extracted into `@myalterlego/triarch-shared@0.1.0`, published to GitHub Packages, and both consuming paths (admin via `file:` dep, future portal via registry) are established. Admin remains the sole migration authority. The version-drift gate (`check-shared-version.yml`) is in enforce-mode. Admin tests are green and the build is clean.

The only finding is a cosmetic bash quoting bug in the `Summary` step of `publish-shared.yml` that causes the workflow to report `failure` despite the package being fully published. This does not block Phase 18 or Phase 19.

---

_Verified: 2026-05-08T17:30:00Z_
_Verifier: Claude (gsd-verifier)_
