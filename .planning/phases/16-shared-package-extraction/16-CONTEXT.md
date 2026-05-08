# Phase 16: Shared Package Extraction - Context

**Gathered:** 2026-05-08
**Status:** Ready for planning
**Type:** Infrastructure + targeted refactor (auto-skip discuss per autonomous workflow heuristic + research SUMMARY pre-decided cross-cuts)

<domain>
## Phase Boundary

Extract Drizzle schema + 3 helpers (`auth-context`, `sanitize-commit`, `slack-status`) from admin's `src/db/` and `src/lib/` into a new private GitHub Packages npm module `@myalterlego/triarch-shared@0.1.0`. Admin re-exports from the package via shim files (no functional change to admin; all 324+ Vitest tests stay GREEN; admin bumps to v2.9.0). Set up publish-on-tag workflow (`shared/v*`) and CI gate that rejects admin PRs touching `packages/triarch-shared/schema.ts` without bumping the package version.

Delivers PKG-01..PKG-04 from REQUIREMENTS.md.

</domain>

<decisions>
## Implementation Decisions

(Cross-cutting decisions are pre-decided in research SUMMARY.md and roadmap.)

### Locked Decisions (from research/SUMMARY.md + ARCHITECTURE.md)

- Package name: `@myalterlego/triarch-shared` (matches scope: schema + helpers, not just schema)
- Package location: `packages/triarch-shared/` inside admin repo (NOT a separate repo; matches @myalterlego/shared-ui precedent of monorepo-flavored sub-package)
- Initial version: `0.1.0`
- Publish trigger: git tag matching `shared/v*` — separate workflow file `.github/workflows/publish-shared.yml`
- Helpers to extract (Phase 16 scope, MINIMAL): `auth-context.ts`, `sanitize-commit.ts`, `slack-status.ts`. NOT extracting `fah-rollout.ts` (admin-specific until portal needs branch swap in Phase 22) or `pipeline-summary.ts` (admin-only consumer)
- Schema is the largest extracted artifact — `src/db/schema.ts` becomes `packages/triarch-shared/src/schema.ts`. Drizzle relations() can stay together with table defs.
- Admin shim pattern: `src/db/schema.ts` becomes a 1-line re-export `export * from '@myalterlego/triarch-shared/schema'`; same for the 3 helpers
- Migration ownership: admin keeps `drizzle-kit push` script; portal (Phase 19) gets DML-only DB role and no `db:push` script. This phase doesn't touch portal.
- CI version-drift gate: GitHub Actions step that diffs `packages/triarch-shared/package.json` version against the latest `shared/v*` tag — if `packages/triarch-shared/schema.ts` is in the diff but version unchanged, fail
- Admin version bump: 2.8.1 → 2.9.0 (minor, not patch, because the schema location moves and that's a meaningful internal restructure)

### Claude's Discretion
- File splitting within the package (one big index.ts vs scoped exports — Claude picks based on existing admin structure)
- Whether to also extract `db.ts` (the pg.Pool factory) — Claude decides based on portal needs (likely YES, since portal Phase 19 also needs pg.Pool)
- TypeScript config strategy (tsconfig.json composite mode vs simple `tsc --build`) — Claude picks
- Workspace tooling: NO npm workspaces, NO pnpm, NO turborepo — keep it simple, the package is a sibling to admin's src/ tree, builds independently

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- Existing pattern: `@myalterlego/shared-ui` already published from a sibling repo using GitHub Packages — its publish workflow can be the template
- Existing `.npmrc` in admin reads `${NODE_AUTH_TOKEN}` for GitHub Packages auth — same pattern works for the new package
- Existing `.github/workflows/ci-cd.yml` in admin uses `NODE_AUTH_TOKEN` already (for the existing shared-ui dep) — no new secret needed
- Drizzle schema in admin/src/db/schema.ts: ~370 lines, all tables + relations + indexes
- 3 helper files: `src/lib/auth-context.ts` (~50 lines), `src/lib/sanitize-commit.ts` (~80 lines), `src/lib/slack-status.ts` (~60 lines)
- Vitest 4.x suite with @/ alias — the alias may need updating after re-export shims land

### Established Patterns
- Workspace projects use `transpilePackages` in `next.config.ts` for shared-ui → same approach for `@myalterlego/triarch-shared`
- Tag-on-main publish is the convention (not branch-based)

### Integration Points
- Modified: `src/db/schema.ts` (becomes a re-export shim)
- Modified: `src/lib/auth-context.ts`, `src/lib/sanitize-commit.ts`, `src/lib/slack-status.ts` (re-export shims)
- Modified: `package.json` (admin) — adds `@myalterlego/triarch-shared` dep, bumps version 2.8.1 → 2.9.0
- Modified: `next.config.ts` — adds package to `transpilePackages`
- New: `packages/triarch-shared/` (full npm package: package.json, tsconfig.json, src/*.ts)
- New: `.github/workflows/publish-shared.yml` — triggers on `shared/v*` tag
- New: `.github/workflows/check-shared-version.yml` (or step in ci-cd.yml) — schema-drift gate

</code_context>

<specifics>
## Specific Ideas

- Publish workflow uses `NODE_AUTH_TOKEN` from secrets; tags `shared/v0.1.0` triggers the publish
- The package's `package.json` declares `"name": "@myalterlego/triarch-shared"`, `"main": "./dist/index.js"`, `"types": "./dist/index.d.ts"`, `"files": ["dist"]`
- Build command: `tsc --build` produces `dist/` (gitignored)
- Subpath exports: `@myalterlego/triarch-shared/schema`, `@myalterlego/triarch-shared/auth`, `@myalterlego/triarch-shared/slack` — let admin import what it needs, avoid bundling all of schema when only auth-context is needed
- After this phase: portal Phase 18+ will install the same package from GitHub Packages
- `db.ts` extraction: include in initial 0.1.0 since portal Phase 19 needs pg.Pool too. Admin's existing `src/lib/db.ts` becomes a re-export shim.
- Test infra: package's own tests stay separate from admin's vitest config (the package can include test files but they're optional; admin's tests against re-exports prove behavior)

</specifics>

<deferred>
## Deferred Ideas

- Extracting `fah-rollout.ts` to shared package → Phase 22 (portal write surface needs it then)
- Extracting `pipeline-summary.ts` → Phase 21 (portal release page port consumes it; can extract or duplicate at that point)
- TypeScript project references / composite mode → only if the simple build approach causes friction
- Schema migrations as a separate sub-package → not needed; admin's `src/db/migrations/` stays with admin (matches "admin is migration authority" decision)

</deferred>
