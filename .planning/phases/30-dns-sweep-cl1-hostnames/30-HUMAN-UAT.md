---
status: partial
phase: 30-dns-sweep-cl1-hostnames
source: [30-CONTEXT.md]
started: 2026-05-16T00:00:00Z
updated: 2026-05-16T00:00:00Z
---

# Phase 30 — DNS Sweep Manual Runbook

This phase is 100% manual. Follow the sections in order. Each hostname is 3 DNS records (A, TXT, CNAME) — Firebase Console generates the TXT/CNAME values; you paste them into GoDaddy.

## A. triarch.dev hostnames (4 — do these first, backends exist)

For each of: `admin-dev`, `portal-dev`, `tmi-dev`, `truthtreason-dev`

### A.1. Map hostname → FAH backend

| Hostname | Firebase project | FAH backend |
|----------|------------------|-------------|
| admin-dev.triarch.dev | triarch-dev-website | admin-dev |
| portal-dev.triarch.dev | triarch-dev-website | portal-dev |
| tmi-dev.triarch.dev | triarch-dev-website | tmi-dev |
| truthtreason-dev.triarch.dev | triarch-dev-website | tt-dev (verify exact backend name in Console) |

### A.2. Per-hostname steps (repeat 4 times)

1. Open Firebase App Hosting Console for the project:
   `https://console.firebase.google.com/project/triarch-dev-website/apphosting`
2. Click the target FAH backend (e.g., `admin-dev`)
3. Click "Custom domains" tab → "Add custom domain"
4. Enter the hostname (e.g., `admin-dev.triarch.dev`) → Continue
5. Console shows 3 records to add to GoDaddy:
   - A record: `<hostname>` → `35.219.200.0` (or whatever IP Console shows; TTL 600)
   - TXT record: `<hostname>` → `fah-claim=002-02-<UUID>` (copy exact value)
   - CNAME record: `_acme-challenge_<token>.<hostname>` → `<UUID>.authorize.certificatemanager.goog` (copy exact value)
6. In another tab, open GoDaddy DNS manager for triarch.dev:
   `https://dcc.godaddy.com/control/triarch.dev/dns`
7. Add all 3 records. Use TTL 600 for A, 3600 for TXT and CNAME (matches existing entries).
8. Back in Firebase Console: click "Verify" — should turn green after DNS propagation (1-15 min)
9. TLS provisioning runs automatically once verified. Wait for "Active" status (typically 10-60 min).

### A.3. Per-hostname verification

```bash
# DNS resolution
dig +short admin-dev.triarch.dev

# HTTP response (after TLS active)
curl -sI https://admin-dev.triarch.dev | head -5

# TLS cert validity (subject + expiry)
echo | openssl s_client -connect admin-dev.triarch.dev:443 -servername admin-dev.triarch.dev 2>/dev/null | openssl x509 -noout -subject -dates

# EnvBadge presence (Phase 29 deliverable)
curl -s https://admin-dev.triarch.dev | grep -c 'data-env="dev"'
```

Expected: A record resolves, HTTP returns 2xx/3xx, TLS subject matches hostname + expiry > 60 days, DEV badge present (1).

## B. triarchsecurity.com hostnames (2 — BLOCKED until Phase 33/34)

These cannot be claimed until the FAH backends exist:

| Hostname | Firebase project | FAH backend | Created by |
|----------|------------------|-------------|------------|
| admin-dev.triarchsecurity.com | triarchsecurity-admin | admin-dev | Phase 33 |
| portal-dev.triarchsecurity.com | triarchsecurity-portal | portal-dev | Phase 34 |

After Phase 33 ships:
- Open `https://console.firebase.google.com/project/triarchsecurity-admin/apphosting`
- Find the new `admin-dev` backend
- Repeat Section A.2 + A.3 for `admin-dev.triarchsecurity.com` against GoDaddy domain `triarchsecurity.com`
- GoDaddy DNS manager URL: `https://dcc.godaddy.com/control/triarchsecurity.com/dns`

After Phase 34 ships:
- Same flow for `portal-dev.triarchsecurity.com` against triarchsecurity-portal Firebase project.

## C. Update apphosting.dev.yaml NEXTAUTH_URL entries (where applicable)

After Section A completes (4 dev hostnames resolve), each consumer that has NEXTAUTH_URL in apphosting.dev.yaml must point at the new dev hostname:

| Repo | apphosting.dev.yaml NEXTAUTH_URL | New value |
|------|--------------------------------|-----------|
| platform | (check current) | https://admin-dev.triarch.dev |
| dev-portal | (check current) | https://portal-dev.triarch.dev |
| tmi | (check current — may not use NextAuth) | n/a or https://tmi-dev.triarch.dev |
| truthtreason | (check current) | https://truthtreason-dev.triarch.dev |

`grep -l NEXTAUTH_URL apphosting.dev.yaml` in each repo to find where updates needed. Bump per-repo version + PR per workspace CLAUDE.md.

## D. Success Criteria Verification

After A + C complete:

- [ ] `admin-dev.triarch.dev` resolves + serves + TLS valid + DEV badge present
- [ ] `portal-dev.triarch.dev` resolves + serves + TLS valid + DEV badge present
- [ ] `tmi-dev.triarch.dev` resolves + serves + TLS valid + DEV badge present
- [ ] `truthtreason-dev.triarch.dev` resolves + serves + TLS valid + DEV badge present

After B (post Phase 33/34):
- [ ] `admin-dev.triarchsecurity.com` resolves + serves + TLS valid + DEV badge present
- [ ] `portal-dev.triarchsecurity.com` resolves + serves + TLS valid + DEV badge present

## Summary

total: 6
passed: 0
issues: 0
pending: 6 (4 from A, 2 blocked by Phase 33/34)
skipped: 0
blocked: 2

## Gaps
