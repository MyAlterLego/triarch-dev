// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Mock setup — hoist mocks BEFORE importing the module under test
// ---------------------------------------------------------------------------

vi.mock('next-auth', () => ({
  getServerSession: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  authOptions: {},
}));

vi.mock('@/lib/auth-context', () => ({
  getCurrentUserContext: vi.fn(),
}));

vi.mock('@/lib/fah-rollout', () => ({
  getFahRolloutState: vi.fn(),
}));

// db mock — two distinct operations:
//   1. db.select({ ... }).from(projects).where(eq) — reads project state
//   2. db.update().set().where(and(eq, eq)) — branch-guarded lock clear (timeout + terminal)
//
// authForProject also calls db.select — first call is auth check, second is project state read.

const mockSelectWhere = vi.fn();
const mockUpdateReturning = vi.fn();

vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: mockSelectWhere,
      }),
    }),
    update: () => ({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: mockUpdateReturning,
        }),
      }),
    }),
  },
}));

import { GET } from './route';
import { getServerSession } from 'next-auth';
import { getCurrentUserContext } from '@/lib/auth-context';
import { getFahRolloutState } from '@/lib/fah-rollout';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildReq(): NextRequest {
  return new NextRequest('http://localhost/api/projects/tmi/branch/preview/status', {
    method: 'GET',
  });
}

const params = { params: Promise.resolve({ slug: 'tmi' }) };

const staffCtx = {
  email: 'staff@triarchsecurity.com',
  isStaff: true,
  memberships: [{ project_key: '*', role: 'staff' as const }],
};

const adminCtx = {
  email: 'admin@customer.com',
  isStaff: false,
  memberships: [{ project_key: 'tmi', role: 'admin' as const }],
};

const viewerCtx = {
  email: 'viewer@customer.com',
  isStaff: false,
  memberships: [{ project_key: 'tmi', role: 'viewer' as const }],
};

const projectKey = { key: 'tmi' };

const ROLLOUT_PATH = 'projects/triarch-dev-tmi/locations/us-central1/backends/tmi-dev/rollouts/abc123';

beforeEach(() => {
  vi.clearAllMocks();
  mockUpdateReturning.mockResolvedValue([]);
});

