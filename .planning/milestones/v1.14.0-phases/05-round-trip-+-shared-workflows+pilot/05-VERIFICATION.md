---
phase: 05-round-trip-+-shared-workflows+pilot
verified: 2026-05-03T00:00:00Z
status: human_needed
score: 4/7 success criteria verified (3 intentionally deferred to human gate)
human_verification:
  - test: "shared-workflows ci-cd.yml POST step (WORKFLOW-01)"
    expected: "After a dev deploy, a release_logs row appears in admin DB with env='dev', status='dev', commit_sha and deployed_at populated"
    why_human: "Requires editing MyAlterLego/shared-workflows (separate repo, cross-repo change). Cannot verify from admin session."
  - test: "shared-workflows deploy-prod.yml POST step (WORKFLOW-02)"
    expected: "After deploy-prod.yml completes, POST /api/releases/promoted is called and a paired env='prod' row appears in admin DB"
    why_human: "Requires editing MyAlterLego/shared-workflows (separate repo, cross-repo change). Cannot verify from admin session."
  - test: "Truth+Treason end-to-end smoke test (PILOT-01)"
    expected: "Full chain: customer approve click -> Slack message -> staff Promote click -> deploy-prod.yml dispatched -> completes -> paired prod row in DB -> Timeline shows all 5 lifecycle events"
    why_human: "Requires: (a) WORKFLOW-01 + WORKFLOW-02 already applied to shared-workflows, (b) T+T ref bumped + ADMIN_API_TOKEN secret set, (c) Phases 2+3+4 HUMAN-UATs completed (Slack App, GitHub App, DB migrations 0008+0009 in prod). Multi-repo, multi-system, live-infra test."
---

# Phase 05: Round-Trip + shared-workflows + Pilot Verification Report

**Phase Goal:** Close the loop — both dev and prod deploys report back to admin via shared-workflows, the timeline reflects the full lifecycle, and Truth+Treason exercises the workflow end-to-end.
**Verified:** 2026-05-03
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | POST /api/releases/promoted exists; auth via per-project Bearer token | VERIFIED | `src/app/api/releases/promoted/route.ts` line 4: `import { requireApiKey } from '@/lib/api-key-auth'`; line 11: `const { error, project } = await requireApiKey(req); if (error) return error;` |
| 2 | Endpoint creates paired prod row + updates dev row status atomically | VERIFIED | `route.ts` line 81: `db.transaction(async (tx) => { ... tx.insert(releaseLogs).values({env:'prod',status:'promoted',...}).returning(); tx.update(releaseLogs).set({status:'promoted'}).where(...)` |
| 3 | Idempotent replay returns 200 with existing row, no double INSERT | VERIFIED | `route.ts` lines 65–78: existingProdRow check before transaction; returns 200 immediately on match; test F asserts `dbTransactionMock` not called on replay |
| 4 | Timeline view renders full lifecycle (deployed-dev → feedback → approved → promoted → deployed-prod) | VERIFIED | `Timeline.tsx` buildEvents() constructs all 5 event kinds; wired in `ReleasesClient.tsx` line 671: `<Timeline release={release} />`; page.tsx hydrates pairedProd via separate prod query |
| 5 | shared-workflows ci-cd.yml POSTs to release-logs ingest (WORKFLOW-01) | HUMAN NEEDED | Cross-repo change in MyAlterLego/shared-workflows. YAML documented in 05-HUMAN-UAT.md Section D.2 — not yet applied. |
| 6 | shared-workflows deploy-prod.yml POSTs to /api/releases/promoted (WORKFLOW-02) | HUMAN NEEDED | Cross-repo change in MyAlterLego/shared-workflows. YAML documented in 05-HUMAN-UAT.md Section D.3 — not yet applied. |
| 7 | T+T E2E smoke test passes end-to-end (PILOT-01) | HUMAN NEEDED | Depends on WORKFLOW-01 + WORKFLOW-02 + Phases 2+3+4 HUMAN-UATs complete + T+T ref bump. Sequenced in 05-HUMAN-UAT.md Sections E+F. |

