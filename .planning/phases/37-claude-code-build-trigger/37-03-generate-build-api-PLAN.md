---
phase: 37-claude-code-build-trigger
plan: 03
type: execute
wave: 2
depends_on: [37-01, 37-02]
files_modified:
  - src/app/api/admin/projects/[slug]/generate-build/route.ts
  - src/app/api/admin/projects/[slug]/generate-build/route.test.ts
autonomous: true
requirements: [TRIG-06]
must_haves:
  truths:
    - "POST /api/admin/projects/[slug]/generate-build endpoint exists and requires staff auth"
    - "Endpoint returns 200 with JSON {prompt, mode, item_count} when project exists and has >= 1 approved_for_build items"
    - "Endpoint returns 404 when project slug does not exist (no membership-leak distinction needed; staff-only)"
    - "Endpoint returns 409 with {error: 'no_approved_items'} when project has 0 approved_for_build items (button is supposed to be disabled — defense in depth)"
    - "Endpoint returns 400 with {error: 'managed_agent_not_available'} when project.buildTriggerMode === 'managed_agent' (placeholder for v2.5 per CONTEXT.md)"
    - "Endpoint INSERTs exactly one row into approval_events per successful call with subject_type='build_trigger', subject_id={project.id}, decision='triggered', surface='web', actor_email={session.user.email}, comment={first 200 chars of prompt}, metadata={mode, item_count}, project={project.key}"
    - "Endpoint reads buildPrompt's output for the comment field — same prompt that is returned in the response (single source)"
    - "Endpoint handles Next.js 16 async params (Pitfall 9): `params: Promise<{ slug: string }>` then `await params`"
    - "Vitest coverage: >= 7 test cases covering happy path, 404 missing project, 409 no items, 400 managed_agent, audit row written, non-staff 401/403, async-params handling"
  artifacts:
    - path: "src/app/api/admin/projects/[slug]/generate-build/route.ts"
      provides: "POST endpoint: auth → project lookup → items fetch → buildPrompt() → audit insert → JSON response"
      exports: ["POST"]
    - path: "src/app/api/admin/projects/[slug]/generate-build/route.test.ts"
      provides: "Vitest coverage for the POST endpoint with mocked db + buildPrompt"
      contains: "describe"
  key_links:
    - from: "src/app/api/admin/projects/[slug]/generate-build/route.ts"
      to: "approvalEvents table"
      via: "db.insert(approvalEvents).values({...})"
      pattern: "db\\.insert\\(approvalEvents\\)"
    - from: "src/app/api/admin/projects/[slug]/generate-build/route.ts"
      to: "buildPrompt from @/lib/build-prompt"
      via: "ES module import"
      pattern: "from '@/lib/build-prompt'"
    - from: "src/app/api/admin/projects/[slug]/generate-build/route.ts"
      to: "bugReports + featureRequests inclusionState='approved_for_build'"
      via: "drizzle SELECT WHERE eq(inclusionState, 'approved_for_build') AND eq(project, slug)"
      pattern: "'approved_for_build'"
---

