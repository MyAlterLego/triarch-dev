// src/lib/fah-rollout.ts
//
// Firebase App Hosting (FAH) rollout REST client.
//
// Mirrors the JWT-mint + token-exchange + raw-fetch pattern from src/lib/github-app.ts.
//
// Exports:
//   mintFahAccessToken()            — signs RS256 JWT with SA private key via jose,
//                                     exchanges at oauth2.googleapis.com/token, caches 50 min
//   createFahRollout(input)         — POSTs to FAH rollouts create endpoint
//   getFahRolloutState(path)        — GETs a rollout resource for state polling
//   resetTokenCacheForTests()       — resets module-level cache + in-flight latch (test-only)

import { SignJWT, importPKCS8 } from 'jose';
import { getSecret } from '@myalterlego/secrets';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TOKEN_TTL_MS = 50 * 60 * 1000; // 50 minutes — mirrors github-app.ts
const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const FAH_API_BASE = 'https://firebaseapphosting.googleapis.com/v1beta';

// Branch names may only contain alphanumerics, slashes, underscores, dots, and hyphens.
// Max 256 chars. Guards against shell injection (Pitfall 5 / security).
const BRANCH_REGEX = /^[a-zA-Z0-9/_.\-]{1,256}$/;

// ---------------------------------------------------------------------------
// Module-level token cache + single-flight latch
// ---------------------------------------------------------------------------

type CachedToken = { token: string; expiresAt: number };

let cached: CachedToken | null = null;
let inflight: Promise<string> | null = null;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type CreateFahRolloutInput = {
  projectId: string;  // GCP project (e.g. 'triarch-dev-tmi')
  location: string;   // FAH region (e.g. 'us-central1')
  backendId: string;  // FAH backend (e.g. 'tmi-dev')
  branch: string;     // git branch to deploy
};

export type CreateFahRolloutResult =
  | { ok: true; rolloutName: string; state: string }
  | { ok: false; error: string; status?: number };

export type FahRolloutState =
  | 'PENDING'
  | 'BUILDING'
  | 'DEPLOYING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'CANCELLED'
  | string;

export type GetFahRolloutStateResult =
  | { ok: true; state: FahRolloutState; buildState?: string; errorMessage?: string }
  | { ok: false; error: string; status?: number };

// ---------------------------------------------------------------------------
// mintFahAccessToken
// ---------------------------------------------------------------------------

export async function mintFahAccessToken(): Promise<string> {
  const now = Date.now();

  // Cache hit — return within TTL
  if (cached && now < cached.expiresAt) {
    return cached.token;
  }

  // Single-flight latch — if a refresh is already in flight, await it
  if (inflight) {
    return inflight;
  }

  inflight = (async (): Promise<string> => {
    try {
      // 1. Read SA key from vault
      let saKeyJson: string;
      try {
        saKeyJson = await getSecret('FAH_PROMOTER_SA_KEY');
      } catch {
        throw new Error('[fah-rollout] missing FAH_PROMOTER_SA_KEY');
      }

      // 2. Parse SA JSON + normalize literal \\n → real newlines (Firebase secret pipe quirk)
      const sa = JSON.parse(saKeyJson) as { client_email: string; private_key: string };
      const privateKeyPem = sa.private_key.replace(/\\n/g, '\n');

      // 3. Import PEM key for RS256 signing
      const privateKey = await importPKCS8(privateKeyPem, 'RS256');

      // 4. Sign the JWT per Google's service account auth spec
      const jwt = await new SignJWT({
        scope: 'https://www.googleapis.com/auth/cloud-platform',
      })
        .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
        .setIssuer(sa.client_email)
        .setSubject(sa.client_email)
        .setAudience(OAUTH_TOKEN_URL)
        .setIssuedAt()
        .setExpirationTime('1h')
        .sign(privateKey);

      // 5. Exchange JWT for OAuth2 access token
      const res = await fetch(OAUTH_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${encodeURIComponent(jwt)}`,
      });

      if (!res.ok) {
        const body = await res.text();
        // Do NOT echo the JWT — only include response body and status
        throw new Error(`[fah-rollout] token exchange failed: ${res.status} ${body}`);
      }

      const data = (await res.json()) as { access_token: string; expires_in: number };
      const token = data.access_token;
      cached = { token, expiresAt: Date.now() + TOKEN_TTL_MS };
      return token;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

// ---------------------------------------------------------------------------
// createFahRollout
// ---------------------------------------------------------------------------

export async function createFahRollout(input: CreateFahRolloutInput): Promise<CreateFahRolloutResult> {
  const { projectId, location, backendId, branch } = input;

  // Security guard: validate branch BEFORE any network call (Pitfall 5)
  if (!BRANCH_REGEX.test(branch)) {
    return { ok: false, error: 'invalid_branch' };
  }

  try {
    const token = await mintFahAccessToken();
    const url = `${FAH_API_BASE}/projects/${projectId}/locations/${location}/backends/${backendId}/rollouts`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        build: {
          source: {
            codebase: { branch },
          },
        },
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      return { ok: false, error: body, status: res.status };
    }

    const data = (await res.json()) as { name: string; state: string };
    return { ok: true, rolloutName: data.name, state: data.state };
  } catch (err) {
    // No throw across module boundary — structured error return
    return { ok: false, error: String(err) };
  }
}

// ---------------------------------------------------------------------------
// getFahRolloutState
// ---------------------------------------------------------------------------

export async function getFahRolloutState(rolloutResourcePath: string): Promise<GetFahRolloutStateResult> {
  // Defensive validation — rolloutResourcePath is caller-controlled
  if (!rolloutResourcePath.startsWith('projects/')) {
    return { ok: false, error: 'invalid_path' };
  }

  try {
    const token = await mintFahAccessToken();
    const url = `${FAH_API_BASE}/${rolloutResourcePath}`;

    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      const body = await res.text();
      return { ok: false, error: body, status: res.status };
    }

    const data = (await res.json()) as {
      state: string;
      build?: {
        state?: string;
        errorMessage?: string;
      };
    };

    return {
      ok: true,
      state: data.state,
      buildState: data.build?.state,
      errorMessage: data.build?.errorMessage,
    };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

// ---------------------------------------------------------------------------
// Test-only helper
// ---------------------------------------------------------------------------

/** Resets module-level cache + in-flight latch between tests. Mirrors github-app.ts. */
export function resetTokenCacheForTests(): void {
  cached = null;
  inflight = null;
}
