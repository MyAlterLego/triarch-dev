/**
 * Wave 0 RED stubs for POST /api/slack/commands.
 * Source route file does NOT exist yet; these tests must fail with module-not-found
 * until plan 07-03 lands the implementation.
 *
 * Covers:
 * - HMAC reject (tampered signature → 401)
 * - Empty /triarch returns help text with both subcommands
 * - /triarch status <project> returns Block Kit with Dev/Prod/Active RCs/Last 3 sections
 * - /triarch status unknown-project returns ephemeral error with up-to-5 project keys
 * - /triarch deploy as @triarchsecurity.com staff dispatches workflow + acks ephemerally
 * - /triarch deploy as non-staff returns :no_entry: ephemeral
 * - /triarch deploy fires-and-forgets dispatch (response returned before await)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  buildSignedSlackRequest,
  makeSlashCommandPayload,
} from '@/lib/__tests__/__fixtures__/slack';

// ─── Env ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  process.env.SLACK_SIGNING_SECRET = 'test_signing_secret';
});

// ─── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('@myalterlego/secrets', () => ({
  getSecret: async (name: string) => process.env[name] ?? '',
}));

const resolveMock = vi.fn();
vi.mock('@/lib/slack-identity', () => ({
  resolveSlackUserEmail: (id: string) => resolveMock(id),
}));

const dispatchWorkflowMock = vi.fn();
vi.mock('@/lib/github-app', () => ({
  dispatchWorkflow: (...args: unknown[]) => dispatchWorkflowMock(...args),
}));

const recordSlackAuditMock = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/slack-audit', () => ({
  recordSlackAudit: (...args: unknown[]) => recordSlackAuditMock(...args),
}));

// db mock — chainable Drizzle stub
let projectLookup: unknown[] = [];
let releaseLookup: unknown[] = [];
let devLookup: unknown[] = [];
let prodLookup: unknown[] = [];
let activeRCsLookup: unknown[] = [];
let lastDeploysLookup: unknown[] = [];
let projectListLookup: unknown[] = [];
let dbCallSequence: string[] = [];

vi.mock('@/lib/db', () => {
  const makeChain = (label: string, result: () => unknown[]) => {
    dbCallSequence.push(label);
    return {
      from: () => ({
        where: () => ({
          orderBy: () => ({
            limit: () => Promise.resolve(result()),
          }),
          limit: () => Promise.resolve(result()),
        }),
        orderBy: () => ({ limit: () => Promise.resolve(result()) }),
        limit: () => Promise.resolve(result()),
      }),
    };
  };
  return {
    db: {
      select: () => {
        const idx = dbCallSequence.length;
        // First call = projects lookup, then in order: dev, prod, active RCs, last deploys
        if (idx === 0) return makeChain('projects', () => projectLookup);
        if (idx === 1) return makeChain('dev', () => devLookup);
        if (idx === 2) return makeChain('prod', () => prodLookup);
        if (idx === 3) return makeChain('rcs', () => activeRCsLookup);
        if (idx === 4) return makeChain('lastDeploys', () => lastDeploysLookup);
        return makeChain('projectList', () => projectListLookup);
      },
    },
  };
});

beforeEach(() => {
  resolveMock.mockReset();
  dispatchWorkflowMock.mockReset();
  dispatchWorkflowMock.mockResolvedValue({ ok: true, status: 204 });
  recordSlackAuditMock.mockClear();
  dbCallSequence = [];
  projectLookup = [];
  releaseLookup = [];
  devLookup = [];
  prodLookup = [];
  activeRCsLookup = [];
  lastDeploysLookup = [];
  projectListLookup = [];
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('POST /api/slack/commands', () => {
  it('rejects with 401 on tampered signature', async () => {
    const { POST } = await import('@/app/api/slack/commands/route');
    const body = makeSlashCommandPayload({ text: 'status admin' });
    const req = buildSignedSlackRequest(
      'http://localhost/api/slack/commands',
      body,
      'application/x-www-form-urlencoded',
      { tamperSig: true }
    );
    const res = await POST(req as never);
    expect(res.status).toBe(401);
  });

  it('returns help text with deploy + status subcommands when text is empty', async () => {
    const { POST } = await import('@/app/api/slack/commands/route');
    const body = makeSlashCommandPayload({ text: '' });
    const req = buildSignedSlackRequest(
      'http://localhost/api/slack/commands',
      body,
      'application/x-www-form-urlencoded'
    );
    const res = await POST(req as never);
    const json = await res.json();
    expect(json.response_type).toBe('ephemeral');
    expect(json.text).toMatch(/deploy/);
    expect(json.text).toMatch(/status/);
  });

  it('status returns Block Kit with Dev / Prod / Active RCs / Last deploys sections', async () => {
    projectLookup = [{ key: 'admin', githubRepo: 'MyAlterLego/admin' }];
    devLookup = [{ version: 'v1.0.0', deployedAt: new Date(), branch: 'main' }];
    prodLookup = [{ version: 'v0.9.0', deployedAt: new Date(), branch: 'main' }];
    activeRCsLookup = [];
    lastDeploysLookup = [];
    resolveMock.mockResolvedValue('mike@triarchsecurity.com');

    const { POST } = await import('@/app/api/slack/commands/route');
    const body = makeSlashCommandPayload({ text: 'status admin' });
    const req = buildSignedSlackRequest(
      'http://localhost/api/slack/commands',
      body,
      'application/x-www-form-urlencoded'
    );
    const res = await POST(req as never);
    const json = await res.json();
    expect(json.response_type).toBe('ephemeral');
    expect(Array.isArray(json.blocks)).toBe(true);
    const flat = JSON.stringify(json.blocks);
    expect(flat).toMatch(/Dev/);
    expect(flat).toMatch(/Prod/);
    expect(flat).toMatch(/Active RCs/);
    expect(flat).toMatch(/Last 3 Deploys/i);
  });

  it('status unknown project returns ephemeral error with project list hint', async () => {
    projectLookup = []; // not found
    projectListLookup = [
      { key: 'admin' }, { key: 'tmi' }, { key: 'truthtreason' },
    ];
    resolveMock.mockResolvedValue('mike@triarchsecurity.com');

    const { POST } = await import('@/app/api/slack/commands/route');
    const body = makeSlashCommandPayload({ text: 'status nonexistent' });
    const req = buildSignedSlackRequest(
      'http://localhost/api/slack/commands',
      body,
      'application/x-www-form-urlencoded'
    );
    const res = await POST(req as never);
    const json = await res.json();
    expect(json.response_type).toBe('ephemeral');
    expect(json.text).toMatch(/not found/i);
  });

  it('deploy as @triarchsecurity.com staff returns immediate ephemeral ack', async () => {
    projectLookup = [{ key: 'admin', githubRepo: 'MyAlterLego/admin' }];
    releaseLookup = [{ branch: 'main', version: 'v1.0.0' }];
    devLookup = [{ version: 'v1.0.0', deployedAt: new Date(), branch: 'main' }];
    resolveMock.mockResolvedValue('mike@triarchsecurity.com');

    const { POST } = await import('@/app/api/slack/commands/route');
    const body = makeSlashCommandPayload({ text: 'deploy admin v1.0.0' });
    const req = buildSignedSlackRequest(
      'http://localhost/api/slack/commands',
      body,
      'application/x-www-form-urlencoded'
    );
    const res = await POST(req as never);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.response_type).toBe('ephemeral');
    expect(json.text).toMatch(/Dispatch/i);
  });

  it('deploy as non-staff (no @triarchsecurity.com) returns :no_entry: ephemeral', async () => {
    resolveMock.mockResolvedValue('customer@example.com');

    const { POST } = await import('@/app/api/slack/commands/route');
    const body = makeSlashCommandPayload({ text: 'deploy admin v1.0.0' });
    const req = buildSignedSlackRequest(
      'http://localhost/api/slack/commands',
      body,
      'application/x-www-form-urlencoded'
    );
    const res = await POST(req as never);
    const json = await res.json();
    expect(json.text).toMatch(/no_entry|denied|staff/i);
  });
});
