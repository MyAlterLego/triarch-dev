# Phase 29: CL-2 EnvBadge Component - Context

**Gathered:** 2026-05-16
**Status:** Ready for planning
**Source:** Direct recon (per /gsd:autonomous scoping; security-admin/portal mounts explicitly deferred to Phase 33/34 per ROADMAP update)

<domain>
## Phase Boundary

Build a persistent `<EnvBadge env={NEXT_PUBLIC_ENV}/>` component in `@triarchsecurity/shared-ui` v1.5.0 that renders a visible "DEV" pill in dev chrome and emits `data-env="dev"` for the future compliance scan (Phase 35) to assert. Mount in 5 of 7 consumer projects' root layouts. Set `NEXT_PUBLIC_ENV=dev` in each consumer's `apphosting.dev.yaml`.

Scope spans 2 repos for Phase 29:
1. `triarchsecurity/shared-ui` (cloned at `/Users/mikegeehan/claude/triarch/shared/shared-ui`) — build EnvBadge, add tests, bump to v1.5.0
2. `triarchsecurity/platform` (current repo) — mount EnvBadge in root layout, set NEXT_PUBLIC_ENV in apphosting yamls

Plus 4 cross-repo PRs (read + 1-line edit each):
- `triarchsecurity/dev-portal` (clean main, ignore stale fix/deploy-skip-bug branch)
- `triarchsecurity/darksouls` (same)
- `triarchsecurity/tmi` (same)
- `triarchsecurity/truthtreason` (clean dev branch)

Out of scope:
- security-admin mount (deferred to Phase 33 — needs dev path created)
- security-portal mount (deferred to Phase 34 — needs dev path created)
- Publishing the npm package (CI step on tag push, human action)
- Cleaning up stale `fix/deploy-skip-bug` branches in dev-portal/darksouls/tmi (incidental, not blocking — those branches were abandoned backports of platform v2.13.5 that never merged)

</domain>

<decisions>
## Implementation Decisions

### EnvBadge Component (in shared-ui)
- File: `src/components/EnvBadge.tsx` (sibling to existing `SkeletonLoader`, `EmptyState`, etc.)
- Props: `{ env?: string }` — accepts the value of `NEXT_PUBLIC_ENV` (or any string)
- Render rule: Only renders when env in `('dev', 'staging')` (case-insensitive). Returns null otherwise — invisible in prod chrome.
- Visual: Fixed-position pill in bottom-right corner. Background contrasting color (e.g., yellow for dev, orange for staging) — non-disruptive to existing layout. z-index high enough to overlay app content but below modal overlays.
- Accessibility: `aria-label="Environment: dev"`, `role="status"`
- HTML data attribute: `data-env="dev"` (or `data-env="staging"`) — required by CL2-02 for compliance scan HTML parse
- No animation, no dismissable behavior — persistent display
- Use existing shared-ui theme tokens if available, otherwise inline minimal CSS-in-JS (match existing component style)
- TypeScript strict; React 18+ (matches existing components)

### Tests
- File: `__tests__/EnvBadge.test.tsx` (matches existing test layout)
- Use existing test setup (vitest 4.x per repo)
- Scenarios:
  1. env=undefined → returns null
  2. env="prod" → returns null
  3. env="dev" → renders pill with text "DEV" and data-env="dev"
  4. env="DEV" (uppercase) → renders (case-insensitive)
  5. env="staging" → renders pill with text "STAGING" and data-env="staging"
  6. env="anything-else" → returns null

### shared-ui Release
- Version bump: 1.4.0 → 1.5.0 (minor — new feature, additive export)
- Commit format on shared-ui repo: `v1.5.0: feat: EnvBadge component for CL-2 dev chrome marker`
- Add EnvBadge to `src/index.ts` exports
- Build: `tsup` (per existing tsup.config.ts) — run once locally to verify dist/ regenerates cleanly
- Branch: `feat/v1.5.0-envbadge` in shared-ui
- DO NOT push, DO NOT tag — human steps (per workspace CLAUDE.md)

### Consumer Mounts (5 repos)
For each of: platform, dev-portal, darksouls, tmi, truthtreason

**Base branch strategy:**
- platform: branch off CURRENT branch (likely `dev` or `feat/cl4-self-adopt-gate`) — caller decides
- dev-portal, darksouls, tmi: branch off `main` (ignore stale `fix/deploy-skip-bug`)
- truthtreason: branch off `dev` (clean)

**Edits per consumer:**
1. `package.json`: bump `@triarchsecurity/shared-ui` from current version to `^1.5.0`. Also bump that repo's own version (patch — e.g., `vX.Y.Z` per repo convention).
2. `src/app/layout.tsx`: import `EnvBadge` from `@triarchsecurity/shared-ui`; mount inside `<body>` (likely last child, before any provider unwinds) as: `<EnvBadge env={process.env.NEXT_PUBLIC_ENV} />`
3. `apphosting.dev.yaml`: add (or merge into existing `env:` block) entry `- variable: NEXT_PUBLIC_ENV` with `value: dev`, `availability: [BUILD, RUNTIME]`
4. `apphosting.yaml`: do NOT add NEXT_PUBLIC_ENV (absence = prod by default, per CL-2 contract). If it accidentally exists with a non-prod value, remove or set to `prod`.

