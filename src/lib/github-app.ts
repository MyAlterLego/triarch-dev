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
import { getSecret } from '@triarchsecurity/secrets';

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

async function readVaultEnv(): Promise<{ appId: string; privateKey: string; installationId: string }> {
  const missing: string[] = [];
  let appId: string;
  let privateKeyRaw: string;
  let installationId: string;
  try {
    appId = await getSecret('GITHUB_APP_ID');
  } catch {
    missing.push('GITHUB_APP_ID');
    appId = '';
  }
  try {
    privateKeyRaw = await getSecret('GITHUB_APP_PRIVATE_KEY');
  } catch {
    missing.push('GITHUB_APP_PRIVATE_KEY');
    privateKeyRaw = '';
  }
  try {
    installationId = await getSecret('GITHUB_APP_INSTALLATION_ID');
  } catch {
    missing.push('GITHUB_APP_INSTALLATION_ID');
    installationId = '';
  }
  if (missing.length) {
    throw new Error(`[github-app] missing required env vars: ${missing.join(', ')}`);
  }
  // PRIVATE_KEY may arrive with literal "\n" sequences when piped through Firebase secrets.
  // Normalize to actual newlines so the PEM parser succeeds.
  const privateKey = privateKeyRaw.replace(/\\n/g, '\n');
  return { appId, privateKey, installationId };
}

export async function signAppJwt(now = Math.floor(Date.now() / 1000)): Promise<string> {
  const { appId, privateKey } = await readVaultEnv();
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
  const { installationId } = await readVaultEnv();
  const jwt = await signAppJwt();
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

// ---------------------------------------------------------------------------
// Pull request merge — PR-based dev→main promotion via GitHub API.
//
// Used by /triarch promote <project> to merge the open dev→main PR for a
// project as a real merge commit (NOT squash). Squash breaks consumer projects'
// verify-dev-deployed gate because dev's commit hashes do not survive into
// main's ancestry under squash. Always uses merge_method='merge'.
// ---------------------------------------------------------------------------

export type MergeBranchInput = {
  owner: string;
  repo: string;
  headBranch: string;
  baseBranch: string;
};

export type MergeBranchResult =
  | { merged: true; prNumber: number; sha: string; htmlUrl: string }
  | { merged: false; reason: 'no_open_pr'; headBranch: string; baseBranch: string }
  | { merged: false; reason: 'merge_failed'; prNumber: number; statusCode: number; message: string };

export async function mergeBranchToMain(input: MergeBranchInput): Promise<MergeBranchResult> {
  const token = await getInstallationToken();
  const { owner, repo, headBranch, baseBranch } = input;

  const listUrl =
    `https://api.github.com/repos/${owner}/${repo}/pulls` +
    `?state=open&base=${encodeURIComponent(baseBranch)}&head=${encodeURIComponent(owner + ':' + headBranch)}`;
  const listRes = await fetch(listUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
    },
  });
  if (!listRes.ok) {
    const body = await listRes.text();
    throw new Error(`[github-app] list PRs failed for ${owner}/${repo}: ${listRes.status} ${body}`);
  }
  const prs = (await listRes.json()) as Array<{ number: number; html_url: string }>;
  if (prs.length === 0) {
    return { merged: false, reason: 'no_open_pr', headBranch, baseBranch };
  }
  const pr = prs[0];

  const mergeUrl = `https://api.github.com/repos/${owner}/${repo}/pulls/${pr.number}/merge`;
  const mergeRes = await fetch(mergeUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ merge_method: 'merge' }),
  });
  if (!mergeRes.ok) {
    const body = await mergeRes.text();
    return {
      merged: false,
      reason: 'merge_failed',
      prNumber: pr.number,
      statusCode: mergeRes.status,
      message: body.slice(0, 300),
    };
  }
  const mergeData = (await mergeRes.json()) as { sha: string; merged: boolean };
  console.log(
    `[github-app] merged PR #${pr.number} for ${owner}/${repo} ${headBranch}→${baseBranch} sha=${mergeData.sha}`
  );
  return { merged: true, prNumber: pr.number, sha: mergeData.sha, htmlUrl: pr.html_url };
}

/** Test-only helper. Resets module-level cache + in-flight latch between tests. */
export function resetTokenCacheForTests(): void {
  cached = null;
  inflight = null;
}
