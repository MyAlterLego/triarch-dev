---
phase: 27-cl6-server-side-adoption
verified: 2026-05-16T00:00:00Z
status: human_needed
score: 4/4 must-haves verified
human_verification:
  - test: "Strip `needs: gate` from a consumer workflow, trigger a prod deploy, and confirm no release_logs row appears AND the compliance matrix flags the project red"
    expected: "The prod ingest returns 409 CL6-VIOLATION (enforce mode) or logs a warning (warn mode); no release_logs row is inserted (enforce) or an audit row is written (warn); compliance matrix UI shows red for CL-6 column for that project"
    why_human: "Requires shared-workflows v8.2 gate-verdict call to exist (Phase 28 deliverable) and a live consumer workflow to strip; the unit-testable enforce-mode path (Test 3) is GREEN and covers the code path, but the end-to-end live workflow test needs a real consumer repo and Phase 28 wiring"
  - test: "Compliance matrix UI at /admin/modules/ci-cd reflects CL-6 red/green per project after gate verdicts accumulate"
    expected: "The compliance matrix cell for CL-6 shows green for projects with a pass verdict in the last 15 min, red for projects with reject_no_pair rows"
    why_human: "Phase 35 scope — the UI that reads deploy_gate_check rows does not exist yet; Phase 27 only writes the data"
  - test: "Apply migration 0019 to the live CRDB cluster (dev + prod) and confirm table + index exist before the first FAH dev deploy"
    expected: "SHOW CREATE TABLE deploy_gate_check returns the 9-column schema; SHOW INDEXES FROM deploy_gate_check shows deploy_gate_check_project_created_at_idx"
    why_human: "DATABASE_URL is a Firebase App Hosting secret not available locally; requires manual firebase apphosting:secrets:access + npm run db:push by a human with GCP access"
---

# Phase 27: CL-6 Server-Side Adoption Enforcement Verification Report

**Phase Goal:** Make CL-4 non-bypassable — admin `/api/platform/ingest/release-logs` rejects `env=prod` ingests without a paired pass-verdict `deploy_gate_check` audit row in the prior 15 min, same project_key, same target_version, same Bearer apiKey.
**Verified:** 2026-05-16
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | Endpoint reads most-recent `deploy_gate_check` row for `(project_key)` within last 15 min using `gte(createdAt, cutoff)` + `orderBy(desc).limit(1)` | VERIFIED | `route.ts:54-65` — `CL6_LOOKBACK_MS = 15 * 60 * 1000`, cutoff computed via `new Date(Date.now() - CL6_LOOKBACK_MS)`, Drizzle chain: `.from(deployGateCheck).where(and(eq(projectKey, project.key), gte(createdAt, cutoff))).orderBy(desc(createdAt)).limit(1)` |
| 2 | Endpoint asserts verdict='pass' AND target_version (trimmed) matches ingested version (trimmed) AND apiKeyHash matches SHA-256 of current Bearer token | VERIFIED | `route.ts:68-72` — triple conjunction: `latestVerdict.verdict === 'pass' && latestVerdict.targetVersion.trim() === normalizedIngestVersion && latestVerdict.apiKeyHash === currentApiKeyHash`; same `createHash('sha256').update(rawKey).digest('hex')` as gate-verdict route |
| 3 | On mismatch/missing in enforce mode: returns 409 with locked body shape, writes reject_no_pair audit row, does NOT insert release_logs row | VERIFIED | `route.ts:74-115` — audit insert at line 87 wrapped in try/catch, 409 return at line 101 with `{error:'gate_required',code:'CL6-VIOLATION',expected:{max_age_seconds:900},remediation_url:'/admin/modules/ci-cd'}`; enforce path returns early before `db.insert(releaseLogs)` at line 138 |
| 4 | Unit-testable CL6-04 portion: enforce mode with no verdict row returns 409, no release insert; 16 new Vitest tests all pass | VERIFIED | Tests 3-6 in `release-logs/route.test.ts` cover enforce+no-row, version-mismatch, hash-mismatch, verdict=fail — all 9 scenarios confirmed GREEN per 27-03-SUMMARY; 7 gate-verdict scenarios GREEN per 27-02-SUMMARY; 16 total |

