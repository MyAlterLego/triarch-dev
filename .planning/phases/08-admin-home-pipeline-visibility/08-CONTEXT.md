# Phase 8: Admin Home Pipeline Visibility - Context

**Gathered:** 2026-05-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace the existing `/admin` home Project Health tile (single `currentVersion` column + bug/feature counts) with a pipeline-aware tile that surfaces prod/dev versions side-by-side, pending-approval count, last-deploy timestamps per environment, and a what-changed one-liner. Whole tile becomes a clickable navigation surface to the customer release page. Bug/feature counts and project status remain visible — this phase ADDS pipeline info, doesn't replace existing summary data.

**Delivers:** PIPE-01, PIPE-02, PIPE-03, PIPE-04, PIPE-06.
**Does NOT deliver:** per-project pipeline page (Phase 9), Promote button (Phase 9), branch swap UI (Phase 13), filter chips (Phase 14).

</domain>

<decisions>
## Implementation Decisions

### Tile Layout & Density
- Prod/dev versions render as **two stacked rows** with prod on top, dev below; format `prod v2.3.5 · 3d ago` / `dev v2.4.1 · 12m ago`; mono font on the version string; relative timestamp via existing `formatRelativeTime` helper from `/projects/[slug]/releases/format.ts`
- Pending-approval badge sits in the **top-right corner of the tile** as a small amber pill ("3 pending") using existing amber color tokens (matches `pendingFeatures` styling); absent (not "0") when none pending
- When a project has no dev deploy yet, the dev row shows **`dev: —`** in muted zinc-600 (mirrors existing `version || '—'` pattern in current tile)
- Last-deploy timestamps are **relative** ("12m ago" / "3d ago"), reuse existing helper, no absolute date

### What-Changed One-Liner
- One-liner sits on the **bottom row of the tile**, below versions, styled `text-xs text-zinc-500` (smallest visual priority)
- Format when dev has changes ahead of prod: **"N entries since prod: A fixes, B features, C other"** — count + per-type breakdown; "fix"/"feature"/"other" derived from `release_logs.entries[]` per-entry `type` if present, otherwise "other" bucket
- When dev = prod (no delta), **hide the row entirely** — no "in sync" text
- When dev is BEHIND prod (rare, post-prod-deploy state before next dev push), show **"dev behind prod"** in zinc-500 muted color; flag the inversion without arithmetic

### Click-Through & Navigation
- **Whole tile** is wrapped in a Next.js `<Link>` — biggest hit target; cursor-pointer style; native cmd/ctrl-click opens in new tab without custom handlers
- Click target is **`/projects/<slug>/releases`** (the customer release page); the per-project admin pipeline page doesn't exist until Phase 9 — when it does, the tile target may be revisited
- Hover state uses **border highlight** (zinc-700 → zinc-600) plus subtle bg lift; matches existing card hover patterns elsewhere in /admin

### Claude's Discretion
- Exact pixel spacing inside the tile, breakpoint thresholds for the responsive grid, and hover transition timing left to Claude — follow existing /admin tile rhythm
- Query implementation (single `DISTINCT ON` join vs. two queries + map) at Claude's discretion provided the pitfall guards (composite index, `WHERE env IN ('dev', 'prod')`, `COALESCE(deployed_at, released_at)` ordering) are satisfied

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/db.ts` — Drizzle pg.Pool client
- `src/db/schema.ts` — `projects`, `release_logs` (with `env`, `deployed_at`, `entries[]` JSONB), `release_approvals` (status field via release_logs.status)
- `src/app/projects/[slug]/releases/format.ts` — `formatRelativeTime`, `formatDeployedAt` helpers
- `src/lib/auth-context.ts` — `getCurrentUserContext` (staff bypass, project memberships)
- Existing `getDashboardStats()` function in `src/app/admin/page.tsx` — needs extension, not replacement

### Established Patterns
- Server component fetches all dashboard data at render time (no client islands needed for a static tile)
- Drizzle `inArray` batch lookup for per-project aggregates (already used in same file)
- Tailwind classes: `rounded-lg`, `bg-zinc-900`, `border border-zinc-800`, `p-4`, `text-zinc-200/400/500/600` palette
- Lucide icons in module grid already

### Integration Points
- `/admin/page.tsx` — modify `getDashboardStats()` to add per-project prod/dev version + pending-approval count + last-deploy timestamps + what-changed-summary
- Add composite index `(project, env, deployed_at DESC)` on `release_logs` in this phase's schema migration (Pitfall 8 guard) — must ship in same deploy as the dashboard query change
- New helper `src/lib/pipeline-summary.ts` (or similar) — server-side function `getProjectPipelineSummary(projectKey)` returning the data shape the tile needs; reusable in Phase 9 per-project pipeline page

</code_context>

<specifics>
## Specific Ideas

- Existing tile retains: project name, status pill, bug count, feature count
- New tile adds: prod row, dev row, pending-approval pill (top-right), what-changed one-liner (bottom)
- The current `currentVersion` field on `projects` becomes redundant for display purposes — leave the column intact for now (other places may read it), but rely on `release_logs` queries for tile rendering

</specifics>

<deferred>
## Deferred Ideas

- Sort/filter on admin home (PIPE-07 — deferred to v2.1.x; project count is small enough today)
- Project search box (PIPE-08 — deferred to v2.1.x)
- Per-project admin pipeline page link (will be added in Phase 9 — tile target may switch from `/projects/<slug>/releases` to `/admin/modules/pipeline/<slug>` then)
- "What's coming to prod" expanded view on tiles (deferred to per-project pipeline page in Phase 9, not on the admin home tile)

</deferred>
