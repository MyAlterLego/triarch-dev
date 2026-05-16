---
phase: 29-cl2-envbadge-component
plan: "07"
subsystem: ui
tags: [envbadge, shared-ui, cl-2, cross-repo, phase-close, verification]

requires:
  - "29-01 through 29-06 all complete"

provides:
  - "Phase 29 consolidation: CL-2 EnvBadge shipped across shared-ui + 5 consumer repos"
  - "HUMAN-UAT runbook for human push/PR/merge/tag/publish/deploy sequence"
  - "Verification matrix confirming all cross-repo checks pass"

affects:
  - "Phase 30 (DNS Sweep — can run in parallel after Phase 29 UAT)"
  - "Phase 33 (security-admin dev path — will consume EnvBadge from shared-ui v1.5.0 once published)"
  - "Phase 34 (security-portal dev path — same)"
  - "Phase 35 (compliance scan — requires dev deploys complete)"

tech-stack:
  added: []
  patterns:
    - "Cross-repo atomic commit strategy: 1 commit per consumer repo covering layout + yaml + package.json + optional next.config.ts"
    - "Consumer-gating pattern: shared-ui v1.5.0 MUST publish before consumer CI builds can pass"

key-files:
  created:
    - /Users/mikegeehan/claude/triarch/shared/platform/.planning/phases/29-cl2-envbadge-component/29-SUMMARY.md
    - /Users/mikegeehan/claude/triarch/shared/platform/.planning/phases/29-cl2-envbadge-component/29-HUMAN-UAT.md
  modified:
    - /Users/mikegeehan/claude/triarch/shared/platform/.planning/STATE.md
    - /Users/mikegeehan/claude/triarch/shared/platform/.planning/ROADMAP.md

key-decisions:
  - "Phase 29 closes CL2-01, CL2-02 (EnvBadge component built + data-env attribute) and CL2-03, CL2-04 for 5 of 7 projects"
  - "security-admin and security-portal mounts explicitly deferred to Phases 33/34 (those repos lack dev paths)"
  - "CI builds in 5 consumer PRs will fail until shared-ui v1.5.0 publishes — intentional; sequencing in HUMAN-UAT"

requirements-completed:
  - CL2-01
  - CL2-02
  - CL2-03
  - CL2-04

duration: 8min
completed: "2026-05-16"
---

# Phase 29: CL-2 EnvBadge Component — Phase Summary

**`<EnvBadge/>` component shipped in @triarchsecurity/shared-ui v1.5.0 (local, unpublished) and mounted in 5 consumer project root layouts (platform, dev-portal, darksouls, tmi, truthtreason) with NEXT_PUBLIC_ENV=dev bound in each dev apphosting config. Phase-close consolidation document.**

## Phase Overview

| Attribute | Value |
|-----------|-------|
| Milestone | v2.3 Dev/Prod Contract Adoption |
| Contract clause | CL-2 (env badge — dev chrome marker) |
| Repos touched | 6 (shared-ui + platform + dev-portal + darksouls + tmi + truthtreason) |
| Plans executed | 7 (29-01 through 29-07) |
| Requirements addressed | CL2-01, CL2-02, CL2-03, CL2-04 (5 of 7 projects; security-admin/portal deferred) |
| Status | Local branches ready — awaiting human push/PR/merge/tag/publish sequence |

## What Shipped Per Repo

### shared-ui (`triarchsecurity/shared-ui`)
- **Branch:** `feat/v1.5.0-envbadge`
- **Commit:** `78f2771` — `v1.5.0: feat: EnvBadge component for CL-2 dev chrome marker`
- **Version bump:** 1.4.0 → 1.5.0
- **Files:** `src/components/EnvBadge/index.tsx` (component), `__tests__/EnvBadge.test.tsx` (6 tests), `src/index.ts` (export added), `package.json` (version), `dist/index.js` + `dist/index.d.ts` (rebuilt)
- **Plan:** [29-01-SUMMARY.md](29-01-SUMMARY.md)

### platform (`triarchsecurity/platform`)
- **Branch:** `feat/cl2-envbadge-mount`
- **Commit:** `7462f40` — `v2.13.16: feat(cl-2): mount <EnvBadge/> in root layout + set NEXT_PUBLIC_ENV=dev`
- **Version bump:** 2.13.15 → 2.13.16
- **Files:** `src/app/layout.tsx`, `apphosting.dev.yaml`, `package.json`, `next.config.ts`
- **Plan:** [29-02-SUMMARY.md](29-02-SUMMARY.md)