**Score:** 4/7 truths verified (truths 1–4 fully code-verifiable; truths 5–7 intentionally deferred to 05-HUMAN-UAT.md human gate)

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/app/api/releases/promoted/route.ts` | POST handler for prod deploy round-trip ingest (GATE-12) | VERIFIED | 107 lines; exports POST; uses requireApiKey, db.transaction; env='prod', status='promoted' |
| `src/app/api/releases/promoted/route.test.ts` | Vitest coverage for auth, validation, atomicity, idempotency | VERIFIED | 272 lines; 6 tests: 401/403/400/404/201/200 — all pass; dbTransactionMock assertions confirm atomicity + idempotency |
| `src/app/projects/[slug]/releases/Timeline.tsx` | Vertical timeline component | VERIFIED | 173 lines; 'use client'; imports all 6 lucide icons; buildEvents() covers all 5 kinds; default export Timeline |
| `src/app/projects/[slug]/releases/format.ts` | Shared date formatting helpers | VERIFIED | 27 lines; exports formatDeployedAt + formatRelativeTime; imported by both Timeline.tsx and ReleasesClient.tsx |
| `src/app/projects/[slug]/releases/types.ts` | ReleaseRow extended with promotionDispatched* + pairedProd | VERIFIED | promotionDispatchedAt, promotionDispatchedBy, pairedProd fields present at lines 37–47 |
| `src/app/projects/[slug]/releases/page.tsx` | Server fetch hydrates pairedProd field | VERIFIED | Lines 57–73: versions array, prod query with env='prod' + inArray filter, prodByVersion Map; IIFE at lines 106–117 populates pairedProd for dev rows only |
| `src/app/projects/[slug]/releases/ReleasesClient.tsx` | ExpandedPanel renders Timeline | VERIFIED | Line 18: `import Timeline from './Timeline'`; line 671: `<Timeline release={release} />` inside ExpandedPanel function (line 611) |
| `docs/onboarding-projects.md` | Canonical 6-step project onboarding checklist | VERIFIED | 236 lines; 6 numbered steps; verification checklist; troubleshooting table; cross-links to 03/04-HUMAN-UAT.md |
| `.planning/phases/05-round-trip-+-shared-workflows+pilot/ONBOARDING-RUNBOOK.md` | Planning-archive copy of canonical runbook | VERIFIED | `diff -q` confirmed byte-identical to docs/onboarding-projects.md |
| `CLAUDE.md` | Admin project conventions with onboarding runbook reference | VERIFIED | 33 lines; `## Project Onboarding` section at line 5; links `docs/onboarding-projects.md`; mentions v1.14 |
| `.planning/phases/05-round-trip-+-shared-workflows+pilot/05-HUMAN-UAT.md` | Master v1.14.0 milestone closeout checklist | VERIFIED | 561 lines; 7 sections A–G; WORKFLOW-01 + WORKFLOW-02 copy-paste YAML in Section D; 14-step E2E in Section F; all acceptance criteria grep checks pass |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `route.ts` | `src/lib/api-key-auth.ts` | `import { requireApiKey }` | WIRED | Line 4: `from '@/lib/api-key-auth'`; used at line 11 |
| `route.ts` | `src/db/schema.ts releaseLogs` | `db.transaction([insert prod, update dev])` | WIRED | `db.transaction` at line 81; INSERT at 83–96; UPDATE at 98–101 |
| `ReleasesClient.tsx` | `Timeline.tsx` | `import Timeline + <Timeline release={release} />` | WIRED | Import at line 18; render at line 671 inside ExpandedPanel |
| `Timeline.tsx` | `lucide-react` | `import { GitCommit, MessageSquare, ShieldCheck, XCircle, Rocket, Server }` | WIRED | Line 3 — all 6 icons imported and used in EventIcon switch |
| `page.tsx` | `release_logs env='prod'` rows | `prodByVersion Map + IIFE pairedProd hydration` | WIRED | Lines 57–117; separate query + map + IIFE on each dev row |
| `CLAUDE.md` | `docs/onboarding-projects.md` | `markdown link in Project Onboarding section` | WIRED | Line 7: `[docs/onboarding-projects.md](docs/onboarding-projects.md)` |
| `05-HUMAN-UAT.md Section D` | `MyAlterLego/shared-workflows ci-cd.yml + deploy-prod.yml` | `copy-paste YAML snippets` | DOCUMENTED (not yet applied) | WORKFLOW-01 + WORKFLOW-02 YAML present in Section D; cross-repo edit required by human |
| `05-HUMAN-UAT.md Section E/F` | `MyAlterLego/triarchsecurity-portal (Truth+Treason)` | `shared-workflows ref bump instructions` | DOCUMENTED (not yet applied) | T+T onboarding steps sequenced in Sections E.1–E.3; E2E smoke test in Section F |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| GATE-12 | 05-01 | POST /api/releases/promoted — auth, paired prod row, atomic write | SATISFIED | `route.ts` 107 lines; requireApiKey; db.transaction INSERT+UPDATE; 6 Vitest tests pass |
| GATE-13 | 05-02 | Full release lifecycle timeline in expanded row | SATISFIED | `Timeline.tsx` 173 lines; all 5 event kinds; wired in ReleasesClient ExpandedPanel; page.tsx hydrates pairedProd |
| WORKFLOW-01 | 05-04 | shared-workflows ci-cd.yml POSTs dev-deploy notification | DOCUMENTED — HUMAN NEEDED | Section D.2 of 05-HUMAN-UAT.md has copy-paste YAML; cross-repo edit pending |
| WORKFLOW-02 | 05-04 | shared-workflows deploy-prod.yml POSTs prod-deploy notification | DOCUMENTED — HUMAN NEEDED | Section D.3 of 05-HUMAN-UAT.md has copy-paste YAML; cross-repo edit pending |
| PILOT-01 | 05-04 | Truth+Treason end-to-end pilot run | HUMAN NEEDED | Sections E+F of 05-HUMAN-UAT.md; depends on WORKFLOW-01+02 + Phases 2+3+4 HUMAN-UATs |
| PILOT-02 | 05-03 | Project onboarding runbook | SATISFIED | docs/onboarding-projects.md (236 lines, 6 steps); ONBOARDING-RUNBOOK.md byte-identical; CLAUDE.md references it |

