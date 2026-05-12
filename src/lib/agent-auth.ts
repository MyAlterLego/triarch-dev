// src/lib/agent-auth.ts
//
// Bearer-token auth for the /api/agents/* namespace.
// Validates tokens against agent_identities, attaches the resolved agent to
// the request context, gates by scope, and writes an audit entry on every
// authenticated call.
//
// Parallel to (does NOT replace) NextAuth session auth on /api/*.

import { createHash, timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  accessAuditLogs,
  agentIdentities,
  type AgentIdentity,
  type AgentScope,
} from '@/db/schema';

// ---------------------------------------------------------------------------
// Token format & hashing
// ---------------------------------------------------------------------------

// Convention: `tak_<8charprefix>_<32charsecret>`  (45 chars total: 4+8+1+32)
//   tak = triarch agent key
//   prefix is also stored on the row for display ("tak_a1b2..." in UI)
//   secret is what matters for hashing
//
// SHA-256 of the full token (including the 'tak_' prefix) is stored in
// api_key_hash. We never decrypt — we only hash incoming tokens and
// constant-time compare against stored hashes.

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function constantTimeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const buf1 = Buffer.from(a, 'hex');
  const buf2 = Buffer.from(b, 'hex');
  if (buf1.length !== buf2.length) return false;
  return timingSafeEqual(buf1, buf2);
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class AgentAuthError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: 'missing_token' | 'invalid_token' | 'disabled' | 'insufficient_scope' | 'server_error',
  ) {
    super(message);
    this.name = 'AgentAuthError';
  }
}

function authError(message: string, status: number, code: AgentAuthError['code']): NextResponse {
  return NextResponse.json({ ok: false, error: message, code }, { status });
}

// ---------------------------------------------------------------------------
// Core resolver
// ---------------------------------------------------------------------------

/**
 * Resolve an incoming request's Authorization header to an active agent identity.
 * Returns the agent on success, or null if no token / invalid token / disabled.
 * Always constant-time on the comparison.
 *
 * Logs diagnostic info to console.warn at each failure point (dev only — strip
 * these once auth is stable in production).
 */
export async function resolveAgent(request: NextRequest): Promise<AgentIdentity | null> {
  const header = request.headers.get('authorization');
  if (!header) {
    console.warn('[agent-auth] no Authorization header');
    return null;
  }
  if (!header.toLowerCase().startsWith('bearer ')) {
    console.warn(`[agent-auth] Authorization header does not start with "Bearer ": got "${header.slice(0, 12)}…"`);
    return null;
  }

  const token = header.slice(7).trim();
  if (!token) {
    console.warn('[agent-auth] empty token after stripping "Bearer "');
    return null;
  }
  if (!token.startsWith('tak_')) {
    console.warn(`[agent-auth] token does not start with "tak_" — got prefix "${token.slice(0, 6)}…"`);
    return null;
  }
  if (token.length !== 45) {
    console.warn(`[agent-auth] token has wrong length: ${token.length} (expected 45)`);
    return null;
  }

  const incomingHash = sha256Hex(token);

  // Fetch ALL active agents, then constant-time compare. (At Triarch's scale —
  // single-digit agents — this is cheap. If we ever scale to 100s, we'd
  // pre-index by prefix and only compare candidates with matching prefix.)
  const candidates = await db
    .select()
    .from(agentIdentities)
    .where(isNull(agentIdentities.disabledAt));

  let matched: AgentIdentity | null = null;
  for (const a of candidates) {
    if (constantTimeEqualHex(a.apiKeyHash, incomingHash)) {
      matched = a;
      // do NOT break — keep comparing to avoid timing channel from short-circuit
    }
  }

  if (!matched) {
    console.warn(
      `[agent-auth] token format OK but no hash match. ` +
      `incoming hash: ${incomingHash.slice(0, 16)}… / ` +
      `db has ${candidates.length} active rows, ` +
      `prefixes: [${candidates.map((c) => c.apiKeyPrefix).join(', ')}]`
    );
  }

  if (matched) {
    // Update last_used_at fire-and-forget
    db.update(agentIdentities)
      .set({ lastUsedAt: sql`now()` })
      .where(eq(agentIdentities.id, matched.id))
      .catch((err) => console.error('[agent-auth] failed to update lastUsedAt:', err));
  }

  return matched;
}

