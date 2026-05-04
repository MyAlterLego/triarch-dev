---
phase: 01-schema-membership-migration
plan: 04
subsystem: api
tags: [nextauth, drizzle, membership, release-ingest, backwards-compat, cockroachdb]

# Dependency graph
requires:
  - 01-01  # releaseLogs new columns (env/status/commitSha/deployedAt) in schema
  - 01-02  # getCurrentUserContext helper for membership-aware GET projects
provides:
  - "GET /api/platform/projects returns full list for staff, membership-filtered list for non-staff"
  - "POST /api/platform/ingest/release-logs accepts env, commitSha, deployedAt and persists them with 'dev' defaults"
affects:
  - 01-03  # manage-members page builds on same membership model this API enforces
  - 02-*   # customer releases UI will rely on env/status columns being populated on new rows

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "inArray(projects.key, projectKeys) for membership-filtered project list — safe empty-array guard returns [] before calling inArray"
    - "VALID_ENVS ReadonlyArray type guard for optional enum field: VALID_ENVS.includes(envInput) ? envInput : 'dev'"
    - "Coerce deployedAt ISO string to Date via new Date() + isNaN check, null on invalid"
    - "status='dev' hardcoded server-side — client cannot inject higher status via ingest endpoint"

key-files:
  created: []
  modified:
    - src/app/api/platform/projects/route.ts
    - src/app/api/platform/ingest/release-logs/route.ts

key-decisions:
  - "Non-staff with empty memberships returns { projects: [] } (200) not 403 — empty result is semantically correct; 403 implies forbidden action"
  - "ctx=null (DB error) falls back to unfiltered list for authenticated users — mirrors auth.ts env-allowlist fallback policy from Plan 02"
  - "env validation silently coerces invalid values to 'dev' (not 400 rejection) — prioritises CI payload backwards compat over strictness"
  - "status='dev' is server-controlled on insert; Phase 2 gating flow is the only path to transition status forward"

# Metrics
duration: ~5min
completed: 2026-05-03
---

# Phase 01 Plan 04: API Endpoint Wiring Summary

**Membership-aware GET /api/platform/projects (staff=all, non-staff=filtered) and extended POST /api/platform/ingest/release-logs accepting env/commitSha/deployedAt with 'dev' defaults for backwards-compatible CI integration**

## Performance

- **Duration:** ~5 min
- **Completed:** 2026-05-03T18:08:04Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Wired `getCurrentUserContext` into GET /api/platform/projects: staff and DB-error fallback return all projects; non-staff get membership-filtered list using `inArray(projects.key, projectKeys)`; empty membership returns `{ projects: [] }` rather than an empty-list `inArray` query (both Drizzle and CRDB handle `IN ()` poorly)
- Extended POST /api/platform/ingest/release-logs to accept `env` (optional, defaults `'dev'`), `commitSha` (optional string), `deployedAt` (optional ISO 8601 string parsed to Date); all three are persisted to the new releaseLogs columns from Plan 01-01
- `status='dev'` is hardcoded on all new rows — the gating approval flow in Phase 2/3 is the only path to transition status forward; the ingest caller cannot inject a higher status
- `requireApiKey` auth on the ingest endpoint is unchanged — existing CI payloads (shared-workflows) will continue to work without modifications
- `npx tsc --noEmit` exits 0; `npx next build` exits 0

## Task Commits

1. **Task 1: Membership-aware GET /api/platform/projects** - `e6552b3` (feat)
2. **Task 2: Extended release-logs ingest** - `dece66d` (feat)

## Diff Summary

### src/app/api/platform/projects/route.ts — GET handler

**Before (lines 1-14):**
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { projects } from '@/db/schema';
import { asc } from 'drizzle-orm';
import crypto from 'crypto';

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  const rows = await db.select().from(projects).orderBy(asc(projects.createdAt));
  return NextResponse.json({ projects: rows });
}
```

**After — GET handler with membership filter:**
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { getCurrentUserContext } from '@/lib/auth-context';
import { db } from '@/lib/db';
import { projects } from '@/db/schema';
import { asc, inArray } from 'drizzle-orm';
import crypto from 'crypto';

export async function GET() {
  const { error, session } = await requireAdmin();
  if (error) return error;

  const ctx = await getCurrentUserContext(session);

  if (!ctx || ctx.isStaff) {
    const rows = await db.select().from(projects).orderBy(asc(projects.createdAt));
    return NextResponse.json({ projects: rows });
  }

  const projectKeys = ctx.memberships
    .filter((m) => m.project_key !== '*')
    .map((m) => m.project_key);

  if (projectKeys.length === 0) {
    return NextResponse.json({ projects: [] });
  }

  const rows = await db
    .select()
    .from(projects)
    .where(inArray(projects.key, projectKeys))
    .orderBy(asc(projects.createdAt));

  return NextResponse.json({ projects: rows });
}
```

