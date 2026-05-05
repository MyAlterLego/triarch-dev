/**
 * Vitest suite for POST /api/platform/promote-callback
 *
 * Tests: auth (401/403), validation (400 missing branch, 400 missing result,
 *        400 invalid result enum), 201 success merged, 201 success conflict.
 *        RC-06: threaded Slack reply for conflict / merged / ci_failed.
 *        D-11: missing metadata.dispatch → skip Slack, still 201.
 *        D-15: Slack post failure → still 201.
 *
 * All DB operations are mocked — no real database needed.
 * Mock style mirrors src/app/api/releases/promoted/route.test.ts.
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
// Covers: db.insert(promoteAttempts).values({...}).returning()
//         db.select().from(releaseLogs).where(...).orderBy(...).limit(N) → Promise<row[]>

const insertValuesMock = vi.fn();
const insertMock = vi.fn();
const selectMock = vi.fn();

// Drizzle chain: db.select().from(table).where(...).orderBy(...).limit(N) → Promise<row[]>
// Build a chain object whose terminal .limit(...) resolves to selectMock().
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

// ─── Mock: @/db/schema ────────────────────────────────────────────────────────

vi.mock('@/db/schema', async () => {
  const actual = await vi.importActual<typeof import('@/db/schema')>('@/db/schema');
  return {
    promoteAttempts: actual.promoteAttempts,
    projects: actual.projects,
    releaseLogs: actual.releaseLogs,
  };
});

// ─── Mock: @/lib/slack ────────────────────────────────────────────────────────

const postSlackThreadedReplyMock = vi.fn();
vi.mock('@/lib/slack', () => ({
  postSlackThreadedReply: (...args: unknown[]) => postSlackThreadedReplyMock(...args),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

const FAKE_PROJECT = { id: 'proj-uuid', key: 'truth-treason', apiKey: 'valid-token' };

const VALID_MERGED_BODY = {
  branch: 'feat/change-font',
  result: 'merged',
  merge_sha: 'abc123',
  conflict_files: [],
  rebase_error: null,
  ci_run_url: null,
};

const FAKE_INSERTED_ROW = {
  id: 'mock-uuid',
  project: 'truth-treason',
  branch: 'feat/change-font',
  result: 'merged',
  mergeSha: 'abc123',
  conflictFiles: [],
  rebaseError: null,
  ciRunUrl: null,
};

function buildRequest(body: Record<string, unknown>, headers: Record<string, string> = {}) {
  return new NextRequest(new URL('http://localhost/api/platform/promote-callback'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/platform/promote-callback', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: auth succeeds
    requireApiKeyMock.mockResolvedValue({ error: null, project: FAKE_PROJECT });

    // Default insert chain: insert().values().returning() → resolves with inserted row
    insertValuesMock.mockReturnValue({
      returning: vi.fn().mockResolvedValue([FAKE_INSERTED_ROW]),
    });
    insertMock.mockReturnValue({
      values: insertValuesMock,
    });

    // Default: no release row found → D-11 path → skip Slack
    selectMock.mockReturnValue([]);
    postSlackThreadedReplyMock.mockResolvedValue({ ok: true, ts: '1700000000.000200' });
  });

  // Test 1 — 401 no Authorization header
  it('returns 401 when Authorization header is missing', async () => {
    const { NextResponse } = await import('next/server');
    requireApiKeyMock.mockResolvedValue({
      error: NextResponse.json(
        { error: 'Missing Authorization: Bearer <api_key> header' },
        { status: 401 }
      ),
      project: null,
    });

    const { POST } = await import('./route');
    const req = buildRequest(VALID_MERGED_BODY);
    const res = await POST(req);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/Missing Authorization/);
    expect(insertMock).not.toHaveBeenCalled();
  });

  // Test 2 — 403 invalid Bearer token
  it('returns 403 when Bearer token is invalid', async () => {
    const { NextResponse } = await import('next/server');
    requireApiKeyMock.mockResolvedValue({
      error: NextResponse.json({ error: 'Invalid API key' }, { status: 403 }),
      project: null,
    });

    const { POST } = await import('./route');
    const req = buildRequest(VALID_MERGED_BODY, { Authorization: 'Bearer wrong-token' });
    const res = await POST(req);

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/Invalid API key/);
    expect(insertMock).not.toHaveBeenCalled();
  });

  // Test 3 — 400 missing branch
  it('returns 400 and mentions "branch" when branch field is missing', async () => {
    const { POST } = await import('./route');
    const req = buildRequest({ result: 'merged', merge_sha: 'abc' }, { Authorization: 'Bearer valid' });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/branch/i);
    expect(insertMock).not.toHaveBeenCalled();
  });

  // Test 4 — 400 missing result
  it('returns 400 and mentions "result" when result field is missing', async () => {
    const { POST } = await import('./route');
    const req = buildRequest({ branch: 'feat/x' }, { Authorization: 'Bearer valid' });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/result/i);
    expect(insertMock).not.toHaveBeenCalled();
  });

  // Test 5 — 400 result outside enum
  it('returns 400 and mentions "result" when result is not in the valid enum', async () => {
    const { POST } = await import('./route');
    const req = buildRequest(
      { branch: 'feat/x', result: 'frobnicated' },
      { Authorization: 'Bearer valid' }
    );
    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/result/i);
    expect(insertMock).not.toHaveBeenCalled();
  });

  // Test 6 — 201 valid merged payload, correct camelCase insert values
  it('returns 201 and inserts a merged row with correct camelCase fields', async () => {
    const { POST } = await import('./route');
    const req = buildRequest(VALID_MERGED_BODY, { Authorization: 'Bearer valid' });
    const res = await POST(req);

    expect(res.status).toBe(201);

    // Assert db.insert was called once with promoteAttempts table
    expect(insertMock).toHaveBeenCalledTimes(1);

    // Assert .values() received the camelCase-mapped object
    const valuesCall = insertValuesMock.mock.calls[0][0];
    expect(valuesCall).toMatchObject({
      project: 'truth-treason',
      branch: 'feat/change-font',
      result: 'merged',
      mergeSha: 'abc123',
      conflictFiles: [],
      rebaseError: null,
      ciRunUrl: null,
    });
  });

  // Test 7 — 201 valid conflict payload, conflict_files and rebase_error persisted
  it('returns 201 and persists conflict_files and rebase_error on conflict result', async () => {
    const conflictRow = {
      ...FAKE_INSERTED_ROW,
      result: 'conflict',
      conflictFiles: ['src/foo.ts', 'src/bar.ts'],
      rebaseError: 'CONFLICT (content): Merge conflict in src/foo.ts',
    };
    insertValuesMock.mockReturnValue({
      returning: vi.fn().mockResolvedValue([conflictRow]),
    });
    insertMock.mockReturnValue({ values: insertValuesMock });

    const { POST } = await import('./route');
    const req = buildRequest(
      {
        branch: 'feat/change-font',
        result: 'conflict',
        conflict_files: ['src/foo.ts', 'src/bar.ts'],
        rebase_error: 'CONFLICT (content): Merge conflict in src/foo.ts',
      },
      { Authorization: 'Bearer valid' }
    );
    const res = await POST(req);

    expect(res.status).toBe(201);

    const valuesCall = insertValuesMock.mock.calls[0][0];
    expect(valuesCall.result).toBe('conflict');
    expect(valuesCall.conflictFiles).toEqual(['src/foo.ts', 'src/bar.ts']);
    expect(valuesCall.rebaseError).toBe('CONFLICT (content): Merge conflict in src/foo.ts');
  });

  // ── RC-06: Slack threaded reply on result='conflict' ────────────────────────

  const RELEASE_WITH_DISPATCH = {
    id: 'rel-uuid-1',
    project: 'truth-treason',
    branch: 'feat/change-font',
    metadata: {
      previewUrl: 'https://feat-change-font--truth-treason.us-central1.hosted.app',
      dispatch: {
        slackChannelId: 'C_RELEASE_APPROVALS',
        slackMessageTs: '1700000000.000100',
        dispatchedAt: '2026-05-05T17:00:00.000Z',
      },
    },
  };

  it('on result=conflict, posts :warning: threaded reply with file list + rebase hint', async () => {
    selectMock.mockReturnValue([RELEASE_WITH_DISPATCH]);

    const conflictBody = {
      branch: 'feat/change-font',
      result: 'conflict',
      conflict_files: ['src/foo.ts', 'src/bar.ts', 'src/baz.tsx'],
      rebase_error: 'CONFLICT (content): Merge conflict in src/foo.ts',
    };
    const { POST } = await import('./route');
    const req = buildRequest(conflictBody, { Authorization: 'Bearer valid' });
    const res = await POST(req);

    expect(res.status).toBe(201);
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(postSlackThreadedReplyMock).toHaveBeenCalledTimes(1);
    const replyArgs = postSlackThreadedReplyMock.mock.calls[0][0];
    expect(replyArgs.channel).toBe('C_RELEASE_APPROVALS');
    expect(replyArgs.thread_ts).toBe('1700000000.000100');
    expect(replyArgs.text).toContain(':warning: Cannot promote feat/change-font — conflicts with main:');
    expect(replyArgs.text).toContain('src/foo.ts');
    expect(replyArgs.text).toContain('src/bar.ts');
    expect(replyArgs.text).toContain('src/baz.tsx');
    expect(replyArgs.text).toContain('Rebase manually on main, push as a new RC to retry.');
    // file list is wrapped in a code block
    expect(replyArgs.text).toContain('```');
  });

  it('on result=conflict with >50 files, appends "+ N more files" line', async () => {
    selectMock.mockReturnValue([RELEASE_WITH_DISPATCH]);
    const fiftyThreeFiles = Array.from({ length: 53 }, (_, i) => `src/file-${i}.ts`);

    const { POST } = await import('./route');
    const req = buildRequest(
      { branch: 'feat/change-font', result: 'conflict', conflict_files: fiftyThreeFiles },
      { Authorization: 'Bearer valid' }
    );
    const res = await POST(req);

    expect(res.status).toBe(201);
    expect(postSlackThreadedReplyMock).toHaveBeenCalledTimes(1);
    const replyText = postSlackThreadedReplyMock.mock.calls[0][0].text;
    expect(replyText).toContain('src/file-0.ts');
    expect(replyText).toContain('src/file-49.ts'); // 50th file (0-indexed 49)
    expect(replyText).not.toContain('src/file-50.ts'); // capped
    expect(replyText).toContain('+ 3 more files');
  });

  it('on result=merged, posts :white_check_mark: threaded reply with short merge sha', async () => {
    selectMock.mockReturnValue([RELEASE_WITH_DISPATCH]);

    const { POST } = await import('./route');
    const req = buildRequest(
      { branch: 'feat/change-font', result: 'merged', merge_sha: 'abc1234567890' },
      { Authorization: 'Bearer valid' }
    );
    const res = await POST(req);

    expect(res.status).toBe(201);
    expect(postSlackThreadedReplyMock).toHaveBeenCalledTimes(1);
    const replyText = postSlackThreadedReplyMock.mock.calls[0][0].text;
    expect(replyText).toBe(':white_check_mark: Promoted feat/change-font to main (sha: abc1234)');
  });

  it('on result=ci_failed, posts :no_entry: threaded reply with ci_run_url', async () => {
    selectMock.mockReturnValue([RELEASE_WITH_DISPATCH]);

    const { POST } = await import('./route');
    const req = buildRequest(
      {
        branch: 'feat/change-font',
        result: 'ci_failed',
        ci_run_url: 'https://github.com/MyAlterLego/truth-treason/actions/runs/123',
      },
      { Authorization: 'Bearer valid' }
    );
    const res = await POST(req);

    expect(res.status).toBe(201);
    expect(postSlackThreadedReplyMock).toHaveBeenCalledTimes(1);
    const replyText = postSlackThreadedReplyMock.mock.calls[0][0].text;
    expect(replyText).toContain(':no_entry: CI failed for feat/change-font');
    expect(replyText).toContain('https://github.com/MyAlterLego/truth-treason/actions/runs/123');
  });

  it('D-11: missing metadata.dispatch on release → 201, db insert, but NO Slack post', async () => {
    selectMock.mockReturnValue([
      {
        id: 'rel-uuid-2',
        project: 'truth-treason',
        branch: 'feat/change-font',
        metadata: { previewUrl: 'https://...' },
        // no dispatch key
      },
    ]);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { POST } = await import('./route');
    const req = buildRequest(
      { branch: 'feat/change-font', result: 'conflict', conflict_files: ['src/foo.ts'] },
      { Authorization: 'Bearer valid' }
    );
    const res = await POST(req);

    expect(res.status).toBe(201);
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(postSlackThreadedReplyMock).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('D-11: no matching release row → 201, db insert, NO Slack post', async () => {
    selectMock.mockReturnValue([]); // no release on (project, branch)

    const { POST } = await import('./route');
    const req = buildRequest(
      { branch: 'feat/change-font', result: 'merged', merge_sha: 'abc1234' },
      { Authorization: 'Bearer valid' }
    );
    const res = await POST(req);

    expect(res.status).toBe(201);
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(postSlackThreadedReplyMock).not.toHaveBeenCalled();
  });

  it('D-15: postSlackThreadedReply throws → still 201, db insert preserved', async () => {
    selectMock.mockReturnValue([RELEASE_WITH_DISPATCH]);
    postSlackThreadedReplyMock.mockRejectedValue(new Error('Slack down'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { POST } = await import('./route');
    const req = buildRequest(
      { branch: 'feat/change-font', result: 'merged', merge_sha: 'abc1234' },
      { Authorization: 'Bearer valid' }
    );
    const res = await POST(req);

    expect(res.status).toBe(201);
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(postSlackThreadedReplyMock).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
