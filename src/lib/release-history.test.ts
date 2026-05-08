import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { db } from '@/lib/db';
import { getReleaseHistoryForBug, getReleaseHistoryForFeature } from './release-history';

vi.mock('@/lib/db', () => ({
  db: { select: vi.fn() },
}));

// Mirror pipeline-summary.test.ts mock pattern exactly.
// The Drizzle builder chain: select().from().innerJoin().where().orderBy()
function makeChain(resolvedValue: unknown[]) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockResolvedValue(resolvedValue),
  };
  (db.select as Mock).mockReturnValueOnce(chain);
  return chain;
}

const BUG_ID = '00000000-0000-0000-0000-000000000bb1';
const BUG_ID_2 = '00000000-0000-0000-0000-000000000bb2';
const FEAT_ID = '00000000-0000-0000-0000-000000000ff1';

const RELEASE_LOG_ID_1 = 'aaaaaaaa-0000-0000-0000-000000000001';
const RELEASE_LOG_ID_2 = 'aaaaaaaa-0000-0000-0000-000000000002';
const RELEASE_LOG_ID_3 = 'aaaaaaaa-0000-0000-0000-000000000003';

describe('getReleaseHistoryForBug', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Test 1 - happy/multi-version: bug linked to two release_logs returns both rows most-recent first', async () => {
    // Bug linked to two release_logs: dev v2.4.0 (more recent) and prod v2.3.5 (older)
    makeChain([
      {
        releaseLogId: RELEASE_LOG_ID_1,
        version: 'v2.4.0',
        env: 'dev',
        deployedAt: '2026-05-06T00:00:00.000Z',
        releasedAt: '2026-05-06T00:00:00.000Z',
        projectKey: 'tmi',
      },
      {
        releaseLogId: RELEASE_LOG_ID_2,
        version: 'v2.3.5',
        env: 'prod',
        deployedAt: '2026-05-01T00:00:00.000Z',
        releasedAt: '2026-05-01T00:00:00.000Z',
        projectKey: 'tmi',
      },
    ]);

    const result = await getReleaseHistoryForBug(BUG_ID);

    expect(result).toHaveLength(2);
    // Most recent first
    expect(result[0].releaseLogId).toBe(RELEASE_LOG_ID_1);
    expect(result[0].version).toBe('v2.4.0');
    expect(result[0].env).toBe('dev');
    expect(result[0].deployedAt).toBe('2026-05-06T00:00:00.000Z');
    expect(result[0].releasedAt).toBe('2026-05-06T00:00:00.000Z');
    expect(result[0].projectKey).toBe('tmi');
    expect(result[1].releaseLogId).toBe(RELEASE_LOG_ID_2);
    expect(result[1].version).toBe('v2.3.5');
    expect(result[1].env).toBe('prod');
  });

  it('Test 2 - empty: bugId with zero links returns []', async () => {
    makeChain([]);

    const result = await getReleaseHistoryForBug(BUG_ID_2);

    expect(result).toEqual([]);
  });

  it('Test 3 - ordering: three rows sorted COALESCE(deployedAt, releasedAt) DESC NULLS LAST', async () => {
    // Three rows: two with deployedAt, one with null deployedAt (falls back to releasedAt)
    // Mock returns already in the expected order (SQL handles ordering; test verifies result preserves it)
    makeChain([
      {
        releaseLogId: RELEASE_LOG_ID_1,
        version: 'v3.0.0',
        env: 'dev',
        deployedAt: '2026-05-08T00:00:00.000Z',
        releasedAt: '2026-05-07T00:00:00.000Z',
        projectKey: 'tmi',
      },
      {
        releaseLogId: RELEASE_LOG_ID_2,
        version: 'v2.9.0',
        env: 'prod',
        // null deployedAt: COALESCE falls back to releasedAt = 2026-05-05
        deployedAt: null,
        releasedAt: '2026-05-05T00:00:00.000Z',
        projectKey: 'tmi',
      },
      {
        releaseLogId: RELEASE_LOG_ID_3,
        version: 'v2.8.0',
        env: 'dev',
        deployedAt: '2026-05-01T00:00:00.000Z',
        releasedAt: '2026-05-01T00:00:00.000Z',
        projectKey: 'tmi',
      },
    ]);

    const result = await getReleaseHistoryForBug(BUG_ID);

    expect(result).toHaveLength(3);
    expect(result.map((r) => r.releaseLogId)).toEqual([
      RELEASE_LOG_ID_1,
      RELEASE_LOG_ID_2,
      RELEASE_LOG_ID_3,
    ]);
    // The row with null deployedAt still appears, with deployedAt as null in the result
    expect(result[1].deployedAt).toBeNull();
  });

  it('Test 4 - env split preserved: same version in dev AND prod returns BOTH rows (no dedup)', async () => {
    // v2.5.0 exists in both dev and prod as separate release_logs rows
    makeChain([
      {
        releaseLogId: RELEASE_LOG_ID_1,
        version: 'v2.5.0',
        env: 'dev',
        deployedAt: '2026-05-06T00:00:00.000Z',
        releasedAt: '2026-05-06T00:00:00.000Z',
        projectKey: 'tmi',
      },
      {
        releaseLogId: RELEASE_LOG_ID_2,
        version: 'v2.5.0',
        env: 'prod',
        deployedAt: '2026-05-07T00:00:00.000Z',
        releasedAt: '2026-05-07T00:00:00.000Z',
        projectKey: 'tmi',
      },
    ]);

    const result = await getReleaseHistoryForBug(BUG_ID);

    expect(result).toHaveLength(2);
    // Both rows present with distinct envs
    const envs = result.map((r) => r.env);
    expect(envs).toContain('dev');
    expect(envs).toContain('prod');
    // Same version on both
    expect(result[0].version).toBe('v2.5.0');
    expect(result[1].version).toBe('v2.5.0');
  });
});