POST handler is unchanged — `crypto.randomBytes(24).toString('hex')` and `apiKey: tdp_${...}` are untouched.

### src/app/api/platform/ingest/release-logs/route.ts — POST handler body

**Before (lines 10-27):**
```typescript
const body = await req.json();
const { version, releaseType, summary, entries, metadata, releasedBy } = body;

if (!version || !releaseType) {
  return NextResponse.json({ error: 'version and releaseType are required' }, { status: 400 });
}

const [release] = await db.insert(releaseLogs).values({
  project: project!.key,
  version,
  releaseType,
  summary: summary ?? null,
  entries: entries ?? [],
  metadata: metadata ?? {},
  releasedBy: releasedBy ?? null,
}).returning();
```

**After — with env/commitSha/deployedAt/status:**
```typescript
type ReleaseEnv = 'dev' | 'prod';
const VALID_ENVS: ReadonlyArray<ReleaseEnv> = ['dev', 'prod'];

// ... POST function body:
const body = await req.json();
const { version, releaseType, summary, entries, metadata, releasedBy,
        env: envInput, commitSha, deployedAt } = body;

if (!version || !releaseType) {
  return NextResponse.json({ error: 'version and releaseType are required' }, { status: 400 });
}

const env: ReleaseEnv = VALID_ENVS.includes(envInput) ? envInput : 'dev';

let deployedAtParsed: Date | null = null;
if (typeof deployedAt === 'string') {
  const d = new Date(deployedAt);
  if (!Number.isNaN(d.getTime())) { deployedAtParsed = d; }
}

const [release] = await db.insert(releaseLogs).values({
  project: project!.key, version, releaseType,
  summary: summary ?? null, entries: entries ?? [], metadata: metadata ?? {},
  releasedBy: releasedBy ?? null,
  env,
  status: 'dev',
  commitSha: typeof commitSha === 'string' ? commitSha : null,
  deployedAt: deployedAtParsed,
}).returning();
```

## Backwards Compatibility Note

The v1.13 CI payload format (`{ version, releaseType, summary?, entries?, metadata?, releasedBy? }` with API key header) continues to work without modification:
- `env` omitted → defaults to `'dev'`
- `commitSha` omitted → stored as `null`
- `deployedAt` omitted → stored as `null`
- `status` is always server-set to `'dev'`; client cannot override it via the ingest endpoint

## Phase 2 Note

The customer releases page (Phase 2) should consume `releaseLogs.status` and `releaseLogs.env` columns directly. All new rows created after this plan is deployed will have `status='dev'` and `env='dev'|'prod'` populated. The Phase 2 approval gating flow transitions status from `'dev'` through the enum forward; this plan establishes the invariant that new rows always start at `'dev'`.

## Human-Needed Verification

The following checks require a live DB (after Mike runs `db:push` + backfill SQL):

| Check | How |
|-------|-----|
| GET /admin/platform/projects as `mike@triarchsecurity.com` (staff) → all projects shown | Sign in, navigate |
| GET /admin/platform/projects as non-staff with one project_members row → only that project | Add member via Plan 03 page, sign in as that email |
| POST /api/platform/ingest/release-logs with no `env` field → response has `env='dev'`, `status='dev'` | `curl` with existing payload |
| POST with `env: 'prod'`, `commitSha: 'abc123'`, `deployedAt: '2026-05-03T12:00:00Z'` → all three persisted | `curl` with new payload |
| POST with `env: 'garbage'` → response has `env='dev'` (silent coercion) | `curl` test |
| POST with `deployedAt: 'not-a-date'` → response has `deployedAt=null` | `curl` test |

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — this plan modifies two API route handlers. No UI components, no data rendering stubs.

## Self-Check: PASSED
