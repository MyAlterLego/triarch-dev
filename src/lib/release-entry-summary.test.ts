import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { db } from '@/lib/db';
import {
  getEntryTypeSummaryForProject,
  getWhatsComingToProd,
} from './release-entry-summary';
import { getProjectPipelineSummaries } from './pipeline-summary';

// ── Mock db ──────────────────────────────────────────────────────────────────

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(),
    execute: vi.fn(),
  },
}));

// ── Mock pipeline-summary ────────────────────────────────────────────────────

vi.mock('./pipeline-summary', () => ({
  getProjectPipelineSummaries: vi.fn(),
}));

// ── Mock db/schema ───────────────────────────────────────────────────────────

vi.mock('@/db/schema', () => ({
  releaseLogLinks: { releaseId: 'releaseId', linkType: 'linkType' },
  releaseLogs: {
    id: 'id',
    project: 'project',
    env: 'env',
    deployedAt: 'deployedAt',
    releasedAt: 'releasedAt',
  },
}));

// ── Drizzle chain builder ────────────────────────────────────────────────────

function makeSelectChain(resolvedValue: unknown[]) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(resolvedValue),
  };
  (db.select as Mock).mockReturnValueOnce(chain);
  return chain;
}

function makeExecuteChain(rows: unknown[]) {
  (db.execute as Mock).mockResolvedValueOnce({ rows });
}

// ── Fixture helpers ──────────────────────────────────────────────────────────

const PROJECT_KEY = 'tmi';

const R1 = '00000000-0000-0000-0000-000000000001';
const R2 = '00000000-0000-0000-0000-000000000002';
const R3 = '00000000-0000-0000-0000-000000000003';

const PROD_TS = '2026-05-01T00:00:00.000Z';
const DEV_TS_1 = '2026-05-03T00:00:00.000Z';
const DEV_TS_2 = '2026-05-04T00:00:00.000Z';
const DEV_TS_3 = '2026-05-05T00:00:00.000Z';

// ─────────────────────────────────────────────────────────────────────────────
// getEntryTypeSummaryForProject
// ─────────────────────────────────────────────────────────────────────────────

