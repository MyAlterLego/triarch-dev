---
gsd_state_version: 1.0
milestone: v2.3
milestone_name: Dev/Prod Contract Adoption
status: completed
stopped_at: Completed Phase 35 Plan 01 (CL-1..CL-6 compliance matrix UI on admin ci-cd page; v2.13.17)
last_updated: "2026-05-16T21:56:27.083Z"
progress:
  total_phases: 9
  completed_phases: 2
  total_plans: 13
  completed_plans: 18
---

# Triarch Dev Admin — Project State

## Project Reference

See: `.planning/PROJECT.md` (last updated 2026-05-08 — v2.2 milestone started)

**Core value:** One control plane to create, manage, and ship Triarch projects — including a dev-to-prod gating workflow that lets customers approve releases before they go live.
**Current focus:** Phase 28 — CL-4 Platform Self-Adopt

## Current Position

Phase: 35
Plan: Not started

## Active Milestone: v2.2 — Customer Portal Split

**Goal:** Fork the customer-facing surface out of `admin.triarch.dev` into its own Next.js app at `portal.triarch.dev`. Mirror the existing `triarchsecurity-admin` (staff) / `triarchsecurity-portal` (customer) precedent.

**Phases:** 12 (Phases 15–26)

| Phase | Goal | Requirements | Status |
|-------|------|--------------|--------|
| 15 — Operational Prework | Repo, FAH backends, DNS, OAuth, secrets exist before app code ships | OPS-01..05 | Not started |
| 16 — Shared Package Extraction | `@myalterlego/triarch-shared@0.1.0` published; admin re-exports; CI gate prevents drift | PKG-01..04 | Not started |
| 17 — Hostname Guard Inventory | Catalog admin's hostname checks; fail-closed middleware before second valid host | HOST-01..02 | Not started |
| 18 — Portal Auth Scaffolding | NextAuth v4 with `__Host-` cookies, distinct secret, customer-membership signIn, staff callout | AUTH-01..07 | Not started |
| 19 — Database Connectivity | Portal `pg.Pool` + `portal_runtime` DML-only role + DDL permission-denied smoke test | DB-01..04 | Not started |
| 20 — URL Centralization (admin) | `src/lib/urls.ts` + ESLint guard; refactor admin Slack/email/release-note URL emitters | URL-01..03 | Not started |
| 21 — Release Page Port (Read) | Lift-and-shift `/projects/[slug]/releases` + `/projects` list; 404 for non-members | PORTAL-01..04 | Complete |
| 22 — Release Page Port (Write, research_required) | Approve/reject/feedback + branch swap; portal-owned FAH key; HMAC-proxy to admin for GH dispatch | WRITE-01..05 | Complete (5/5 plans) |
| 23 — Bug + Feature Customer Surface | `/bugs/*` and `/features/*` list/detail/new routes (two net-new primitives) | BUG-01..03, FEAT-01..03 | Complete (4/4 plans — 23-01 foundations + 23-02 bugs read + 23-03 features read + 23-04 bug+feature write surface; portal v0.4.0; all 6 reqs shipped) |
| 23.1 — Portal UI Polish | Sub-nav, status column rewrite, empty-state copy, staff preview-as-customer toggle | UX-01..04 | Complete (4/4 plans — 23.1-01 sub-nav v0.4.7; 23.1-02 status column rewrite v0.4.8; 23.1-03 empty-state copy v0.4.9; 23.1-04 staff preview-as-customer toggle v0.5.0) |
| 24 — CI/CD Deploy Safety (research_required) | `verify-deploy-target`, per-repo deploy SAs, `assertEnv()`, `validate-apphosting.ts` | CI-01..04 | Structurally complete under reduced scope (24-02 shipped CI-03; 24-03 shipped CI-04 — PRs open; 24-01 + 24-04 SKIPPED per scope decision) |
| 25 — Cutover | Admin 301 → portal; customer email blast; Slack URL sweep; redirect telemetry; kill-switch | CUT-01..05 | Not started |
| 26 — Sunset (T+90) | Delete admin `/projects/[slug]/*` + dead hostname guards; admin v3.0.0 bump (deferred) | SUN-01..03 | Not started |

**Requirements:** 47 total, all mapped (100% coverage, no orphans)
**Status:** Milestone complete

## Performance Metrics

**Velocity:**

- Total plans completed: 0 (v2.2 start)
- Average duration: — (no data yet)
- Total execution time: —

*Updated after each plan completion*

## Accumulated Context

### Decisions

Carry-forward from v2.0/v2.1 (standing constraints, all phases):

- [v2.0]: Never extend `release_logs.status` enum without auditing all consumers; use metadata fields or new tables for new state
- [v2.0]: DB-backed locks for cross-request state — never in-process Maps or module-level variables (Firebase App Hosting serverless multi-instance)
- [v2.0]: URL params (not in-memory state) for all filter dimensions; follow `SlackAuditClient.tsx` precedent
- [v2.0]: New routes go under new paths; never move existing routes; do not restructure `/admin` URL tree
- [v2.0]: promoteAndAudit() fire-and-forget dispatch pattern (Slack 3-sec rule) — web promote path must call the same function

v2.2 decisions captured at roadmap creation (2026-05-08):

