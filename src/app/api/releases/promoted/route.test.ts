/**
 * Vitest suite for POST /api/releases/promoted
 *
 * Tests: auth (401/403), validation (400), 404 (no dev row),
 *        201 success (atomic transaction), 200 idempotent replay.
 *
 * All DB operations are mocked — no real database needed.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

// ─── Mock: @/lib/api-key-auth ─────────────────────────────────────────────────

const requireApiKeyMock = vi.fn();

vi.mock('@/lib/api-key-auth', () => ({
  requireApiKey: (...args: unknown[]) => requireApiKeyMock(...args),
}));

// ─── Mock: @/lib/db ───────────────────────────────────────────────────────────
//
// We need to cover:
//   1. db.select().from(releaseLogs).where(...)  → dev row lookup
//   2. db.select().from(releaseLogs).where(...)  → prod row idempotency check
//   3. db.transaction(async tx => { tx.insert(...).values(...).returning(); tx.update(...).set(...).where(...) })
//
// Each test controls which calls return what via the arrays below.

const dbSelectResults: unknown[][] = [];
let dbSelectCallCount = 0;

const txInsertMock = vi.fn();
const txUpdateMock = vi.fn();
const dbTransactionMock = vi.fn();

vi.mock('@/lib/db', () => {
  // Chain factory: select().from().where()
  const makeSelectChain = () => ({
    select: () => ({
      from: () => ({
        where: (..._args: unknown[]) => {
          const result = dbSelectResults[dbSelectCallCount] ?? [];
          dbSelectCallCount++;
          return Promise.resolve(result);
        },
      }),
    }),
  });

  return {
    db: new Proxy(
      {
        transaction: (...args: unknown[]) => dbTransactionMock(...args),
      },
      {
        get(target, prop) {
          if (prop === 'transaction') return target.transaction;
          if (prop === 'select') return makeSelectChain().select;
          return undefined;
        },
      }
    ),
  };
});

// ─── Mock: @/db/schema ────────────────────────────────────────────────────────

vi.mock('@/db/schema', async () => {
  const actual = await vi.importActual<typeof import('@/db/schema')>('@/db/schema');
  return {
    releaseLogs: actual.releaseLogs,
    projects: actual.projects,
  };
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

const FAKE_PROJECT = { id: 'proj-uuid', key: 'truth', apiKey: 'valid-token' };

const VALID_BODY = {
  version: 'v1.2.3',
  commit_sha: 'abc123def456',
  deployed_at: '2026-05-04T12:00:00.000Z',
  deployed_by: 'github-actions[bot]',
};

const FAKE_DEV_ROW = {
  id: 'dev-row-uuid',
  project: 'truth',
  version: 'v1.2.3',
  env: 'dev',
  status: 'approved',
  releaseType: 'minor',
  summary: 'Test release',
  entries: [],
};

const FAKE_PROD_ROW = {
  id: 'prod-row-uuid',
  project: 'truth',
  version: 'v1.2.3',
  env: 'prod',
  status: 'promoted',
  releaseType: 'minor',
  releasedBy: 'github-actions[bot]',
  commitSha: 'abc123def456',
  deployedAt: new Date('2026-05-04T12:00:00.000Z'),
};

function buildRequest(body: Record<string, unknown>, headers: Record<string, string> = {}) {
  return new NextRequest(new URL('http://x/api/releases/promoted'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/releases/promoted', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbSelectResults.length = 0;
    dbSelectCallCount = 0;

    // Default: auth succeeds
    requireApiKeyMock.mockResolvedValue({ error: null, project: FAKE_PROJECT });

    // Default transaction: insert then update — returns new prod row
    txInsertMock.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([FAKE_PROD_ROW]),
      }),
    });
    txUpdateMock.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    });
    dbTransactionMock.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        insert: (...args: unknown[]) => txInsertMock(...args),
        update: (...args: unknown[]) => txUpdateMock(...args),
        select: () => ({
          from: () => ({
            where: () => Promise.resolve([]),
          }),
        }),
      };
      return callback(tx);
    });
  });

  // Test A — 401 no auth
  it('returns 401 when Authorization header is missing', async () => {
    const { NextResponse } = await import('next/server');
    requireApiKeyMock.mockResolvedValue({
      error: NextResponse.json({ error: 'Missing Authorization: Bearer <api_key> header' }, { status: 401 }),
      project: null,
    });

    const { POST } = await import('@/app/api/releases/promoted/route');
    const req = buildRequest(VALID_BODY);
    const res = await POST(req);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/Missing Authorization/);
    expect(dbTransactionMock).not.toHaveBeenCalled();
  });

  // Test B — 403 bad token
  it('returns 403 when Bearer token is invalid', async () => {
    const { NextResponse } = await import('next/server');
    requireApiKeyMock.mockResolvedValue({
      error: NextResponse.json({ error: 'Invalid API key' }, { status: 403 }),
      project: null,
    });

    const { POST } = await import('@/app/api/releases/promoted/route');
    const req = buildRequest(VALID_BODY, { Authorization: 'Bearer wrong-token' });
    const res = await POST(req);

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/Invalid API key/);
    expect(dbTransactionMock).not.toHaveBeenCalled();
  });

  // Test C — 400 missing fields
  it('returns 400 when required fields are missing', async () => {
    const { POST } = await import('@/app/api/releases/promoted/route');
    const req = buildRequest({ version: 'v1.0.0' }); // missing commit_sha, deployed_at, deployed_by
    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/commit_sha|deployed_at|deployed_by/);
    expect(dbTransactionMock).not.toHaveBeenCalled();
  });

  // Test D — 404 no dev row
  it('returns 404 when no matching dev release row exists', async () => {
    // No dev row, no prod row
    dbSelectResults.push([]); // dev row lookup → empty
    dbSelectResults.push([]); // prod row lookup → empty (shouldn't reach here but safe)

    const { POST } = await import('@/app/api/releases/promoted/route');
    const req = buildRequest({ ...VALID_BODY, version: 'v9.9.9' });
    const res = await POST(req);

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/No dev release/);
    expect(dbTransactionMock).not.toHaveBeenCalled();
  });

  // Test E — 201 success
  it('returns 201 and creates prod row + updates dev row in a single transaction', async () => {
    // dev row exists, no prod row yet
    dbSelectResults.push([FAKE_DEV_ROW]); // dev row lookup
    dbSelectResults.push([]); // prod row lookup → none exists

    const { POST } = await import('@/app/api/releases/promoted/route');
    const req = buildRequest(VALID_BODY);
    const res = await POST(req);

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.env).toBe('prod');
    expect(body.status).toBe('promoted');

    // db.transaction called exactly once (atomic write)
    expect(dbTransactionMock).toHaveBeenCalledTimes(1);

    // tx.insert called inside transaction (prod row INSERT)
    expect(txInsertMock).toHaveBeenCalledTimes(1);
    const insertArgs = txInsertMock.mock.calls[0];
    // The insert target should be releaseLogs table
    expect(insertArgs[0]).toBeDefined();

    // tx.update called inside transaction (dev row status flip)
    expect(txUpdateMock).toHaveBeenCalledTimes(1);

    // Verify prod row payload fields from request
    const valuesCall = txInsertMock.mock.results[0].value.values.mock.calls[0][0];
    expect(valuesCall.env).toBe('prod');
    expect(valuesCall.status).toBe('promoted');
    expect(valuesCall.commitSha).toBe(VALID_BODY.commit_sha);
    expect(valuesCall.releasedBy).toBe(VALID_BODY.deployed_by);
  });

  // Test F — 200 idempotent replay
  it('returns 200 with existing prod row when same payload is replayed (no second INSERT)', async () => {
    // dev row exists, prod row already exists
    dbSelectResults.push([FAKE_DEV_ROW]); // dev row lookup
    dbSelectResults.push([FAKE_PROD_ROW]); // prod row lookup → already exists

    const { POST } = await import('@/app/api/releases/promoted/route');
    const req = buildRequest(VALID_BODY);
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(FAKE_PROD_ROW.id);
    expect(body.env).toBe('prod');
    expect(body.status).toBe('promoted');

    // Idempotency: transaction must NOT have been called
    expect(dbTransactionMock).not.toHaveBeenCalled();
  });
});
