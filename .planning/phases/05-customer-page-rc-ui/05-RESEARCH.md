# Phase 5: Customer Page RC UI - Research

**Researched:** 2026-05-05
**Domain:** Next.js 16 App Router server component + Drizzle ORM query composition + React 19 client component restructure
**Confidence:** HIGH — all findings drawn directly from reading the live source files; no training-data speculation required.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- D-01: Collapsible accordion sections, one per branch, reusing ChevronDown/ChevronRight pattern already in ReleasesClient.tsx lines 456–460.
- D-02: Default expansion: `main` + active feature branches. "Active" = latest release within 30 days OR non-terminal status (`dev`, `pending_approval`, `approved`). Stale branches collapsed.
- D-03: Section ordering: `main` pinned first; feature branches sorted by `max(deployed_at)` desc.
- D-04: Every distinct `release_logs.branch` value gets a section. No date filter, no allowlist.
- D-05: Inline `ExternalLink` lucide icon next to version cell on collapsed row.
- D-06: Main-branch rows show prod URL when `env='prod'` or `status='promoted'` — from `projects.deployedUrl`; fallback to `metadata.previewUrl` if set. Dev rows on main and all feature-branch rows show `metadata.previewUrl`.
- D-07: Missing `previewUrl` → disabled/grayed icon with tooltip "No preview deployed". Never hidden.
- D-08: Icon-only button; full URL in tooltip and `aria-label`.
- D-09: Reuse existing 2-step + 5-second countdown verbatim, scoped per `release.id`.
- D-10: Confirm label: `Click to confirm — promote <branch> <version> (5s)`.
- D-11: Section header shows aggregate badge cluster (pending / promoted / conflict count).
- D-12: Concurrent confirm states across branches fully independent.
- D-13: Conflict badge in section header AND every row in the conflicting branch.
- D-14: Badge label "Conflict — N file(s)"; click expands `conflictFiles` list + rebase hint; `rebaseError` collapsed behind "Show error details".
- D-15: Conflict source = latest `promote_attempts` row for `(project, branch)` where `result='conflict'`, `created_at > max(release_logs.deployed_at)` for same branch.
- D-16: Auto-clears when a newer `release_logs` row for the branch has `deployed_at > latest_conflict.created_at`.
- D-17: Approve button hidden entirely on conflict branch; replaced with "Resolve conflict to enable approval".

### Claude's Discretion

- Exact "active" threshold for D-02 (recommend 30-day window OR non-terminal status).
- Section-header badge color tokens (match `STATUS_BADGE_COLORS`/`ENV_BADGE_COLORS`).
- Server-side vs. client API for `promote_attempts` aggregates (recommend server-side, single query).
- Per-section tables vs. one table with divider rows (recommend per-section tables).
- Mobile breakpoint behavior (minimal; sections stack, badges wrap).
- Whether to surface `ci_failed` as a separate badge (Phase 5 success criteria only require conflict; defer).
- Whether to query `projects.deployedUrl` for prod URL on main rows or store in metadata (use `projects.deployedUrl`).

### Deferred Ideas (OUT OF SCOPE)

- RC-04 / Phase 6: wiring approve button to dispatch `promote-branch.yml`.
- RC-06 / Phase 6: Slack conflict reply.
- RC-05 / Phase 6: branch name in OttoBot message.
- RC-08 / Phase 6: concurrent RC server-side safety.
- CI-failed badge variant.
- Bulk-approve UX.
- Manual "Dismiss" on conflict badge.
- Per-section pagination.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| RC-01 | `/projects/{slug}/releases` page groups releases by branch — one collapsible section per active feature branch plus a "main" section | Server-side grouping query shape documented in §Domain Investigation; BranchSection type defined |
| RC-02 | Each RC row displays the preview URL with an external-link icon; clicking opens in a new tab | FAH URL pattern documented; PreviewLink component approach specified; deployedUrl vs. previewUrl logic confirmed |
| RC-03 | Each RC has its own admin-only Approve button; multiple RCs can be in approved state simultaneously | Existing approveStep/countdownState keying already per-release.id; no state shape change required |
| RC-07 | Branch with unresolved conflict shows badge; approve button disabled; row remains queryable | promote_attempts query shape + conflict auto-clear logic fully specified; Drizzle snippet provided |
</phase_requirements>

---

## Domain Investigation

### 1. Server-Side Branch Grouping Query

**Current `page.tsx` query (lines 43–51):** Flat `findMany` on `releaseLogs` for the project, ordered by `coalesce(deployedAt, releasedAt) DESC`, `limit: PAGE_SIZE + 1`. The same flat query is used by the load-more API at `src/app/api/projects/[slug]/releases/route.ts`.

**Required change:** The page.tsx server component needs two additions:

**A. Fetch `projects.deployedUrl` (for D-06 prod URL on main rows)**