### dev-portal (`triarchsecurity/dev-portal`)
- **Branch:** `feat/cl2-envbadge-mount`
- **Commit:** `55060c2` — `v0.7.5: feat(cl-2): mount <EnvBadge/> in root layout + set NEXT_PUBLIC_ENV=dev`
- **Version bump:** 0.7.4 → 0.7.5
- **Files:** `src/app/layout.tsx`, `apphosting.dev.yaml`, `package.json`
- **Plan:** [29-03-SUMMARY.md](29-03-SUMMARY.md)

### darksouls (`triarchsecurity/darksouls-rpg`)
- **Branch:** `feat/cl2-envbadge-mount`
- **Commit:** `f0706fb` — `v7.7.13: feat(cl-2): mount <EnvBadge/> + set NEXT_PUBLIC_ENV=dev`
- **Version bump:** 7.7.12 → 7.7.13
- **Files:** `src/app/layout.tsx`, `apphosting.dev.yaml`, `package.json`, `next.config.ts`
- **Plan:** [29-04-SUMMARY.md](29-04-SUMMARY.md)

### tmi (`triarchsecurity/tmi`)
- **Branch:** `feat/cl2-envbadge-mount`
- **Commit:** `69450e4` — `v4.44.2: feat(cl-2): mount <EnvBadge/> in root layout + set NEXT_PUBLIC_ENV=dev`
- **Version bump:** 4.44.1 → 4.44.2
- **Files:** `src/app/layout.tsx`, `apphosting.dev.yaml`, `package.json`, `next.config.ts`
- **Plan:** [29-05-SUMMARY.md](29-05-SUMMARY.md)

### truthtreason (`triarchsecurity/truthtreason`)
- **Branch:** `feat/cl2-envbadge-mount`
- **Commit:** `2ec6cd7` — `v1.1.19: feat(cl-2): mount <EnvBadge/> in root layout + set NEXT_PUBLIC_ENV=dev`
- **Version bump:** 1.1.18 → 1.1.19
- **Files:** `src/app/layout.tsx`, `apphosting.dev.yaml`, `package.json`, `next.config.ts`
- **Plan:** [29-06-SUMMARY.md](29-06-SUMMARY.md)

## Cross-Repo Dependency Diagram

```
shared-ui feat/v1.5.0-envbadge (commit 78f2771)
    |
    | (human: push → PR → merge → tag v1.5.0 → CI npm publish)
    |
    v
@triarchsecurity/shared-ui@1.5.0 published to GitHub Packages npm registry
    |
    +---> platform feat/cl2-envbadge-mount (commit 7462f40)
    |         | (npm install → next build → push → PR → merge to dev → FAH deploy)
    |         v admin-dev.triarch.dev shows DEV badge
    |
    +---> dev-portal feat/cl2-envbadge-mount (commit 55060c2)
    |         | (npm install → next build → push → PR → merge to dev → FAH deploy)
    |         v portal-dev.[hostname] shows DEV badge
    |
    +---> darksouls feat/cl2-envbadge-mount (commit f0706fb)
    |         | (npm install → next build → push → PR → merge to dev → FAH deploy)
    |         v darksouls-dev.triarch.dev shows DEV badge
    |
    +---> tmi feat/cl2-envbadge-mount (commit 69450e4)
    |         | (npm install → next build → push → PR → merge to dev → FAH deploy)
    |         v tmi-dev.[hostname] shows DEV badge
    |
    +---> truthtreason feat/cl2-envbadge-mount (commit 2ec6cd7)
              | (npm install → next build → push → PR → merge to dev → FAH deploy)
              v truthtreason-dev.[hostname] shows DEV badge

NOT in Phase 29 (deferred):
  security-admin  -.-> Phase 33 (needs dev path created first)
  security-portal -.-> Phase 34 (needs dev path created first)
```

## Test Results

### shared-ui vitest (run 2026-05-16)

```
Test Files  1 failed | 9 passed (10)
Tests       1 failed | 64 passed (65)
```

- 64/65 tests pass
- 6 new EnvBadge tests: ALL PASS
- 1 pre-existing failure: `SortableList.test.tsx — "renders screen reader instructions"` — unrelated to EnvBadge; `.sr-only` element missing from SortableList component; logged to deferred-items in 29-01-SUMMARY; out of scope for Phase 29

## Verification Matrix

Cross-repo grep checks run 2026-05-16T21:18:00Z:

