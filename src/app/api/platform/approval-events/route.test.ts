import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── Mock setup (hoisted) ────────────────────────────────────────────────────
// Mirrors src/app/api/platform/bug-reports/route.test.ts pattern — record drizzle
// operator calls so we can assert on filter composition without a real DB.

const mockWhere = vi.fn();
const mockEq = vi.fn();
const mockAnd = vi.fn();
const mockLimit = vi.fn();

vi.mock('drizzle-orm', async () => {
  const actual = await vi.importActual<typeof import('drizzle-orm')>('drizzle-orm');
  return {
    ...actual,
    eq: (...args: unknown[]) => {
      mockEq(...args);
      return { __op: 'eq', args };
    },
    and: (...args: unknown[]) => {
      mockAnd(...args);
      return { __op: 'and', args };
    },
    desc: (a: unknown) => ({ __op: 'desc', a }),
  };
});

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(),
  },
}));

vi.mock('@/lib/api-auth', () => ({
  requireStaff: vi.fn(),
}));

import { GET } from './route';
import { requireStaff } from '@/lib/api-auth';
import { db } from '@/lib/db';

function mkReq(qs: string): Parameters<typeof GET>[0] {
  return new (globalThis as unknown as { Request: typeof Request }).Request(
    `http://localhost/api/platform/approval-events${qs}`,
    { method: 'GET' },
  ) as unknown as Parameters<typeof GET>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  (requireStaff as ReturnType<typeof vi.fn>).mockResolvedValue({
    error: null,
    session: { user: { email: 'staff@triarch.dev' } },
    ctx: { isStaff: true, memberships: [] },
  });

  // db.select() → .from() → (.where()?) → .orderBy() → .limit() chain.
  // .limit() resolves to the rows array; mockLimit captures the limit value.
  (db.select as ReturnType<typeof vi.fn>).mockImplementation(() => ({
    from: vi.fn(() => ({
      where: (cond: unknown) => {
        mockWhere(cond);
        return {
          orderBy: () => ({
            limit: (n: number) => {
              mockLimit(n);
              return Promise.resolve([]);
            },
          }),
        };
      },
      orderBy: () => ({
        limit: (n: number) => {
          mockLimit(n);
          return Promise.resolve([]);
        },
      }),
    })),
  }));
});

describe('GET /api/platform/approval-events', () => {
  it('returns 200 with default limit 50 when no params given', async () => {
    const res = await GET(mkReq(''));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.events)).toBe(true);
    expect(typeof body.total).toBe('number');
    expect(mockLimit).toHaveBeenCalledWith(50);
  });

  it('caps limit at 200 when caller requests more (?limit=999)', async () => {
    await GET(mkReq('?limit=999'));
    expect(mockLimit).toHaveBeenCalledWith(200);
  });

  it('honors a sane custom limit (?limit=10)', async () => {
    await GET(mkReq('?limit=10'));
    expect(mockLimit).toHaveBeenCalledWith(10);
  });

  it('falls back to default 50 when ?limit is non-numeric', async () => {
    await GET(mkReq('?limit=abc'));
    expect(mockLimit).toHaveBeenCalledWith(50);
  });

  it('returns the requireStaff error response when non-staff', async () => {
    const { NextResponse } = await import('next/server');
    const err = NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    (requireStaff as ReturnType<typeof vi.fn>).mockResolvedValue({
      error: err,
      session: null,
      ctx: null,
    });
    const res = await GET(mkReq(''));
    expect(res.status).toBe(403);
  });

  it('applies subject_type filter via eq() to the where clause', async () => {
    await GET(mkReq('?subject_type=build_trigger'));
    const eqValues = mockEq.mock.calls.map((c) => c[1]);
    expect(eqValues).toContain('build_trigger');
  });

  it('applies project filter via eq() to the where clause', async () => {
    await GET(mkReq('?project=tmi'));
    const eqValues = mockEq.mock.calls.map((c) => c[1]);
    expect(eqValues).toContain('tmi');
  });

  it('combines subject_type and project filters via and()', async () => {
    await GET(mkReq('?subject_type=build_trigger&project=tmi'));
    const eqValues = mockEq.mock.calls.map((c) => c[1]);
    expect(eqValues).toContain('build_trigger');
    expect(eqValues).toContain('tmi');
    expect(mockAnd).toHaveBeenCalled();
  });

  it('does NOT call .where() when no filters provided (omitted from chain)', async () => {
    await GET(mkReq(''));
    // No where invocation when conditions array is empty — chain skips it.
    expect(mockWhere).not.toHaveBeenCalled();
  });

  it('response total equals rows.length (W-3: derived client-side, no count query)', async () => {
    // Override to return 3 rows
    (db.select as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      from: vi.fn(() => ({
        orderBy: () => ({
          limit: () => Promise.resolve([
            { id: '1', subjectType: 'build_trigger', subjectId: 'p1', decision: 'triggered', surface: 'web', actorEmail: 'a@b', comment: null, metadata: {}, project: 'tmi', createdAt: new Date('2026-05-18T18:00:00Z') },
            { id: '2', subjectType: 'build_trigger', subjectId: 'p2', decision: 'triggered', surface: 'web', actorEmail: 'a@b', comment: null, metadata: {}, project: 'tmi', createdAt: new Date('2026-05-18T17:00:00Z') },
            { id: '3', subjectType: 'build_trigger', subjectId: 'p3', decision: 'triggered', surface: 'web', actorEmail: 'a@b', comment: null, metadata: {}, project: 'tmi', createdAt: new Date('2026-05-18T16:00:00Z') },
          ]),
        }),
      })),
    }));
    const res = await GET(mkReq(''));
    const body = await res.json();
    expect(body.events).toHaveLength(3);
    expect(body.total).toBe(3);
  });

  it('serializes createdAt Date objects to ISO strings', async () => {
    const when = new Date('2026-05-18T18:00:00.000Z');
    (db.select as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      from: vi.fn(() => ({
        orderBy: () => ({
          limit: () => Promise.resolve([
            { id: '1', subjectType: 'build_trigger', subjectId: 'p1', decision: 'triggered', surface: 'web', actorEmail: 'a@b', comment: 'hi', metadata: { mode: 'local_claude' }, project: 'tmi', createdAt: when },
          ]),
        }),
      })),
    }));
    const res = await GET(mkReq(''));
    const body = await res.json();
    expect(body.events[0].createdAt).toBe('2026-05-18T18:00:00.000Z');
  });
});
