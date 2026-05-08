import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── Mock setup (must be hoisted before module imports) ──────────────────────

// Capture mock fns so tests can control return values and inspect calls
const mockDbSelectFrom = vi.fn();
const mockDbSelectFromWhere = vi.fn();
const mockDbInsertValues = vi.fn();

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn((table: unknown) => ({
        where: (cond: unknown) => mockDbSelectFromWhere(table, cond),
      })),
    })),
    insert: vi.fn(() => ({
      values: (rows: unknown) => {
        mockDbInsertValues(rows);
        return Promise.resolve([]);
      },
    })),
  },
}));

// Import the module under test AFTER mocks are registered.
// This module does NOT exist yet (RED) — tests will fail with "Cannot find module".
import { stampLinksFromCommit } from './link-stamper';

// ── Helpers ─────────────────────────────────────────────────────────────────

const VALID_BUG_UUID  = '11111111-1111-1111-1111-111111111111';
const VALID_BUG_UUID2 = '22222222-2222-2222-2222-222222222222';
const VALID_FEAT_UUID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const RELEASE_UUID    = 'deadbeef-dead-dead-dead-deadbeefdead';
const PROJ_KEY        = 'darksouls-rpg';

/**
 * Configure the db.select().from().where() mock.
 *
 * The stamper issues up to three selects in order:
 *   1. bugReports lookup (inArray)
 *   2. featureRequests lookup (inArray)
 *   3. projects lookup (eq on key)
 *
 * `responses` maps call-index → resolved value for mockDbSelectFromWhere.
 */
