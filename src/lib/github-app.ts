// src/lib/github-app.ts
//
// GitHub App authentication: signs a short-lived JWT with the App's private key,
// exchanges it for an installation access token, caches the installation token in-process
// for 50 min (10-min margin under GitHub's 60-min lifetime), and exposes dispatchWorkflow()
// as the primary entry point for promoting releases.
//
// Mirrors the raw-fetch + Bearer + vnd.github+json pattern from src/lib/github-push.ts.
// RS256 signing uses Node built-in `crypto` — no new dependency.

import crypto from 'node:crypto';

type CachedToken = { token: string; expiresAt: number };

let cached: CachedToken | null = null;
let inflight: Promise<string> | null = null;

const TOKEN_TTL_MS = 50 * 60 * 1000;       // 50 minutes
const JWT_PAST_SKEW_S = 60;                 // 60 sec past skew on iat
const JWT_LIFETIME_S = 9 * 60;              // 9 min — 1 min under GitHub's 10-min ceiling

function b64url(buf: Buffer | string): string {
  const b = typeof buf === 'string' ? Buffer.from(buf) : buf;
  return b.toString('base64url');
}

function readEnv(): { appId: string; privateKey: string; installationId: string } {
  const appId = process.env.GITHUB_APP_ID;
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;
  const installationId = process.env.GITHUB_APP_INSTALLATION_ID;
  const missing: string[] = [];
  if (!appId) missing.push('GITHUB_APP_ID');
  if (!privateKey) missing.push('GITHUB_APP_PRIVATE_KEY');
  if (!installationId) missing.push('GITHUB_APP_INSTALLATION_ID');
  if (missing.length) {
    throw new Error(`[github-app] missing required env vars: ${missing.join(', ')}`);
  }
  // PRIVATE_KEY may arrive with literal "\n" sequences when piped through Firebase secrets.
  // Normalize to actual newlines so the PEM parser succeeds.
  const normalizedKey = privateKey!.replace(/\\n/g, '\n');
  return { appId: appId!, privateKey: normalizedKey, installationId: installationId! };
}

export function signAppJwt(now = Math.floor(Date.now() / 1000)): string {
  const { appId, privateKey } = readEnv();
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iat: now - JWT_PAST_SKEW_S,
    exp: now + JWT_LIFETIME_S,
    iss: appId,
  };
  const encodedHeader = b64url(JSON.stringify(header));
  const encodedPayload = b64url(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign(privateKey, 'base64url');
  return `${signingInput}.${signature}`;
}

async function exchangeForInstallationToken(): Promise<string> {
  const { installationId } = readEnv();
  const jwt = signAppJwt();
  const res = await fetch(`https://api.github.com/app/installations/${installationId}/access_tokens`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jwt}`,
      Accept: 'application/vnd.github+json',
    },
  });
  if (!res.ok) {
    const body = await res.text();
    // Do NOT echo the JWT or any header — only the response body, which is GitHub's safe error JSON.
    throw new Error(`[github-app] installation token exchange failed: ${res.status} ${body}`);
  }
  const data = (await res.json()) as { token: string; expires_at: string };
  return data.token;
}

export async function getInstallationToken(): Promise<string> {
  const now = Date.now();
  if (cached && now < cached.expiresAt) {
    return cached.token;
  }
  // Single-flight: if a refresh is already in flight, await it instead of starting another.
  if (inflight) {
    return inflight;
  }
  inflight = (async () => {
    try {
      const token = await exchangeForInstallationToken();
      cached = { token, expiresAt: Date.now() + TOKEN_TTL_MS };
      return token;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export type DispatchWorkflowInput = {
  owner: string;
  repo: string;
  workflowFile: string;             // e.g. 'deploy-prod.yml'
  ref: string;                       // git ref, e.g. 'main'
  inputs?: Record<string, string>;
};

export async function dispatchWorkflow(input: DispatchWorkflowInput): Promise<{ ok: true; status: number }> {
  const token = await getInstallationToken();
  const { owner, repo, workflowFile, ref, inputs } = input;
  const url = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflowFile}/dispatches`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ref, inputs: inputs ?? {} }),
  });
  if (res.status !== 204) {
    const body = await res.text();
    // Body only — never log the token or Authorization header.
    throw new Error(`[github-app] dispatch failed for ${owner}/${repo} ${workflowFile} ref=${ref}: ${res.status} ${body}`);
  }
  console.log(
    `[github-app] dispatched ${workflowFile} for ${owner}/${repo} ref=${ref} inputs=${JSON.stringify(inputs ?? {})}`
  );
  return { ok: true, status: res.status };
}

/** Test-only helper. Resets module-level cache + in-flight latch between tests. */
export function resetTokenCacheForTests(): void {
  cached = null;
  inflight = null;
}