// ---------------------------------------------------------------------------
// Wrapper: route guard
// ---------------------------------------------------------------------------

export interface AgentRouteContext {
  agent: AgentIdentity;
  sessionId: string | undefined;
  ipAddress: string | undefined;
}

/**
 * Wrap a route handler so it gets an authenticated agent context.
 *
 * Usage:
 *   export const GET = withAgent(
 *     [AGENT_SCOPES.READ_COMPANIES],
 *     async (req, { agent }) => { ... return NextResponse.json(...) }
 *   );
 */
export function withAgent(
  requiredScopes: AgentScope[],
  handler: (request: NextRequest, ctx: AgentRouteContext) => Promise<NextResponse>,
): (request: NextRequest) => Promise<NextResponse> {
  return async (request: NextRequest) => {
    const agent = await resolveAgent(request);
    if (!agent) {
      return authError('Missing or invalid agent token', 401, 'missing_token');
    }
    if (agent.disabledAt) {
      return authError(`Agent ${agent.name} is disabled`, 403, 'disabled');
    }

    const scopes = (agent.scopes as string[]) ?? [];
    const missing = requiredScopes.filter((s) => !scopes.includes(s));
    if (missing.length > 0) {
      return authError(
        `Agent ${agent.name} missing required scope(s): ${missing.join(', ')}`,
        403,
        'insufficient_scope',
      );
    }

    const sessionId = request.headers.get('x-claude-session-id') ?? undefined;
    const ipAddress =
      request.headers.get('x-forwarded-for')?.split(',')[0].trim()
      ?? request.headers.get('x-real-ip')
      ?? undefined;

    try {
      return await handler(request, { agent, sessionId, ipAddress });
    } catch (err) {
      console.error(`[agent-auth] handler error for ${agent.name}:`, err);
      return authError('Internal error in agent route', 500, 'server_error');
    }
  };
}

// ---------------------------------------------------------------------------
// Audit helper — wrap your route to also log the call to access_audit_logs
// ---------------------------------------------------------------------------

export interface AuditInput {
  agent: AgentIdentity;
  sessionId?: string;
  ipAddress?: string;
  action: 'read' | 'create' | 'update' | 'delete';
  targetEntityType: string;       // 'company' | 'meeting' | 'deal' | ...
  targetEntityId: string;
  targetEntityName?: string;
  reason: string;                 // agent-supplied reason
  tool: string;                   // MCP tool name (for metadata)
  jitTokenId?: string;
  extra?: Record<string, unknown>;
}

export async function logAgentActivity(input: AuditInput): Promise<void> {
  const metadata = {
    agent_persona: input.agent.personaName,
    tool: input.tool,
    jit_token_id: input.jitTokenId,
    ...(input.extra ?? {}),
  };

  await db.insert(accessAuditLogs).values({
    project: 'agent-mcp',
    actorUserId: `agent:${input.agent.name}`,
    actorEmail: input.agent.email ?? null,
    targetEntityType: input.targetEntityType,
    targetEntityId: input.targetEntityId,
    targetEntityName: input.targetEntityName ?? null,
    action: input.action,
    reason: input.reason,
    sessionId: input.sessionId ? input.sessionId : null,
    ipAddress: input.ipAddress ?? null,
    metadata,
  });
}

// ---------------------------------------------------------------------------
// Token generation helper (used by a one-time setup script, not by routes)
// ---------------------------------------------------------------------------

/**
 * Generate a new agent token. Returns the plaintext token (return to GCP
 * Secret Manager) and the values to insert/update in agent_identities.
 *
 * This is only called from setup scripts, NOT from route handlers.
 */
export function generateAgentToken(): {
  plaintext: string;
  apiKeyHash: string;
  apiKeyPrefix: string;
} {
  const { randomBytes } = require('node:crypto') as typeof import('node:crypto');
  const prefix = randomBytes(4).toString('hex'); // 8 chars
  const secret = randomBytes(16).toString('hex'); // 32 chars
  const plaintext = `tak_${prefix}_${secret}`;
  const apiKeyHash = sha256Hex(plaintext);
  const apiKeyPrefix = `tak_${prefix}`;
  return { plaintext, apiKeyHash, apiKeyPrefix };
}
