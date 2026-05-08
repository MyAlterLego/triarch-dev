# Phase 18: Portal Auth Scaffolding - Context

**Gathered:** 2026-05-08
**Status:** Ready for planning
**Type:** Mixed — scaffold Next.js portal app + add NextAuth (cross-cutting decisions pre-decided in research/SUMMARY.md)

<domain>
## Phase Boundary

Scaffold the portal Next.js app at `~/claude/triarch/development/portal/` (currently empty except README + LICENSE) and wire NextAuth v4 with brand-isolated cookies. Customer-only sign-in flow rejecting non-members; staff users see a "Switch to admin.triarch.dev" callout (NOT 401); customer-friendly post-login routing (0 memberships → empty state, 1 → auto-redirect, 2+ → /projects list). All test guards in place (Vitest cookie assertion, grep-test against `sub` claim usage). The first deployable portal commit lands here — `portal-prod` and `portal-dev` FAH backends from Phase 15 will start serving real code after this phase.

Delivers AUTH-01..AUTH-07 from REQUIREMENTS.md (7 reqs).

⚠ **Live OAuth verification deferred** to HUMAN-UAT — Mike still owes OPS-04 (Console add for OAuth redirect URIs). Code lands now; end-to-end sign-in test gated on Mike's Console action.

</domain>

<decisions>
## Implementation Decisions

(All cross-cutting decisions pre-decided in research/SUMMARY.md, ARCHITECTURE.md, and PITFALLS.md.)

### Locked Decisions

**Stack (1:1 with admin):**
- Next.js 16.2.2, React 19.2.4, Tailwind v4, Drizzle (consumed via `@myalterlego/triarch-shared@^0.1.0`), `next-auth@^4.24.13`, `@myalterlego/secrets@^0.1.0`, `@myalterlego/shared-ui@^1.2.0`, `swr@^2.4.1`, `vitest@4.x` + RTL + jsdom
- Same `pg` version, `lucide-react` version
- TypeScript strict mode, `@/` path alias matching admin

**Auth surface:**
- `next-auth` with Google OAuth provider only (no magic link in v2.2)
- JWT session strategy (session.callback)
- `signIn` callback enforces customer-membership rule: query `project_members` (via shared package) for the email; reject (return false) if no membership; staff users (role='staff' wildcard) are ALLOWED in but flagged via session field for the callout in Phase 18 AUTH-04
- Cookie config: NO `domain` attribute set (host-only); production uses `__Host-` prefix on session token cookie; localhost dev uses `__Secure-` prefix or no prefix per NextAuth v4 defaults
- Distinct `PORTAL_NEXTAUTH_SECRET` binding (already created Phase 15-03; portal apphosting.yaml binds it as `NEXTAUTH_SECRET` env var)
- OAuth client: SAME Google client as admin (already has portal redirect URIs added once OPS-04 lands)
- Email is the canonical user identifier — never key on `sub` claim. Add a Vitest grep-test that fails if any portal source file references `.sub`.

**Post-login routing (AUTH-07):**
- After successful auth, redirect logic:
  - 0 memberships → `/no-memberships` empty-state page with "Contact your project admin" copy + admin email link
  - 1 membership → auto-redirect to that project's `/projects/[slug]/releases`
  - 2+ memberships → `/projects` list page (server component using `getProjectPipelineSummaries()` from shared package)
- Staff users (wildcard `role='staff'`) authenticated on portal: pass through, but session.user.isStaff=true triggers the "Switch to admin" callout banner (visible site-wide via portal layout)

**Project setup:**
- Working directory: `~/claude/triarch/development/portal/`
- `git remote -v` already points to `https://github.com/MyAlterLego/triarch-portal.git`
- Initial bootstrap: `next@latest` scaffold via `create-next-app` OR copy admin's structure piece-by-piece (faster, more controlled)
- Recommendation: copy admin's structure manually (next.config.ts, tsconfig.json, tailwind.config.ts, postcss.config.mjs, .npmrc, src/app/layout.tsx skeleton) and adapt for portal
- `package.json` for portal: name `triarch-portal`, version `0.1.0`, scripts mirror admin (dev/build/start/lint/test) BUT NO `db:push` or `db:generate` (portal is read-only schema consumer per Phase 19)
- Portal `.npmrc` mirrors admin's GitHub Packages auth pattern
- Portal apphosting.yaml mirrors admin's structure but with PORTAL secrets:
  - `NEXTAUTH_URL: https://portal.triarch.dev` (RUNTIME)
  - `NEXTAUTH_SECRET: PORTAL_NEXTAUTH_SECRET` (binding)
  - `GOOGLE_CLIENT_ID: GOOGLE_CLIENT_ID` (same client as admin)
  - `GOOGLE_CLIENT_SECRET: GOOGLE_CLIENT_SECRET`
  - `DATABASE_URL: DATABASE_URL` (same DB as admin for now; Phase 19 swaps in `portal_runtime` DML-only role)
  - `NODE_AUTH_TOKEN: GITHUB_PACKAGES_TOKEN` (BUILD-only)
- Portal apphosting.dev.yaml overlay for `portal-dev` backend

