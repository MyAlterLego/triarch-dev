/**
 * Vitest suite for POST /api/slack/interact
 *
 * All collaborators are mocked so no DB or real secrets are needed.
 * vi.mock calls are hoisted before imports, so the route module picks up
 * mocked versions of @/lib/db, @/lib/release-actions, and @/lib/slack-identity.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createHmac } from 'node:crypto';

// ─── Constants ────────────────────────────────────────────────────────────────

const SIGNING = 'test_signing_secret';
const PAYLOAD_SEC = 'test_payload_secret';

// ─── Mock: release-actions ────────────────────────────────────────────────────

const approveMock = vi.fn();
const rejectMock = vi.fn();
const promoteAndAuditMock = vi.fn();

vi.mock('@/lib/release-actions', () => ({
  approveRelease: (...args: unknown[]) => approveMock(...args),
  rejectRelease: (...args: unknown[]) => rejectMock(...args),
}));

vi.mock('@/lib/release-promotion', () => ({
  promoteAndAudit: (...args: unknown[]) => promoteAndAuditMock(...args),
}));

// ─── Mock: db ─────────────────────────────────────────────────────────────────
// Drizzle builder chain: db.select().from().where()
// For the stale-guard branch: db.select().from().where().orderBy().limit()
// We use a callable-chain factory that the mock swaps per test via dbSelectResult / dbStaleResult.

let dbSelectResult: unknown[] = [];
let dbStaleResult: unknown[] = [];
let dbCallCount = 0;

vi.mock('@/lib/db', () => {
  const makeChain = (result: () => unknown[]) => ({
    from: () => ({
      where: () => ({
        orderBy: () => ({
          limit: () => Promise.resolve(result()),
        }),
        // resolved directly when no orderBy/limit (first release lookup)
        then: (resolve: (v: unknown) => unknown) => Promise.resolve(result()).then(resolve),
        // make it a thenable AND have orderBy for stale guard
      }),
    }),
  });

  return {
    db: {
      select: () => {
        dbCallCount += 1;
        if (dbCallCount === 1) {
          // First select: release lookup
          return makeChain(() => dbSelectResult);
        }
        // Second select: stale-guard approval lookup
        return makeChain(() => dbStaleResult);
      },
    },
  };
});

// ─── Mock: slack-identity ─────────────────────────────────────────────────────

const resolveMock = vi.fn();

vi.mock('@/lib/slack-identity', () => ({
  resolveSlackUserEmail: (id: string) => resolveMock(id),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a raw Slack request body and matching signature headers. */
function buildSignedRequest(
  rawBody: string,
  opts: { tsOffsetSec?: number; tamperSig?: boolean } = {}
): Request {
  const ts = String(Math.floor(Date.now() / 1000) + (opts.tsOffsetSec ?? 0));
  const baseString = `v0:${ts}:${rawBody}`;
  let sig = 'v0=' + createHmac('sha256', SIGNING).update(baseString).digest('hex');
  if (opts.tamperSig) {
    sig = sig.slice(0, -2) + (sig.endsWith('aa') ? 'bb' : 'aa');
  }
  const headers = new Headers({
    'x-slack-request-timestamp': ts,
    'x-slack-signature': sig,
    'content-type': 'application/x-www-form-urlencoded',
  });
  return new Request('http://localhost/api/slack/interact', {
    method: 'POST',
    body: rawBody,
    headers,
    // duplex needed for streaming body in some environments
  });
}

/** Compute a packed button value using the test payload secret. */
function packedValue(releaseId: string, action: 'promote' | 'reject', nonce = 'abc123'): string {
  const raw = createHmac('sha256', PAYLOAD_SEC)
    .update(`${releaseId}:${action}:${nonce}`)
    .digest();
  const sig = Buffer.from(raw)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `${releaseId}.${nonce}.${sig}`;
}

/** Build a URL-encoded body containing a Slack block_actions payload. */
function payloadBody(
  actionId: 'slack_promote' | 'slack_reject',
  value: string,
  userId = 'U_STAFF'
): string {
  const p = {
    type: 'block_actions',
    user: { id: userId, name: 'mike', username: 'mike' },
    actions: [{ action_id: actionId, value, block_id: `release_actions_rel-uuid` }],
    channel: { id: 'C_RELEASE_APPROVALS', name: 'release-approvals' },
    message: { ts: '1714000000.000100' },
  };
  return new URLSearchParams({ payload: JSON.stringify(p) }).toString();
}

