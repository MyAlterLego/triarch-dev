---
gsd_state_version: 1.0
milestone: v2.2
milestone_name: Customer Portal Split
status: executing
stopped_at: Completed 22-release-page-port-write 22-03-PLAN.md (PRs open, awaiting Mike's review)
last_updated: "2026-05-08T22:35:00.000Z"
progress:
  total_phases: 19
  completed_phases: 13
  total_plans: 54
  completed_plans: 51
---

# Triarch Dev Admin — Project State

## Project Reference

See: `.planning/PROJECT.md` (last updated 2026-05-08 — v2.2 milestone started)

**Core value:** One control plane to create, manage, and ship Triarch projects — including a dev-to-prod gating workflow that lets customers approve releases before they go live.
**Current focus:** Phase 22 — release-page-port-write

## Current Position

Phase: 22 (release-page-port-write) — EXECUTING
Plan: 4 of 5

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
| 22 — Release Page Port (Write, research_required) | Approve/reject/feedback + branch swap; portal-owned FAH key; HMAC-proxy to admin for GH dispatch | WRITE-01..05 | Not started |
| 23 — Bug + Feature Customer Surface | `/bugs/*` and `/features/*` list/detail/new routes (two net-new primitives) | BUG-01..03, FEAT-01..03 | Not started |
| 24 — CI/CD Deploy Safety (research_required) | `verify-deploy-target`, per-repo deploy SAs, `assertEnv()`, `validate-apphosting.ts` | CI-01..04 | Not started |
| 25 — Cutover | Admin 301 → portal; customer email blast; Slack URL sweep; redirect telemetry; kill-switch | CUT-01..05 | Not started |
| 26 — Sunset (T+90) | Delete admin `/projects/[slug]/*` + dead hostname guards; admin v3.0.0 bump (deferred) | SUN-01..03 | Not started |

**Requirements:** 47 total, all mapped (100% coverage, no orphans)
**Status:** Ready to execute

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

Last session: 2026-05-08T22:35:00.000Z
Stopped at: Completed 22-release-page-port-write 22-03-PLAN.md (PRs open, awaiting Mike's review)
Resume file: None
Next action: Execute 22-04 (Portal Slack notifications + un-stub ReleasesClient + BranchPreviewClient handlers) once 22-03 PRs merged and portal-dev redeploys
