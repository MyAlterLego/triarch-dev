import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

vi.mock('@myalterlego/secrets', () => ({ getSecret: vi.fn() }));
vi.mock('@/lib/api-auth', () => ({ requireStaff: vi.fn() }));

import { getSecret } from '@myalterlego/secrets';
import { requireStaff } from '@/lib/api-auth';
import { GET, VAULT_KEYS } from './route';

const mockedGetSecret = vi.mocked(getSecret);
const mockedRequireStaff = vi.mocked(requireStaff);

beforeEach(() => {
  mockedGetSecret.mockReset();
  mockedRequireStaff.mockReset();
});

describe('GET /api/platform/health/secrets', () => {
  it('returns staff auth error response when not staff', async () => {
    const denied = NextResponse.json({ error: 'forbidden' }, { status: 403 });
    mockedRequireStaff.mockResolvedValue({ error: denied, session: null, ctx: null });
    const res = await GET();
    expect(res).toBe(denied);
  });

  it('returns 200 with ok:true when all 7 secrets resolve', async () => {
    mockedRequireStaff.mockResolvedValue({ error: null, session: null, ctx: null });
    mockedGetSecret.mockImplementation(async (k) => `value-of-${k}`);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.secrets).toHaveLength(7);
    expect(body.secrets.every((s: { ok: boolean }) => s.ok)).toBe(true);
  });

  it('returns 207 with ok:false on partial failure', async () => {
    mockedRequireStaff.mockResolvedValue({ error: null, session: null, ctx: null });
    mockedGetSecret.mockImplementation(async (k) => {
      if (k === 'SLACK_BOT_TOKEN' || k === 'GITHUB_APP_ID') {
        throw new Error('PERMISSION_DENIED');
      }
      return `value-of-${k}`;
    });
    const res = await GET();
    expect(res.status).toBe(207);
    const body = await res.json();
    expect(body.ok).toBe(false);
    const failed = body.secrets.filter((s: { ok: boolean }) => !s.ok);
    expect(failed).toHaveLength(2);
    expect(failed.map((s: { key: string }) => s.key).sort()).toEqual([
      'GITHUB_APP_ID',
      'SLACK_BOT_TOKEN',
    ]);
  });

  it('VAULT_KEYS contains exactly the 7 expected names', () => {
    expect([...VAULT_KEYS].sort()).toEqual([
      'GITHUB_APP_ID',
      'GITHUB_APP_INSTALLATION_ID',
      'GITHUB_APP_PRIVATE_KEY',
      'SLACK_BOT_TOKEN',
      'SLACK_PAYLOAD_SECRET',
      'SLACK_SIGNING_SECRET',
      'SLACK_USER_MAP',
    ]);
  });
});
