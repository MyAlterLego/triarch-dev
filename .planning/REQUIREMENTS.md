# Requirements: v2.2 Customer Portal Split

**Defined:** 2026-05-08
**Core Value:** One control plane to create, manage, and ship Triarch projects — including a dev-to-prod gating workflow that lets customers approve releases before they go live.
**Milestone Goal:** Fork the customer-facing surface out of `admin.triarch.dev` into its own Next.js app at `portal.triarch.dev`. Mirror the existing `triarchsecurity-admin` (staff) / `triarchsecurity-portal` (customer) precedent. Customers stop logging into a domain literally named "admin"; staff stop sharing host + cookies + blast radius with customers.

## v2.2 Requirements

Requirements for the milestone. Each maps to exactly one phase via the Traceability section.

### Operational Foundation

Repository, DNS, OAuth, and FAH backend prerequisites that must exist before app code ships.

- [x] **OPS-01**: New repository `MyAlterLego/triarch-portal` exists with admin-equivalent CI/CD scaffolding (`.github/workflows/ci-cd.yml` calling shared-workflows@v4)
- [x] **OPS-02**: Two new Firebase App Hosting backends in project `triarch-dev-website`: `portal-prod` (custom domain `portal.triarch.dev`) and `portal-dev` (auto domain `portal-dev.triarch.dev`)
- [x] **OPS-03**: GoDaddy DNS records for `portal.triarch.dev` (A/CNAME pointing at FAH backend) verified resolving + 200-OK landing page
- [ ] **OPS-04** (DEFERRED — see 15-05-SUMMARY.md): Google OAuth client `Triarch Dev` updated with second authorized redirect URI `https://portal.triarch.dev/api/auth/callback/google` and localhost dev URI `http://localhost:3002/api/auth/callback/google`
- [x] **OPS-05**: GCP secrets `PORTAL_NEXTAUTH_SECRET` (random 32-byte) created in `triarch-vault` with secretAccessor binding for both `portal-prod` and `portal-dev` runtime SAs

### Shared Package

The Drizzle schema + select helpers extracted into a private GitHub Packages npm module that both apps consume.

- [x] **PKG-01**: `packages/triarch-shared/` directory in admin repo containing schema.ts, auth-context.ts, sanitize-commit.ts, slack-status.ts with publish workflow on tag `shared/v*`
- [x] **PKG-02**: `@myalterlego/triarch-shared@0.1.0` published to GitHub Packages and verified installable via `npm install`
- [x] **PKG-03**: Admin repo refactored to re-export schema + helpers from `@myalterlego/triarch-shared` (bumps admin to v2.9.0, no functional change, all 324+ tests still GREEN)
- [x] **PKG-04**: CI gate prevents merging admin PRs that introduce schema changes without bumping the shared package version

### Hostname Guard Inventory

Catalog and harden the v2.1 hostname-aware routing before introducing a second valid host.

- [x] **HOST-01**: Inventory document at `.planning/host-guard-inventory.md` listing every `host ===` / `headers().get('host')` / `x-forwarded-host` reference in admin codebase (with file:line + current behavior)
- [x] **HOST-02**: Admin's `src/proxy.ts` (or `src/middleware.ts`) fails closed for hosts that are neither `admin.triarch.dev` nor `localhost:300x` — returns 404 instead of marketing fallback

### Portal Auth Scaffolding

NextAuth v4 setup with brand isolation, customer-only authorization, and staff "switch to admin" callout.