/** Shared fake release row for happy-path tests. */
const fakeRelease = { id: 'rel-uuid', project: 'truth', version: '1.0.0', status: 'dev' };

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  process.env.SLACK_SIGNING_SECRET = SIGNING;
  process.env.SLACK_PAYLOAD_SECRET = PAYLOAD_SEC;

  dbCallCount = 0;
  dbSelectResult = [fakeRelease];
  dbStaleResult = [];

  approveMock.mockReset();
  rejectMock.mockReset();
  promoteAndAuditMock.mockReset();
  resolveMock.mockReset();

  resolveMock.mockReturnValue('mike@triarchsecurity.com');
  promoteAndAuditMock.mockResolvedValue({ ok: true });
  approveMock.mockResolvedValue({
    ok: true,
    alreadyApproved: false,
    release: { id: 'rel-uuid', status: 'approved' },
    approval: null,
  });
  rejectMock.mockResolvedValue({
    ok: true,
    release: { id: 'rel-uuid', status: 'rejected' },
    approval: null,
  });
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/slack/interact', () => {
  it('bad Slack signature → 401 bad_signature', async () => {
    const { POST } = await import('@/app/api/slack/interact/route');
    const body = payloadBody('slack_promote', packedValue('rel-uuid', 'promote'));
    const req = buildSignedRequest(body, { tamperSig: true });
    const res = await POST(req as never);
    expect(res.status).toBe(401);
    const json = await res.json() as Record<string, unknown>;
    expect(json.error).toBe('bad_signature');
    expect(approveMock).not.toHaveBeenCalled();
  });

  it('stale timestamp (>300s old) → 401 stale', async () => {
    const { POST } = await import('@/app/api/slack/interact/route');
    const body = payloadBody('slack_promote', packedValue('rel-uuid', 'promote'));
    const req = buildSignedRequest(body, { tsOffsetSec: -601 });
    const res = await POST(req as never);
    expect(res.status).toBe(401);
    const json = await res.json() as Record<string, unknown>;
    expect(json.error).toBe('stale');
    expect(approveMock).not.toHaveBeenCalled();
  });

  it('missing X-Slack-Signature header → 401 malformed', async () => {
    const { POST } = await import('@/app/api/slack/interact/route');
    const body = payloadBody('slack_promote', packedValue('rel-uuid', 'promote'));
    const ts = String(Math.floor(Date.now() / 1000));
    const req = new Request('http://localhost/api/slack/interact', {
      method: 'POST',
      body,
      headers: new Headers({
        'x-slack-request-timestamp': ts,
        // no x-slack-signature
        'content-type': 'application/x-www-form-urlencoded',
      }),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(401);
    const json = await res.json() as Record<string, unknown>;
    expect(json.error).toBe('malformed');
  });

  it('valid signature + missing payload field → 400 no_payload', async () => {
    const { POST } = await import('@/app/api/slack/interact/route');
    const body = 'token=abc&team_id=T12345'; // no payload field
    const req = buildSignedRequest(body);
    const res = await POST(req as never);
    expect(res.status).toBe(400);
    const json = await res.json() as Record<string, unknown>;
    expect(json.error).toBe('no_payload');
  });

  it('valid signature + malformed JSON in payload → 400 malformed_payload', async () => {
    const { POST } = await import('@/app/api/slack/interact/route');
    const body = new URLSearchParams({ payload: '{not valid json' }).toString();
    const req = buildSignedRequest(body);
    const res = await POST(req as never);
    expect(res.status).toBe(400);
    const json = await res.json() as Record<string, unknown>;
    expect(json.error).toBe('malformed_payload');
  });

  it('valid signature + payload type !== block_actions → 400 unsupported_payload', async () => {
    const { POST } = await import('@/app/api/slack/interact/route');
    const p = { type: 'shortcut', actions: [{ action_id: 'slack_promote', value: 'x' }] };
    const body = new URLSearchParams({ payload: JSON.stringify(p) }).toString();
    const req = buildSignedRequest(body);
    const res = await POST(req as never);
    expect(res.status).toBe(400);
    const json = await res.json() as Record<string, unknown>;
    expect(json.error).toBe('unsupported_payload');
  });

  it('tampered button value → 401 invalid_payload_signature', async () => {
    const { POST } = await import('@/app/api/slack/interact/route');
    // Use a packed value signed for 'reject' but send as slack_promote (expectedAction = 'promote')
    const wrongPacked = packedValue('rel-uuid', 'reject');
    const body = payloadBody('slack_promote', wrongPacked);
    const req = buildSignedRequest(body);
    const res = await POST(req as never);
    expect(res.status).toBe(401);
    const json = await res.json() as Record<string, unknown>;
    expect(json.error).toBe('invalid_payload_signature');
    expect(approveMock).not.toHaveBeenCalled();
  });

  it('unmapped Slack user → 200 ephemeral with "not mapped" text; no DB write', async () => {
    const { POST } = await import('@/app/api/slack/interact/route');
    resolveMock.mockReturnValue(null); // unmapped
    const body = payloadBody('slack_promote', packedValue('rel-uuid', 'promote'));
    const req = buildSignedRequest(body);
    const res = await POST(req as never);
    expect(res.status).toBe(200);
    const json = await res.json() as Record<string, unknown>;
    expect(json.response_type).toBe('ephemeral');
    expect(typeof json.text).toBe('string');
    expect((json.text as string).toLowerCase()).toContain('not mapped');
    expect(approveMock).not.toHaveBeenCalled();
    expect(rejectMock).not.toHaveBeenCalled();
  });

  it('unknown action_id → 200 ephemeral "Unknown action"; helpers not called', async () => {
    const { POST } = await import('@/app/api/slack/interact/route');
    const p = {
      type: 'block_actions',
      user: { id: 'U_STAFF', name: 'mike' },
      actions: [{ action_id: 'slack_unknown', value: 'anything', block_id: 'b1' }],
    };
    const body = new URLSearchParams({ payload: JSON.stringify(p) }).toString();
    const req = buildSignedRequest(body);
    const res = await POST(req as never);
    expect(res.status).toBe(200);
    const json = await res.json() as Record<string, unknown>;
    expect(json.response_type).toBe('ephemeral');
    expect(json.text).toBe('Unknown action');
    expect(approveMock).not.toHaveBeenCalled();
    expect(rejectMock).not.toHaveBeenCalled();
  });

  it('slack_promote on a dev release (customer not yet approved) → 200 ephemeral "Cannot promote"; promoteAndAudit not called', async () => {
    const { POST } = await import('@/app/api/slack/interact/route');
    // dbSelectResult defaults to fakeRelease with status='dev' — see beforeEach
    const body = payloadBody('slack_promote', packedValue('rel-uuid', 'promote'));
    const req = buildSignedRequest(body);
    const res = await POST(req as never);
    expect(res.status).toBe(200);
    const json = await res.json() as Record<string, unknown>;
    expect(json.response_type).toBe('ephemeral');
    expect((json.text as string).toLowerCase()).toContain('cannot promote');
    expect(approveMock).not.toHaveBeenCalled();
    expect(promoteAndAuditMock).not.toHaveBeenCalled();
  });

  it('slack_promote on a customer-approved release → 200 replace_original "Promoted"; promoteAndAudit fired fire-and-forget', async () => {
    const { POST } = await import('@/app/api/slack/interact/route');
    dbSelectResult = [{ ...fakeRelease, status: 'approved' }]; // customer already approved on the page
    const body = payloadBody('slack_promote', packedValue('rel-uuid', 'promote'));
    const req = buildSignedRequest(body);
    const res = await POST(req as never);
    expect(res.status).toBe(200);
    const json = await res.json() as Record<string, unknown>;
    expect(json.replace_original).toBe(true);
    expect((json.text as string).toLowerCase()).toContain('promoted');
    expect(approveMock).not.toHaveBeenCalled();
    expect(promoteAndAuditMock).toHaveBeenCalledOnce();
    const callArgs = promoteAndAuditMock.mock.calls[0][0] as Record<string, unknown>;
    expect(callArgs.actorEmail).toBe('mike@triarchsecurity.com');
    expect(callArgs.release).toMatchObject({ id: 'rel-uuid' });
  });

  it('slack_promote on already-promoted release → 200 ephemeral "Already promoted"; nothing fires', async () => {
    const { POST } = await import('@/app/api/slack/interact/route');
    dbSelectResult = [{ ...fakeRelease, status: 'promoted' }]; // terminal state
    dbStaleResult = [
      {
        id: 'approval-1',
        approverEmail: 'alice@triarchsecurity.com',
        approvedAt: new Date('2026-05-01T12:00:00Z'),
        decision: 'promoted',
      },
    ];
    const body = payloadBody('slack_promote', packedValue('rel-uuid', 'promote'));
    const req = buildSignedRequest(body);
    const res = await POST(req as never);
    expect(res.status).toBe(200);
    const json = await res.json() as Record<string, unknown>;
    expect(json.replace_original).toBe(true);
    expect((json.text as string).toLowerCase()).toContain('already');
    expect(approveMock).not.toHaveBeenCalled();
    expect(promoteAndAuditMock).not.toHaveBeenCalled();
  });

  it('slack_reject on a dev release → 200 replace_original; rejectRelease called with fixed reason', async () => {
    const { POST } = await import('@/app/api/slack/interact/route');
    const body = payloadBody('slack_reject', packedValue('rel-uuid', 'reject'));
    const req = buildSignedRequest(body);
    const res = await POST(req as never);
    expect(res.status).toBe(200);
    const json = await res.json() as Record<string, unknown>;
    expect(json.replace_original).toBe(true);
    expect(rejectMock).toHaveBeenCalledOnce();
    const callArgs = rejectMock.mock.calls[0][0] as Record<string, unknown>;
    expect(callArgs.reason).toBe('Rejected via Slack');
    expect(callArgs.approverEmail).toBe('mike@triarchsecurity.com');
  });
});
