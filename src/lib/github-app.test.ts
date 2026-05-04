import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'node:crypto';

vi.mock('@myalterlego/secrets', () => ({
  getSecret: vi.fn(),
}));

import {
  signAppJwt,
  getInstallationToken,
  dispatchWorkflow,
  resetTokenCacheForTests,
} from '@/lib/github-app';
import { getSecret } from '@myalterlego/secrets';

const mockedGetSecret = vi.mocked(getSecret);

let testPrivateKey: string;
let testPublicKey: string;

beforeAll(() => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  testPrivateKey = privateKey;
  testPublicKey = publicKey;
});

beforeEach(() => {
  mockedGetSecret.mockReset();
  mockedGetSecret.mockImplementation(async (key) => {
    if (key === 'GITHUB_APP_ID') return '123456';
    if (key === 'GITHUB_APP_PRIVATE_KEY') return testPrivateKey;
    if (key === 'GITHUB_APP_INSTALLATION_ID') return '78910';
    throw new Error(`unexpected key ${key}`);
  });
  resetTokenCacheForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('signAppJwt', () => {
  it('produces a 3-part RS256 JWT with iss=app_id and exp - iat <= 600', async () => {
    const jwt = await signAppJwt(1_700_000_000);
    const parts = jwt.split('.');
    expect(parts.length).toBe(3);
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    expect(header).toEqual({ alg: 'RS256', typ: 'JWT' });
    expect(payload.iss).toBe('123456');
    expect(payload.iat).toBeLessThanOrEqual(1_700_000_000);
    expect(payload.exp - payload.iat).toBeLessThanOrEqual(600);
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(`${parts[0]}.${parts[1]}`);
    verifier.end();
    const sigBuf = Buffer.from(parts[2], 'base64url');
    expect(verifier.verify(testPublicKey, sigBuf)).toBe(true);
  });

  it('PEM with literal \\n is normalized to real newlines', async () => {
    mockedGetSecret.mockImplementation(async (key) => {
      if (key === 'GITHUB_APP_ID') return '123456';
      if (key === 'GITHUB_APP_PRIVATE_KEY') return testPrivateKey.replace(/\n/g, '\\n');
      if (key === 'GITHUB_APP_INSTALLATION_ID') return '78910';
      throw new Error(`unexpected key ${key}`);
    });
    const jwt = await signAppJwt(1_700_000_000);
    expect(jwt.split('.').length).toBe(3);
    const verifier = crypto.createVerify('RSA-SHA256');
    const parts = jwt.split('.');
    verifier.update(`${parts[0]}.${parts[1]}`);
    verifier.end();
    expect(verifier.verify(testPublicKey, Buffer.from(parts[2], 'base64url'))).toBe(true);
  });

  it('vault read failure bubbles up as missing-env error', async () => {
    mockedGetSecret.mockRejectedValue(new Error('PERMISSION_DENIED'));
    await expect(signAppJwt(1_700_000_000)).rejects.toThrow(/missing required env vars/);
  });
});

describe('getInstallationToken', () => {
  it('cold cache: signs JWT and POSTs to /app/installations/{id}/access_tokens', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ token: 'ghs_test_aaa', expires_at: '2099-01-01T00:00:00Z' }), { status: 201 })
    );
    vi.stubGlobal('fetch', mockFetch);
    const token = await getInstallationToken();
    expect(token).toBe('ghs_test_aaa');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.github.com/app/installations/78910/access_tokens');
    expect(opts.method).toBe('POST');
    expect((opts.headers as Record<string, string>).Authorization).toMatch(/^Bearer eyJ/);
    expect((opts.headers as Record<string, string>).Accept).toBe('application/vnd.github+json');
  });

  it('warm cache: returns cached token, no fetch', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ token: 'ghs_warm', expires_at: '2099-01-01T00:00:00Z' }), { status: 201 })
    );
    vi.stubGlobal('fetch', mockFetch);
    await getInstallationToken();
    await getInstallationToken();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('expired cache: regenerates after 51 minutes', async () => {
    vi.useFakeTimers();
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: 'ghs_first', expires_at: 'x' }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: 'ghs_second', expires_at: 'x' }), { status: 201 }));
    vi.stubGlobal('fetch', mockFetch);
    const t1 = await getInstallationToken();
    expect(t1).toBe('ghs_first');
    vi.advanceTimersByTime(51 * 60 * 1000);
    const t2 = await getInstallationToken();
    expect(t2).toBe('ghs_second');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('single-flight: two concurrent calls share one fetch', async () => {
    let resolveFetch!: (r: Response) => void;
    const fetchPromise = new Promise<Response>((r) => { resolveFetch = r; });
    const mockFetch = vi.fn().mockReturnValue(fetchPromise);
    vi.stubGlobal('fetch', mockFetch);
    const p1 = getInstallationToken();
    const p2 = getInstallationToken();
    resolveFetch(new Response(JSON.stringify({ token: 'ghs_only', expires_at: 'x' }), { status: 201 }));
    const [t1, t2] = await Promise.all([p1, p2]);
    expect(t1).toBe('ghs_only');
    expect(t2).toBe('ghs_only');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('non-2xx response: throws without leaking JWT', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(new Response('{"message":"Bad credentials"}', { status: 401 }))
      .mockResolvedValueOnce(new Response('{"message":"Bad credentials"}', { status: 401 }));
    vi.stubGlobal('fetch', mockFetch);
    await expect(getInstallationToken()).rejects.toThrow(/401/);
    try {
      await getInstallationToken();
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain('Bad credentials');
      expect(msg).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}/);
      expect(msg).not.toContain('-----BEGIN');
    }
  });

  it('error leaves cache empty: subsequent success populates cache', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(new Response('{"message":"server"}', { status: 500 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: 'ghs_recovery', expires_at: 'x' }), { status: 201 }));
    vi.stubGlobal('fetch', mockFetch);
    await expect(getInstallationToken()).rejects.toThrow();
    const t = await getInstallationToken();
    expect(t).toBe('ghs_recovery');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('missing vault keys: throws listing all missing names', async () => {
    mockedGetSecret.mockImplementation(async (key) => {
      if (key === 'GITHUB_APP_ID') return '123456';
      throw new Error('PERMISSION_DENIED');
    });
    await expect(getInstallationToken()).rejects.toThrow(/GITHUB_APP_PRIVATE_KEY/);
    try {
      await getInstallationToken();
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain('GITHUB_APP_PRIVATE_KEY');
      expect(msg).toContain('GITHUB_APP_INSTALLATION_ID');
    }
  });

  it('PEM newline normalization: literal \\n strings are converted to real newlines', async () => {
    mockedGetSecret.mockImplementation(async (key) => {
      if (key === 'GITHUB_APP_ID') return '123456';
      if (key === 'GITHUB_APP_PRIVATE_KEY') return testPrivateKey.replace(/\n/g, '\\n');
      if (key === 'GITHUB_APP_INSTALLATION_ID') return '78910';
      throw new Error(`unexpected key ${key}`);
    });
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ token: 'ghs_pem_ok', expires_at: 'x' }), { status: 201 })
    );
    vi.stubGlobal('fetch', mockFetch);
    const t = await getInstallationToken();
    expect(t).toBe('ghs_pem_ok');
  });
});

