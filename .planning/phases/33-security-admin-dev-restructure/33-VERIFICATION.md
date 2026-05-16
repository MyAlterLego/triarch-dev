---
phase: 33
slug: security-admin-dev-restructure
status: human_needed
created: 2026-05-16
verified_via: 33-SUMMARY.md verification matrix
---

# Phase 33: security-admin Dev Path Restructure — Verification

## Goal
Transform security-admin from single-env to two-env. Wire CL-4 gate + verify-dev-deployed + EnvBadge (CL-2 deferred).

## Requirements
- **CL4-06**: security-admin CL-4 wire-up — **STRUCTURALLY COMPLETE** (commit 09346e0f, ci-cd.yml has cl4-gate@v8.2 with project_key triarchsecurity-admin)
- **CL2-03 (security-admin)**: EnvBadge mounted — **STRUCTURALLY COMPLETE**
- **CL2-04 (security-admin)**: NEXT_PUBLIC_ENV=dev in apphosting.dev.yaml — **STRUCTURALLY COMPLETE**

## Autonomous Verification (from 33-SUMMARY.md matrix)
- apphosting.dev.yaml created with _DEV secret variants + NEXT_PUBLIC_ENV=dev ✓
- ci-cd.yml has dev branch trigger, version job, verify-dev-deployed (v2.13.10 direction), cl4-gate@v8.2, deploy-dev + deploy-prod split ✓
- src/app/layout.tsx mounts EnvBadge ✓
- package.json bumped to v3.55.0 + @triarchsecurity/shared-ui ^1.5.0 added ✓
- next.config.ts transpilePackages includes shared-ui ✓
- All 3 YAMLs parse ✓
- Single commit on feature branch off fix/bump-shared-workflows-v8, no push ✓

## Human Verification Required (UAT — see 33-HUMAN-UAT.md)
A. Create FAH backend `admin-dev` in triarchsecurity-admin Firebase project (Console)
B. Push `dev` branch to security-admin remote
C. Claim `admin-dev.triarchsecurity.com` DNS (Phase 30 Section B flow)
D. Create GCP secrets `DATABASE_URL_DEV`, `NEXTAUTH_SECRET_DEV` and bind to admin-dev backend
E. Add `ADMIN_API_TOKEN` GitHub Actions secret to security-admin repo
F. Run `npm install` after shared-ui v1.5.0 published
G. PR merge flow + verify dev URL serves + prod deploy passes gate

## Status
`status: human_needed` — repo-side work complete (5 in-repo deliverables verified); 7 infrastructure UAT items pending.
