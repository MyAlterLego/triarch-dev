# Architecture Research

**Domain:** Operations console — Pipeline UI integration (v2.1)
**Researched:** 2026-05-07
**Confidence:** HIGH (based on direct codebase analysis)

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  PAGES (Server Components — data fetched at render, no client state on load)    │
├────────────────────┬────────────────────┬───────────────────┬───────────────────┤
│  /admin            │  /admin/modules/   │  /admin/modules/  │  /projects/       │
│  (MODIFIED)        │  pipeline/[slug]   │  release-logs     │  [slug]/releases  │
│  + prod/dev split  │  (NEW)             │  (MODIFIED)       │  (MODIFIED)       │
│  + pending count   │  + env state       │  + linkage UI     │  + branch swap    │
│  + last deploy ts  │  + branch RCs      │  + entry links    │  + what-changed   │
│  + release page lk │  + what-changed    │  + auto-stamp     │  + filter by type │
│                    │  + promote btn     │                   │                   │
└────────────────────┴────────────────────┴───────────────────┴───────────────────┘
           │                   │                    │                  │
┌──────────▼───────────────────▼────────────────────▼──────────────────▼──────────┐
│  CLIENT COMPONENTS (hydrated islands — user interactions only)                  │
├──────────────────────────────────────────────────────────────────────────────────┤
│  PipelineDashboard  │  PromoteButton     │  BranchSwap       │  EntryTypeFilter  │
│  Client.tsx (NEW)   │  Client.tsx (NEW)  │  Client.tsx (NEW) │  Client.tsx (NEW) │
│  (branch swap       │  (calls POST       │  (calls POST      │  (filters         │
│   in-flight state)  │   /api/admin/      │   /api/projects/  │   BranchSection   │
│                     │   releases/[id]/   │   [slug]/branch/  │   by entry type)  │
│                     │   promote)         │   preview)        │                   │
└─────────────────────┴────────────────────┴───────────────────┴───────────────────┘
           │                   │                    │                  │
┌──────────▼───────────────────▼────────────────────▼──────────────────▼──────────┐
│  API ROUTES                                                                     │
├──────────────────────────────────────────────────────────────────────────────────┤
│  POST /api/admin/           │  POST /api/projects/       │  GET /api/platform/  │
│  releases/[id]/promote      │  [slug]/branch/preview     │  release-logs        │
│  (NEW — staff only)         │  (NEW — member+admin)      │  (EXISTING, extended)│
│  reuses promoteAndAudit()   │  calls Firebase App        │                      │
│  posts Slack notification   │  Hosting API rollout       │                      │
│  same idempotency model     │  concurrency via DB lock   │                      │
│  as Slack handler           │  row in release_logs       │                      │
└─────────────────────────────┴────────────────────────────┴──────────────────────┘
           │                                    │
┌──────────▼────────────────────────────────────▼──────────────────────────────────┐
│  LIB / SERVICES                                                                 │
├──────────────────────────────────────────────────────────────────────────────────┤
│  release-promotion.ts       │  github-app.ts              │  commit-parser.ts    │
│  (EXISTING, reused)         │  (EXISTING, reused)         │  (NEW)               │
│  promoteAndAudit()          │  dispatchWorkflow()         │  parseCommitRefs()   │
│  now callable from web      │  called by both Slack       │  regex #BUG #FEAT    │
│  route — no duplication     │  and web promote paths      │  #REQ closes/fixes   │
└─────────────────────────────┴─────────────────────────────┴──────────────────────┘
           │                                    │                    │