```typescript
// In page.tsx, extend the existing projects SELECT
const [project] = await db
  .select({ key: projects.key, name: projects.name, deployedUrl: projects.deployedUrl })
  .from(projects)
  .where(eq(projects.key, slug));
```

The `deployedUrl` column is `varchar('deployed_url', { length: 512 })` in the schema (line 31 of schema.ts). It is populated for all active projects (confirmed via seed-projects.ts and admin projects page). Pass it to `ReleasesClient` in Props.

**B. Fetch latest conflict per branch from `promote_attempts`**

No Drizzle relational relation links `releaseLogs` to `promoteAttempts` — there is no FK. Use a separate `db.select()` with a window function equivalent. CockroachDB supports all standard PostgreSQL window functions.

**Recommended approach — two-pass in TypeScript (simpler than window function in Drizzle):**

```typescript
import { promoteAttempts } from '@/db/schema';
import { eq, and, desc, sql } from 'drizzle-orm';

// All conflict rows for this project, most-recent first per branch
const conflictRows = await db
  .select({
    branch: promoteAttempts.branch,
    createdAt: promoteAttempts.createdAt,
    conflictFiles: promoteAttempts.conflictFiles,
    rebaseError: promoteAttempts.rebaseError,
  })
  .from(promoteAttempts)
  .where(
    and(
      eq(promoteAttempts.project, project.key),
      eq(promoteAttempts.result, 'conflict'),
    )
  )
  .orderBy(desc(promoteAttempts.createdAt));

// Deduplicate to latest per branch
const latestConflictByBranch = new Map<string, typeof conflictRows[number]>();
for (const row of conflictRows) {
  if (!latestConflictByBranch.has(row.branch)) {
    latestConflictByBranch.set(row.branch, row);
  }
}
```

The existing index `promote_attempts_project_branch_idx` covers the `(project, branch)` filter. The `promote_attempts_created_at_idx` covers the `ORDER BY created_at DESC`. CockroachDB will use both.

**Total queries in page.tsx after Phase 5:** 4 (projects lookup, releases findMany, prodRows fetch, conflictRows fetch) + 1 count query. This is fine; the count query can be removed or retained as-is.

**C. Conflict auto-clear logic (D-16)**

Performed in TypeScript server-side before passing data to the client:

```typescript
// After building releases array and conflictRows map:
// A branch is "in conflict" only when latestConflict.createdAt > max(release.deployedAt) for that branch.

// Build max deployedAt per branch from the releases array:
const maxDeployedByBranch = new Map<string, Date>();
for (const r of pageRows) {
  const branch = r.branch ?? 'main';
  const at = r.deployedAt ?? r.releasedAt;
  const existing = maxDeployedByBranch.get(branch);
  if (!existing || at > existing) maxDeployedByBranch.set(branch, at);
}

// Conflict is active only when latestConflict.createdAt > maxDeployed for that branch
function isConflictActive(branch: string): boolean {
  const conflict = latestConflictByBranch.get(branch);
  if (!conflict) return false;
  const maxDeployed = maxDeployedByBranch.get(branch);
  if (!maxDeployed) return true; // conflict with no releases = still active
  return conflict.createdAt > maxDeployed;
}
```

**D. Branch grouping and sorting (D-03, D-04)**

```typescript
// Group all releases by branch
const byBranch = new Map<string, ReleaseRow[]>();
for (const r of releases) {
  const branch = r.branch ?? 'main';  // null-safe per Phase 3 decision
  const group = byBranch.get(branch) ?? [];
  group.push(r);
  byBranch.set(branch, group);
}

// Build BranchSection array
const sections: BranchSection[] = Array.from(byBranch.entries()).map(([branch, rows]) => {
  const maxDeployedAt = rows.reduce<string | null>((acc, r) => {
    const at = r.deployedAt ?? r.releasedAt;
    return !acc || at > acc ? at : acc;
  }, null);

  const conflict = isConflictActive(branch)
    ? {
        files: latestConflictByBranch.get(branch)!.conflictFiles as string[],
        rebaseError: latestConflictByBranch.get(branch)!.rebaseError ?? null,
        createdAt: latestConflictByBranch.get(branch)!.createdAt.toISOString(),
      }
    : null;

  const latestDeployedAt = maxDeployedAt;
  const latestStatus = rows[0]?.status ?? null;
  const isActive =
    (latestDeployedAt !== null &&
      Date.now() - new Date(latestDeployedAt).getTime() < 30 * 24 * 60 * 60 * 1000) ||
    ['dev', 'pending_approval', 'approved'].includes(latestStatus ?? '');

  return {
    branch,
    releases: rows,
    conflict,
    maxDeployedAt,
    isActive,
    aggregate: {
      pending: rows.filter((r) => r.status === 'pending_approval').length,
      promoted: rows.filter((r) => r.status === 'promoted').length,
      conflict: conflict !== null,
    },
  };
});

// Sort: main first, then by maxDeployedAt desc
sections.sort((a, b) => {
  if (a.branch === 'main') return -1;
  if (b.branch === 'main') return 1;
  if (!a.maxDeployedAt && !b.maxDeployedAt) return 0;
  if (!a.maxDeployedAt) return 1;
  if (!b.maxDeployedAt) return -1;
  return b.maxDeployedAt.localeCompare(a.maxDeployedAt); // ISO strings sort correctly
});
```

