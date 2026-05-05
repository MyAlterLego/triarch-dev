/**
 * Wave 0 RED stubs for src/lib/slack-audit.ts (recordSlackAudit helper).
 * Source file does NOT exist yet; these tests must fail with module-not-found
 * until plan 07-02 lands the implementation.
 *
 * Covers:
 * - payload_hash determinism (same rawBody → same sha256 hex)
 * - audit insert populates all required columns
 * - failure swallow (db throws → recordSlackAudit does NOT throw, calls console.warn)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createHash } from 'node:crypto';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const insertValuesMock = vi.fn();

vi.mock('@/lib/db', () => ({
  db: {
    insert: () => ({ values: (v: unknown) => insertValuesMock(v) }),
  },
}));

vi.mock('@/db/schema', () => ({
  slackActionAudit: { __table: 'slack_action_audit' },
}));

beforeEach(() => {
  insertValuesMock.mockReset();
  insertValuesMock.mockResolvedValue(undefined);
});

describe('recordSlackAudit', () => {
  it('computes payload_hash as sha256 hex of rawBody (deterministic)', async () => {
    const { recordSlackAudit } = await import('@/lib/slack-audit');
    const rawBody = 'token=test&command=%2Ftriarch&text=status+admin';
    const expected = createHash('sha256').update(rawBody).digest('hex');

    await recordSlackAudit({
      actionId: 'slash_status',
      actorEmail: 'mike@triarchsecurity.com',
      actorSlackId: 'U_STAFF',
      rawBody,
      responseStatus: 200,
      latencyMs: 42,
    });

    expect(insertValuesMock).toHaveBeenCalledTimes(1);
    expect(insertValuesMock.mock.calls[0][0].payloadHash).toBe(expected);
  });

  it('inserts all required columns matching slackActionAudit schema', async () => {
    const { recordSlackAudit } = await import('@/lib/slack-audit');
    await recordSlackAudit({
      actionId: 'slack_promote',
      actorEmail: null,
      actorSlackId: 'U_UNMAPPED',
      rawBody: 'payload=...',
      responseStatus: 401,
      latencyMs: 12,
    });

    const args = insertValuesMock.mock.calls[0][0];
    expect(args).toMatchObject({
      actionId: 'slack_promote',
      actorEmail: null,
      actorSlackId: 'U_UNMAPPED',
      responseStatus: 401,
      latencyMs: 12,
    });
    expect(typeof args.payloadHash).toBe('string');
    expect(args.payloadHash).toHaveLength(64); // sha256 hex
  });

  it('does NOT throw when db.insert fails (best-effort per D-08)', async () => {
    insertValuesMock.mockRejectedValueOnce(new Error('db connection refused'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { recordSlackAudit } = await import('@/lib/slack-audit');
    await expect(
      recordSlackAudit({
        actionId: 'slash_deploy',
        actorEmail: 'mike@triarchsecurity.com',
        actorSlackId: 'U_STAFF',
        rawBody: 'x',
        responseStatus: 500,
        latencyMs: 100,
      })
    ).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