describe('dispatchWorkflow', () => {
  it('204 success: returns ok and logs without leaking token', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: 'ghs_dispatch', expires_at: 'x' }), { status: 201 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', mockFetch);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const result = await dispatchWorkflow({ owner: 'MyAlterLego', repo: 'darksouls-rpg', workflowFile: 'deploy-prod.yml', ref: 'main', inputs: { tag: 'v0.4.2' } });
    expect(result).toEqual({ ok: true, status: 204 });
    const dispatchCall = mockFetch.mock.calls[1];
    expect(dispatchCall[0]).toBe('https://api.github.com/repos/MyAlterLego/darksouls-rpg/actions/workflows/deploy-prod.yml/dispatches');
    expect(dispatchCall[1].method).toBe('POST');
    expect(JSON.parse(dispatchCall[1].body as string)).toEqual({ ref: 'main', inputs: { tag: 'v0.4.2' } });
    const allLogs = logSpy.mock.calls.flat().join(' ');
    expect(allLogs).toContain('dispatched deploy-prod.yml');
    expect(allLogs).not.toContain('ghs_dispatch');
    logSpy.mockRestore();
  });

  it('non-204 status: throws with body but without token', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: 'ghs_dispatch_fail', expires_at: 'x' }), { status: 201 }))
      .mockResolvedValueOnce(new Response('{"message":"Workflow not found"}', { status: 404 }))
      .mockResolvedValueOnce(new Response('{"message":"Workflow not found"}', { status: 404 }));
    vi.stubGlobal('fetch', mockFetch);
    await expect(dispatchWorkflow({ owner: 'a', repo: 'b', workflowFile: 'deploy-prod.yml', ref: 'main' }))
      .rejects.toThrow(/404/);
    try {
      await dispatchWorkflow({ owner: 'a', repo: 'b', workflowFile: 'deploy-prod.yml', ref: 'main' });
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain('Workflow not found');
      expect(msg).not.toContain('ghs_dispatch_fail');
    }
  });
});
