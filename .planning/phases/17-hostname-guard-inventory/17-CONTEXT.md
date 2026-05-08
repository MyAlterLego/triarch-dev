# Phase 17: Hostname Guard Inventory - Context

**Gathered:** 2026-05-08
**Status:** Ready for planning
**Type:** Infrastructure (audit + middleware harden) — auto-skip discuss

<domain>
## Phase Boundary

Audit every hostname check in admin codebase. Document inventory at `.planning/host-guard-inventory.md` (file:line + current behavior). Harden admin's middleware (`src/proxy.ts` per Next.js 16 convention) to fail closed for unknown hosts — return 404 for any host that's not `admin.triarch.dev` or `localhost:300x`. This audit creates the known cleanup target for Phase 26 (Sunset) when v2.1's hostname-aware route guards in `src/app/page.tsx`, `src/app/admin/layout.tsx`, `src/app/projects/layout.tsx`, `src/app/login/layout.tsx` get deleted.

Delivers HOST-01 and HOST-02 from REQUIREMENTS.md.

</domain>

<decisions>
## Implementation Decisions

### Locked Decisions (from research/PITFALLS.md + roadmap)

- Inventory document at `.planning/host-guard-inventory.md` (NOT in `phases/` because it's a milestone-spanning audit reference, used through Phase 26)
- Failed-closed pattern: `src/proxy.ts` (or whatever Next.js 16 uses for middleware) returns 404 (NextResponse.rewrite to `/_not-found` or NextResponse.json) for any unknown host
- Acceptable known hosts: `admin.triarch.dev` (prod), localhost ports 3000/3001 (dev variants), Firebase App Hosting internal hostname like `t-XXXX---triarch-dev-*.run.app` (FAH proxies through this — prior fix in v2.1 used `x-forwarded-host` instead of `host`; preserve that behavior)
- Inventory must include the v2.1 hostname-aware guards already in admin: `src/app/page.tsx`, `src/app/admin/layout.tsx`, `src/app/projects/layout.tsx`, `src/app/login/layout.tsx`
- Phase 26 (Sunset) consumes this inventory to delete the dead branches after cutover; the inventory must be exhaustive to scope that deletion correctly

### Claude's Discretion
- Exact 404 response shape (rewrite vs json vs new Response) — Claude picks based on Next.js 16 idioms
- Whether to add a structured comment on each guard saying "deprecated, deletes in Phase 26" — Claude decides
- Whether to add a Vitest test for the middleware fail-closed behavior — recommended, Claude decides scope

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- v2.1 work added 4 hostname-aware guards in admin layouts (Phase 7.5/8 hostname routing). These are the primary inventory entries.
- v2.1 also added `src/proxy.ts` middleware (Next.js 16 deprecates `middleware.ts` in favor of `proxy.ts`); previously the middleware-manifest was empty. Verify proxy.ts actually fires.
- `headers().get('x-forwarded-host')` pattern is used because Firebase App Hosting fronts Cloud Run as a proxy — `host` returns the internal Cloud Run hostname, `x-forwarded-host` returns the public domain.

### Established Patterns
- Server-component hostname checks: `const host = (await headers()).get('x-forwarded-host') ?? (await headers()).get('host'); if (MARKETING_HOSTS.includes(host)) redirect(...);`
- The MARKETING_HOSTS / ADMIN_HOSTS arrays are duplicated across the 4 layout files — Phase 17 inventory should note this duplication for Phase 26 cleanup

### Integration Points
- New file: `.planning/host-guard-inventory.md` (audit document)
- Modified: `src/proxy.ts` (or `middleware.ts` if proxy.ts doesn't exist) — add fail-closed branch for unknown hosts
- Modified (optionally): the 4 layout files might get TODO comments referencing Phase 26 cleanup

</code_context>

<specifics>
## Specific Ideas

- The audit should capture: file path, line number, code snippet, current behavior (what redirect/check/decision the line makes), and removal-target phase (Phase 26 for v2.1 leftovers)
- Inventory format: markdown table with columns "File", "Line", "Pattern", "Current Behavior", "Removal Phase"
- Middleware harden: `if (!isKnownHost(host)) return new NextResponse('Not Found', { status: 404 })` — simple; if Next.js 16 has a cleaner idiom, use it
- Add 1 Vitest test (`src/proxy.test.ts` or similar) verifying: known host → continues, unknown host → 404. Mock NextRequest with custom headers.
- Phase 17 does NOT delete any of the v2.1 guards — those stay until Phase 26 sunset. Phase 17 only adds the middleware fail-closed safety net + the inventory doc.

</specifics>

<deferred>
## Deferred Ideas

- Deleting the v2.1 hostname-aware route guards → Phase 26 (Sunset, T+90 after cutover)
- Consolidating the duplicated MARKETING_HOSTS arrays into a shared module → Phase 26 cleanup (or earlier if it accidentally helps Phase 25 cutover)
- A more sophisticated host-allowlist module (instead of inline arrays) → out of scope for v2.2

</deferred>