┌──────────▼────────────────────────────────────▼────────────────────▼─────────────┐
│  DATABASE (CockroachDB via Drizzle)                                             │
├──────────────────────────────────────────────────────────────────────────────────┤
│  release_logs (EXISTING)    │  release_log_links (NEW)   │  projects (EXISTING) │
│  + branch_preview_active    │  release_id → bug_id       │  + devBackendUrl     │
│    boolean (NEW COLUMN)     │  release_id → feature_id   │    (NEW COLUMN)      │
│                             │  external_url nullable      │                      │
│                             │  link_type enum            │                      │
└─────────────────────────────┴─────────────────────────────┴──────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | New or Modified |
|-----------|----------------|-----------------|
| `/admin` page | Project health at-a-glance, now with prod+dev split per row | MODIFIED |
| `/admin/modules/pipeline/[slug]` | Per-project consolidated pipeline view | NEW |
| `/admin/modules/release-logs` | Release authoring + linkage UI | MODIFIED |
| `/projects/[slug]/releases` | Customer RC page with branch swap + what-changed + entry type filter | MODIFIED |
| `PipelineDashboardClient` | In-flight state for branch swap across all projects | NEW |
| `PromoteButton` | Web-UI promote action, optimistic disabled state | NEW |
| `BranchSwapClient` | Branch selector + concurrency lock display | NEW |
| `EntryTypeFilterClient` | Filter release entries by bug/feat/other | NEW |
| `POST /api/admin/releases/[id]/promote` | Web-initiated promotion — delegates to `promoteAndAudit` | NEW |
| `POST /api/projects/[slug]/branch/preview` | Firebase App Hosting rollout swap | NEW |
| `src/lib/commit-parser.ts` | Regex parse commit messages for bug/feat/req IDs | NEW |
| `release_log_links` table | Join table linking release entries to bug/feature IDs | NEW |
| `projects.devBackendUrl` | Stores the FAH dev backend URL for branch swap target | NEW COLUMN |

---

## Feature Integration Details

### Feature 1: Pipeline-at-a-Glance Admin Dashboard

**Decision: Modify `/admin` page, not a new `/admin/modules/pipeline` page.**

The existing Project Health section already renders per-project rows. Adding prod/dev version split, pending-approval count, and last-deploy timestamp is a targeted extension of the `getDashboardStats` query — not a new module with its own nav entry.

A new `/admin/modules/pipeline` page would duplicate the project list and add nav overhead. The existing dashboard is the right home for this glanceable information.

**What changes:**
- `src/app/admin/page.tsx` — MODIFIED: `getDashboardStats` extended with two sub-queries per project: latest `release_logs WHERE env='dev' ORDER BY deployed_at DESC LIMIT 1` and latest `WHERE env='prod'`. The `ProjectHealth` interface gains `devVersion`, `prodVersion`, `pendingApprovals`, `lastDeployAt` fields.
- Project Health card template — renders two version badges (dev in blue, prod in green), pending count pill, last deploy timestamp, and a link icon to `/projects/<key>/releases`.
- No new lib file needed — query lives inline in the server component.

**Auth:** Staff sees all projects; non-staff sees only their project_member projects. Existing `projectKeys` filter logic is unchanged.

**Per-project pipeline deep-dive:** A new `/admin/modules/pipeline/[slug]` page (NEW) serves the consolidated env state + branch RC list + deploy history view. This is staff-only and accessible via the project tile link. It reuses the same `groupIntoSections` utility from the customer page but without the approval actions.

---

### Feature 2: Customer Branch Preview Swap

**API route:** `POST /api/projects/[slug]/branch/preview`

**What it does:** Takes `{ branchName: string }` in the request body. Calls the Firebase App Hosting Rollouts API to swap the dev backend to serve the named branch. Updates a concurrency lock in the DB so other RCs show "branch X currently previewing."

**Auth model:**
- `requireSignedIn` + project membership check (same as the approve route pattern).
- Role: `admin` only (same as Approve button). Viewer role cannot trigger a swap.
- Staff always passes.

**Concurrency lock — DB row approach (recommended over in-process mutex):**