describe('getEntryTypeSummaryForProject', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Test 1 (happy): release with 1 bug-link + 1 feature-link returns correct counts', async () => {
    makeSelectChain([
      { releaseId: R1, linkType: 'bug' },
      { releaseId: R1, linkType: 'feature' },
    ]);

    const result = await getEntryTypeSummaryForProject(PROJECT_KEY, [R1]);

    expect(result.size).toBe(1);
    const counts = result.get(R1);
    expect(counts).toBeDefined();
    expect(counts!.fixes).toBe(1);
    expect(counts!.features).toBe(1);
    expect(counts!.other).toBe(0);
    expect(counts!.total).toBe(2);
  });

  it('Test 2 (no links): release with no release_log_links rows returns zero counts', async () => {
    makeSelectChain([]);

    const result = await getEntryTypeSummaryForProject(PROJECT_KEY, [R1]);

    // R1 not in the map — caller treats absent entries as "other"
    expect(result.size).toBe(0);
  });

  it('Test 3 (external-only links): release with only external linkType has total: 0', async () => {
    makeSelectChain([
      { releaseId: R1, linkType: 'external' },
      { releaseId: R1, linkType: 'external' },
    ]);

    const result = await getEntryTypeSummaryForProject(PROJECT_KEY, [R1]);

    // External links do NOT count toward typed counts
    // R1 still in map but with zero typed counts
    const counts = result.get(R1);
    expect(counts).toBeDefined();
    expect(counts!.fixes).toBe(0);
    expect(counts!.features).toBe(0);
    expect(counts!.other).toBe(0);
    expect(counts!.total).toBe(0);
  });

  it('Test 4 (multi-link): 3 bug links + 1 external returns fixes: 3, total: 3', async () => {
    makeSelectChain([
      { releaseId: R1, linkType: 'bug' },
      { releaseId: R1, linkType: 'bug' },
      { releaseId: R1, linkType: 'bug' },
      { releaseId: R1, linkType: 'external' },
    ]);

    const result = await getEntryTypeSummaryForProject(PROJECT_KEY, [R1]);

    const counts = result.get(R1);
    expect(counts!.fixes).toBe(3);
    expect(counts!.features).toBe(0);
    expect(counts!.other).toBe(0);
    expect(counts!.total).toBe(3);
  });

  it('Test 5 (empty releaseIds): returns empty Map', async () => {
    const result = await getEntryTypeSummaryForProject(PROJECT_KEY, []);

    expect(result.size).toBe(0);
    // db.select should NOT have been called (no-op fast path)
    expect(db.select).not.toHaveBeenCalled();
  });

  it('Test 6 (cross-project): releaseIds from multiple projects still groups by releaseId correctly', async () => {
    // R1 has a bug link; R2 has a feature link — both returned from the inArray query
    makeSelectChain([
      { releaseId: R1, linkType: 'bug' },
      { releaseId: R2, linkType: 'feature' },
    ]);

    const result = await getEntryTypeSummaryForProject(PROJECT_KEY, [R1, R2]);

    expect(result.size).toBe(2);
    expect(result.get(R1)!.fixes).toBe(1);
    expect(result.get(R1)!.features).toBe(0);
    expect(result.get(R2)!.fixes).toBe(0);
    expect(result.get(R2)!.features).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getWhatsComingToProd
// ─────────────────────────────────────────────────────────────────────────────

describe('getWhatsComingToProd', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Test 7 (parity): pipelineState=parity returns hasDelta: false, zero counts', async () => {
    (getProjectPipelineSummaries as Mock).mockResolvedValueOnce([
      {
        projectKey: PROJECT_KEY,
        pipelineState: 'parity',
        prodDeployedAt: PROD_TS,
        devDeployedAt: PROD_TS,
        prodVersion: 'v1.0.0',
        devVersion: 'v1.0.0',
        pendingApprovalCount: 0,
        whatChangedOneliner: null,
      },
    ]);

    const result = await getWhatsComingToProd(PROJECT_KEY);

    expect(result.hasDelta).toBe(false);
    expect(result.totalEntries).toBe(0);
    expect(result.fixes).toBe(0);
    expect(result.features).toBe(0);
    expect(result.other).toBe(0);
    expect(result.oneliner).toBeNull();
  });

  it('Test 8 (dev-ahead): 4 dev releases after prod cutoff with mixed links returns correct summary', async () => {
    (getProjectPipelineSummaries as Mock).mockResolvedValueOnce([
      {
        projectKey: PROJECT_KEY,
        pipelineState: 'dev-ahead',
        prodDeployedAt: PROD_TS,
        devDeployedAt: DEV_TS_3,
        prodVersion: 'v1.0.0',
        devVersion: 'v1.4.0',
        pendingApprovalCount: 0,
        whatChangedOneliner: '4 entries since prod: 2 fixes, 1 feature, 1 other',
      },
    ]);

    // Dev rows since prod cutoff: 4 releases
    makeExecuteChain([
      { id: R1, deployed_at: DEV_TS_1, released_at: DEV_TS_1 },
      { id: R2, deployed_at: DEV_TS_2, released_at: DEV_TS_2 },
      { id: R3, deployed_at: DEV_TS_3, released_at: DEV_TS_3 },
      { id: '00000000-0000-0000-0000-000000000004', deployed_at: null, released_at: DEV_TS_3 },
    ]);

    // getEntryTypeSummaryForProject inner call — release_log_links for those 4 releaseIds
    // R1: bug → fixes-bucket
    // R2: feature → features-bucket
    // R3: no links → other-bucket (not in result Map)
    // R4: no links → other-bucket (not in result Map)
    makeSelectChain([
      { releaseId: R1, linkType: 'bug' },
      { releaseId: R2, linkType: 'feature' },
    ]);

    const result = await getWhatsComingToProd(PROJECT_KEY);

    expect(result.hasDelta).toBe(true);
    expect(result.totalEntries).toBe(4);
    expect(result.fixes).toBe(1);    // R1
    expect(result.features).toBe(1); // R2
    expect(result.other).toBe(2);    // R3, R4
    expect(result.oneliner).toBe('4 entries since prod: 1 fix, 1 feature, 2 other');
  });

  it('Test 9 (no prod yet): prodDeployedAt=null returns hasDelta: false', async () => {
    (getProjectPipelineSummaries as Mock).mockResolvedValueOnce([
      {
        projectKey: PROJECT_KEY,
        pipelineState: 'parity',
        prodDeployedAt: null,
        devDeployedAt: DEV_TS_1,
        prodVersion: null,
        devVersion: 'v1.0.0',
        pendingApprovalCount: 0,
        whatChangedOneliner: null,
      },
    ]);

    const result = await getWhatsComingToProd(PROJECT_KEY);

    expect(result.hasDelta).toBe(false);
    expect(result.totalEntries).toBe(0);
    expect(result.oneliner).toBeNull();
  });

  it('Test 10 (inverted): pipelineState=inverted returns hasDelta: false', async () => {
    (getProjectPipelineSummaries as Mock).mockResolvedValueOnce([
      {
        projectKey: PROJECT_KEY,
        pipelineState: 'inverted',
        prodDeployedAt: DEV_TS_3,
        devDeployedAt: PROD_TS,
        prodVersion: 'v1.5.0',
        devVersion: 'v1.0.0',
        pendingApprovalCount: 0,
        whatChangedOneliner: 'dev behind prod',
      },
    ]);

    const result = await getWhatsComingToProd(PROJECT_KEY);

    expect(result.hasDelta).toBe(false);
    expect(result.totalEntries).toBe(0);
    expect(result.oneliner).toBeNull();
  });

  it('Test 11 (oneliner formatting): zero-count buckets omitted in one-liner', async () => {
    (getProjectPipelineSummaries as Mock).mockResolvedValueOnce([
      {
        projectKey: PROJECT_KEY,
        pipelineState: 'dev-ahead',
        prodDeployedAt: PROD_TS,
        devDeployedAt: DEV_TS_2,
        prodVersion: 'v1.0.0',
        devVersion: 'v1.3.0',
        pendingApprovalCount: 0,
        whatChangedOneliner: '3 entries since prod: 3 fixes',
      },
    ]);

    // 3 dev releases, all bug-linked → 3 fixes, 0 features, 0 other
    makeExecuteChain([
      { id: R1, deployed_at: DEV_TS_1, released_at: DEV_TS_1 },
      { id: R2, deployed_at: DEV_TS_1, released_at: DEV_TS_1 },
      { id: R3, deployed_at: DEV_TS_2, released_at: DEV_TS_2 },
    ]);

    makeSelectChain([
      { releaseId: R1, linkType: 'bug' },
      { releaseId: R2, linkType: 'bug' },
      { releaseId: R3, linkType: 'bug' },
    ]);

    const result = await getWhatsComingToProd(PROJECT_KEY);

    expect(result.hasDelta).toBe(true);
    expect(result.totalEntries).toBe(3);
    expect(result.fixes).toBe(3);
    expect(result.features).toBe(0);
    expect(result.other).toBe(0);
    // Zero-count buckets must be omitted
    expect(result.oneliner).toBe('3 entries since prod: 3 fixes');
    expect(result.oneliner).not.toContain('feature');
    expect(result.oneliner).not.toContain('other');
  });
});
