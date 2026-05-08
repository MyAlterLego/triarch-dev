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
  createFahRollout: vi.fn(),
}));

// db mock — chainable Drizzle mock
// The POST route calls:
//   1. db.select({ key }).from(projects).where(eq(key, slug))   — in authForProject
//   2. db.update().set().where(and(eq, isNull)).returning()     — atomic lock acquisition
//   3. db.select({ ... }).from(projects).where(eq(key, slug))   — re-read on race lost (409 path)
//   4. db.update().set().where(and(eq, eq)).returning()         — lock release on FAH failure (502 path)
//   5. db.update().set({ metadata: sql... }).where(eq)           — jsonb_set metadata stamp (202 path)
//
// We need call-order-dependent behavior for db.update, so we track calls via a queue.

const mockSelectWhere = vi.fn();
const mockReturningFn = vi.fn();

// Track all update().set() chains — index 0 = first update call, 1 = second, etc.
// Each update call returns its own returning() mock
const updateCallQueue: ReturnType<typeof vi.fn>[] = [];
let updateCallIndex = 0;

function makeUpdateChain(returningMock: ReturnType<typeof vi.fn>) {
  return {
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: returningMock,
      }),
    }),
  };
}

vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: mockSelectWhere,
      }),
    }),
    update: () => {
      const returning = updateCallQueue[updateCallIndex] ?? mockReturningFn;
      updateCallIndex++;
      return makeUpdateChain(returning);
    },
  },
}));

import { POST } from './route';
import { getServerSession } from 'next-auth';
import { getCurrentUserContext } from '@/lib/auth-context';
import { createFahRollout } from '@/lib/fah-rollout';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildReq(body: object = { branch: 'feat/audio' }): NextRequest {
  return new NextRequest('http://localhost/api/projects/tmi/branch/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
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

const projectRow = { key: 'tmi' };
const projectRowWithFirebase = { key: 'tmi', firebaseProjectId: 'triarch-dev-tmi' };

beforeEach(() => {
  vi.clearAllMocks();
  updateCallQueue.length = 0;
  updateCallIndex = 0;
});

// ---------------------------------------------------------------------------
// POST /api/projects/[slug]/branch/preview
// ---------------------------------------------------------------------------

describe('POST /api/projects/[slug]/branch/preview', () => {
  it('401 unauthenticated — no session', async () => {
    (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await POST(buildReq(), params);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: 'unauthorized' });
    expect(createFahRollout).not.toHaveBeenCalled();
  });

  it('403 non-admin member — viewer role on project', async () => {
    (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { email: 'viewer@customer.com' },
    });
    (getCurrentUserContext as ReturnType<typeof vi.fn>).mockResolvedValue(viewerCtx);
    // Project exists (authForProject db.select returns row)
    mockSelectWhere.mockResolvedValue([projectRow]);

    const res = await POST(buildReq(), params);

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toEqual({ error: 'forbidden' });
    expect(createFahRollout).not.toHaveBeenCalled();
  });

  it('404 project not found', async () => {
    (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { email: 'admin@customer.com' },
    });
    (getCurrentUserContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    // Project does NOT exist
    mockSelectWhere.mockResolvedValue([]);

    const res = await POST(buildReq(), params);

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ error: 'not_found' });
    expect(createFahRollout).not.toHaveBeenCalled();
  });

  it('400 invalid_branch — shell metacharacters rejected', async () => {
    (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { email: 'staff@triarchsecurity.com' },
    });
    (getCurrentUserContext as ReturnType<typeof vi.fn>).mockResolvedValue(staffCtx);
    mockSelectWhere.mockResolvedValue([projectRow]);

    // Branch with semicolon — shell injection attempt
    const res = await POST(buildReq({ branch: 'feat;rm -rf' }), params);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ error: 'invalid_branch' });
    expect(createFahRollout).not.toHaveBeenCalled();
  });

  it('409 lock_held — atomic UPDATE returns [] (race lost)', async () => {
    (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { email: 'admin@customer.com' },
    });
    (getCurrentUserContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);

    const lockedAt = new Date('2026-05-08T05:00:00Z');

    // authForProject db.select — project exists
    // re-read after race lost — current lock holder
    mockSelectWhere
      .mockResolvedValueOnce([projectRow])                   // authForProject
      .mockResolvedValueOnce([{                              // re-read after race lost
        previewBranchLocked: 'feat/other',
        previewBranchLockedAt: lockedAt,
        metadata: { previewLockedBy: 'other@x.com' },
      }]);

    // Atomic UPDATE: empty [] — race lost
    const lockUpdateReturning = vi.fn().mockResolvedValue([]);
    updateCallQueue.push(lockUpdateReturning);

    const res = await POST(buildReq(), params);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('lock_held');
    expect(body.current_branch).toBe('feat/other');
    expect(body.locked_at).toBe(lockedAt.toISOString());
    expect(body.locked_by).toBe('other@x.com');
    expect(createFahRollout).not.toHaveBeenCalled();
  });

  it('502 fah_dispatch_failed — lock acquired then released on FAH error', async () => {
    (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { email: 'admin@customer.com' },
    });
    (getCurrentUserContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    mockSelectWhere.mockResolvedValue([projectRow]);

    // Atomic UPDATE lock acquisition: row returned — race won
    const lockUpdateReturning = vi.fn().mockResolvedValue([projectRowWithFirebase]);
    // Lock release UPDATE: returns (void-like)
    const releaseUpdateReturning = vi.fn().mockResolvedValue([]);
    updateCallQueue.push(lockUpdateReturning, releaseUpdateReturning);

    // FAH dispatch fails
    (createFahRollout as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      error: 'build error',
      status: 400,
    });

    const res = await POST(buildReq(), params);

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe('fah_dispatch_failed');
    expect(body.detail).toBe('build error');

    // Verify the lock release UPDATE was called (second db.update call)
    expect(releaseUpdateReturning).toHaveBeenCalled();
  });

  it('202 happy path — lock acquired, FAH dispatched, metadata stamped', async () => {
    (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { email: 'admin@customer.com' },
    });
    (getCurrentUserContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    mockSelectWhere.mockResolvedValue([projectRow]);

    // Atomic UPDATE lock acquisition: row returned — race won
    const lockUpdateReturning = vi.fn().mockResolvedValue([projectRowWithFirebase]);
    // Metadata jsonb_set update — no returning needed
    const metadataUpdateReturning = vi.fn().mockResolvedValue([]);
    updateCallQueue.push(lockUpdateReturning, metadataUpdateReturning);

    const rolloutName = 'projects/triarch-dev-tmi/locations/us-central1/backends/tmi-dev/rollouts/abc123';
    (createFahRollout as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      rolloutName,
      state: 'PENDING',
    });

    const res = await POST(buildReq({ branch: 'feat/audio' }), params);

    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.rolloutName).toBe(rolloutName);
    expect(body.state).toBe('PENDING');
    expect(body.locked_at).toBeDefined();
    expect(body.locked_by).toBe('admin@customer.com');

    // createFahRollout called with correct args
    expect(createFahRollout).toHaveBeenCalledWith({
      projectId: 'triarch-dev-tmi',
      location: 'us-central1',
      backendId: 'tmi-dev',
      branch: 'feat/audio',
    });

    // Metadata update was called
    expect(metadataUpdateReturning).toHaveBeenCalled();
  });
});