**Note on REQUIREMENTS.md status field:** The requirements file shows GATE-12, GATE-13, WORKFLOW-01, WORKFLOW-02, PILOT-01, PILOT-02 all marked `[x]` (Phase 5 row) — this appears to reflect that the code/documentation artifacts have been authored, not that the human-side execution is complete. WORKFLOW-01, WORKFLOW-02, and PILOT-01 remain pending human action.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None | — | No TODOs, FIXMEs, placeholders, empty handlers, or hardcoded stub data found in any of the 4 new/modified code files | — | — |

Specific checks performed:
- `route.ts`: No console.log in production paths; no placeholder returns; real db.transaction with both writes
- `Timeline.tsx`: No framer-motion; no placeholder events; all 5 event kinds derive from real data fields (null-safe — missing events simply absent, not stubbed with fake data)
- `format.ts`: Functional implementations; no TODOs
- `types.ts`: All 3 new fields are nullable (correct — backward compatible with pre-Phase 5 rows)
- `page.tsx`: pairedProd hydration uses real DB query; IIFE correctly gates on `r.env !== 'dev'`

---

### Human Verification Required

This phase has the LARGEST human gate in the v1.14 milestone. Three success criteria cannot be verified programmatically:

#### 1. WORKFLOW-01 — shared-workflows ci-cd.yml POST step

**Test:** Apply Section D.1 + D.2 of `05-HUMAN-UAT.md` to the `MyAlterLego/shared-workflows` repo. Add the `notify-admin` input + ADMIN_API_TOKEN secret to `ci-cd.yml`'s `workflow_call` signature. Add the POST step after the dev deploy. Commit + push. Trigger a ci-cd.yml run on any project consuming shared-workflows.
**Expected:** A fresh `release_logs` row appears in admin DB with `env='dev'`, `status='dev'`, `commit_sha` and `deployed_at` populated. The `/projects/{slug}/releases` page renders the row with Timeline "Deployed to dev" event.
**Why human:** Different repo (`MyAlterLego/shared-workflows`). Requires live CI run against a real Firebase App Hosting deployment. Cannot be verified from admin session.