**E. Pagination semantics (D-04 / CONTEXT.md deferred)**

Per CONTEXT.md, per-section pagination is deferred. The current `PAGE_SIZE = 20` flat fetch from page.tsx is kept as-is. `hasMore` and the load-more API (`/api/projects/[slug]/releases`) remain unchanged. Load-more appends flat releases to the client; the client re-groups by branch on each append. No API changes needed in Phase 5.

The load-more API does NOT need to know about branches. The client maintains a flat `releases` array and re-derives `branchSections` computed from it whenever `releases` changes.

### 2. FAH Preview URL Pattern + sanitization

**Confirmed pattern (from Phase 2 CONTEXT.md D-06 specifics):**

```
https://<sanitized-branch>--<backend>.<region>.hosted.app
```

Where sanitization = replace all `/` with `-` and replace any non-alphanumeric character (except `-`) with `-`. Example:
- Branch `feat/change-font` → sanitized `feat-change-font`
- Backend `triarch-dev-truthtreason` (truth+treason project)
- Region `us-central1`
- URL: `https://feat-change-font--triarch-dev-truthtreason.us-central1.hosted.app`

**Where `metadata.previewUrl` is written:** The shared-workflows `deploy-firebase.yml` v2 ingest callback (Phase 2) writes `previewUrl` into the `release_logs.metadata` JSONB column for non-main branches. The ingest endpoint at `src/app/api/platform/ingest/release-logs/route.ts` accepts `previewUrl` in the payload and stores it inside `metadata`. The field is NOT a dedicated column — confirmed by schema.ts line 156 (`metadata: jsonb('metadata').default({})`).

**JSON shape of `release_logs.metadata`:**

```json
{
  "previewUrl": "https://feat-change-font--triarch-dev-truthtreason.us-central1.hosted.app"
}
```

Only the `previewUrl` key is documented as being written by shared-workflows. Other keys may exist but are not specified.

**Reading previewUrl in server code:**

```typescript
const previewUrl = (r.metadata as { previewUrl?: string })?.previewUrl ?? null;
```

**Deterministic URL construction fallback:** CONTEXT.md D-07 explicitly says: when `previewUrl` is missing, render a disabled icon. Do NOT attempt to construct the URL deterministically. The FAH backend name is project-specific and not stored in a discoverable column. Follow D-07.

**Prod URL for main rows (D-06):**

Use `projects.deployedUrl` — the column is `varchar('deployed_url', { length: 512 })` and is populated for all live projects (confirmed: seed-projects.ts lines 36, 52, 69, 86, 102 show it as `https://<subdomain>.triarch.dev` or similar). When `deployedUrl` is null, fallback gracefully to a disabled icon (same D-07 pattern). Pass `deployedUrl` from page.tsx server component down to `ReleasesClient` and then into the row.

### 3. Schema Cross-Reference

Key columns confirmed from `src/db/schema.ts`:

| Table | Column | Type | Notes |
|-------|--------|------|-------|
| `release_logs` | `branch` | `varchar(256)` nullable, default `'main'` | Treat `null` as `'main'` |
| `release_logs` | `metadata` | `jsonb` default `{}` | `previewUrl` key written by shared-workflows |
| `release_logs` | `deployed_at` | `timestamptz` nullable | Use for max-deployed comparison |
| `release_logs` | `status` | `varchar(24)` nullable | `'dev' \| 'pending_approval' \| 'approved' \| 'rejected' \| 'promoted'` |
| `projects` | `deployed_url` | `varchar(512)` nullable | Prod URL for main rows (D-06) |
| `promote_attempts` | `project` | `varchar(64)` | Matches `release_logs.project` |
| `promote_attempts` | `branch` | `varchar(256)` | Matches `release_logs.branch` |
| `promote_attempts` | `result` | `varchar(16)` | `'merged' \| 'conflict' \| 'ci_failed'` |
| `promote_attempts` | `conflict_files` | `jsonb` default `[]` | Array of file path strings |
| `promote_attempts` | `rebase_error` | `text` nullable | Raw rebase error message |
| `promote_attempts` | `created_at` | `timestamptz` | Used for auto-clear comparison |