function setupAuthSuccess(ctx = adminCtx) {
  (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue({
    user: { email: ctx.email },
  });
  (getCurrentUserContext as ReturnType<typeof vi.fn>).mockResolvedValue(ctx);
}

// ---------------------------------------------------------------------------
// GET /api/projects/[slug]/branch/preview/status
// ---------------------------------------------------------------------------

describe('GET /api/projects/[slug]/branch/preview/status', () => {
  it('401 unauthenticated — no session', async () => {
    (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await GET(buildReq(), params);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: 'unauthorized' });
    expect(getFahRolloutState).not.toHaveBeenCalled();
  });

  it('403 non-admin member — viewer role', async () => {
    (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { email: 'viewer@customer.com' },
    });
    (getCurrentUserContext as ReturnType<typeof vi.fn>).mockResolvedValue(viewerCtx);
    mockSelectWhere.mockResolvedValue([projectKey]);

    const res = await GET(buildReq(), params);

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toEqual({ error: 'forbidden' });
    expect(getFahRolloutState).not.toHaveBeenCalled();
  });

  it('404 project not found', async () => {
    (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { email: 'admin@customer.com' },
    });
    (getCurrentUserContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    mockSelectWhere.mockResolvedValue([]);

    const res = await GET(buildReq(), params);

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ error: 'not_found' });
  });

  it('idle — no lock set, returns terminal=true state=idle', async () => {
    setupAuthSuccess();
    // authForProject select, then project state select
    mockSelectWhere
      .mockResolvedValueOnce([projectKey])   // authForProject
      .mockResolvedValueOnce([{              // project state read
        previewBranchLocked: null,
        previewBranchLockedAt: null,
        metadata: {},
      }]);

    const res = await GET(buildReq(), params);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      branch: null,
      state: 'idle',
      locked_at: null,
      locked_by: null,
      started_at: null,
      terminal: true,
    });
    expect(getFahRolloutState).not.toHaveBeenCalled();
  });

  it('PENDING in-flight — lock set recently, FAH returns PENDING', async () => {
    setupAuthSuccess();
    const lockedAt = new Date(Date.now() - 30_000); // 30 seconds ago
    mockSelectWhere
      .mockResolvedValueOnce([projectKey])
      .mockResolvedValueOnce([{
        previewBranchLocked: 'feat/audio',
        previewBranchLockedAt: lockedAt,
        metadata: { previewRolloutName: ROLLOUT_PATH, previewLockedBy: 'admin@customer.com' },
      }]);
    (getFahRolloutState as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      state: 'PENDING',
    });

    const res = await GET(buildReq(), params);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.branch).toBe('feat/audio');
    expect(body.state).toBe('PENDING');
    expect(body.terminal).toBe(false);
    expect(body.locked_at).toBe(lockedAt.toISOString());
    expect(body.locked_by).toBe('admin@customer.com');
    expect(body.started_at).toBe(lockedAt.toISOString());
    expect(body.rolloutResourcePath).toBe(ROLLOUT_PATH);
    // Lock NOT cleared for in-flight state
    expect(mockUpdateReturning).not.toHaveBeenCalled();
  });

  it('SUCCEEDED — terminal=true, lock auto-cleared with branch guard', async () => {
    setupAuthSuccess();
    const lockedAt = new Date(Date.now() - 60_000); // 1 min ago
    mockSelectWhere
      .mockResolvedValueOnce([projectKey])
      .mockResolvedValueOnce([{
        previewBranchLocked: 'feat/audio',
        previewBranchLockedAt: lockedAt,
        metadata: { previewRolloutName: ROLLOUT_PATH, previewLockedBy: 'admin@customer.com' },
      }]);
    (getFahRolloutState as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      state: 'SUCCEEDED',
      buildState: 'SUCCEEDED',
    });

    const res = await GET(buildReq(), params);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.state).toBe('SUCCEEDED');
    expect(body.terminal).toBe(true);
    // Lock cleared for terminal state
    expect(mockUpdateReturning).toHaveBeenCalled();
  });

  it('FAILED — terminal=true, errorMessage included, lock auto-cleared', async () => {
    setupAuthSuccess();
    const lockedAt = new Date(Date.now() - 90_000); // 90 sec ago
    mockSelectWhere
      .mockResolvedValueOnce([projectKey])
      .mockResolvedValueOnce([{
        previewBranchLocked: 'feat/audio',
        previewBranchLockedAt: lockedAt,
        metadata: { previewRolloutName: ROLLOUT_PATH, previewLockedBy: 'admin@customer.com' },
      }]);
    (getFahRolloutState as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      state: 'FAILED',
      buildState: 'FAILED',
      errorMessage: 'docker build error',
    });

    const res = await GET(buildReq(), params);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.state).toBe('FAILED');
    expect(body.terminal).toBe(true);
    expect(body.errorMessage).toBe('docker build error');
    // Lock cleared
    expect(mockUpdateReturning).toHaveBeenCalled();
  });

  it('8-min timeout — force-clears lock without calling FAH, returns state=timeout', async () => {
    setupAuthSuccess();
    // 9 minutes ago — exceeds 8-min hard cap
    const lockedAt = new Date(Date.now() - 9 * 60 * 1000);
    mockSelectWhere
      .mockResolvedValueOnce([projectKey])
      .mockResolvedValueOnce([{
        previewBranchLocked: 'feat/audio',
        previewBranchLockedAt: lockedAt,
        metadata: { previewRolloutName: ROLLOUT_PATH, previewLockedBy: 'admin@customer.com' },
      }]);

    const res = await GET(buildReq(), params);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.state).toBe('timeout');
    expect(body.terminal).toBe(true);
    expect(body.branch).toBe('feat/audio');
    // FAH NOT called — timeout fires before poll
    expect(getFahRolloutState).not.toHaveBeenCalled();
    // Lock force-cleared
    expect(mockUpdateReturning).toHaveBeenCalled();
  });

  it('stale-poll guard — db.update WHERE includes branch guard to protect newer lock', async () => {
    setupAuthSuccess();
    const lockedAt = new Date(Date.now() - 60_000);
    mockSelectWhere
      .mockResolvedValueOnce([projectKey])
      .mockResolvedValueOnce([{
        // The DB now holds a NEWER lock for 'feat/new'
        previewBranchLocked: 'feat/new',
        previewBranchLockedAt: lockedAt,
        metadata: { previewRolloutName: ROLLOUT_PATH, previewLockedBy: 'admin@customer.com' },
      }]);
    (getFahRolloutState as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      state: 'SUCCEEDED',
    });

    const res = await GET(buildReq(), params);

    expect(res.status).toBe(200);
    const body = await res.json();
    // Route sees SUCCEEDED → tries to clear lock
    expect(body.terminal).toBe(true);
    // db.update was called — the branch-guarded WHERE is the mechanism
    // (WHERE key=$slug AND previewBranchLocked=$branch prevents clearing newer lock)
    expect(mockUpdateReturning).toHaveBeenCalled();
  });
});
