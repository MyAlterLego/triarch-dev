---
phase: 31
slug: cl3-db-namespace-audit
status: human_needed
created: 2026-05-16
verified_via: yaml-level audit autonomous; secret-value verification deferred to HUMAN-UAT
---

# Phase 31: CL-3 DB Namespace Audit + Migration — Verification

## Goal
Every project's dev backend writes to `<project_key>_dev` database; prod writes to `<project_key>`. Same cluster OK; same database name forbidden.

## Requirements
- **CL3-01**: apphosting.dev.yaml DATABASE_URL → `<project>_dev` DB — **YAML-AUDITED**: 5 of 7 separate secret names, 1 confirmed violation (dev-portal), 1 blocked by Phase 33
- **CL3-02**: apphosting.yaml DATABASE_URL → `<project>` DB — **YAML-AUDITED**: all 7 reference `DATABASE_URL` secret consistently
- **CL3-03**: Each `_dev` database exists in CRDB — **NOT VERIFIED**: requires CRDB connection, deferred to HUMAN-UAT Section C

## Audit Findings (autonomous yaml-level)

**Confirmed structural violation (1):**
- dev-portal: same secret `DATABASE_URL_PORTAL` referenced in both yamls → dev writes to prod database

**Yaml-level OK (5, pending value verification):**
- platform, darksouls, tmi, truthtreason, security-portal: separate secret names per env. Secret values not autonomously verifiable (no CRDB or Secret Manager access in this session). HUMAN-UAT Section A provides the verification commands.

**Blocked (1):**
- security-admin: no apphosting.dev.yaml exists. Phase 33 will create both the dev path and the DATABASE_URL_DEV secret.

## Status
`status: human_needed` — autonomous audit identifies 1 confirmed violation + lists 5 secrets requiring value-level verification. Remediation (mint dev-portal secret, create _dev databases where missing, fix any secret-value mismatches found in Section A) requires live infrastructure access (firebase CLI + CRDB credentials).
