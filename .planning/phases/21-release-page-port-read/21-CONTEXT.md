# Phase 21: Release Page Port (Read) - Context

**Gathered:** 2026-05-08
**Status:** Ready for planning
**Type:** Major code lift — full v2.1 customer release page ported from admin to portal (read paths only)

<domain>
## Phase Boundary

Lift-and-shift the v2.1 customer release page from admin (`src/app/projects/[slug]/releases/`) to portal (`~/claude/triarch/development/portal/src/app/projects/[slug]/releases/`). All READ paths port; mutations (approve/reject/feedback/branch preview) are stubbed UI-only and wired in Phase 22. Replace portal's `/projects` page.tsx stub with the full pipeline-summary tile UI. Add 404 (NOT 403) guards on every `/projects/[slug]/*` route for non-members. Mobile-responsive layout for read paths.

Delivers PORTAL-01..PORTAL-04 from REQUIREMENTS.md.

⚠ **Scope of "read paths only":** the visual UI ports completely. Any onClick/onSubmit handlers that POST/DELETE → leave as no-op stubs in this phase. Phase 22 wires the actual API calls.

</domain>

<decisions>
## Implementation Decisions

### Locked Decisions

**Code-sharing strategy:**
- Server-side helpers used by customer page (`release-entry-summary.ts`, `release-history.ts`, `group-sections.ts`, `pipeline-summary.ts`) MOVE to `@myalterlego/triarch-shared`. Bump shared package to 0.2.0. Admin gets re-export shims (mirrors Phase 16 pattern).
- Client UI components (`PreviewLink.tsx`, `FilterChips.tsx`, `WhatsComingCard.tsx`, `BranchSection.tsx`, `Timeline.tsx`, `format.ts`, `types.ts`) COPY to portal (not shared package — these are tightly coupled to React/Tailwind classes, easier to keep per-app and risk minor drift than to share UI primitives outside @myalterlego/shared-ui)
- `BranchPreviewClient.tsx` ports as a STUB (UI shows the button, click does nothing) — Phase 22 wires it
- `ReleasesClient.tsx` is the most complex — needs splitting: a read-only portal version (no approve/reject/feedback handlers) lands in Phase 21; full mutation version with API wiring lands in Phase 22

**Shared package bump (0.1.0 → 0.2.0):**
- New exports: `release-entry-summary`, `release-history`, `group-sections`, `pipeline-summary`
- Admin updates its imports + bumps to v2.9.3 once shim shows the re-export pattern
- Tag-publish on `shared/v0.2.0`

**Portal `/projects/[slug]/releases` server component:**
- Imports `getReleasesForProject` (or equivalent) from shared package
- Imports `getEntryTypeSummaryForProject`, `getWhatsComingToProd` from shared package (renamed `release-entry-summary`)
- Membership-enforced: 404 for non-members (uses `getCurrentUserContext` + project_key check from shared package)
- Renders FilterChips + WhatsComingCard + BranchSection (with BranchPreviewClient stub) + Timeline + lifecycle events
- Mobile-responsive: stacked layout under sm breakpoint; approve/branch-swap buttons keep desktop-only styling

**Portal `/projects` page (full version, replacing 18-04 stub):**
- Replaces current minimal `<a href>` list
- Renders `getProjectPipelineSummaries()` tile UI matching admin's `/admin` page styling (prod/dev versions, pending-approval pill, what-changed one-liner, click-through to `/projects/[slug]/releases`)
- Each tile is a Next.js Link to that project's release page

**404-not-403 enforcement:**
- Every `/projects/[slug]/*` server component starts with: `getCurrentUserContext` → membership check → if no membership, `notFound()` (Next.js helper, returns 404 not 403)
- Vitest test asserting non-member → 404 not 403

**Mobile-responsive (PORTAL-04):**
- Tailwind responsive classes: `flex-col sm:flex-row`, `text-sm sm:text-base`, etc. on read paths
- Approve / Branch swap controls: keep desktop-only via `hidden sm:flex` (per CONTEXT decisions in features research — customer-side mutation actions are desktop-optimized)

**Portal version bump:**
- After this phase: portal v0.2.1 → v0.3.0 (minor — major customer surface lands)
- Multiple PRs through the phase, each bumping patch (0.2.2, 0.2.3, ...) with a final 0.3.0 commit at phase close

