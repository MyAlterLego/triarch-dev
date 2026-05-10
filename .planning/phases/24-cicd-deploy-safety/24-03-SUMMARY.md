---
phase: 24-cicd-deploy-safety
plan: 03
subsystem: infra
tags: [ci-cd, github-actions, apphosting, env-validation, vitest, yaml, drift-guard]

requires:
  - phase: 24-cicd-deploy-safety
    provides: REQUIRED_ENV constant (src/lib/env-schema.ts) in both admin and portal — the single source of truth that this plan's CI lint cross-checks against apphosting.yaml + apphosting.dev.yaml
provides:
  - Pre-deploy CI gate (validate-apphosting job) in BOTH admin and portal that fails the build on any missing or typo'd binding in apphosting.yaml — env drift now caught at PR time, not at FAH boot
  - scripts/validate-apphosting.ts: byte-identical between repos (only the imported REQUIRED_ENV content differs); parses YAML with yaml@2.8.4; exports validateApphosting() for unit-test access; main() guarded by import.meta.url so test imports do not invoke process.exit
  - 10 new Vitest cases (5 per repo) covering clean-pass, missing-binding, dead-binding-warn, NODE_AUTH_TOKEN allow-list, NEXT_PUBLIC_* allow-list — using temp-file fixtures (no fs mocks)
affects:
  - 25-cutover (CI-04 is a hard prerequisite for safe cutover — env-name typos now fail the build instead of half-boot)
  - any future plan that adds runtime env vars (must update REQUIRED_ENV + apphosting.yaml in lockstep — the CI lint now enforces the lockstep)

tech-stack:
  added: []
  patterns:
    - "CI gate pattern: per-repo `validate-apphosting:` job parallel to other quality-gate-dependent jobs, listed in `deploy:` needs: array — keeps the gate gated *before* FAH apply"
    - "Test pattern: temp-file fixtures via mkdtempSync(tmpdir(), 'prefix-') over fs mocks — avoids vi.mock fragility with transitive node:fs imports inside `yaml`"
    - "Pattern: import.meta.url === `file://${process.argv[1]}` guard at script bottom — keeps script unit-testable (test imports do not run main())"
    - "Pattern: byte-identical script across repos with diverging schema constants — diff scripts/*.ts is empty; only ../src/lib/env-schema.ts content differs"

key-files:
  created:
    - admin/scripts/validate-apphosting.ts
    - admin/scripts/validate-apphosting.test.ts
    - portal/scripts/validate-apphosting.ts
    - portal/scripts/validate-apphosting.test.ts
    - portal/scripts/  (new directory in portal — first scripts file)
  modified:
    - admin/.github/workflows/ci-cd.yml (new validate-apphosting job; deploy: needs updated to [quality-gate, validate-apphosting])
    - admin/package.json (2.11.0 → 2.11.1)
    - portal/.github/workflows/ci-cd.yml (new validate-apphosting job; deploy: needs updated)
    - portal/package.json (0.5.1 → 0.5.2)

key-decisions:
  - "Temp-file fixtures over fs mocking — vi.mock('node:fs') with partial mock via importOriginal() failed under Vitest 4.x for this script because dynamic import('./validate-apphosting') and the closures inside `yaml` package made the mock impl race against the module bind. Switched to mkdtempSync + writeFileSync per test, with afterEach rmSync cleanup. Hermetic, fast, no module-graph fragility."
  - "deploy: needs: [quality-gate, validate-apphosting] — NOT the [quality-gate, verify-deploy-target, validate-apphosting] the PLAN.md frontmatter referenced. 24-01 (verify-deploy-target) was scoped out per Mike's reduced-scope call; the job does not exist in either repo's ci-cd.yml. Documenting in deviations."
  - "validate-apphosting job uses node 22 + npm ci with NODE_AUTH_TOKEN secret (GITHUB_PACKAGES_TOKEN) — same as repo's other CI jobs, since `npm ci` needs to fetch private @triarchsecurity/* packages from npm.pkg.github.com to resolve the script's transitive deps."
  - "Allow-list bindings stay in code, not config: NODE_AUTH_TOKEN is BUILD-only (validated by yaml's `availability: [BUILD]`) and NEXT_PUBLIC_* are inlined at build time. Both are excluded from REQUIRED_ENV by design and from the dead-binding warning by the script's allow-list. Future BUILD-only or NEXT_PUBLIC_ additions will not trigger false-positive warnings."

