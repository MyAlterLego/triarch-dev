import { describe, it, expect, beforeEach } from 'vitest';
import {
  signRequest,
  verifyRequest,
  createMemoryNonceStore,
  type DispatchPromotionBody,
} from './internal-hmac';

const TEST_SECRET = 'test-secret-for-unit-tests';
const FIXED_NOW = 1_700_000_000_000; // deterministic timestamp
const FIXED_NONCE = 'a'.repeat(32);   // 32-char hex nonce

const BASE_INPUT: Omit<DispatchPromotionBody, 'timestamp' | 'nonce'> = {
  intent: 'dispatch_promotion',
  branch: 'main',
  version: '1.2.3',
  projectKey: 'test-project',
  releaseId: 'rel-abc123',
  actorEmail: 'admin@example.com',
  slackChannelId: null,
  slackMessageTs: null,
};

describe('signRequest', () => {
  it('produces a body with all required fields and a hex signature', () => {
    const result = signRequest(BASE_INPUT, TEST_SECRET, { now: FIXED_NOW, nonce: FIXED_NONCE });
    expect(result.body.branch).toBe('main');
    expect(result.body.version).toBe('1.2.3');
    expect(result.body.projectKey).toBe('test-project');
    expect(result.body.releaseId).toBe('rel-abc123');
    expect(result.body.actorEmail).toBe('admin@example.com');
    expect(result.body.slackChannelId).toBeNull();
    expect(result.body.slackMessageTs).toBeNull();
    expect(result.body.timestamp).toBe(FIXED_NOW);
    expect(result.body.nonce).toBe(FIXED_NONCE);
    expect(typeof result.signature).toBe('string');
    expect(result.signature).toHaveLength(64); // hex sha256 = 32 bytes = 64 hex chars
  });
});

