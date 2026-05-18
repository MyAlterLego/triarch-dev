/**
 * Plan 36-06 Task 2 — INCL-08 admin authoritative endpoint for portal /upcoming.
 *
 * Test surface:
 *  - HMAC verify path (happy, bad sig, expired, replay, no_secret, malformed)
 *  - Intent guard (read_upcoming required; dispatch_promotion rejected)
 *  - projectKey/slug cross-check (defense-in-depth)
 *  - Project lookup (404 on unknown)
 *  - State filter (only approved_for_build + built returned; not triaged/pending_inclusion/deferred/deployed)
 *  - Pitfall 7 field allowlist (zero staff-only fields in response payload)
 *  - Pitfall 9 Next.js 16 async params
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

// ─── Mocks (hoisted) ──────────────────────────────────────────────────
vi.mock('@triarchsecurity/secrets', () => ({
  getSecret: vi.fn(),
}));

// The route issues 3 SELECTs in order:
//   1. projects: select().from(projects).where(eq)              → [{key}] or []
//   2. bugs:     select().from(bugReports).where(and(...)).orderBy(desc)
//   3. features: select().from(featureRequests).where(and(...)).orderBy(desc)
//
// Calls 2 + 3 terminate on .orderBy(); call 1 terminates on .where(). We make
// the .where() return value also Promise-like AND .orderBy()-able by attaching
// .orderBy as a method on the awaited result. The chain helper below records
// the .where() argument so tests can assert on inArray() shape (Pitfall 7
// allowlist verification).
const mockSelectWhere = vi.fn();

vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: (...whereArgs: unknown[]) => {
          // Build a thenable that ALSO supports .orderBy().
          // .orderBy() returns the same promise resolution (next mockSelectWhere call).
          const promise = mockSelectWhere(...whereArgs);
          return {
            then: (onFulfilled: (val: unknown) => unknown, onRejected?: (err: unknown) => unknown) =>
              promise.then(onFulfilled, onRejected),
            orderBy: () => promise,
          };
        },
      }),
    }),
  },
}));

// Stub drizzle operators so the route's `and(eq(...), inArray(...))` calls don't
// blow up — the mock select-chain ignores the arguments anyway.
vi.mock('drizzle-orm', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('drizzle-orm');
  return {
    ...actual,
    eq: (col: unknown, val: unknown) => ({ _eq: [col, val] }),
    and: (...args: unknown[]) => ({ _and: args }),
    inArray: (col: unknown, vals: unknown[]) => ({ _inArray: [col, vals] }),
    desc: (col: unknown) => ({ _desc: col }),
  };
});

// ─── Module under test (imported after mocks hoist) ──────────────────
import { POST } from './route';
import { getSecret } from '@triarchsecurity/secrets';
import { signRequest } from '@triarchsecurity/triarch-shared/internal-hmac';

const TEST_SECRET = 'test-hmac-secret-for-upcoming-route';

// ─── Helpers ───────────────────────────────────────────────────────
let testNonceCounter = 0;
function uniqueNonce(): string {
  return `up${String(++testNonceCounter).padStart(30, '0')}`;
}

function buildRequest(rawBody: string, signature: string | null): NextRequest {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (signature !== null) headers['x-hmac-signature'] = signature;
  return new NextRequest('http://localhost/api/portal/projects/tmi/upcoming', {
    method: 'POST',
    headers,
    body: rawBody,
  });
}

function signReadUpcoming(opts?: { projectKey?: string; actorEmail?: string; now?: number; nonce?: string }) {
  const { body, signature } = signRequest(
    {
      intent: 'read_upcoming' as const,
      projectKey: opts?.projectKey ?? 'tmi',
      actorEmail: opts?.actorEmail ?? 'mike@triarch.dev',
    },
    TEST_SECRET,
    { now: opts?.now ?? Date.now(), nonce: opts?.nonce ?? uniqueNonce() },
  );
  const rawBody = JSON.stringify(body, Object.keys(body).sort());
  return { rawBody, signature };
}

function signDispatchPromotion(opts?: { projectKey?: string }) {
  const { body, signature } = signRequest(
    {
      intent: 'dispatch_promotion' as const,
      branch: 'release/4.46.1',
      version: '4.46.1',
      projectKey: opts?.projectKey ?? 'tmi',
      releaseId: 'rel-uuid-9999',
      actorEmail: 'mike@triarch.dev',
      slackChannelId: null,
      slackMessageTs: null,
    },
    TEST_SECRET,
    { now: Date.now(), nonce: uniqueNonce() },
  );
  const rawBody = JSON.stringify(body, Object.keys(body).sort());
  return { rawBody, signature };
}

// Sample row shapes — only the columns the route SELECTs.
const APPROVED_BUG = {
  id: '00000000-0000-0000-0000-000000000001',
  title: 'Fix login redirect loop',
  severity: 'high',
  inclusionState: 'approved_for_build',
  updatedAt: new Date('2026-05-17T10:00:00Z'),
};
const BUILT_BUG = {
  id: '00000000-0000-0000-0000-000000000002',
  title: 'Inventory icon overlap',
  severity: 'medium',
  inclusionState: 'built',
  updatedAt: new Date('2026-05-18T08:00:00Z'),
};
const APPROVED_FEAT = {
  id: '00000000-0000-0000-0000-000000000003',
  title: 'Battle log export to CSV',
  inclusionState: 'approved_for_build',
  updatedAt: new Date('2026-05-16T15:00:00Z'),
};

// ─── beforeEach ──────────────────────────────────────────────────────
beforeEach(() => {
  vi.clearAllMocks();
  (getSecret as ReturnType<typeof vi.fn>).mockResolvedValue(TEST_SECRET);
  mockSelectWhere.mockReset();
});

// ─── Tests ───────────────────────────────────────────────────────────

describe('POST /api/portal/projects/[slug]/upcoming', () => {

  it('Test 1 (happy path): 200 + items[] with customer-safe fields only', async () => {
    // 3 SELECTs in order: project, bugs, features
    mockSelectWhere
      .mockResolvedValueOnce([{ key: 'tmi' }])              // project found
      .mockResolvedValueOnce([APPROVED_BUG, BUILT_BUG])      // bugs
      .mockResolvedValueOnce([APPROVED_FEAT]);               // features

    const { rawBody, signature } = signReadUpcoming();
    const req = buildRequest(rawBody, signature);
    const res = await POST(req, { params: Promise.resolve({ slug: 'tmi' }) });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.items)).toBe(true);
    expect(data.items).toHaveLength(3);

    // Verify per-item field shape
    for (const item of data.items) {
      expect(Object.keys(item).sort()).toEqual(['id', 'inclusionState', 'severity', 'title', 'type', 'updatedAt']);
      expect(['bug', 'feature']).toContain(item.type);
      expect(['approved_for_build', 'built']).toContain(item.inclusionState);
    }

    // Verify bug carries severity, feature is null
    const bugItems = data.items.filter((i: { type: string }) => i.type === 'bug');
    const featItems = data.items.filter((i: { type: string }) => i.type === 'feature');
    expect(bugItems.length).toBe(2);
    expect(featItems.length).toBe(1);
    expect(bugItems[0].severity).toBeTruthy();
    expect(featItems[0].severity).toBeNull();
  });

  it('Test 2 (only approved+built returned): triaged/pending/deferred/deployed not returned', async () => {
    // The route's SELECT filter is enforced at the drizzle layer (inArray);
    // here we trust the route to issue that filter and the mock to return what
    // the route asked for. We verify the inArray param shape via the mock arg
    // assertion below.
    mockSelectWhere
      .mockResolvedValueOnce([{ key: 'tmi' }])
      .mockResolvedValueOnce([APPROVED_BUG])
      .mockResolvedValueOnce([]);

    const { rawBody, signature } = signReadUpcoming();
    const req = buildRequest(rawBody, signature);
    const res = await POST(req, { params: Promise.resolve({ slug: 'tmi' }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.items).toHaveLength(1);
    expect(data.items[0].inclusionState).toBe('approved_for_build');

    // Inspect the WHERE arg passed to the bugs SELECT (call #2). The route
    // calls `and(eq(project, slug), inArray(inclusionState, ['approved_for_build', 'built']))`.
    // Our drizzle mock represents that as `{ _and: [{ _eq: [...] }, { _inArray: [col, vals] }] }`.
    // Drill into the structure to inspect the inArray VALUES array (not the
    // full PgTable metadata, which includes column DEFAULTS like 'triaged'
    // that would create false positives on a stringified-blob assertion).
    const bugsCallArgs = mockSelectWhere.mock.calls[1] as Array<{ _and: Array<{ _inArray?: [unknown, string[]] }> }>;
    const inArrayClause = bugsCallArgs[0]._and.find((c) => '_inArray' in c);
    expect(inArrayClause).toBeDefined();
    const allowedStates = inArrayClause!._inArray![1];
    expect(allowedStates).toEqual(['approved_for_build', 'built']);
    // Negative assertions on the inArray value list itself (not the whole
    // PgTable serialization which includes column defaults).
    expect(allowedStates).not.toContain('triaged');
    expect(allowedStates).not.toContain('pending_inclusion');
    expect(allowedStates).not.toContain('deferred');
    expect(allowedStates).not.toContain('deployed');
    expect(allowedStates).not.toContain('rejected');
  });

  it('Test 3 (cross-intent rejection): dispatch_promotion body → 400 wrong_intent', async () => {
    const { rawBody, signature } = signDispatchPromotion();
    const req = buildRequest(rawBody, signature);
    const res = await POST(req, { params: Promise.resolve({ slug: 'tmi' }) });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('wrong_intent');
    // DB must not have been queried
    expect(mockSelectWhere).not.toHaveBeenCalled();
  });

  it('Test 4 (bad signature): 401 bad_signature', async () => {
    const { rawBody } = signReadUpcoming();
    const req = buildRequest(rawBody, 'a'.repeat(64));
    const res = await POST(req, { params: Promise.resolve({ slug: 'tmi' }) });

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe('bad_signature');
    expect(mockSelectWhere).not.toHaveBeenCalled();
  });

  it('Test 5 (unknown project): 404 project_not_found', async () => {
    mockSelectWhere.mockResolvedValueOnce([]); // project lookup returns empty
    const { rawBody, signature } = signReadUpcoming({ projectKey: 'nonexistent' });
    const req = buildRequest(rawBody, signature);
    const res = await POST(req, { params: Promise.resolve({ slug: 'nonexistent' }) });

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe('project_not_found');
  });

  it('Test 6 (no_secret): 500 no_secret', async () => {
    (getSecret as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('vault unreachable'));
    const { rawBody, signature } = signReadUpcoming();
    const req = buildRequest(rawBody, signature);
    const res = await POST(req, { params: Promise.resolve({ slug: 'tmi' }) });

    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe('no_secret');
  });

  it('Test 7 (replay): same nonce twice returns 401 replay on second call', async () => {
    // First call succeeds
    mockSelectWhere
      .mockResolvedValueOnce([{ key: 'tmi' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const replayNonce = 'rp'.padEnd(32, '0');
    const { rawBody, signature } = signReadUpcoming({ nonce: replayNonce });

    const req1 = buildRequest(rawBody, signature);
    const res1 = await POST(req1, { params: Promise.resolve({ slug: 'tmi' }) });
    expect(res1.status).toBe(200);

    // Reset mocks for the second call (project lookup would be queued)
    mockSelectWhere
      .mockResolvedValueOnce([{ key: 'tmi' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const req2 = buildRequest(rawBody, signature);
    const res2 = await POST(req2, { params: Promise.resolve({ slug: 'tmi' }) });
    expect(res2.status).toBe(401);
    const data2 = await res2.json();
    expect(data2.error).toBe('replay');
  });

  it('Test 8 (expired timestamp): 401 expired', async () => {
    const oldNow = Date.now() - 6 * 60 * 1000; // 6 min ago > 5 min skew
    const { rawBody, signature } = signReadUpcoming({ now: oldNow });
    const req = buildRequest(rawBody, signature);
    const res = await POST(req, { params: Promise.resolve({ slug: 'tmi' }) });

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe('expired');
  });

  it('Test 9 (field allowlist enforced — Pitfall 7): SECRET-NOTE never leaks into response', async () => {
    // Construct a "rich" DB row that includes staff-only fields. The route's
    // explicit allowlist on the SELECT should never project them, so the
    // serialized response should not contain the sentinel.
    const richBug = {
      ...APPROVED_BUG,
      triarchNotes: 'STAFF-ONLY-SECRET-NOTE-DO-NOT-LEAK',
      slackMessageTs: '1234567890.123456',
      slackChannelId: 'C0123456789',
      buildPlan: { internal: 'staff-only plan steps' },
    };
    mockSelectWhere
      .mockResolvedValueOnce([{ key: 'tmi' }])
      .mockResolvedValueOnce([richBug])
      .mockResolvedValueOnce([]);

    const { rawBody, signature } = signReadUpcoming();
    const req = buildRequest(rawBody, signature);
    const res = await POST(req, { params: Promise.resolve({ slug: 'tmi' }) });

    expect(res.status).toBe(200);
    const responseText = await res.text();
    // The allowlist in the route's SELECT is the protection. The runtime DB
    // would never return triarchNotes because the SELECT didn't request it.
    // Here the mock returned everything, so the route must NOT pass through
    // staff-only fields when constructing the items[] array.
    expect(responseText).not.toContain('STAFF-ONLY-SECRET-NOTE-DO-NOT-LEAK');
    expect(responseText).not.toContain('triarchNotes');
    expect(responseText).not.toContain('slackMessageTs');
    expect(responseText).not.toContain('slackChannelId');
    expect(responseText).not.toContain('buildPlan');
  });

  it('Test 10 (projectKey/slug mismatch — defense in depth): 400 project_mismatch', async () => {
    // Sign for tmi but visit the truthtreason URL
    const { rawBody, signature } = signReadUpcoming({ projectKey: 'tmi' });
    const req = new NextRequest('http://localhost/api/portal/projects/truthtreason/upcoming', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-hmac-signature': signature },
      body: rawBody,
    });
    const res = await POST(req, { params: Promise.resolve({ slug: 'truthtreason' }) });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('project_mismatch');
    expect(mockSelectWhere).not.toHaveBeenCalled();
  });

});
