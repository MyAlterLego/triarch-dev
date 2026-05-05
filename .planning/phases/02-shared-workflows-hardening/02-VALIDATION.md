---
phase: 02
slug: shared-workflows-hardening
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-05
---

# Phase 02 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | actionlint (workflow YAML) + bash + jq (payload schema) + gh CLI + psql (live E2E) |
| **Config file** | none — inline shell assertions |
| **Quick run command** | `actionlint .github/workflows/deploy-firebase.yml` |
| **Full suite command** | live push to sandbox branch → `gh run watch` → DB row check |
| **Estimated runtime** | ~3 min per E2E pass |

---

## Sampling Rate

- **After every task commit:** Run `actionlint` on touched workflow files
- **After every plan wave:** Live E2E push to sandbox branch
- **Before `/gsd:verify-work`:** All three success criteria queried in DB
- **Max feedback latency:** 3 minutes

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 02-XX-XX | XX | N | WORKFLOW-XX | lint / E2E | `{command}` | ✅ / ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Clone `MyAlterLego/shared-workflows` to `~/claude/MyAlterLego/shared-workflows/`
- [ ] Install `actionlint` if not present (`brew install actionlint` or `go install github.com/rhysd/actionlint/cmd/actionlint@latest`)

*If existing infra suffices: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| FAH per-branch URL behavior | WORKFLOW-03 | RESEARCH flagged MEDIUM confidence — Firebase docs imply single-URL-per-backend; need live confirmation | After test branch deploy, hit the URL and verify it serves the branch's commit |

*If none: "All phase behaviors have automated verification."*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 180s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
