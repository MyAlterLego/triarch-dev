/**
 * Vitest suite for POST /api/releases/promoted
 *
 * Tests: auth (401/403), validation (400), 404 (no dev row),
 *        201 success (atomic transaction), 200 idempotent replay,
 *        Phase 36 INCL-07 inclusion-state batch flip + audit (built → deployed).
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
//   3. db.transaction(async tx => {
//        tx.insert(releaseLogs).values(...).returning();         → prod row INSERT
//        tx.update(releaseLogs).set(...).where(...);             → dev row status flip
//        tx.update(bugReports).set(...).where(...).returning(); → INCL-07 bug flip
//        tx.update(featureRequests).set(...).where(...).returning(); → INCL-07 feat flip
//        tx.insert(workflowTransitions).values(...);             → INCL-07 audit
//      })
//
// Each test controls which calls return what via the arrays/queues below.

const dbSelectResults: unknown[][] = [];
let dbSelectCallCount = 0;

const txInsertMock = vi.fn();
const txUpdateMock = vi.fn();
const dbTransactionMock = vi.fn();

// Phase 36-04 INCL-07: queues of returning() results for the two batch UPDATEs
// (bugReports + featureRequests). Order: bugs first, features second.
const txUpdateReturningQueue: unknown[][] = [];
// Captured workflow_transitions audit insert payloads
const txInsertCalls: Array<{ table: unknown; values: unknown }> = [];

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
    bugReports: actual.bugReports,
    featureRequests: actual.featureRequests,
    workflowTransitions: actual.workflowTransitions,
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

/**
 * Configure default transaction behavior with INCL-07-aware mocks.
 *
 * - tx.insert(table).values(rows).returning?: routes through `txInsertMock`.
 *   • For releaseLogs (prod row INSERT) → returning() yields [FAKE_PROD_ROW].
 *   • For workflowTransitions (audit INSERT) → no returning(); resolves undefined.
 *     Captured into `txInsertCalls` for assertions.
 *
 * - tx.update(table).set(updates).where(cond).returning?():
 *   • For releaseLogs (dev row status flip) → no returning(); resolves undefined.
 *   • For bugReports / featureRequests (INCL-07 batch flip) → returning() yields
 *     the next array from `txUpdateReturningQueue` (bugs first, features second).
 */