Indexes that will be used:
- `promote_attempts_project_branch_idx` on `(project, branch)` — used by the conflict query WHERE clause
- `promote_attempts_created_at_idx` on `created_at DESC` — used by ORDER BY

---

## Codebase Patterns

### 4. ReleasesClient.tsx Restructure Plan

**Current structure (823 lines):**
- Lines 1–18: imports
- Lines 24–39: `STATUS_BADGE_COLORS`, `ENV_BADGE_COLORS` constants
- Lines 40–43: `DELETE_WINDOW_MS`, `FEEDBACK_MAX_CHARS`, etc.
- Lines 58–67: `Props` interface
- Lines 131–579: Main `ReleasesClient` component with all state + render
- Lines 408–575: The `<table>` block — the only area that changes structurally
- Lines 584–822: `ExpandedPanel` sub-component — NO CHANGES

**Minimal change strategy:**

Step 1 — Change the Props interface to accept `BranchSection[]` from server instead of flat `ReleaseRow[]`.

```typescript
interface Props {
  projectSlug: string;
  projectName: string;
  projectDeployedUrl: string | null;  // NEW: for D-06 prod URL on main rows
  userRole: UserRole;
  currentUserEmail: string;
  initialSections: BranchSection[];   // replaces initialReleases
  total: number;
  hasMore: boolean;
  pageSize: number;
}
```

Step 2 — Internal state change. Replace `const [releases, setReleases] = useState<ReleaseRow[]>(...)` with:

```typescript
const [sections, setSections] = useState<BranchSection[]>(initialSections);
const [expandedSections, setExpandedSections] = useState<Set<string>>(
  () => new Set(initialSections.filter((s) => s.isActive).map((s) => s.branch))
);
```

The per-row ephemeral state (`approveStep`, `countdownState`, `feedbackDrafts`, etc.) all remain keyed by `release.id` — no change.

Step 3 — Replace the `<div>` + `<table>` block (lines 408–575) with branch-section iteration:

```tsx
<div className="space-y-4">
  {sections.map((section) => (
    <BranchSection
      key={section.branch}
      section={section}
      projectDeployedUrl={projectDeployedUrl}
      expandedSections={expandedSections}
      expandedIds={expandedIds}
      onToggleSection={toggleSection}
      onToggleRow={toggleExpanded}
      // ...all per-row action handlers passed through
    />
  ))}
</div>
```

Step 4 — Extract a `<BranchSection>` sub-component (new file or inline at bottom of ReleasesClient.tsx). Each `BranchSection` renders:
- Section header `<button>` with `aria-expanded` + `aria-controls`
- Badge cluster (aggregate status counts, conflict badge if applicable)
- A per-section `<table>` (same column structure as existing table, minus the outer card wrapper)

Step 5 — The load-more handler now appends to a flat list, then re-derives sections:

```typescript
const handleLoadMore = async () => {
  // ... fetch flat releases as before ...
  setSections((prev) => groupIntoSections(
    [...prev.flatMap((s) => s.releases), ...(data.releases as ReleaseRow[])],
    latestConflictByBranch,  // passed down as prop or stable ref
    projectDeployedUrl,
  ));
};
```

A pure `groupIntoSections(releases, conflicts, deployedUrl): BranchSection[]` helper extracted to a new file (e.g., `src/app/projects/[slug]/releases/group-sections.ts`) keeps ReleasesClient.tsx clean and is independently unit-testable.

**What does NOT change in ExpandedPanel:**
- All action button rendering
- Feedback list + compose
- Timeline integration
- All per-row state (approveStep, countdown, showRejectForm, etc.)

**The only ExpandedPanel change (D-10, D-17):**
- Confirm button label updated to include branch + version (D-10): add `branch: string` to `ExpandedPanelProps` and modify the label at line 754.
- Action area gating: add `isConflict: boolean` to `ExpandedPanelProps`. When `isConflict=true`, replace the approve button with helper text and hide the reject button (D-17).

### 5. Shared-UI Accordion Primitive

`@myalterlego/shared-ui` v1.4.0 exports: `SkeletonLoader`, `EmptyState`, `ConfirmDialog`, `StatusBadge`, `SortableList`, `DynamicSidebar`, `ThemeProvider`, `BugReportForm`, `FeatureRequestForm`, `FeedbackPanel`, `SubpageTabBar`, `WelcomeEmail`, `BaseTemplate`, and several hooks/utilities.

**No Accordion or Collapsible primitive exists in `@myalterlego/shared-ui` v1.4.0.**

Roll a local pattern, following the existing `ChevronDown`/`ChevronRight` row-expand pattern in ReleasesClient.tsx lines 456–460.

**Recommended local section header pattern:**

