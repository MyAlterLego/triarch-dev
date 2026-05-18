# Phase 36: Inclusion Approval State Machine — Research

**Researched:** 2026-05-18
**Domain:** Drizzle schema additions + CHECK constraints on CRDB; Next.js 16 App Router admin + portal pages; commit-parser/link-stamper extension; cross-repo HMAC fetch; PKG-04 shared-package versioning
**Confidence:** HIGH

## Summary

Phase 36 is *plumbing on a heavily-paved road* — every primitive the phase needs already exists in the codebase, established by v2.1 Phase 11 (commit-parser + link-stamper), v2.2 Phase 22 (HMAC internal-dispatch), v2.0 Phase 4 (`workflow_transitions` audit), and v1.14 (`releases/promoted` atomic transaction). The phase ships **one schema migration**, **one new admin page**, **one extension to `link-stamper.ts`**, **one extension to `releases/promoted/route.ts`**, **one new admin GET endpoint**, and **one new portal page**. There is nothing genuinely novel here; the risk surface is integration correctness and not regressing the 100% v2.1 Phase 11 test baseline.

The single biggest design choice the planner faces — already locked in CONTEXT.md — is `varchar(32) + raw-SQL CHECK constraint` over `pgEnum`. This matches the codebase's existing column pattern (`release_logs.status`, `release_log_links.link_type`) and avoids the pgEnum migration ceremony that Drizzle Kit handles awkwardly. The auto-flip integration into `link-stamper.ts` is the most-load-bearing change: it must extend the stamper *after* the existing `insert(releaseLogLinks).values(insertRows)` call without altering the existing return shape or breaking the forgiving try/catch envelope.

**Primary recommendation:** Land schema first (Wave 1), then commit-parser/prod-ingest auto-flip (Wave 2 — extends existing tests), then admin UI (Wave 3), then portal `/upcoming` (Wave 4). Schema changes ship through `packages/triarch-shared/src/schema.ts` and trigger the PKG-04 publish gate — coordinate the shared-package version bump in the same PR that introduces the columns.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Schema & State Machine:**
- Use `varchar(32)` column with DB CHECK constraint for `inclusion_state` — matches existing `bug_reports.status` / `release_logs.status` pattern; avoids PG enum migration pain
- Allow backward transitions, but only via the INCL-05 "Remove from build" action (`approved_for_build → pending_inclusion`); auto-flips (`built`, `deployed`) are forward-only and driven by commit/deploy ingestion
- Commits referencing items NOT in `approved_for_build` (still `triaged`/`pending_inclusion`): still write `release_log_links` row (preserves v2.1 commit-parser behavior) but do NOT flip `inclusion_state`; log soft-warning to commit-parser stats so staff sees orphan-link signal
- All `inclusion_state` transitions audit via existing `workflow_transitions` table — `entity_type='bug_report'`/`'feature_request'`, from/to state captured, transitionedBy + reason populated

**Admin UI Placement & UX:**
- "Propose for next build" / "Approve for build" actions live on the detail page primary, with a compact dropdown action on list rows for triage speed — mirrors v2.1 Phase 12 detail-page pattern
- Bug/feature list pages gain a dedicated `Inclusion` column with color-coded pills: violet=`approved_for_build`, teal=`built`, blue=`deployed`, zinc=`triaged`/`pending_inclusion` — parallels v2.1 status column treatment
- `/admin/modules/next-build-plan/{slug}` page = single table grouping bugs + features mixed (sorted by approval date desc) with `?type=` filter chips reusing v2.1 FilterChips pattern
- No bulk action support — single-row "Remove from build" only; TMI pilot has low item count, bulk-ops deferred to post-pilot review

**Customer Portal /upcoming Page:**
- Display items in `approved_for_build` + `built` states (both are "coming next"); exclude `triaged`/`pending_inclusion` (still under staff consideration)
- Same `getProjectAccess(slug)` membership gating as `/releases` — 404 for non-members (no membership-existence leak; matches PORTAL-03)
- Customer-visible fields: title + type-pill (bug/feature) + severity (bugs only) + state pill (approved/built) + relative timestamp on state change. NO `triarchNotes`, NO internal Slack thread references
- New admin endpoint `GET /api/portal/projects/{slug}/upcoming` (per INCL-08 spec); portal fetches via existing HMAC internal-call pattern from Phase 22 (admin authoritative for inclusion data)

**Auto-Flip Integration with v2.1 Commit-Parser & Prod-Deploy Path:**
- `built → deployed` batch-flip on prod ingest lives in the same transaction as the release row status update in `src/app/api/releases/promoted/route.ts` (atomic with the promotion, matches the existing transaction pattern at lines 81-103)
- Idempotency on re-ingestion enforced via WHERE clause: `inclusion_state='built' AND next_release_log_id=<row.id>` — re-runs are no-ops because already-deployed rows don't match the filter
- Auto-flip writes audit row to `workflow_transitions`: `transitionedBy='commit-parser:{commit_sha}'`, `reason='auto-flip from commit'`, `from_state='approved_for_build'`, `to_state='built'`
- `next_release_log_id` stamping uses the DEV release_logs row at commit-ingest time — preserves "which dev release first carried this item"; prod join is reached via `release_logs.version` lookup at deploy time without losing original dev-row provenance

### Claude's Discretion

- File layout for new admin page (server component patterns, table extraction)
- Specific column ordering / pill copy text within UI guidelines (violet/teal/blue/zinc tokens already locked)
- Exact migration sequencing (single migration vs split add-column + check-constraint)
- Vitest test file organization for new commit-parser branch + new transition paths
- Whether to extract a `src/lib/inclusion-state.ts` helper module or inline transitions

### Deferred Ideas (OUT OF SCOPE)

