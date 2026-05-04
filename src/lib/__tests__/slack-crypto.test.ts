import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@myalterlego/secrets', () => ({
  getSecret: vi.fn(),
}));

import { signPayload, verifyPayload, verifySlackSignature } from '../slack-crypto';
import { getSecret } from '@myalterlego/secrets';
import { createHmac } from 'node:crypto';

const mockedGetSecret = vi.mocked(getSecret);

// Helper to build a valid Slack signature fixture
function makeSlackSig(secret: string, timestamp: string, body: string): string {
  const basestring = `v0:${timestamp}:${body}`;
  const hex = createHmac('sha256', secret).update(basestring).digest('hex');
  return `v0=${hex}`;
}

describe('signPayload / verifyPayload', () => {
  const TEST_PAYLOAD_SECRET = 'test_payload_secret_32byteslong!!';

  beforeEach(() => {
    mockedGetSecret.mockReset();
    mockedGetSecret.mockImplementation(async (key) => {
      if (key === 'SLACK_PAYLOAD_SECRET') return TEST_PAYLOAD_SECRET;
      throw new Error(`unexpected key ${key}`);
    });
  });

  it('round-trip: signPayload produces packed value that verifyPayload accepts', async () => {
    const packed = await signPayload('rel-123', 'approve', 'abc123nonce');
    const result = await verifyPayload(packed, 'approve');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.releaseId).toBe('rel-123');
      expect(result.nonce).toBe('abc123nonce');
    }
  });

  it('auto-generates nonce when omitted', async () => {
    const packed = await signPayload('rel-456', 'reject');
    expect(packed.split('.')).toHaveLength(3);
    const result = await verifyPayload(packed, 'reject');
    expect(result.ok).toBe(true);
  });

  it('wrong expectedAction returns bad_signature', async () => {
    const packed = await signPayload('rel-123', 'approve', 'mynonce');
    const result = await verifyPayload(packed, 'reject');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('bad_signature');
    }
  });

  it('tampered signature byte returns bad_signature', async () => {
    const packed = await signPayload('rel-123', 'approve', 'mynonce');
    const parts = packed.split('.');
    parts[2] = parts[2].slice(0, -1) + (parts[2].endsWith('A') ? 'B' : 'A');
    const tampered = parts.join('.');
    const result = await verifyPayload(tampered, 'approve');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('bad_signature');
    }
  });

  it('tampered releaseId returns bad_signature', async () => {
    const packed = await signPayload('rel-123', 'approve', 'mynonce');
    const parts = packed.split('.');
    parts[0] = 'rel-999';
    const tampered = parts.join('.');
    const result = await verifyPayload(tampered, 'approve');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('bad_signature');
    }
  });

  it('malformed packed payload (too few segments) returns malformed', async () => {
    const result = await verifyPayload('rel-123.nonce', 'approve');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('malformed');
    }
  });

  it('malformed packed payload (empty segment) returns malformed', async () => {
    const result = await verifyPayload('rel-123..somesig', 'approve');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('malformed');
    }
  });

  it('vault failure in verifyPayload returns no_secret', async () => {
    mockedGetSecret.mockRejectedValue(new Error('PERMISSION_DENIED'));
    const result = await verifyPayload('rel-123.nonce.sig', 'approve');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('no_secret');
    }
  });

  it('vault failure in signPayload throws', async () => {
    mockedGetSecret.mockRejectedValue(new Error('PERMISSION_DENIED'));
    await expect(signPayload('rel-123', 'approve')).rejects.toThrow('SLACK_PAYLOAD_SECRET not set');
  });
});

describe('verifySlackSignature', () => {
  const TEST_SECRET = 'test_signing_secret_32bytes!!!';
  const NOW_S = 1700000000;
  const NOW_MS = NOW_S * 1000;
  const FRESH_TS = String(NOW_S - 30);
  const BODY = 'token=test&payload={}';

  beforeEach(() => {
    mockedGetSecret.mockReset();
    mockedGetSecret.mockImplementation(async (key) => {
      if (key === 'SLACK_SIGNING_SECRET') return TEST_SECRET;
      throw new Error(`unexpected key ${key}`);
    });
  });

  it('round-trip: computes correct v0 signature and accepts it', async () => {
    const sig = makeSlackSig(TEST_SECRET, FRESH_TS, BODY);
    const result = await verifySlackSignature({
      rawBody: BODY,
      timestamp: FRESH_TS,
      signature: sig,
      now: NOW_MS,
    });
    expect(result.ok).toBe(true);
  });

  it('stale timestamp (>300s) returns stale', async () => {
    const STALE_TS = String(NOW_S - 301);
    const sig = makeSlackSig(TEST_SECRET, STALE_TS, BODY);
    const result = await verifySlackSignature({
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

  it('exactly 300s drift is accepted (boundary — inclusive at 300)', async () => {
    const BOUNDARY_TS = String(NOW_S - 300);
    const sig = makeSlackSig(TEST_SECRET, BOUNDARY_TS, BODY);
    const result = await verifySlackSignature({
      rawBody: BODY,
      timestamp: BOUNDARY_TS,
      signature: sig,
      now: NOW_MS,
    });
    expect(result.ok).toBe(true);
  });

  it('tampered signature byte returns bad_signature', async () => {
    const sig = makeSlackSig(TEST_SECRET, FRESH_TS, BODY);
    const tampered = sig.slice(0, -1) + (sig.endsWith('a') ? 'b' : 'a');
    const result = await verifySlackSignature({
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

  it('tampered body returns bad_signature', async () => {
    const sig = makeSlackSig(TEST_SECRET, FRESH_TS, BODY);
    const result = await verifySlackSignature({
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

  it('wrong secret returns bad_signature', async () => {
    const sig = makeSlackSig('different_secret_32bytes_long!!', FRESH_TS, BODY);
    const result = await verifySlackSignature({
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

  it('vault failure returns no_secret', async () => {
    mockedGetSecret.mockRejectedValue(new Error('PERMISSION_DENIED'));
    const sig = makeSlackSig(TEST_SECRET, FRESH_TS, BODY);
    const result = await verifySlackSignature({
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

  it('null timestamp returns malformed', async () => {
    const result = await verifySlackSignature({
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

  it('null signature returns malformed', async () => {
    const result = await verifySlackSignature({
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

  it('signature without v0= prefix returns malformed', async () => {
    const result = await verifySlackSignature({
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

  it('non-numeric timestamp returns malformed', async () => {
    const result = await verifySlackSignature({
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