- [x] **AUTH-01**: Portal NextAuth v4 config with `__Host-` cookie prefix in production, NO `domain` attribute set (host-only scope)
- [x] **AUTH-02**: Portal uses `PORTAL_NEXTAUTH_SECRET` (distinct from admin's `NEXTAUTH_SECRET`) so JWTs cannot be cross-replayed
- [x] **AUTH-03**: Portal `signIn` callback enforces customer-membership rule — rejects users with no `project_members` row; staff users are allowed in but flagged for the callout in AUTH-04
- [x] **AUTH-04**: Authenticated staff users see a persistent "Switch to admin.triarch.dev" callout banner; viewer/admin customer users do not see it
- [x] **AUTH-05**: Vitest assertion that the portal `Set-Cookie` header for the session token contains `__Host-` prefix and lacks any `Domain=` attribute
- [x] **AUTH-06**: Vitest grep-test that no portal source file references the OAuth `sub` claim (everywhere keys on `email`)
- [x] **AUTH-07**: Login wall on portal `/` (unauthenticated → /login); post-login routing (0 memberships → empty state with "Contact your project admin" copy; 1 → auto-redirect to that project; 2+ → /projects list)

### Database Connectivity

Portal DB access with defense-in-depth schema-write protection.

- [x] **DB-01**: Portal `src/lib/db.ts` connects to the same CockroachDB cluster + database via `pg.Pool`; reuses `DATABASE_URL` secret (or `DATABASE_URL_DEV` for dev backend)
- [x] **DB-02**: New CockroachDB user `portal_runtime` with GRANT SELECT/INSERT/UPDATE/DELETE on the v2.2 tables (no DDL grants); portal connects with this role; admin retains its current admin role
- [x] **DB-03**: Portal `package.json` does NOT include `db:push` or `db:generate` scripts (Drizzle is read-only-from-portal's-perspective); admin remains sole migration authority
- [x] **DB-04**: Smoke test from portal: `ALTER TABLE projects ADD COLUMN test text` returns CockroachDB permission denied

### URL Centralization (Admin Refactor)

Refactor admin to construct customer-facing URLs through a single helper before portal ships.

- [x] **URL-01**: New `src/lib/urls.ts` in admin with helpers: `customerProjectUrl(slug)`, `customerReleaseUrl(slug)`, `customerBugUrl(slug, id)`, `customerFeatureUrl(slug, id)`, all reading `PORTAL_BASE_URL` env (default `https://portal.triarch.dev`)
- [x] **URL-02**: All admin Slack message builders, OttoBot Block Kit constructors, GitHub release-note templates, and email templates refactored to call `urls.ts` helpers
- [x] **URL-03**: ESLint rule (`no-restricted-syntax`) blocks raw `https://admin.triarch.dev/projects/` literals outside `src/lib/urls.ts` — CI fails on violation

### Release Page Port (Read Surface)

Lift-and-shift the v2.1 customer release page to portal as read-first; mutations land in PORTAL-WRITE phase.

- [x] **PORTAL-01**: Portal route `/projects/[slug]/releases` renders the existing release page with FilterChips, WhatsComingCard, BranchSection, ReleasesClient, lifecycle timeline — visually identical to admin
- [x] **PORTAL-02**: Portal route `/projects` renders project tile list (membership-filtered) using shared `getProjectPipelineSummaries()` helper from the shared package
- [x] **PORTAL-03**: Non-member access to `/projects/[slug]/*` returns 404 (NOT 403) — no membership-existence leak
- [x] **PORTAL-04**: Portal pages render with mobile-responsive layout for read paths (release list, bug list, feature list, project list); approve/branch-swap controls remain desktop-optimized

### Release Page Port (Write Surface)

Customer write paths: approve, reject, feedback, branch preview swap, plus Slack/GitHub integration.

- [x] **WRITE-01**: Portal API routes `POST /api/projects/[slug]/releases/[releaseId]/approve` and `/reject` and `/feedback` (and DELETE feedback) call the same `promoteAndAudit` flow + write `release_approvals.actor_source='portal'`
- [x] **WRITE-02**: Portal API route `POST /api/projects/[slug]/branch/preview` and `GET /status` mirror the v2.1 admin endpoints (atomic lock, branch regex guard, 8-min timeout, branch-guarded auto-clear)
- [x] **WRITE-03**: Portal binding for `FAH_PROMOTER_SA_KEY` secret in its apphosting.yaml; FAH compute SA + service-agent IAM bindings on the secret (matches admin's pattern)
- [x] **WRITE-04**: Portal posts customer-side Slack notifications via `PORTAL_SLACK_BOT_TOKEN` directly; for GitHub workflow dispatch (promote-branch.yml), portal calls admin via internal HMAC-signed POST `/api/internal/dispatch` (admin retains GitHub App key custody)
- [x] **WRITE-05**: Two-step approve UX, conflict badge, branch lock disable propagation — all preserved from v2.1

### Bug + Feature Customer Surface

Customer-readable views + customer-facing submission forms (the two net-new primitives).

- [ ] **BUG-01**: Portal route `/projects/[slug]/bugs` renders membership-scoped bug list (each project's bugs only); supports the existing status pills + filter UI
- [ ] **BUG-02**: Portal route `/projects/[slug]/bugs/[id]` renders bug detail with `ReleasedInSidebar` reused from admin (read-only customer view; NO staff edit controls)
- [ ] **BUG-03**: Portal route `/projects/[slug]/bugs/new` provides customer submission form (title, description, severity, reproduction steps); POST creates bug_reports row with reporter_email = session email + project_key from URL
- [ ] **FEAT-01**: Portal route `/projects/[slug]/features` renders membership-scoped feature list with status pills
- [ ] **FEAT-02**: Portal route `/projects/[slug]/features/[id]` renders feature detail with `ReleasedInSidebar` (read-only customer view)
- [ ] **FEAT-03**: Portal route `/projects/[slug]/features/new` provides customer submission form (title, description); POST creates feature_requests row with reporter_email + project_key

### CI/CD + Deploy Safety

verify-deploy-target + apphosting validation prevent catastrophic cross-app deploys.

- [ ] **CI-01**: Shared-workflows `verify-deploy-target` job committed to `MyAlterLego/shared-workflows` (or admin's per-repo equivalent if v4 immutable) — fails if `${{ github.repository }}` doesn't match expected `firebase_project_id` per a committed lookup table
- [ ] **CI-02**: Per-repo deploy SAs — portal has its own `portal-deployer@triarch-vault.iam.gserviceaccount.com` distinct from admin's deploy SA
- [ ] **CI-03**: Boot-time `assertEnv()` in portal validates required env vars present; missing var fails container start with clear error
- [ ] **CI-04**: CI step `validate-apphosting.ts` reads apphosting.yaml + apphosting.dev.yaml against an env-name TypeScript schema — fails build on missing/typo'd binding

### Cutover

Flip 301 redirects from admin to portal; communicate the URL change to customers.

- [ ] **CUT-01**: Admin middleware 301-redirects `/projects/[slug]/*` → `https://portal.triarch.dev/projects/[slug]/*` (preserves path + query)
- [ ] **CUT-02**: Email blast to all `project_members` rows with `role IN ('admin','viewer')` notifying URL change + 90-day grace + new login URL
- [ ] **CUT-03**: Slack message URL update sweep on last 30 days of `slack_action_audit` — recreate any active threads with portal URLs
- [ ] **CUT-04**: Telemetry on admin's redirect middleware emits `redirect_hits` metric (count + path) for monitoring decay
- [ ] **CUT-05**: Kill-switch env var `PORTAL_REDIRECT_DISABLED` in admin allows reverting to in-place serving without a deploy if portal regresses

### Sunset

Final cleanup at T+90 — delete deprecated routes and dead hostname-guard branches.

- [ ] **SUN-01**: Admin `/projects/[slug]/*` routes deleted (server components + API routes that customers used)
- [ ] **SUN-02**: v2.1 hostname-aware route guards in admin (`page.tsx`, `admin/layout.tsx`, `projects/layout.tsx`, `login/layout.tsx`) deleted — admin only serves admin host now
- [ ] **SUN-03**: Admin v3.0.0 bump to mark major surface change

## v2.3+ Requirements

Deferred to future release. Tracked but not in current roadmap.

### Customer Polish

- **POLISH-01**: Email digest of pending approvals (per-customer-admin daily summary)
- **POLISH-02**: Customer-admin self-serve teammate invite (currently staff-only)
- **POLISH-03**: Bug Q&A / comment thread for back-and-forth between customer and Triarch staff
- **POLISH-04**: Approval delegation (customer admin → backup approver when out)
- **POLISH-05**: Magic-link auth alternative to Google OAuth (for customers without Google Workspace)
- **POLISH-06**: Account settings page (email change, notification preferences)
- **POLISH-07**: File attachments on bug submission (S3-backed)
- **POLISH-08**: Bulk approve "approve all clean RCs"

### Truth+Treason Pilot Reactivation

- **PILOT-01**: Re-engage Truth+Treason as v2.3 milestone candidate after portal cutover stabilizes (was deferred from v2.0)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| White-label per-customer branding | Not justifiable at 1-customer scale; v3+ if multi-customer demand emerges |
| Email/password authentication + signup | Google OAuth is sufficient; email/password adds password-management surface area |
| PWA / offline / service worker | Customer app is desktop+mobile-web; offline use case unclear |
| Real-time websocket release updates | SWR 5s polling already covers it |
| Customer-facing marketing copy | Portal is gated; no public landing |
| Public docs / portal changelog | WhatsComingCard already shows what's coming; full changelog is overkill |
| Customer billing dashboard | Out of triarch-dev scope; finances/billing tooling lives elsewhere |
| Customer-facing roadmap board | WhatsComingCard already shows it |
| Voting / upvoting on feature requests | 1-customer scale; voting is meaningful at 10+ customers |
| Customer-supplied target dates on features | Feature prioritization is Triarch's role |
| Multi-customer "switch customer" dropdown | Customer admins only have one customer org; staff use admin.triarch.dev |
| Iframe embedding admin in portal or vice versa | Brand confusion + CSP frame-ancestors='none' enforced |
| Cross-origin asset embedding in customer emails | Email links only, never embeds |
| NextAuth v5 / @auth/core migration | v5 unstable; v4 is fine; defer until forced |
| Workspace tooling migration (pnpm/turbo) | Two repos + one shared npm package is sufficient; monorepo migration is yak-shaving |

## Traceability

Updated by roadmapper during phase mapping.

| Requirement | Phase | Status |
|-------------|-------|--------|
| OPS-01 | Phase 15 | Complete |
| OPS-02 | Phase 15 | Complete |
| OPS-03 | Phase 15 | Complete |
| OPS-04 | Phase 15 | Pending |
| OPS-05 | Phase 15 | Complete |
| PKG-01 | Phase 16 | Complete |
| PKG-02 | Phase 16 | Complete |
| PKG-03 | Phase 16 | Complete |
| PKG-04 | Phase 16 | Complete |
| HOST-01 | Phase 17 | Complete |
| HOST-02 | Phase 17 | Complete |
| AUTH-01 | Phase 18 | Complete |
| AUTH-02 | Phase 18 | Complete |
| AUTH-03 | Phase 18 | Complete |
| AUTH-04 | Phase 18 | Complete |
| AUTH-05 | Phase 18 | Complete |
| AUTH-06 | Phase 18 | Complete |
| AUTH-07 | Phase 18 | Complete |
| DB-01 | Phase 19 | Complete |
| DB-02 | Phase 19 | Complete |
| DB-03 | Phase 19 | Complete |
| DB-04 | Phase 19 | Complete |
| URL-01 | Phase 20 | Complete |
| URL-02 | Phase 20 | Complete |
| URL-03 | Phase 20 | Complete |
| PORTAL-01 | Phase 21 | Complete |
| PORTAL-02 | Phase 21 | Complete |
| PORTAL-03 | Phase 21 | Complete |
| PORTAL-04 | Phase 21 | Complete |
| WRITE-01 | Phase 22 | Complete |
| WRITE-02 | Phase 22 | Complete |
| WRITE-03 | Phase 22 | Complete |
| WRITE-04 | Phase 22 | Complete |
| WRITE-05 | Phase 22 | Complete |
| BUG-01 | Phase 23 | Pending |
| BUG-02 | Phase 23 | Pending |
| BUG-03 | Phase 23 | Pending |
| FEAT-01 | Phase 23 | Pending |
| FEAT-02 | Phase 23 | Pending |
| FEAT-03 | Phase 23 | Pending |
| CI-01 | Phase 24 | Pending |
| CI-02 | Phase 24 | Pending |
| CI-03 | Phase 24 | Pending |
| CI-04 | Phase 24 | Pending |
| CUT-01 | Phase 25 | Pending |
| CUT-02 | Phase 25 | Pending |
| CUT-03 | Phase 25 | Pending |
| CUT-04 | Phase 25 | Pending |
| CUT-05 | Phase 25 | Pending |
| SUN-01 | Phase 26 | Pending |
| SUN-02 | Phase 26 | Pending |
| SUN-03 | Phase 26 | Pending |

**Coverage:**
- v2.2 requirements: 47 total
- Mapped to phases: 47 (100%)
- Unmapped: 0

---
*Requirements defined: 2026-05-08*
*Last updated: 2026-05-08 — phase traceability mapped by roadmapper*