**Commit per consumer (single commit covering all 4 edits):**
- Format: `vX.Y.Z: feat(cl-2): mount <EnvBadge/> in root layout; set NEXT_PUBLIC_ENV=dev`

**No push, no PR** — local commits only on feature branches. Human handles push/PR/merge per workspace CLAUDE.md.

### Stale branch handling
- `fix/deploy-skip-bug` in dev-portal/darksouls/tmi: leave unmodified. Phase 29 work starts from `main` instead. Branch cleanup is incidental — flag in 29-HUMAN-UAT for the user to `git branch -d` after Phase 29 merges.

### Per-repo version conventions (per workspace CLAUDE.md)
- platform: `package.json` semver
- dev-portal: `package.json` semver (current `v0.7.4`)
- darksouls: `package.json` semver (current `v7.7.12`)
- tmi: `package.json` semver (current `v4.44.3`)
- truthtreason: `package.json` semver (current `v1.1.18`)
- shared-ui: `package.json` semver (current `v1.4.0` → bump to `v1.5.0`)

### Claude's Discretion
- Exact CSS for the pill (color choice within "non-disruptive contrasting"; default to existing shared-ui design tokens if any)
- Exact mount position inside `<body>` (after main content vs before — both acceptable; planner will pick by reading each layout)
- Whether to expose any additional component props (e.g., `position`, `colorScheme`) beyond `env` — KISS: just `env` for v1.5.0

</decisions>

<canonical_refs>
## Canonical References

### shared-ui repo
- `/Users/mikegeehan/claude/triarch/shared/shared-ui/src/index.ts` — export pattern
- `/Users/mikegeehan/claude/triarch/shared/shared-ui/src/components/SkeletonLoader.tsx` — reference for component style
- `/Users/mikegeehan/claude/triarch/shared/shared-ui/__tests__/` — test layout
- `/Users/mikegeehan/claude/triarch/shared/shared-ui/tsup.config.ts` — build pipeline
- `/Users/mikegeehan/claude/triarch/shared/shared-ui/package.json` — version + dependencies + exports

### Consumer root layouts (all use Next.js 16+ App Router)
- `/Users/mikegeehan/claude/triarch/shared/platform/src/app/layout.tsx`
- `/Users/mikegeehan/claude/triarch/shared/dev-portal/src/app/layout.tsx`
- `/Users/mikegeehan/claude/triarch/shared/darksouls/src/app/layout.tsx`
- `/Users/mikegeehan/claude/triarch/shared/tmi/src/app/layout.tsx`
- `/Users/mikegeehan/claude/triarch/shared/truthtreason/src/app/layout.tsx`

### Consumer apphosting yamls
- Same pattern in each consumer: `apphosting.yaml` (prod) + `apphosting.dev.yaml` (dev)
- env declarations follow FAH format (see existing entries in platform's apphosting.dev.yaml for `CL6_ENFORCEMENT_MODE: warn` from Phase 27 as reference)

### Project conventions
- `~/claude/CLAUDE.md` — workspace rules (version bump, no remote push without approval)
- `./CLAUDE.md` (each consumer) — project-specific patterns

</canonical_refs>

<specifics>
## Specific Ideas

- Per the CL-2 contract in REQUIREMENTS.md line 254-260: badge is a customer-disambiguation tool. Visually obvious enough that a customer on `admin-dev.triarch.dev` can never confuse it with `admin.triarch.dev`.
- The `data-env="dev"` attribute is the SOLE mechanism the future Phase 35 compliance scan uses to verify presence — so it MUST be on a DOM element that fetches in the initial HTML (server-rendered). React Server Components are fine; client-only renders that lazy-load are NOT (would fail the curl-based compliance scan).
- For the apphosting env entry format, mirror this from CL6_ENFORCEMENT_MODE:
  ```yaml
  - variable: NEXT_PUBLIC_ENV
    value: dev
    availability:
      - BUILD
      - RUNTIME
  ```
  `BUILD` is required because `NEXT_PUBLIC_*` env vars are baked into the client bundle at build time.

</specifics>

<deferred>
## Deferred Ideas

- Dismissable badge (user clicks X to hide) — adds state management complexity; defer
- Color customization via prop — KISS for v1.5.0; can extend later if needed
- Multiple env states beyond dev/staging (e.g., 'preview' for PR-deploy previews) — Phase 29 covers contract requirement only
- Mount in security-admin (Phase 33) and security-portal (Phase 34) — explicitly deferred
- Automated cleanup of stale `fix/deploy-skip-bug` branches — flagged in 29-HUMAN-UAT for manual cleanup
- shared-ui npm publish step (CI on tag push) — human action

</deferred>
