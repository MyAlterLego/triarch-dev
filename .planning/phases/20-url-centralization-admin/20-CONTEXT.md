# Phase 20: URL Centralization (Admin) - Context

**Gathered:** 2026-05-08
**Status:** Ready for planning
**Type:** Targeted refactor in admin repo (no portal touch)

<domain>
## Phase Boundary

Refactor admin to construct customer-facing URLs through a single helper module before portal ships. Add an ESLint rule that blocks raw `https://admin.triarch.dev/projects/` literals outside `src/lib/urls.ts`. After this phase: when Phase 25 cutover flips the redirect, every URL admin emits in Slack messages, lifecycle timeline external links, GitHub release notes, and email templates points to portal — automatically — without touching ~15 separate files.

Delivers URL-01..URL-03 from REQUIREMENTS.md (3 reqs).

</domain>

<decisions>
## Implementation Decisions

### Locked Decisions

- **Module:** `src/lib/urls.ts` (admin repo)
- **Helper signatures:**
  - `customerProjectUrl(slug: string)` → `${PORTAL_BASE_URL}/projects/${slug}`
  - `customerReleaseUrl(slug: string)` → `${PORTAL_BASE_URL}/projects/${slug}/releases`
  - `customerBugUrl(slug: string, id: string)` → `${PORTAL_BASE_URL}/projects/${slug}/bugs/${id}`
  - `customerFeatureUrl(slug: string, id: string)` → `${PORTAL_BASE_URL}/projects/${slug}/features/${id}`
- **PORTAL_BASE_URL env var:** reads from `process.env.PORTAL_BASE_URL`, defaults to `'https://portal.triarch.dev'`
- **ESLint rule:** `no-restricted-syntax` rule that flags any `Literal` containing `'admin.triarch.dev/projects/'` outside `src/lib/urls.ts`. CI fails on violation.
- **Scope of refactor (URL-02):** discover-then-replace pattern. Scout admin's codebase for URL emission sites that target customer-facing pages (Slack message bodies, email templates, GitHub release notes, lifecycle event links).
- **NOT in scope:**
  - Admin's own `https://admin.triarch.dev/admin/...` URLs (staff-internal, stay on admin)
  - Admin's `https://admin.triarch.dev/login` URLs (admin-internal sign-in)
  - Admin's relative `/api/projects/...` URLs (in client islands; those are admin-internal API calls)
  - Existing layout/login redirect URLs in src/app/{admin,projects,login}/layout.tsx (Phase 17 hostname guards — Phase 26 owns those)
- **PORTAL_BASE_URL apphosting binding:** add to admin's apphosting.yaml as a value (not a secret) — `PORTAL_BASE_URL: https://portal.triarch.dev` — so production reads from env. Localhost dev reads default.
- **Admin version bump:** 2.9.1 → 2.9.2 (patch — refactor only, no functional changes)

### Claude's Discretion
- Whether to add helpers for customer release-LOG URLs (e.g., a specific releaseLog row deep link) — Claude decides based on scout findings
- Whether the ESLint rule lives in `eslintrc` or a separate `.eslintrc.local.json` — Claude picks (probably extends existing config)
- The PORTAL_BASE_URL fallback behavior in non-production: probably `process.env.PORTAL_BASE_URL ?? 'https://portal.triarch.dev'`. For localhost dev when developer wants to point at local portal at :3002, they set PORTAL_BASE_URL=http://localhost:3002.

</decisions>

<code_context>
## Existing Code Insights

### Scout Results (initial)
- `grep -rn -E "https?://admin\.triarch\.dev" src/` returned 6 sites. Most are admin-internal (staff URLs, layout redirects). Customer-facing emissions are minimal in current admin code.
- `src/lib/slack.ts` `notifyReleaseApproved` emits Slack messages but does NOT currently embed a customer-facing URL — this is OK; the phase doesn't need to add deep links where none exist.
- `src/components/shared-ui/BugReportForm.tsx` and `FeatureRequestForm.tsx` reference `https://admin.triarch.dev/api/platform/ingest/bug-reports` — these are CONSUMER-CALLED INGEST URLs (other Triarch projects POST bug reports here). They're admin-side ingest endpoints, NOT customer portal URLs. Stay on admin.
- The actual customer-facing URLs admin will emit AFTER cutover are: deep links to `/projects/<slug>/releases` for approval Slack notifications, lifecycle event audit logs that surface to customers, possibly GitHub release notes pointing to portal.
- **Important finding:** the bulk of admin's customer-facing URL emission is RECENT or PROSPECTIVE (Phase 21+ will add lifecycle timeline polish, Phase 22 will add new Slack notifications with deep links). Phase 20 is therefore PROACTIVE — add the helper + ESLint rule before the prospective emission lands, so future code naturally uses the helper.

### Established Patterns
- Admin's apphosting.yaml binds env vars via `value:` (literal) or `secret:` (Firebase secret ref)
- Admin's vitest tests live next to source as `*.test.ts`
- Admin's eslint config: `eslint.config.mjs` (flat config) at repo root

### Integration Points
- New: `src/lib/urls.ts` (helpers + PORTAL_BASE_URL env reader)
- New: `src/lib/urls.test.ts` (Vitest unit tests for the helpers — 4-6 cases)
- Modified: `apphosting.yaml` adds `PORTAL_BASE_URL: https://portal.triarch.dev` env var
- Modified: `eslint.config.mjs` adds `no-restricted-syntax` rule
- Modified: any admin source file currently emitting customer-facing URLs (per scout)
- Modified: `package.json` version 2.9.1 → 2.9.2

</code_context>

<specifics>
## Specific Ideas

- The ESLint rule selector: `Literal[value=/admin\\.triarch\\.dev\\/projects/]` — flags string literals containing the customer-facing admin URL pattern outside urls.ts
- The 6 currently hardcoded `admin.triarch.dev` URLs in admin source: 3 are layout redirects (Phase 17 inventory; Phase 26 owns), 1 is proxy.test.ts (test-only, fine), 2 are BugReportForm/FeatureRequestForm component defaults (admin-internal ingest endpoints — stay)
- The phase is largely proactive: future Phase 21 (release page port to portal) and Phase 22 (write surface) will introduce new customer-facing URL emissions. Phase 20's helper + ESLint rule ensure those emissions go through `urls.ts`
- ESLint rule false-positive guard: `urls.ts` itself contains the literal — exempt that specific file
- Vitest test for `urls.ts`: 4-6 cases covering each helper + the env override behavior

</specifics>

<deferred>
## Deferred Ideas

- Migration of admin's old layout redirects (3 sites in src/app/{admin,login,projects}/layout.tsx) to use urls.ts helpers — these are STAFF redirects (Phase 17 inventory), Phase 26 owns deletion when staff moves to portal-free
- BugReportForm/FeatureRequestForm ingest URL switch to portal API — out of scope (those are admin-side platform endpoints, not customer-page URLs)
- Adding email-template URL helpers — admin doesn't currently send transactional emails; if Phase 22 introduces them, those should go through urls.ts via the established pattern
- A more sophisticated PORTAL_BASE_URL fallback (e.g., infer from request hostname for preview environments) — over-engineering; literal env var is fine

</deferred>