Firebase App Hosting returns a 409 if a rollout is already in progress, so there is a natural server-side guard. However, the UI needs to show "currently previewing" state to other RC rows before the Firebase API call resolves. An in-process mutex dies on serverless cold start; a DB column is the correct solution.

Add `branch_preview_active varchar(256)` to `release_logs` — nullable, populated with the branch name when a swap is dispatched, cleared when the new deploy ingest arrives (the `POST /api/platform/ingest/release-logs` handler can clear it on success). Alternatively, add `preview_branch_locked_at timestamp` and `preview_branch_locked_to varchar(256)` to the `projects` table as a project-scoped lock (one lock per project rather than per-release). The project-scoped lock is cleaner: one row to check, one row to clear.

**Recommended:** Add `previewBranchLocked` + `previewBranchLockedAt` to `projects` table. The `POST /api/projects/[slug]/branch/preview` route:
1. Reads the lock row; if locked and `lockedAt` is within 15 minutes, return 409 with the locked branch name in the body.
2. Updates the lock (`UPDATE projects SET preview_branch_locked = $branch, preview_branch_locked_at = now() WHERE key = $slug`).
3. Calls Firebase App Hosting API (programmatically via `gcloud` REST or the Firebase Admin SDK `apphosting` module — see PITFALLS.md for the SDK gap).
4. Returns 200; the lock is cleared by the next successful ingest.

**Firebase API uncertainty (MEDIUM confidence):** The `firebase apphosting:rollouts:create --git-branch` CLI command exists and is documented. The REST API equivalent for programmatic invocation from Next.js route handlers is less clearly documented. This may require using the `googleapis` Node SDK with Firebase App Hosting REST endpoints. Flag this for a deeper research spike before Phase 2.

**Schema change required:** Two columns on `projects` table — `preview_branch_locked varchar(256)`, `preview_branch_locked_at timestamp`.

---

### Feature 3: Web-UI Promote Button

**API route:** `POST /api/admin/releases/[id]/promote`

**Auth model:**
- `requireStaff` (from `src/lib/api-auth.ts`). The Promote button is staff-only on the admin side. Customer admins do not get web-UI promotion — they approve via the customer page, which triggers the Slack path. Keeping promotion staff-gated prevents customers from bypassing Slack audit.
- If the admin pipeline page serves customers too in the future, reconsider; for now staff-only is correct.

**Idempotency:** Reuse `promoteAndAudit()` from `src/lib/release-promotion.ts` exactly as the Slack handler does. The function already audits `promotion_dispatched_at` on the release row. Calling it twice for the same release ID is safe — the second dispatch goes to GitHub Actions anyway and the GitHub API is idempotent for `workflow_dispatch` (it just queues another run, which the promote-branch workflow handles by checking branch state).

**Slack notification:** `promoteAndAudit()` already posts to the `#release-approvals` Slack channel via `postSlackThreadedReply`. The web path gets Slack notification for free by reusing the function — no duplicate notification logic needed.

**Body of the route:**
1. `requireStaff()` — 401/403 on failure.
2. Look up the release by `id`, verify it belongs to a project the staff member can see (all projects for staff).
3. Verify `release.status === 'approved'` — only approved releases can be promoted. Return 409 if not.
4. Look up project `githubRepo`, `slackChannelId`, `slackMessageTs` from `release.metadata.dispatch`.
5. Call `promoteAndAudit({ release, actorEmail, channelId, messageTs, slackUserName })`.
6. Return `{ ok: true }` or `{ ok: false, error }`.

**Client component:** `PromoteButton` renders only on approved rows, only for staff (role check passed as prop from server page). Optimistic disabled state while the `fetch` is in flight. On success, trigger a router refresh.

**No new lib file needed** — the route handler calls `promoteAndAudit` directly.

---

### Feature 4: Bug/Feature Release Linkage

#### 4a. Storage: Join Table (Recommended Over Extending `entries[]`)

**Decision: New `release_log_links` join table, not extending `entries[]` JSONB.**