patterns-established:
  - "Pattern: CI lint script imports its source-of-truth constant from runtime code — scripts/validate-apphosting.ts imports REQUIRED_ENV from ../src/lib/env-schema. The runtime boot guard (assertEnv) and the CI-time lint share one constant; they cannot diverge."
  - "Pattern: per-repo identical CI gate scripts — admin and portal both have scripts/validate-apphosting.ts with byte-identical content. Future scope (V2.3+) is a shared @triarchsecurity package; for now, the duplication is auditable via `diff`."
  - "Pattern: workflow job ordering — `validate-apphosting` parallel to `flush-changelog` (both `needs: quality-gate`) for speed; `deploy:` depends on both quality-gate and validate-apphosting to gate the actual FAH apply."

requirements-completed: [CI-04]

duration: 5 min
completed: 2026-05-09
---

# Phase 24 Plan 03: validate-apphosting CI Linter Summary

**Pre-deploy CI gate that fails the build on any apphosting.yaml binding drift from REQUIRED_ENV — landed in BOTH admin (18-entry schema, 4 dev overrides) and portal (12-entry schema, 8 dev overrides). 10 new Vitest cases. Both repos versioned, branches pushed, PRs open and awaiting merge.**

## Performance

- **Duration:** ~5 minutes
- **Started:** 2026-05-10T00:50:10Z
- **Completed:** 2026-05-10T00:55:32Z
- **Tasks:** 2 (admin + portal)
- **Files created:** 4 (scripts/validate-apphosting.ts + .test.ts × 2 repos)
- **Files modified:** 4 (ci-cd.yml + package.json × 2 repos)
- **Test count delta:** admin +5 cases, portal +5 cases (10 total)

## Accomplishments

- Both admin and portal will now FAIL THE PR BUILD if any name in `REQUIRED_ENV` is missing from `apphosting.yaml` — env-name typos can no longer slip past CI and surface as failed FAH rollouts. The `deploy:` job is gated `needs: [quality-gate, validate-apphosting]` so the deploy reusable workflow never runs on drift.
- Single source of truth confirmed end-to-end: `src/lib/env-schema.ts → REQUIRED_ENV` is now consumed BOTH at boot (`src/instrumentation.ts → src/lib/assertEnv.ts`, from 24-02) AND at CI time (`scripts/validate-apphosting.ts`). Boot guard and CI lint cannot drift from each other.
- `scripts/validate-apphosting.ts` is byte-identical between admin and portal (verified via `diff` — empty output). Only `../src/lib/env-schema.ts` content differs (admin 18 entries, portal 12 entries). Future shared-package extraction (V2.3 candidate) only needs to relocate the script; call sites stay unchanged.
- Current state confirmed drift-free in both repos:
  - Admin: `OK: all 18 required vars bound; 4 dev overrides.`
  - Portal: `OK: all 12 required vars bound; 8 dev overrides.`

## Task Commits

Each task was committed via TDD (RED → GREEN), 2 commits per task:

1. **Task 1 (admin): RED** — `fad2268` (test) — `triarchsecurity/platform`
   - 1 file changed: `scripts/validate-apphosting.test.ts` (+99/-0)
   - 5 Vitest cases mocking node:fs initially; failed because target script did not yet exist (correct RED behavior)

2. **Task 1 (admin): GREEN** — `a33000f` (feat) — `triarchsecurity/platform`
   - 4 files changed: `scripts/validate-apphosting.ts` (new), `scripts/validate-apphosting.test.ts` (refactored to temp-file fixtures), `.github/workflows/ci-cd.yml` (new validate-apphosting job + deploy needs updated), `package.json` (version bump)
   - Vitest: 5/5 GREEN (full repo run includes 40 pre-existing failures from local Postgres ECONNREFUSED — unrelated to this plan)
   - `npx next build` clean
   - Version bump: 2.11.0 → 2.11.1 (patch: CI safety, no runtime change)

