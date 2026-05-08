---
phase: 08-admin-home-pipeline-visibility
verified: 2026-05-07T00:00:00Z
status: passed
score: 14/14 must-haves verified
re_verification: false
---

# Phase 8: Admin Home Pipeline Visibility — Verification Report

**Phase Goal:** Staff can see each project's prod and dev state at a glance from the admin home — version split, pending-approval count, last-deploy timestamps, clickable tiles, what-changed one-liner.
**Verified:** 2026-05-07
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Composite index `release_logs_project_env_deployed_idx` declared in `src/db/schema.ts` with `table.deployedAt.desc()` | VERIFIED | `src/db/schema.ts:159` — `index('release_logs_project_env_deployed_idx').on(table.project, table.env, table.deployedAt.desc())` |
| 2 | Migration `0013_release_logs_pipeline_idx.sql` exists with exact `CREATE INDEX ... USING btree ("project","env","deployed_at" DESC NULLS LAST)` | VERIFIED | File exists; line 1 matches Pitfall 8 spec exactly |
| 3 | Drizzle journal updated with `"tag": "0013_release_logs_pipeline_idx"` | VERIFIED | `_journal.json:100` contains the tag |
| 4 | `getProjectPipelineSummaries()` exported from `src/lib/pipeline-summary.ts` with full implementation (no NOT_IMPLEMENTED stub) | VERIFIED | 268-line file; function at line 78; no `throw new Error('NOT_IMPLEMENTED')` present |
| 5 | Types `PipelineSummary`, `WhatChangedSummary`, `PipelineState` exported | VERIFIED | Lines 5, 7, 15 in `pipeline-summary.ts` |
| 6 | DISTINCT ON query with `WHERE env IN ('dev', 'prod')` and `COALESCE(deployed_at, released_at) DESC NULLS LAST` present in implementation | VERIFIED | `pipeline-summary.ts:90-97` — exact clauses confirmed |
| 7 | `whatChangedOneliner` produces `'dev behind prod'` sentinel on inversion | VERIFIED | `pipeline-summary.ts:211` |
| 8 | 10-test Vitest suite in `pipeline-summary.test.ts` covering all behavior cases | VERIFIED | 419-line file; 10 `it(` blocks; mocks db; asserts `'dev behind prod'` and `'4 entries since prod: 2 fixes, 1 feature, 1 other'` |
| 9 | `src/app/admin/page.tsx` imports and calls `getProjectPipelineSummaries` in `Promise.all` | VERIFIED | Line 20 (import), line 83 (call inside Promise.all) |
| 10 | `ProjectHealth` interface extended with 7 pipeline fields (`prodVersion`, `prodDeployedAt`, `devVersion`, `devDeployedAt`, `pendingApprovalCount`, `pipelineState`, `whatChangedOneliner`) | VERIFIED | Lines 31-37 in `admin/page.tsx` |
| 11 | Tile wrapped in `Link href=/projects/${p.key}/releases` (PIPE-04) | VERIFIED | Line 212: `href={\`/projects/${p.key}/releases\`}` |
| 12 | Amber pending-approval pill rendered conditionally (`> 0` guard, absent when zero) | VERIFIED | Lines 216-220: `{p.pendingApprovalCount > 0 && (` with `bg-amber-500/15 text-amber-300 absolute top-2 right-2` |
| 13 | Existing data preserved: `p.openBugs`, `p.pendingFeatures`, `p.status === 'active'` all still rendered | VERIFIED | Lines 249-256 in `admin/page.tsx` |
| 14 | Version bumped to 2.4.0 in `package.json` (minor bump for new feature per CLAUDE.md) | VERIFIED | `package.json:3` — `"version": "2.4.0"` |

