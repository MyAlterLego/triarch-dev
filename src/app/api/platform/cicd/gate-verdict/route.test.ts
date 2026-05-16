/**
 * Vitest suite for POST /api/platform/cicd/gate-verdict
 *
 * Tests: auth (401 missing, 403 invalid), validation (400 missing target_version,
 *        400 missing dev_version, 400 invalid verdict), 201 success pass, 201 success fail.
 *
 * Phase 27 / Plan 02 / CL6-01.
 *
 * All DB operations mocked — mirrors src/app/api/platform/promote-callback/route.test.ts.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createHash } from 'node:crypto';

// ─── Mock: @/lib/api-key-auth ─────────────────────────────────────────────────
const requireApiKeyMock = vi.fn();
vi.mock('@/lib/api-key-auth', () => ({
  requireApiKey: (...args: unknown[]) => requireApiKeyMock(...args),
}));

// ─── Mock: @/lib/db ───────────────────────────────────────────────────────────
const insertValuesMock = vi.fn();
const insertMock = vi.fn();
vi.mock('@/lib/db', () => ({
  db: {
    insert: (...args: unknown[]) => insertMock(...args),
  },
}));

// ─── Mock: @/db/schema (import real symbols for table-ref assertion) ──────────
vi.mock('@/db/schema', async () => {
  const actual = await vi.importActual<typeof import('@/db/schema')>('@/db/schema');
  return {
    deployGateCheck: actual.deployGateCheck,
    projects: actual.projects,
  };
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
const FAKE_PROJECT = { id: 'proj-uuid', key: 'truth-treason', apiKey: 'valid-token' };
const FAKE_TOKEN = 'valid-token';
const FAKE_TOKEN_HASH = createHash('sha256').update(FAKE_TOKEN).digest('hex');

const VALID_PASS_BODY = {
  target_version: 'v2.13.14',
  verdict: 'pass',
  dev_version: 'v2.13.14',
};

const FAKE_INSERTED_ROW = {
  id: 'mock-uuid',
  projectKey: 'truth-treason',
  targetVersion: 'v2.13.14',
  verdict: 'pass',
  devVersion: 'v2.13.14',
  apiKeyHash: FAKE_TOKEN_HASH,
  reason: null,
  workflowRunUrl: null,
  createdAt: new Date(),
};

function buildRequest(body: Record<string, unknown>, headers: Record<string, string> = {}) {
  return new NextRequest(new URL('http://localhost/api/platform/cicd/gate-verdict'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

function authHeaders(token = FAKE_TOKEN) {
  return { Authorization: `Bearer ${token}` };
}

// ─── Tests ────────────────────────────────────────────────────────────────────
describe('POST /api/platform/cicd/gate-verdict', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insertValuesMock.mockReturnValue({ returning: vi.fn().mockResolvedValue([FAKE_INSERTED_ROW]) });
    insertMock.mockReturnValue({ values: insertValuesMock });
  });

  it('returns 401 when Authorization header is missing', async () => {
    requireApiKeyMock.mockResolvedValueOnce({
      error: new Response(JSON.stringify({ error: 'Missing Authorization: Bearer <api_key> header' }), { status: 401 }),
      project: null,
    });
    const { POST } = await import('./route');
    const res = await POST(buildRequest(VALID_PASS_BODY));
    expect(res.status).toBe(401);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('returns 403 when Bearer token is invalid', async () => {
    requireApiKeyMock.mockResolvedValueOnce({
      error: new Response(JSON.stringify({ error: 'Invalid API key' }), { status: 403 }),
      project: null,
    });
    const { POST } = await import('./route');
    const res = await POST(buildRequest(VALID_PASS_BODY, authHeaders('bogus')));
    expect(res.status).toBe(403);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('returns 400 when target_version is missing', async () => {
    requireApiKeyMock.mockResolvedValueOnce({ error: null, project: FAKE_PROJECT });
    const { POST } = await import('./route');
    const { target_version: _t, ...rest } = VALID_PASS_BODY;
    const res = await POST(buildRequest(rest, authHeaders()));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(JSON.stringify(body)).toMatch(/target_version/);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('returns 400 when dev_version is missing', async () => {
    requireApiKeyMock.mockResolvedValueOnce({ error: null, project: FAKE_PROJECT });
    const { POST } = await import('./route');
    const { dev_version: _d, ...rest } = VALID_PASS_BODY;
    const res = await POST(buildRequest(rest, authHeaders()));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(JSON.stringify(body)).toMatch(/dev_version/);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('returns 400 when verdict is not in ["pass","fail"]', async () => {
    requireApiKeyMock.mockResolvedValueOnce({ error: null, project: FAKE_PROJECT });
    const { POST } = await import('./route');
    const res = await POST(buildRequest({ ...VALID_PASS_BODY, verdict: 'maybe' }, authHeaders()));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(JSON.stringify(body)).toMatch(/verdict/);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('returns 201 with verdict=pass and inserts row with sha256(token) hash', async () => {
    requireApiKeyMock.mockResolvedValueOnce({ error: null, project: FAKE_PROJECT });
    const { POST } = await import('./route');
    const res = await POST(buildRequest(VALID_PASS_BODY, authHeaders()));
    expect(res.status).toBe(201);
    // Assert insert called against deployGateCheck table ref
    const { deployGateCheck } = await vi.importActual<typeof import('@/db/schema')>('@/db/schema');
    expect(insertMock).toHaveBeenCalledWith(deployGateCheck);
    // Assert .values() got the right shape
    const valuesArg = insertValuesMock.mock.calls[0][0];
    expect(valuesArg).toMatchObject({
      projectKey: 'truth-treason',
      targetVersion: 'v2.13.14',
      verdict: 'pass',
      devVersion: 'v2.13.14',
      apiKeyHash: FAKE_TOKEN_HASH,
    });
  });

  it('returns 201 with verdict=fail and reason field persists', async () => {
    requireApiKeyMock.mockResolvedValueOnce({ error: null, project: FAKE_PROJECT });
    const { POST } = await import('./route');
    const res = await POST(buildRequest(
      { ...VALID_PASS_BODY, verdict: 'fail', reason: 'INV-2 version not seen on dev' },
      authHeaders()
    ));
    expect(res.status).toBe(201);
    const valuesArg = insertValuesMock.mock.calls[0][0];
    expect(valuesArg).toMatchObject({
      verdict: 'fail',
      reason: 'INV-2 version not seen on dev',
    });
  });
});