| Check | shared-ui | platform | dev-portal | darksouls | tmi | truthtreason |
|-------|-----------|----------|------------|-----------|-----|--------------|
| Correct branch | feat/v1.5.0-envbadge | feat/cl2-envbadge-mount | feat/cl2-envbadge-mount | feat/cl2-envbadge-mount | feat/cl2-envbadge-mount | feat/cl2-envbadge-mount |
| Commit at HEAD | 78f2771 | 7462f40* | 55060c2 | f0706fb | 69450e4 | 2ec6cd7 |
| EnvBadge in layout (count) | n/a | 2 PASS | 2 PASS | 2 PASS | 2 PASS | 2 PASS |
| shared-ui dep ^1.5.0 | n/a | PASS | PASS | PASS | PASS | PASS |
| NEXT_PUBLIC_ENV in apphosting.dev.yaml (count=1) | n/a | 1 PASS | 1 PASS | 1 PASS | 1 PASS | 1 PASS |
| NEXT_PUBLIC_ENV absent from apphosting.yaml (count=0) | n/a | 0 PASS | 0 PASS | 0 PASS | 0 PASS | 0 PASS** |
| No upstream (not pushed) | PASS | PASS | PASS | PASS | PASS | PASS |
| package.json version | 1.5.0 | 2.13.16 | 0.7.5 | 7.7.13 | 4.44.2 | 1.1.19 |
| EnvBadge in src/index.ts | 1 PASS | n/a | n/a | n/a | n/a | n/a |
| dist/ regenerated | PASS | n/a | n/a | n/a | n/a | n/a |
| vitest EnvBadge tests | 6/6 PASS | n/a | n/a | n/a | n/a | n/a |

*platform HEAD is a later docs commit on the same branch (7462f40 is the code commit; docs commits follow)
**truthtreason has both apphosting.yaml and apphosting.prod.yaml — both confirmed 0 matches

**Overall: ALL CHECKS PASS**

## Acceptance Criteria Status

| Criterion | Status | Evidence |
|-----------|--------|----------|
| CL2-01: EnvBadge component exists in shared-ui with data-env attribute | PASS | `src/components/EnvBadge/index.tsx` exists; `data-env` normalized to lowercase; exported from `src/index.ts` |
| CL2-02: data-env attribute present in server-rendered HTML (compliance scan target) | PASS | Component uses RSC (server-rendered by default); curl-parseable; data-env emitted as HTML attribute |
| CL2-03: EnvBadge mounted in 5 of 7 consumer root layouts | PASS | grep -c 'EnvBadge' layout.tsx = 2 in all 5 consumers (import line + mount line) |
| CL2-04: NEXT_PUBLIC_ENV=dev in apphosting.dev.yaml; absent from apphosting.yaml | PASS | dev yaml: 1 match each; prod yaml: 0 matches each |

## Known Limitations

1. **Consumer CI builds blocked until publish:** All 5 consumer repos reference `@triarchsecurity/shared-ui@^1.5.0` in package.json but npm install cannot resolve it until the human publishes the package (see 29-HUMAN-UAT.md Section B). This is intentional — commits are correct; CI is sequenced after publish.

2. **Stale fix/deploy-skip-bug branches in 3 repos:** dev-portal, darksouls, and tmi each have a local `fix/deploy-skip-bug` branch from an abandoned backport of platform v2.13.5. These branches never merged. Phase 29 work correctly branched from main/dev instead. Cleanup flagged in 29-HUMAN-UAT Section D.

3. **security-admin and security-portal mounts deferred:** Phase 29 covers 5 of 7 Triarch projects. security-admin and security-portal are explicitly deferred to Phases 33/34 respectively — those repos need a dev path (FAH dev backend + dev branch + workflow restructure) before the EnvBadge mount makes sense. Once shared-ui v1.5.0 is published, Phases 33/34 will consume the same EnvBadge without re-publishing.

4. **Pre-existing SortableList test failure:** 1 of 65 shared-ui tests fails (`SortableList.test.tsx — "renders screen reader instructions"`). This is unrelated to EnvBadge; all 6 new EnvBadge tests pass. Logged to deferred-items in 29-01-SUMMARY.

## Next Step

Human runs through **29-HUMAN-UAT.md** in strict order:
1. Ship shared-ui v1.5.0 first (push → PR → merge → tag → wait for npm publish)
2. Only then: npm install + next build + push + PR for each consumer repo
3. Merge consumer PRs to dev → FAH auto-deploys
4. Verify DEV badge visible on each project's dev URL
5. Promote to prod (confirm badge absent on prod URL)

## Deviations from Plan

### Auto-fixed Issues (across all 7 plans)