- [Roadmap-v2.2]: Phase numbering continues from v2.1's last phase (14) — v2.2 starts at Phase 15, ends at Phase 26
- [Roadmap-v2.2]: Phase 16 (shared package) precedes everything app-side — type safety dependency for portal code; admin re-export ships in same phase to prove contract
- [Roadmap-v2.2]: Phase 17 (hostname guard inventory) MUST land before Phase 18 — auditing host checks before introducing a second valid host so cutover has a known cleanup target
- [Roadmap-v2.2]: Phase 18 (auth) is prerequisite for any portal feature route — has highest concentration of catastrophic pitfalls (cookie leakage, secret cross-replay, signIn race, OAuth sub divergence)
- [Roadmap-v2.2]: Phase 20 (URL centralization in admin) MUST land before Phase 25 cutover — refactor admin's URL emission BEFORE flipping the 301 so Slack/email/release-note links don't rot
- [Roadmap-v2.2]: Phase 21 (read paths) precedes Phase 22 (write paths) — verify rendering before exposing mutation, smaller blast radius
- [Roadmap-v2.2]: Phase 24 (CI safety) is HARD prerequisite for Phase 25 cutover — verify-deploy-target prevents catastrophic cross-app deploys
- [Roadmap-v2.2]: Phase 26 (sunset) deferred T+90 after Phase 25 cutover; folded into v2.2 roadmap so requirement coverage is complete; reasonable to roll forward into v2.3 if grace period extends
- [Roadmap-v2.2]: Phase 22 marked `research_required: true` — Slack credential ownership operational mechanics (HMAC-proxy contract) settled at SUMMARY level, operational details TBD before plan
- [Roadmap-v2.2]: Phase 24 marked `research_required: true` — `MyAlterLego/shared-workflows` v5 vs per-repo equivalent decision pending
- [Roadmap-v2.2]: Shared package name `@myalterlego/triarch-shared` (matches scope: schema + helpers); auth-context.ts moves to shared package since we're creating it anyway
- [Roadmap-v2.2]: Same Firebase project (`triarch-dev-website`), two new backends `portal-prod` / `portal-dev` — reuses DATABASE_URL, FAH_PROMOTER_SA_KEY, Slack secrets; reversible if it bites
- [Roadmap-v2.2]: Cookies host-only (`__Host-` prefix in prod, NO `domain` attribute); distinct `NEXTAUTH_SECRET` per app; single Google OAuth client with two redirect URIs
- [Roadmap-v2.2]: Portal owns `PORTAL_SLACK_BOT_TOKEN` for direct customer-side posting; admin retains GitHub App key + dispatches workflows via internal HMAC-signed POST from portal
- [Roadmap-v2.2]: Admin sole migration authority; portal has DML-only DB role + no `db:push` script in package.json — defense-in-depth against rogue schema writes
- [Roadmap-v2.2]: Customer email blast list at cutover derived from `project_members.email WHERE role IN ('admin','viewer')`
- [Roadmap-v2.2]: Truth+Treason pilot reactivation deferred to v2.3 milestone candidate (was deferred from v2.0; out of v2.2 scope per Mike's directive)
- [Phase 15-operational-prework]: Repo created in MyAlterLego org (private); ci-cd.yml deferred to Phase 16 scaffold; HTTPS clone used
- [Phase 15-operational-prework]: PORTAL_NEXTAUTH_SECRET: distinct from admin NEXTAUTH_SECRET; secretAccessor to FAH compute SA only (mirrors admin pattern)
- [Phase 15-02]: portal.triarch.dev A record mirrors admin pattern (35.219.200.0, TTL=600) as placeholder until FAH portal-prod publishes its target in Plan 15-04
- [Phase 15-02]: portal.triarch.dev A record mirrors admin.triarch.dev (35.219.200.0, TTL=600) as placeholder until FAH portal-prod publishes its target in Plan 15-04
- [Phase 15-operational-prework]: firebase CLI auth expired; used gcloud REST API for all FAH backend operations (Owner-level access, equivalent result)
- [Phase 15-operational-prework]: gitRepositoryLink for triarch-portal created in existing apphosting-github-conn-kh7m03f connection; no new GitHub App install needed
- [Phase 16-shared-package-extraction]: npm install (not npm ci) in publish workflow — packages/triarch-shared has no committed lockfile yet; switch to npm ci when lockfile is committed
- [Phase 16-shared-package-extraction]: Drift gate diffs against latest shared/v* tag (not PR base branch) — catches multi-PR accumulation of unbumped changes
- [Phase 16-shared-package-extraction]: Package targets ES2022+ESNext module (library not Next runtime); peerDeps+devDeps for drizzle-orm/pg; private:false+publishConfig.access:restricted for GitHub Packages
- [Phase 16]: vitest plugin (resolveId, enforce:pre) to redirect package dist imports through admin shims so vi.mock patches work for package-internal db access
- [Phase 16]: file: dep for @myalterlego/triarch-shared until 16-04 publishes 0.1.0 to GitHub Packages
- [Phase 16-shared-package-extraction]: Workflow conclusion:failure was cosmetic-only (Summary step quoting bug); npm publish succeeded; fix committed in 164a7cd
- [Phase 16-shared-package-extraction]: Package ESM dist targets bundler consumers (Next.js transpilePackages); bare Node.js require of cross-subpath imports is not a supported consumption pattern
- [Phase 17-hostname-guard-inventory]: Inventory document at .planning/host-guard-inventory.md (NOT in phases/) — milestone-spanning reference used through Phase 26
- [Phase 17-hostname-guard-inventory]: Re-grep at execution time confirmed planning-time site list is exhaustive — exactly 5 sites, no new sites found
- [Phase 17-hostname-guard-inventory]: KNOWN_EXACT_HOSTS Set with exact match in proxy.ts prevents prefix-bypass attacks like admin-dev.triarch.dev.evil.com
- [Phase 17-hostname-guard-inventory]: Cloud Run *.run.app hostname accepted only when x-forwarded-host independently validates to known admin host
- [Phase 17-hostname-guard-inventory]: new NextResponse(null, {status: 404}) chosen for fail-closed response — no HTML body, lowest overhead
- [Phase 18]: feat/portal-scaffold branch + squash-merge PR strategy to land first commit on main (satisfies workspace no-direct-to-main rule)
- [Phase 18]: passWithNoTests: true in vitest.config.ts so zero-test portal scaffold exits 0
- [Phase 18]: Portal vitest.config.ts omits packageTestRedirectPlugin — uses published triarch-shared from GitHub Packages, not file: dep
- [Phase 18-portal-auth-scaffolding]: signIn callback STUBbed as Boolean(email) — full membership enforcement deferred to 18-03 by plan design
- [Phase 18-portal-auth-scaffolding]: __Host- cookie prefix in production with NO domain attribute (host-only, Pitfall 1 guard) — AUTH-01 satisfied in code, live OAuth verification gated on OPS-04
- [Phase 18-portal-auth-scaffolding]: Portal signIn fails closed on null getCurrentUserContext (no @triarchsecurity.com bypass unlike admin)
- [Phase 18-portal-auth-scaffolding]: jwt callback re-queries DB for isStaff on first sign-in; getPortalSession() helper centralizes session reads
- [Phase 18-portal-auth-scaffolding]: Staff with 0 memberships route to /no-memberships (StaffCallout handles guidance); null ctx from getCurrentUserContext also routes to /no-memberships as safe fallback
- [Phase 18-portal-auth-scaffolding]: /projects/[slug]/releases intentionally absent — Phase 21 ships it; 1-membership users see 404 confirming routing fired
- [Phase 18-portal-auth-scaffolding]: Source-text assertions (readFileSync) used for __Host- prefix test — more stable than dynamic import + ENV patch in Vitest jsdom
- [Phase 18-portal-auth-scaffolding]: no-sub-claim.test.ts filters JSDoc comment lines to prevent false positives from auth.ts documentation
- [Phase 19-database-connectivity]: portal_runtime provisioned on prod cluster (triarchdev-24092/triarch_dev) — admin's DATABASE_URL points to prod; portal shares same cluster
- [Phase 19-database-connectivity]: DATABASE_URL_PORTAL in triarch-vault (mirrors PORTAL_NEXTAUTH_SECRET pattern); secretAccessor to firebase-app-hosting-compute SA + secretVersionManager to FAH service agent
- [Phase 19]: Re-export pattern for portal db.ts — zero duplicate Pool, shared package owns construction
- [Phase 19]: Single DATABASE_URL_PORTAL secret for portal prod + dev FAH backends (one portal_runtime CRDB role)
- [Phase 19]: Drizzle wraps pg errors via .cause — test pattern: check error.cause.message for CRDB rejection propagation
- [Phase 20-url-centralization-admin]: PORTAL_BASE_URL read at call time in getPortalBaseUrl() inside each helper — not at module load — so env mutation in tests and per-request overrides work
- [Phase 20-url-centralization-admin]: No speculative helpers beyond four locked signatures — scout confirmed zero current customer-facing URL emission sites in admin
- [Phase 20-url-centralization-admin]: Exempt eslint.config.mjs from no-restricted-syntax — selector strings contain the pattern as regex fragment causing false positives
- [Phase 20-url-centralization-admin]: PORTAL_BASE_URL bound as plain value (not secret) in apphosting.yaml, RUNTIME-only availability
- [Phase 21-release-page-port-read]: vitest.config.ts shimMap must include every new module added to packages/triarch-shared/src/ for vi.mock interception to work through re-export shim chain
- [Phase 21-release-page-port-read]: Inline structural types in shared package group-sections.ts (ReleaseRow/ConflictState/BranchSection) — zero admin-relative imports; TypeScript structural typing preserves assignability
- [Phase 21-02]: Portal types.ts re-exports EntryTypeCounts/WhatsComingSummary from @myalterlego/triarch-shared/release-entry-summary (not @/lib shim); all other leaf UI files copied verbatim
- [Phase 21-02]: Portal vitest.setup.ts lacked afterEach(cleanup) — added to match admin pattern; required for RTL multi-render correctness in vitest
- [Phase 21]: ReleasesClient ported as read-only fork: 4 mutation handlers stubbed with TODO Phase 22, handleLoadMore stripped, hasMoreState=false
- [Phase 21-release-page-port-read]: PORTAL-03: notFound() for non-members (not 403) — project existence stays hidden
- [Phase 21-release-page-port-read]: projectKeys passed as string[] (not null) to getProjectPipelineSummaries — null is staff all-projects view; portal always scopes to membership
- [Phase 21-06]: hidden sm:flex established as portal pattern for desktop-only mutation controls — Phase 22 should follow same pattern for new write actions
- [Phase 21-06]: Vitest server component testing pattern: mock drizzle-orm operators as stubs + mock db builder chain; assert on Next.js navigation hooks (notFound/redirect call count)
- [Phase 22]: WRITE-01: actor_source='portal' hardcoded in approveReleasePortal/rejectReleasePortal — never caller-controlled, ensures customer-side provenance is unfakable
- [Phase 22]: WRITE-04 portal side: dispatchPromotion is fire-and-forget; failure logged but does NOT roll back the approval (matches admin's Slack-notify pattern)
- [Phase 22]: Canonical rawBody = JSON.stringify(body, Object.keys(body).sort()) — must match signRequest's internal canonicalize byte-for-byte for admin's verifyRequest to succeed
- [Phase 22]: Slack notification + UI un-stub deferred to 22-04 — this plan ships the dispatch path correctly first; data + dispatch are the WRITE-01 critical path
- [Phase 22-03]: WRITE-02 + WRITE-03 — portal-owned FAH_PROMOTER_SA_KEY end-to-end (no admin proxy on branch swap path) per CONTEXT.md D-04 lower-latency / lower-blast-radius verdict
- [Phase 22-03]: Verbatim port + auth swap — fah-rollout.ts copied from admin with zero logic deltas; preview routes copied with only getServerSession→getPortalSession + getCurrentUserContext({user:{email}}) substitution
- [Phase 22-03]: FAH_PROMOTER_SA_KEY explicitly re-bound on apphosting.dev.yaml (not relying on overlay inheritance) so grep finds the binding in both files
- [Phase 22-04]: WRITE-04 — Slack post fires BEFORE HMAC dispatch in approve route (3-sec customer feedback budget); both fire-and-forget; neither failure rolls back the approval
- [Phase 22-04]: No double-Slack-posting: portal posts approval to SLACK_RELEASE_APPROVAL_CHANNEL; admin's promoteAndAudit posts dispatch confirmation to project.slackChannelId. Different channels, different messages, different purposes (verified against admin/src/lib/release-promotion.ts).
- [Phase 22-04]: Portal Block Kit posts plain section blocks only — no slack_promote/slack_reject action_ids (those use SLACK_PAYLOAD_SECRET admin-only). 'via portal' headline marker so #release-approvals distinguishes origin.
- [Phase 22-04]: WRITE-05 preserved verbatim: two-step approve UX, conflict badge propagation (helper text in BOTH BranchSection action cell AND ExpandedPanel), branch lock disable propagation (singleton-by-cache-key SWR across all BranchPreviewButton mounts)
- [Phase 22-04]: handleLoadMore stays stubbed in ReleasesClient — portal lacks GET releases list endpoint. Deferred to 22-05 or beyond. hasMoreState=false hides the button.
- [Phase 22-05]: Phase-close patch bump 0.3.3 → 0.3.4 (test-only). Plan originally targeted v0.4.0 minor + tag-and-publish shared@0.3.0; orchestrator collapsed to patch since shared@0.3.0 was already published in 22-01 and pinned in 22-02 (verified 0.3.0 in portal package.json + lockfile resolves to npm.pkg.github.com), and only test files changed in 22-05.
- [Phase 22-05]: WRITE-05 explicit traceability: dedicated `describe('WRITE-05: ...')` blocks added across ReleasesClient.test.tsx (W5-1 two-step approve, W5-2 conflict badge), BranchPreviewClient.test.tsx (W5-3 site-wide disable, W5-4 terminal re-enable, W5-5 SWR singleton dedupe), and new MobileApproveSpec.test.tsx (M-1 375px viewport, M-2 conflict on mobile). Portal vitest 167/168 GREEN (was 160; +7 new).
- [Phase 22-05]: Modal label phrasing locked at portal source: aria-label='Confirm promotion of {branch} {version}' + visible 'Click to confirm — promote {branch} {version} (Ns)' — different phrasing from admin's 'Promote X to production' but functionally equivalent (two-step + branch+version in label).
- [Phase 22-05]: Mobile pattern: PORTAL-04 desktop-only Approve/Reject preserved via `hidden sm:flex` Tailwind wrapper; complementary `sm:hidden` mobile hint 'View on desktop to approve / reject' shown to mobile customers. Conflict helper text NOT wrapped in `hidden sm:flex` (visible on mobile so customers see resolution guidance regardless of viewport).
- [Phase 22-05]: handleLoadMore deferral carried forward to v2.3 polish — portal still lacks GET releases list endpoint; pageSize=20 covers near-term customer use (no project ships > 20 active releases). Tracked as a v2.3 candidate POLISH item.
- [Phase 23-bugs-read-surface]: ReleasedInSidebar populated via getReleaseHistoryForBug (Phase 11 release_log_links join), NOT freeform bug.fixVersion — advisory A-3 honored
- [Phase 23-bugs-read-surface]: Staff-only fields HIDDEN two ways: (1) source never references columns; (2) renderToStaticMarkup tests assert strings absent from HTML output. Comment block uses indirect phrasing so plan-checker grep on bug.triarchNotes returns 0 in source too
- [Phase 23-bugs-read-surface]: JSX-tree-walk findClientProps helper for server-component prop assertion — alternative to RTL render when only prop shape matters; faster + simpler
- [Phase 23-bugs-read-surface]: Closure state in vi.mock factories survives vi.clearAllMocks() — module-scope dbCallIdx with explicit reset in resetState() pattern logged for future server-component tests with multi-step query chains
- [Phase 23-features-read-surface]: ReleasedInSidebar populated via getReleaseHistoryForFeature (Phase 11 release_log_links join), NOT freeform feature.shippedVersion — advisory A-3 honored across 23-01/23-02/23-03
- [Phase 23-features-read-surface]: Staff-only fields HIDDEN for 4 fields (vs bug's 2): triarchNotes, buildPlan, buildPlanStatus, estimatedEffort. Tests use unique-sentinel mocking + renderToStaticMarkup-level assertion. Comment-block grep barrier preempted from 23-02 lessons (first-time correct phrasing)
- [Phase 23-features-read-surface]: Lessons-applied-first-time from 23-02: closure-state mock hoisting + comment-block grep barriers written correctly on initial implementation; zero in-flight Rule-3 deviations
- [Phase 23-04-bug-feature-write-surface]: BUG-03 + FEAT-03 — Phase 22-04 envelope ported verbatim (auth → INSERT → Slack-before-response → best-effort slack_message_ts UPDATE → 201). Slack post fires BEFORE response (3-sec customer feedback budget); fire-and-forget (failure logged not propagated; INSERT not rolled back).
- [Phase 23-04-bug-feature-write-surface]: RESEARCH OQ-2 implementation — slack_message_ts + slack_channel_id captured from chat.postMessage response and persisted on the just-INSERTed row via best-effort UPDATE inside its own try/catch. Sets up admin v2.3+ Slack-thread foundation.
- [Phase 23-04-bug-feature-write-surface]: Pitfall 8 (workflow_transitions on submission) intentionally SKIPPED to match admin parity — admin's existing customer-origin submission paths don't INSERT either. Residual risk accepted: workflow_transitions is observability not authoritative state.
- [Phase 23-04-bug-feature-write-surface]: Pitfall 9 anchored TWO WAYS — source comments use indirect phrasing for admin-only Block Kit action button IDs; tests EXT-4 + EXT-8 + grep guard returns 0 in source. Defense in depth — even comments don't enumerate the literal strings.
- [Phase 23-04-bug-feature-write-surface]: Cross-project POST defense via the same membership 404 code path as non-member 404 — Tests 6 + FEAT-6 verify member-of-A POSTing to project-B returns 404 with no row INSERTed and no Slack post.
- [Phase 23-04-bug-feature-write-surface]: Channel env vars (PORTAL_BUG_REPORTS_CHANNEL, PORTAL_FEATURE_REQUESTS_CHANNEL) read at CALL TIME inside helper bodies — mirrors Phase 22-04 SLACK_RELEASE_APPROVAL_CHANNEL pattern; allows test override + apphosting.dev.yaml runtime overlay both win without module-cache poisoning.
- [Phase 23-04-bug-feature-write-surface]: Phase-close MINOR bump 0.3.7 → 0.4.0 — Phase 23 ships entire bug + feature primitive customer surface (read in 23-02/23-03; write in 23-04). The 0.3.5/0.3.6/0.3.7 patch progression in 23-01..03 reserved the minor for the close.
- [Phase 23.1-01-portal-ui-polish]: Active tab styling = text-teal-300 + border-b-2 border-teal-400 (saturated underline, NOT a filled pill) — matches StatusPill `approved` family hue and CONTEXT.md UX-01 D-02. Muted = text-zinc-400 with hover:text-zinc-200.
- [Phase 23.1-01-portal-ui-polish]: Layout duplicates auth check with child pages intentionally — child pages still derive userRole/currentUserEmail props the layout doesn't pass down. Two cheap DB lookups per request, single TCP connection — kept separate for clean concerns. Documented in 12-line comment block at top of layout.tsx.
- [Phase 23.1-01-portal-ui-polish]: 7 customer-side page.tsx files lose their CustomerHeader render (3 main + 4 sub-pages: bugs/[id], bugs/new, features/[id], features/new) — `grep -rn 'import CustomerHeader' src/app/projects/[slug]/` returns exactly 1 match (layout.tsx). Zero per-page integration code remains.
- [Phase 23.1-01-portal-ui-polish]: usePathname startsWith active matcher (not exact equality) — so `/bugs/[id]` and `/features/new` light up parent tab. Critical correctness for sub-routes; covered by tests T1.3 + T1.4.
- [Phase 23.1-01-portal-ui-polish]: Mobile horizontal-scroll affordance via outer div `overflow-x-auto` + ul `whitespace-nowrap` — preferred over flex-wrap or hamburger. Covered by test T1.6.
- [Phase 23.1-01-portal-ui-polish]: Pre-existing portal TS test errors (7 files, baseline from commit 9dae716 v0.4.3 import migration) logged to `.planning/phases/23.1-portal-ui-polish/deferred-items.md` per scope-boundary rule. `npx vitest run` GREEN; `next build` clean (build excludes test files from compile).
- [Phase 23.1-02-portal-ui-polish]: ReleaseStatusPill is the row-level single source of truth for release lifecycle pills. Legacy STATUS_BADGE_COLORS in ReleasesClient.tsx deleted; the duplicate in BranchSection.tsx remains only for section-header aggregate badges. Drift class for the per-row pill eliminated permanently — there is literally one component now.
- [Phase 23.1-02-portal-ui-polish]: Promoted color drift fix applied + announced — was amber-400/20 in legacy ReleasesClient inline map; UX-02 D-03 specifies emerald-500/20 for "in prod" saturated. Lands in BOTH the per-row ReleaseStatusPill AND the section-header `{N} promoted` aggregate badge so the visual story is consistent. Revert points: `RELEASE_STATUS_COLORS.promoted` in StatusPill.tsx + `STATUS_BADGE_COLORS.promoted` in BranchSection.tsx.
- [Phase 23.1-02-portal-ui-polish]: Pending-review section header badge derives count from `section.releases.filter(r => r.status === 'pending_approval').length` NOT `section.aggregate.pending` — server snapshot goes stale after Phase 22-04 client-side mutation handlers flip a row's status. Derived count stays accurate after every mutation.
- [Phase 23.1-02-portal-ui-polish]: Pending-only filter chip (?pending=1) composes pendingOnly FIRST (most aggressive), THEN entry-type filter; empty sections pruned after each pass. Default OFF per CONTEXT UX-02 D-05. URL-mirrored — back-button + deep-linking work.
- [Phase 23.1-02-portal-ui-polish]: Pending-approval row highlight via additive className `bg-amber-500/5 border-l-2 border-l-amber-500` — no new wrapper element, no Tailwind conflict with hover:bg-zinc-800/30 (hover wins via cascade).
- [Phase 23.1-02-portal-ui-polish]: ReleaseStatusPill renders WITH a border (deliberately diverges from BugStatusPill / FeatureStatusPill which are borderless) — preserves visual continuity with the existing release-table pill presentation, where pills already used borders. Documented in StatusPill.tsx comment block.
- [Phase 23.1-02-portal-ui-polish]: ExpandedPanel in ReleasesClient.tsx now renders ReleaseStatusPill at the top ("Status: [pill]") — bonus: customer reading the panel sees the same pill as the row, no hunting back up; also gives the ReleaseClient `import` a real consumer rather than a transitive grep marker.
- [Phase 23.1-02-portal-ui-polish]: Vitest test pattern for URL-toggle in both directions requires explicit `unmount()` between OFF→ON simulation phases inside a single `it` block — afterEach(cleanup) only runs between describe/it blocks. Documented inline in T2.5 so future devs don't re-introduce the duplicate-mount footgun.
- [Phase 23.1-03-portal-ui-polish]: Empty-state row uses `flex items-baseline gap-2` (no `justify-between`) — populated rows keep 3-span justify-between layout (label / version / timestamp); empty rows collapse to 2-span gap-2 layout (label / "Not yet released"). Visually distinct enough to register "different state" while keeping row-height parity (no layout jump).
- [Phase 23.1-03-portal-ui-polish]: Source text is `Prod:` / `Dev:` (capitalized + colon); rendered surface is `PROD:` / `DEV:` via existing `text-xs uppercase tracking-wide` CSS — DOM text matches `Prod:` (CSS doesn't transform DOM strings) so tests assert on source text while user sees CONTEXT.md UX-03 D-01's `PROD: Not yet released` literal.
- [Phase 23.1-03-portal-ui-polish]: Timestamp HIDDEN entirely (not rendered) when corresponding deployedAt is null — per CONTEXT.md UX-03 D-03. NOT "—", NOT "never". Test T1.5 confirms by counting `(\d+\s+(min|hr|day|days)\s+ago|just now)` matches in serialised HTML.
- [Phase 23.1-03-portal-ui-polish]: Brand-new project tile uses standard card classes (`bg-zinc-900 border-zinc-800`) — NO opacity/grayscale override per CONTEXT.md UX-03 D-04. Projects can go live at any time; greying might confuse customers.
- [Phase 23.1-03-portal-ui-polish]: Server-component test pattern reuses Phase 21's approach — `renderToStaticMarkup(await ProjectsPage())` produces an HTML string for substring assertions. Mocks: `getPortalSession` + `getCurrentUserContext` for auth, `getProjectPipelineSummaries` as the unit-under-test boundary, `db.select` chain returns project rows. No jsdom dependency.
- [Phase 24-03-validate-apphosting]: Temp-file fixtures over fs mocks for testing scripts that read YAML — `mkdtempSync(tmpdir(), 'prefix-')` per test + writeFileSync, afterEach `rmSync(recursive, force)`. Avoids vi.mock('node:fs') fragility with transitive yaml-package fs imports. Hermetic, fast, and exercises the script the way CI does (real filesystem, real yaml parser).
- [Phase 24-03-validate-apphosting]: import.meta.url === `file://${process.argv[1]}` guard at script bottom — keeps script unit-testable (test imports do not run main()), still runs main() when invoked via `npx tsx scripts/validate-apphosting.ts`.
- [Phase 24-03-validate-apphosting]: deploy: needs: [quality-gate, validate-apphosting] — NOT three prerequisites with verify-deploy-target. Plan 24-01 was scoped out per Mike's reduced-scope call; the job does not exist in either repo's ci-cd.yml. Listing it would cause CI to fail with "job not found." If 24-01 ships in a future plan, that plan extends the array in one line per repo.
- [Phase 24-03-validate-apphosting]: scripts/validate-apphosting.ts byte-identical between admin and portal (only ../src/lib/env-schema.ts content differs — admin 18 entries, portal 12 entries). Future shared-package extraction (V2.3 candidate) only needs to relocate the script; call sites stay unchanged. Verifiable via `diff` on the two paths.
- [Phase 27]: text (not pgEnum) for verdict column in deployGateCheck — matches established codebase pattern (promoteAttempts.result uses varchar, no DB CHECK constraints)
- [Phase 27]: deployGateCheck added to src/db/schema.ts local additions file, NOT packages/triarch-shared/ — admin-internal table requires no publish step
- [Phase 27]: Bearer token extracted from Authorization header before requireApiKey call — SHA-256 hashed, never stored plaintext (api_key_hash field)
- [Phase 27]: target_version and dev_version trimmed on write (.trim()) for Plan 03 byte-for-byte match consistency
- [Phase 27]: reject_no_pair verdict is server-synthesized only — gate-verdict endpoint rejects any caller passing it
- [Phase 27]: CL6_ENFORCEMENT_MODE read at call time inside POST handler — mirrors PORTAL_BASE_URL pattern; allows test override via process.env mutation
- [Phase 27]: warn mode ships as default (Phase 27); manual flip to enforce after Phase 28 verifies round-trip + 7-day grace window (D-Rollout per CONTEXT.md)
- [Phase 28-cl4-platform-self-adopt]: Step inserted BEFORE existing Audit log step; if always() fires on pass+fail; continue-on-error true; dev_version sentinel vnone; commit on local feature branch only
- [Phase 28]: cl4-gate job named to avoid collision with existing gate-prod GitHub Environment binding; deploy.needs extended with both version and cl4-gate
- [Phase 28]: version job extracts package.json version once (needs: quality-gate only); cl4-gate needs [env-select, version] so it only resolves on push paths
- [Phase 28-cl4-platform-self-adopt]: Platform project_key is triarch-dev (not triarchsecurity-platform); cl4-gate job avoids gate-prod collision; version job added for deterministic gate input; deploy.if extended for dev-path safety
- [Phase 29-01-envbadge]: EnvBadge uses inline CSS-in-JS (not className/Tailwind) — shared-ui component sources do not use Tailwind directly; themes/*.css is the CSS mechanism
- [Phase 29-01-envbadge]: Yellow (#facc15) for dev, orange (#fb923c) for staging; zIndex 9000 (above app content, below modal overlays); data-env normalized to lowercase
- [Phase 29-01-envbadge]: Consumer mount plans (29-02..29-06) are blocked on human push + PR + tag + npm publish of shared-ui v1.5.0 before npm install works
- [Phase 29-02-platform-mount]: Replaced stale @myalterlego/shared-ui in transpilePackages — grep confirmed 0 source consumers; EnvBadge mounted as last child in body after Providers; NEXT_PUBLIC_ENV=dev bound with BUILD+RUNTIME in apphosting.dev.yaml; npm install deferred pending v1.5.0 publish
- [Phase 29]: darksouls: @triarchsecurity/shared-ui added to transpilePackages keeping legacy @triarch/shared-ui + @myalterlego/shared-ui entries; EnvBadge mounted after Providers as last body child; NEXT_PUBLIC_ENV=dev wired in apphosting.dev.yaml BUILD+RUNTIME; version 7.7.12→7.7.13
- [Phase 29-03-dev-portal-mount]: dev-portal: transpilePackages already had @triarchsecurity/shared-ui (no edit needed); EnvBadge mounted as last body child after StaffCallout + PreviewModeBanner conditionals; NEXT_PUBLIC_ENV=dev wired with BUILD+RUNTIME; version 0.7.4→0.7.5; branched off main (not stale fix/deploy-skip-bug)
- [Phase 29-cl2-envbadge-component]: truthtreason first-time shared-ui consumer: added dep + transpilePackages + EnvBadge mount in single atomic v1.1.19 commit
- [Phase 29-cl2-envbadge-component]: Version bump 4.44.1->4.44.2 (not 4.44.4): plan context referenced stale branch version; corrected to patch increment from actual main baseline
- [Phase 29-cl2-envbadge-component]: Replaced @myalterlego/shared-ui with @triarchsecurity/shared-ui in transpilePackages after confirming 0 src imports of stale name
- [Phase Phase 29]: Phase 29 closes CL2-01..CL2-04 for 5 of 7 projects; security-admin/portal mounts deferred to Phases 33/34; consumer CI blocked on shared-ui v1.5.0 publish until HUMAN-UAT B1 completes
- [Phase 32-03 truthtreason]: gate-prod-version job renamed to cl4-gate + bumped @v8.1→@v8.2; needs aligned to [env-select, version] matching platform pattern; v2.13.10 verify-dev-deployed direction was already correct (no back-patch needed); version 1.1.18→1.1.20 on feat/cl4-consumer-gate branch
- [Phase 33-01 security-admin]: quality-gate bumped from @v1.8 to @v8.2 to match full v8 adoption; deploy split into deploy-dev + deploy-prod; verify-dev-deployed uses v2.13.10 direction (is-ancestor origin/dev HEAD); cl4-gate project_key=triarchsecurity-admin; apphosting.dev.yaml is standalone (full env + _DEV secret variants); NEXTAUTH_SECRET_DEV added alongside DATABASE_URL_DEV; EnvBadge from @triarchsecurity/shared-ui mounted as last body child; v3.54.1→v3.55.0 on feat/dev-path-cl4-cl2-cl3 off fix/bump-shared-workflows-v8
- [Phase 34-01 security-portal]: quality-gate bumped from @v1 to @v8.2; deploy split into deploy-dev (portal-dev backend) + deploy-prod; verify-dev-deployed uses v2.13.10 direction; cl4-gate project_key=triarchsecurity-portal; apphosting.dev.yaml expanded from stub (was DATABASE_URL only) to full _DEV secret set (PORTAL_JWT_SECRET_DEV, PORTAL_TOTP_ENCRYPTION_KEY_DEV, DATABASE_URL_DEV); HUMAN-UAT includes dormant dev branch resolution (Option A: delete + recreate recommended); v0.14.8→v0.15.0 on feat/dev-path-cl4-cl2-cl3 off fix/bump-shared-workflows-v8
- [Phase 35]: CL-1 derives expected dev hostname from deployedUrl (green=pattern derivable); CL-6 uses single inArray batch query; CL-4 reuses existing verdict; CL-2/3/5 scaffolded grey with deferred HTTP/GitHub fetch reason

### Pending Todos

- Before planning Phase 22: run `/gsd:research-phase 22` to resolve HMAC-proxy operational mechanics for portal→admin GitHub workflow dispatch
- Before planning Phase 24: run `/gsd:research-phase 24` to resolve `MyAlterLego/shared-workflows` v5 immutability question
- Phase 15 planning: include OAuth localhost URIs from start (Pitfall 13) — `http://localhost:3002/api/auth/callback/google` alongside production redirect URI
- Phase 16 planning: ensure portal repo scaffold strips `db:push` and `db:generate` from package.json BEFORE first commit (defense-in-depth alignment with Phase 19 DB-03)
- Phase 18 planning: Vitest assertion on Set-Cookie (AUTH-05) is mandatory — Pitfall 1 catastrophic-leakage guard

### Blockers/Concerns

- Phase 22 is blocked on HMAC-proxy operational research — request/response contract, replay-window, key-rotation procedure, error-surface for portal client must be resolved before plan
- Phase 24 is blocked on shared-workflows immutability research — whether v4 immutable in practice, whether v5 tag accepts new `verify-deploy-target` job + `repo_name` input, or whether per-repo equivalent is needed
- Phase 26 (Sunset) execution gated on T+90 grace period after Phase 25 cutover lands; not a code blocker but a calendar-driven deferral

## Session Continuity

Last session: 2026-05-16T21:55:09.677Z
Stopped at: Completed Phase 35 Plan 01 (CL-1..CL-6 compliance matrix UI on admin ci-cd page; v2.13.17)
Resume file: None
Next action: Complete HUMAN-UAT A-G for security-portal (resolve dormant dev branch, FAH portal-dev backend, DNS, GCP secrets, ADMIN_API_TOKEN, npm install after shared-ui publishes, merge PR). See 34-HUMAN-UAT.md.

## Performance Metrics (24-03)

| Plan | Duration | Tasks | Files | Test cases |
|------|----------|-------|-------|------------|
| 24-03 | 5 min | 2 (admin + portal) | 4 created + 4 modified | +10 (5 per repo) |
| Phase 27 P01 | 2 | 2 tasks | 2 files |
| Phase 27 P02 | 3m | 2 tasks | 2 files |
| Phase 27 P03 | 4m | 4 tasks | 5 files |
| Phase 28-cl4-platform-self-adopt P01 | 5 | 3 tasks | 2 files |
| Phase 28 P02 | ~7 minutes | 2 tasks | 2 files |
| Phase 28 P03 | 8 | 3 tasks | 2 files |
| Phase 29 P04 | 8 | 2 tasks | 4 files |
| Phase 29-cl2-envbadge-component P06 | 8 | 2 tasks | 4 files |
| Phase 29-cl2-envbadge-component P05 | 8 | 2 tasks | 4 files |
| Phase 32 P03 (truthtreason cl4-gate) | ~5 min | 1 task | 2 files |
| Phase 32 P02 (tmi cl4-gate + v2.13.10 backpatch) | ~5 min | 1 task | 2 files |
| Phase 33 P01 (security-admin two-env restructure) | ~25 min | 5 tasks | 5 files |
| Phase 34 P01 (security-portal two-env restructure) | ~20 min | 5 tasks | 5 files |
