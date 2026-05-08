# Admin Hostname Guard Inventory

**Created:** 2026-05-08 (Phase 17, HOST-01)
**Purpose:** Catalog every hostname check in admin codebase before introducing portal.triarch.dev as a second valid host. Phase 26 (Sunset, T+90 after cutover) consumes this inventory to scope the deletion of dead v2.1 hostname-aware branches.
**Pitfall reference:** PITFALLS.md Pitfall 5 — "Hostname-aware route guards left dangling in admin codebase"

## Known Hosts

| Host | Purpose | Detection |
|------|---------|-----------|
| `admin.triarch.dev` | Production admin (sole valid prod host post-Phase 17) | `startsWith('admin.triarch')` in proxy.ts |
| `admin-dev.triarch.dev` | Dev backend custom domain | Listed in `src/app/page.tsx` ADMIN_HOSTS |
| `admin-dev--triarch-dev-website.us-central1.hosted.app` | FAH internal hostname | Listed in `src/app/page.tsx` ADMIN_HOSTS |
| `localhost:3000`, `localhost:3001` | Local dev | Not currently in any explicit allowlist — falls through proxy passthrough |
| `triarch.dev`, `www.triarch.dev` | Marketing site (redirect target) | MARKETING_HOSTS sets in 3 layout files |

## Inventory

| # | File | Line | Pattern | Current Behavior | Removal Phase |
|---|------|------|---------|------------------|---------------|
| 1 | src/proxy.ts | 7 | `request.headers.get('host')` then `hostname.startsWith('admin.triarch')` | Middleware: only applies admin-routing if host starts with `admin.triarch`; otherwise returns `NextResponse.next()` — open passthrough (Pitfall 5 risk). Plan 17-02 hardens this to fail closed for unknown hosts. | KEEP (hardened in Phase 17, retained through Phase 26+) |
| 2 | src/app/page.tsx | 19 | `h.get("x-forwarded-host") ?? h.get("host")` then `ADMIN_HOSTS.has(host)` | Root marketing page: if request comes from an admin host (ADMIN_HOSTS set), redirect to /login; otherwise render marketing landing page | Phase 26 (SUN-02 — admin only serves admin host post-cutover, no marketing fallback needed) |
| 3 | src/app/admin/layout.tsx | 15 | `h.get('x-forwarded-host') ?? h.get('host')` then `MARKETING_HOSTS.has(host)` | If request comes from triarch.dev or www.triarch.dev marketing domain, 302-redirect to https://admin.triarch.dev/admin | Phase 26 (SUN-02) |
| 4 | src/app/projects/layout.tsx | 10 | same pattern as #3 | If marketing host, 302-redirect to https://admin.triarch.dev/projects | Phase 26 (SUN-02 — projects/* deleted entirely from admin in SUN-01, so this layout is deleted along with the route tree) |
| 5 | src/app/login/layout.tsx | 8 | same pattern as #3 | If marketing host, 302-redirect to https://admin.triarch.dev/login | Phase 26 (SUN-02) |

## Audit Details

**Re-grep performed at execution time (2026-05-08):** Confirmed exactly 5 sites, matching the planning-time inventory. No new sites found.

```
grep -rn "host ===|headers().get('host')|x-forwarded-host|nextUrl.host|request.headers.get('host')" src/
# Results: proxy.ts:7, page.tsx:19, projects/layout.tsx:10, admin/layout.tsx:15, login/layout.tsx:8
```

## Duplication Notes (Phase 26 cleanup hints)

The `MARKETING_HOSTS = new Set(['triarch.dev', 'www.triarch.dev'])` declaration and the `publicHost()` helper function are duplicated verbatim across three files:

- `src/app/admin/layout.tsx` (lines 11, 13–17)
- `src/app/projects/layout.tsx` (lines 6, 8–12)
- `src/app/login/layout.tsx` (lines 4, 6–10)

`src/app/page.tsx` has a related but different set — `ADMIN_HOSTS` listing 3 admin hosts including the FAH internal hostname — along with its own `publicHost()` helper (lines 11–21).

Phase 26 could consolidate these into a shared module `src/lib/hosts.ts`, but that consolidation may not be worth it: if Phase 26 (SUN-01) deletes `/projects/*` entirely and (SUN-02) removes the marketing fallback and MARKETING_HOSTS redirect blocks, all four duplicated declarations are deleted. Only the hardened `src/proxy.ts` (which uses inline `startsWith` rather than a Set) survives Phase 26.

## Phase 17 Outcome

- **HOST-01 (this document):** Audit complete; 5 hostname-check sites cataloged; Phase 26 has a known scope.
- **HOST-02 (Plan 17-02):** `src/proxy.ts` hardened to return 404 for unknown hosts (replaces the open `NextResponse.next()` passthrough); Vitest test asserts known-host passthrough and unknown-host 404.

## Phase 26 Cleanup Checklist (forward-looking)

When Phase 26 executes (T+90 after Phase 25 cutover), use this checklist:

- [ ] Delete `src/app/projects/` directory entirely (SUN-01) — removes `layout.tsx` and the entire `projects/*` route tree from admin; also deletes the MARKETING_HOSTS duplication in `projects/layout.tsx`
- [ ] Delete the `MARKETING_HOSTS` redirect block from `src/app/admin/layout.tsx` (lines 11–27) — admin now only serves admin host; the redirect to marketing site is dead
- [ ] Delete the `MARKETING_HOSTS` redirect block from `src/app/login/layout.tsx` (lines 4–21) — same rationale
- [ ] Delete or simplify `src/app/page.tsx` — marketing fallback page is no longer needed; admin host always redirects to /login at middleware level; the ADMIN_HOSTS check and publicHost() helper are deleted with it
- [ ] KEEP `src/proxy.ts` — the hardened version introduced in Phase 17 stays; it correctly fails closed for unknown hosts and correctly routes known admin hosts
- [ ] Bump admin to v3.0.0 (SUN-03) — breaking change: projects/* removed, marketing fallback removed

---
*Last updated: 2026-05-08 (Phase 17 audit)*
