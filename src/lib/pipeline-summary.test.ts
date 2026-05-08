import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { db } from '@/lib/db';
import { getProjectPipelineSummaries, getProjectPipelineDetail } from './pipeline-summary';

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
    // Note: Drizzle select returns camelCase column names (deployedAt, releasedAt)
    makeDrizzleSelectMock([
      {
        project: 'tmi',
        entries: [{ type: 'fix' }, { type: 'fix' }],
        deployedAt: '2026-05-02T00:00:00.000Z',
        releasedAt: '2026-05-02T00:00:00.000Z',
      },
      {
        project: 'tmi',
        entries: [{ type: 'feature' }],
        deployedAt: '2026-05-03T00:00:00.000Z',
        releasedAt: '2026-05-03T00:00:00.000Z',
      },
      {
        project: 'tmi',
        entries: [{}], // no type field → 'other'
        deployedAt: '2026-05-04T00:00:00.000Z',
        releasedAt: '2026-05-04T00:00:00.000Z',
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

describe('getProjectPipelineDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Test 11 - 404-equivalent: project not in projects table → returns null', async () => {
    // Drizzle select for project lookup returns empty array
    const projectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([]),
    };
    (db.select as Mock).mockReturnValueOnce(projectChain);

    const result = await getProjectPipelineDetail('nonexistent');

    expect(result).toBeNull();
  });

  it('Test 12 - happy path: returns summary + rcs + whatChanged + deployHistory', async () => {
    const prodDate = '2026-05-01T00:00:00.000Z';
    const devDate = '2026-05-06T00:00:00.000Z';

    // Project lookup
    const projectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([{ key: 'tmi', name: 'TMI Engine' }]),
    };
    (db.select as Mock).mockReturnValueOnce(projectChain);

    // DISTINCT ON query (called inside getProjectPipelineSummaries)
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
          version: 'v1.1.0',
          effective_deployed_at: devDate,
          deployed_at: devDate,
          released_at: devDate,
        },
      ],
    });

    // Pending count (inside getProjectPipelineSummaries)
    makeDrizzleSelectMock([]);

    // Dev rows for what-changed (inside getProjectPipelineSummaries)
    makeDrizzleSelectMock([]);

    // RC rows (release_logs WHERE env='dev' grouped by branch)
    (db.execute as Mock).mockResolvedValueOnce({
      rows: [
        {
          id: 'rc-1',
          branch: 'main',
          version: 'v1.1.0',
          status: 'approved',
          released_by: 'user@example.com',
          deployed_at: devDate,
          released_at: devDate,
          promotion_dispatched_at: null,
        },
      ],
    });

    // What-changed entries query
    (db.execute as Mock).mockResolvedValueOnce({
      rows: [
        {
          id: 'rc-2',
          branch: 'main',
          version: 'v1.1.0',
          released_by: 'user@example.com',
          deployed_at: devDate,
          released_at: devDate,
          entries: [{ type: 'fix', message: 'Fix login bug' }, { type: 'feature', message: 'Add dashboard' }],
        },
      ],
    });

    // Deploy history query
    (db.execute as Mock).mockResolvedValueOnce({
      rows: [
        {
          id: 'hist-1',
          env: 'prod',
          version: 'v1.0.0',
          deployed_at: prodDate,
          released_at: prodDate,
          released_by: 'admin@example.com',
        },
        {
          id: 'hist-2',
          env: 'dev',
          version: 'v1.1.0',
          deployed_at: devDate,
          released_at: devDate,
          released_by: 'user@example.com',
        },
      ],
    });

    const result = await getProjectPipelineDetail('tmi');

    expect(result).not.toBeNull();
    expect(result!.project).toEqual({ key: 'tmi', name: 'TMI Engine' });
    expect(result!.summary.projectKey).toBe('tmi');
    expect(result!.rcs).toHaveLength(1);
    expect(result!.rcs[0].id).toBe('rc-1');
    expect(result!.rcs[0].status).toBe('approved');
    expect(result!.whatChanged).toHaveLength(2);
    expect(result!.deployHistory).toHaveLength(2);
  });

  it('Test 13 - what-changed empty when dev is in sync with prod', async () => {
    const sameDate = '2026-05-06T00:00:00.000Z';

    // Project lookup
    const projectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([{ key: 'tmi', name: 'TMI Engine' }]),
    };
    (db.select as Mock).mockReturnValueOnce(projectChain);

    // DISTINCT ON query — same prod and dev versions / timestamp
    (db.execute as Mock).mockResolvedValueOnce({
      rows: [
        {
          project: 'tmi',
          env: 'prod',
          version: 'v1.0.0',
          effective_deployed_at: sameDate,
          deployed_at: sameDate,
          released_at: sameDate,
        },
        {
          project: 'tmi',
          env: 'dev',
          version: 'v1.0.0',
          effective_deployed_at: sameDate,
          deployed_at: sameDate,
          released_at: sameDate,
        },
      ],
    });

    // Pending count
    makeDrizzleSelectMock([]);

    // Dev rows for what-changed (empty → parity)
    makeDrizzleSelectMock([]);

    // RC rows (empty)
    (db.execute as Mock).mockResolvedValueOnce({ rows: [] });

    // What-changed entries (empty because parity)
    (db.execute as Mock).mockResolvedValueOnce({ rows: [] });

    // Deploy history
    (db.execute as Mock).mockResolvedValueOnce({ rows: [] });

    const result = await getProjectPipelineDetail('tmi');

    expect(result).not.toBeNull();
    expect(result!.whatChanged).toEqual([]);
    expect(result!.summary.pipelineState).toBe('parity');
  });

  it('Test 14 - what-changed entries are bucketed by type', async () => {
    const prodDate = '2026-05-01T00:00:00.000Z';
    const devDate = '2026-05-06T00:00:00.000Z';

    // Project lookup
    const projectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([{ key: 'tmi', name: 'TMI Engine' }]),
    };
    (db.select as Mock).mockReturnValueOnce(projectChain);

    // DISTINCT ON query
    (db.execute as Mock).mockResolvedValueOnce({
      rows: [
        {
          project: 'tmi', env: 'prod', version: 'v1.0.0',
          effective_deployed_at: prodDate, deployed_at: prodDate, released_at: prodDate,
        },
        {
          project: 'tmi', env: 'dev', version: 'v1.1.0',
          effective_deployed_at: devDate, deployed_at: devDate, released_at: devDate,
        },
      ],
    });

    // Pending count
    makeDrizzleSelectMock([]);
    // Dev rows for what-changed (phase 8 query)
    makeDrizzleSelectMock([]);

    // RC rows
    (db.execute as Mock).mockResolvedValueOnce({ rows: [] });

    // What-changed entries with diverse types
    (db.execute as Mock).mockResolvedValueOnce({
      rows: [
        {
          id: 'row-1',
          branch: 'main',
          version: 'v1.1.0',
          released_by: 'dev@example.com',
          deployed_at: devDate,
          released_at: devDate,
          entries: [
            { type: 'bug', message: 'Fix crash' },
            { type: 'fix', message: 'Fix login' },
            { type: 'bugfix', message: 'Another fix' },
            { type: 'feature', message: 'Add feature A' },
            { type: 'feat', message: 'Add feature B' },
            { message: 'Refactor code' }, // no type → 'other'
            { type: 'chore', message: 'Update deps' }, // unknown → 'other'
          ],
        },
      ],
    });

    // Deploy history
    (db.execute as Mock).mockResolvedValueOnce({ rows: [] });

    const result = await getProjectPipelineDetail('tmi');

    expect(result).not.toBeNull();
    const entries = result!.whatChanged;
    expect(entries).toHaveLength(7);

    const fixes = entries.filter((e) => e.type === 'fix');
    const features = entries.filter((e) => e.type === 'feature');
    const others = entries.filter((e) => e.type === 'other');

    expect(fixes).toHaveLength(3);  // bug, fix, bugfix
    expect(features).toHaveLength(2);  // feature, feat
    expect(others).toHaveLength(2);  // no type, chore
  });

  it('Test 15 - deployHistory limited to 10 prod + 10 dev (sorted desc)', async () => {
    const prodDate = '2026-05-01T00:00:00.000Z';
    const devDate = '2026-05-06T00:00:00.000Z';

    // Project lookup
    const projectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([{ key: 'tmi', name: 'TMI Engine' }]),
    };
    (db.select as Mock).mockReturnValueOnce(projectChain);

    // DISTINCT ON query
    (db.execute as Mock).mockResolvedValueOnce({
      rows: [
        {
          project: 'tmi', env: 'prod', version: 'v1.0.0',
          effective_deployed_at: prodDate, deployed_at: prodDate, released_at: prodDate,
        },
        {
          project: 'tmi', env: 'dev', version: 'v1.1.0',
          effective_deployed_at: devDate, deployed_at: devDate, released_at: devDate,
        },
      ],
    });

    // Pending count
    makeDrizzleSelectMock([]);
    // Dev rows for what-changed
    makeDrizzleSelectMock([]);

    // RC rows
    (db.execute as Mock).mockResolvedValueOnce({ rows: [] });

    // What-changed entries
    (db.execute as Mock).mockResolvedValueOnce({ rows: [] });

    // Build 15 prod + 15 dev rows
    const historyRows = [];
    for (let i = 0; i < 15; i++) {
      const ts = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString();
      historyRows.push({
        id: `prod-${i}`, env: 'prod', version: `v1.${i}.0`,
        deployed_at: ts, released_at: ts, released_by: 'admin@example.com',
      });
    }
    for (let i = 0; i < 15; i++) {
      const ts = new Date(Date.now() - i * 12 * 60 * 60 * 1000).toISOString();
      historyRows.push({
        id: `dev-${i}`, env: 'dev', version: `v1.${i}.0-dev`,
        deployed_at: ts, released_at: ts, released_by: 'dev@example.com',
      });
    }

    (db.execute as Mock).mockResolvedValueOnce({ rows: historyRows });

    const result = await getProjectPipelineDetail('tmi');

    expect(result).not.toBeNull();
    const history = result!.deployHistory;
    expect(history).toHaveLength(20);

    const prodCount = history.filter((h) => h.env === 'prod').length;
    const devCount = history.filter((h) => h.env === 'dev').length;
    expect(prodCount).toBe(10);
    expect(devCount).toBe(10);

    // Should be sorted desc by deployedAt
    for (let i = 1; i < history.length; i++) {
      const prevTs = new Date(history[i - 1].deployedAt ?? history[i - 1].releasedAt).getTime();
      const currTs = new Date(history[i].deployedAt ?? history[i].releasedAt).getTime();
      expect(prevTs).toBeGreaterThanOrEqual(currTs);
    }
  });

  it('Test 16 - rcs sorted by branch maxDeployedAt desc, then by deployedAt desc within branch', async () => {
    const prodDate = '2026-05-01T00:00:00.000Z';
    const devDate = '2026-05-06T00:00:00.000Z';

    // Project lookup
    const projectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([{ key: 'tmi', name: 'TMI Engine' }]),
    };
    (db.select as Mock).mockReturnValueOnce(projectChain);

    // DISTINCT ON query
    (db.execute as Mock).mockResolvedValueOnce({
      rows: [
        {
          project: 'tmi', env: 'prod', version: 'v1.0.0',
          effective_deployed_at: prodDate, deployed_at: prodDate, released_at: prodDate,
        },
        {
          project: 'tmi', env: 'dev', version: 'v1.1.0',
          effective_deployed_at: devDate, deployed_at: devDate, released_at: devDate,
        },
      ],
    });

    // Pending count
    makeDrizzleSelectMock([]);
    // Dev rows for what-changed
    makeDrizzleSelectMock([]);

    // RC rows — multiple branches with mixed timestamps
    // feat/audio deployed more recently (max = 2026-05-05) → should come first as branch group
    // main deployed older (max = 2026-05-03)
    (db.execute as Mock).mockResolvedValueOnce({
      rows: [
        {
          id: 'rc-main-old',
          branch: 'main',
          version: 'v1.0.0',
          status: 'dev',
          released_by: null,
          deployed_at: '2026-05-02T00:00:00.000Z',
          released_at: '2026-05-02T00:00:00.000Z',
          promotion_dispatched_at: null,
        },
        {
          id: 'rc-main-new',
          branch: 'main',
          version: 'v1.1.0',
          status: 'approved',
          released_by: 'dev@example.com',
          deployed_at: '2026-05-03T00:00:00.000Z',
          released_at: '2026-05-03T00:00:00.000Z',
          promotion_dispatched_at: null,
        },
        {
          id: 'rc-audio-new',
          branch: 'feat/audio',
          version: 'v1.2.0',
          status: 'pending_approval',
          released_by: 'qa@example.com',
          deployed_at: '2026-05-05T00:00:00.000Z',
          released_at: '2026-05-05T00:00:00.000Z',
          promotion_dispatched_at: null,
        },
        {
          id: 'rc-audio-old',
          branch: 'feat/audio',
          version: 'v1.1.0',
          status: 'dev',
          released_by: null,
          deployed_at: '2026-05-04T00:00:00.000Z',
          released_at: '2026-05-04T00:00:00.000Z',
          promotion_dispatched_at: null,
        },
      ],
    });

    // What-changed entries
    (db.execute as Mock).mockResolvedValueOnce({ rows: [] });

    // Deploy history
    (db.execute as Mock).mockResolvedValueOnce({ rows: [] });

    const result = await getProjectPipelineDetail('tmi');

    expect(result).not.toBeNull();
    const rcs = result!.rcs;
    expect(rcs).toHaveLength(4);

    // feat/audio has max deployedAt = May 5, main has max = May 3 → feat/audio first
    const firstBranch = rcs[0].branch;
    const secondBranch = rcs[rcs.length - 1].branch;
    // The first two RCs should be feat/audio (more recent branch), last two should be main
    expect(rcs[0].branch).toBe('feat/audio');
    expect(rcs[1].branch).toBe('feat/audio');
    expect(rcs[2].branch).toBe('main');
    expect(rcs[3].branch).toBe('main');

    // Within feat/audio: newest first (May 5 before May 4)
    expect(rcs[0].id).toBe('rc-audio-new');
    expect(rcs[1].id).toBe('rc-audio-old');

    // Within main: newest first (May 3 before May 2)
    expect(rcs[2].id).toBe('rc-main-new');
    expect(rcs[3].id).toBe('rc-main-old');

    void firstBranch; void secondBranch;
  });

  it('Test 17 - rcs include promotionDispatchedAt for in-flight detection', async () => {
    const prodDate = '2026-05-01T00:00:00.000Z';
    const devDate = '2026-05-06T00:00:00.000Z';
    const dispatchTs = '2026-05-06T10:00:00.000Z';

    // Project lookup
    const projectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([{ key: 'tmi', name: 'TMI Engine' }]),
    };
    (db.select as Mock).mockReturnValueOnce(projectChain);

    // DISTINCT ON query
    (db.execute as Mock).mockResolvedValueOnce({
      rows: [
        {
          project: 'tmi', env: 'prod', version: 'v1.0.0',
          effective_deployed_at: prodDate, deployed_at: prodDate, released_at: prodDate,
        },
        {
          project: 'tmi', env: 'dev', version: 'v1.1.0',
          effective_deployed_at: devDate, deployed_at: devDate, released_at: devDate,
        },
      ],
    });

    // Pending count
    makeDrizzleSelectMock([]);
    // Dev rows for what-changed
    makeDrizzleSelectMock([]);

    // RC rows — one with promotionDispatchedAt set (in-flight), one null
    (db.execute as Mock).mockResolvedValueOnce({
      rows: [
        {
          id: 'rc-inflight',
          branch: 'main',
          version: 'v1.1.0',
          status: 'approved',
          released_by: 'dev@example.com',
          deployed_at: devDate,
          released_at: devDate,
          promotion_dispatched_at: dispatchTs,  // in-flight
        },
        {
          id: 'rc-normal',
          branch: 'feat/new',
          version: 'v1.0.5',
          status: 'dev',
          released_by: null,
          deployed_at: '2026-05-03T00:00:00.000Z',
          released_at: '2026-05-03T00:00:00.000Z',
          promotion_dispatched_at: null,
        },
      ],
    });

    // What-changed entries
    (db.execute as Mock).mockResolvedValueOnce({ rows: [] });

    // Deploy history
    (db.execute as Mock).mockResolvedValueOnce({ rows: [] });

    const result = await getProjectPipelineDetail('tmi');

    expect(result).not.toBeNull();
    const rcs = result!.rcs;

    const inflight = rcs.find((r) => r.id === 'rc-inflight');
    const normal = rcs.find((r) => r.id === 'rc-normal');

    expect(inflight).toBeDefined();
    expect(inflight!.promotionDispatchedAt).toBe(dispatchTs);

    expect(normal).toBeDefined();
    expect(normal!.promotionDispatchedAt).toBeNull();
  });
});
