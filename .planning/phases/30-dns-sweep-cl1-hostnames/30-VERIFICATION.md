---
phase: 30
slug: dns-sweep-cl1-hostnames
status: human_needed
created: 2026-05-16
verified_via: DNS recon via GoDaddy MCP — found 6 missing hostnames
---

# Phase 30: DNS Sweep — CL-1 Hostnames — Verification

## Goal
Claim the 6 missing `*-dev.<zone>` hostnames so every project has a customer-disambiguatable dev URL.

## Requirements
- **CL1-01**: Dev shortname (`<project>-dev.<zone>`) MUST exist in DNS + serve FAH dev backend for every project — **structurally documented in HUMAN-UAT.md**; live verification requires Firebase Console + GoDaddy DNS edits (manual)
- **CL1-02**: TLS cert valid on every dev hostname (subject matches, expiry > 60 days) — **deferred to manual verification post-claim**

## Status
`status: human_needed` — Phase 30 is inherently manual (Firebase Console "Add custom domain" generates the fah-claim TXT + _acme-challenge CNAME values that must be added to GoDaddy). No autonomous code work possible. Pre-work complete:
- DNS recon executed via GoDaddy MCP — identified exactly 6 missing hostnames
- Existing `darksouls-dev.triarch.dev` recorded as reference template (3 records: A + TXT + CNAME)
- HUMAN-UAT.md provides per-hostname runbook with exact Firebase Console URLs, GoDaddy DNS URLs, and verification commands

## Dependencies
- Section A (4 triarch.dev hostnames): can run now — FAH backends already exist
- Section B (2 triarchsecurity.com hostnames): BLOCKED by Phase 33 + 34 (those phases create the FAH backends first)
- Section C (apphosting.dev.yaml NEXTAUTH_URL updates): depends on Section A completion

## Phase Completion Definition
Phase 30 marked complete when:
1. Section A's 4 hostnames resolve + serve + TLS valid + DEV badge visible
2. Section C's NEXTAUTH_URL updates merged in applicable repos
3. Section B's 2 hostnames are flagged as "deferred to Phase 33/34" (not blocking Phase 30 completion)

Per autonomous mode: phase progresses to next phase (31) immediately. Section A/B/C are tracked in `30-HUMAN-UAT.md` for user follow-up.