```tsx
<button
  onClick={() => onToggleSection(section.branch)}
  aria-expanded={isExpanded}
  aria-controls={`branch-panel-${branchId}`}
  className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-zinc-800/30 transition-colors"
>
  <div className="flex items-center gap-2">
    {isExpanded ? <ChevronDown size={14} className="text-zinc-500" /> : <ChevronRight size={14} className="text-zinc-500" />}
    <span className="text-sm font-mono text-zinc-200">{section.branch}</span>
    <span className="text-xs text-zinc-500">{formatRelativeTime(section.maxDeployedAt!)}</span>
  </div>
  <div className="flex items-center gap-1.5">
    {/* Aggregate badges */}
    {section.aggregate.pending > 0 && (
      <span className={`px-1.5 py-0.5 rounded text-[10px] border ${STATUS_BADGE_COLORS.pending_approval}`}>
        {section.aggregate.pending} pending
      </span>
    )}
    {section.aggregate.promoted > 0 && (
      <span className={`px-1.5 py-0.5 rounded text-[10px] border ${STATUS_BADGE_COLORS.promoted}`}>
        {section.aggregate.promoted} promoted
      </span>
    )}
    {section.conflict && (
      <span className={`px-1.5 py-0.5 rounded text-[10px] border ${STATUS_BADGE_COLORS.rejected}`} role="status">
        Conflict — {section.conflict.files.length} file(s)
      </span>
    )}
  </div>
</button>

<div id={`branch-panel-${branchId}`} hidden={!isExpanded}>
  {/* per-section table */}
</div>
```

Use `hidden` attribute (not CSS `display:none`) for panel visibility — semantically correct for `aria-controls` pattern; also avoids hydration mismatch since `hidden` is a boolean HTML attribute.

The `branchId` for use in element IDs: `section.branch.replace(/[^a-z0-9]/gi, '-')` — makes the branch name safe for use in DOM id attributes.

**SSR flash prevention:** Initialize `expandedSections` inside a `useState` initializer function (not `useEffect`) using the `isActive` flag computed server-side and passed in `BranchSection.isActive`. This ensures the initial render matches between server and client without any localStorage read. No hydration mismatch.

### 6. Lucide Icons in Use

Current icons in ReleasesClient.tsx (line 3–14): `CheckCircle`, `XCircle`, `GitBranch`, `MessageSquare`, `ChevronDown`, `ChevronRight`, `Trash2`, `Loader2`, `AlertCircle`.

Phase 5 additions from `lucide-react ^1.7.0`:
- `ExternalLink` — already used in `src/app/admin/platform/projects/page.tsx` (confirmed); import is safe.
- `AlertTriangle` — for conflict badge icon if desired (alternative to existing `AlertCircle`).

No new dependency additions required.

### 7. PreviewLink Component

Extract as `src/app/projects/[slug]/releases/PreviewLink.tsx` (new file, ~50 lines):

```tsx
'use client';

import { ExternalLink } from 'lucide-react';

interface Props {
  url: string | null;
}

export default function PreviewLink({ url }: Props) {
  if (!url) {
    return (
      <button
        disabled
        aria-label="No preview deployed"
        title="No preview deployed"
        className="p-1 text-zinc-700 cursor-default"
      >
        <ExternalLink size={12} />
      </button>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Open preview — ${url}`}
      title={url}
      className="p-1 text-zinc-500 hover:text-teal-400 transition-colors"
      onClick={(e) => e.stopPropagation()}  // prevent row toggle on icon click
    >
      <ExternalLink size={12} />
    </a>
  );
}
```

The `e.stopPropagation()` is required because the collapsed row is a clickable `<tr>` — clicking the icon should open the URL but not expand the row.

**How to compute the URL passed to `PreviewLink` per row:**

```typescript
function resolvePreviewUrl(
  release: ReleaseRow,
  projectDeployedUrl: string | null,
): string | null {
  // Main-branch prod/promoted rows: use projects.deployedUrl
  if (
    (release.branch ?? 'main') === 'main' &&
    (release.env === 'prod' || release.status === 'promoted')
  ) {
    return projectDeployedUrl ?? null;
  }
  // Everything else: metadata.previewUrl
  return (release.metadata as { previewUrl?: string } | null)?.previewUrl ?? null;
}
```

Note: `ReleaseRow` currently lacks a `metadata` field. Add `metadata: Record<string, unknown> | null` to the `ReleaseRow` interface in `types.ts`, and surface it in the `page.tsx` and API route serialization.

### 8. New Types Required in `types.ts`

```typescript
export interface ConflictState {
  files: string[];       // from promote_attempts.conflict_files JSONB
  rebaseError: string | null;
  createdAt: string;     // ISO
}

export interface BranchAggregate {
  pending: number;
  promoted: number;
  conflict: boolean;
}

export interface BranchSection {
  branch: string;
  releases: ReleaseRow[];
  conflict: ConflictState | null;
  maxDeployedAt: string | null;  // ISO — used for section sort + header "last deployed X ago"
  isActive: boolean;             // drives default-expanded state
  aggregate: BranchAggregate;
}