**Score:** 4/4 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/db/schema.ts` | `deployGateCheck` table + composite index + `DeployGateCheck`/`NewDeployGateCheck` types | VERIFIED | Lines 77-95: pgTable with 9 columns, second-arg index callback `deploy_gate_check_project_created_at_idx` on `(project_key, created_at DESC)`, both type exports present; no pgEnum (text verdict); import extended with `index` from drizzle-orm/pg-core |
| `src/db/migrations/0019_deploy_gate_check.sql` | BEGIN/COMMIT + CREATE TABLE + CREATE INDEX with all 9 columns | VERIFIED | Lines 1-35: `BEGIN;` at line 18, `COMMIT;` at line 35, `CREATE TABLE IF NOT EXISTS deploy_gate_check` with all 9 columns including `timestamp with time zone` and `gen_random_uuid()`, `CREATE INDEX IF NOT EXISTS deploy_gate_check_project_created_at_idx` |
| `src/app/api/platform/cicd/gate-verdict/route.ts` | POST handler with SHA-256 hashing, requireApiKey, deployGateCheck insert | VERIFIED | 80 lines: `createHash('sha256')` at line 64, `requireApiKey(req)` at line 24, `db.insert(deployGateCheck)` at line 66, VALID_CALLER_VERDICTS set guards against 'reject_no_pair' from callers; static path (no `[key]` segment) |
| `src/app/api/platform/cicd/gate-verdict/route.test.ts` | 7 Vitest scenarios for gate-verdict endpoint | VERIFIED | 169 lines, `describe('POST /api/platform/cicd/gate-verdict'` with exactly 7 `it(...)` blocks; mocks @/lib/api-key-auth, @/lib/db, @/db/schema; hash assertion against FAKE_TOKEN_HASH |
| `src/app/api/platform/ingest/release-logs/route.ts` | Modified with CL-6 pre-check block, existing behavior preserved | VERIFIED | Lines 40-123: additive pre-check inserted between env determination and `db.insert(releaseLogs)`; `createHash('sha256')` at line 52, `process.env.CL6_ENFORCEMENT_MODE ?? 'warn'` at line 47, `db.insert(releaseLogs)` unchanged at line 138, `stampLinksFromCommit` preserved (2 refs) |
| `src/app/api/platform/ingest/release-logs/route.test.ts` | 9 Vitest scenarios across enforcement modes and env values | VERIFIED | 237 lines, `describe('POST /api/platform/ingest/release-logs (CL-6 pre-check)'` with 9 `it(...)` blocks; `buildSelectChain()` helper present; all three CL6_ENFORCEMENT_MODE values tested |
| `apphosting.yaml` | `CL6_ENFORCEMENT_MODE: warn` with RUNTIME availability | VERIFIED | Lines 98-108: `variable: CL6_ENFORCEMENT_MODE`, `value: warn`, `availability: [RUNTIME]` |
| `apphosting.dev.yaml` | `CL6_ENFORCEMENT_MODE: warn` with RUNTIME availability | VERIFIED | Lines 27-32: `variable: CL6_ENFORCEMENT_MODE`, `value: warn`, `availability: [RUNTIME]` |
| `package.json` | Version 2.13.14 | VERIFIED | Line 3: `"version": "2.13.14"` |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `ingest/release-logs/route.ts` | `deployGateCheck` (select) | `db.select().from(deployGateCheck).where(and(...)).orderBy(desc(createdAt)).limit(1)` | WIRED | `route.ts:55-65` — all 5 Drizzle chain links present |
| `ingest/release-logs/route.ts` | `deployGateCheck` (audit insert) | `db.insert(deployGateCheck).values({verdict:'reject_no_pair',...})` | WIRED | `route.ts:87-95` — wrapped in try/catch per stampLinksFromCommit pattern |
| `ingest/release-logs/route.ts` | `process.env.CL6_ENFORCEMENT_MODE` | Call-time read with default 'warn' | WIRED | `route.ts:47` — `process.env.CL6_ENFORCEMENT_MODE ?? 'warn'` inside POST handler |
| `gate-verdict/route.ts` | `deployGateCheck` (write) | `db.insert(deployGateCheck).values({...}).returning()` | WIRED | `route.ts:66-77` — insert with all required fields including apiKeyHash |
| `gate-verdict/route.ts` | SHA-256 hash | `createHash('sha256').update(rawKey).digest('hex')` | WIRED | `route.ts:64` — extracted before requireApiKey call (Pitfall 2 guard) |
| `ingest/release-logs/route.ts` | SHA-256 hash | `createHash('sha256').update(rawKey).digest('hex')` | WIRED | `route.ts:52` — byte-identical approach to gate-verdict route ensures hash matches |
| `apphosting.yaml` | `CL6_ENFORCEMENT_MODE` env var | Plain value 'warn', RUNTIME availability | WIRED | Confirmed at `apphosting.yaml:105-108` |
| `apphosting.dev.yaml` | `CL6_ENFORCEMENT_MODE` env var | Plain value 'warn', RUNTIME availability | WIRED | Confirmed at `apphosting.dev.yaml:29-32` |
| `ingest/release-logs/route.ts` | existing `db.insert(releaseLogs)` | Preserved on happy path and warn-mode fall-through | WIRED | `route.ts:138` — single occurrence, unmodified; enforce 409 returns early before reaching it |
| `ingest/release-logs/route.ts` | `stampLinksFromCommit` | Preserved in try/catch after releaseLogs insert | WIRED | `route.ts:158-186` — 2 refs (call at 178, error message at 185) |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| **CL6-01** | 27-01-PLAN.md (schema), 27-02-PLAN.md (write endpoint) | Endpoint reads most-recent `deploy_gate_check` audit row for `(project_key)` written in prior 15 minutes | SATISFIED | `deployGateCheck` table exists in schema with composite index; gate-verdict POST endpoint writes rows with correct shape; ingest route reads with `gte(createdAt, cutoff)` + `orderBy(desc).limit(1)` |
| **CL6-02** | 27-03-PLAN.md | Endpoint asserts verdict=pass AND target_version == ingested_version AND same bearer apiKey wrote both rows | SATISFIED | Triple-assertion at `ingest/release-logs/route.ts:68-72`; SHA-256 hash comparison uses byte-identical approach in both endpoints; trim() normalization on both sides |
| **CL6-03** | 27-03-PLAN.md | On mismatch/missing: return 409 with structured error, do NOT insert release row, write rejection to audit log | SATISFIED | `route.ts:74-115`: reject_no_pair audit row written before mode branch; enforce mode returns 409 early; releaseLogs insert at line 138 is never reached in enforce path; 409 body matches locked CONTEXT.md shape |
| **CL6-04** | 27-03-PLAN.md | Contrived test: strip `needs: gate`, deploy, confirm release row never appears AND compliance matrix flags red | PARTIAL — unit portion SATISFIED, operational portion HUMAN_NEEDED | Test 3 in `route.test.ts` verifies enforce+no-row→409+no-release-insert (unit-testable portion); live consumer workflow test requires Phase 28 shared-workflows v8.2 wiring; compliance matrix red flag requires Phase 35 UI |

**REQUIREMENTS.md status:** All four CL6-0x requirements are marked `[x]` (checked) in `.planning/REQUIREMENTS.md:295-298`, consistent with the phase work completed.

---

### Anti-Patterns Found

No blockers. No stubs. Scanned all 5 modified/created source files:

| File | Pattern Checked | Result |
|------|----------------|--------|
| `gate-verdict/route.ts` | TODO/placeholder/empty return | None found |
| `gate-verdict/route.ts` | `return null` / `return {}` | None — returns 201 JSON row or error |
| `ingest/release-logs/route.ts` | CL-6 pre-check wired vs placeholder | Fully wired — no `console.log('TODO')` patterns |
| `ingest/release-logs/route.ts` | `db.insert(releaseLogs)` preserved | Confirmed — 1 occurrence at line 138 |
| `schema.ts` | pgEnum (forbidden per RESEARCH) | 0 occurrences |
| `0019_deploy_gate_check.sql` | bare `timestamp` (should be `timestamp with time zone`) | 0 occurrences — all timestamps use `timestamp with time zone` |
| Both `route.test.ts` files | Stub mocks that never resolve | All mocks resolve with typed return values; `buildSelectChain` properly resolves via Promise |

**Note on `CL6_ENFORCEMENT_MODE=warn` default:** This is intentional operational design, not a stub. The warn default is explicitly documented in CONTEXT.md D-Rollout as the safe ship posture. The flip to `enforce` is a post-Phase-28 manual operational step.

---

### Human Verification Required

#### 1. Live Consumer Workflow Test (CL6-04 Operational Portion)

**Test:** Take a consumer repo that has `needs: gate` in its `ci-cd.yml`, strip that line, merge to main, and trigger a prod deploy.
**Expected:** The prod ingest call to `/api/platform/ingest/release-logs` returns 409 CL6-VIOLATION (when `CL6_ENFORCEMENT_MODE=enforce`) or writes a `reject_no_pair` audit row and returns 201 (warn mode); no `release_logs` row appears for `env=prod` in enforce mode.
**Why human:** Requires shared-workflows v8.2 gate-verdict write step (Phase 28 deliverable) and a live consumer with a real API key. The unit path is covered by Test 3. Phase 28 will provide the first real ground truth of the end-to-end round-trip.

#### 2. Compliance Matrix CL-6 Cell (Phase 35 Scope)

**Test:** After `deploy_gate_check` rows accumulate, navigate to `/admin/modules/ci-cd` and confirm the CL-6 column shows green/red per project.
**Expected:** Projects with a recent `verdict=pass` row show green; projects with `verdict=reject_no_pair` show red.
**Why human:** Phase 35 scope — no UI exists yet. The audit data accumulates correctly from Phase 27 onwards, but the rendering layer is a future phase.

#### 3. Migration 0019 Applied to Live CRDB

**Test:** After retrieving DATABASE_URL from Firebase secrets, run `npm run db:push` and confirm with `SHOW CREATE TABLE deploy_gate_check` and `SHOW INDEXES FROM deploy_gate_check`.
**Expected:** Table exists with 9 columns; index `deploy_gate_check_project_created_at_idx` exists on `(project_key, created_at DESC)`.
**Why human:** DATABASE_URL is a Firebase App Hosting secret; cannot be run in automated verification. This is a PRE-DEPLOY blocker surfaced in 27-01-SUMMARY.md.

---

### Gaps Summary

No gaps. All automated must-haves are satisfied:

- Data layer (CL6-01): `deploy_gate_check` table in Drizzle schema and SQL migration match the 9-column spec from CONTEXT.md exactly; covering index present; no shared-package modifications.
- Write endpoint (CL6-01): `POST /api/platform/cicd/gate-verdict` authenticates via requireApiKey, validates payload, hashes Bearer token with SHA-256, inserts row. 7/7 tests GREEN.
- Ingest pre-check (CL6-02, CL6-03): Triple assertion (verdict, version, hash) wired correctly; 409 body shape matches locked contract; reject_no_pair audit write in try/catch; warn-mode fall-through preserved; existing releaseLogs insert and stampLinksFromCommit untouched. 9/9 tests GREEN.
- Enforcement mode (CL6-04 unit portion): all three modes (off, warn, enforce) and both env values (dev, prod) covered by tests.
- Config: `CL6_ENFORCEMENT_MODE=warn` RUNTIME binding in both apphosting files; version at 2.13.14.
- Commits: 10 commits on dev branch, all tagged correctly (feat/test/docs/chore prefixes per task type).

The three human verification items are explicitly out of scope for Phase 27 per CONTEXT.md (live consumer test = Phase 28; compliance matrix UI = Phase 35; db:push = operational manual step flagged in 27-01-SUMMARY).

---

_Verified: 2026-05-16_
_Verifier: Claude (gsd-verifier)_
