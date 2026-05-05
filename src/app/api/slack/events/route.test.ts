/**
 * Wave 0 RED stubs for POST /api/slack/events.
 * Source file does NOT exist yet; tests must fail until plan 07-04 lands.
 *
 * Covers:
 * - url_verification challenge bypasses HMAC and returns the challenge
 * - HMAC verify on event_callback
 * - app_mention status mention parses subcommand + args
 * - duplicate event_id returns 200 no-op (in-memory dedup)
 * - mention text strips <@UBOT> prefix
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  buildSignedSlackRequest,
  makeEventPayload,
} from '@/lib/__tests__/__fixtures__/slack';

beforeEach(() => {
  process.env.SLACK_SIGNING_SECRET = 'test_signing_secret';
});

vi.mock('@myalterlego/secrets', () => ({
  getSecret: async (name: string) => process.env[name] ?? '',
}));

const postSlackThreadedReplyMock = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/slack', () => ({
  postSlackThreadedReply: (...args: unknown[]) => postSlackThreadedReplyMock(...args),
  chatPostMessage: vi.fn().mockResolvedValue(undefined),
}));

const recordSlackAuditMock = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/slack-audit', () => ({
  recordSlackAudit: (...args: unknown[]) => recordSlackAuditMock(...args),
}));

// db mock for status lookup paths invoked by app_mention status handler
let projectLookup: unknown[] = [];
let devLookup: unknown[] = [];
let prodLookup: unknown[] = [];
let rcsLookup: unknown[] = [];
let lastDeploysLookup: unknown[] = [];
let dbCallSequence: string[] = [];
vi.mock('@/lib/db', () => {
  const chain = (label: string, result: () => unknown[]) => {
    dbCallSequence.push(label);
    return {
      from: () => ({
        where: () => ({
          orderBy: () => ({ limit: () => Promise.resolve(result()) }),
          limit: () => Promise.resolve(result()),
        }),
        orderBy: () => ({ limit: () => Promise.resolve(result()) }),
        limit: () => Promise.resolve(result()),
      }),
    };
  };
  return {
    db: {
      select: () => {
        const idx = dbCallSequence.length;
        if (idx === 0) return chain('proj', () => projectLookup);
        if (idx === 1) return chain('dev', () => devLookup);
        if (idx === 2) return chain('prod', () => prodLookup);
        if (idx === 3) return chain('rcs', () => rcsLookup);
        return chain('last', () => lastDeploysLookup);
      },
    },
  };
});

beforeEach(() => {
  postSlackThreadedReplyMock.mockClear();
  recordSlackAuditMock.mockClear();
  dbCallSequence = [];
  projectLookup = [];
  devLookup = [];
  prodLookup = [];
  rcsLookup = [];
  lastDeploysLookup = [];
});

describe('POST /api/slack/events', () => {
  it('url_verification returns challenge without HMAC verification', async () => {
    const { POST } = await import('@/app/api/slack/events/route');
    const body = makeEventPayload({ type: 'url_verification', challenge: 'XYZ-CHAL' });
    // Deliberately use UNSIGNED request — url_verification must bypass HMAC
    const req = new Request('http://localhost/api/slack/events', {
      method: 'POST',
      body,
      headers: { 'content-type': 'application/json' },
    });
    const res = await POST(req as never);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.challenge).toBe('XYZ-CHAL');
  });

  it('event_callback rejects 401 on tampered signature', async () => {
    const { POST } = await import('@/app/api/slack/events/route');
    const body = makeEventPayload({});
    const req = buildSignedSlackRequest(
      'http://localhost/api/slack/events',
      body,
      'application/json',
      { tamperSig: true }
    );
    const res = await POST(req as never);
    expect(res.status).toBe(401);
  });

  it('app_mention status <project> triggers status lookup and threaded reply', async () => {
    projectLookup = [{ key: 'truth-treason', githubRepo: 'MyAlterLego/truth-treason' }];
    devLookup = [{ version: 'v1.0.0', deployedAt: new Date(), branch: 'main' }];

    const { POST } = await import('@/app/api/slack/events/route');
    const body = makeEventPayload({
      eventId: 'Ev_001',
      text: '<@UBOT> status truth-treason',
      ts: '1715000000.000100',
      channel: 'C_GENERAL',
    });
    const req = buildSignedSlackRequest(
      'http://localhost/api/slack/events',
      body,
      'application/json'
    );
    const res = await POST(req as never);
    expect(res.status).toBe(200);
    expect(postSlackThreadedReplyMock).toHaveBeenCalledTimes(1);
    const callArg = postSlackThreadedReplyMock.mock.calls[0][0];
    expect(callArg.thread_ts ?? callArg.threadTs).toBe('1715000000.000100');
  });

  it('duplicate event_id returns 200 no-op without invoking handler twice', async () => {
    projectLookup = [{ key: 'admin' }];
    devLookup = [];
    const { POST, resetDedupForTests } = await import('@/app/api/slack/events/route');
    if (typeof resetDedupForTests === 'function') resetDedupForTests();

    const body = makeEventPayload({ eventId: 'Ev_DUP', text: '<@UBOT> status admin' });
    const req1 = buildSignedSlackRequest('http://localhost/api/slack/events', body, 'application/json');
    await POST(req1 as never);
    const callsAfterFirst = postSlackThreadedReplyMock.mock.calls.length;

    const req2 = buildSignedSlackRequest('http://localhost/api/slack/events', body, 'application/json');
    const res2 = await POST(req2 as never);
    expect(res2.status).toBe(200);
    expect(postSlackThreadedReplyMock.mock.calls.length).toBe(callsAfterFirst);
  });

  it('strips <@UBOT> prefix and parses status subcommand correctly', async () => {
    projectLookup = [{ key: 'admin' }];
    devLookup = [];
    const { POST } = await import('@/app/api/slack/events/route');
    const body = makeEventPayload({
      eventId: 'Ev_STRIP',
      text: '<@UBOT123ABC>   status   admin',
    });
    const req = buildSignedSlackRequest('http://localhost/api/slack/events', body, 'application/json');
    const res = await POST(req as never);
    expect(res.status).toBe(200);
    // The status handler must have been invoked — projectLookup was queried
    expect(dbCallSequence[0]).toBe('proj');
  });
});