// Add to ReleaseRow:
export interface ReleaseRow {
  // ... existing fields ...
  branch: string | null;          // NEW: from release_logs.branch
  metadata: Record<string, unknown> | null;  // NEW: for previewUrl extraction
}
```

---

## Validation Architecture

Note: `nyquist_validation_enabled` is `false` in `.planning/config.json`. The following section is included because the phase objective explicitly requires it for the planner's consumption. The test strategies are RTL-ready despite the config flag.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.x |
| Config file | `vitest.config.ts` (root) |
| Quick run command | `npx vitest run` |
| Full suite command | `npx vitest run --reporter=verbose` |

### Per-Requirement Test Strategy

**SC-1 (RC-01): Branch grouping — RTL component test**

File: `src/app/projects/[slug]/releases/group-sections.test.ts`

Seed fixture: array of `ReleaseRow[]` with releases on `main`, `feat/change-font`, and `feat/add-audio`. Assert:
- `sections[0].branch === 'main'`
- `sections` length === 3
- `feat/change-font` appears before `feat/add-audio` when change-font has a more recent `deployed_at`
- Null `branch` field treated as `'main'`

This is a pure function test (no React rendering) on `groupIntoSections()`.

```typescript
import { describe, it, expect } from 'vitest';
import { groupIntoSections } from './group-sections';

it('pins main first, sorts feature branches by maxDeployedAt desc', () => {
  const releases = [
    makeRelease({ branch: 'feat/add-audio', deployedAt: '2026-05-01T00:00:00Z' }),
    makeRelease({ branch: 'feat/change-font', deployedAt: '2026-05-03T00:00:00Z' }),
    makeRelease({ branch: 'main', deployedAt: '2026-05-04T00:00:00Z' }),
  ];
  const sections = groupIntoSections(releases, new Map(), null);
  expect(sections[0].branch).toBe('main');
  expect(sections[1].branch).toBe('feat/change-font');
  expect(sections[2].branch).toBe('feat/add-audio');
});

it('treats null branch as main', () => {
  const releases = [makeRelease({ branch: null, deployedAt: '2026-05-01T00:00:00Z' })];
  const sections = groupIntoSections(releases, new Map(), null);
  expect(sections[0].branch).toBe('main');
});
```

**SC-2 (RC-02): Preview URL clickable — RTL component test**

File: `src/app/projects/[slug]/releases/PreviewLink.test.tsx`

```typescript
import { render, screen } from '@testing-library/react';
import PreviewLink from './PreviewLink';

it('renders an anchor with target=_blank and correct href when url is provided', () => {
  render(<PreviewLink url="https://feat-font--backend.us-central1.hosted.app" />);
  const link = screen.getByRole('link');
  expect(link).toHaveAttribute('href', 'https://feat-font--backend.us-central1.hosted.app');
  expect(link).toHaveAttribute('target', '_blank');
  expect(link).toHaveAttribute('rel', 'noopener noreferrer');
});

