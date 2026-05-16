---
phase: 29
slug: cl2-envbadge-component
status: human_needed
created: 2026-05-16
verified_via: 29-SUMMARY.md verification matrix (all PASS)
---

# Phase 29: CL-2 EnvBadge Component — Verification

## Goal
Customers can tell at a glance whether they're on dev — `<EnvBadge env={NEXT_PUBLIC_ENV}/>` lives in `@triarchsecurity/shared-ui`, mounts in 5 project root layouts (security-admin/portal deferred to 33/34).

## Requirements

- **CL2-01**: `<EnvBadge/>` exported from `@triarchsecurity/shared-ui` (1.5.0), renders only when env in `('dev','staging')` — **STRUCTURALLY VERIFIED**
- **CL2-02**: Component emits `data-env="dev"` attribute — **STRUCTURALLY VERIFIED**
- **CL2-03** (5 of 7 projects): Mounted in root layout of platform + dev-portal + darksouls + tmi + truthtreason — **STRUCTURALLY VERIFIED**; security-admin/portal deferred to Phase 33/34
- **CL2-04** (5 of 7 projects): `NEXT_PUBLIC_ENV=dev` in each `apphosting.dev.yaml`, absent from `apphosting.yaml` — **STRUCTURALLY VERIFIED**; security-admin/portal deferred

## must_haves Verified (automated)

| # | Truth | Evidence | Status |
|---|-------|----------|--------|
| 1 | EnvBadge component exists in shared-ui v1.5.0 | shared-ui commit 78f2771 on feat/v1.5.0-envbadge; src/components/EnvBadge/index.tsx exists | PASS |
| 2 | 6/6 vitest scenarios green | `npx vitest run __tests__/EnvBadge.test.tsx` shows 6 passed (covers null/prod/dev/DEV-uppercase/staging/anything-else) | PASS |
| 3 | data-env attribute emitted | Tested in scenario 3 + 5 | PASS |
| 4 | Mounted in 5 consumer layouts | grep "EnvBadge" src/app/layout.tsx returns 2 (import + usage) in each of platform/dev-portal/darksouls/tmi/truthtreason | PASS |
| 5 | NEXT_PUBLIC_ENV=dev in 5 dev yamls | grep returns 1 in each apphosting.dev.yaml | PASS |
| 6 | NEXT_PUBLIC_ENV absent from prod yamls | grep returns 0 in each apphosting.yaml | PASS |
| 7 | shared-ui dep bumped to ^1.5.0 in 5 consumers | grep package.json returns ^1.5.0 in each | PASS |
| 8 | Each consumer has its own version bump | platform 2.13.16, dev-portal 0.7.5, darksouls 7.7.13, tmi 4.44.2, truthtreason 1.1.19 | PASS |
| 9 | No remote pushes | No upstream configured for any feat/cl2-envbadge-mount branch (across all 5 consumers + shared-ui) | PASS |
| 10 | Consumer mounts ignore stale fix branches | All 5 branched off correct base (main for dev-portal/darksouls/tmi, dev for truthtreason, current feat for platform); fix/deploy-skip-bug untouched | PASS |

## Human Verification Required (UAT)

Operational verification requires real publish + deploy of shared-ui 1.5.0 and consumer rollouts. Captured in `29-HUMAN-UAT.md`:

A. Push shared-ui feat branch → PR → merge → create+push v1.5.0 tag → wait for CI npm publish
B. After 1.5.0 is on registry: push each of 5 consumer feat branches → PR → merge → deploy
C. Verify DEV badge visible on each dev URL; absent on prod URLs
D. Clean up stale `fix/deploy-skip-bug` branches in dev-portal/darksouls/tmi
E. Remaining CL-2 work for security-admin/portal handled by Phase 33/34

## Status Routing

`status: human_needed` — all automated structural verification passed; operational verification (live DEV badge in browser) requires the publish + deploy sequence above.
