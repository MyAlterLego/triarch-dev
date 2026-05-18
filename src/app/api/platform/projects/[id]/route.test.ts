import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── Mock setup (must be hoisted before module imports) ──────────────────────

const mockDbUpdateValues = vi.fn();

vi.mock('@/lib/db', () => ({
  db: {
    update: vi.fn((table: unknown) => ({
      set: (updates: Record<string, unknown>) => ({
        where: (cond: unknown) => ({
          returning: () => {
            mockDbUpdateValues({ table, updates, cond });
            return Promise.resolve([{ id: 'proj-1', ...updates }]);
          },
        }),
      }),
    })),
    delete: vi.fn(() => ({
      where: () => ({
        returning: () => Promise.resolve([{ id: 'proj-1' }]),
      }),
    })),
  },
}));

vi.mock('@/lib/api-auth', () => ({
  requireStaff: vi.fn(),
}));

// Import AFTER mocks are registered.
import { PUT } from './route';
import { requireStaff } from '@/lib/api-auth';

// ── Helpers ─────────────────────────────────────────────────────────────────

const PROJ_ID = 'proj-1';

function mkRequest(body: Record<string, unknown>) {
  return { json: async () => body } as unknown as Parameters<typeof PUT>[0];
}

function mkParams() {
  return { params: Promise.resolve({ id: PROJ_ID }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  (requireStaff as ReturnType<typeof vi.fn>).mockResolvedValue({ error: null });
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('PUT /api/platform/projects/[id] — buildTriggerMode + localPath (Phase 37 TRIG-05)', () => {
  it("accepts buildTriggerMode='manual' and persists it", async () => {
    const res = await PUT(mkRequest({ buildTriggerMode: 'manual' }), mkParams());

    expect(res.status).toBe(200);
    expect(mockDbUpdateValues).toHaveBeenCalledTimes(1);
    expect(mockDbUpdateValues.mock.calls[0][0].updates.buildTriggerMode).toBe('manual');
  });

  it("accepts buildTriggerMode='local_claude' and persists it", async () => {
    const res = await PUT(mkRequest({ buildTriggerMode: 'local_claude' }), mkParams());

    expect(res.status).toBe(200);
    expect(mockDbUpdateValues.mock.calls[0][0].updates.buildTriggerMode).toBe('local_claude');
  });

  it('returns 400 when buildTriggerMode is not in the 3-value allowlist', async () => {
    const res = await PUT(mkRequest({ buildTriggerMode: 'evil_mode' }), mkParams());

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('invalid_build_trigger_mode');
    expect(mockDbUpdateValues).not.toHaveBeenCalled();
  });

  it('accepts localPath as a string and persists it', async () => {
    const res = await PUT(mkRequest({ localPath: '/Users/mike/projects/tmi' }), mkParams());

    expect(res.status).toBe(200);
    expect(mockDbUpdateValues.mock.calls[0][0].updates.localPath).toBe('/Users/mike/projects/tmi');
  });

  it('accepts localPath as null (explicit clear) and persists it', async () => {
    const res = await PUT(mkRequest({ localPath: null }), mkParams());

    expect(res.status).toBe(200);
    expect(mockDbUpdateValues).toHaveBeenCalledTimes(1);
    expect(mockDbUpdateValues.mock.calls[0][0].updates).toHaveProperty('localPath', null);
  });

  it('existing field (name) update is unaffected by Phase 37 additions', async () => {
    const res = await PUT(mkRequest({ name: 'New Name' }), mkParams());

    expect(res.status).toBe(200);
    expect(mockDbUpdateValues.mock.calls[0][0].updates.name).toBe('New Name');
    expect(mockDbUpdateValues.mock.calls[0][0].updates).not.toHaveProperty('buildTriggerMode');
    expect(mockDbUpdateValues.mock.calls[0][0].updates).not.toHaveProperty('localPath');
  });
});
