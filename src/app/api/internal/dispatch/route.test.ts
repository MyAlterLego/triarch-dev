import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Hoist mocks BEFORE module-under-test imports (Vitest hoisting)
// ---------------------------------------------------------------------------

vi.mock('@triarchsecurity/secrets', () => ({
  getSecret: vi.fn(),
}));

vi.mock('@/lib/release-promotion', () => ({
  promoteAndAudit: vi.fn(),
}));

// db mock — two distinct select chains:
//   1. project lookup: select({ key }).from(projects).where(eq) → [{key}] or []
//   2. release lookup: select().from(releaseLogs).where(and) → [releaseRow] or []
// We use mockResolvedValueOnce to sequence calls correctly per test.
const mockSelectWhere = vi.fn();

vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: mockSelectWhere,
      }),
    }),
  },
}));

// ---------------------------------------------------------------------------
// Module imports (after mocks are hoisted)
// ---------------------------------------------------------------------------

import { POST } from './route';
import { getSecret } from '@triarchsecurity/secrets';
import { promoteAndAudit } from '@/lib/release-promotion';
import { signRequest } from '@triarchsecurity/triarch-shared/internal-hmac';

// ---------------------------------------------------------------------------
// Test constants
// ---------------------------------------------------------------------------

const TEST_SECRET = 'test-hmac-secret-for-dispatch-integration-tests';
const FIXED_NOW = 1_700_000_000_000;
const FIXED_NONCE = 'b'.repeat(32);

const BASE_INPUT = {
  intent: 'dispatch_promotion' as const,
  branch: 'release/1.0.0',
  version: '1.0.0',
  projectKey: 'darksouls-rpg',
  releaseId: 'rel-uuid-1234',
  actorEmail: 'customer@example.com',
  slackChannelId: null as string | null,
  slackMessageTs: null as string | null,
};

const MOCK_PROJECT = { key: 'darksouls-rpg' };