describe('verifyRequest', () => {
  it('Test 1 (valid): returns ok=true and body on valid signature', () => {
    const { body, signature } = signRequest(BASE_INPUT, TEST_SECRET, { now: FIXED_NOW, nonce: FIXED_NONCE });
    const rawBody = JSON.stringify(body, Object.keys(body).sort());
    const result = verifyRequest({ rawBody, signature, secret: TEST_SECRET, now: FIXED_NOW });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.body.branch).toBe('main');
      expect(result.body.actorEmail).toBe('admin@example.com');
    }
  });

  it('Test 2 (tampered): returns bad_signature when rawBody is mutated', () => {
    const { body, signature } = signRequest(BASE_INPUT, TEST_SECRET, { now: FIXED_NOW, nonce: FIXED_NONCE });
    const rawBody = JSON.stringify(body, Object.keys(body).sort());
    // Flip one char to simulate tampering
    const tampered = rawBody.replace('"main"', '"tampered"');
    const result = verifyRequest({ rawBody: tampered, signature, secret: TEST_SECRET, now: FIXED_NOW });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('bad_signature');
    }
  });

  it('Test 3 (expired): returns expired when timestamp is older than 5 minutes', () => {
    const oldNow = FIXED_NOW - 6 * 60 * 1000;
    const { body, signature } = signRequest(BASE_INPUT, TEST_SECRET, { now: oldNow, nonce: FIXED_NONCE });
    const rawBody = JSON.stringify(body, Object.keys(body).sort());
    // Verify with current now (FIXED_NOW) — 6 min gap exceeds 5 min window
    const result = verifyRequest({ rawBody, signature, secret: TEST_SECRET, now: FIXED_NOW });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('expired');
    }
  });

  it('Test 4 (replay): second call with same nonce returns replay', () => {
    const store = createMemoryNonceStore();
    const { body, signature } = signRequest(BASE_INPUT, TEST_SECRET, { now: FIXED_NOW, nonce: FIXED_NONCE });
    const rawBody = JSON.stringify(body, Object.keys(body).sort());

    const first = verifyRequest({ rawBody, signature, secret: TEST_SECRET, now: FIXED_NOW, nonceStore: store });
    expect(first.ok).toBe(true);

    const second = verifyRequest({ rawBody, signature, secret: TEST_SECRET, now: FIXED_NOW, nonceStore: store });
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.reason).toBe('replay');
    }
  });

  it('Test 5 (malformed): rawBody is not JSON', () => {
    const result = verifyRequest({ rawBody: 'not json', signature: 'abc', secret: TEST_SECRET, now: FIXED_NOW });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('malformed');
    }
  });

  it('Test 6 (missing fields): rawBody missing nonce field', () => {
    const { body } = signRequest(BASE_INPUT, TEST_SECRET, { now: FIXED_NOW, nonce: FIXED_NONCE });
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { nonce: _, ...bodyWithoutNonce } = body;
    const rawBody = JSON.stringify(bodyWithoutNonce, Object.keys(bodyWithoutNonce).sort());
    const result = verifyRequest({ rawBody, signature: 'doesnotmatter', secret: TEST_SECRET, now: FIXED_NOW });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('malformed');
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────
// v2.4 Phase 36 INCL-08: discriminated union — read_upcoming intent
// (Plan 36-06 Task 1 — Pitfall 6 fix)
// ──────────────────────────────────────────────────────────────────────────

describe('discriminated union: read_upcoming intent', () => {
  it('signs and verifies a read_upcoming body (no branch/version/releaseId required)', () => {
    const { body, signature } = signRequest(
      { intent: 'read_upcoming', actorEmail: 'mike@triarch.dev', projectKey: 'tmi' },
      TEST_SECRET,
      { now: FIXED_NOW, nonce: FIXED_NONCE },
    );
    expect(body.intent).toBe('read_upcoming');
    expect(body.projectKey).toBe('tmi');
    expect(body.actorEmail).toBe('mike@triarch.dev');
    // No branch/version/releaseId fields should exist on a read_upcoming body
    expect((body as Record<string, unknown>)['branch']).toBeUndefined();
    expect((body as Record<string, unknown>)['version']).toBeUndefined();
    expect((body as Record<string, unknown>)['releaseId']).toBeUndefined();

    const rawBody = JSON.stringify(body, Object.keys(body).sort());
    const result = verifyRequest({
      rawBody,
      signature,
      secret: TEST_SECRET,
      now: FIXED_NOW,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.body.intent).toBe('read_upcoming');
      if (result.body.intent === 'read_upcoming') {
        expect(result.body.projectKey).toBe('tmi');
      }
    }
  });

  it('signs and verifies a dispatch_promotion body (existing Phase 22 shape still works)', () => {
    const { body, signature } = signRequest(BASE_INPUT, TEST_SECRET, { now: FIXED_NOW, nonce: FIXED_NONCE });
    expect(body.intent).toBe('dispatch_promotion');
    const rawBody = JSON.stringify(body, Object.keys(body).sort());
    const result = verifyRequest({ rawBody, signature, secret: TEST_SECRET, now: FIXED_NOW });
    expect(result.ok).toBe(true);
    if (result.ok && result.body.intent === 'dispatch_promotion') {
      expect(result.body.branch).toBe('main');
      expect(result.body.version).toBe('1.2.3');
      expect(result.body.releaseId).toBe('rel-abc123');
    }
  });

  it('rejects body with unknown intent value', () => {
    const tampered = {
      intent: 'unknown_intent',
      actorEmail: 'mike@triarch.dev',
      projectKey: 'tmi',
      nonce: 'c'.repeat(32),
      timestamp: FIXED_NOW,
    };
    const rawBody = JSON.stringify(tampered, Object.keys(tampered).sort());
    const result = verifyRequest({
      rawBody,
      signature: 'whatever-this-will-never-validate',
      secret: TEST_SECRET,
      now: FIXED_NOW,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('malformed');
  });

  it('rejects body without intent field (legacy Phase 22 shape, no discriminator)', () => {
    // Construct a body matching the OLD pre-union shape (no intent field).
    const legacyShape = {
      actorEmail: 'admin@example.com',
      branch: 'main',
      nonce: 'e'.repeat(32),
      projectKey: 'test-project',
      releaseId: 'rel-abc123',
      slackChannelId: null,
      slackMessageTs: null,
      timestamp: FIXED_NOW,
      version: '1.2.3',
    };
    const rawBody = JSON.stringify(legacyShape, Object.keys(legacyShape).sort());
    const result = verifyRequest({
      rawBody,
      signature: 'doesnotmatter',
      secret: TEST_SECRET,
      now: FIXED_NOW,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('malformed');
  });

  it('read_upcoming missing actorEmail returns malformed', () => {
    const incomplete = {
      intent: 'read_upcoming',
      projectKey: 'tmi',
      nonce: 'f'.repeat(32),
      timestamp: FIXED_NOW,
      // actorEmail missing
    };
    const rawBody = JSON.stringify(incomplete, Object.keys(incomplete).sort());
    const result = verifyRequest({
      rawBody,
      signature: 'whatever',
      secret: TEST_SECRET,
      now: FIXED_NOW,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('malformed');
  });

  it('dispatch_promotion missing branch returns malformed', () => {
    const incomplete = {
      intent: 'dispatch_promotion',
      actorEmail: 'admin@example.com',
      projectKey: 'test-project',
      releaseId: 'rel-abc123',
      slackChannelId: null,
      slackMessageTs: null,
      version: '1.2.3',
      nonce: '9'.repeat(32),
      timestamp: FIXED_NOW,
      // branch missing
    };
    const rawBody = JSON.stringify(incomplete, Object.keys(incomplete).sort());
    const result = verifyRequest({
      rawBody,
      signature: 'whatever',
      secret: TEST_SECRET,
      now: FIXED_NOW,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('malformed');
  });
});
