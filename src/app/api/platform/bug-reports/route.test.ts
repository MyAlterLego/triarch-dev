import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── Mock setup (hoisted) ────────────────────────────────────────────────────

const mockWhere = vi.fn();
const mockEq = vi.fn();
const mockAnd = vi.fn();
const mockInArray = vi.fn();

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
    inArray: (...args: unknown[]) => {
      mockInArray(...args);
      return { __op: 'inArray', args };
    },
    desc: (a: unknown) => ({ __op: 'desc', a }),
    sql: Object.assign((...args: unknown[]) => ({ __op: 'sql', args }), { raw: (s: string) => s }),
  };
});

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: (cond: unknown) => {
          mockWhere(cond);
          return {
            orderBy: () => ({
              limit: () => ({
                offset: () => Promise.resolve([]),
              }),
            }),
            // count() chain
            then: undefined,
          };
        },
      })),
    })),
  },
}));

// Second select chain (count) — same builder; just resolves to [{ count: 0 }]
vi.mock('@/lib/api-auth', () => ({
  requireSignedIn: vi.fn(),
}));

vi.mock('@/lib/auth-context', () => ({
  getCurrentUserContext: vi.fn(),
}));

import { GET } from './route';
import { requireSignedIn } from '@/lib/api-auth';
import { getCurrentUserContext } from '@/lib/auth-context';
import { db } from '@/lib/db';

// Helpers
function mkReq(url: string) {
  return { url } as unknown as Parameters<typeof GET>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  (requireSignedIn as ReturnType<typeof vi.fn>).mockResolvedValue({
    error: null,
    session: { user: { email: 'staff@triarch.dev' } },
  });
  (getCurrentUserContext as ReturnType<typeof vi.fn>).mockResolvedValue({
    isStaff: true,
    memberships: [],
  });

  // Override db.select for each test — first call returns rows chain, second returns count chain.
  let callIndex = 0;
  (db.select as ReturnType<typeof vi.fn>).mockImplementation(() => ({
    from: vi.fn(() => ({
      where: (cond: unknown) => {
        mockWhere(cond);
        if (callIndex === 0) {
          callIndex++;
          return {
            orderBy: () => ({
              limit: () => ({
                offset: () => Promise.resolve([]),
              }),
            }),
          };
        }
        // count call
        return Promise.resolve([{ count: 0 }]);
      },
    })),
  }));
});

describe('GET /api/platform/bug-reports — Phase 36 INCL filter (Pitfall 8)', () => {
  it('?inclusion_state=approved_for_build adds eq filter to where clause', async () => {
    const res = await GET(mkReq('http://localhost/api/platform/bug-reports?inclusion_state=approved_for_build'));
    expect(res.status).toBe(200);

    // eq must have been called with the inclusionState value
    const eqCalls = mockEq.mock.calls.map((c) => c[1]);
    expect(eqCalls).toContain('approved_for_build');
  });

  it('?inclusion_state=garbage returns 400 invalid_inclusion_state', async () => {
    const res = await GET(mkReq('http://localhost/api/platform/bug-reports?inclusion_state=garbage'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('invalid_inclusion_state');
  });

  it('GET (no inclusion_state) does NOT add inclusionState filter', async () => {
    const res = await GET(mkReq('http://localhost/api/platform/bug-reports'));
    expect(res.status).toBe(200);

    // No eq call should have used an inclusion-state value
    const eqValues = mockEq.mock.calls.map((c) => c[1]);
    expect(eqValues).not.toContain('approved_for_build');
    expect(eqValues).not.toContain('triaged');
    expect(eqValues).not.toContain('pending_inclusion');
  });
});