**1. [Rule 1 - Bug] Adjusted tmi version bump target from 4.44.4 to 4.44.2** (Plan 29-05)
- Plan context referenced stale branch version 4.44.3; actual main branch version was 4.44.1
- Fix: bumped 4.44.1 → 4.44.2 (correct patch increment from main)
- Committed in: `69450e4`

**2. [Rule 3 - Blocking] Installed missing npm dependencies in shared-ui before running vitest** (Plan 29-01)
- `vitest` package not installed; `npx vitest run` failed with ERR_MODULE_NOT_FOUND
- Fix: ran `npm install` in shared-ui repo (node_modules not committed)

### Out-of-Scope Discoveries

**SortableList pre-existing test failure:** 1 test failure unrelated to EnvBadge. Logged and left unmodified per scope-boundary rule.

**tsup warning in dist rebuild:** Pre-existing `The condition "types" here will never be used...` warning in package.json exports field ordering. Not fixed (out of scope).

## Plan-by-Plan Summaries

- [29-01-SUMMARY.md](29-01-SUMMARY.md) — shared-ui: EnvBadge component + v1.5.0 bump + 6 vitest tests
- [29-02-SUMMARY.md](29-02-SUMMARY.md) — platform: root layout mount + apphosting.dev.yaml + transpilePackages fix
- [29-03-SUMMARY.md](29-03-SUMMARY.md) — dev-portal: root layout mount + apphosting.dev.yaml
- [29-04-SUMMARY.md](29-04-SUMMARY.md) — darksouls: root layout mount + apphosting.dev.yaml + transpilePackages add
- [29-05-SUMMARY.md](29-05-SUMMARY.md) — tmi: root layout mount + apphosting.dev.yaml + transpilePackages replace
- [29-06-SUMMARY.md](29-06-SUMMARY.md) — truthtreason: first shared-ui consumer (dep + transpilePackages + mount + env)
- [29-07-SUMMARY.md](29-SUMMARY.md) — this file: cross-repo verification + phase-close consolidation

## Self-Check: PASSED

| Item | Result |
|------|--------|
| shared-ui feat/v1.5.0-envbadge branch | CONFIRMED |
| shared-ui commit 78f2771 | CONFIRMED |
| shared-ui version 1.5.0 | CONFIRMED |
| shared-ui src/components/EnvBadge/index.tsx | FOUND |
| shared-ui __tests__/EnvBadge.test.tsx | FOUND |
| shared-ui dist/ rebuilt | CONFIRMED |
| shared-ui vitest 6/6 EnvBadge tests GREEN | CONFIRMED |
| platform feat/cl2-envbadge-mount | CONFIRMED |
| platform EnvBadge in layout (count=2) | CONFIRMED |
| platform NEXT_PUBLIC_ENV dev yaml (count=1) | CONFIRMED |
| platform NEXT_PUBLIC_ENV prod yaml (count=0) | CONFIRMED |
| dev-portal feat/cl2-envbadge-mount | CONFIRMED |
| dev-portal EnvBadge in layout (count=2) | CONFIRMED |
| dev-portal NEXT_PUBLIC_ENV dev yaml (count=1) | CONFIRMED |
| dev-portal NEXT_PUBLIC_ENV prod yaml (count=0) | CONFIRMED |
| darksouls feat/cl2-envbadge-mount | CONFIRMED |
| darksouls EnvBadge in layout (count=2) | CONFIRMED |
| darksouls NEXT_PUBLIC_ENV dev yaml (count=1) | CONFIRMED |
| darksouls NEXT_PUBLIC_ENV prod yaml (count=0) | CONFIRMED |
| tmi feat/cl2-envbadge-mount | CONFIRMED |
| tmi EnvBadge in layout (count=2) | CONFIRMED |
| tmi NEXT_PUBLIC_ENV dev yaml (count=1) | CONFIRMED |
| tmi NEXT_PUBLIC_ENV prod yaml (count=0) | CONFIRMED |
| truthtreason feat/cl2-envbadge-mount | CONFIRMED |
| truthtreason EnvBadge in layout (count=2) | CONFIRMED |
| truthtreason NEXT_PUBLIC_ENV dev yaml (count=1) | CONFIRMED |
| truthtreason NEXT_PUBLIC_ENV prod yaml (count=0) | CONFIRMED |
| truthtreason NEXT_PUBLIC_ENV apphosting.prod.yaml (count=0) | CONFIRMED |
| No repo has upstream set (no push) | CONFIRMED (all 6) |
| stale fix/deploy-skip-bug branches: dev-portal, darksouls, tmi | CONFIRMED (exist; cleanup in HUMAN-UAT) |

---
*Phase: 29-cl2-envbadge-component*
*Completed: 2026-05-16*