it('renders a disabled button with aria-label "No preview deployed" when url is null', () => {
  render(<PreviewLink url={null} />);
  const btn = screen.getByRole('button', { name: /no preview deployed/i });
  expect(btn).toBeDisabled();
});
```

Requires `@testing-library/react` — not currently installed. Add to devDependencies in Wave 0.

**SC-3 (RC-03): Per-RC approve isolation — RTL component test**

File: `src/app/projects/[slug]/releases/ReleasesClient.test.tsx`

Seed two `BranchSection`s, each with one `ReleaseRow` in `status='dev'`. Fire `onApproveStep1` for row A. Assert:
- `approveStep[rowA.id] === 'confirm'`
- `approveStep[rowB.id] === 'idle'` (or undefined)

This tests that per-row state keying prevents cross-contamination. Uses `@testing-library/react` + `userEvent`.

**SC-4 (RC-07): Conflict badge + disabled approve — RTL component test**

File: `src/app/projects/[slug]/releases/BranchSection.test.tsx`

Seed a `BranchSection` with `conflict: { files: ['src/foo.ts'], rebaseError: null, createdAt: '...' }`. Render the section expanded. Assert:
- `screen.getByText(/Conflict — 1 file/i)` is present
- `screen.queryByRole('button', { name: /approve for production/i })` is null
- `screen.getByText(/Resolve conflict to enable approval/i)` is present

**UAT note (Phase 6 gate, not Phase 5):** After Phase 6 wires real dispatch, a manual E2E test on the truth+treason staging environment validates: customer approves feat/change-font → OttoBot fires → `promote-branch.yml` runs → round-trip callback returns conflict → page auto-refreshes (or reload) shows conflict badge with file list, approve button hidden.

### Wave 0 Gaps

- [ ] `src/app/projects/[slug]/releases/group-sections.test.ts` — covers SC-1 / RC-01
- [ ] `src/app/projects/[slug]/releases/PreviewLink.test.tsx` — covers SC-2 / RC-02
- [ ] `src/app/projects/[slug]/releases/ReleasesClient.test.tsx` — covers SC-3 / RC-03
- [ ] `src/app/projects/[slug]/releases/BranchSection.test.tsx` — covers SC-4 / RC-07
- [ ] Install `@testing-library/react` + `@testing-library/user-event` + `jsdom` environment: `npm install -D @testing-library/react @testing-library/user-event @testing-library/jest-dom jsdom`
- [ ] Update `vitest.config.ts` to add `environment: 'jsdom'` for the releases test files (or use a vitest workspace config scoping jsdom to UI tests only while keeping `environment: 'node'` for API route tests)

---

## Implementation Approach

### Recommended Plan Structure (4 plans)

**Plan 05-01: Types + groupIntoSections helper + page.tsx server query extension**
- Scope: `types.ts` additions (BranchSection, ConflictState, BranchAggregate; extend ReleaseRow with `branch`, `metadata`), new `group-sections.ts` pure helper, `page.tsx` query additions (deployedUrl from projects, conflictRows from promoteAttempts), pass `initialSections` + `projectDeployedUrl` to ReleasesClient.
- Tests: `group-sections.test.ts` (pure function, no React required — can use `environment: 'node'`).
- No UI change visible to user.

**Plan 05-02: PreviewLink component + Wire previewUrl into version cell**
- Scope: New `PreviewLink.tsx` component, add `PreviewLink` to the existing version `<td>` in ReleasesClient (the collapsed row at lines 463–466), `resolvePreviewUrl()` helper inlined in ReleasesClient or extracted to `group-sections.ts`.
- Tests: `PreviewLink.test.tsx`.
- Visible change: ExternalLink icon appears next to version on every row.

**Plan 05-03: BranchSection component + accordion restructure in ReleasesClient.tsx**
- Scope: New `BranchSection.tsx` sub-component (section header button with aria-expanded, aggregate badges, per-section `<table>`), restructure ReleasesClient main render from `releases.map(...)` to `sections.map(...)`, add `expandedSections` state and `toggleSection()`, update load-more handler to re-derive sections via `groupIntoSections`.
- ExpandedPanel changes: add `branch: string` prop (for D-10 confirm label), add `isConflict: boolean` prop (for D-17 approve button gating).
- Tests: `BranchSection.test.tsx` (SC-4) + `ReleasesClient.test.tsx` (SC-3).
- Visible change: page now shows accordion sections by branch.

**Plan 05-04: Conflict badge expansion (D-14 conflict file list) + E2E smoke review**
- Scope: Add conflict file list toggle inside section header (or expanded panel), `rebaseError` "Show error details" toggle, defensive cap at 50 files with "+ N more" link, `role="status"` on conflict badge.
- Review: Check Timeline.tsx works correctly under branch grouping — Timeline takes a single `ReleaseRow` and is per-row; no changes expected but verify visually.
- Tests: Additional assertions in `BranchSection.test.tsx` for expanded conflict file list rendering.
- No DB changes, no API changes.

### Server-side vs. client-side decision matrix

| Work | Where | Reason |
|------|-------|--------|
| Fetch projects.deployedUrl | server (page.tsx) | Single additional field on existing query |
| Fetch latest conflict per branch | server (page.tsx) | Avoids client-side API call; 2-query approach confirmed safe |
| groupIntoSections logic | shared util (group-sections.ts) | Used by server (page.tsx initial pass) AND client (load-more re-grouping) — but server runs it once; client re-runs on each load-more append |
| isConflict / auto-clear | server (page.tsx, inside groupIntoSections) | Computed once server-side; passed as stable BranchSection.conflict field |
| expandedSections state | client only | Per-session UI state; SSR initial value from `isActive` field |
| approveStep / countdown state | client only | Per-row ephemeral UI state; unchanged |

---

## Risks & Pitfalls

### Pitfall 1: Null branch in group key

**What goes wrong:** `release_logs.branch` is nullable (Phase 3 decision — `.default('main')` but no `.notNull()`). Pre-backfill rows may have `branch = null`. A Map keyed on `null` groups all these into a `null`-keyed section, producing a section with header text `null`.

**How to avoid:** `const branch = r.branch ?? 'main'` in every grouping operation, applied before Map insertion. This is the canonical null-safe pattern for this column.

**Warning signs:** A section appearing with no header text or header "null" in dev testing.

### Pitfall 2: SSR / hydration mismatch on expandedSections

**What goes wrong:** If `expandedSections` is initialized with a `useEffect` (empty set on server, computed on client), React will throw a hydration error in Next.js 16.

**How to avoid:** Always initialize expandedSections as a lazy initializer function:
```typescript
const [expandedSections, setExpandedSections] = useState<Set<string>>(
  () => new Set(initialSections.filter((s) => s.isActive).map((s) => s.branch))
);
```
The lazy initializer runs only on the client but produces a deterministic value from props (which are identical server+client), avoiding mismatch.

### Pitfall 3: PreviewLink icon click expanding the row

**What goes wrong:** The collapsed row `<tr>` has an `onClick={() => toggleExpanded(release.id)}` handler (line 451). Clicking the ExternalLink anchor inside the row will bubble up and toggle the row open.

**How to avoid:** Add `e.stopPropagation()` to the PreviewLink anchor's `onClick` (already specified in the component snippet above).

### Pitfall 4: `title` attribute vs. aria-label for tooltip

**What goes wrong:** Native `title=` tooltips do not render on keyboard focus or touch in most browsers; they also have no role and are not announced by default.

**How to avoid:** Use BOTH `title={url}` (hover fallback) AND `aria-label={`Open preview — ${url}`}` (screen reader). This is the established pattern in the codebase (`AdminSidebar.tsx` line 44, `BugReportWidget.tsx` line 91 both use `title=`). For the disabled state, `aria-label="No preview deployed"` is sufficient since screen readers announce disabled button labels.

### Pitfall 5: Per-section table vs. one table with divider rows

**What goes wrong:** One big table with section-divider rows breaks accessibility (table aria semantics require all `<tr>` to be logically the same thing) and makes the per-section `aria-expanded` / `aria-controls` pattern unworkable.

**How to avoid:** Use separate `<table>` elements per section (inside the `<div id="branch-panel-${branchId}">` panel). Each section has its own column-header row. This is semantically correct and lets each table be its own aria landmark.

### Pitfall 6: conflictFiles typed as `jsonb` — cast required

**What goes wrong:** Drizzle returns `conflictFiles` from `promoteAttempts` as `unknown` (the raw jsonb type). Accessing `.length` or mapping over it without a cast throws.

**How to avoid:** Cast explicitly: `section.conflict.files as string[]`. The array will be `[]` by default (schema `default([])`), never `null`. Cap at 50 entries defensively: `const files = (section.conflict.files as string[]).slice(0, 50)`.

### Pitfall 7: Load-more re-grouping loses conflict state

**What goes wrong:** `handleLoadMore` in ReleasesClient currently appends to flat `releases` state. After Phase 5, load-more must re-run `groupIntoSections()`. If `latestConflictByBranch` is not available client-side (it was computed server-side), re-grouping will lose conflict state.

**How to avoid:** Add a `conflictsByBranch: Record<string, ConflictState>` prop to `ReleasesClient`. The server computes this from the initial `promoteAttempts` query and passes it down. The client holds it in a stable `useRef` for use in `handleLoadMore`. Since conflicts are not affected by pagination of `release_logs` (they come from a separate table), the initial conflict snapshot is sufficient.

**Alternative (simpler):** After `handleLoadMore` appends new releases, call a new API endpoint to re-fetch the conflict map. But this adds an extra round-trip. The `useRef` pattern is cleaner.

### Pitfall 8: Branch name in DOM ids

**What goes wrong:** Branch names like `feat/change-font` contain slashes — using the raw branch name as a DOM id attribute is invalid HTML.

**How to avoid:** Sanitize: `const branchId = section.branch.replace(/[^a-z0-9]/gi, '-')`. Use `branchId` only for DOM ids; use `section.branch` for Map keys and display.

### Pitfall 9: Confirm button label length on narrow screens

**What goes wrong:** D-10 confirm label is `Click to confirm — promote feat/change-font v0.15.0-rc.1 (5s)` — approximately 60 characters. On the existing button with `min-w-[160px]`, this will overflow.

**How to avoid:** Change confirm button to `min-w-[320px]` or use `truncate` with a full-label `title=` attribute. Alternatively, use `text-xs` inside the confirm button (currently uses default `text-sm`).

### Pitfall 10: `projects.deployedUrl` may be null

**What goes wrong:** If `projects.deployedUrl` is null for a project (e.g., a staging project not yet wired to a domain), passing null to `resolvePreviewUrl` for main/prod rows renders a disabled icon with "No preview deployed" — which is technically correct per D-07 but may confuse customers who expect a prod URL.

**How to avoid:** This is handled by D-07; render the disabled icon. No special handling needed. Document in the plan that operators should populate `deployedUrl` in the projects admin before the feature ships.

---

## Open Questions

None — ready to plan.

All schema columns exist (Phase 3 shipped SCHEMA-01; Phase 4 shipped `promote_attempts`). All API endpoints exist. No new dependencies required for functionality (only dev dependencies for testing). The load-more API requires no changes. The approve API requires no changes.

---

## RESEARCH COMPLETE