`entries` is an append-only JSONB array that CI writes at ingest time. Adding bug/feature IDs to it would require mutating ingested data or changing the ingest payload contract — both bad. A join table is the correct relational pattern: queryable, indexable, auditable.

**Schema (new table):**

```sql
CREATE TABLE release_log_links (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  release_id UUID NOT NULL REFERENCES release_logs(id) ON DELETE CASCADE,
  link_type  VARCHAR(16) NOT NULL,   -- 'bug' | 'feature' | 'req' | 'external'
  bug_id     UUID,                   -- FK to bug_reports.id (nullable)
  feature_id UUID,                   -- FK to feature_requests.id (nullable)
  external_url TEXT,                  -- for 'external' type: GitHub issue URL, Jira, etc.
  source     VARCHAR(16) NOT NULL,   -- 'auto' (commit parser) | 'manual' (UI)
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX release_log_links_release_id_idx ON release_log_links(release_id);
CREATE INDEX release_log_links_bug_id_idx ON release_log_links(bug_id) WHERE bug_id IS NOT NULL;
CREATE INDEX release_log_links_feature_id_idx ON release_log_links(feature_id) WHERE feature_id IS NOT NULL;
```

**Drizzle schema addition** goes in `src/db/schema.ts`. Add relations to `releaseLogsRelations` (many links) and add `releaseLogLinksRelations` with one-to-one back to `releaseLogs`, `bugReports`, `featureRequests`.

#### 4b. Auto-Stamp: Commit Message Parser

**New lib file:** `src/lib/commit-parser.ts`

Parses a commit message string and returns structured link candidates. Called server-side from the ingest route after inserting the release row.

**Patterns to detect:**
- `#BUG-\d+` → links to `bug_reports` by numeric ID suffix
- `#FEAT-\d+` or `#FEATURE-\d+` → links to `feature_requests`
- `#REQ-\d+` → external_url type (requirements tracker, no internal FK)
- `closes #\d+` / `fixes #\d+` → GitHub issue number → external_url (GitHub issue link constructed from `projects.githubRepo`)
- `closes BUG-\d+` / `fixes FEAT-\d+` → same as direct hash patterns

**Where it runs:** In `POST /api/platform/ingest/release-logs/route.ts` (MODIFIED), after `db.insert(releaseLogs)`. Fetch the commit message via GitHub App API (`GET /repos/{owner}/{repo}/commits/{sha}`), parse, upsert links.

**GitHub fetch for commit message:** `dispatchWorkflow` already shows the pattern for GitHub App authenticated fetch. A new exported helper `getCommitMessage(owner, repo, sha)` in `github-app.ts` (or a small addition inline in the ingest route) makes the GET request. This requires the GitHub App to have `contents:read` permission — already granted per `SCHEMA-03`.

**Failure mode:** If GitHub is unreachable or the SHA is invalid, log the error and continue — ingest must not fail because of commit message parsing. Links can be created manually via the authoring UI.

**Authoring UI changes:** In `/admin/modules/release-logs` (MODIFIED), the release creation/edit form shows detected link candidates (read from `release_log_links WHERE source='auto'`) plus a manual add/remove interface. The manual interface writes `release_log_links` rows with `source='manual'`.

#### 4c. Bug/Feature Detail Pages: "Released In" Query

**No new tables required.** The query is:

```sql
SELECT rl.version, rl.env, rl.deployed_at
FROM release_log_links rll
JOIN release_logs rl ON rl.id = rll.release_id
WHERE rll.bug_id = $bugId
ORDER BY rl.deployed_at DESC
```

Run on the bug detail page (currently no detail page — backlog item `BUG-03` deferred). For v2.1, add a lightweight "Released in" section to the existing bug/feature list row expansion or a new detail route at `/admin/modules/bug-reports/[id]` and `/admin/modules/feature-requests/[id]`.