function setupSelectResponses(responses: Record<number, unknown[]>) {
  let callIndex = 0;
  mockDbSelectFromWhere.mockImplementation(() => {
    const response = responses[callIndex] ?? [];
    callIndex++;
    return Promise.resolve(response);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── describe block ───────────────────────────────────────────────────────────

describe('stampLinksFromCommit', () => {
  // ── Validation: bug refs ──────────────────────────────────────────────────

  it('valid BUG-{uuid} → 1 release_log_links row with link_type="bug", bug_id=uuid, source="commit"', async () => {
    // bug lookup returns valid row; no features; no externals → no project lookup needed
    setupSelectResponses({ 0: [{ id: VALID_BUG_UUID }], 1: [] });

    const result = await stampLinksFromCommit({
      releaseId: RELEASE_UUID,
      commitMessage: `Fix issue BUG-${VALID_BUG_UUID}`,
      projectKey: PROJ_KEY,
    });

    expect(result.stamped).toBe(1);
    expect(result.dropped).toBe(0);

    const inserted = mockDbInsertValues.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(inserted).toHaveLength(1);
    expect(inserted[0].linkType).toBe('bug');
    expect(inserted[0].bugId).toBe(VALID_BUG_UUID);
    expect(inserted[0].source).toBe('commit');
    expect(inserted[0].releaseId).toBe(RELEASE_UUID);
  });

  it('BUG-{uuid} not in bug_reports → 0 links written', async () => {
    // bug lookup returns empty (unknown ID)
    setupSelectResponses({ 0: [], 1: [] });

    const result = await stampLinksFromCommit({
      releaseId: RELEASE_UUID,
      commitMessage: `Fix issue BUG-${VALID_BUG_UUID}`,
      projectKey: PROJ_KEY,
    });

    expect(result.stamped).toBe(0);
    expect(result.dropped).toBe(1);
    expect(mockDbInsertValues).not.toHaveBeenCalled();
  });

  it('commit with TWO valid BUG-{uuid}s → 2 links written; both bug_ids correct', async () => {
    setupSelectResponses({ 0: [{ id: VALID_BUG_UUID }, { id: VALID_BUG_UUID2 }], 1: [] });

    const result = await stampLinksFromCommit({
      releaseId: RELEASE_UUID,
      commitMessage: `Fix BUG-${VALID_BUG_UUID} and BUG-${VALID_BUG_UUID2}`,
      projectKey: PROJ_KEY,
    });

    expect(result.stamped).toBe(2);
    const inserted = mockDbInsertValues.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(inserted).toHaveLength(2);
    const bugIds = inserted.map((r) => r.bugId);
    expect(bugIds).toContain(VALID_BUG_UUID);
    expect(bugIds).toContain(VALID_BUG_UUID2);
  });

  // ── Validation: feature refs ──────────────────────────────────────────────

  it('valid FEAT-{uuid} → 1 row with link_type="feature", feature_id=uuid', async () => {
    // no bugs; feature lookup valid
    setupSelectResponses({ 0: [], 1: [{ id: VALID_FEAT_UUID }] });

    const result = await stampLinksFromCommit({
      releaseId: RELEASE_UUID,
      commitMessage: `closes FEAT-${VALID_FEAT_UUID}`,
      projectKey: PROJ_KEY,
    });

    expect(result.stamped).toBe(1);
    const inserted = mockDbInsertValues.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(inserted[0].linkType).toBe('feature');
    expect(inserted[0].featureId).toBe(VALID_FEAT_UUID);
    expect(inserted[0].source).toBe('commit');
  });

  it('invalid FEAT-{uuid} (not in feature_requests) → 0 links', async () => {
    setupSelectResponses({ 0: [], 1: [] }); // feature lookup empty

    const result = await stampLinksFromCommit({
      releaseId: RELEASE_UUID,
      commitMessage: `closes FEAT-${VALID_FEAT_UUID}`,
      projectKey: PROJ_KEY,
    });

    expect(result.stamped).toBe(0);
    expect(result.dropped).toBe(1);
    expect(mockDbInsertValues).not.toHaveBeenCalled();
  });

  // ── Validation: external #N refs ──────────────────────────────────────────

  it('commit "fixes #99" with project.github_repo="org/repo" → 1 row with link_type="external", externalUrl correct', async () => {
    // no bugs; no features; project has github_repo
    setupSelectResponses({ 0: [], 1: [], 2: [{ githubRepo: 'org/repo' }] });

    const result = await stampLinksFromCommit({
      releaseId: RELEASE_UUID,
      commitMessage: 'fixes #99',
      projectKey: PROJ_KEY,
    });

    expect(result.stamped).toBe(1);
    const inserted = mockDbInsertValues.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(inserted[0].linkType).toBe('external');
    expect(inserted[0].externalUrl).toBe('https://github.com/org/repo/issues/99');
    expect(inserted[0].bugId).toBeNull();
    expect(inserted[0].featureId).toBeNull();
    expect(inserted[0].source).toBe('commit');
  });

  it('commit "fixes #99" with project.github_repo=null → 0 links (external ref silently dropped)', async () => {
    setupSelectResponses({ 0: [], 1: [], 2: [{ githubRepo: null }] });

    const result = await stampLinksFromCommit({
      releaseId: RELEASE_UUID,
      commitMessage: 'fixes #99',
      projectKey: PROJ_KEY,
    });

    expect(result.stamped).toBe(0);
    expect(result.dropped).toBe(1);
    expect(mockDbInsertValues).not.toHaveBeenCalled();
  });

  it('commit with valid #N AND valid BUG → 2 rows (both kinds coexist)', async () => {
    setupSelectResponses({
      0: [{ id: VALID_BUG_UUID }],  // bug lookup
      1: [],                          // feature lookup
      2: [{ githubRepo: 'org/repo' }], // project lookup for external
    });

    const result = await stampLinksFromCommit({
      releaseId: RELEASE_UUID,
      commitMessage: `BUG-${VALID_BUG_UUID} fixes #42`,
      projectKey: PROJ_KEY,
    });

    expect(result.stamped).toBe(2);
    const inserted = mockDbInsertValues.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(inserted).toHaveLength(2);
    const types = inserted.map((r) => r.linkType);
    expect(types).toContain('bug');
    expect(types).toContain('external');
  });

  // ── Mixed valid + invalid ─────────────────────────────────────────────────

  it('BUG-{valid} + BUG-{invalid} → 1 row (only valid one), stamped=1 dropped=1', async () => {
    // DB only returns VALID_BUG_UUID; VALID_BUG_UUID2 is unknown
    setupSelectResponses({ 0: [{ id: VALID_BUG_UUID }], 1: [] });

    const result = await stampLinksFromCommit({
      releaseId: RELEASE_UUID,
      commitMessage: `BUG-${VALID_BUG_UUID} BUG-${VALID_BUG_UUID2}`,
      projectKey: PROJ_KEY,
    });

    expect(result.stamped).toBe(1);
    expect(result.dropped).toBe(1);
    const inserted = mockDbInsertValues.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(inserted).toHaveLength(1);
    expect(inserted[0].bugId).toBe(VALID_BUG_UUID);
  });

  // ── Dedup ─────────────────────────────────────────────────────────────────

  it('commit "BUG-{uuid} BUG-{uuid}" (same id twice) → 1 row, not 2', async () => {
    setupSelectResponses({ 0: [{ id: VALID_BUG_UUID }], 1: [] });

    const result = await stampLinksFromCommit({
      releaseId: RELEASE_UUID,
      commitMessage: `BUG-${VALID_BUG_UUID} BUG-${VALID_BUG_UUID}`,
      projectKey: PROJ_KEY,
    });

    expect(result.stamped).toBe(1);
    const inserted = mockDbInsertValues.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(inserted).toHaveLength(1);
  });

  it('same external #N twice → 1 external row, not 2', async () => {
    setupSelectResponses({ 0: [], 1: [], 2: [{ githubRepo: 'org/repo' }] });

    const result = await stampLinksFromCommit({
      releaseId: RELEASE_UUID,
      commitMessage: 'fixes #10 closes #10',
      projectKey: PROJ_KEY,
    });

    expect(result.stamped).toBe(1);
    const inserted = mockDbInsertValues.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(inserted).toHaveLength(1);
  });

  // ── Performance / batching ────────────────────────────────────────────────

  it('single inArray call for all candidate bug IDs (mock call count)', async () => {
    // Two distinct valid bug IDs → single batched query
    setupSelectResponses({ 0: [{ id: VALID_BUG_UUID }, { id: VALID_BUG_UUID2 }], 1: [] });

    await stampLinksFromCommit({
      releaseId: RELEASE_UUID,
      commitMessage: `BUG-${VALID_BUG_UUID} BUG-${VALID_BUG_UUID2}`,
      projectKey: PROJ_KEY,
    });

    // mockDbSelectFromWhere is called once per table batch (bugs, features)
    // The bug lookup is call index 0; assert it was called exactly once for bugs
    const callCount = mockDbSelectFromWhere.mock.calls.length;
    // Should be 2 calls total (bugs + features); not one call per bug ID
    expect(callCount).toBeLessThanOrEqual(2);
  });

  it('single inArray call for all candidate feature IDs', async () => {
    // No bugs; one feature
    setupSelectResponses({ 0: [], 1: [{ id: VALID_FEAT_UUID }] });

    await stampLinksFromCommit({
      releaseId: RELEASE_UUID,
      commitMessage: `closes FEAT-${VALID_FEAT_UUID}`,
      projectKey: PROJ_KEY,
    });

    // Feature lookup is call index 1; total calls ≤ 2
    expect(mockDbSelectFromWhere.mock.calls.length).toBeLessThanOrEqual(2);
  });

  it('single project lookup for github_repo (only when external refs present)', async () => {
    setupSelectResponses({ 0: [], 1: [], 2: [{ githubRepo: 'org/repo' }] });

    await stampLinksFromCommit({
      releaseId: RELEASE_UUID,
      commitMessage: 'fixes #7 fixes #8',
      projectKey: PROJ_KEY,
    });

    // Total select calls: bugs(0) + features(1) + projects(1) = 3 max
    expect(mockDbSelectFromWhere.mock.calls.length).toBeLessThanOrEqual(3);
  });

  it('empty commit message → 0 db calls, returns {stamped: 0, dropped: 0}', async () => {
    const result = await stampLinksFromCommit({
      releaseId: RELEASE_UUID,
      commitMessage: '',
      projectKey: PROJ_KEY,
    });

    expect(result).toEqual({ stamped: 0, dropped: 0 });
    expect(mockDbSelectFromWhere).not.toHaveBeenCalled();
    expect(mockDbInsertValues).not.toHaveBeenCalled();
  });

  it('commit with no refs (plain prose) → 0 db calls beyond fast-path return', async () => {
    const result = await stampLinksFromCommit({
      releaseId: RELEASE_UUID,
      commitMessage: 'chore: update dependencies and README',
      projectKey: PROJ_KEY,
    });

    expect(result).toEqual({ stamped: 0, dropped: 0 });
    expect(mockDbSelectFromWhere).not.toHaveBeenCalled();
  });

  // ── Error handling ────────────────────────────────────────────────────────

  it('resolves successfully (does not throw) when DB INSERT throws — stamper is forgiving', async () => {
    // DB responds to selects but INSERT throws
    setupSelectResponses({ 0: [{ id: VALID_BUG_UUID }], 1: [] });
    mockDbInsertValues.mockImplementationOnce(() => {
      throw new Error('DB connection lost');
    });

    // Must resolve, not reject
    await expect(
      stampLinksFromCommit({
        releaseId: RELEASE_UUID,
        commitMessage: `BUG-${VALID_BUG_UUID}`,
        projectKey: PROJ_KEY,
      }),
    ).resolves.toMatchObject({ stamped: 0 });
  });

  it('returns 0 stamped on DB error path', async () => {
    setupSelectResponses({ 0: [{ id: VALID_BUG_UUID }], 1: [] });
    mockDbInsertValues.mockImplementationOnce(() => Promise.reject(new Error('timeout')));

    const result = await stampLinksFromCommit({
      releaseId: RELEASE_UUID,
      commitMessage: `BUG-${VALID_BUG_UUID}`,
      projectKey: PROJ_KEY,
    });

    expect(result.stamped).toBe(0);
  });
});