describe('getReleaseHistoryForFeature', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Test 5 - happy: feature linked to two release_logs returns both rows, most-recent first', async () => {
    makeChain([
      {
        releaseLogId: RELEASE_LOG_ID_1,
        version: 'v4.1.0',
        env: 'dev',
        deployedAt: '2026-05-07T00:00:00.000Z',
        releasedAt: '2026-05-07T00:00:00.000Z',
        projectKey: 'darksouls',
      },
      {
        releaseLogId: RELEASE_LOG_ID_2,
        version: 'v4.0.0',
        env: 'prod',
        deployedAt: '2026-05-02T00:00:00.000Z',
        releasedAt: '2026-05-02T00:00:00.000Z',
        projectKey: 'darksouls',
      },
    ]);

    const result = await getReleaseHistoryForFeature(FEAT_ID);

    expect(result).toHaveLength(2);
    expect(result[0].releaseLogId).toBe(RELEASE_LOG_ID_1);
    expect(result[0].version).toBe('v4.1.0');
    expect(result[0].env).toBe('dev');
    expect(result[0].projectKey).toBe('darksouls');
    expect(result[1].releaseLogId).toBe(RELEASE_LOG_ID_2);
    expect(result[1].version).toBe('v4.0.0');
    expect(result[1].env).toBe('prod');
  });

  it('Test 6 - empty: featureId with zero links returns []', async () => {
    makeChain([]);

    const result = await getReleaseHistoryForFeature(FEAT_ID);

    expect(result).toEqual([]);
  });

  it('Test 7 - Date to ISO string conversion: mock returns Date objects; result timestamps are ISO strings', async () => {
    const deployDate = new Date('2026-05-06T12:00:00.000Z');
    const releaseDate = new Date('2026-05-05T08:00:00.000Z');

    makeChain([
      {
        releaseLogId: RELEASE_LOG_ID_1,
        version: 'v5.0.0',
        env: 'prod',
        // DB driver may return Date objects — helper must convert to ISO strings
        deployedAt: deployDate,
        releasedAt: releaseDate,
        projectKey: 'tmi',
      },
    ]);

    const result = await getReleaseHistoryForFeature(FEAT_ID);

    expect(result).toHaveLength(1);
    // Both timestamps must be ISO strings, not Date objects
    expect(typeof result[0].deployedAt).toBe('string');
    expect(typeof result[0].releasedAt).toBe('string');
    expect(result[0].deployedAt).toBe('2026-05-06T12:00:00.000Z');
    expect(result[0].releasedAt).toBe('2026-05-05T08:00:00.000Z');
  });
});