These detail pages are NEW server components with a single join query. The "released in vX.Y dev / vA.B prod" display is computed server-side from the env column.

---

### Feature 5: What's-Changed Between Dev and Prod

**No new tables needed.** Pure SQL derived from existing data.

**Query:**

```sql
-- Releases deployed to dev after the latest prod deploy for this project
SELECT rl.*
FROM release_logs rl
WHERE rl.project = $project
  AND rl.env = 'dev'
  AND rl.deployed_at > (
    SELECT COALESCE(MAX(deployed_at), '1970-01-01')
    FROM release_logs
    WHERE project = $project AND env = 'prod'
  )
ORDER BY rl.deployed_at DESC
```

**Where this runs:**
- Admin pipeline page (`/admin/modules/pipeline/[slug]`) — NEW server component, compact view in a "Pending Changes" section.
- Customer releases page (`/projects/[slug]/releases`) — MODIFIED: a summary card at the top of the page, above the branch sections. Server-fetched, no client state. Shows count + version range + entry snippet.
- Admin home `/admin` — optional future addition via the project health tile; out of scope for Phase 1.

**Implementation:** A shared server-side query helper `getUnreleasedDevChanges(projectKey: string)` in `src/lib/release-sync.ts` (which already exists — MODIFIED or a sibling `release-delta.ts`). Returns `ReleaseRow[]`. Each call site decides how much to render.

---

### Feature 6: Discoverability Fixes

**Pure UI changes — zero schema, zero new API routes.**

- `/admin` page Project Health tile: wrap each tile in a `<Link href="/projects/${p.key}/releases">` (currently `<div>`).
- Customer releases page: the existing `PreviewLink` component already renders preview URLs. The dev backend URL (the FAH dev backend hostname) needs to surface in the UI. This is stored as `metadata.previewUrl` on the most recent dev release row — already available.
- Per-project dev URL: staff should see the FAH dev backend URL without opening a release row. Add a column to the admin pipeline page or the project list page.

---

## Build Order and Dependencies

The features have a clear dependency graph. This determines phase sequencing.

```
[1] Schema: release_log_links table + projects lock columns
    (blocks: tracker linkage UI, branch swap)

[2] Admin home: prod/dev split + pending count + project tile links
    (depends on: nothing — pure query change; no schema change)
    (independent of Feature 1 — can ship in Phase 1)

[3] Per-project pipeline page /admin/modules/pipeline/[slug]
    (depends on: Feature 2's data is nice-to-have; can ship without branch swap)
    (reuses: groupIntoSections from customer page)

[4] Web-UI Promote button
    (depends on: nothing new — reuses promoteAndAudit + requireStaff)
    (can ship: as soon as the admin pipeline page exists to host the button)
    (independent of schema changes)

[5] What's-changed view
    (depends on: nothing — pure query on existing data)
    (can ship: alongside Feature 3 on the pipeline page, or standalone)

[6] commit-parser lib + ingest route auto-stamp
    (depends on: [1] release_log_links table must exist)
    (blocks: auto-populated link data in the authoring UI)

[7] Tracker linkage authoring UI (release-logs page)
    (depends on: [1] schema, [6] commit parser)

[8] Bug/feature detail pages with "released in"
    (depends on: [1] schema, [7] data must exist to be useful)

[9] Branch preview swap
    (depends on: [1] projects lock columns)
    (needs: Firebase App Hosting programmatic API research spike first)

[10] Customer page: entry type filter + what-changed summary + branch swap UI
    (depends on: [5] what-changed query, [9] branch swap API)
    (entry type filter is independent — can ship before [9])
```

**Recommended phase structure based on dependencies:**

