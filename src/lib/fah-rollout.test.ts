import { describe, it, expect, beforeEach, vi } from 'vitest';
import crypto from 'node:crypto';

vi.mock('@myalterlego/secrets', () => ({
  getSecret: vi.fn(),
}));

import {
  mintFahAccessToken,
  createFahRollout,
  getFahRolloutState,
  resetTokenCacheForTests,
} from '@/lib/fah-rollout';
import { getSecret } from '@myalterlego/secrets';

const mockedGetSecret = vi.mocked(getSecret);

// Generate a real RSA key pair for JWT signing tests
let testPrivateKeyPem: string;

beforeEach(async () => {
  // Generate fresh key for each test so jose importPKCS8 works
  const { privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  testPrivateKeyPem = privateKey;

  // Default mock: SA key JSON with test key pair
  mockedGetSecret.mockReset();
  mockedGetSecret.mockImplementation(async (key) => {
    if (key === 'FAH_PROMOTER_SA_KEY') {
      return JSON.stringify({
        client_email: 'release-promoter@triarch-vault.iam.gserviceaccount.com',
        private_key: testPrivateKeyPem,
      });
    }
    throw new Error(`unexpected secret key: ${key}`);
  });

  resetTokenCacheForTests();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// mintFahAccessToken
// ---------------------------------------------------------------------------

describe('mintFahAccessToken', () => {
  it('happy path: exchanges SA JWT for access_token from oauth2.googleapis.com', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ access_token: 'ya29.fah_access_token', expires_in: 3600, token_type: 'Bearer' }),
        { status: 200 }
      )
    );
    vi.stubGlobal('fetch', mockFetch);

    const token = await mintFahAccessToken();

    expect(token).toBe('ya29.fah_access_token');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('https://oauth2.googleapis.com/token');
    expect((opts as RequestInit).method).toBe('POST');
    const body = (opts as RequestInit).body as string;
    expect(body).toContain('grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer');
    expect(body).toContain('assertion=');
  });

  it('cache hit: second call within 50 min returns same token without re-fetching', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ access_token: 'ya29.cached_token', expires_in: 3600, token_type: 'Bearer' }),
        { status: 200 }
      )
    );
    vi.stubGlobal('fetch', mockFetch);

    const t1 = await mintFahAccessToken();
    const t2 = await mintFahAccessToken();

    expect(t1).toBe('ya29.cached_token');
    expect(t2).toBe('ya29.cached_token');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('cache expiry: call after >50 min re-mints a fresh token', async () => {
    vi.useFakeTimers();
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: 'ya29.first', expires_in: 3600 }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: 'ya29.second', expires_in: 3600 }), { status: 200 })
      );
    vi.stubGlobal('fetch', mockFetch);

    const t1 = await mintFahAccessToken();
    expect(t1).toBe('ya29.first');

    vi.advanceTimersByTime(51 * 60 * 1000); // advance 51 minutes

    const t2 = await mintFahAccessToken();
    expect(t2).toBe('ya29.second');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('single-flight latch: two concurrent calls trigger exactly one fetch', async () => {
    let resolveFetch!: (r: Response) => void;
    const fetchPromise = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    const mockFetch = vi.fn().mockReturnValue(fetchPromise);
    vi.stubGlobal('fetch', mockFetch);

    const p1 = mintFahAccessToken();
    const p2 = mintFahAccessToken();

    resolveFetch(
      new Response(JSON.stringify({ access_token: 'ya29.single', expires_in: 3600 }), { status: 200 })
    );

    const [t1, t2] = await Promise.all([p1, p2]);
    expect(t1).toBe('ya29.single');
    expect(t2).toBe('ya29.single');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('getSecret throws: mintFahAccessToken throws with descriptive message', async () => {
    mockedGetSecret.mockRejectedValue(new Error('PERMISSION_DENIED'));

    await expect(mintFahAccessToken()).rejects.toThrow('[fah-rollout] missing FAH_PROMOTER_SA_KEY');
  });

  it('token endpoint non-2xx: throws with status + body, no JWT in error', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response('{"error":"invalid_grant","error_description":"Invalid JWT"}', { status: 400 })
    );
    vi.stubGlobal('fetch', mockFetch);

    let thrown: Error | null = null;
    try {
      await mintFahAccessToken();
    } catch (e) {
      thrown = e as Error;
    }

    expect(thrown).not.toBeNull();
    expect(thrown!.message).toContain('400');
    expect(thrown!.message).toContain('invalid_grant');
    // Must not echo the JWT (starts with eyJ) in error
    expect(thrown!.message).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}/);
  });

  it('private_key with literal \\n sequences: normalized to real newlines so importPKCS8 succeeds', async () => {
    mockedGetSecret.mockImplementation(async (key) => {
      if (key === 'FAH_PROMOTER_SA_KEY') {
        return JSON.stringify({
          client_email: 'release-promoter@triarch-vault.iam.gserviceaccount.com',
          private_key: testPrivateKeyPem.replace(/\n/g, '\\n'),
        });
      }
      throw new Error(`unexpected key: ${key}`);
    });

    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ access_token: 'ya29.pem_ok', expires_in: 3600 }), { status: 200 })
    );
    vi.stubGlobal('fetch', mockFetch);

    const token = await mintFahAccessToken();
    expect(token).toBe('ya29.pem_ok');
  });
});

// ---------------------------------------------------------------------------
// createFahRollout
// ---------------------------------------------------------------------------