3. **Task 2 (portal): RED** — `f5ef27f` (test) — `triarchsecurity/dev-portal`
   - 1 file changed: `scripts/validate-apphosting.test.ts` (+92/-0)
   - Same 5 cases, temp-file fixtures from the start (admin's pivot was applied directly here)
   - Failed because target script did not yet exist (correct RED behavior)

4. **Task 2 (portal): GREEN** — `a2cb5d4` (feat) — `triarchsecurity/dev-portal`
   - 3 files changed: `scripts/validate-apphosting.ts` (new — copied byte-identically from admin), `.github/workflows/ci-cd.yml` (new validate-apphosting job + deploy needs updated), `package.json` (version bump)
   - Vitest: 5/5 GREEN
   - `npx next build` clean
   - Version bump: 0.5.1 → 0.5.2 (patch: CI safety)

**No metadata commit yet** — SUMMARY + state updates are staged in this plan, will commit at end.

**PRs opened (DO NOT merge — Mike will review and merge):**
- Admin: https://github.com/triarchsecurity/platform/pull/55
- Portal: https://github.com/triarchsecurity/dev-portal/pull/27

## Files Created/Modified

### Admin (`/Users/mikegeehan/claude/triarch/development/admin/`)

- `scripts/validate-apphosting.ts` — exports `validateApphosting(prodFile?, devFile?)` returning `{ ok, missing, dead, devCount }`; main() guarded by `import.meta.url === \`file://${process.argv[1]}\`` so unit tests do not invoke process.exit. Imports `REQUIRED_ENV` from `../src/lib/env-schema`.
- `scripts/validate-apphosting.test.ts` — 5 Vitest cases using temp-file fixtures (mkdtempSync per test, rmSync recursive cleanup in afterEach).
- `.github/workflows/ci-cd.yml` — new `validate-apphosting:` job (runs in parallel with `flush-changelog:`, both gated `needs: quality-gate`); `deploy:` now `needs: [quality-gate, validate-apphosting]`.
- `package.json` — 2.11.0 → 2.11.1.

### Portal (`/Users/mikegeehan/claude/triarch/development/portal/`)

- `scripts/` — new directory (first scripts file in portal).
- `scripts/validate-apphosting.ts` — byte-identical to admin's (only `../src/lib/env-schema.ts` content differs).
- `scripts/validate-apphosting.test.ts` — same 5 cases as admin's.
- `.github/workflows/ci-cd.yml` — same shape modification as admin's.
- `package.json` — 0.5.1 → 0.5.2.

## Decisions Made

### Why temp-file fixtures over fs mocks (Pitfall 9 echo)

Initial test design used `vi.mock('node:fs', () => ({ readFileSync: vi.fn() }))`. Vitest 4.x rejected this because the `yaml` package transitively touches other `node:fs` exports (default export, etc.). Tried partial mock via `importOriginal()` — that resolved the import error but a different failure surfaced: even with `mockImplementation` set in the test body BEFORE the dynamic `import('./validate-apphosting')`, the script's `readFileSync` reads still hit the real filesystem (script ran on REAL apphosting.yaml — devCount of 4 instead of expected 1). The exact cause was likely interaction between Vitest's hoisted-mock semantics and the script's static `import { readFileSync } from 'node:fs'` at module-load time.

Pivoted to **temp-file fixtures**: `mkdtempSync(tmpdir(), 'prefix-')` per test, write synthetic YAML strings via `writeFileSync`, pass paths to `validateApphosting(prodPath, devPath)`. afterEach `rmSync` cleans up. Hermetic, fast (~10ms per case), and the script is exercised the way CI exercises it (real filesystem, real yaml parser). No mock-graph fragility.

### Why deploy: needs: [quality-gate, validate-apphosting] (NOT three prerequisites)

PLAN.md's `<acceptance_criteria>` and frontmatter referenced `needs: [quality-gate, verify-deploy-target, validate-apphosting]`. The original Phase 24 scope had 24-01 land `verify-deploy-target` first; with 24-01 scoped out per Mike's call, that job does not exist in either repo's `ci-cd.yml`. Listing it in `needs:` would cause CI to fail with "job verify-deploy-target not found." Used the two-prerequisite form. Phase verifier should treat this as expected, not a deviation.

If 24-01 ships in a future plan, that plan's PLAN.md should explicitly extend the `needs:` array (one-line edit per repo).

### Why validate-apphosting: parallel to other quality-gate-dependent jobs

Both repos already had jobs gated `needs: quality-gate` (admin: `flush-changelog`; portal: previously only `deploy`). `validate-apphosting:` was added at the same dependency level so it runs concurrently with whatever else is post-quality-gate. The lint is fast (~5s — checkout + setup-node + npm ci + tsx run) so the parallelism barely matters in wallclock terms, but it preserves the convention "all gates run in parallel; deploy waits for all."

### Why npm ci (not just node setup) in the validate-apphosting job

The script imports `yaml` (devDep) AND transitively the runtime imports from `../src/lib/env-schema`. Without `npm ci`, `tsx` cannot resolve them. The job uses `NODE_AUTH_TOKEN: ${{ secrets.GITHUB_PACKAGES_TOKEN }}` so `npm ci` can fetch private `@triarchsecurity/*` packages — same pattern as the repo's other CI jobs that call `npm ci`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] vi.mock('node:fs') failed; pivoted test design to temp-file fixtures**

- **Found during:** Task 1 GREEN phase, first Vitest run after writing the implementation.
- **Issue:** Initial test used `vi.mock('node:fs', () => ({ readFileSync: vi.fn() }))`. Vitest 4.x errored: `[vitest] No "default" export is defined on the "node:fs" mock` — `yaml` package needs the default export. Switched to partial mock via `importOriginal()`; that resolved the import error but tests then ran against the REAL filesystem (clean-pass test reported devCount=4 instead of expected 1). Likely interaction between hoisted vi.mock and the script's static `import { readFileSync } from 'node:fs'`.
- **Fix:** Replaced fs mocking with hermetic temp-file fixtures: `mkdtempSync(tmpdir(), 'validate-apphosting-test-')` in `beforeEach`, `writeFileSync` per test, `rmSync(tmpDir, { recursive: true, force: true })` in `afterEach`. Pass the absolute paths to `validateApphosting(prodPath, devPath)`. The script's `resolve()` of an absolute path is a no-op; `readFileSync` reads the real temp file.
- **Files modified:** `admin/scripts/validate-apphosting.test.ts`, `portal/scripts/validate-apphosting.test.ts` (the portal test was created with the temp-file pattern from the start, after admin's pivot).
- **Verification:** Both repos: `npx vitest run scripts/validate-apphosting.test.ts` → 5/5 GREEN.
- **Committed in:** `a33000f` (admin), `a2cb5d4` (portal).

**2. [Rule 3 - Blocking] Plan referenced verify-deploy-target in deploy: needs:; that job does not exist (24-01 scoped out)**

- **Found during:** Pre-execution context read (Mike's prompt clarified 24-01 was skipped).
- **Issue:** PLAN.md's `<acceptance_criteria>` and frontmatter `must_haves.truths` cite `needs: [quality-gate, verify-deploy-target, validate-apphosting]`. The `verify-deploy-target` job does not exist in either repo's `ci-cd.yml` because Plan 24-01 was scoped out per Mike's reduced-scope decision. Listing it would cause CI to fail with "job verify-deploy-target not found."
- **Fix:** Used `needs: [quality-gate, validate-apphosting]` in both repos. The intent of the gate (block deploy until validation passes) is fully preserved. If 24-01 ships in a future plan, that plan can extend the `needs:` array in one line per repo.
- **Files modified:** `admin/.github/workflows/ci-cd.yml`, `portal/.github/workflows/ci-cd.yml`.
- **Verification:** `grep -E "needs:\s*\[quality-gate,\s*validate-apphosting\]"` returns the line in both repos. Both `npx next build` clean. Both PRs opened (CI will exercise the gate on PR).
- **Committed in:** `a33000f` (admin), `a2cb5d4` (portal).

**3. [Rule 1 - Verify-spec correction] Portal apphosting.dev.yaml has 8 overrides, not 7**

- **Found during:** Task 2 verification (running `npx tsx scripts/validate-apphosting.ts` from portal repo root).
- **Issue:** PLAN.md's `<behavior>` for Task 2 said "Test 1 (clean pass) on current portal state should report `OK: all 12 required vars bound; 7 dev overrides.`" Actual current state: `8 dev overrides` (NEXTAUTH_URL, DATABASE_URL, ADMIN_INTERNAL_DISPATCH_URL, FAH_PROMOTER_SA_KEY, PORTAL_SLACK_BOT_TOKEN, SLACK_RELEASE_APPROVAL_CHANNEL, PORTAL_BUG_REPORTS_CHANNEL, PORTAL_FEATURE_REQUESTS_CHANNEL — 8 entries, not 7). The plan's count was off-by-one — likely a Phase 23.1 addition (PORTAL_FEATURE_REQUESTS_CHANNEL) that landed after the planner inventoried the file.
- **Fix:** Verified the dev count is correct against the actual `portal/apphosting.dev.yaml` — 8 entries. Test 1 expects `result.devCount === 1` (set by the test's own write), not 8 — the test asserts on synthetic content, not the real apphosting.dev.yaml. Real-world behavior unchanged. Documented in this SUMMARY for the verifier's awareness.
- **Files modified:** None (no code change needed; plan's expected output line was the only thing inaccurate).
- **Verification:** `npx tsx scripts/validate-apphosting.ts` from portal returns `OK: all 12 required vars bound; 8 dev overrides.` (exit 0). Plan-level outcome unchanged.

---

**Total deviations:** 3 (1 test-pattern pivot, 1 workflow-needs adjustment driven by upstream scope cut, 1 inaccurate-expected-count correction). All preserve the plan's intent and acceptance-criteria spirit. No scope creep.
**Impact on plan:** None — files created match `<files>` exactly, all `must_haves.artifacts` and `must_haves.key_links` patterns confirmed via grep (see Self-Check below).

## Issues Encountered

None.

## Authentication Gates

None — no auth required for this plan (no external services, no CLI logins, GitHub auth via existing gh credentials).

## Schema vs apphosting.yaml drift status (snapshot at execution)

**Admin:**
- `apphosting.yaml`: 18 production bindings + 1 BUILD-only (`NODE_AUTH_TOKEN`) — 19 total. All 18 REQUIRED_ENV names bound. **No drift.**
- `apphosting.dev.yaml`: 4 overrides (NEXTAUTH_URL, DEPLOY_WEBHOOK_URL, DATABASE_URL → DATABASE_URL_DEV secret, INTERNAL_HMAC_SECRET).
- Validator output: `OK: all 18 required vars bound; 4 dev overrides.`

**Portal:**
- `apphosting.yaml`: 12 production bindings + 1 BUILD-only (`NODE_AUTH_TOKEN`) — 13 total. All 12 REQUIRED_ENV names bound. **No drift.**
- `apphosting.dev.yaml`: 8 overrides (NEXTAUTH_URL, DATABASE_URL → DATABASE_URL_PORTAL secret re-bind, ADMIN_INTERNAL_DISPATCH_URL, FAH_PROMOTER_SA_KEY re-bind, PORTAL_SLACK_BOT_TOKEN re-bind, SLACK_RELEASE_APPROVAL_CHANNEL → '#release-approvals-test', PORTAL_BUG_REPORTS_CHANNEL → '#triarch-bugs-test', PORTAL_FEATURE_REQUESTS_CHANNEL → '#triarch-features-test').
- Validator output: `OK: all 12 required vars bound; 8 dev overrides.`

## User Setup Required

None — no external service configuration changed in this plan. Once both PRs merge:
1. Admin's main branch will get the `validate-apphosting` CI job — every PR will exercise it.
2. Portal's main branch likewise.
3. First PR after merge that touches `apphosting.yaml` will be the live acceptance test for CI-04. To force-test before that PR happens: open a temp branch that strips one binding from `apphosting.yaml`, push, observe `validate-apphosting` job failure with `apphosting.yaml is missing required bindings:` and the missing name.

## Next Phase Readiness

- **24-04 (HUMAN-VERIFY runbook for SA + IAM)** — SCOPED OUT per Mike's call. The CI-04 acceptance test (deliberate-break branch) is the natural live-fire test on the next PR that intentionally drifts.
- **Phase 24 status (under reduced scope):** 24-02 + 24-03 are the only shipping plans. With this plan merged, Phase 24 is structurally complete — verifier can audit it. 24-01 and 24-04 remain logged as SKIPPED in ROADMAP.md for future scope.
- **25-cutover:** UNBLOCKED. CI-04 (this plan) + CI-03 (24-02) together ship the deploy-safety baseline 25-cutover assumed: env-name typos cannot reach FAH boot.

## Pitfall 8 acknowledgment (PR-time vs merge-time validation)

Both repos' `on:` triggers cover both `pull_request: [main]` and `push: [main, release/**, hotfix/**]`. Therefore:
- A PR that drifts `apphosting.yaml` from REQUIRED_ENV → `validate-apphosting` job fails on the PR run → reviewer sees the failure before merge.
- A direct push to main (allowed for trivial admin per workspace CLAUDE.md) → `validate-apphosting` runs on the push event → fails the run → `deploy:` (gated `if: github.event_name == 'push'`) never starts.

Both paths covered. Drift cannot slip through.

## Self-Check: PASSED

**Files exist:**
- `/Users/mikegeehan/claude/triarch/development/admin/scripts/validate-apphosting.ts` — FOUND
- `/Users/mikegeehan/claude/triarch/development/admin/scripts/validate-apphosting.test.ts` — FOUND
- `/Users/mikegeehan/claude/triarch/development/portal/scripts/validate-apphosting.ts` — FOUND
- `/Users/mikegeehan/claude/triarch/development/portal/scripts/validate-apphosting.test.ts` — FOUND

**Commits exist:**
- admin `fad2268` (RED) — FOUND on `feat/24-03-validate-apphosting`
- admin `a33000f` (GREEN) — FOUND on `feat/24-03-validate-apphosting`
- portal `f5ef27f` (RED) — FOUND on `feat/24-03-validate-apphosting`
- portal `a2cb5d4` (GREEN) — FOUND on `feat/24-03-validate-apphosting`

**Branches pushed:**
- admin `feat/24-03-validate-apphosting` → `origin/feat/24-03-validate-apphosting` ✓
- portal `feat/24-03-validate-apphosting` → `origin/feat/24-03-validate-apphosting` ✓

**PRs opened (NOT merged — awaiting Mike's review):**
- https://github.com/triarchsecurity/platform/pull/55 (admin)
- https://github.com/triarchsecurity/dev-portal/pull/27 (portal)

**Test counts:**
- admin: 5/5 new Vitest cases pass (preexisting 40 ECONNREFUSED failures from local Postgres unrelated to this plan)
- portal: 5/5 new Vitest cases pass

**Build status:**
- admin `npx next build` exit 0
- portal `npx next build` exit 0

**Local validator runs (drift status):**
- admin: `OK: all 18 required vars bound; 4 dev overrides.` (exit 0)
- portal: `OK: all 12 required vars bound; 8 dev overrides.` (exit 0)

**Key links verified:**
- `import { REQUIRED_ENV } from '../src/lib/env-schema'` present in both `scripts/validate-apphosting.ts` ✓
- `npx tsx scripts/validate-apphosting.ts` present in both `.github/workflows/ci-cd.yml` ✓
- `needs: [quality-gate, validate-apphosting]` on `deploy:` in both ci-cd.yml ✓ (note: NOT three prerequisites — see Deviation 2)

**Scripts byte-identical:**
- `diff admin/scripts/validate-apphosting.ts portal/scripts/validate-apphosting.ts` → no output ✓

---
*Phase: 24-cicd-deploy-safety*
*Plan: 03*
*Completed: 2026-05-09*