**CI/CD:**
- New repo → new `.github/workflows/ci-cd.yml` calling shared-workflows@v4 (verify quality-gate.yml + deploy-firebase.yml work for portal)
- Per-repo deploy SAs deferred to Phase 24 (CI/CD Deploy Safety) — for now use admin's deploy SA pattern
- shared-workflows lockfile parity: portal must commit `package-lock.json` generated under Node 22 / npm 10 (lessons from admin's runbook)

**Testing:**
- Vitest config mirrors admin's
- 1 cookie test: assert portal `Set-Cookie` header has `__Host-` prefix in production mode and lacks `Domain=` attribute
- 1 grep test: `grep -r "\.sub" src/ -- 2>&1 | wc -l` returns 0 (no source file references `.sub` claim — keys on `email` everywhere)
- Initial test count: portal will have ~5-10 tests for AUTH paths + 2 for the cookie/sub guards

### Claude's Discretion
- Portal layout aesthetics — `@myalterlego/shared-ui` provides primitives; brand differentiation through copy, header, and color accents (admin uses violet/blue gradients; portal can use a different gradient like teal/blue or amber/violet — Claude picks)
- Whether to scaffold via `create-next-app` (cleaner template) or copy admin (faster wiring) — Claude picks
- The "Switch to admin" callout: persistent dismissible banner OR sticky header alert — Claude picks (probably banner)
- The "no memberships" empty-state copy — Claude writes it, Mike can adjust later
- Whether to bundle a quick smoke test for the post-login routing logic — Claude picks (recommended yes)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets (FROM ADMIN — to be replicated/adapted in portal)
- `admin/src/lib/auth.ts` — NextAuth config baseline; portal version differs in cookie config + signIn callback
- `admin/src/app/login/page.tsx` — login page UI; portal can reuse with brand swap
- `admin/next.config.ts` — needs `transpilePackages: ['@myalterlego/triarch-shared', '@myalterlego/shared-ui']`
- `admin/.npmrc` — GitHub Packages auth pattern (`@myalterlego:registry=https://npm.pkg.github.com`)
- `admin/apphosting.yaml` and `apphosting.dev.yaml` — overlay pattern, env binding patterns
- `admin/.github/workflows/ci-cd.yml` — calls shared-workflows@v4 quality-gate + deploy-firebase + notify
- `admin/CLAUDE.md` — admin-specific conventions (some applicable to portal, some admin-only)
- `@myalterlego/triarch-shared/auth` — exports `getCurrentUserContext({ user: { email } })` used in signIn callback

### Established Patterns (FROM ADMIN — must follow)
- Hostname-aware route guards: NOT applicable to portal (it's customer-only, single host) — but proxy.ts can still fail-closed for unknown hosts (mirror Phase 17 pattern)
- `apphosting.yaml` env bindings — every secret declared with `secret:` ref + secretAccessor IAM
- Vitest co-located test pattern (`*.test.ts` next to source)
- Drizzle queries use `eq`, `and`, `inArray` from drizzle-orm/expressions

### Integration Points
- New repo: `MyAlterLego/triarch-portal` (already exists; empty)
- New scaffold: `~/claude/triarch/development/portal/{src/, package.json, next.config.ts, ...}`
- Consumes: `@myalterlego/triarch-shared@^0.1.0` for schema + auth-context
- DB: same `triarch_dev` cluster as admin; DATABASE_URL shared via Firebase secret in same project
- Firebase: portal-prod backend deploys this code on push to main; portal-dev on push to dev
- DNS: portal.triarch.dev (Phase 15-02) custom domain on portal-prod
- Secret: PORTAL_NEXTAUTH_SECRET (Phase 15-03) bound to NEXTAUTH_SECRET env var

</code_context>

<specifics>
## Specific Ideas

- Portal's `package.json` "name": "triarch-portal", "version": "0.1.0", "private": true
- Portal's first commit lands the entire scaffold — package-lock.json generated under Node 22 / npm 10
- The `signIn` callback returns the boolean (false rejects, true allows); the staff/customer distinction goes into a session.user enrichment in the `jwt` callback or `session` callback so the layout can read it
- The "Switch to admin" callout: amber pill banner at top of portal layout, dismissible per-session, includes a link to `https://admin.triarch.dev/admin`
- Post-login routing implemented in a server action or `app/page.tsx` server component that uses `getCurrentUserContext` + `project_members` count to decide
- Portal's deploy: first push to main triggers a real deploy (admin already pushed v2.9.1 to deploy on its own; portal's deploy is independent)
- The Vitest grep-test against `.sub`: `import { execSync } from 'child_process'; expect(execSync('grep -r "\\.sub" src/ || true').toString()).not.toMatch(/\.sub/)`
- Portal might need its own `assertEnv()` boot guard listing required env vars (PORTAL_NEXTAUTH_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, DATABASE_URL, NODE_AUTH_TOKEN) — that's a Phase 24 deliverable but a minimal version can land here
- Phase 19 (DB Connectivity) + Phase 18 (Auth) don't strictly need to be sequential — but DB lookup IS used inside the signIn callback. Plan's call: either (a) Phase 18 stubs the membership lookup behind a boolean flag and Phase 19 wires real DB, or (b) Phase 18 just imports from `@myalterlego/triarch-shared/db` and queries directly. Recommend (b) since shared package already has db.ts. Phase 19's "DML-only role" is an IAM hardening on top, not a code change in portal.

</specifics>

<deferred>
## Deferred Ideas

- Per-repo deploy SAs (admin's pattern reused for portal in Phase 24)
- `assertEnv()` formal schema → Phase 24 (CI/CD Deploy Safety)
- portal_runtime DML-only DB role → Phase 19 (DB Connectivity) — Phase 18 uses admin's role temporarily
- Production-grade portal layout polish, gradient accents, branding refinement → can land here as best-effort, but iterate in Phase 21 (release page port) when full design lands
- Magic-link auth alternative to Google OAuth → v3 (in REQUIREMENTS.md POLISH-05)
- File attachments, account settings, teammate invite — all v2.3+ POLISH-* features

</deferred>
