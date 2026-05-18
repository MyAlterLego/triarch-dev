import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── Mock setup (must be hoisted before module imports) ──────────────────────

const mockDbSelect = vi.fn();
const mockTxUpdateValues = vi.fn();
const mockTxInsertValues = vi.fn();

let workflowInsertShouldThrow = false;

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: (cond: unknown) => mockDbSelect(cond),
      })),
    })),
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        update: vi.fn(() => ({
          set: (updates: Record<string, unknown>) => ({
            where: () => ({
              returning: () => {
                mockTxUpdateValues({ updates });
                return Promise.resolve([{ id: 'updated-row', ...updates }]);
              },
            }),
          }),
        })),
        insert: vi.fn(() => ({
          values: (rows: Record<string, unknown>) => {
            mockTxInsertValues(rows);
            if (workflowInsertShouldThrow) {
              return Promise.reject(new Error('simulated audit insert failure'));
            }
            return Promise.resolve([]);
          },
        })),
      };
      return fn(tx);
    }),
  },
}));

vi.mock('@/lib/api-auth', () => ({
  requireSignedIn: vi.fn(),
}));

vi.mock('@/lib/auth-context', () => ({
  getCurrentUserContext: vi.fn(),
}));

import { PATCH } from './route';
import { requireSignedIn } from '@/lib/api-auth';
import { getCurrentUserContext } from '@/lib/auth-context';

// ── Helpers ─────────────────────────────────────────────────────────────────

const FEAT_ID = 'feat-id-1';
const PROJ = 'darksouls-rpg';
const STAFF_EMAIL = 'staff@triarch.dev';

function mkSession() {
  return { user: { email: STAFF_EMAIL } };
}

function mkStaffCtx() {
  return { isStaff: true, memberships: [] };
}

function mkMemberCtx(project = PROJ) {
  return { isStaff: false, memberships: [{ project_key: project, role: 'admin' }] };
}

function mkRequest(body: Record<string, unknown>) {
  return { json: async () => body } as unknown as Parameters<typeof PATCH>[0];
}

function mkParams() {
  return { params: Promise.resolve({ id: FEAT_ID }) };
}

function setCurrentFeature(current: Record<string, unknown>) {
  mockDbSelect.mockResolvedValueOnce([current]);
}

beforeEach(() => {
  vi.clearAllMocks();
  workflowInsertShouldThrow = false;
  (requireSignedIn as ReturnType<typeof vi.fn>).mockResolvedValue({ error: null, session: mkSession() });
  (getCurrentUserContext as ReturnType<typeof vi.fn>).mockResolvedValue(mkStaffCtx());
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('PATCH /api/platform/feature-requests/[id] — Phase 36 INCL-03/04 inclusionState support', () => {
  it('Test 1 (happy path): triaged → pending_inclusion writes update + audit row inside tx', async () => {
    setCurrentFeature({ id: FEAT_ID, project: PROJ, status: 'open', inclusionState: 'triaged' });

    const res = await PATCH(mkRequest({ inclusionState: 'pending_inclusion' }), mkParams());

    expect(res.status).toBe(200);
    expect(mockTxUpdateValues).toHaveBeenCalledTimes(1);
    expect(mockTxUpdateValues.mock.calls[0][0].updates.inclusionState).toBe('pending_inclusion');
    expect(mockTxInsertValues).toHaveBeenCalledTimes(1);
    const audit = mockTxInsertValues.mock.calls[0][0];
    expect(audit.entityType).toBe('feature_request');
    expect(audit.entityId).toBe(FEAT_ID);
    expect(audit.fromStatus).toBe('triaged');
    expect(audit.toStatus).toBe('pending_inclusion');
    expect(audit.transitionedBy).toBe(STAFF_EMAIL);
  });

  it('Test 2 (INCL-05 Remove from build): approved_for_build → pending_inclusion succeeds', async () => {
    setCurrentFeature({ id: FEAT_ID, project: PROJ, status: 'open', inclusionState: 'approved_for_build' });

    const res = await PATCH(mkRequest({ inclusionState: 'pending_inclusion' }), mkParams());

    expect(res.status).toBe(200);
    expect(mockTxInsertValues).toHaveBeenCalledTimes(1);
    expect(mockTxInsertValues.mock.calls[0][0].toStatus).toBe('pending_inclusion');
  });

  it('Test 3 (invalid transition): triaged → built returns 400, no DB writes', async () => {
    setCurrentFeature({ id: FEAT_ID, project: PROJ, status: 'open', inclusionState: 'triaged' });

    const res = await PATCH(mkRequest({ inclusionState: 'built' }), mkParams());

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('invalid_transition');
    expect(mockTxUpdateValues).not.toHaveBeenCalled();
    expect(mockTxInsertValues).not.toHaveBeenCalled();
  });

  it('Test 4 (non-member 404): non-staff non-member returns 404, no writes', async () => {
    setCurrentFeature({ id: FEAT_ID, project: PROJ, status: 'open', inclusionState: 'triaged' });
    (getCurrentUserContext as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mkMemberCtx('different-project'));

    const res = await PATCH(mkRequest({ inclusionState: 'pending_inclusion' }), mkParams());

    expect(res.status).toBe(404);
    expect(mockTxUpdateValues).not.toHaveBeenCalled();
    expect(mockTxInsertValues).not.toHaveBeenCalled();
  });

  it('Test 5 (atomicity): if audit insert throws inside tx, exception propagates (tx rolls back)', async () => {
    setCurrentFeature({ id: FEAT_ID, project: PROJ, status: 'open', inclusionState: 'triaged' });
    workflowInsertShouldThrow = true;

    await expect(PATCH(mkRequest({ inclusionState: 'pending_inclusion' }), mkParams())).rejects.toThrow(/audit insert/);
  });

  it('Test 6 (multi-field PATCH): status + inclusionState writes both updates AND two audit rows', async () => {
    setCurrentFeature({ id: FEAT_ID, project: PROJ, status: 'open', inclusionState: 'triaged' });

    const res = await PATCH(
      mkRequest({ status: 'approved', inclusionState: 'pending_inclusion' }),
      mkParams(),
    );

    expect(res.status).toBe(200);
    expect(mockTxUpdateValues).toHaveBeenCalledTimes(1);
    expect(mockTxUpdateValues.mock.calls[0][0].updates.status).toBe('approved');
    expect(mockTxUpdateValues.mock.calls[0][0].updates.inclusionState).toBe('pending_inclusion');
    expect(mockTxInsertValues).toHaveBeenCalledTimes(2);
    const allAudits = mockTxInsertValues.mock.calls.map((c) => c[0]);
    const statusAudit = allAudits.find((a) => a.toStatus === 'approved');
    const inclusionAudit = allAudits.find((a) => a.toStatus === 'pending_inclusion');
    expect(statusAudit).toBeDefined();
    expect(inclusionAudit).toBeDefined();
    expect(statusAudit!.entityType).toBe('feature_request');
    expect(inclusionAudit!.entityType).toBe('feature_request');
  });
});