| Phase | Features | Schema Changes | Independent? |
|-------|----------|---------------|-------------|
| Phase 1 | Admin home pipeline split + project tile links + discoverability fixes | None | Yes — ship first |
| Phase 2 | Per-project pipeline page + what-changed view + Web-UI Promote button | None | Yes — no schema needed |
| Phase 3 | Schema: `release_log_links` + `projects` lock columns | YES — `release_log_links` table + 2 `projects` columns | Gate for Phase 4+ |
| Phase 4 | commit-parser + ingest auto-stamp + tracker linkage authoring UI | None (uses Phase 3 schema) | Blocked on Phase 3 |
| Phase 5 | Bug/feature detail pages | None | Blocked on Phase 4 (needs data) |
| Phase 6 | Branch preview swap (with Firebase API research) | None (uses Phase 3 lock columns) | Blocked on Phase 3 + research spike |
| Phase 7 | Customer page: entry type filter + what-changed summary + branch swap UI | None | Blocked on Phases 5+6 |

**Phases 1 and 2 can ship with zero schema migrations.** This is significant — the admin pipeline visibility improvements go live before any DB migration risk. Schema changes are isolated to Phase 3, after which Phases 4–7 build on stable ground.

---

## New vs Modified Components

### New Files

| File | Purpose |
|------|---------|
| `src/app/admin/modules/pipeline/[slug]/page.tsx` | Per-project pipeline server component |
| `src/app/admin/modules/pipeline/[slug]/PipelineClient.tsx` | Branch swap in-flight state island |
| `src/app/api/admin/releases/[id]/promote/route.ts` | Web-UI promote endpoint |
| `src/app/api/projects/[slug]/branch/preview/route.ts` | Branch preview swap endpoint |
| `src/app/admin/modules/bug-reports/[id]/page.tsx` | Bug detail with "released in" |
| `src/app/admin/modules/feature-requests/[id]/page.tsx` | Feature detail with "released in" |
| `src/lib/commit-parser.ts` | Commit message regex parser |
| `src/lib/release-delta.ts` | `getUnreleasedDevChanges()` shared query helper |
| `src/components/PromoteButton.tsx` | Reusable staff-only promote button island |
| `src/components/BranchSwapClient.tsx` | Customer branch selector with concurrency lock UI |

### Modified Files

| File | What Changes |
|------|-------------|
| `src/app/admin/page.tsx` | `getDashboardStats` extended; ProjectHealth tile extended with prod/dev split, pending count, link |
| `src/app/projects/[slug]/releases/page.tsx` | Add what-changed query; pass to `ReleasesClient`; add entry type filter state |
| `src/app/projects/[slug]/releases/ReleasesClient.tsx` | Entry type filter state; what-changed summary card; branch swap button per section header |
| `src/app/projects/[slug]/releases/types.ts` | Extend `ReleaseRow` with `links: ReleaseLink[]` field |
| `src/app/projects/[slug]/releases/BranchSection.tsx` | Branch swap button in section header; filter applies to entries |
| `src/app/api/platform/ingest/release-logs/route.ts` | Post-insert: call commit parser + upsert `release_log_links` |
| `src/app/admin/modules/release-logs/` | Link display in release rows; manual add/remove link UI |
| `src/db/schema.ts` | Add `releaseLogLinks` table + relations; add lock columns to `projects` |
| `src/lib/release-promotion.ts` | Extract Slack channel/ts lookup to reusable helper callable without Slack origin context |

### Schema Changes (Phase 3 Only)

**New table `release_log_links`** — see schema definition in Feature 4a above.

**New columns on `projects`:**
- `preview_branch_locked varchar(256)` — nullable; current branch being previewed
- `preview_branch_locked_at timestamp with timezone` — nullable; when the lock was set (enables timeout clearing after 15 minutes)

**No changes to `release_logs`** — the entries JSONB is not extended. Links are in the join table.

**No changes to `bug_reports` or `feature_requests`** — the "released in" query comes from `release_log_links` pointing at these tables, not from new columns on those tables.

---

## Auth Model by Route

