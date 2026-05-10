---
name: Security finding waiver
about: Request a time-bound waiver for a security scanner finding
title: "[waiver] <CVE-id or CWE-id or rule-id>"
labels: ["security-waiver"]
assignees: []
---

> **Read first:** waivers are time-bound. They auto-expire and re-block prod deploys via the nightly job.
> Two security-team approvals are required to apply the `security-waiver:approved` label.

## Finding

- **ID** (CVE / CWE / Semgrep rule):
- **Severity:** Critical / High / Medium
- **Tool that flagged it:** Semgrep / OSV / Trivy / Gitleaks / Checkov / CodeQL / DAST / threat-model
- **First seen:** (workflow run URL)
- **Affected component / path:**

## Why we cannot fix now

<!-- be specific. "no time" is not a reason. -->

## Compensating control

<!-- what mitigates the risk while the waiver is active? rate-limit? WAF rule? feature flag off? -->

## Blast radius if exploited

- Confidentiality:
- Integrity:
- Availability:

## Expiry

- **Expires on:** YYYY-MM-DD  *(max 90 days from creation; 30 days for Critical)*
- **Re-evaluation owner:** @username

## Approvals

- [ ] @acme-corp/security approval 1
- [ ] @acme-corp/security approval 2

<!-- after both approvals, label `security-waiver:approved` -->