### Claude's Discretion
- Whether to keep ReleasesClient as one file or split into ReleasesView (read-only) + ReleasesActions (deferred Phase 22) — Claude picks based on coupling
- Brand differentiation in portal: same dark theme + violet/blue gradients, but portal can have a different header/nav. Claude picks reasonable defaults; visual polish in v2.2.x
- Whether the ReleasedInSidebar component (used by admin's bug detail) should also port to portal at this phase or wait for Phase 23 (bug+feat surface) — recommend WAIT (Phase 23 owns it)

</decisions>

<code_context>
## Existing Code Insights

### Files to MOVE to shared package (admin → @myalterlego/triarch-shared@0.2.0)
- `admin/src/lib/release-entry-summary.ts` (~150 lines) — getEntryTypeSummaryForProject, getWhatsComingToProd, bucketEntryType
- `admin/src/lib/release-history.ts` (~100 lines) — getReleaseHistoryForBug/Feature
- `admin/src/lib/pipeline-summary.ts` (~200 lines) — getProjectPipelineSummaries (already shared-package candidate per Phase 16 deferred)
- `admin/src/app/projects/[slug]/releases/group-sections.ts` (~95 lines) — pure logic for grouping releases by branch
- Each gets a re-export shim in admin (1-line `export * from '@myalterlego/triarch-shared/...'`)

### Files to COPY to portal (admin → portal — keep both for now; admin still needs them too)
- `admin/src/app/projects/[slug]/releases/page.tsx` → portal equivalent (server component, queries DB via shared db)
- `PreviewLink.tsx`, `format.ts`, `types.ts` (small)
- `FilterChips.tsx`, `WhatsComingCard.tsx`, `BranchSection.tsx`, `Timeline.tsx` (medium client components)
- `BranchPreviewClient.tsx` → portal STUB version (no fetch, no SWR, just UI)
- `ReleasesClient.tsx` → portal READ-ONLY version (filter math, no mutation handlers)
- All `*.test.tsx` test files except for mutation-specific tests

### Files NOT touched in Phase 21 (deferred to later phases)
- `release-promotion.ts` — admin-only, used by Slack/web promote (Phase 22 if portal needs)
- `release-sync.ts`, `release-actions.ts` — admin-only API helpers
- BranchPreviewClient + ReleasesClient mutation handlers — Phase 22

### Established Patterns
- Server components query DB via `db` from `@myalterlego/triarch-shared/db`
- Customer-side membership check: `getCurrentUserContext({ user: { email } })` from shared/auth, then `ctx.memberships.find(m => m.project_key === slug)`
- Client islands receive server-fetched data via props (no client-side fetch on initial render except SWR for branch preview status)
- Vitest tests use jsdom + RTL for client components, node env for server helpers

### Integration Points
- `~/claude/triarch/development/portal/src/app/projects/[slug]/releases/page.tsx` — NEW server component
- `~/claude/triarch/development/portal/src/app/projects/[slug]/releases/*.tsx` — NEW client islands (ported)
- `~/claude/triarch/development/portal/src/app/projects/page.tsx` — REPLACES stub from 18-04
- `~/claude/triarch/development/admin/packages/triarch-shared/src/release-entry-summary.ts` (and others) — NEW package files
- `~/claude/triarch/development/admin/src/lib/{release-entry-summary,release-history,pipeline-summary}.ts` — become re-export shims
- shared package tag `shared/v0.2.0` published

</code_context>

<specifics>
## Specific Ideas

- The shared package bump can happen in a single plan (publish workflow already exists from Phase 16); Phase 16's ESLint version-drift gate fires on schema changes, NOT on lib helper additions, so additions here pass cleanly
- Portal pages use `app/projects/layout.tsx` for shared layout (StaffCallout banner) — existing from Phase 18-03, just nest under it
- The "404 for non-member" pattern: in each `/projects/[slug]/*` page, first await session+ctx; if !ctx OR no matching membership, call `notFound()` from `next/navigation`. This returns 404 to the user.
- Mobile breakpoints: use admin's existing breakpoint conventions (`sm:`, `md:`, `lg:`) — don't introduce new ones
- The phase has many sub-pieces. Plans should be sequenced: shared package bump (Wave 1) → portal client islands copy (Wave 2) → portal page.tsx + /projects integration + 404 guards (Wave 3) → mobile + cleanup (Wave 4)

</specifics>

<deferred>
## Deferred Ideas

- Mutation handlers (approve/reject/feedback) — Phase 22
- Branch preview swap dispatch — Phase 22 (uses portal-owned FAH_PROMOTER_SA_KEY)
- Customer bug + feature pages — Phase 23
- ReleasedInSidebar component port — Phase 23 (consumer is bug/feat detail pages)
- Visual brand polish (custom portal header, brand-specific gradient) — v2.2.x or v2.3
- Cross-project filter / search — out of v2.2 scope

</deferred>