<objective>
Ship the TRIG-06 server-side generate-build endpoint. POST `/api/admin/projects/[slug]/generate-build` is the single integration point between the UI (37-05's Generate Build button/modal) and the prompt generator (37-02). The endpoint authenticates staff, loads the project + all `approved_for_build` items for that slug, calls `buildPrompt(...)`, INSERTs an approval_events audit row, and returns `{prompt, mode, item_count}` JSON. Centralizing the prompt generation server-side ensures the audit row's `comment` field uses the EXACT prompt the user receives — no client-side regeneration drift.

Purpose: Provide the API contract the modal consumes; ensure every Generate Build click is auditable (TRIG-06 requires the audit row to be written before the prompt is returned).
Output: One Next.js 16 route handler + Vitest test file (>= 7 cases). Importable by 37-05 via `fetch('/api/admin/projects/{slug}/generate-build', {method:'POST'})`.
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/execute-plan.md
@~/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/37-claude-code-build-trigger/37-CONTEXT.md
@.planning/phases/37-claude-code-build-trigger/37-01-shared-schema-additions-PLAN.md
@.planning/phases/37-claude-code-build-trigger/37-02-build-prompt-generator-PLAN.md

# Source-of-truth references
@src/app/api/platform/bug-reports/[id]/route.ts
@src/app/api/platform/projects/[id]/route.ts
@src/lib/api-auth.ts
@src/lib/build-trigger-mode.ts

<interfaces>
<!-- Key types and call signatures executors will use. Extracted from codebase + 37-01/37-02 outputs. -->

From src/lib/api-auth.ts (existing pattern):
```typescript
export async function requireStaff(): Promise<{ error: NextResponse | null; session?: Session }>;
export async function requireSignedIn(): Promise<{ error: NextResponse | null; session?: Session }>;
```

From src/lib/build-prompt.ts (37-02 output):
```typescript
export function buildPrompt(input: BuildPromptInput): string;
export interface BuildPromptInput {
  project: BuildPromptProject;
  items: BuildPromptItem[];   // must be length >= 1
}
export interface BuildPromptProject { key, name, currentVersion, githubRepo, deployedUrl }
export interface BuildPromptItem { id, type, title, description, buildPlan, severity? }
```

From src/lib/build-trigger-mode.ts (37-01 output):
```typescript
export const BUILD_TRIGGER_MODES: readonly ['local_claude', 'managed_agent', 'manual'];
export type BuildTriggerMode = 'local_claude' | 'managed_agent' | 'manual';
export function isValidBuildTriggerMode(value: unknown): value is BuildTriggerMode;
```

From packages/triarch-shared/src/schema.ts (37-01 output):
```typescript
export const approvalEvents = pgTable('approval_events', {
  id, subjectType, subjectId, decision, surface, actorEmail, comment, metadata, project, createdAt
});

// projects table (relevant columns):
//   key: varchar(64)
//   name: varchar(256)
//   currentVersion: varchar(32)
//   githubRepo: varchar(256)
//   deployedUrl: varchar(512)
//   buildTriggerMode: varchar(32)  // NEW from 37-01
//   localPath: varchar(512)        // NEW from 37-01

// bugReports / featureRequests (relevant columns — same shape on both):
//   id, project (varchar(64)), title, description, severity (bugs only), buildPlan (jsonb, features only), inclusionState
```

From src/app/api/platform/bug-reports/[id]/route.ts (Next.js 16 async params pattern — Pitfall 9):
```typescript
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // ...
}
```

Endpoint URL contract (slug is project.key, NOT project.id, per existing admin convention in `/admin/modules/next-build-plan/[slug]`):
- POST /api/admin/projects/[slug]/generate-build
- Auth: staff only (requireStaff)
- Request body: empty (slug carries the project context; current approved items derived server-side)
- Response: 200 { prompt: string, mode: BuildTriggerMode, item_count: number }
- Response: 404 { error: 'project_not_found' }
- Response: 409 { error: 'no_approved_items' }  // defensive — UI button is supposed to be disabled at 0 items
- Response: 400 { error: 'managed_agent_not_available' }  // when project.buildTriggerMode === 'managed_agent'
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Implement POST /api/admin/projects/[slug]/generate-build endpoint + Vitest coverage</name>
  <files>src/app/api/admin/projects/[slug]/generate-build/route.ts, src/app/api/admin/projects/[slug]/generate-build/route.test.ts</files>
  <read_first>
    - src/app/api/platform/bug-reports/[id]/route.ts (golden pattern for Next.js 16 async params + requireSignedIn + transactional DB writes — Pitfall 9 anchored here)
    - src/app/api/platform/projects/[id]/route.ts (PUT/DELETE pattern for project lookup)
    - src/lib/api-auth.ts (requireStaff vs requireSignedIn — use requireStaff here per staff-only spec)
    - src/lib/build-prompt.ts (37-02 output — the function this endpoint calls)
    - .planning/phases/37-claude-code-build-trigger/37-CONTEXT.md (TRIG-06: audit row spec — comment = first 200 chars; subject_type='build_trigger'; surface='web'; metadata={mode, item_count})
  </read_first>
  <behavior>
    - Test 1 (happy path with bugs + features): POST with valid staff session + slug 'tmi' + 2 approved bugs + 1 approved feature → 200 with body {prompt: string, mode: 'local_claude', item_count: 3}; AND db.insert(approvalEvents) was called exactly once with subject_type='build_trigger', subject_id={project.id}, decision='triggered', surface='web', actor_email='staff@triarch.dev', comment matches first 200 chars of returned prompt, metadata={mode:'local_claude', item_count:3}, project='tmi'
    - Test 2 (404 project not found): POST with slug 'nonexistent' → 404 {error: 'project_not_found'}; NO approval_events row written
    - Test 3 (409 no approved items): POST with valid slug but project has 0 approved_for_build items → 409 {error: 'no_approved_items'}; NO approval_events row written
    - Test 4 (400 managed_agent): POST with valid slug + items but project.buildTriggerMode === 'managed_agent' → 400 {error: 'managed_agent_not_available'}; NO approval_events row written
    - Test 5 (non-staff 401/403): POST with non-staff session → requireStaff returns the standard error response (NextResponse with appropriate status); NO approval_events row written
    - Test 6 (audit comment trimmed to 200 chars): When buildPrompt returns a very long string, the inserted approval_events.comment field is exactly first 200 chars (TRIG-06 spec)
    - Test 7 (async params correctness): The route awaits params before destructuring (Pitfall 9); test exercises the actual handler signature `(req, { params }) => ...` with params as a Promise
    - Test 8 (manual mode still triggers): When project.buildTriggerMode === 'manual', the endpoint returns 200 with mode:'manual' and writes the audit row (manual is a valid trigger; only managed_agent is the blocked mode)
  </behavior>
  <action>
    1. Create the directory tree: `mkdir -p src/app/api/admin/projects/[slug]/generate-build`.

    2. Write the test file FIRST (RED — but with full mocks so the test infrastructure is wired before the route exists). Create `src/app/api/admin/projects/[slug]/generate-build/route.test.ts`. Mock pattern matches existing route tests (e.g. `src/app/api/platform/bug-reports/[id]/route.test.ts`):
    ```typescript
    import { describe, it, expect, vi, beforeEach } from 'vitest';
    import { NextRequest } from 'next/server';

    // ── Mock auth (returns success by default; override per test for non-staff) ──
    const requireStaffMock = vi.fn();
    vi.mock('@/lib/api-auth', () => ({
      requireStaff: () => requireStaffMock(),
    }));

    // ── Mock db with builder chain ──
    const projectFindMock = vi.fn();
    const bugsFindMock = vi.fn();
    const featuresFindMock = vi.fn();
    const insertValuesMock = vi.fn();
    vi.mock('@/lib/db', () => ({
      db: {
        select: () => ({
          from: (tbl: unknown) => ({
            where: (_: unknown) => ({
              limit: (_n: number) => projectFindMock(tbl),
              // For bugs/features we don't use limit; the chain is select().from().where().
              then: undefined,
            }),
          }),
        }),
        // The route below uses two parallel queries; expose dedicated mocks via the
        // selectFrom wrapper. The simpler approach: expose db.select returning a
        // shape whose `from` switches mocks by table identity. We implement via
        // a smarter mock below.
        insert: () => ({ values: (v: unknown) => insertValuesMock(v) }),
      },
    }));
    // Helper to switch behaviour per table:
    function setupDbMocks(opts: {
      project?: Array<Record<string, unknown>>;
      bugs?: Array<Record<string, unknown>>;
      features?: Array<Record<string, unknown>>;
    }) {
      projectFindMock.mockImplementation((tbl: unknown) => {
        // Inspect tbl identity by name field set in schema; simplest is to return
        // the configured rows when the chain calls limit(1). The route will call
        // `.limit(1)` only on the projects lookup; bugs/features are unbounded.
        if (opts.project !== undefined) return Promise.resolve(opts.project);
        return Promise.resolve([]);
      });
    }

    // ── Mock buildPrompt to keep tests deterministic + assertable ──
    const buildPromptMock = vi.fn();
    vi.mock('@/lib/build-prompt', () => ({
      buildPrompt: (input: unknown) => buildPromptMock(input),
    }));

    // ── Import the route AFTER all mocks are declared ──
    import { POST } from './route';

    beforeEach(() => {
      vi.clearAllMocks();
      requireStaffMock.mockResolvedValue({
        error: null,
        session: { user: { email: 'staff@triarch.dev' } },
      });
      buildPromptMock.mockReturnValue('FAKE_PROMPT');
      insertValuesMock.mockResolvedValue(undefined);
    });

    function makeReq(): NextRequest {
      return new NextRequest('http://localhost/api/admin/projects/tmi/generate-build', { method: 'POST' });
    }
    function makeParams(slug = 'tmi'): { params: Promise<{ slug: string }> } {
      return { params: Promise.resolve({ slug }) };
    }

    describe('POST /api/admin/projects/[slug]/generate-build', () => {
      it('200 happy path: returns prompt + mode + item_count; writes one approval_events row', async () => {
        // Stub db to return a project + 2 bugs + 1 feature for slug 'tmi'.
        // Implementation: see route.test.ts mock layout below — use a richer mock
        // that returns different arrays per .from() call sequence.
        // (Setup elided here for brevity in the plan; the executor should follow
        //  the pattern in src/app/api/portal/projects/[slug]/upcoming/route.test.ts,
        //  which has the same shape: project + bug + feature parallel queries.)
        // ...
      });
      it('404 when project does not exist', async () => { /* ... */ });
      it('409 when project has 0 approved_for_build items', async () => { /* ... */ });
      it('400 when project.buildTriggerMode === managed_agent', async () => { /* ... */ });
      it('200 when project.buildTriggerMode === manual (manual is a valid trigger; only managed_agent is blocked)', async () => { /* ... */ });
      it('comment field on the audit row is exactly first 200 chars of prompt', async () => { /* ... */ });
      it('returns requireStaff error response when non-staff', async () => { /* ... */ });
      it('awaits params (Pitfall 9 — Next.js 16 async params)', async () => { /* ... */ });
    });
    ```
    NOTE: The mock scaffolding above is the SHAPE — copy the EXACT working pattern from `src/app/api/portal/projects/[slug]/upcoming/route.test.ts` (which has the most similar shape: project lookup + parallel bug + feature queries). Do NOT invent a new mock pattern. Read that file first and clone its db mock structure.

    3. Run `npx vitest run src/app/api/admin/projects/[slug]/generate-build/route.test.ts` — MUST FAIL with "Cannot find module './route'" or similar (RED phase).

    4. Write the route implementation. Create `src/app/api/admin/projects/[slug]/generate-build/route.ts`:
    ```typescript
    import { NextRequest, NextResponse } from 'next/server';
    import { eq, and } from 'drizzle-orm';
    import { requireStaff } from '@/lib/api-auth';
    import { db } from '@/lib/db';
    import { projects, bugReports, featureRequests, approvalEvents } from '@/db/schema';
    import { buildPrompt, type BuildPromptItem } from '@/lib/build-prompt';
    import type { BuildTriggerMode } from '@/lib/build-trigger-mode';

    // POST /api/admin/projects/[slug]/generate-build
    // Phase 37 TRIG-06. Staff-only. Loads project + all approved_for_build items,
    // generates prompt via buildPrompt(), writes audit row to approval_events,
    // returns {prompt, mode, item_count}.
    //
    // Pitfall 9 (Next.js 16): params is a Promise; await before destructuring.
    export async function POST(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
      const { error, session } = await requireStaff();
      if (error) return error;

      const { slug } = await params;

      const [project] = await db.select().from(projects).where(eq(projects.key, slug)).limit(1);
      if (!project) {
        return NextResponse.json({ error: 'project_not_found' }, { status: 404 });
      }

      // Block managed_agent — Phase 38 RFC produces design; v2.5 implements (CONTEXT.md).
      if (project.buildTriggerMode === 'managed_agent') {
        return NextResponse.json({ error: 'managed_agent_not_available' }, { status: 400 });
      }

      // Load both entity types in parallel.
      const [bugs, features] = await Promise.all([
        db.select().from(bugReports).where(
          and(eq(bugReports.project, slug), eq(bugReports.inclusionState, 'approved_for_build'))
        ),
        db.select().from(featureRequests).where(
          and(eq(featureRequests.project, slug), eq(featureRequests.inclusionState, 'approved_for_build'))
        ),
      ]);

      const items: BuildPromptItem[] = [
        ...bugs.map((b) => ({
          id: b.id,
          type: 'bug' as const,
          title: b.title,
          description: b.description ?? '',
          buildPlan: null,                 // bugs do not have a buildPlan column today
          severity: b.severity ?? null,
        })),
        ...features.map((f) => ({
          id: f.id,
          type: 'feature' as const,
          title: f.title,
          description: f.description ?? '',
          buildPlan: f.buildPlan ?? null,  // jsonb column on featureRequests
        })),
      ];

      if (items.length === 0) {
        // Defensive: button is supposed to be disabled at 0 items.
        return NextResponse.json({ error: 'no_approved_items' }, { status: 409 });
      }

      const prompt = buildPrompt({
        project: {
          key: project.key,
          name: project.name,
          currentVersion: project.currentVersion ?? null,
          githubRepo: project.githubRepo ?? null,
          deployedUrl: project.deployedUrl ?? null,
        },
        items,
      });

      const mode = project.buildTriggerMode as BuildTriggerMode;
      const actorEmail = session?.user?.email ?? 'unknown';

      await db.insert(approvalEvents).values({
        subjectType: 'build_trigger',
        subjectId: project.id,
        decision: 'triggered',
        surface: 'web',
        actorEmail,
        comment: prompt.slice(0, 200),          // TRIG-06 spec: first 200 chars
        metadata: { mode, item_count: items.length },
        project: project.key,
      });

      return NextResponse.json({ prompt, mode, item_count: items.length });
    }
    ```

    5. Implement each test body following the mock pattern referenced in step 2. Run `npx vitest run src/app/api/admin/projects/[slug]/generate-build/route.test.ts` until all 8 pass (GREEN).

    6. Manually verify the route is reachable: `npx next build` exits 0 (route compiles).
  </action>
  <verify>
    <automated>npx vitest run src/app/api/admin/projects/[slug]/generate-build/route.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - File `src/app/api/admin/projects/[slug]/generate-build/route.ts` exists and exports POST
    - File `src/app/api/admin/projects/[slug]/generate-build/route.test.ts` exists with >= 7 test cases (8 ideal)
    - `npx vitest run src/app/api/admin/projects/[slug]/generate-build/route.test.ts` reports 0 failures
    - `grep -c "params: Promise<{ slug: string }>" src/app/api/admin/projects/[slug]/generate-build/route.ts` returns 1 (Pitfall 9: Next.js 16 async params anchored)
    - `grep -c "await params" src/app/api/admin/projects/[slug]/generate-build/route.ts` returns 1
    - `grep -c "db.insert(approvalEvents)" src/app/api/admin/projects/[slug]/generate-build/route.ts` returns 1
    - `grep -c "subjectType: 'build_trigger'" src/app/api/admin/projects/[slug]/generate-build/route.ts` returns 1
    - `grep -c "prompt.slice(0, 200)" src/app/api/admin/projects/[slug]/generate-build/route.ts` returns 1 (TRIG-06 first-200-chars spec)
    - `grep -c "'managed_agent_not_available'" src/app/api/admin/projects/[slug]/generate-build/route.ts` returns 1 (blocks managed_agent placeholder)
    - `npx next build` exits 0 (route compiles end-to-end)
  </acceptance_criteria>
  <done>POST endpoint + tests shipped; 8 Vitest cases green; audit row pattern locked; UI plan 37-05 can fetch this endpoint and consume {prompt, mode, item_count}.</done>
</task>

</tasks>

<verification>
- POST /api/admin/projects/[slug]/generate-build exists and is staff-gated (verifiable: `grep -c "requireStaff" src/app/api/admin/projects/[slug]/generate-build/route.ts` returns 1)
- Endpoint writes exactly one approval_events row per successful call (verified by Test 1; covered also by direct grep on `db.insert(approvalEvents)` returning 1 — only one insert site in the route)
- Endpoint handles managed_agent placeholder mode (returns 400; covered by Test 4)
- Pitfall 9 (Next.js 16 async params) anchored in source and test (grep + Test 7)
- `npx vitest run src/app/api/admin/projects/[slug]/generate-build/route.test.ts` exits 0
- `npx next build` exits 0
</verification>

<success_criteria>
- 37-05 client code can `fetch('/api/admin/projects/${slug}/generate-build', { method: 'POST' })` and receive `{prompt, mode, item_count}` on 200 or a structured error on 4xx
- TRIG-06 audit trail: every Generate Build click leaves a row in approval_events. 37-06 (audit page) renders these rows.
- TMI pilot success criterion from ROADMAP — "Every trigger writes a row to approval_events with the prompt excerpt for audit" — satisfied by this endpoint
</success_criteria>

<output>
After completion, create `.planning/phases/37-claude-code-build-trigger/37-03-generate-build-api-SUMMARY.md` documenting:
- Final endpoint URL + method + response shape
- Test count (target >= 7, ideal 8)
- Any deviations from the mock pattern (e.g., upcoming/route.test.ts was the model — note any divergence)
- Sample approval_events row JSON for a manual integration test against TMI
</output>
</content>
</invoke>