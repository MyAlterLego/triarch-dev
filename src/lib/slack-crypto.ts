import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { getSecret } from '@myalterlego/secrets';

/**
 * Converts a Buffer to base64url encoding (RFC 4648 §5, no padding).
 */
function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Constant-time comparison of two hex-encoded strings.
 * Returns false (not throws) on any length mismatch or encoding error.
 */
function safeEqHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}

/**
 * Constant-time comparison of two base64url-encoded strings (compared as UTF-8 bytes).
 * Returns false on any length mismatch or encoding error.
 */
function safeEqB64url(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

/**
 * Signs a release action payload for embedding in a Slack button value.
 *
 * Packed format: `${releaseId}.${nonce}.${sig}`
 * where sig = base64url(HMAC-SHA256(SLACK_PAYLOAD_SECRET, `${releaseId}:${action}:${nonce}`))
 *
 * Reads SLACK_PAYLOAD_SECRET from the central vault (@myalterlego/secrets) on each
 * call. The vault client caches for 300s; falls back to process.env on vault failure.
 */
export async function signPayload(releaseId: string, action: string, nonce?: string): Promise<string> {
  let secret: string;
  try {
    secret = await getSecret('SLACK_PAYLOAD_SECRET');
  } catch {
    throw new Error('SLACK_PAYLOAD_SECRET not set');
  }
  const n = nonce ?? randomBytes(8).toString('hex');
  const sig = b64url(
    createHmac('sha256', secret).update(`${releaseId}:${action}:${n}`).digest()
  );
  return `${releaseId}.${n}.${sig}`;
}

export type VerifyPayloadResult =
  | { ok: true; releaseId: string; nonce: string }
  | { ok: false; reason: 'malformed' | 'bad_signature' | 'no_secret' };

/**
 * Verifies a packed button value produced by `signPayload`.
 *
 * Splits on '.', recomputes the HMAC for the given expectedAction, and
 * compares using timingSafeEqual to prevent timing-based forgeries.
 */
export async function verifyPayload(packed: string, expectedAction: string): Promise<VerifyPayloadResult> {
  let secret: string;
  try {
    secret = await getSecret('SLACK_PAYLOAD_SECRET');
  } catch {
    return { ok: false, reason: 'no_secret' };
  }
  const parts = packed.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'malformed' };
  const [releaseId, nonce, sig] = parts;
  if (!releaseId || !nonce || !sig) return { ok: false, reason: 'malformed' };
  const expected = b64url(
    createHmac('sha256', secret).update(`${releaseId}:${expectedAction}:${nonce}`).digest()
  );
  if (!safeEqB64url(expected, sig)) return { ok: false, reason: 'bad_signature' };
  return { ok: true, releaseId, nonce };
}

export type VerifySignatureResult =
  | { ok: true }
  | { ok: false; reason: 'no_secret' | 'stale' | 'bad_signature' | 'malformed' };

/**
 * Verifies a Slack request signature per https://api.slack.com/authentication/verifying-requests-from-slack
 *
 * basestring = `v0:${timestamp}:${rawBody}`
 * expected   = `v0=` + hex(HMAC-SHA256(SLACK_SIGNING_SECRET, basestring))
 *
 * Enforces a 5-minute (300-second) replay window.
 * Reads SLACK_SIGNING_SECRET at call time — never at module load.
 *
 * `opts.now` is injectable for deterministic tests (defaults to Date.now()).
 */
export async function verifySlackSignature(opts: {
  rawBody: string;
  timestamp: string | null;
  signature: string | null;
  now?: number;
}): Promise<VerifySignatureResult> {
  let secret: string;
  try {
    secret = await getSecret('SLACK_SIGNING_SECRET');
  } catch {
    return { ok: false, reason: 'no_secret' };
  }
  if (!opts.timestamp || !opts.signature) return { ok: false, reason: 'malformed' };
  const tsNum = Number(opts.timestamp);
  if (!Number.isFinite(tsNum)) return { ok: false, reason: 'malformed' };
  const nowSec = Math.floor((opts.now ?? Date.now()) / 1000);
  if (Math.abs(nowSec - tsNum) > 300) return { ok: false, reason: 'stale' };
  if (!opts.signature.startsWith('v0=')) return { ok: false, reason: 'malformed' };
  const supplied = opts.signature.slice(3);
  const computed = createHmac('sha256', secret)
    .update(`v0:${opts.timestamp}:${opts.rawBody}`)
    .digest('hex');
  if (!safeEqHex(computed, supplied)) return { ok: false, reason: 'bad_signature' };
  return { ok: true };
}
