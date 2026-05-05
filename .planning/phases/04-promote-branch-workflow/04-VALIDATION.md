---
phase: 4
slug: promote-branch-workflow
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-05
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.x |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run src/app/api/platform/promote-callback` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run src/app/api/platform/promote-callback`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | WORKFLOW-04 | E2E (manual UAT) | `gh workflow run promote-branch.yml -f branch=...` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | WORKFLOW-05 | unit | `npx vitest run src/app/api/platform/promote-callback` | ❌ W0 | ⬜ pending |

*Plan/task IDs filled in by gsd-planner. Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/app/api/platform/promote-callback/route.test.ts` — Bearer auth (200/401), payload validation (200/400), DB insert assertion
- [ ] Migration smoke test — `db:push` against shadow DB OR vitest using in-memory drizzle adapter to confirm `promote_attempts` table shape

*Workflow itself (`promote-branch.yml`) is not unit-testable — covered via Manual-Only Verifications below.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Clean rebase + merge to main | WORKFLOW-04 / SC-1 | GitHub Actions workflow only runs in GH environment | Dispatch `promote-branch.yml` with `branch=feat/test-clean` on a sandbox repo where main is ahead. Expect `result=merged`, `merge_sha` set, branch present in `main` history via `git log --first-parent`. |
| Conflict path returns file list | WORKFLOW-04 / SC-2 | Requires real merge conflict in git working tree | Create a branch that conflicts with main. Dispatch workflow. Expect non-zero exit, `result=conflict`, `conflict_files` populated. |
| Callback received with payload | WORKFLOW-05 / SC-3 | Requires real GitHub Actions runner POSTing to admin | After dispatch (clean and conflict cases), check `promote_attempts` row exists with correct `result`, `branch`, and conditional fields per D-12. Verify Bearer auth: a request without the token returns 401. |
| CI failure path | WORKFLOW-04 | Requires intentional test failure on a real branch | Create a branch with a failing test. Dispatch workflow. Expect `result=ci_failed`, `ci_run_url` populated, no merge to main. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (`route.test.ts`, migration smoke)
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
