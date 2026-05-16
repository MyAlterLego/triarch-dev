---
phase: 27
slug: cl6-server-side-adoption
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-16
---

# Phase 27 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.x |
| **Config file** | `vitest.config.ts` (existing — `@/` alias, jsdom env) |
| **Quick run command** | `npx vitest run src/app/api/platform/cicd/gate-verdict/route.test.ts src/app/api/platform/ingest/release-logs/route.test.ts` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~15 seconds (quick) / ~90 seconds (full) |

---

## Sampling Rate

- **After every task commit:** Run quick command (route-scoped tests)
- **After every plan wave:** Run full suite
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 27-01-01 | 01 | 1 | CL6-01 (schema) | unit | `npx vitest run src/db/schema.test.ts` (if exists) or migration apply check | ❌ W0 | ⬜ pending |
| 27-02-01 | 02 | 2 | CL6-01 (endpoint) | unit | `npx vitest run src/app/api/platform/cicd/gate-verdict/route.test.ts` | ❌ W0 | ⬜ pending |
| 27-02-02 | 02 | 2 | CL6-01 (auth + 401/400) | unit | same | ❌ W0 | ⬜ pending |
| 27-02-03 | 02 | 2 | CL6-01 (pass/fail verdict insert) | unit | same | ❌ W0 | ⬜ pending |
| 27-03-01 | 03 | 3 | CL6-02 (pair lookup) | unit | `npx vitest run src/app/api/platform/ingest/release-logs/route.test.ts` | ❌ W0 | ⬜ pending |
| 27-03-02 | 03 | 3 | CL6-02 (target_version match) | unit | same | ❌ W0 | ⬜ pending |
| 27-03-03 | 03 | 3 | CL6-02 (api_key_hash match) | unit | same | ❌ W0 | ⬜ pending |
| 27-03-04 | 03 | 3 | CL6-03 (409 body shape) | unit | same | ❌ W0 | ⬜ pending |
| 27-03-05 | 03 | 3 | CL6-03 (reject_no_pair audit) | unit | same | ❌ W0 | ⬜ pending |
| 27-03-06 | 03 | 3 | CL6-03 (release row NOT inserted) | unit | same | ❌ W0 | ⬜ pending |
| 27-03-07 | 03 | 3 | CL6-04 (env=dev bypass) | unit | same | ❌ W0 | ⬜ pending |
| 27-03-08 | 03 | 3 | CL6-04 (enforcement modes off/warn/enforce) | unit | same | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/app/api/platform/cicd/gate-verdict/route.test.ts` — new file, covers CL6-01 (7 scenarios from RESEARCH.md)
- [ ] `src/app/api/platform/ingest/release-logs/route.test.ts` — new file, covers CL6-02, CL6-03, CL6-04 (9 scenarios from RESEARCH.md)
- [ ] Vitest mock fixtures for `@/lib/db` select-chain (5-link: `.from().where().orderBy().limit()`) — established pattern from `promote-callback/route.test.ts`, extend for 5-link chain
- [ ] Vitest mock for `@/lib/link-stamper` (`stampLinksFromCommit`) — needed for happy-path ingest tests so the auto-stamper side-effect doesn't pollute the test
- [ ] No new framework install needed — Vitest 4.x already configured

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Contrived consumer test: strip `needs: gate` from a workflow, deploy, confirm no release row | CL6-04 (partial) | Requires an actual GitHub Actions run + Firebase App Hosting deploy in a controlled consumer repo; cannot be reproduced inside Vitest | Phase 28 (platform self-adopt) will provide the first real test ground. Until then, the unit-level "enforce mode rejects" assertion stands in. The compliance matrix red-flag is Phase 35's scope. |
| End-to-end timing margin (15-min window) under CI time skew | (pitfall — operational) | Time skew between consumer CI and admin server isn't reproducible in a unit test | Verify in Phase 28 staging that a deploy taking >5 min between gate-verdict POST and release-logs POST still passes |
| Key rotation in flight: same project_key used with old + new Bearer | (pitfall — operational) | Requires CRDB row + multi-token state | Defer to Phase 32 if observed; theoretical concern |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (gate-verdict + release-logs test files)
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s for route-scoped tests
- [ ] `nyquist_compliant: true` set in frontmatter (after planner verifies all tasks map)

**Approval:** pending
