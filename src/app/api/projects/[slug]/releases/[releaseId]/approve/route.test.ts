/**
 * Vitest suite for POST /api/projects/[slug]/releases/[releaseId]/approve (RC-05).
 *
 * Asserts:
 * - Successful approve passes branch: release.branch ?? null to notifyReleaseApproved
 * - alreadyApproved short-circuit does NOT call notifyReleaseApproved
 * - Auth failure does NOT call notifyReleaseApproved
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// ── Mocks ────────────────────────────────────────────────────────────────

const requireSignedInMock = vi.fn();
vi.mock('@/lib/api-auth', () => ({
  requireSignedIn: (...args: unknown[]) => requireSignedInMock(...args),
}));

const getCurrentUserContextMock = vi.fn();
vi.mock('@/lib/auth-context', () => ({
  getCurrentUserContext: (...args: unknown[]) => getCurrentUserContextMock(...args),
}));

const approveReleaseMock = vi.fn();
vi.mock('@/lib/release-actions', () => ({
  approveRelease: (...args: unknown[]) => approveReleaseMock(...args),
}));

const notifyReleaseApprovedMock = vi.fn();
vi.mock('@/lib/slack', () => ({
  notifyReleaseApproved: (...args: unknown[]) => notifyReleaseApprovedMock(...args),
}));

// db: select().from().where() chain returning either a project row or a release row.
// The route makes two select calls: project lookup, then release lookup, then feedback rows.
const projectSelectResult = vi.fn();
const releaseSelectResult = vi.fn();
const feedbackSelectResult = vi.fn();
let selectCallCount = 0;
vi.mock('@/lib/db', () => ({
  db: {
    select: (..._args: unknown[]) => ({
      from: (_table: unknown) => ({
        where: (..._w: unknown[]) => {
          selectCallCount += 1;
          if (selectCallCount === 1) return Promise.resolve(projectSelectResult());
          if (selectCallCount === 2) return Promise.resolve(releaseSelectResult());
          return {
            orderBy: () => Promise.resolve(feedbackSelectResult()),
          };
        },
      }),
    }),
  },
}));

vi.mock('@/db/schema', async () => {
  const actual = await vi.importActual<typeof import('@/db/schema')>('@/db/schema');
  return {
    releaseLogs: actual.releaseLogs,
    projects: actual.projects,
    releaseFeedback: actual.releaseFeedback,
  };
});

// ── Fixtures ─────────────────────────────────────────────────────────────

const SIGNED_IN_OK = { error: null, session: { user: { email: 'mike@triarchsecurity.com' } } };
const STAFF_CTX = {
  email: 'mike@triarchsecurity.com',
  isStaff: true,
  memberships: [],
};
const PROJECT_ROW = { key: 'truth-treason' };
const RELEASE_ROW_WITH_BRANCH = {
  id: 'rel-uuid-1',
  project: 'truth-treason',
  version: 'v0.4.2',
  status: 'dev',
  branch: 'feat/audio',
  // ... other fields don't matter for these tests
};
const RELEASE_ROW_NULL_BRANCH = { ...RELEASE_ROW_WITH_BRANCH, id: 'rel-uuid-2', branch: null };

const APPROVE_RESULT_FRESH = {
  ok: true,
  alreadyApproved: false,
  release: { id: 'rel-uuid-1', status: 'approved' },
  approval: {
    id: 'app-uuid',
    releaseId: 'rel-uuid-1',
    approverEmail: 'mike@triarchsecurity.com',
    decision: 'approved',
    approvedAt: new Date(),
    reason: null,
    ipAddress: null,
    userAgent: null,
  },
};

function buildRequest(slug = 'truth-treason', releaseId = 'rel-uuid-1') {
  return {
    req: new NextRequest(
      new URL(`http://localhost/api/projects/${slug}/releases/${releaseId}/approve`),
      { method: 'POST', headers: { 'Content-Type': 'application/json' } }
    ),
    params: Promise.resolve({ slug, releaseId }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  selectCallCount = 0;
  requireSignedInMock.mockResolvedValue(SIGNED_IN_OK);
  getCurrentUserContextMock.mockResolvedValue(STAFF_CTX);
  projectSelectResult.mockReturnValue([PROJECT_ROW]);
  releaseSelectResult.mockReturnValue([RELEASE_ROW_WITH_BRANCH]);
  feedbackSelectResult.mockReturnValue([]);
  approveReleaseMock.mockResolvedValue(APPROVE_RESULT_FRESH);
  notifyReleaseApprovedMock.mockResolvedValue({ ok: true, ts: '1700000000.000100' });
});

describe('POST /api/projects/[slug]/releases/[releaseId]/approve (RC-05)', () => {
  it('passes branch=release.branch to notifyReleaseApproved on fresh approve', async () => {
    const { POST } = await import('./route');
    const { req, params } = buildRequest();
    const res = await POST(req, { params });

    expect(res.status).toBe(200);
    expect(notifyReleaseApprovedMock).toHaveBeenCalledTimes(1);
    const args = notifyReleaseApprovedMock.mock.calls[0][0];
    expect(args.branch).toBe('feat/audio');
    expect(args.project).toBe('truth-treason');
    expect(args.version).toBe('v0.4.2');
    expect(args.approverEmail).toBe('mike@triarchsecurity.com');
  });

  it('passes branch=null when release.branch is null', async () => {
    releaseSelectResult.mockReturnValue([RELEASE_ROW_NULL_BRANCH]);
    const { POST } = await import('./route');
    const { req, params } = buildRequest('truth-treason', 'rel-uuid-2');
    await POST(req, { params });

    expect(notifyReleaseApprovedMock).toHaveBeenCalledTimes(1);
    expect(notifyReleaseApprovedMock.mock.calls[0][0].branch).toBeNull();
  });

  it('does NOT call notifyReleaseApproved on idempotent re-approve (alreadyApproved=true)', async () => {
    approveReleaseMock.mockResolvedValue({
      ...APPROVE_RESULT_FRESH,
      alreadyApproved: true,
    });
    const { POST } = await import('./route');
    const { req, params } = buildRequest();
    const res = await POST(req, { params });

    expect(res.status).toBe(200);
    expect(notifyReleaseApprovedMock).not.toHaveBeenCalled();
  });

  it('returns auth error and does NOT call notifyReleaseApproved when not signed in', async () => {
    requireSignedInMock.mockResolvedValue({
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
      session: null,
    });
    const { POST } = await import('./route');
    const { req, params } = buildRequest();
    const res = await POST(req, { params });

    expect(res.status).toBe(401);
    expect(approveReleaseMock).not.toHaveBeenCalled();
    expect(notifyReleaseApprovedMock).not.toHaveBeenCalled();
  });
});