**Score:** 14/14 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/db/schema.ts` | `releaseLogs` table second-arg with index declaration containing `release_logs_project_env_deployed_idx` | VERIFIED | Line 159 — non-unique `index()` with `.desc()` on deployedAt |
| `src/db/migrations/0013_release_logs_pipeline_idx.sql` | Generated migration with `CREATE INDEX ... DESC NULLS LAST` | VERIFIED | Exists; single-line CREATE INDEX matching Pitfall 8 spec |
| `src/lib/pipeline-summary.ts` | Server helper + types; min 80 lines; exports `getProjectPipelineSummaries`, `PipelineSummary`, `WhatChangedSummary` | VERIFIED | 268 lines; all three exports confirmed |
| `src/lib/pipeline-summary.test.ts` | 10-test Vitest suite; min 120 lines; db mocked; `dev behind prod` and `entries since prod:` asserted | VERIFIED | 419 lines; 10 tests; both assertion strings present |
| `src/app/admin/page.tsx` | Imports `getProjectPipelineSummaries`; renders pipeline tile with Link, prod/dev rows, amber pill, oneliner | VERIFIED | Import line 20; all rendering elements confirmed at lines 212-268 |
| `package.json` | Version `2.4.0` | VERIFIED | Line 3 |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/db/schema.ts` | `0013_release_logs_pipeline_idx.sql` | drizzle-kit generate / manual creation | VERIFIED | Both files declare `release_logs_project_env_deployed_idx`; journal tag matches |
| `src/lib/pipeline-summary.ts` | `src/db/schema.ts releaseLogs` | `import { releaseLogs, projects } from '@/db/schema'` + raw SQL `DISTINCT ON` | VERIFIED | Line 2 import; SQL at lines 83-99 references release_logs table columns |
| `src/lib/pipeline-summary.test.ts` | `src/lib/pipeline-summary.ts` | `import { getProjectPipelineSummaries } from './pipeline-summary'` | VERIFIED | Line 3 of test file; 10 tests exercise the function |
| `src/app/admin/page.tsx` | `src/lib/pipeline-summary.ts` | `import { getProjectPipelineSummaries, type PipelineSummary }` | VERIFIED | Line 20; called at line 83 |
| `src/app/admin/page.tsx Project Health tile` | `/projects/<key>/releases` | `Link href` | VERIFIED | Line 212: template literal `href={\`/projects/${p.key}/releases\`}` |
| `src/app/admin/page.tsx getDashboardStats` | `getProjectPipelineSummaries` | `Promise.all` parallel fetch | VERIFIED | Line 83 is the 8th entry in the Promise.all destructure |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| PIPE-01 | 08-01, 08-02, 08-03 | Admin sees per-project prod and dev version side-by-side (replaces single currentVersion) | SATISFIED | `prodVersion`/`devVersion` rendered in stacked prod/dev rows; mono font; `—` fallback for missing env |
| PIPE-02 | 08-02, 08-03 | Admin sees pending-approval count badge per project tile | SATISFIED | Amber pill with `{p.pendingApprovalCount} pending` rendered conditionally when count > 0; absent when 0 |
| PIPE-03 | 08-01, 08-02, 08-03 | Admin sees last-deploy timestamp per project per environment | SATISFIED | `formatRelativeTime(p.prodDeployedAt)` and `formatRelativeTime(p.devDeployedAt)` rendered with null guards; COALESCE fallback in query handles legacy null deployed_at rows |
| PIPE-04 | 08-03 | Admin can click any project tile to navigate to /projects/<slug>/releases | SATISFIED | Whole tile is Next.js `<Link>` with `href={\`/projects/${p.key}/releases\`}` |
| PIPE-06 | 08-02, 08-03 | Admin home tile shows compact what-changed one-liner | SATISFIED | `dev-ahead`: full breakdown rendered from `whatChangedOneliner`; `inverted`: "dev behind prod" sentinel; `parity`: row hidden entirely |

No orphaned requirements. PIPE-05 is explicitly Phase 9 scope per REQUIREMENTS.md — not expected in Phase 8.

---

### Anti-Patterns Found

None. Scan of `src/lib/pipeline-summary.ts`, `src/app/admin/page.tsx`, and `src/db/schema.ts` found:
- No TODO/FIXME/PLACEHOLDER comments
- No `throw new Error('NOT_IMPLEMENTED')` stub remaining
- No empty array/object returns that flow to rendering without data-fetching
- `formatRelativeTime(p.prodDeployedAt)` and `formatRelativeTime(p.devDeployedAt)` both guarded by `{p.prodDeployedAt && (...)}` / `{p.devDeployedAt && (...)}` — TypeScript narrows to `string` before call; not a type-safety issue

---

### Human Verification Required

#### 1. Visual tile layout correctness

**Test:** Log into `/admin` with a staff account and inspect the Project Health section
**Expected:** Each project tile shows prod row (version + relative time), dev row (version + relative time or `—` muted), amber pill in top-right when pending approvals > 0, what-changed one-liner at bottom when dev is ahead, nothing at bottom on parity, "dev behind prod" in muted zinc on inversion
**Why human:** Visual appearance and spacing cannot be verified with grep; perceived contrast of hover border (zinc-800 to zinc-600) requires visual inspection

#### 2. Tile click-through navigation

**Test:** Click a project tile on `/admin`
**Expected:** Navigates to `/projects/<slug>/releases`; cmd/ctrl-click opens new tab natively (Next.js Link default behavior)
**Why human:** Browser navigation behavior and new-tab cmd-click cannot be verified statically

---

### Gaps Summary

No gaps. All 14 must-haves verified. All 5 required requirements (PIPE-01 through PIPE-04, PIPE-06) satisfied with concrete evidence in the codebase. Two human verification items remain for visual/behavioral confirmation, but all automated checks pass.

---

_Verified: 2026-05-07_
_Verifier: Claude (gsd-verifier)_
