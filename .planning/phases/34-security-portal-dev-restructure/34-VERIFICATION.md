---
phase: 34
slug: security-portal-dev-restructure
status: human_needed
created: 2026-05-16
verified_via: 34-SUMMARY.md verification matrix
---

# Phase 34: security-portal Dev Path Restructure — Verification

## Goal
Mirror Phase 33 for security-portal. Plus resolve dormant dev branch (20 commits behind main).

## Requirements
- **CL4-07**: security-portal CL-4 wire-up — **STRUCTURALLY COMPLETE** (commit 294f8ab, ci-cd.yml has cl4-gate@v8.2 with project_key triarchsecurity-portal)
- **CL2-03 (security-portal)**: EnvBadge mounted — **STRUCTURALLY COMPLETE**
- **CL2-04 (security-portal)**: NEXT_PUBLIC_ENV=dev in apphosting.dev.yaml — **STRUCTURALLY COMPLETE**

## Autonomous Verification (from 34-SUMMARY.md matrix)
- apphosting.dev.yaml: expanded from 1-line stub to full _DEV secret set (DATABASE_URL_DEV, PORTAL_JWT_SECRET_DEV, PORTAL_TOTP_ENCRYPTION_KEY_DEV) + NEXT_PUBLIC_ENV=dev ✓
- ci-cd.yml mirrors Phase 33 structure ✓
- src/app/layout.tsx mounts EnvBadge ✓
- package.json v0.15.0 + shared-ui ^1.5.0 ✓
- next.config.ts transpilePackages includes shared-ui ✓
- All 3 YAMLs parse ✓
- Single commit on feat/dev-path-cl4-cl2-cl3 off fix/bump-shared-workflows-v8, no push ✓

## Human Verification Required (UAT — see 34-HUMAN-UAT.md)
A. **Resolve dormant dev branch FIRST** (delete + recreate from main recommended) — must precede B because verify-dev-deployed will fail until dev is current
B. Create FAH `portal-dev` backend in triarchsecurity-portal Firebase project
C. Claim `portal-dev.triarchsecurity.com` DNS
D. Create _DEV GCP secrets and bind to portal-dev backend
E. Add ADMIN_API_TOKEN GitHub Actions secret
F. npm install after shared-ui v1.5.0 published
G. PR merge flow + verification

## Status
`status: human_needed` — repo-side work complete (5 in-repo deliverables verified); 7 infrastructure UAT items pending. Dormant dev branch resolution is the critical first step.