const MOCK_RELEASE = {
  id: 'rel-uuid-1234',
  project: 'darksouls-rpg',
  branch: 'release/1.0.0',
  version: '1.0.0',
  status: 'approved',
  env: 'dev',
  releaseType: 'minor',
  releasedAt: new Date('2026-05-08T10:00:00Z'),
  releasedBy: 'ci@example.com',
  summary: null,
  entries: [],
  promotionDispatchedAt: null,
  promotionDispatchedBy: null,
  metadata: {},
  createdAt: new Date('2026-05-08T10:00:00Z'),
  commitSha: null,
  deployedAt: null,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildRequest(rawBody: string, signature: string | null): NextRequest {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (signature !== null) headers['x-hmac-signature'] = signature;
  return new NextRequest('http://localhost/api/internal/dispatch', {
    method: 'POST',
    headers,
    body: rawBody,
  });
}

let testNonceCounter = 0;

function makeValidRequest(overrideNow?: number, overrideNonce?: string) {
  // Default to Date.now() so signatures are not expired when verified against wall clock.
  // Default nonce is unique per call to avoid nonce store replay collisions across tests.
  const uniqueNonce = overrideNonce ?? `${FIXED_NONCE.slice(0, 16)}${String(++testNonceCounter).padStart(16, '0')}`;
  const { body, signature } = signRequest(BASE_INPUT, TEST_SECRET, {
    now: overrideNow ?? Date.now(),
    nonce: uniqueNonce,
  });
  const rawBody = JSON.stringify(body, Object.keys(body).sort());
  return { rawBody, signature };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  // Default: secret resolves
  (getSecret as ReturnType<typeof vi.fn>).mockResolvedValue(TEST_SECRET);
  // Default: project exists + release exists
  mockSelectWhere
    .mockResolvedValueOnce([MOCK_PROJECT])
    .mockResolvedValueOnce([MOCK_RELEASE]);
  // Default: promoteAndAudit succeeds
  (promoteAndAudit as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
});

describe('POST /api/internal/dispatch', () => {

  it('Test 1 (valid): 200 + promoteAndAudit called once with correct args', async () => {
    const { rawBody, signature } = makeValidRequest();
    const req = buildRequest(rawBody, signature);

    const res = await POST(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toEqual({ ok: true });

    expect(promoteAndAudit).toHaveBeenCalledTimes(1);
    expect(promoteAndAudit).toHaveBeenCalledWith({
      release: MOCK_RELEASE,
      actorEmail: 'customer@example.com',
      channelId: null,
      messageTs: null,
      slackUserName: null,
    });
  });

  it('Test 2 (tampered signature): 401 + promoteAndAudit NOT called', async () => {
    const { rawBody } = makeValidRequest();
    const req = buildRequest(rawBody, 'a'.repeat(64)); // wrong signature

    const res = await POST(req);
    expect(res.status).toBe(401);

    const body = await res.json();
    expect(body.error).toBe('bad_signature');
    expect(promoteAndAudit).not.toHaveBeenCalled();
  });

  it('Test 3 (expired timestamp): 401 + promoteAndAudit NOT called', async () => {
    // Build request with a timestamp 6 minutes in the past
    const oldNow = Date.now() - 6 * 60 * 1000;
    const { rawBody, signature } = makeValidRequest(oldNow);
    const req = buildRequest(rawBody, signature);

    const res = await POST(req);
    expect(res.status).toBe(401);

    const body = await res.json();
    expect(body.error).toBe('expired');
    expect(promoteAndAudit).not.toHaveBeenCalled();
  });

  it('Test 4 (replay): first 200, second 401 with {error: "replay"}', async () => {
    // Use a unique nonce so replay test won't collide with other tests
    const replayNonce = 'd'.repeat(32);
    const { rawBody, signature } = makeValidRequest(Date.now(), replayNonce);

    // First request
    const req1 = buildRequest(rawBody, signature);
    const res1 = await POST(req1);
    expect(res1.status).toBe(200);

    // Reset DB mocks for second call (project + release will be re-queried)
    mockSelectWhere
      .mockResolvedValueOnce([MOCK_PROJECT])
      .mockResolvedValueOnce([MOCK_RELEASE]);

    // Second request with same body+signature
    const req2 = buildRequest(rawBody, signature);
    const res2 = await POST(req2);
    expect(res2.status).toBe(401);

    const body2 = await res2.json();
    expect(body2.error).toBe('replay');
  });

  it('Test 5 (missing INTERNAL_HMAC_SECRET): 500 + {error: "server_misconfigured"}', async () => {
    (getSecret as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('vault unreachable'));

    const { rawBody, signature } = makeValidRequest();
    const req = buildRequest(rawBody, signature);

    const res = await POST(req);
    expect(res.status).toBe(500);

    const body = await res.json();
    expect(body.error).toBe('server_misconfigured');
    expect(promoteAndAudit).not.toHaveBeenCalled();
  });

  it('Test 6 (project not found): 404 + promoteAndAudit NOT called', async () => {
    // Override the default db mock queues — reset and set just project-not-found
    mockSelectWhere.mockReset();
    mockSelectWhere.mockResolvedValueOnce([]); // project not found

    const { rawBody, signature } = makeValidRequest();
    const req = buildRequest(rawBody, signature);

    const res = await POST(req);
    expect(res.status).toBe(404);

    const body = await res.json();
    expect(body.error).toBe('project_not_found');
    expect(promoteAndAudit).not.toHaveBeenCalled();
  });

  it('Test 7 (release not found for project): 404 + promoteAndAudit NOT called', async () => {
    // Override the default db mock queues — reset and set project-found + release-not-found
    mockSelectWhere.mockReset();
    mockSelectWhere
      .mockResolvedValueOnce([MOCK_PROJECT])  // project found
      .mockResolvedValueOnce([]);              // release not found

    const { rawBody, signature } = makeValidRequest();
    const req = buildRequest(rawBody, signature);

    const res = await POST(req);
    expect(res.status).toBe(404);

    const body = await res.json();
    expect(body.error).toBe('release_not_found');
    expect(promoteAndAudit).not.toHaveBeenCalled();
  });

  // Test 8: wrong intent (read_upcoming on dispatch route) → 400 wrong_intent.
  // Exercises the v2.4 Phase 36 discriminated-union intent guard. Pre-requires
  // @triarchsecurity/triarch-shared@0.5.0 dist (Pitfall 6 fix) so signRequest
  // emits a valid read_upcoming body and verifyRequest accepts it; the route's
  // wrong_intent guard at route.ts then returns 400.
  it('Test 8 (wrong intent: read_upcoming on dispatch route): 400 + promoteAndAudit NOT called', async () => {
    const { body, signature } = signRequest(
      { intent: 'read_upcoming' as const, projectKey: 'darksouls-rpg', actorEmail: 'customer@example.com' },
      TEST_SECRET,
      { now: Date.now(), nonce: 'e'.repeat(32) },
    );
    const rawBody = JSON.stringify(body, Object.keys(body).sort());
    const req = buildRequest(rawBody, signature);

    const res = await POST(req);
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.error).toBe('wrong_intent');
    expect(promoteAndAudit).not.toHaveBeenCalled();
  });

});
