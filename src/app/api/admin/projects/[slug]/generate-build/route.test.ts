/**
 * POST /api/admin/projects/[slug]/generate-build — Phase 37 TRIG-06.
 *
 * Test surface (>= 7 cases per PLAN — 8 actually shipped):
 *   1. Happy path bugs+features  → 200 {prompt, mode, item_count} + 1 approval_events insert with correct shape
 *   2. 404 unknown project        → no DB writes
 *   3. 409 zero approved items    → no DB writes (defense — UI button should be disabled)
 *   4. 400 managed_agent          → no DB writes (placeholder until v2.5 per CONTEXT.md)
 *   5. 200 manual mode            → audit row written; manual is a valid trigger
 *   6. Audit comment trimmed      → exactly first 200 chars of prompt (TRIG-06 spec)
 *   7. requireStaff guard         → 403 forwarded, no DB writes
 *   8. Pitfall 9 async params     → handler awaits the params Promise (regression guard)
 *   9. Bugs-only path             → item_count = bug count
 *  10. Features-only path         → item_count = feature count
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// ─── Mocks (hoisted before module imports) ─────────────────────────

// db.select() chain: route issues 3 parallel selects:
//   1. projects: .from(projects).where(eq(key, slug)).limit(1)   → [project] | []
//   2. bugs:     .from(bugReports).where(and(...))                → bug rows
//   3. features: .from(featureRequests).where(and(...))           → feature rows
//
// Chain terminates on `.limit(1)` for the projects lookup and on `.where(...)`
// for bugs/features. We expose ONE select-where mock that returns successive
// queued resolutions; .limit() yields the same promise so the projects lookup
// also resolves through it.
const mockSelectWhere = vi.fn();
const mockInsertValues = vi.fn();

vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: (...whereArgs: unknown[]) => {
          const promise = mockSelectWhere(...whereArgs);
          // Support .limit(N) for projects lookup, and direct await for
          // bugs/features (which terminate on .where).
          return {
            then: (
              onFulfilled: (val: unknown) => unknown,
              onRejected?: (err: unknown) => unknown,
            ) => promise.then(onFulfilled, onRejected),
            limit: () => promise,
          };
        },
      }),
    }),
    insert: () => ({
      values: (rows: unknown) => mockInsertValues(rows),
    }),
  },
}));

// Stub drizzle operators so the route's `eq(...)` / `and(...)` calls don't blow
// up when invoked with the mocked drizzle table shapes.
vi.mock('drizzle-orm', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('drizzle-orm');
  return {
    ...actual,
    eq: (col: unknown, val: unknown) => ({ _eq: [col, val] }),
    and: (...args: unknown[]) => ({ _and: args }),
  };
});

// requireStaff — controllable per test.
vi.mock('@/lib/api-auth', () => ({
  requireStaff: vi.fn(),
}));

// buildPrompt — deterministic mock so tests are stable.
vi.mock('@/lib/build-prompt', () => ({
  buildPrompt: vi.fn(),
}));

// ─── Module under test (imported after mocks hoist) ────────────────
import { POST } from './route';
import { requireStaff } from '@/lib/api-auth';
import { buildPrompt } from '@/lib/build-prompt';

// ─── Helpers ───────────────────────────────────────────────────────
const STAFF_EMAIL = 'staff@triarch.dev';
const PROJECT_ID = 'proj-uuid-tmi';
const SLUG = 'tmi';

const PROJECT_LOCAL = {
  id: PROJECT_ID,
  key: SLUG,
  name: 'TMI Engine',
  currentVersion: '4.46.1',
  githubRepo: 'triarchsecurity/tmi',
  deployedUrl: 'https://tmi.triarch.dev',
  buildTriggerMode: 'local_claude',
  localPath: '/Users/mikegeehan/claude/triarch/development/tmi',
};

const PROJECT_MANAGED = { ...PROJECT_LOCAL, buildTriggerMode: 'managed_agent' };
const PROJECT_MANUAL = { ...PROJECT_LOCAL, buildTriggerMode: 'manual' };

const BUG_A = {
  id: 'bug-uuid-1',
  project: SLUG,
  title: 'Login broken',
  description: 'Users cannot log in after Phase 32 deploy',
  severity: 'high',
  inclusionState: 'approved_for_build',
};
const BUG_B = {
  id: 'bug-uuid-2',
  project: SLUG,
  title: 'Inventory icon overlap',
  description: 'Icons overlap at small viewport',
  severity: 'medium',
  inclusionState: 'approved_for_build',
};
const FEATURE_A = {
  id: 'feat-uuid-1',
  project: SLUG,
  title: 'Battle log export to CSV',
  description: 'Allow CSV export from the battle log page',
  buildPlan: { acceptance_criteria: ['Export button visible', 'CSV downloads'] },
  inclusionState: 'approved_for_build',
};

function mkReq(slug = SLUG): NextRequest {
  return new NextRequest(`http://localhost/api/admin/projects/${slug}/generate-build`, {
    method: 'POST',
  });
}
function mkParams(slug = SLUG): { params: Promise<{ slug: string }> } {
  return { params: Promise.resolve({ slug }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSelectWhere.mockReset();
  mockInsertValues.mockReset();
  // Default: staff session, insert resolves OK, buildPrompt returns sentinel.
  (requireStaff as ReturnType<typeof vi.fn>).mockResolvedValue({
    error: null,
    session: { user: { email: STAFF_EMAIL } },
    ctx: { isStaff: true, memberships: [] },
  });
  (buildPrompt as ReturnType<typeof vi.fn>).mockReturnValue('FAKE_PROMPT_OUTPUT');
  mockInsertValues.mockResolvedValue(undefined);
});

// ─── Tests ─────────────────────────────────────────────────────────

describe('POST /api/admin/projects/[slug]/generate-build', () => {

  it('Test 1 (happy path bugs+features): 200 with {prompt,mode,item_count} + writes one approval_events row', async () => {
    // Order of selects in route: project → bugs → features
    mockSelectWhere
      .mockResolvedValueOnce([PROJECT_LOCAL])
      .mockResolvedValueOnce([BUG_A, BUG_B])
      .mockResolvedValueOnce([FEATURE_A]);

    const res = await POST(mkReq(), mkParams());
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.prompt).toBe('FAKE_PROMPT_OUTPUT');
    expect(body.mode).toBe('local_claude');
    expect(body.item_count).toBe(3);

    // buildPrompt called once with project + 3 items
    expect(buildPrompt).toHaveBeenCalledTimes(1);
    const promptCall = (buildPrompt as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(promptCall.project.key).toBe(SLUG);
    expect(promptCall.items).toHaveLength(3);

    // Approval_events row inserted exactly once with the locked shape
    expect(mockInsertValues).toHaveBeenCalledTimes(1);
    const row = mockInsertValues.mock.calls[0][0];
    expect(row.subjectType).toBe('build_trigger');
    expect(row.subjectId).toBe(PROJECT_ID);
    expect(row.decision).toBe('triggered');
    expect(row.surface).toBe('web');
    expect(row.actorEmail).toBe(STAFF_EMAIL);
    expect(row.comment).toBe('FAKE_PROMPT_OUTPUT'); // 18 chars < 200 cap
    expect(row.metadata).toEqual({ mode: 'local_claude', item_count: 3 });
    expect(row.project).toBe(SLUG);
  });

  it('Test 2 (404 project not found): no items query, no audit row', async () => {
    mockSelectWhere.mockResolvedValueOnce([]); // empty project lookup

    const res = await POST(mkReq('nonexistent'), mkParams('nonexistent'));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('project_not_found');

    expect(buildPrompt).not.toHaveBeenCalled();
    expect(mockInsertValues).not.toHaveBeenCalled();
    // Project lookup is the only select call (1)
    expect(mockSelectWhere).toHaveBeenCalledTimes(1);
  });

  it('Test 3 (409 zero approved items): no audit row', async () => {
    mockSelectWhere
      .mockResolvedValueOnce([PROJECT_LOCAL])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const res = await POST(mkReq(), mkParams());
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('no_approved_items');

    expect(buildPrompt).not.toHaveBeenCalled();
    expect(mockInsertValues).not.toHaveBeenCalled();
  });

  it('Test 4 (400 managed_agent): blocked placeholder, no items query, no audit', async () => {
    mockSelectWhere.mockResolvedValueOnce([PROJECT_MANAGED]);

    const res = await POST(mkReq(), mkParams());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('managed_agent_not_available');

    expect(buildPrompt).not.toHaveBeenCalled();
    expect(mockInsertValues).not.toHaveBeenCalled();
    // Only the project lookup ran — items queries skipped for managed_agent
    expect(mockSelectWhere).toHaveBeenCalledTimes(1);
  });

  it('Test 5 (200 manual mode triggers normally): audit row written with mode=manual', async () => {
    mockSelectWhere
      .mockResolvedValueOnce([PROJECT_MANUAL])
      .mockResolvedValueOnce([BUG_A])
      .mockResolvedValueOnce([]);

    const res = await POST(mkReq(), mkParams());
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.mode).toBe('manual');
    expect(body.item_count).toBe(1);

    expect(mockInsertValues).toHaveBeenCalledTimes(1);
    const row = mockInsertValues.mock.calls[0][0];
    expect(row.metadata).toEqual({ mode: 'manual', item_count: 1 });
  });

  it('Test 6 (audit comment trimmed to first 200 chars per TRIG-06)', async () => {
    const LONG = 'X'.repeat(500); // 500 chars; first 200 should land in comment
    (buildPrompt as ReturnType<typeof vi.fn>).mockReturnValueOnce(LONG);
    mockSelectWhere
      .mockResolvedValueOnce([PROJECT_LOCAL])
      .mockResolvedValueOnce([BUG_A])
      .mockResolvedValueOnce([]);

    const res = await POST(mkReq(), mkParams());
    expect(res.status).toBe(200);

    const row = mockInsertValues.mock.calls[0][0];
    expect(row.comment.length).toBe(200);
    expect(row.comment).toBe('X'.repeat(200));

    // And the response prompt still returns the full untrimmed value
    const body = await res.json();
    expect(body.prompt.length).toBe(500);
  });

  it('Test 7 (requireStaff guard): 403 forwarded, no DB writes', async () => {
    (requireStaff as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
      session: null,
      ctx: null,
    });

    const res = await POST(mkReq(), mkParams());
    expect(res.status).toBe(403);

    expect(mockSelectWhere).not.toHaveBeenCalled();
    expect(buildPrompt).not.toHaveBeenCalled();
    expect(mockInsertValues).not.toHaveBeenCalled();
  });

  it('Test 8 (Pitfall 9 async params): handler awaits the params Promise', async () => {
    // Awaiting must be observable: a Promise.resolve({slug}) is passed in, the
    // handler must unwrap it, not destructure it raw.
    let resolved = false;
    const params: Promise<{ slug: string }> = new Promise((r) => {
      // Resolve on next tick — if the handler did NOT await, it would access
      // .slug before this fires and crash.
      setTimeout(() => {
        resolved = true;
        r({ slug: SLUG });
      }, 10);
    });
    mockSelectWhere
      .mockResolvedValueOnce([PROJECT_LOCAL])
      .mockResolvedValueOnce([BUG_A])
      .mockResolvedValueOnce([]);

    const res = await POST(mkReq(), { params });
    expect(resolved).toBe(true); // Confirms handler awaited the promise
    expect(res.status).toBe(200);
  });

  it('Test 9 (bugs only, no features): item_count = bugs.length', async () => {
    mockSelectWhere
      .mockResolvedValueOnce([PROJECT_LOCAL])
      .mockResolvedValueOnce([BUG_A, BUG_B])
      .mockResolvedValueOnce([]);

    const res = await POST(mkReq(), mkParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.item_count).toBe(2);

    const row = mockInsertValues.mock.calls[0][0];
    expect(row.metadata.item_count).toBe(2);
  });

  it('Test 10 (features only, no bugs): item_count = features.length', async () => {
    mockSelectWhere
      .mockResolvedValueOnce([PROJECT_LOCAL])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([FEATURE_A]);

    const res = await POST(mkReq(), mkParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.item_count).toBe(1);
  });

});
