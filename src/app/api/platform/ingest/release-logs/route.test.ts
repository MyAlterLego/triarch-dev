/**
 * Vitest suite for POST /api/platform/ingest/release-logs (CL-6 pre-check).
 *
 * Phase 27 / Plan 03 / CL6-02, CL6-03, CL6-04.
 *
 * Tests 9 scenarios across CL6_ENFORCEMENT_MODE = off | warn | enforce
 * and env = dev | prod. All DB operations mocked. Mirrors mock pattern
 * from src/app/api/platform/promote-callback/route.test.ts.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createHash } from 'node:crypto';

// Mock: @/lib/api-key-auth
const requireApiKeyMock = vi.fn();
vi.mock('@/lib/api-key-auth', () => ({
  requireApiKey: (...args: unknown[]) => requireApiKeyMock(...args),
}));

// Mock: @/lib/db (insert + select-chain)
const insertValuesMock = vi.fn();
const insertMock = vi.fn();
let selectResult: unknown[] = [];
const selectMock = vi.fn(() => selectResult);

function buildSelectChain() {
  const chain = {
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: (_n: number) => Promise.resolve(selectMock()),
  };
  return chain;
}

vi.mock('@/lib/db', () => ({
  db: {
    insert: (...args: unknown[]) => insertMock(...args),
    select: () => buildSelectChain(),
  },
}));

// Mock: @/db/schema (import real table refs for assertion)
vi.mock('@/db/schema', async () => {
  const actual = await vi.importActual<typeof import('@/db/schema')>('@/db/schema');
  return {
    deployGateCheck: actual.deployGateCheck,
    releaseLogs: actual.releaseLogs,
    projects: actual.projects,
  };
});

// Mock: @/lib/link-stamper
// Phase 36 INCL-06: returns StampResult { stamped, dropped, autoFlipped, orphanLinks }.
// Default is the zero-shape; tests can override per-call via mockResolvedValueOnce.
const stampLinksFromCommitMock = vi.fn().mockResolvedValue({
  stamped: 0,
  dropped: 0,
  autoFlipped: 0,
  orphanLinks: 0,
});
vi.mock('@/lib/link-stamper', () => ({
  stampLinksFromCommit: (...args: unknown[]) => stampLinksFromCommitMock(...args),
}));

const FAKE_PROJECT = { id: 'proj-uuid', key: 'truth-treason', apiKey: 'valid-token' };
const FAKE_TOKEN = 'valid-token';
const FAKE_TOKEN_HASH = createHash('sha256').update(FAKE_TOKEN).digest('hex');

const VALID_PROD_BODY = {
  version: 'v2.13.14',
  releaseType: 'minor',
  env: 'prod',
  summary: 'Phase 27 ship',
};

const FAKE_RELEASE_ROW = { id: 'release-uuid', project: 'truth-treason', version: 'v2.13.14' };

function buildRequest(body: Record<string, unknown>, headers: Record<string, string> = {}) {
  return new NextRequest(new URL('http://localhost/api/platform/ingest/release-logs'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${FAKE_TOKEN}`,
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function passingVerdictRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'verdict-uuid',
    projectKey: 'truth-treason',
    targetVersion: 'v2.13.14',
    verdict: 'pass',
    devVersion: 'v2.13.14',
    apiKeyHash: FAKE_TOKEN_HASH,
    reason: null,
    workflowRunUrl: null,
    createdAt: new Date(),
    ...overrides,
  };
}

describe('POST /api/platform/ingest/release-logs (CL-6 pre-check)', () => {
  const ORIGINAL_MODE = process.env.CL6_ENFORCEMENT_MODE;

  beforeEach(() => {
    vi.clearAllMocks();
    selectResult = [];
    selectMock.mockImplementation(() => selectResult);
    insertValuesMock.mockReturnValue({
      returning: vi.fn().mockResolvedValue([FAKE_RELEASE_ROW]),
    });
    insertMock.mockReturnValue({ values: insertValuesMock });
    requireApiKeyMock.mockResolvedValue({ error: null, project: FAKE_PROJECT });
  });

  afterEach(() => {
    if (ORIGINAL_MODE === undefined) {
      delete process.env.CL6_ENFORCEMENT_MODE;
    } else {
      process.env.CL6_ENFORCEMENT_MODE = ORIGINAL_MODE;
    }
  });

  it('Test 1: env=dev bypasses gate check entirely (selectMock never called)', async () => {
    process.env.CL6_ENFORCEMENT_MODE = 'enforce';
    const { POST } = await import('./route');
    const res = await POST(buildRequest({ ...VALID_PROD_BODY, env: 'dev' }));
    expect(res.status).toBe(201);
    expect(selectMock).not.toHaveBeenCalled();
    expect(insertMock).toHaveBeenCalledTimes(1);
    const { releaseLogs } = await vi.importActual<typeof import('@/db/schema')>('@/db/schema');
    expect(insertMock).toHaveBeenCalledWith(releaseLogs);
  });

  it('Test 2: env=prod + mode=off bypasses gate check', async () => {
    process.env.CL6_ENFORCEMENT_MODE = 'off';
    const { POST } = await import('./route');
    const res = await POST(buildRequest(VALID_PROD_BODY));
    expect(res.status).toBe(201);
    expect(selectMock).not.toHaveBeenCalled();
    expect(insertMock).toHaveBeenCalledTimes(1);
  });

  it('Test 3: env=prod + mode=enforce + no verdict row -> 409, audit written, no release row', async () => {
    process.env.CL6_ENFORCEMENT_MODE = 'enforce';
    selectResult = [];
    const { POST } = await import('./route');
    const res = await POST(buildRequest(VALID_PROD_BODY));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe('CL6-VIOLATION');
    expect(insertMock).toHaveBeenCalledTimes(1);
    const { deployGateCheck } = await vi.importActual<typeof import('@/db/schema')>('@/db/schema');
    expect(insertMock).toHaveBeenCalledWith(deployGateCheck);
    const valuesArg = insertValuesMock.mock.calls[0][0];
    expect(valuesArg.verdict).toBe('reject_no_pair');
    expect(valuesArg.projectKey).toBe('truth-treason');
    expect(valuesArg.targetVersion).toBe('v2.13.14');
  });

  it('Test 4: env=prod + mode=enforce + target_version mismatch -> 409, no release row', async () => {
    process.env.CL6_ENFORCEMENT_MODE = 'enforce';
    selectResult = [passingVerdictRow({ targetVersion: 'v2.13.13' })];
    const { POST } = await import('./route');
    const res = await POST(buildRequest(VALID_PROD_BODY));
    expect(res.status).toBe(409);
    const { releaseLogs } = await vi.importActual<typeof import('@/db/schema')>('@/db/schema');
    const releaseInsertCalls = insertMock.mock.calls.filter((c) => c[0] === releaseLogs);
    expect(releaseInsertCalls).toHaveLength(0);
  });

  it('Test 5: env=prod + mode=enforce + api_key_hash mismatch -> 409, no release row', async () => {
    process.env.CL6_ENFORCEMENT_MODE = 'enforce';
    selectResult = [passingVerdictRow({ apiKeyHash: 'different-hash-value' })];
    const { POST } = await import('./route');
    const res = await POST(buildRequest(VALID_PROD_BODY));
    expect(res.status).toBe(409);
    const { releaseLogs } = await vi.importActual<typeof import('@/db/schema')>('@/db/schema');
    const releaseInsertCalls = insertMock.mock.calls.filter((c) => c[0] === releaseLogs);
    expect(releaseInsertCalls).toHaveLength(0);
  });

  it('Test 6: env=prod + mode=enforce + verdict=fail -> 409, no release row', async () => {
    process.env.CL6_ENFORCEMENT_MODE = 'enforce';
    selectResult = [passingVerdictRow({ verdict: 'fail' })];
    const { POST } = await import('./route');
    const res = await POST(buildRequest(VALID_PROD_BODY));
    expect(res.status).toBe(409);
    const { releaseLogs } = await vi.importActual<typeof import('@/db/schema')>('@/db/schema');
    const releaseInsertCalls = insertMock.mock.calls.filter((c) => c[0] === releaseLogs);
    expect(releaseInsertCalls).toHaveLength(0);
  });

  it('Test 7: env=prod + mode=enforce + all match -> 201, release inserted, no reject audit', async () => {
    process.env.CL6_ENFORCEMENT_MODE = 'enforce';
    selectResult = [passingVerdictRow()];
    const { POST } = await import('./route');
    const res = await POST(buildRequest(VALID_PROD_BODY));
    expect(res.status).toBe(201);
    const { releaseLogs, deployGateCheck } = await vi.importActual<typeof import('@/db/schema')>('@/db/schema');
    const releaseInsertCalls = insertMock.mock.calls.filter((c) => c[0] === releaseLogs);
    expect(releaseInsertCalls).toHaveLength(1);
    const auditInsertCalls = insertMock.mock.calls.filter((c) => c[0] === deployGateCheck);
    expect(auditInsertCalls).toHaveLength(0);
  });

  it('Test 8: env=prod + mode=warn + no verdict row -> 201 (warn does not block), audit + release both written', async () => {
    process.env.CL6_ENFORCEMENT_MODE = 'warn';
    selectResult = [];
    const { POST } = await import('./route');
    const res = await POST(buildRequest(VALID_PROD_BODY));
    expect(res.status).toBe(201);
    const { releaseLogs, deployGateCheck } = await vi.importActual<typeof import('@/db/schema')>('@/db/schema');
    const releaseInsertCalls = insertMock.mock.calls.filter((c) => c[0] === releaseLogs);
    const auditInsertCalls = insertMock.mock.calls.filter((c) => c[0] === deployGateCheck);
    expect(releaseInsertCalls).toHaveLength(1);
    expect(auditInsertCalls).toHaveLength(1);
    const auditValuesArg = insertValuesMock.mock.calls.find((c) => c[0]?.verdict === 'reject_no_pair');
    expect(auditValuesArg).toBeDefined();
  });

  it('Test 9: 409 body shape is structurally locked', async () => {
    process.env.CL6_ENFORCEMENT_MODE = 'enforce';
    selectResult = [];
    const { POST } = await import('./route');
    const res = await POST(buildRequest(VALID_PROD_BODY));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body).toMatchObject({
      error: 'gate_required',
      code: 'CL6-VIOLATION',
      expected: {
        project_key: 'truth-treason',
        target_version: 'v2.13.14',
        max_age_seconds: 900,
      },
      remediation_url: '/admin/modules/ci-cd',
    });
    expect(typeof body.reason).toBe('string');
  });

  // ── Phase 36 INCL-06: ingest passes commitSha + surfaces orphan warning ──

  it('Phase 36-A: ingest passes commitSha + projectKey + releaseId to stampLinksFromCommit', async () => {
    process.env.CL6_ENFORCEMENT_MODE = 'off';
    const { POST } = await import('./route');
    await POST(buildRequest({
      ...VALID_PROD_BODY,
      commitSha: 'sha-abc-123',
      summary: 'Fix BUG-something so the stamper sees text to parse',
    }));

    expect(stampLinksFromCommitMock).toHaveBeenCalledTimes(1);
    const callArg = stampLinksFromCommitMock.mock.calls[0][0];
    expect(callArg.commitSha).toBe('sha-abc-123');
    expect(callArg.projectKey).toBe('truth-treason');
    expect(callArg.releaseId).toBe(FAKE_RELEASE_ROW.id);
  });

  it('Phase 36-B: orphanLinks > 0 → console.warn with structured payload', async () => {
    process.env.CL6_ENFORCEMENT_MODE = 'off';
    stampLinksFromCommitMock.mockResolvedValueOnce({
      stamped: 3,
      dropped: 0,
      autoFlipped: 1,
      orphanLinks: 2,
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { POST } = await import('./route');
    const res = await POST(buildRequest({
      ...VALID_PROD_BODY,
      commitSha: 'sha-orphan',
      summary: 'commit with refs',
    }));

    expect(res.status).toBe(201);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toBe('[link-stamper] orphan links detected');
    expect(warnSpy.mock.calls[0][1]).toMatchObject({
      releaseId: FAKE_RELEASE_ROW.id,
      project: 'truth-treason',
      orphanLinks: 2,
      autoFlipped: 1,
      stamped: 3,
    });

    warnSpy.mockRestore();
  });

  it('Phase 36-C: orphanLinks === 0 → NO console.warn fires', async () => {
    process.env.CL6_ENFORCEMENT_MODE = 'off';
    stampLinksFromCommitMock.mockResolvedValueOnce({
      stamped: 1,
      dropped: 0,
      autoFlipped: 1,
      orphanLinks: 0,
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { POST } = await import('./route');
    await POST(buildRequest({
      ...VALID_PROD_BODY,
      commitSha: 'sha-clean',
      summary: 'a clean commit',
    }));

    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
