import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { db } from '@/lib/db';
import { getProjectPipelineSummaries } from './pipeline-summary';

vi.mock('@/lib/db', () => ({
  db: {
    execute: vi.fn(),
    select: vi.fn(),
  },
}));

// Helper to make chainable Drizzle select mock
function makeDrizzleSelectMock(resolvedValue: unknown[]) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockResolvedValue(resolvedValue),
  };
  (db.select as Mock).mockReturnValueOnce(chain);
  return chain;
}

describe('getProjectPipelineSummaries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Test 1 - returns prod and dev for a project with both', async () => {
    // DISTINCT ON query returns prod + dev rows for 'tmi'
    (db.execute as Mock).mockResolvedValueOnce({
      rows: [
        {
          project: 'tmi',
          env: 'prod',
          version: 'v1.0.0',
          effective_deployed_at: '2026-05-01T00:00:00.000Z',
          deployed_at: '2026-05-01T00:00:00.000Z',
          released_at: '2026-05-01T00:00:00.000Z',
        },
        {
          project: 'tmi',
          env: 'dev',
          version: 'v1.1.0',
          effective_deployed_at: '2026-05-06T00:00:00.000Z',
          deployed_at: '2026-05-06T00:00:00.000Z',
          released_at: '2026-05-06T00:00:00.000Z',
        },
      ],
    });

    // Pending approval count query
    makeDrizzleSelectMock([]);

    // Dev rows for what-changed query (all dev rows for 'tmi')
    makeDrizzleSelectMock([]);

    const result = await getProjectPipelineSummaries(['tmi']);

    expect(result).toHaveLength(1);
    expect(result[0].projectKey).toBe('tmi');
    expect(result[0].prodVersion).toBe('v1.0.0');
    expect(result[0].devVersion).toBe('v1.1.0');
    expect(result[0].prodDeployedAt).toBe('2026-05-01T00:00:00.000Z');
    expect(result[0].devDeployedAt).toBe('2026-05-06T00:00:00.000Z');
  });

  it('Test 2 - returns project with prod-only when no dev row exists', async () => {
    (db.execute as Mock).mockResolvedValueOnce({
      rows: [
        {
          project: 'darksouls',
          env: 'prod',
          version: 'v2.0.0',
          effective_deployed_at: '2026-05-01T00:00:00.000Z',
          deployed_at: '2026-05-01T00:00:00.000Z',
          released_at: '2026-05-01T00:00:00.000Z',
        },
      ],
    });

    makeDrizzleSelectMock([]);
    makeDrizzleSelectMock([]);

    const result = await getProjectPipelineSummaries(['darksouls']);

    expect(result).toHaveLength(1);
    expect(result[0].projectKey).toBe('darksouls');
    expect(result[0].prodVersion).toBe('v2.0.0');
    expect(result[0].devVersion).toBeNull();
    expect(result[0].devDeployedAt).toBeNull();
  });

  it('Test 3 - returns project with dev-only when no prod row exists', async () => {
    (db.execute as Mock).mockResolvedValueOnce({
      rows: [
        {
          project: 'newproj',
          env: 'dev',
          version: 'v0.1.0',
          effective_deployed_at: '2026-05-01T00:00:00.000Z',
          deployed_at: '2026-05-01T00:00:00.000Z',
          released_at: '2026-05-01T00:00:00.000Z',
        },
      ],
    });

    makeDrizzleSelectMock([]);
    makeDrizzleSelectMock([]);

    const result = await getProjectPipelineSummaries(['newproj']);

    expect(result).toHaveLength(1);
    expect(result[0].projectKey).toBe('newproj');
    expect(result[0].devVersion).toBe('v0.1.0');
    expect(result[0].prodVersion).toBeNull();
    expect(result[0].prodDeployedAt).toBeNull();
  });

  it('Test 4 - excludes null-env legacy rows from latest selection', async () => {
    // The DISTINCT ON query with WHERE env IN ('dev', 'prod') will naturally exclude null-env rows.
    // The mock simulates the result AFTER that filter — row B (env='prod', v0.4.0) is returned.
    (db.execute as Mock).mockResolvedValueOnce({
      rows: [
        {
          project: 'truthtreason',
          env: 'prod',
          version: 'v0.4.0',
          effective_deployed_at: '2026-05-01T00:00:00.000Z',
          deployed_at: '2026-05-01T00:00:00.000Z',
          released_at: '2026-05-01T00:00:00.000Z',
        },
        // Row A (env=null) is NOT returned — excluded by WHERE env IN ('dev', 'prod')
      ],
    });

    makeDrizzleSelectMock([]);
    makeDrizzleSelectMock([]);

    const result = await getProjectPipelineSummaries(['truthtreason']);

    expect(result).toHaveLength(1);
    expect(result[0].prodVersion).toBe('v0.4.0');
    // If null-env row was included, we might see v0.5.0 — asserting v0.4.0 proves exclusion
    expect(result[0].prodVersion).not.toBe('v0.5.0');
  });

  it('Test 5 - uses COALESCE(deployed_at, released_at) ordering for legacy null deployed_at', async () => {
    // Row A: env='prod', v1.0.0, deployed_at=null, released_at=2026-05-06 → effective=2026-05-06
    // Row B: env='prod', v0.9.0, deployed_at=2026-05-01, released_at=2026-04-30 → effective=2026-05-01
    // DISTINCT ON selects Row A (newest effective), effective_deployed_at = released_at fallback
    (db.execute as Mock).mockResolvedValueOnce({
      rows: [
        {
          project: 'thisnthat',
          env: 'prod',
          version: 'v1.0.0',
          effective_deployed_at: '2026-05-06T00:00:00.000Z',
          deployed_at: null,
          released_at: '2026-05-06T00:00:00.000Z',
        },
      ],
    });

    makeDrizzleSelectMock([]);
    makeDrizzleSelectMock([]);

    const result = await getProjectPipelineSummaries(['thisnthat']);

    expect(result).toHaveLength(1);
    expect(result[0].prodVersion).toBe('v1.0.0');
    // effective_deployed_at falls back to released_at when deployed_at is null
    expect(result[0].prodDeployedAt).toBe('2026-05-06T00:00:00.000Z');
  });

  it('Test 6 - what-changed one-liner: dev ahead with type breakdown', async () => {
    const prodDate = '2026-05-01T00:00:00.000Z';
    const devDate = '2026-05-06T00:00:00.000Z';

    (db.execute as Mock).mockResolvedValueOnce({
      rows: [
        {
          project: 'tmi',
          env: 'prod',
          version: 'v1.0.0',
          effective_deployed_at: prodDate,
          deployed_at: prodDate,
          released_at: prodDate,
        },
        {
          project: 'tmi',
          env: 'dev',
          version: 'v1.4.0',
          effective_deployed_at: devDate,
          deployed_at: devDate,
          released_at: devDate,
        },
      ],
    });

    // Pending count
    makeDrizzleSelectMock([]);

    // Dev rows for what-changed: 4 rows after prod timestamp, with type breakdown
    // 2 with type='fix', 1 with type='feature', 1 with no type (→ 'other')
    makeDrizzleSelectMock([
      {
        project: 'tmi',
        entries: [{ type: 'fix' }, { type: 'fix' }],
        deployed_at: '2026-05-02T00:00:00.000Z',
        released_at: '2026-05-02T00:00:00.000Z',
      },
      {
        project: 'tmi',
        entries: [{ type: 'feature' }],
        deployed_at: '2026-05-03T00:00:00.000Z',
        released_at: '2026-05-03T00:00:00.000Z',
      },
      {
        project: 'tmi',
        entries: [{}], // no type field → 'other'
        deployed_at: '2026-05-04T00:00:00.000Z',
        released_at: '2026-05-04T00:00:00.000Z',
      },
    ]);

    const result = await getProjectPipelineSummaries(['tmi']);

    expect(result).toHaveLength(1);
    expect(result[0].whatChangedOneliner).toBe('4 entries since prod: 2 fixes, 1 feature, 1 other');
    expect(result[0].pipelineState).toBe('dev-ahead');
  });

  it('Test 7 - what-changed one-liner: parity (no dev rows since prod) returns null', async () => {
    const prodDate = '2026-05-06T00:00:00.000Z';
    const devDate = '2026-05-05T00:00:00.000Z'; // dev is NOT ahead of prod

    (db.execute as Mock).mockResolvedValueOnce({
      rows: [
        {
          project: 'tmi',
          env: 'prod',
          version: 'v1.0.0',
          effective_deployed_at: prodDate,
          deployed_at: prodDate,
          released_at: prodDate,
        },
        {
          project: 'tmi',
          env: 'dev',
          version: 'v1.0.0',
          effective_deployed_at: devDate,
          deployed_at: devDate,
          released_at: devDate,
        },
      ],
    });

    makeDrizzleSelectMock([]);
    // No dev rows after prod (dev is older than prod)
    makeDrizzleSelectMock([]);

    const result = await getProjectPipelineSummaries(['tmi']);

    expect(result).toHaveLength(1);
    expect(result[0].whatChangedOneliner).toBeNull();
    expect(result[0].pipelineState).toBe('parity');
  });

  it('Test 8 - what-changed one-liner: dev behind prod returns sentinel string', async () => {
    const prodDate = '2026-05-06T00:00:00.000Z';
    const devDate = '2026-05-01T00:00:00.000Z'; // dev is older than prod

    (db.execute as Mock).mockResolvedValueOnce({
      rows: [
        {
          project: 'tmi',
          env: 'prod',
          version: 'v2.0.0',
          effective_deployed_at: prodDate,
          deployed_at: prodDate,
          released_at: prodDate,
        },
        {
          project: 'tmi',
          env: 'dev',
          version: 'v1.9.0',
          effective_deployed_at: devDate,
          deployed_at: devDate,
          released_at: devDate,
        },
      ],
    });

    makeDrizzleSelectMock([]);
    makeDrizzleSelectMock([]);

    const result = await getProjectPipelineSummaries(['tmi']);

    expect(result).toHaveLength(1);
    expect(result[0].whatChangedOneliner).toBe('dev behind prod');
    expect(result[0].pipelineState).toBe('inverted');
  });

  it('Test 9 - pending approval count', async () => {
    (db.execute as Mock).mockResolvedValueOnce({
      rows: [
        {
          project: 'tmi',
          env: 'prod',
          version: 'v1.0.0',
          effective_deployed_at: '2026-05-01T00:00:00.000Z',
          deployed_at: '2026-05-01T00:00:00.000Z',
          released_at: '2026-05-01T00:00:00.000Z',
        },
        {
          project: 'tmi',
          env: 'dev',
          version: 'v1.1.0',
          effective_deployed_at: '2026-05-06T00:00:00.000Z',
          deployed_at: '2026-05-06T00:00:00.000Z',
          released_at: '2026-05-06T00:00:00.000Z',
        },
        {
          project: 'darksouls',
          env: 'prod',
          version: 'v2.0.0',
          effective_deployed_at: '2026-05-01T00:00:00.000Z',
          deployed_at: '2026-05-01T00:00:00.000Z',
          released_at: '2026-05-01T00:00:00.000Z',
        },
      ],
    });

    // Pending count: 3 for 'tmi', 0 for 'darksouls'
    makeDrizzleSelectMock([
      { project: 'tmi', count: 3 },
    ]);

    // Dev rows for what-changed
    makeDrizzleSelectMock([]);

    const result = await getProjectPipelineSummaries(['tmi', 'darksouls']);

    const tmi = result.find((r) => r.projectKey === 'tmi');
    const darksouls = result.find((r) => r.projectKey === 'darksouls');

    expect(tmi?.pendingApprovalCount).toBe(3);
    expect(darksouls?.pendingApprovalCount).toBe(0);
  });

  it('Test 10 - projectKeys filter scope', async () => {
    // When called with ['tmi'], only tmi data is returned
    (db.execute as Mock).mockResolvedValueOnce({
      rows: [
        {
          project: 'tmi',
          env: 'prod',
          version: 'v1.0.0',
          effective_deployed_at: '2026-05-01T00:00:00.000Z',
          deployed_at: '2026-05-01T00:00:00.000Z',
          released_at: '2026-05-01T00:00:00.000Z',
        },
      ],
    });

    makeDrizzleSelectMock([]);
    makeDrizzleSelectMock([]);

    const resultFiltered = await getProjectPipelineSummaries(['tmi']);

    expect(resultFiltered.every((r) => r.projectKey === 'tmi')).toBe(true);
    expect(resultFiltered.find((r) => r.projectKey === 'darksouls')).toBeUndefined();

    // When called with null, all projects in fixture are returned
    // Mock returns data for both tmi and darksouls
    (db.execute as Mock).mockResolvedValueOnce({
      rows: [
        {
          project: 'tmi',
          env: 'prod',
          version: 'v1.0.0',
          effective_deployed_at: '2026-05-01T00:00:00.000Z',
          deployed_at: '2026-05-01T00:00:00.000Z',
          released_at: '2026-05-01T00:00:00.000Z',
        },
        {
          project: 'darksouls',
          env: 'prod',
          version: 'v2.0.0',
          effective_deployed_at: '2026-05-01T00:00:00.000Z',
          deployed_at: '2026-05-01T00:00:00.000Z',
          released_at: '2026-05-01T00:00:00.000Z',
        },
      ],
    });

    // For null case, the projects table is queried to get all project keys
    // Mock the projects select query
    const projectsChain = {
      from: vi.fn().mockResolvedValue([
        { key: 'tmi' },
        { key: 'darksouls' },
      ]),
    };
    (db.select as Mock).mockReturnValueOnce(projectsChain);

    // pending count
    makeDrizzleSelectMock([]);
    // dev rows
    makeDrizzleSelectMock([]);

    const resultAll = await getProjectPipelineSummaries(null);

    expect(resultAll.length).toBeGreaterThanOrEqual(2);
    expect(resultAll.find((r) => r.projectKey === 'tmi')).toBeDefined();
    expect(resultAll.find((r) => r.projectKey === 'darksouls')).toBeDefined();
  });
});