describe('createFahRollout', () => {
  it('happy path: POSTs to FAH endpoint and returns rolloutName + state', async () => {
    const mockFetch = vi.fn()
      // First call: token exchange
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: 'ya29.rollout_token', expires_in: 3600 }), { status: 200 })
      )
      // Second call: create rollout
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            name: 'projects/triarch-dev-tmi/locations/us-central1/backends/tmi-dev/rollouts/r001',
            state: 'PENDING',
          }),
          { status: 200 }
        )
      );
    vi.stubGlobal('fetch', mockFetch);

    const result = await createFahRollout({
      projectId: 'triarch-dev-tmi',
      location: 'us-central1',
      backendId: 'tmi-dev',
      branch: 'feat/audio',
    });

    expect(result).toEqual({
      ok: true,
      rolloutName: 'projects/triarch-dev-tmi/locations/us-central1/backends/tmi-dev/rollouts/r001',
      state: 'PENDING',
    });

    const rolloutCall = mockFetch.mock.calls[1];
    const [url, opts] = rolloutCall;
    expect(url).toBe(
      'https://firebaseapphosting.googleapis.com/v1beta/projects/triarch-dev-tmi/locations/us-central1/backends/tmi-dev/rollouts'
    );
    expect((opts as RequestInit).method).toBe('POST');
    expect((opts as RequestInit & { headers: Record<string, string> }).headers['Authorization']).toBe(
      'Bearer ya29.rollout_token'
    );
    const body = JSON.parse((opts as RequestInit).body as string);
    expect(body).toEqual({ build: { source: { codebase: { branch: 'feat/audio' } } } });
  });

  it('4xx error: returns { ok: false, error, status } and does NOT throw', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: 'ya29.err_token', expires_in: 3600 }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response('{"error":{"code":400,"message":"Backend not found","status":"NOT_FOUND"}}', { status: 400 })
      );
    vi.stubGlobal('fetch', mockFetch);

    const result = await createFahRollout({
      projectId: 'triarch-dev-tmi',
      location: 'us-central1',
      backendId: 'tmi-dev',
      branch: 'main',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.error).toContain('Backend not found');
    }
  });

  it('invalid_branch: shell metachar branch returns { ok: false, error: "invalid_branch" } without fetching', async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    const result = await createFahRollout({
      projectId: 'triarch-dev-tmi',
      location: 'us-central1',
      backendId: 'tmi-dev',
      branch: 'feat;rm -rf /',
    });

    expect(result).toEqual({ ok: false, error: 'invalid_branch' });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('invalid_branch: branch with space returns { ok: false, error: "invalid_branch" }', async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    const result = await createFahRollout({
      projectId: 'triarch-dev-tmi',
      location: 'us-central1',
      backendId: 'tmi-dev',
      branch: 'feat invalid',
    });

    expect(result).toEqual({ ok: false, error: 'invalid_branch' });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('valid branch with slashes and dots: allowed by regex', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: 'ya29.slash_token', expires_in: 3600 }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ name: 'projects/p/locations/l/backends/b/rollouts/r', state: 'PENDING' }),
          { status: 200 }
        )
      );
    vi.stubGlobal('fetch', mockFetch);

    const result = await createFahRollout({
      projectId: 'p',
      location: 'l',
      backendId: 'b',
      branch: 'feat/audio-v2.1_rc-1',
    });

    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getFahRolloutState
// ---------------------------------------------------------------------------

describe('getFahRolloutState', () => {
  it('PENDING state: returns { ok: true, state: "PENDING" }', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: 'ya29.state_token', expires_in: 3600 }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ name: 'projects/p/.../rollouts/r', state: 'PENDING' }), { status: 200 })
      );
    vi.stubGlobal('fetch', mockFetch);

    const result = await getFahRolloutState('projects/triarch-dev-tmi/locations/us-central1/backends/tmi-dev/rollouts/r001');

    expect(result).toEqual({ ok: true, state: 'PENDING', buildState: undefined, errorMessage: undefined });
  });

  it('SUCCEEDED state: returns { ok: true, state: "SUCCEEDED" }', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: 'ya29.succ_token', expires_in: 3600 }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ name: 'projects/p/.../rollouts/r', state: 'SUCCEEDED', build: { state: 'READY' } }),
          { status: 200 }
        )
      );
    vi.stubGlobal('fetch', mockFetch);

    const result = await getFahRolloutState('projects/triarch-dev-tmi/locations/us-central1/backends/tmi-dev/rollouts/r001');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state).toBe('SUCCEEDED');
      expect(result.buildState).toBe('READY');
    }
  });

  it('FAILED state with errorMessage: returns { ok: true, state: "FAILED", buildState, errorMessage }', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: 'ya29.fail_token', expires_in: 3600 }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            name: 'projects/p/.../rollouts/r',
            state: 'FAILED',
            build: {
              state: 'FAILED',
              errorMessage: 'build error: npm install failed',
            },
          }),
          { status: 200 }
        )
      );
    vi.stubGlobal('fetch', mockFetch);

    const result = await getFahRolloutState('projects/triarch-dev-tmi/locations/us-central1/backends/tmi-dev/rollouts/r001');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state).toBe('FAILED');
      expect(result.buildState).toBe('FAILED');
      expect(result.errorMessage).toBe('build error: npm install failed');
    }
  });

  it('4xx error: returns { ok: false, error, status }', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: 'ya29.err4_token', expires_in: 3600 }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response('{"error":{"code":404,"message":"Rollout not found"}}', { status: 404 })
      );
    vi.stubGlobal('fetch', mockFetch);

    const result = await getFahRolloutState('projects/triarch-dev-tmi/locations/us-central1/backends/tmi-dev/rollouts/missing');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(404);
    }
  });

  it('invalid rolloutResourcePath (not projects/): returns { ok: false, error: "invalid_path" }', async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    const result = await getFahRolloutState('invalid/path/without/projects');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('invalid_path');
    }
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
