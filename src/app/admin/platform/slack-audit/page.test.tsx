/**
 * Wave 0 RED stub for SlackAuditPage RSC.
 * Source page.tsx does NOT exist yet; tests must fail until plan 07-05 lands.
 *
 * Covers:
 * - Non-staff is redirected away
 * - Staff renders SlackAuditClient with initial rows
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const getServerSessionMock = vi.fn();
const getCurrentUserContextMock = vi.fn();
const redirectMock = vi.fn((_url: string) => {
  throw new Error('NEXT_REDIRECT');
});

vi.mock('next-auth', () => ({
  getServerSession: (...args: unknown[]) => getServerSessionMock(...args),
}));

vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirectMock(url),
}));

vi.mock('@/lib/auth-context', () => ({
  getCurrentUserContext: (...args: unknown[]) => getCurrentUserContextMock(...args),
}));

vi.mock('@/lib/auth', () => ({
  authOptions: {},
}));

let auditRows: unknown[] = [];
vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({
            limit: () => ({
              offset: () => Promise.resolve(auditRows),
            }),
          }),
        }),
      }),
    }),
  },
}));

beforeEach(() => {
  getServerSessionMock.mockReset();
  getCurrentUserContextMock.mockReset();
  redirectMock.mockClear();
  auditRows = [];
});

describe('SlackAuditPage (server component)', () => {
  it('redirects non-staff users away from the page', async () => {
    getServerSessionMock.mockResolvedValue({ user: { email: 'customer@example.com' } });
    getCurrentUserContextMock.mockResolvedValue({
      email: 'customer@example.com',
      isStaff: false,
      memberships: [],
    });

    const Page = (await import('@/app/admin/platform/slack-audit/page')).default;
    await expect(Page({ searchParams: Promise.resolve({}) } as never)).rejects.toThrow(/NEXT_REDIRECT/);
    expect(redirectMock).toHaveBeenCalledTimes(1);
  });

  it('staff session renders with initial audit rows', async () => {
    getServerSessionMock.mockResolvedValue({ user: { email: 'mike@triarchsecurity.com' } });
    getCurrentUserContextMock.mockResolvedValue({
      email: 'mike@triarchsecurity.com',
      isStaff: true,
      memberships: [{ project_key: '*', role: 'staff' }],
    });
    auditRows = Array.from({ length: 5 }, (_, i) => ({
      id: `row-${i}`,
      actionId: 'slack_promote',
      actorEmail: 'mike@triarchsecurity.com',
      actorSlackId: 'U_STAFF',
      payloadHash: 'a'.repeat(64),
      responseStatus: 200,
      latencyMs: 50,
      createdAt: new Date(),
    }));

    const Page = (await import('@/app/admin/platform/slack-audit/page')).default;
    const out = await Page({ searchParams: Promise.resolve({}) } as never);
    expect(out).toBeTruthy();
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