- Bulk "approve all" / "remove all from build" actions — defer to post-30-day-dogfooding review (low TMI item count makes it premature)
- Bug/feature typeahead picker in admin (pre-existing v2.1 limitation, explicit v2.4 out-of-scope)
- Customer-side `inclusion_state` mutation (approve/reject by customer) — explicit v2.4 out-of-scope, v3.0 candidate
- Hard inclusion gate (prod deploy refuses commits without `approved_for_build` ancestor) — v3.0 candidate per soft-vs-hard decision deferred to dogfooding review
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| INCL-01 | `bug_reports` + `feature_requests` get `inclusion_state` column (varchar(32), default `triaged`, CHECK constraint) with 7 allowed values | Schema additions in `packages/triarch-shared/src/schema.ts`; CHECK constraint appended to drizzle-generated migration as raw SQL (existing pattern from migration 0016) |
| INCL-02 | Both tables get nullable `next_release_log_id` UUID FK → `release_logs.id` | Standard Drizzle FK pattern; CASCADE is wrong here (deleting a release shouldn't null the FK — use `set null` to preserve the bug/feature row); see Pitfall 2 |
| INCL-03 | Staff move `triaged → pending_inclusion` via "Propose for next build" action on bug/feature list+detail pages | Reuse PATCH `/api/platform/bug-reports/[id]` and `/api/platform/feature-requests/[id]` (already exist); add `inclusion_state` to the PATCH allowlist + `workflow_transitions` write |
| INCL-04 | Staff move `pending_inclusion → approved_for_build OR deferred` via admin approval action | Same PATCH endpoints; transition validation lives in a new helper (`src/lib/inclusion-state.ts` recommended — see Discretion section) |
| INCL-05 | New `/admin/modules/next-build-plan/[slug]/page.tsx` staff page lists `approved_for_build` items with "Remove from build" action | Server component pattern matches existing `/admin/modules/pipeline/[slug]/page.tsx`; FilterChips reused from `src/app/projects/[slug]/releases/FilterChips.tsx` |
| INCL-06 | Commit-parser extension: when commit references item in `approved_for_build`, flip → `built` and stamp `next_release_log_id` | Extend `src/lib/link-stamper.ts` AFTER the existing `db.insert(releaseLogLinks).values(insertRows)` call (line 145); add a same-transaction UPDATE; `parseCommitRefs` itself unchanged |
| INCL-07 | When release_logs row transitions to `status='promoted'`, batch-flip `built → deployed` for items where `next_release_log_id = release.id AND inclusion_state='built'` | Extend `src/app/api/releases/promoted/route.ts` transaction at lines 81-103; add `tx.update(bugReports)...` and `tx.update(featureRequests)...` before `return inserted` |
| INCL-08 | Read-only `/projects/[slug]/upcoming` portal page lists `approved_for_build` + `built`; admin endpoint `GET /api/portal/projects/[slug]/upcoming` is source of truth | Portal page mirrors `src/app/projects/[slug]/releases/page.tsx` shape (auth → membership → fetch → render); admin endpoint reuses HMAC verify from `src/app/api/internal/dispatch/route.ts` |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| next | 16.2.6 | App Router server components, route handlers | Already in admin + portal; do not introduce a different framework |
| drizzle-orm | ^0.45.2 | Type-safe SQL, transactions, query builder | Existing ORM; schema lives in `packages/triarch-shared/src/schema.ts` |
| drizzle-kit | ^0.31.10 | Migration generation (`db:generate`), apply (`db:push`) | Existing migration tooling; outputs SQL into `src/db/migrations/` |
| vitest | ^4.1.5 | Unit + integration tests (`npx vitest run`) | All existing v2.x tests use Vitest; colocated `*.test.ts` next to source |
| @triarchsecurity/triarch-shared | ^0.3.0 (bump to 0.4.0 in this phase) | Shared schema + helpers (HMAC, auth-context) consumed by admin AND portal | Schema must live here so portal sees the new columns without admin/portal drift |

### Supporting (already in repo)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @triarchsecurity/secrets | ^0.1.0 | `getSecret('INTERNAL_HMAC_SECRET')` access | When the new portal→admin endpoint needs the HMAC secret |
| next-auth | ^4.24.14 | Admin session (`getServerSession(authOptions)`) | Staff-only guard on admin pages + endpoints |
| lucide-react | (existing) | Icons for new admin page actions | Match existing `Bug, ChevronDown` import style in bug-reports/page.tsx |

### Alternatives Considered
| Instead of | Could Use | Tradeoff (and why we reject) |
|------------|-----------|------------------------------|
| `varchar(32)` + raw SQL CHECK | `pgEnum('inclusion_state', [...])` from drizzle-orm/pg-core | Rejected by CONTEXT.md D-01. PG enums require `ALTER TYPE ... ADD VALUE` (non-transactional in older PG; CRDB has limited enum support); altering values triggers a full table rewrite. Codebase precedent is `varchar + CHECK` for every status column. |
| Drizzle's native `check()` helper in pgTable | Raw SQL `ALTER TABLE ... ADD CONSTRAINT` appended to generated migration | Drizzle 0.45 + Kit 0.31 SUPPORT `check()` natively (`import { check } from 'drizzle-orm/pg-core'`). However codebase precedent for `release_log_links_link_type_discriminant` is raw-SQL append (migration 0016). Stay consistent. |
| New `inclusion_events` table for audit | Reuse `workflow_transitions` (already exists, entity-agnostic) | CONTEXT.md D-04: workflow_transitions already accepts arbitrary entity_type. No new table needed. |
| Server actions for state transitions | Existing PATCH `/api/platform/bug-reports/[id]` etc. | Existing admin pages use `fetch('/api/platform/...')` PATCH pattern (see bug-reports/page.tsx:72). Match it. |

**Installation:** No new dependencies. Only a coordinated bump:

```bash
# In packages/triarch-shared/package.json (after schema change lands)
npm version minor   # 0.3.x → 0.4.0  (matches "schema-additive" convention)
# Then commit + tag shared/v0.4.0; CI publish-shared.yml fires on tag push
# Admin + portal package.json pinned dep updates from ^0.3.0 → ^0.4.0 in same PR or follow-up
```

**Version verification:**
- `next`: 16.2.6 (verified in package.json; Next.js 16 App Router patterns required — read `node_modules/next/dist/docs/` for any new code per workspace CLAUDE.md)
- `drizzle-orm`: ^0.45.2 (verified in package.json)
- `drizzle-kit`: ^0.31.10 (verified in package.json — supports `check()` helper; we choose raw-SQL append for codebase consistency)

## Architecture Patterns

### Recommended Project Structure

```
admin/
├── packages/triarch-shared/src/schema.ts       # ← ADD inclusion_state + next_release_log_id to bugReports + featureRequests
├── src/db/migrations/
│   ├── 0020_inclusion_state.sql                # ← NEW — drizzle-generated column additions
│   └── 0020_inclusion_state_check.sql          # ← OR fold both into one migration (Discretion)
├── src/lib/
│   ├── commit-parser.ts                        # ← UNCHANGED — pure regex layer
│   ├── link-stamper.ts                         # ← EXTEND after line 145 with auto-flip + workflow_transitions write
│   ├── link-stamper.test.ts                    # ← EXTEND existing test suite, do not replace
│   └── inclusion-state.ts                      # ← NEW (recommended) — transition validator + audit helper
├── src/app/
│   ├── admin/modules/
│   │   ├── next-build-plan/[slug]/page.tsx     # ← NEW — INCL-05 page
│   │   ├── bug-reports/page.tsx                # ← EXTEND — add Inclusion column + dropdown action
│   │   ├── bug-reports/[id]/page.tsx           # ← EXTEND — add Propose/Approve action buttons
│   │   ├── feature-requests/page.tsx           # ← EXTEND — same
│   │   └── feature-requests/[id]/page.tsx      # ← EXTEND — same
│   └── api/
│       ├── platform/bug-reports/[id]/route.ts       # ← EXTEND — PATCH allowlist gains inclusion_state
│       ├── platform/feature-requests/[id]/route.ts  # ← EXTEND — same
│       ├── releases/promoted/route.ts               # ← EXTEND — built→deployed flip inside existing tx
│       └── portal/projects/[slug]/upcoming/route.ts # ← NEW — INCL-08 admin authoritative endpoint

portal/
├── src/app/projects/[slug]/upcoming/page.tsx   # ← NEW — INCL-08 customer-facing page
└── src/lib/internal-dispatch.ts                # ← READ — pattern for admin→portal HMAC fetch (we invert it here)
```

### Pattern 1: Drizzle Schema Addition with Raw-SQL CHECK

**What:** Add new columns to existing tables, then append a raw-SQL CHECK constraint to the drizzle-generated migration.

**When to use:** Every status-like enum column in this codebase. Matches `release_log_links.link_type` (migration 0016) and `release_logs.status` precedent.

**Example (schema.ts addition):**
```typescript
// Source: existing pattern at packages/triarch-shared/src/schema.ts:305 (bugReports)
export const bugReports = pgTable('bug_reports', {
  // ... existing columns ...
  status: varchar('status', { length: 32 }).notNull().default('submitted'),

  // ── v2.4 Phase 36 INCL-01: inclusion state machine ──
  inclusionState: varchar('inclusion_state', { length: 32 }).notNull().default('triaged'),
  // ── v2.4 Phase 36 INCL-02: which release shipped this item ──
  nextReleaseLogId: uuid('next_release_log_id').references(() => releaseLogs.id, { onDelete: 'set null' }),
  // ... rest unchanged ...
});
```

**Example (migration — generated + appended):**
```sql
-- Source: migration 0016_release_log_links_and_preview_lock.sql for the append pattern
-- Step 1: drizzle-kit generate emits these:
ALTER TABLE "bug_reports" ADD COLUMN "inclusion_state" varchar(32) DEFAULT 'triaged' NOT NULL;
ALTER TABLE "bug_reports" ADD COLUMN "next_release_log_id" uuid;
ALTER TABLE "bug_reports" ADD CONSTRAINT "bug_reports_next_release_log_id_release_logs_id_fk"
  FOREIGN KEY ("next_release_log_id") REFERENCES "public"."release_logs"("id") ON DELETE set null ON UPDATE no action;
-- (and same for feature_requests)

-- Step 2: HAND-APPEND the CHECK constraint (drizzle won't generate this unless we use check()):
ALTER TABLE "bug_reports" ADD CONSTRAINT "bug_reports_inclusion_state_check"
  CHECK (inclusion_state IN ('triaged', 'pending_inclusion', 'approved_for_build', 'built', 'deployed', 'deferred', 'rejected'));
ALTER TABLE "feature_requests" ADD CONSTRAINT "feature_requests_inclusion_state_check"
  CHECK (inclusion_state IN ('triaged', 'pending_inclusion', 'approved_for_build', 'built', 'deployed', 'deferred', 'rejected'));

-- Step 3 (recommended): partial index for the INCL-05 page query
CREATE INDEX "bug_reports_project_approved_for_build_idx"
  ON "bug_reports" ("project") WHERE "inclusion_state" = 'approved_for_build';
CREATE INDEX "feature_requests_project_approved_for_build_idx"
  ON "feature_requests" ("project") WHERE "inclusion_state" = 'approved_for_build';
```

### Pattern 2: Link-Stamper Extension (Auto-Flip)

**What:** Add post-insert step inside `stampLinksFromCommit` that flips `inclusion_state` for any validated bug/feature ID currently in `approved_for_build`.

**When to use:** This phase only — extends LINK-02 path.

**Critical insertion point:** AFTER `await db.insert(releaseLogLinks).values(insertRows);` at line 145 of `src/lib/link-stamper.ts`, BEFORE the return statement. The auto-flip is a separate concern and must NOT alter the existing return shape `{ stamped, dropped }` — add an optional field, e.g. `{ stamped, dropped, autoFlipped }`.

**Example sketch (planner refines):**
```typescript
// Source: extends src/lib/link-stamper.ts:144-146

// ── 6. INSERT (batched, single call) — UNCHANGED ──
if (insertRows.length > 0) {
  await db.insert(releaseLogLinks).values(insertRows);
}

// ── 7. NEW: auto-flip approved_for_build → built ─────────────────
// Only operates on validated bug/feature IDs (validBugIds, validFeatureIds Sets)
// that the previous step confirmed exist.
let autoFlipped = 0;
const commitSha = '...';  // NEW PARAM — caller passes from release.commitSha

if (validBugIds.size > 0) {
  const flipped = await db
    .update(bugReports)
    .set({
      inclusionState: 'built',
      nextReleaseLogId: releaseId,
      updatedAt: new Date(),
    })
    .where(and(
      inArray(bugReports.id, [...validBugIds]),
      eq(bugReports.inclusionState, 'approved_for_build'),  // ← state guard: only forward-flip
    ))
    .returning({ id: bugReports.id });
  autoFlipped += flipped.length;

  // Audit each flip
  if (flipped.length > 0) {
    await db.insert(workflowTransitions).values(flipped.map(f => ({
      entityType: 'bug_report',
      entityId: f.id,
      fromStatus: 'approved_for_build',
      toStatus: 'built',
      transitionedBy: `commit-parser:${commitSha}`,
      reason: 'auto-flip from commit',
      metadata: { releaseLogId: releaseId },
    })));
  }
}
// Same block for featureRequests
```

**Caller signature change:** `stampLinksFromCommit` must accept `commitSha?: string` (optional for back-compat; the ingest route already has it on `release.commitSha`).

### Pattern 3: Prod-Ingest Transaction Extension (built → deployed)

**What:** Inside the existing `db.transaction(async (tx) => { ... })` at lines 81-103 of `src/app/api/releases/promoted/route.ts`, add two batch UPDATE statements before `return inserted;`.

**Why same transaction:** atomicity — either the prod row is inserted AND the items flip, or neither. Matches the existing pattern of "insert prod row + update dev row status in one tx" (line 81-103).

**Example sketch:**
```typescript
// Source: extends src/app/api/releases/promoted/route.ts:81-104
const newProdRow = await db.transaction(async (tx) => {
  const [inserted] = await tx
    .insert(releaseLogs)
    .values({ /* unchanged */ })
    .returning();

  await tx
    .update(releaseLogs)
    .set({ status: 'promoted' })
    .where(eq(releaseLogs.id, devRow.id));

  // ── NEW: batch-flip built → deployed ────────────────────────────────
  // Idempotency: the WHERE clause on next_release_log_id = devRow.id + inclusion_state='built'
  // means a re-ingest of the same prod row matches NO rows (already deployed), so it's a no-op.
  const flippedBugs = await tx
    .update(bugReports)
    .set({ inclusionState: 'deployed', updatedAt: new Date() })
    .where(and(
      eq(bugReports.nextReleaseLogId, devRow.id),
      eq(bugReports.inclusionState, 'built'),
    ))
    .returning({ id: bugReports.id });

  const flippedFeats = await tx
    .update(featureRequests)
    .set({ inclusionState: 'deployed', updatedAt: new Date() })
    .where(and(
      eq(featureRequests.nextReleaseLogId, devRow.id),
      eq(featureRequests.inclusionState, 'built'),
    ))
    .returning({ id: featureRequests.id });

  // Audit transitions (still inside tx for atomicity)
  const auditRows = [
    ...flippedBugs.map(b => ({ entityType: 'bug_report', entityId: b.id, fromStatus: 'built', toStatus: 'deployed', transitionedBy: `prod-ingest:${commit_sha}`, reason: 'auto-flip on prod deploy', metadata: { prodReleaseLogId: inserted.id } })),
    ...flippedFeats.map(f => ({ entityType: 'feature_request', entityId: f.id, fromStatus: 'built', toStatus: 'deployed', transitionedBy: `prod-ingest:${commit_sha}`, reason: 'auto-flip on prod deploy', metadata: { prodReleaseLogId: inserted.id } })),
  ];
  if (auditRows.length > 0) {
    await tx.insert(workflowTransitions).values(auditRows);
  }

  return inserted;
});
```

Note `next_release_log_id` points at the **dev** row (`devRow.id`), per CONTEXT.md D-13. Prod has its own release_logs row but is reached via the dev↔prod version join.

### Pattern 4: Portal Page + Admin HMAC Endpoint

**What:** Portal page renders the "what's coming" view by fetching from a new admin endpoint. CONTEXT.md D-08 specifies HMAC-signed internal call.

**However — observe** the existing v2.2 Phase 22 HMAC pattern (`portal/src/lib/internal-dispatch.ts` → `admin/src/app/api/internal/dispatch/route.ts`) is portal-ORIGIN-WRITE (portal triggers an admin write). For INCL-08 we want portal-ORIGIN-READ (portal asks admin to read inclusion data). The same `signRequest` / `verifyRequest` helpers from `@triarchsecurity/triarch-shared/internal-hmac` apply — the body just carries `projectKey` and a read-intent (no branch/version needed). **Critical:** `InternalHmacBody` type currently REQUIRES `branch`, `version`, `releaseId` etc. — we have two options:

1. **Loosen the type** in the shared package (add an optional `intent: 'read_upcoming' | 'dispatch_promotion'` discriminator). This is a shared-package change → PKG-04 bump.
2. **Pass placeholder strings** like `branch: 'n/a', version: 'n/a', releaseId: '<project-uuid>'`. Ugly but ships without touching shared HMAC schema.

**Recommendation:** Option 1 — extend `InternalHmacBody` to a discriminated union. We're already touching the shared package for the schema columns; the bump is already happening.

**Alternative:** Skip HMAC entirely for read-only `GET /api/portal/projects/[slug]/upcoming` and protect with a different mechanism (per-app `PORTAL_BEARER_TOKEN`). CONTEXT.md D-08 says "HMAC internal-call pattern" — we honor that.

### Anti-Patterns to Avoid

- **DO NOT** add `inclusion_state` to admin's `src/db/schema.ts` admin-local-additions file. Schema must live in `packages/triarch-shared/src/schema.ts` so portal sees it. Anything bug/feature-related is portal-visible.
- **DO NOT** rewrite `commit-parser.ts`. Pure-regex layer is locked by v2.1 Phase 11 100% test baseline. The extension lives in `link-stamper.ts`.
- **DO NOT** add a new transaction in `releases/promoted/route.ts`. Extend the existing `db.transaction(async (tx) => { ... })` block. Two transactions = two failure modes = lost atomicity.
- **DO NOT** introduce server actions for the state transitions. The admin codebase pattern is `fetch('/api/platform/...')` PATCH from `'use client'` components (see bug-reports/page.tsx:72).
- **DO NOT** use `notFound()` from the API route. Use `NextResponse.json({ error: 'not_member' }, { status: 404 })`. notFound() is for page server components only.
- **DO NOT** allow the customer portal to write to `inclusion_state`. Read-only is a hard v2.4 constraint.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| State-transition audit table | New `inclusion_events` table | Existing `workflowTransitions` (schema.ts:356) | Already entity-agnostic; INCL-04 spec accepted; one less table to maintain |
| HMAC signing for portal→admin | Custom signing | `signRequest` + `verifyRequest` from `@triarchsecurity/triarch-shared/internal-hmac` | Battle-tested in Phase 22; nonce + skew + canonical bytes already correct |
| Membership gating helper | Per-page DB query | `getCurrentUserContext` from `@triarchsecurity/triarch-shared/auth` + `ctx.memberships.find(m => m.project_key === slug)` | Existing PORTAL-03 pattern at `portal/src/app/projects/[slug]/releases/page.tsx:48-50` |
| API key Bearer auth on admin endpoints | Custom auth | `requireApiKey` from `@/lib/api-key-auth` | Already used by ingest routes; per-project token enforcement |
| Filter chip UI | New chip component | `src/app/projects/[slug]/releases/FilterChips.tsx` (extract or duplicate per Discretion) | Locked-in styling, accessibility, keyboard handling |
| Commit ref parsing | New regex | `parseCommitRefs` from `src/lib/commit-parser.ts` | Pure layer, 100% tested, supports BUG/FEAT UUID + verb-prefix + external #N |
| Bug/feature list+detail server components | New page from scratch | Copy structure from `src/app/admin/modules/bug-reports/{page,[id]/page}.tsx` | Identical auth, layout, color tokens already nailed down |
| Idempotent batch flip on prod ingest | Application-level dedup tracking | WHERE clause `inclusion_state='built' AND next_release_log_id=X` | Re-ingest matches zero rows naturally — no app state needed |

**Key insight:** This phase has near-zero greenfield. Every primitive — schema pattern, audit table, HMAC, membership check, FilterChips, server-component page, transaction extension — already exists. The plan should explicitly cite existing files for each task to prevent executors from inventing parallel solutions.

## Runtime State Inventory

This phase IS additive (new columns, default `triaged` on all rows). No rename, no migration of existing data semantics — but there are pre-existing runtime entities worth checking:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | Existing rows in `bug_reports` + `feature_requests` get `inclusion_state='triaged'` by DEFAULT (DDL handles backfill in one shot). No data migration script needed. | None — DEFAULT clause covers it. |
| Live service config | None — no n8n workflows, no Datadog dashboards reference inclusion columns (they don't exist yet). | None. |
| OS-registered state | None — no scheduled tasks, no pm2 processes reference these tables. | None. |
| Secrets/env vars | New: `ADMIN_INTERNAL_DISPATCH_URL` already exists in portal vault for Phase 22; the upcoming-fetch can reuse it OR get a sibling `ADMIN_PORTAL_API_URL`. `INTERNAL_HMAC_SECRET` already exists. | Verify portal apphosting.yaml binding; no new secret. |
| Build artifacts | `packages/triarch-shared/dist/` — rebuilt by publish-shared.yml on `shared/v*` tag push. Admin + portal `package.json` pin must update from `^0.3.0` → `^0.4.0` (or whatever the bump lands at). | Coordinated PR: schema PR bumps shared version + tags; consumer-repo PR updates pin. |

**Pre-existing v2.1 Phase 11 tests must remain GREEN.** Existing tests live at `src/lib/commit-parser.test.ts` (pure regex — unchanged) and `src/lib/link-stamper.test.ts` (stamper extended — extend the test suite, don't rewrite). The plan MUST require an executor checkpoint: `npx vitest run src/lib/link-stamper.test.ts src/lib/commit-parser.test.ts` GREEN before the auto-flip extension is considered done. Success criterion #3 from CONTEXT spec is explicit on this.

## Common Pitfalls

### Pitfall 1: PKG-04 Drift Gate Failure on Unbumped Shared Package
**What goes wrong:** PR touches `packages/triarch-shared/src/schema.ts` but doesn't bump `packages/triarch-shared/package.json` version. The `check-shared-version.yml` workflow fires on the PR and FAILS the check.
**Why it happens:** Easy to forget the version bump when the schema change is the goal.
**How to avoid:** Land the version bump in the SAME commit as the schema change. Use `npm version minor` in `packages/triarch-shared/` to bump from 0.3.x → 0.4.0 (additive schema = minor per existing convention from Phase 23-04 close).
**Warning signs:** PR opens, GitHub Actions runs, "Check shared package version bump" check goes red within 60 seconds.

### Pitfall 2: FK ON DELETE CASCADE on `next_release_log_id`
**What goes wrong:** Cascade-delete of a release_logs row would delete every bug/feature pointing at it. Catastrophic.
**Why it happens:** Drizzle FK definition copy-paste from `release_log_links.bug_id`-style fields where CASCADE is correct (link is owned by release).
**How to avoid:** Use `{ onDelete: 'set null' }` for `next_release_log_id`. The bug/feature row outlives its release; null means "no release tracked yet."
**Warning signs:** Schema review — any FK on bug/feature pointing at release should be `set null`, never `cascade`.

### Pitfall 3: workflow_transitions Audit Row Outside the Transaction
**What goes wrong:** State update happens in tx, audit insert happens outside. If audit fails after tx commits, you have a state change with no audit row. If audit insert is inside the wrong tx, you might leak partial-state.
**Why it happens:** Auditing feels like a "side effect" and gets pushed out of the critical path.
**How to avoid:** Both state UPDATE and audit INSERT live in the SAME `tx` block. The transaction either commits both or rolls back both.
**Warning signs:** Search for `workflowTransitions` writes that are NOT inside a `tx.` call.

### Pitfall 4: Soft-Warning for Orphan Links (CONTEXT D-03) Implementation
**What goes wrong:** Plan forgets to wire the soft-warning. CONTEXT requires that commits referencing items NOT in `approved_for_build` still write `release_log_links` (preserving v2.1 behavior) but emit a stats signal.
**Why it happens:** Easy to interpret "no state flip" as "do nothing extra" and skip the signal.
**How to avoid:** Extend the StampResult return type with `orphanLinks: number` (count of refs that linked but did NOT flip because state wasn't approved). The ingest route at `platform/ingest/release-logs/route.ts:179` should log this counter when non-zero.
**Warning signs:** No test for "BUG-{uuid} where inclusion_state=triaged → link written, no flip, orphanLinks=1."

### Pitfall 5: Idempotent Re-Ingest Breaks if WHERE Clause Drifts
**What goes wrong:** Re-running prod ingest for the same version flips already-deployed items back to "built" or duplicates audit rows.
**Why it happens:** Forgetting the `inclusion_state='built'` guard in the WHERE clause. Without it, the UPDATE matches `inclusion_state='deployed'` rows on second run.
**How to avoid:** WHERE clause MUST include both `next_release_log_id = devRow.id` AND `inclusion_state = 'built'`. Re-runs match zero rows → no-op.
**Warning signs:** Any UPDATE on `inclusionState` that doesn't include the current-state guard in WHERE.

### Pitfall 6: HMAC `InternalHmacBody` Schema Required Fields
**What goes wrong:** Portal `/upcoming` page tries to call admin via HMAC, but the existing `InternalHmacBody` type REQUIRES `branch`, `version`, `releaseId`. None apply for a read-upcoming intent.
**Why it happens:** Phase 22 sized HMAC for the dispatch-promotion case; we're now adding a read case.
**How to avoid:** Either (a) extend `InternalHmacBody` to a discriminated union with `intent: 'dispatch_promotion' | 'read_upcoming'`, OR (b) pass `branch: 'n/a', version: 'n/a', releaseId: '00000000-...'` placeholders. Recommend (a) — same shared-package bump.
**Warning signs:** TypeScript compile error on signRequest call, or runtime "malformed body" 401 from admin verify.

### Pitfall 7: Customer Surface Leaks Staff-Only Fields
**What goes wrong:** Portal `/upcoming` payload includes `triarchNotes`, internal Slack thread refs, `buildPlan`, etc.
**Why it happens:** Easy to SELECT * from bug_reports and forward to client.
**How to avoid:** Admin endpoint EXPLICITLY projects only customer-safe columns: `id, title, severity (bugs only), inclusion_state, updated_at`. Add unique-sentinel test like Phase 23-02 (`renderToStaticMarkup` + asserts staff strings absent from HTML).
**Warning signs:** Portal page imports `bugReports` directly and selects `*`; no explicit field allowlist on admin endpoint response.

### Pitfall 8: List-Page `Inclusion` Column Not Sortable/Filterable
**What goes wrong:** Plan adds the column for display but doesn't extend the bug/feature LIST API to filter by `inclusion_state`. Triage workflow breaks (staff can't find what's pending).
**Why it happens:** Focus on the new page (`/next-build-plan`) eclipses the existing list pages.
**How to avoid:** Extend `/api/platform/bug-reports` GET to accept `?inclusion_state=` param. Mirror existing `?status=` param (see bug-reports/page.tsx:59).
**Warning signs:** No test for `GET /api/platform/bug-reports?inclusion_state=approved_for_build` returning filtered set.

### Pitfall 9: Next.js 16 Async `params` in New Routes
**What goes wrong:** New `[slug]` route handler or page treats `params` as a sync object. Next.js 16 made params asynchronous (returns Promise).
**Why it happens:** Older docs / training data shows sync params.
**How to avoid:** Pattern is `{ params }: { params: Promise<{ slug: string }> }` and `const { slug } = await params;`. See `portal/src/app/projects/[slug]/releases/page.tsx:22-30`.
**Warning signs:** `slug.then is not a function` runtime error, or TypeScript error on `params.slug`.

### Pitfall 10: CRDB CHECK Constraint Adoption on Tables with Existing Rows
**What goes wrong:** Adding a CHECK constraint to a table with existing rows triggers CRDB's background validation. If any row violates, ADD CONSTRAINT fails.
**Why it happens:** Bug_reports has live data; if there's any row with `inclusion_state` outside the allowed set, the constraint fails.
**How to avoid:** This isn't a real risk in OUR case because the column is BEING ADDED with `DEFAULT 'triaged'` (always valid), but plan for executor surprise: order matters — ADD COLUMN (with default) then ADD CONSTRAINT. Both can be in same migration, but the column must materialize first.
**Warning signs:** `db:push` error: "validation failed for constraint inclusion_state_check on N rows."

## Code Examples

### Schema column addition (canonical)
```typescript
// Source: packages/triarch-shared/src/schema.ts — extends existing bugReports
// at line 305 + featureRequests at line 332.

export const bugReports = pgTable('bug_reports', {
  // ... existing 23 columns ...

  // ── v2.4 Phase 36 INCL-01..02 ──
  inclusionState: varchar('inclusion_state', { length: 32 }).notNull().default('triaged'),
  nextReleaseLogId: uuid('next_release_log_id').references(() => releaseLogs.id, { onDelete: 'set null' }),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
```

### State transition helper (recommended)
```typescript
// Source: NEW — src/lib/inclusion-state.ts (Discretion item)

export const INCLUSION_STATES = [
  'triaged', 'pending_inclusion', 'approved_for_build',
  'built', 'deployed', 'deferred', 'rejected'
] as const;
export type InclusionState = typeof INCLUSION_STATES[number];

// Allowed transitions (manual = via admin UI; auto = via parser/ingest)
const MANUAL_TRANSITIONS: Record<InclusionState, InclusionState[]> = {
  triaged: ['pending_inclusion', 'deferred', 'rejected'],
  pending_inclusion: ['approved_for_build', 'deferred', 'rejected'],
  approved_for_build: ['pending_inclusion'],  // INCL-05 "remove from build"
  built: [],          // auto-only
  deployed: [],       // auto-only
  deferred: ['triaged', 'pending_inclusion'],
  rejected: ['triaged'],
};

export function canManuallyTransition(from: InclusionState, to: InclusionState): boolean {
  return MANUAL_TRANSITIONS[from]?.includes(to) ?? false;
}
```

### Admin PATCH allowlist extension
```typescript
// Source: extends src/app/api/platform/bug-reports/[id]/route.ts (existing PATCH)

const ALLOWED_PATCH_FIELDS = ['status', 'severity', 'priority', 'triarchNotes',
  'inclusionState'  // ← ADDED
] as const;

// Then in handler — when inclusionState changes:
if (body.inclusionState && body.inclusionState !== existing.inclusionState) {
  if (!canManuallyTransition(existing.inclusionState, body.inclusionState)) {
    return NextResponse.json({ error: 'invalid_transition' }, { status: 400 });
  }
  await db.transaction(async (tx) => {
    await tx.update(bugReports).set({ inclusionState: body.inclusionState, updatedAt: new Date() }).where(eq(bugReports.id, id));
    await tx.insert(workflowTransitions).values({
      entityType: 'bug_report',
      entityId: id,
      fromStatus: existing.inclusionState,
      toStatus: body.inclusionState,
      transitionedBy: ctx.email,
      reason: body.reason ?? null,
    });
  });
}
```

### Portal page (membership-gated read)
```typescript
// Source: NEW — portal/src/app/projects/[slug]/upcoming/page.tsx
// Mirrors the pattern at portal/src/app/projects/[slug]/releases/page.tsx:20-50

import { notFound, redirect } from 'next/navigation';
import { getCurrentUserContext } from '@triarchsecurity/triarch-shared/auth';
import { getPortalSession } from '@/lib/session';
import { fetchUpcomingFromAdmin } from '@/lib/admin-fetch-upcoming';

export default async function UpcomingPage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await getPortalSession();
  if (!session?.user?.email) redirect('/login');
  const ctx = await getCurrentUserContext({ user: { email: session.user.email } });

  const { slug } = await params;
  const membership = ctx?.memberships.find((m) => m.project_key === slug);
  const isMember = !!ctx && (ctx.isStaff || !!membership);
  if (!isMember) notFound();

  const items = await fetchUpcomingFromAdmin(slug);  // HMAC-signed GET
  return <UpcomingClient items={items} projectSlug={slug} />;
}
```

### Vitest test pattern (extending link-stamper.test.ts)
```typescript
// Source: extends src/lib/link-stamper.test.ts (existing mockDbSelectFromWhere pattern)

it('valid BUG with inclusion_state=approved_for_build → flips to built + audit row written', async () => {
  // 0: bug lookup; 1: feature lookup; 2: projects lookup (skipped — no externals)
  setupSelectResponses({
    0: [{ id: VALID_BUG_UUID, inclusionState: 'approved_for_build' }],
    1: [],
  });
  // mock the new tx update step similarly...

  const result = await stampLinksFromCommit({
    releaseId: RELEASE_UUID,
    commitMessage: `Fix issue BUG-${VALID_BUG_UUID}`,
    projectKey: PROJ_KEY,
    commitSha: 'abc123',  // NEW PARAM
  });

  expect(result.stamped).toBe(1);
  expect(result.autoFlipped).toBe(1);
  expect(result.orphanLinks).toBe(0);
});

it('valid BUG with inclusion_state=triaged → link written, NO flip, orphanLinks=1', async () => {
  setupSelectResponses({
    0: [{ id: VALID_BUG_UUID, inclusionState: 'triaged' }],
    1: [],
  });

  const result = await stampLinksFromCommit({ ... });

  expect(result.stamped).toBe(1);
  expect(result.autoFlipped).toBe(0);
  expect(result.orphanLinks).toBe(1);
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Commits flow uncontrollably to next prod deploy | Explicit inclusion state machine gates what ships | v2.4 (this phase) | Soft gate in v2.4; hard gate v3.0 candidate |
| Staff-only build planning lived in Mike's head + ad-hoc Claude Code sessions | Persisted in DB, surfaced in admin UI, optionally read-only-visible to customers | v2.4 | Triarch's GSD-driven workflow becomes platform feature |
| Bug/feature `status` column (submitted/triaged/approved/in_progress/fixed/...) doubled as inclusion-tracking | Separate `inclusion_state` orthogonal to `status` | v2.4 | Disambiguates "fix code complete" from "approved for next release" |

**Deprecated/outdated:**
- Manual "is this in the next build?" inference from commit history + fixVersion field. Replaced by explicit state.
- Per-project ad-hoc Slack threads to coordinate inclusion. Replaced by `/admin/modules/next-build-plan/[slug]` page.

## Open Questions

1. **`commitSha` propagation to link-stamper.**
   - What we know: Current `stampLinksFromCommit` signature does NOT receive `commitSha`. Caller at `platform/ingest/release-logs/route.ts:179` has it on the just-inserted `release.commitSha` field.
   - What's unclear: Whether the planner wants to make it a required param (breaking change to one call site) or optional with fallback to `''` (back-compatible).
   - Recommendation: Make it OPTIONAL — if absent, the audit row's `transitionedBy` falls back to `'commit-parser:unknown'`. Avoids touching `commit-parser.test.ts` consumers.

2. **Where the soft-warning for orphan links surfaces.**
   - What we know: CONTEXT D-03 says "log soft-warning to commit-parser stats so staff sees orphan-link signal."
   - What's unclear: Is "stats" a console.warn, a row in some yet-undefined table, or a metric? No existing "commit-parser stats" surface in the codebase.
   - Recommendation: V1 = `console.warn` with structured payload `{releaseId, orphanBugIds, orphanFeatureIds}`. Defer dashboard surface to a follow-up phase. Plan should note this limitation.

3. **`InternalHmacBody` schema extension vs placeholder values for INCL-08 fetch.**
   - What we know: Existing type at `packages/triarch-shared/src/internal-hmac.ts:7-17` requires `branch`, `version`, `releaseId` etc.
   - What's unclear: Best style — discriminated union (more code, type-safe) vs placeholder strings (uglier, ships faster).
   - Recommendation: Discriminated union — we're bumping the shared package anyway. Add `intent: 'dispatch_promotion' | 'read_upcoming'` and split the body into a union. ~30 lines of TS, full type safety.

4. **Wave numbering vs concurrent shared-package version bump.**
   - What we know: Schema landing in `packages/triarch-shared/` triggers PKG-04 drift gate; ALSO triggers publish-shared.yml on tag push.
   - What's unclear: Whether the shared-package version bump + publish should be its own Wave 0 (block everything else) OR done atomically with Wave 1.
   - Recommendation: One commit, one PR. Bump shared package → tag `shared/v0.4.0` → publish-shared.yml fires → admin + portal consumers update pin in follow-up PR. Three-step dance like Phase 23-04 close.

5. **Slack notification on inclusion-state flip.**
   - What we know: Existing bug/feature INSERT path posts to Slack (Phase 22-04). Nothing in CONTEXT says inclusion-state changes should notify Slack.
   - What's unclear: Whether the planner wants notification (could be customer-visible signal).
   - Recommendation: Explicitly OUT of scope for Phase 36 unless planner adds it. Defer to dogfooding feedback.

## Sources

### Primary (HIGH confidence — verified in this repo)
- `packages/triarch-shared/src/schema.ts` — bugReports (305), featureRequests (332), workflowTransitions (356), releaseLogLinks (420) definitions read
- `src/lib/commit-parser.ts` — pure regex layer, 137 lines, do-not-touch confirmed
- `src/lib/link-stamper.ts` — extension insertion point identified at line 144-146 (after batched insert, before return)
- `src/lib/link-stamper.test.ts` — existing test pattern (mockDbSelectFromWhere closure) read; extension pattern verified
- `src/lib/commit-parser.test.ts` — pure-regex test baseline, 80+ test cases, must remain GREEN
- `src/app/api/releases/promoted/route.ts` — atomic transaction at 81-103 confirmed; extension shape identified
- `src/app/api/platform/ingest/release-logs/route.ts` — current link-stamper caller at 179-187 (where soft-warning logging plugs in)
- `src/app/api/internal/dispatch/route.ts` — HMAC verify pattern; need similar GET handler for INCL-08
- `packages/triarch-shared/src/internal-hmac.ts` — signRequest/verifyRequest contract; body schema would need discriminated union for read intent
- `portal/src/lib/internal-dispatch.ts` — portal-side HMAC fetch pattern (rawBody canonicalization)
- `portal/src/app/projects/[slug]/releases/page.tsx` — membership gating + 404 pattern (PORTAL-03); INCL-08 page mirrors this
- `src/app/admin/modules/bug-reports/page.tsx` — list-page color tokens + STATUS_COLORS map + projectFilter pattern
- `src/app/admin/modules/bug-reports/[id]/page.tsx` — detail-page server-component + staff-only auth guard
- `src/app/projects/[slug]/releases/FilterChips.tsx` — reusable chip component (or duplicate per Discretion)
- `src/db/migrations/0016_release_log_links_and_preview_lock.sql` — raw-SQL CHECK constraint append pattern, plus FK + partial index examples
- `src/db/migrations/0014_release_approvals_unique_approved.sql` — partial unique index syntax example
- `.github/workflows/check-shared-version.yml` — PKG-04 drift gate behavior (fires on `packages/triarch-shared/**` changes)
- `.github/workflows/publish-shared.yml` — publishes on `shared/v*` tag push
- `package.json` — version pins confirmed: next 16.2.6, drizzle-orm 0.45.2, drizzle-kit 0.31.10, vitest 4.1.5

### Secondary (MEDIUM confidence — verified with official source)
- Drizzle ORM CHECK constraint syntax — confirmed via [orm.drizzle.team/docs/indexes-constraints#check](https://orm.drizzle.team/docs/indexes-constraints#check); supported in drizzle-orm 0.45 via `check()` from `drizzle-orm/pg-core`; we choose raw-SQL append for codebase consistency
- CockroachDB CHECK constraint behavior — confirmed via [CockroachDB docs: CHECK Constraint](https://www.cockroachlabs.com/docs/stable/check) and [ALTER TABLE](https://www.cockroachlabs.com/docs/stable/add-constraint.html); CRDB validates asynchronously, fails the ADD if existing rows violate. Not a risk here because column has a valid DEFAULT.

### Tertiary (LOW confidence — none required)
- All claims either inspected in-repo or verified against official Drizzle/CRDB docs. No LOW-confidence findings.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every library + version confirmed in `package.json`; no new deps
- Architecture: HIGH — every pattern has an existing precedent in this repo (cited by file + line)
- Pitfalls: HIGH — derived from inspecting existing migration patterns, transaction patterns, and v2.x phase decisions in STATE.md
- Open questions: MEDIUM — five questions reflect real design choices the planner faces, not gaps in research

**Research date:** 2026-05-18
**Valid until:** 2026-06-18 (30 days — codebase moving but core patterns stable; re-check if drizzle-orm/next.js major bump lands before plan execution)
