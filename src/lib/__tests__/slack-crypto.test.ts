import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { signPayload, verifyPayload, verifySlackSignature } from '../slack-crypto';
import { createHmac } from 'node:crypto';

// Helper to build a valid Slack signature fixture
function makeSlackSig(secret: string, timestamp: string, body: string): string {
  const basestring = `v0:${timestamp}:${body}`;
  const hex = createHmac('sha256', secret).update(basestring).digest('hex');
  return `v0=${hex}`;
}

describe('signPayload / verifyPayload', () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    process.env.SLACK_PAYLOAD_SECRET = 'test_payload_secret_32byteslong!!';
  });

  afterEach(() => {
    process.env.SLACK_PAYLOAD_SECRET = ORIGINAL_ENV.SLACK_PAYLOAD_SECRET;
  });

  it('round-trip: signPayload produces packed value that verifyPayload accepts', () => {
    const packed = signPayload('rel-123', 'approve', 'abc123nonce');
    const result = verifyPayload(packed, 'approve');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.releaseId).toBe('rel-123');
      expect(result.nonce).toBe('abc123nonce');
    }
  });

  it('auto-generates nonce when omitted', () => {
    const packed = signPayload('rel-456', 'reject');
    expect(packed.split('.')).toHaveLength(3);
    const result = verifyPayload(packed, 'reject');
    expect(result.ok).toBe(true);
  });

  it('wrong expectedAction returns bad_signature', () => {
    const packed = signPayload('rel-123', 'approve', 'mynonce');
    const result = verifyPayload(packed, 'reject');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('bad_signature');
    }
  });

  it('tampered signature byte returns bad_signature', () => {
    const packed = signPayload('rel-123', 'approve', 'mynonce');
    // Corrupt the last char of the sig (3rd segment)
    const parts = packed.split('.');
    parts[2] = parts[2].slice(0, -1) + (parts[2].endsWith('A') ? 'B' : 'A');
    const tampered = parts.join('.');
    const result = verifyPayload(tampered, 'approve');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('bad_signature');
    }
  });

  it('tampered releaseId returns bad_signature', () => {
    const packed = signPayload('rel-123', 'approve', 'mynonce');
    const parts = packed.split('.');
    parts[0] = 'rel-999'; // tampered
    const tampered = parts.join('.');
    const result = verifyPayload(tampered, 'approve');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('bad_signature');
    }
  });

  it('malformed packed payload (too few segments) returns malformed', () => {
    const result = verifyPayload('rel-123.nonce', 'approve');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('malformed');
    }
  });

  it('malformed packed payload (empty segment) returns malformed', () => {
    const result = verifyPayload('rel-123..somesig', 'approve');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('malformed');
    }
  });

  it('missing SLACK_PAYLOAD_SECRET in verifyPayload returns no_secret', () => {
    delete process.env.SLACK_PAYLOAD_SECRET;
    const result = verifyPayload('rel-123.nonce.sig', 'approve');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('no_secret');
    }
  });

  it('missing SLACK_PAYLOAD_SECRET in signPayload throws', () => {
    delete process.env.SLACK_PAYLOAD_SECRET;
    expect(() => signPayload('rel-123', 'approve')).toThrow('SLACK_PAYLOAD_SECRET not set');
  });
});

describe('verifySlackSignature', () => {
  const ORIGINAL_ENV = { ...process.env };
  const TEST_SECRET = 'test_signing_secret_32bytes!!!';
  const NOW_S = 1700000000; // fixed "now" in seconds
  const NOW_MS = NOW_S * 1000;
  const FRESH_TS = String(NOW_S - 30); // 30s old — well within 300s window
  const BODY = 'token=test&payload={}';

  beforeEach(() => {
    process.env.SLACK_SIGNING_SECRET = TEST_SECRET;
  });

  afterEach(() => {
    process.env.SLACK_SIGNING_SECRET = ORIGINAL_ENV.SLACK_SIGNING_SECRET;
  });

  it('round-trip: computes correct v0 signature and accepts it', () => {
    const sig = makeSlackSig(TEST_SECRET, FRESH_TS, BODY);
    const result = verifySlackSignature({
      rawBody: BODY,
      timestamp: FRESH_TS,
      signature: sig,
      now: NOW_MS,
    });
    expect(result.ok).toBe(true);
  });

  it('stale timestamp (>300s) returns stale', () => {
    const STALE_TS = String(NOW_S - 301);
    const sig = makeSlackSig(TEST_SECRET, STALE_TS, BODY);
    const result = verifySlackSignature({
      rawBody: BODY,
      timestamp: STALE_TS,
      signature: sig,
      now: NOW_MS,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('stale');
    }
  });

  it('exactly 300s drift is accepted (boundary — inclusive at 300)', () => {
    const BOUNDARY_TS = String(NOW_S - 300);
    const sig = makeSlackSig(TEST_SECRET, BOUNDARY_TS, BODY);
    const result = verifySlackSignature({
      rawBody: BODY,
      timestamp: BOUNDARY_TS,
      signature: sig,
      now: NOW_MS,
    });
    expect(result.ok).toBe(true);
  });

  it('tampered signature byte returns bad_signature', () => {
    const sig = makeSlackSig(TEST_SECRET, FRESH_TS, BODY);
    // Flip last hex char
    const tampered = sig.slice(0, -1) + (sig.endsWith('a') ? 'b' : 'a');
    const result = verifySlackSignature({
      rawBody: BODY,
      timestamp: FRESH_TS,
      signature: tampered,
      now: NOW_MS,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('bad_signature');
    }
  });

  it('tampered body returns bad_signature', () => {
    const sig = makeSlackSig(TEST_SECRET, FRESH_TS, BODY);
    const result = verifySlackSignature({
      rawBody: BODY + '&extra=tampered',
      timestamp: FRESH_TS,
      signature: sig,
      now: NOW_MS,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('bad_signature');
    }
  });

  it('wrong secret returns bad_signature', () => {
    const sig = makeSlackSig('different_secret_32bytes_long!!', FRESH_TS, BODY);
    const result = verifySlackSignature({
      rawBody: BODY,
      timestamp: FRESH_TS,
      signature: sig,
      now: NOW_MS,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('bad_signature');
    }
  });

  it('missing SLACK_SIGNING_SECRET returns no_secret', () => {
    delete process.env.SLACK_SIGNING_SECRET;
    const sig = makeSlackSig(TEST_SECRET, FRESH_TS, BODY);
    const result = verifySlackSignature({
      rawBody: BODY,
      timestamp: FRESH_TS,
      signature: sig,
      now: NOW_MS,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('no_secret');
    }
  });

  it('null timestamp returns malformed', () => {
    const result = verifySlackSignature({
      rawBody: BODY,
      timestamp: null,
      signature: 'v0=abc',
      now: NOW_MS,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('malformed');
    }
  });

  it('null signature returns malformed', () => {
    const result = verifySlackSignature({
      rawBody: BODY,
      timestamp: FRESH_TS,
      signature: null,
      now: NOW_MS,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('malformed');
    }
  });

  it('signature without v0= prefix returns malformed', () => {
    const result = verifySlackSignature({
      rawBody: BODY,
      timestamp: FRESH_TS,
      signature: 'abc123',
      now: NOW_MS,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('malformed');
    }
  });

  it('non-numeric timestamp returns malformed', () => {
    const result = verifySlackSignature({
      rawBody: BODY,
      timestamp: 'not-a-number',
      signature: 'v0=abc',
      now: NOW_MS,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('malformed');
    }
  });
});