function defaultTxMocks() {
  txInsertCalls.length = 0;

  txInsertMock.mockImplementation((table: unknown) => {
    return {
      values: (rows: unknown) => {
        txInsertCalls.push({ table, values: rows });
        return {
          returning: vi.fn().mockResolvedValue([FAKE_PROD_ROW]),
          // For workflowTransitions: no .returning() chain — values() resolves directly
          then: (onFulfilled: (v: unknown) => unknown) => Promise.resolve(undefined).then(onFulfilled),
        };
      },
    };
  });

  txUpdateMock.mockImplementation((_table: unknown) => {
    return {
      set: () => ({
        where: (..._args: unknown[]) => {
          const result = {
            // .returning() chain for the two batch UPDATEs (bugs + features)
            returning: vi.fn().mockImplementation(() => {
              const next = txUpdateReturningQueue.shift() ?? [];
              return Promise.resolve(next);
            }),
            // Direct awaited form for the dev-row status flip (no .returning())
            then: (onFulfilled: (v: unknown) => unknown) =>
              Promise.resolve(undefined).then(onFulfilled),
          };
          return result;
        },
      }),
    };
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
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/releases/promoted', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbSelectResults.length = 0;
    dbSelectCallCount = 0;
    txUpdateReturningQueue.length = 0;

    // Default: auth succeeds
    requireApiKeyMock.mockResolvedValue({ error: null, project: FAKE_PROJECT });

    defaultTxMocks();
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
    dbSelectResults.push([]); // dev row lookup → empty
    dbSelectResults.push([]); // prod row lookup → empty

    const { POST } = await import('@/app/api/releases/promoted/route');
    const req = buildRequest({ ...VALID_BODY, version: 'v9.9.9' });
    const res = await POST(req);

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/No dev release/);
    expect(dbTransactionMock).not.toHaveBeenCalled();
  });

  // Test E — 201 success (existing GATE-12 contract preserved)
  it('returns 201 and creates prod row + updates dev row in a single transaction', async () => {
    dbSelectResults.push([FAKE_DEV_ROW]); // dev row lookup
    dbSelectResults.push([]); // prod row lookup → none exists
    // No bugs/features linked — INCL-07 UPDATEs return empty
    txUpdateReturningQueue.push([]); // bugs flipped: 0
    txUpdateReturningQueue.push([]); // features flipped: 0

    const { POST } = await import('@/app/api/releases/promoted/route');
    const req = buildRequest(VALID_BODY);
    const res = await POST(req);

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.env).toBe('prod');
    expect(body.status).toBe('promoted');

    expect(dbTransactionMock).toHaveBeenCalledTimes(1);

    // tx.insert called: once for the prod row INSERT (no audit when 0 flips)
    expect(txInsertMock).toHaveBeenCalledTimes(1);

    // tx.update called: once for dev row + once each for bugs + features = 3
    expect(txUpdateMock).toHaveBeenCalledTimes(3);
  });

  // Test F — 200 idempotent replay
  it('returns 200 with existing prod row when same payload is replayed (no second INSERT)', async () => {
    dbSelectResults.push([FAKE_DEV_ROW]); // dev row lookup
    dbSelectResults.push([FAKE_PROD_ROW]); // prod row lookup → already exists

    const { POST } = await import('@/app/api/releases/promoted/route');
    const req = buildRequest(VALID_BODY);
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(FAKE_PROD_ROW.id);

    // Idempotency: transaction must NOT have been called → no double flip, no audit
    expect(dbTransactionMock).not.toHaveBeenCalled();
    expect(txInsertCalls.length).toBe(0);
  });

  // ─── Phase 36 INCL-07: prod-ingest auto-flip built → deployed ────────────────

  describe('Phase 36 INCL-07: built → deployed auto-flip', () => {
    it('Test 1 (happy path): flips 2 bugs + 1 feature linked to devRow.id and writes combined audit', async () => {
      dbSelectResults.push([FAKE_DEV_ROW]); // dev row lookup
      dbSelectResults.push([]); // prod row lookup → none

      // The two batch UPDATEs return the flipped IDs in order: bugs first, then features
      txUpdateReturningQueue.push([{ id: 'bug-1' }, { id: 'bug-2' }]); // 2 bugs flipped
      txUpdateReturningQueue.push([{ id: 'feat-1' }]); // 1 feature flipped

      const { POST } = await import('@/app/api/releases/promoted/route');
      const req = buildRequest(VALID_BODY);
      const res = await POST(req);

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.env).toBe('prod');

      // tx.insert called twice: prod row INSERT + workflow_transitions combined audit INSERT
      expect(txInsertMock).toHaveBeenCalledTimes(2);

      // First insert: prod row (releaseLogs)
      // Second insert: workflow_transitions audit with 3 rows (2 bugs + 1 feature)
      const auditInsertCall = txInsertCalls.find((c) => {
        const rows = c.values as Array<Record<string, unknown>>;
        return Array.isArray(rows) && rows.length === 3;
      });
      expect(auditInsertCall).toBeDefined();
      const auditRows = auditInsertCall!.values as Array<Record<string, unknown>>;

      // Two bug-report audit rows
      const bugAuditRows = auditRows.filter((r) => r.entityType === 'bug_report');
      expect(bugAuditRows).toHaveLength(2);
      expect(bugAuditRows.map((r) => r.entityId).sort()).toEqual(['bug-1', 'bug-2']);

      // One feature-request audit row
      const featAuditRows = auditRows.filter((r) => r.entityType === 'feature_request');
      expect(featAuditRows).toHaveLength(1);
      expect(featAuditRows[0].entityId).toBe('feat-1');

      // All audit rows have correct from/to + provenance metadata
      for (const row of auditRows) {
        expect(row.fromStatus).toBe('built');
        expect(row.toStatus).toBe('deployed');
        expect(row.transitionedBy).toBe(`prod-ingest:${VALID_BODY.commit_sha}`);
        expect(row.reason).toBe('auto-flip on prod deploy');
        const metadata = row.metadata as { prodReleaseLogId: string };
        expect(metadata.prodReleaseLogId).toBe(FAKE_PROD_ROW.id);
      }
    });

    it('Test 2 (idempotent re-ingest via early-return): replay → 200 → no flip → no audit', async () => {
      // Already covered above (Test F) — but explicitly assert no audit insert here.
      dbSelectResults.push([FAKE_DEV_ROW]);
      dbSelectResults.push([FAKE_PROD_ROW]); // prod row exists

      const { POST } = await import('@/app/api/releases/promoted/route');
      const req = buildRequest(VALID_BODY);
      const res = await POST(req);

      expect(res.status).toBe(200);
      expect(dbTransactionMock).not.toHaveBeenCalled();
      // No audit because tx never opened
      expect(txInsertCalls.length).toBe(0);
    });

    it('Test 3 (idempotency via WHERE clause): tx runs but 0 rows match built filter → no audit insert', async () => {
      // Bypass-the-early-return scenario: tx opens, UPDATEs find 0 already-built rows,
      // and the combined audit insert is skipped because auditRows.length === 0.
      dbSelectResults.push([FAKE_DEV_ROW]);
      dbSelectResults.push([]); // prod row lookup → none

      txUpdateReturningQueue.push([]); // bugs: 0 flipped (all already 'deployed')
      txUpdateReturningQueue.push([]); // features: 0 flipped

      const { POST } = await import('@/app/api/releases/promoted/route');
      const req = buildRequest(VALID_BODY);
      const res = await POST(req);

      expect(res.status).toBe(201);

      // tx.insert called exactly once (prod row only) — audit insert skipped when 0 flips
      expect(txInsertMock).toHaveBeenCalledTimes(1);
      // Only the releaseLogs prod row insert captured
      expect(txInsertCalls).toHaveLength(1);
    });

    it('Test 4 (no linked items at all): UPDATE matches 0 rows → no audit → response unchanged', async () => {
      dbSelectResults.push([FAKE_DEV_ROW]);
      dbSelectResults.push([]);

      txUpdateReturningQueue.push([]); // 0 bugs
      txUpdateReturningQueue.push([]); // 0 features

      const { POST } = await import('@/app/api/releases/promoted/route');
      const req = buildRequest(VALID_BODY);
      const res = await POST(req);

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.env).toBe('prod');
      expect(body.status).toBe('promoted');

      // No audit insert when 0 rows flipped
      expect(txInsertMock).toHaveBeenCalledTimes(1);
    });

    it('Test 5 (atomicity): if audit INSERT throws, the entire tx callback rejects', async () => {
      dbSelectResults.push([FAKE_DEV_ROW]);
      dbSelectResults.push([]);

      // 1 bug flipped → audit insert will be attempted
      txUpdateReturningQueue.push([{ id: 'bug-1' }]);
      txUpdateReturningQueue.push([]);

      // Override insert mock so the SECOND insert (audit) throws
      let insertCallCount = 0;
      txInsertMock.mockImplementation((table: unknown) => {
        insertCallCount++;
        if (insertCallCount === 1) {
          // First insert: prod row — succeeds normally
          return {
            values: (rows: unknown) => {
              txInsertCalls.push({ table, values: rows });
              return {
                returning: vi.fn().mockResolvedValue([FAKE_PROD_ROW]),
              };
            },
          };
        }
        // Second insert: audit — throws
        return {
          values: () => {
            return Promise.reject(new Error('audit insert failed'));
          },
        };
      });

      // The tx callback rejects → db.transaction rejects → route rethrows (no catch in route)
      // In a real CRDB tx, this rolls back the prod row + dev update + both flips.
      const { POST } = await import('@/app/api/releases/promoted/route');
      const req = buildRequest(VALID_BODY);

      await expect(POST(req)).rejects.toThrow(/audit insert failed/);
    });

    it('Test 6: existing GATE-12 contract preserved — 400 with no DB writes', async () => {
      const { POST } = await import('@/app/api/releases/promoted/route');
      const req = buildRequest({ commit_sha: 'only-sha' }); // missing version, deployed_at, deployed_by
      const res = await POST(req);

      expect(res.status).toBe(400);
      expect(dbTransactionMock).not.toHaveBeenCalled();
      expect(txInsertCalls.length).toBe(0);
    });
  });
});