| Route | Auth Check | Role Required | Notes |
|-------|-----------|--------------|-------|
| `GET /admin/modules/pipeline/[slug]` | `requireStaff()` | staff | Reuses existing staff pattern |
| `POST /api/admin/releases/[id]/promote` | `requireStaff()` | staff | Web promote is staff-only; customer admins use the approval flow |
| `POST /api/projects/[slug]/branch/preview` | `requireSignedIn()` + membership + role check | admin (per project) | Customer admin drives previews; viewer cannot |
| `GET /admin/modules/bug-reports/[id]` | `requireStaff()` | staff | Bug detail is admin-only |
| `GET /admin/modules/feature-requests/[id]` | `requireStaff()` | staff | Feature detail is admin-only |
| `POST /api/platform/ingest/release-logs` | `requireApiKey()` | CI/CD Bearer token | Unchanged; commit parsing runs server-side post-insert |

---

## Architectural Patterns

### Pattern 1: Server Component Fetches All, Client Island Handles Actions

**What:** Server components fetch all data at render time (no loading states, no client-side fetches on mount). Client components (`*Client.tsx`) receive typed props and handle only user interactions (button clicks, filter changes, fetch-on-action).

**When to use:** Everywhere in this codebase. This is the established pattern — `ReleasesClient`, `SlackAuditClient` already follow it.

**Trade-offs:** Page-level revalidation is via `router.refresh()` after mutations. No streaming, no Suspense boundaries needed for these pages. Works well for this use case.

### Pattern 2: Shared Business Logic in `src/lib/`, Not in Route Handlers

**What:** Route handlers call lib functions (`approveRelease`, `promoteAndAudit`, `recordSlackAudit`) rather than duplicating logic inline. The lib functions are independently testable.

**When to use:** Any logic that could be called from multiple entry points (Slack handler + web handler, ingest route + backfill route). The web-UI promote route MUST reuse `promoteAndAudit` rather than reimplementing dispatch + audit inline.

**Trade-offs:** Requires careful design of function signatures to be context-agnostic. `promoteAndAudit` currently takes Slack-specific `channelId`/`messageTs` parameters. For the web promote path, these may need to be nullable with a fallback notification strategy (or the function can skip the Slack thread reply when `channelId` is null).

### Pattern 3: DB-Backed Locks for Cross-Request State

**What:** Any state that must persist across serverless invocations (concurrency locks, in-flight flags) goes in the database, not in-process Maps or module-level variables.

**When to use:** Branch preview swap concurrency. The existing `inflight` Promise in `github-app.ts` is intentionally process-local (token cache for same-request reuse). Branch swap state must survive across requests.

**Trade-offs:** One extra DB round-trip per swap request. Acceptable — swap is not high frequency.

---

## Anti-Patterns

### Anti-Pattern 1: Extending `entries[]` JSONB for Structured Links

**What people do:** Add `{ bug_id: "uuid", feature_id: "uuid" }` fields to the entries JSONB array on `release_logs`.

**Why it's wrong:** The entries array is written by CI at ingest time and is not easily queryable. You cannot efficiently find "all releases that fixed BUG-123" by scanning JSONB arrays. Index-based queries on a join table are O(1); JSONB containment queries are O(n).

**Do this instead:** `release_log_links` join table with indexed FK columns.

### Anti-Pattern 2: Reimplementing Promote Logic in the Web Route

**What people do:** Copy the `dispatchWorkflow` call and Slack notification from `release-promotion.ts` into the new web promote route handler.

**Why it's wrong:** Creates two code paths for the same business operation. When the Slack promote path is updated (e.g., new Slack notification format), the web path silently diverges.

**Do this instead:** Call `promoteAndAudit()` directly from the web route handler. Adjust the function signature if needed to handle nullable Slack context.

### Anti-Pattern 3: In-Process Mutex for Branch Swap Concurrency

**What people do:** Use a `Map<string, boolean>` at module level to track in-flight preview swaps.

