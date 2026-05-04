---
phase: 01-central-secrets-vault
plan: 06
subsystem: docs

requires:
  - phase: 01-central-secrets-vault
    provides: "Plans 01-04 and 01-05 verified the patterns being documented"
provides:
  - "Onboarding runbook updated with Step 7 (vault access for new projects)"
  - "Deep-dive docs/secrets-vault.md (architecture, IAM, rotation, troubleshooting)"
affects: []

tech-stack:
  added: []
  patterns:
    - "Cross-linked docs: onboarding (operational) ↔ secrets-vault.md (deep-dive)"
    - "Anchored sections (#runtime-service-account-resolution, #failure-modes) for stable cross-links"

key-files:
  created:
    - docs/secrets-vault.md
  modified:
    - docs/onboarding-projects.md (+Step 7, +4 checklist items, +2 troubleshooting rows)

key-decisions:
  - "Closeout (Firebase secret deletion) documented but explicitly deferred — plan-after-this-one work"
  - "Runtime SA resolution rule documented in canonical doc, not duplicated in onboarding"

patterns-established:
  - "When adding a new shared dep that needs IAM, document Step 7 pattern: .npmrc + Firebase secret + apphosting.yaml BUILD wiring + IAM grant + code usage"

requirements-completed: [VAULT-07]

duration: ~10min
completed: 2026-05-04
---

# Phase 01 Plan 01-06 Summary

**Onboarding runbook gains Step 7 (Grant vault access) covering all 8 sub-steps of new-project vault setup. New `docs/secrets-vault.md` (167 lines) provides the canonical reference for architecture, IAM, rotation, and troubleshooting.**

## Performance

- **Tasks:** 2 (both auto, executed inline)
- **Files modified:** 2 (1 new, 1 edited)
- **Lines added:** ~140 to onboarding, 167 new in secrets-vault.md
- **Completed:** 2026-05-04

## Accomplishments

### docs/onboarding-projects.md
- New `## Step 7 — Grant vault access` section between Step 6 and Verification Checklist
- 8 sub-steps: 7a (.npmrc), 7b (Firebase secret), 7c (apphosting.yaml NODE_AUTH_TOKEN BUILD), 7d (npm install), 7e (consumer matrix), 7f (SA discovery), 7g (IAM grants), 7h (code usage)
- Step 7 includes its own troubleshooting subtable (4 rows)
- Verification Checklist gained 4 new items (npmrc, Firebase secret, apphosting.yaml entry, IAM grant)
- Top-level Troubleshooting gained 2 new rows (vault SA missing, npm ci 404)
- Total step count: 6 → 7

### docs/secrets-vault.md (new)
- Architecture diagram (ASCII) showing vault → 2 consumers
- The 7 Vault Keys table with type and consumer mapping
- @myalterlego/secrets package API + 4 behaviors (cache, lazy init, single-flight, fallback)
- Failure Modes truth table (3 cases)
- IAM Model with SA Resolution Rule (4-step algorithm)
- Rotation Runbook (add version, disable/destroy, closeout)
- Troubleshooting table (7 rows)
- References section linking back to plan files + external docs

## Task Commits

Single commit covers both tasks:
1. **`docs(01-06): add Step 7 vault onboarding + secrets-vault deep-dive`** — `8d04a7b`

## Files Created/Modified

| File | Change |
|------|--------|
| `docs/onboarding-projects.md` | +140 lines (Step 7 + checklist + troubleshooting rows) |
| `docs/secrets-vault.md` | NEW — 167 lines |

## Decisions Made

- Followed plan content verbatim — no scope drift
- Cross-link anchors `#runtime-service-account-resolution` and `#failure-modes` use the GitHub-flavored markdown anchor convention (lower-cased, hyphenated)

## Deviations from Plan

None — both tasks executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — these are docs files committed to the admin repo. They take effect on next push.

## Next Phase Readiness

- Phase 01 (Central Secrets Vault) is now fully implemented across all 6 plans
- Closeout (Firebase secret deletion + apphosting.yaml cleanup) is the next step but deferred — covered as a future plan after live verification

---
*Phase: 01-central-secrets-vault*
*Completed: 2026-05-04*
