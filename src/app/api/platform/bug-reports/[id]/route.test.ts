import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── Mock setup (must be hoisted before module imports) ──────────────────────

const mockDbSelect = vi.fn();
const mockDbUpdateValues = vi.fn();
const mockDbInsertValues = vi.fn();
const mockTxUpdateValues = vi.fn();
const mockTxInsertValues = vi.fn();

// Map of which workflowTransitions insert call (per tx) should throw (for atomicity test).
let workflowInsertShouldThrow = false;

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: (cond: unknown) => mockDbSelect(cond),
      })),
    })),
    update: vi.fn((table: unknown) => ({
      set: (updates: Record<string, unknown>) => ({
        where: (cond: unknown) => ({
          returning: () => {
            mockDbUpdateValues({ table, updates, cond });
            return Promise.resolve([{ id: 'updated-row', ...updates }]);
          },
        }),
      }),
    })),
    insert: vi.fn(() => ({
      values: (rows: unknown) => {
        const ret = mockDbInsertValues(rows);
        return ret !== undefined ? ret : Promise.resolve([]);
      },
    })),
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      // Mock transaction object with update/insert that record calls and can simulate rollback.
      const tx = {
        update: vi.fn((table: unknown) => ({
          set: (updates: Record<string, unknown>) => ({
            where: (cond: unknown) => ({
              returning: () => {
                mockTxUpdateValues({ table, updates, cond });
                return Promise.resolve([{ id: 'updated-row', ...updates }]);
              },
            }),
          }),
        })),
        insert: vi.fn(() => ({
          values: (rows: Record<string, unknown>) => {
            mockTxInsertValues(rows);
            // The first insert is presumed to be workflowTransitions in our flow.
            // The flag governs whether ANY workflow insert should throw — atomicity test path.
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

// Import AFTER mocks are registered.
import { PATCH } from './route';
import { requireSignedIn } from '@/lib/api-auth';
import { getCurrentUserContext } from '@/lib/auth-context';

// ── Helpers ─────────────────────────────────────────────────────────────────

const BUG_ID = 'bug-id-1';
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
  return { params: Promise.resolve({ id: BUG_ID }) };
}

function setCurrentBug(current: Record<string, unknown>) {
  // db.select().from().where() → returns [current]
  mockDbSelect.mockResolvedValueOnce([current]);
}

beforeEach(() => {
  vi.clearAllMocks();
  workflowInsertShouldThrow = false;
  (requireSignedIn as ReturnType<typeof vi.fn>).mockResolvedValue({ error: null, session: mkSession() });
  (getCurrentUserContext as ReturnType<typeof vi.fn>).mockResolvedValue(mkStaffCtx());
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('PATCH /api/platform/bug-reports/[id] — Phase 36 INCL-03/04 inclusionState support', () => {
  it('Test 1 (happy path): triaged → pending_inclusion writes update + audit row inside tx', async () => {
    setCurrentBug({ id: BUG_ID, project: PROJ, status: 'open', inclusionState: 'triaged' });

    const res = await PATCH(mkRequest({ inclusionState: 'pending_inclusion' }), mkParams());

    expect(res.status).toBe(200);
    // Update happened inside tx
    expect(mockTxUpdateValues).toHaveBeenCalledTimes(1);
    expect(mockTxUpdateValues.mock.calls[0][0].updates.inclusionState).toBe('pending_inclusion');
    // Audit row inside tx
    expect(mockTxInsertValues).toHaveBeenCalledTimes(1);
    const audit = mockTxInsertValues.mock.calls[0][0];
    expect(audit.entityType).toBe('bug_report');
    expect(audit.entityId).toBe(BUG_ID);
    expect(audit.fromStatus).toBe('triaged');
    expect(audit.toStatus).toBe('pending_inclusion');
    expect(audit.transitionedBy).toBe(STAFF_EMAIL);
  });

  it('Test 2 (INCL-05 Remove from build): approved_for_build → pending_inclusion succeeds', async () => {
    setCurrentBug({ id: BUG_ID, project: PROJ, status: 'open', inclusionState: 'approved_for_build' });

    const res = await PATCH(mkRequest({ inclusionState: 'pending_inclusion' }), mkParams());

    expect(res.status).toBe(200);
    expect(mockTxInsertValues).toHaveBeenCalledTimes(1);
    expect(mockTxInsertValues.mock.calls[0][0].toStatus).toBe('pending_inclusion');
  });

  it('Test 3 (invalid transition): triaged → built returns 400, no DB writes', async () => {
    setCurrentBug({ id: BUG_ID, project: PROJ, status: 'open', inclusionState: 'triaged' });

    const res = await PATCH(mkRequest({ inclusionState: 'built' }), mkParams());

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('invalid_transition');
    expect(mockTxUpdateValues).not.toHaveBeenCalled();
    expect(mockTxInsertValues).not.toHaveBeenCalled();
    expect(mockDbUpdateValues).not.toHaveBeenCalled();
  });

  it('Test 4 (auto-only state rejected): built → deployed is rejected as manual entry to deployed', async () => {
    setCurrentBug({ id: BUG_ID, project: PROJ, status: 'open', inclusionState: 'built' });

    const res = await PATCH(mkRequest({ inclusionState: 'deployed' }), mkParams());

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('invalid_transition');
    expect(mockTxUpdateValues).not.toHaveBeenCalled();
    expect(mockTxInsertValues).not.toHaveBeenCalled();
  });

  it('Test 5 (no-op same state): triaged → triaged is 200 but no audit row written', async () => {
    setCurrentBug({ id: BUG_ID, project: PROJ, status: 'open', inclusionState: 'triaged' });

    const res = await PATCH(mkRequest({ inclusionState: 'triaged' }), mkParams());

    expect(res.status).toBe(200);
    // Update should still fire (updatedAt at minimum) but no audit row
    expect(mockTxInsertValues).not.toHaveBeenCalled();
  });

  it('Test 6 (non-member 404): non-staff non-member returns 404, no writes', async () => {
    setCurrentBug({ id: BUG_ID, project: PROJ, status: 'open', inclusionState: 'triaged' });
    (getCurrentUserContext as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mkMemberCtx('different-project'));

    const res = await PATCH(mkRequest({ inclusionState: 'pending_inclusion' }), mkParams());

    expect(res.status).toBe(404);
    expect(mockTxUpdateValues).not.toHaveBeenCalled();
    expect(mockTxInsertValues).not.toHaveBeenCalled();
  });

  it('Test 7 (atomicity): if audit insert throws inside tx, exception propagates (tx rolls back)', async () => {
    setCurrentBug({ id: BUG_ID, project: PROJ, status: 'open', inclusionState: 'triaged' });
    workflowInsertShouldThrow = true;

    await expect(PATCH(mkRequest({ inclusionState: 'pending_inclusion' }), mkParams())).rejects.toThrow(/audit insert/);
  });

  it('Test 8 (multi-field PATCH): status + inclusionState writes both updates AND two audit rows', async () => {
    setCurrentBug({ id: BUG_ID, project: PROJ, status: 'open', inclusionState: 'triaged' });

    const res = await PATCH(
      mkRequest({ status: 'approved', inclusionState: 'pending_inclusion' }),
      mkParams(),
    );

    expect(res.status).toBe(200);
    expect(mockTxUpdateValues).toHaveBeenCalledTimes(1);
    expect(mockTxUpdateValues.mock.calls[0][0].updates.status).toBe('approved');
    expect(mockTxUpdateValues.mock.calls[0][0].updates.inclusionState).toBe('pending_inclusion');
    // Two audit rows: one for status, one for inclusionState
    expect(mockTxInsertValues).toHaveBeenCalledTimes(2);
    const allAudits = mockTxInsertValues.mock.calls.map((c) => c[0]);
    const statusAudit = allAudits.find((a) => a.toStatus === 'approved');
    const inclusionAudit = allAudits.find((a) => a.toStatus === 'pending_inclusion');
    expect(statusAudit).toBeDefined();
    expect(inclusionAudit).toBeDefined();
    expect(statusAudit!.fromStatus).toBe('open');
    expect(inclusionAudit!.fromStatus).toBe('triaged');
  });
});