**Why it's wrong:** Firebase App Hosting runs the Next.js app as a serverless function. Multiple instances can be active simultaneously. A module-level Map is not shared across instances.

**Do this instead:** DB row lock on `projects.preview_branch_locked`. Rely on Firebase App Hosting's own 409 as the final guard; the DB lock provides UI feedback before the API call.

---

## Integration Points

### External Services

| Service | Integration Pattern | New for v2.1? |
|---------|---------------------|--------------|
| GitHub Actions API | `dispatchWorkflow()` via `github-app.ts` — existing pattern | No — reused as-is |
| GitHub Commits API | `GET /repos/{owner}/{repo}/commits/{sha}` — new call for commit message fetch | Yes — new call in ingest route |
| Firebase App Hosting Rollouts API | REST or `googleapis` SDK — programmatic branch swap | Yes — needs research spike |
| Slack API | `postSlackThreadedReply` / `updateSlackMessage` — existing helpers | No — reused via `promoteAndAudit` |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Web promote route → `promoteAndAudit` | Direct function call | May need signature adjustment for nullable Slack context |
| Ingest route → commit parser | Direct function call post-insert | Failure must not block ingest return |
| Customer page → branch swap route | `fetch POST` from client component | Concurrency state reflected via DB lock read on page re-render |
| Pipeline page → what-changed query | Shared `getUnreleasedDevChanges()` helper | Called server-side; no API route needed |

---

## Open Questions / Research Flags

1. **Firebase App Hosting programmatic rollout API** — The CLI `firebase apphosting:rollouts:create --git-branch` is documented. The REST API for calling this from a Next.js route handler (without spawning a child process) is not clearly documented. Options: (a) `googleapis` Node SDK `firebaseapphosting.v1beta.projects.locations.backends.rollouts.create`, (b) spawn `firebase` CLI as a child process (fragile in serverless), (c) GitHub Actions workflow dispatch to trigger the swap (roundabout but reliable). This is the highest-risk unknown in v2.1 and should be spiked in Phase 6 before committing to a design.

2. **`promoteAndAudit` signature for web context** — Currently requires `channelId` and `messageTs` (Slack message coordinates for threaded reply). The web-initiated promote has no Slack message to thread onto. Either: (a) make these nullable and skip the threaded reply, posting a new Slack message instead; (b) split the function into `dispatchPromotion` (pure GitHub dispatch + DB audit) and `notifySlack` (separate call). Option (b) is cleaner for future flexibility.

3. **Entry type classification in `entries[]` JSONB** — The customer page entry type filter (`bug fix` / `feature release` / `other`) needs a `type` field on each entry in the JSONB array. CI currently writes free-text entries. Either CI must start classifying entries at ingest time, or the filter derives type from `release_log_links` (if a release has a linked bug, it's a "bug fix"). The link-based derivation is more robust and requires no CI changes.

---

## Sources

- Direct codebase analysis: `src/db/schema.ts`, `src/lib/github-app.ts`, `src/lib/release-promotion.ts`, `src/lib/release-actions.ts`, `src/lib/auth-context.ts`, `src/lib/api-auth.ts`
- Direct codebase analysis: `src/app/admin/page.tsx`, `src/app/projects/[slug]/releases/page.tsx`, `src/app/projects/[slug]/releases/types.ts`, `src/app/projects/[slug]/releases/group-sections.ts`
- Direct codebase analysis: `src/app/api/projects/[slug]/releases/[releaseId]/approve/route.ts`, `src/app/api/platform/ingest/release-logs/route.ts`, `src/app/api/slack/interact/route.ts`
- `.planning/PROJECT.md` — milestone context and constraints
- `.planning/REQUIREMENTS.md` — v2.0 shipped requirements, patterns to follow

---

*Architecture research for: Triarch Dev Admin v2.1 Pipeline UI integration*
*Researched: 2026-05-07*
