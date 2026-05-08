import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

// Hoist mocks BEFORE imports of the module under test.
vi.mock('@/lib/api-auth', () => ({
  requireStaff: vi.fn(),
}));

vi.mock('@/lib/release-promotion', () => ({
  promoteAndAudit: vi.fn(),
}));

// db mock — chainable select and update mocks
// select chain: select().from().where() → returns an array
// update chain: update().set().where(and(eq, isNull)).returning() → returns array (race won) or [] (race lost)
// select (re-read after race lost): select({ ... }).from().where() → returns [{ promotionDispatchedAt, promotionDispatchedBy }]

const mockSelectWhere = vi.fn();
const mockReturning = vi.fn();
const mockUpdateWhereReturning = vi.fn();

vi.mock('@/lib/db', () => ({
  db: {
    select: (fields?: unknown) => ({
      from: () => ({
        where: fields === undefined
          ? mockSelectWhere          // select() — full row select
          : mockSelectWhere,         // select({ ... }) — projection select (re-read after race lost)
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => ({
          returning: mockReturning,
        }),
      }),
    }),
  },
}));

import { POST } from './route';
import { requireStaff } from '@/lib/api-auth';
import { promoteAndAudit } from '@/lib/release-promotion';

// ---------------------------------------------------------------------------
// Test fixture helpers
// ---------------------------------------------------------------------------

function buildReq(): NextRequest {
  return new NextRequest('http://localhost/api/admin/releases/r1/promote', {
    method: 'POST',
  });
}

const approvedRelease = {
  id: 'r1',
  project: 'darksouls-rpg',
  version: 'v1.0.0',
  branch: 'main',
  status: 'approved',
  promotionDispatchedAt: null,
  promotionDispatchedBy: null,
} as any;

const staffSession = {
  user: { email: 'mike@triarchsecurity.com', name: 'Mike' },
} as any;

const staffCtx = { isStaff: true } as any;

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/admin/releases/[id]/promote', () => {
  it('401 when no session', async () => {
    (requireStaff as ReturnType<typeof vi.fn>).mockResolvedValue({
      error: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
      session: null,
      ctx: null,
    });

    const res = await POST(buildReq(), { params: Promise.resolve({ id: 'r1' }) });
    expect(res.status).toBe(401);

    // No DB calls
    expect(mockSelectWhere).not.toHaveBeenCalled();
    // No promoteAndAudit calls
    expect(promoteAndAudit).not.toHaveBeenCalled();
  });

  it('403 when signed in but not staff', async () => {
    (requireStaff as ReturnType<typeof vi.fn>).mockResolvedValue({
      error: new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 }),
      session: staffSession,
      ctx: null,
    });

    const res = await POST(buildReq(), { params: Promise.resolve({ id: 'r1' }) });
    expect(res.status).toBe(403);

    expect(promoteAndAudit).not.toHaveBeenCalled();
  });

  it('404 when release id does not exist', async () => {
    (requireStaff as ReturnType<typeof vi.fn>).mockResolvedValue({
      error: null,
      session: staffSession,
      ctx: staffCtx,
    });
    // DB select returns empty
    mockSelectWhere.mockResolvedValue([]);

    const res = await POST(buildReq(), { params: Promise.resolve({ id: 'r1' }) });
    expect(res.status).toBe(404);

    const body = await res.json();
    expect(body).toEqual({ error: 'not_found' });
    expect(promoteAndAudit).not.toHaveBeenCalled();
  });

  it('400 when release status is not approved', async () => {
    (requireStaff as ReturnType<typeof vi.fn>).mockResolvedValue({
      error: null,
      session: staffSession,
      ctx: staffCtx,
    });
    // Release exists but not approved
    mockSelectWhere.mockResolvedValue([{ ...approvedRelease, status: 'dev' }]);

    const res = await POST(buildReq(), { params: Promise.resolve({ id: 'r1' }) });
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error).toBe('invalid_status');
    expect(body.currentStatus).toBe('dev');
    expect(promoteAndAudit).not.toHaveBeenCalled();
  });

  it('409 when race lost — atomic UPDATE returns empty (promotion_dispatched_at already set)', async () => {
    (requireStaff as ReturnType<typeof vi.fn>).mockResolvedValue({
      error: null,
      session: staffSession,
      ctx: staffCtx,
    });
    // First select: approved release
    // Second select (re-read after race lost): current dispatched_at / dispatched_by
    mockSelectWhere
      .mockResolvedValueOnce([approvedRelease]) // initial release fetch
      .mockResolvedValueOnce([{                  // re-read after race lost
        promotionDispatchedAt: new Date('2026-05-07T10:00:00Z'),
        promotionDispatchedBy: 'other@triarchsecurity.com',
      }]);
    // Atomic UPDATE returning: empty — race lost
    mockReturning.mockResolvedValue([]);

    const res = await POST(buildReq(), { params: Promise.resolve({ id: 'r1' }) });
    expect(res.status).toBe(409);

    const body = await res.json();
    expect(body.error).toBe('already_promoted');
    expect(body.dispatched_by).toBe('other@triarchsecurity.com');
    expect(body.dispatched_at).toBe('2026-05-07T10:00:00.000Z');
    // promoteAndAudit NOT called — we lost the race
    expect(promoteAndAudit).not.toHaveBeenCalled();
  });

  it('200 happy path — race won, promoteAndAudit called with null Slack params', async () => {
    (requireStaff as ReturnType<typeof vi.fn>).mockResolvedValue({
      error: null,
      session: staffSession,
      ctx: staffCtx,
    });
    // Release exists and is approved
    mockSelectWhere.mockResolvedValue([approvedRelease]);
    // Atomic UPDATE returning: 1 row — race won
    mockReturning.mockResolvedValue([{
      id: 'r1',
      promotionDispatchedAt: new Date(),
      promotionDispatchedBy: 'mike@triarchsecurity.com',
    }]);
    (promoteAndAudit as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });

    const res = await POST(buildReq(), { params: Promise.resolve({ id: 'r1' }) });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toEqual({ ok: true });

    // promoteAndAudit called with null Slack params
    expect(promoteAndAudit).toHaveBeenCalledWith({
      release: approvedRelease,
      actorEmail: 'mike@triarchsecurity.com',
      channelId: null,
      messageTs: null,
      slackUserName: null,
    });
  });

  it('200 with ok:false on dispatch failure — atomic UPDATE happened, promoteAndAudit returns ok:false', async () => {
    (requireStaff as ReturnType<typeof vi.fn>).mockResolvedValue({
      error: null,
      session: staffSession,
      ctx: staffCtx,
    });
    mockSelectWhere.mockResolvedValue([approvedRelease]);
    // Race won
    mockReturning.mockResolvedValue([{
      id: 'r1',
      promotionDispatchedAt: new Date(),
      promotionDispatchedBy: 'mike@triarchsecurity.com',
    }]);
    // Dispatch failure
    (promoteAndAudit as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      error: 'GitHub workflow not found',
    });

    const res = await POST(buildReq(), { params: Promise.resolve({ id: 'r1' }) });
    // NOT 500 — the request was processed; outcome in body
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe('GitHub workflow not found');
  });
});