#### 2. WORKFLOW-02 — shared-workflows deploy-prod.yml POST step

**Test:** Apply Section D.3 of `05-HUMAN-UAT.md`. Add the POST step to `deploy-prod.yml` after successful prod deploy. Tag a new shared-workflows release (Section D.4).
**Expected:** After deploy-prod.yml completes for a project, `POST /api/releases/promoted` is called with the correct snake_case payload; admin DB has a new `env='prod'` row + the dev row's status flips to `promoted`.
**Why human:** Different repo. Requires a real prod deploy triggering the workflow. The endpoint (GATE-12) is proven by Vitest, but the calling side (the YAML step) requires human application and a live run.
**Critical note:** The wire format is snake_case (`commit_sha`, `deployed_at`, `deployed_by`) for deploy-prod.yml, matching `route.ts` lines 16–21. This is different from the camelCase format used by ci-cd.yml. Section D documents this distinction inline — verify the YAML snippet in Section D.3 is applied verbatim.

#### 3. PILOT-01 — Truth+Treason full E2E smoke test

**Test:** Work through 05-HUMAN-UAT.md Sections E + F in order. This requires:
- Sections A, B, C completed (Phase 2 migration 0008 + Phase 3 Slack App + Phase 4 GitHub App + migration 0009 in prod)
- Section D completed (WORKFLOW-01 + WORKFLOW-02 applied and tagged)
- Section E: T+T ci-cd.yml + deploy-prod.yml refs bumped to new shared-workflows tag; ADMIN_API_TOKEN set as GitHub secret
- Section F: 14-step end-to-end smoke test

**Expected:** After completing Section F:
- admin DB has two rows for the test version: `env='dev' status='promoted'` (dev row with promotionDispatchedAt/By populated) and `env='prod' status='promoted'` (paired prod row with deployedAt from CI)
- `/projects/triarchsecurity-portal/releases` Timeline renders all 5 lifecycle events: Deployed to dev → (any feedback) → Approved for production → Promotion dispatched → Deployed to production

**Why human:** Multi-repo (shared-workflows + triarchsecurity-portal + admin), multi-system (Slack App, GitHub App, Firebase App Hosting, CockroachDB), live-infra test. Requires Phases 2+3+4 HUMAN-UATs completed first as prerequisites (DB migrations in prod, Slack App live, GitHub App live).

**Dependency chain for the E2E test:**
```
Phase 2 HUMAN-UAT (migration 0008)
    → Phase 3 HUMAN-UAT (Slack App)
    → Phase 4 HUMAN-UAT (GitHub App + migration 0009)
    → Phase 5 Section D (shared-workflows YAML)
    → Phase 5 Section E (T+T ref bump)
    → Phase 5 Section F (E2E smoke test)
    → Section G (milestone closeout + version bump to 1.14.0)
```

---

### Gaps Summary

No code gaps. All CODE-verifiable success criteria are fully implemented and wired:
- GATE-12 (route.ts): auth + atomic write + idempotency — verified against actual code
- GATE-13 (Timeline.tsx + ReleasesClient + page.tsx): full lifecycle render — verified against actual code
- PILOT-02 (onboarding docs + CLAUDE.md): runbook complete, byte-identical copies, CLAUDE.md wired — verified

The three human-needed items (WORKFLOW-01, WORKFLOW-02, PILOT-01) are not gaps — they are intentional cross-repo and live-infra work that the admin session cannot execute. The instructions are complete and copy-paste-ready in `05-HUMAN-UAT.md`. The REQUIREMENTS.md checkbox state is aspirational (reflecting authorship, not execution).

**To complete this phase:** Work through `05-HUMAN-UAT.md` Sections A → G in order. All prior-phase UAT prerequisites must be satisfied before Section F's E2E test can pass.

---

_Verified: 2026-05-03_
_Verifier: Claude (gsd-verifier)_
