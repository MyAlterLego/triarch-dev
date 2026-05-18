import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── Mock setup (must be hoisted before module imports) ──────────────────────

// Capture mock fns so tests can control return values and inspect calls
const mockDbSelectFrom = vi.fn();
const mockDbSelectFromWhere = vi.fn();
const mockDbInsertValues = vi.fn();
// Phase 36 INCL-06: mocks for the auto-flip UPDATE chain
//   db.update(table).set(updates).where(cond).returning({id})
const mockDbUpdateSet = vi.fn();
const mockDbUpdateWhere = vi.fn();
const mockDbUpdateReturning = vi.fn();

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn((table: unknown) => ({
        where: (cond: unknown) => mockDbSelectFromWhere(table, cond),
      })),
    })),
    insert: vi.fn(() => ({
      values: (rows: unknown) => {
        // mockDbInsertValues returns a promise; default is Promise.resolve([])
        // tests can override with mockDbInsertValues.mockReturnValueOnce(Promise.reject(...))
        const returnVal = mockDbInsertValues(rows);
        return returnVal !== undefined ? returnVal : Promise.resolve([]);
      },
    })),
    update: vi.fn((table: unknown) => ({
      set: (updates: unknown) => {
        mockDbUpdateSet(table, updates);
        return {
          where: (cond: unknown) => {
            mockDbUpdateWhere(table, cond);
            return {
              returning: (cols: unknown) => {
                // Default: returns the entries the test seeded in mockDbUpdateReturning,
                // else an empty array (means "WHERE filter matched no rows" — Pitfall 5 path)
                const returnVal = mockDbUpdateReturning(table, cols);
                return returnVal !== undefined ? returnVal : Promise.resolve([]);
              },
            };
          },
        };
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
    // no bugs in message → bug query skipped; feature is call index 0
    setupSelectResponses({ 0: [{ id: VALID_FEAT_UUID }] });

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
    // no bugs in message → bug query skipped; feature is call index 0 → empty
    setupSelectResponses({ 0: [] }); // feature lookup empty

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
    // no BUG/FEAT refs → bug/feature queries skipped; project lookup is call index 0
    setupSelectResponses({ 0: [{ githubRepo: 'org/repo' }] });

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
    // no BUG/FEAT refs → bug/feature queries skipped; project lookup is call index 0
    setupSelectResponses({ 0: [{ githubRepo: null }] });

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
    // Has BUG ref → bug query is call 0; no FEAT refs → feature query skipped; external → project is call 1
    setupSelectResponses({
      0: [{ id: VALID_BUG_UUID }],     // bug lookup
      1: [{ githubRepo: 'org/repo' }], // project lookup for external (#N)
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
    // no BUG/FEAT refs → project lookup is call index 0
    setupSelectResponses({ 0: [{ githubRepo: 'org/repo' }] });

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
    // No bugs in message → bug query skipped; feature is call index 0
    setupSelectResponses({ 0: [{ id: VALID_FEAT_UUID }] });

    await stampLinksFromCommit({
      releaseId: RELEASE_UUID,
      commitMessage: `closes FEAT-${VALID_FEAT_UUID}`,
      projectKey: PROJ_KEY,
    });

    // Feature lookup is call index 1; total calls ≤ 2
    expect(mockDbSelectFromWhere.mock.calls.length).toBeLessThanOrEqual(2);
  });

  it('single project lookup for github_repo (only when external refs present)', async () => {
    // no BUG/FEAT refs → project lookup is call index 0
    setupSelectResponses({ 0: [{ githubRepo: 'org/repo' }] });

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

    // Phase 36 INCL-06: StampResult extended with autoFlipped + orphanLinks;
    // fast-path returns zero for all four counters.
    expect(result).toEqual({ stamped: 0, dropped: 0, autoFlipped: 0, orphanLinks: 0 });
    expect(mockDbSelectFromWhere).not.toHaveBeenCalled();
    expect(mockDbInsertValues).not.toHaveBeenCalled();
  });

  it('commit with no refs (plain prose) → 0 db calls beyond fast-path return', async () => {
    const result = await stampLinksFromCommit({
      releaseId: RELEASE_UUID,
      commitMessage: 'chore: update dependencies and README',
      projectKey: PROJ_KEY,
    });

    expect(result).toEqual({ stamped: 0, dropped: 0, autoFlipped: 0, orphanLinks: 0 });
    expect(mockDbSelectFromWhere).not.toHaveBeenCalled();
  });

  // ── Error handling ────────────────────────────────────────────────────────

  it('resolves successfully (does not throw) when DB INSERT throws — stamper is forgiving', async () => {
    // DB responds to selects but INSERT rejects
    setupSelectResponses({ 0: [{ id: VALID_BUG_UUID }] });
    mockDbInsertValues.mockReturnValueOnce(Promise.reject(new Error('DB connection lost')));

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
    setupSelectResponses({ 0: [{ id: VALID_BUG_UUID }] });
    mockDbInsertValues.mockReturnValueOnce(Promise.reject(new Error('timeout')));

    const result = await stampLinksFromCommit({
      releaseId: RELEASE_UUID,
      commitMessage: `BUG-${VALID_BUG_UUID}`,
      projectKey: PROJ_KEY,
    });

    expect(result.stamped).toBe(0);
  });

  // ── Phase 36 INCL-06: Auto-flip approved_for_build → built + orphan tracking ──

  it('Test A — auto-flip happy path: BUG in approved_for_build → autoFlipped=1, UPDATE issued, audit row written', async () => {
    // Bug row carries inclusionState=approved_for_build → eligible for flip
    setupSelectResponses({ 0: [{ id: VALID_BUG_UUID, inclusionState: 'approved_for_build' }], 1: [] });
    // UPDATE returns the flipped row id — drives autoFlipped count
    mockDbUpdateReturning.mockReturnValueOnce(Promise.resolve([{ id: VALID_BUG_UUID }]));

    const result = await stampLinksFromCommit({
      releaseId: RELEASE_UUID,
      commitMessage: `Fix issue BUG-${VALID_BUG_UUID}`,
      projectKey: PROJ_KEY,
      commitSha: 'abc123',
    });

    expect(result.stamped).toBe(1);
    expect(result.autoFlipped).toBe(1);
    expect(result.orphanLinks).toBe(0);

    // UPDATE set() called with built + nextReleaseLogId + updatedAt
    expect(mockDbUpdateSet).toHaveBeenCalledTimes(1);
    const setArgs = mockDbUpdateSet.mock.calls[0][1] as Record<string, unknown>;
    expect(setArgs.inclusionState).toBe('built');
    expect(setArgs.nextReleaseLogId).toBe(RELEASE_UUID);
    expect(setArgs.updatedAt).toBeInstanceOf(Date);

    // Audit INSERT — second insert call (first was release_log_links)
    expect(mockDbInsertValues).toHaveBeenCalledTimes(2);
    const auditRows = mockDbInsertValues.mock.calls[1][0] as Array<Record<string, unknown>>;
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0].entityType).toBe('bug_report');
    expect(auditRows[0].entityId).toBe(VALID_BUG_UUID);
    expect(auditRows[0].fromStatus).toBe('approved_for_build');
    expect(auditRows[0].toStatus).toBe('built');
    expect(auditRows[0].transitionedBy).toBe('commit-parser:abc123');
    expect(auditRows[0].reason).toBe('auto-flip from commit');
    expect(auditRows[0].metadata).toEqual({ releaseLogId: RELEASE_UUID });
  });

  it('Test B — orphan link: BUG in triaged → link STILL written, NO flip, orphanLinks=1, NO audit row', async () => {
    // Bug exists but is NOT in approved_for_build → orphan
    setupSelectResponses({ 0: [{ id: VALID_BUG_UUID, inclusionState: 'triaged' }], 1: [] });

    const result = await stampLinksFromCommit({
      releaseId: RELEASE_UUID,
      commitMessage: `Fix issue BUG-${VALID_BUG_UUID}`,
      projectKey: PROJ_KEY,
      commitSha: 'abc123',
    });

    expect(result.stamped).toBe(1);                  // v2.1 behavior preserved
    expect(result.autoFlipped).toBe(0);
    expect(result.orphanLinks).toBe(1);

    // No UPDATE issued
    expect(mockDbUpdateSet).not.toHaveBeenCalled();
    // Only one INSERT — the release_log_links row; NO audit row
    expect(mockDbInsertValues).toHaveBeenCalledTimes(1);
  });

  it('Test C — feature auto-flip: FEAT in approved_for_build → autoFlipped=1 for feature_request', async () => {
    // No bugs → feature lookup is call index 0
    setupSelectResponses({ 0: [{ id: VALID_FEAT_UUID, inclusionState: 'approved_for_build' }] });
    mockDbUpdateReturning.mockReturnValueOnce(Promise.resolve([{ id: VALID_FEAT_UUID }]));

    const result = await stampLinksFromCommit({
      releaseId: RELEASE_UUID,
      commitMessage: `closes FEAT-${VALID_FEAT_UUID}`,
      projectKey: PROJ_KEY,
      commitSha: 'def456',
    });

    expect(result.stamped).toBe(1);
    expect(result.autoFlipped).toBe(1);
    expect(result.orphanLinks).toBe(0);

    // Audit row entityType === feature_request
    const auditRows = mockDbInsertValues.mock.calls[1][0] as Array<Record<string, unknown>>;
    expect(auditRows[0].entityType).toBe('feature_request');
    expect(auditRows[0].entityId).toBe(VALID_FEAT_UUID);
    expect(auditRows[0].transitionedBy).toBe('commit-parser:def456');
  });

  it('Test D — mixed batch: BUG approved + FEAT triaged → stamped=2, autoFlipped=1, orphanLinks=1', async () => {
    setupSelectResponses({
      0: [{ id: VALID_BUG_UUID, inclusionState: 'approved_for_build' }],
      1: [{ id: VALID_FEAT_UUID, inclusionState: 'triaged' }],
    });
    // Bug flip succeeds; feature is orphan so no UPDATE is even attempted
    mockDbUpdateReturning.mockReturnValueOnce(Promise.resolve([{ id: VALID_BUG_UUID }]));

    const result = await stampLinksFromCommit({
      releaseId: RELEASE_UUID,
      commitMessage: `Fix BUG-${VALID_BUG_UUID} and closes FEAT-${VALID_FEAT_UUID}`,
      projectKey: PROJ_KEY,
      commitSha: 'mixed01',
    });

    expect(result.stamped).toBe(2);
    expect(result.autoFlipped).toBe(1);
    expect(result.orphanLinks).toBe(1);

    // Only one UPDATE issued (for the bug)
    expect(mockDbUpdateSet).toHaveBeenCalledTimes(1);
  });

  it('Test E — no commitSha → audit transitionedBy=commit-parser:unknown (back-compat)', async () => {
    setupSelectResponses({ 0: [{ id: VALID_BUG_UUID, inclusionState: 'approved_for_build' }], 1: [] });
    mockDbUpdateReturning.mockReturnValueOnce(Promise.resolve([{ id: VALID_BUG_UUID }]));

    const result = await stampLinksFromCommit({
      releaseId: RELEASE_UUID,
      commitMessage: `Fix BUG-${VALID_BUG_UUID}`,
      projectKey: PROJ_KEY,
      // commitSha intentionally omitted
    });

    expect(result.autoFlipped).toBe(1);
    const auditRows = mockDbInsertValues.mock.calls[1][0] as Array<Record<string, unknown>>;
    expect(auditRows[0].transitionedBy).toBe('commit-parser:unknown');
  });

  it('Test F — invalid BUG (not in bug_reports) → dropped+1, NO flip, NO orphan (orphan only counts validated refs)', async () => {
    // Bug lookup returns empty → ID is not validated
    setupSelectResponses({ 0: [], 1: [] });

    const result = await stampLinksFromCommit({
      releaseId: RELEASE_UUID,
      commitMessage: `Fix BUG-${VALID_BUG_UUID}`,
      projectKey: PROJ_KEY,
      commitSha: 'invld01',
    });

    expect(result.stamped).toBe(0);
    expect(result.dropped).toBe(1);
    expect(result.autoFlipped).toBe(0);
    expect(result.orphanLinks).toBe(0);  // critical: invalid IDs are NOT orphans

    expect(mockDbUpdateSet).not.toHaveBeenCalled();
    expect(mockDbInsertValues).not.toHaveBeenCalled();
  });

  it('Test G — state guard (Pitfall 5 idempotency): UPDATE returns empty → autoFlipped=0, no audit row', async () => {
    // SELECT says approved_for_build (stale view), but UPDATE WHERE inclusion_state=approved_for_build
    // returns 0 rows (someone already flipped it built between read and write — or this is a re-run)
    setupSelectResponses({ 0: [{ id: VALID_BUG_UUID, inclusionState: 'approved_for_build' }], 1: [] });
    mockDbUpdateReturning.mockReturnValueOnce(Promise.resolve([]));

    const result = await stampLinksFromCommit({
      releaseId: RELEASE_UUID,
      commitMessage: `Fix BUG-${VALID_BUG_UUID}`,
      projectKey: PROJ_KEY,
      commitSha: 'reroll1',
    });

    expect(result.stamped).toBe(1);
    expect(result.autoFlipped).toBe(0);     // empty UPDATE return → no flip counted
    expect(result.orphanLinks).toBe(0);     // SELECT said approved → not an orphan either

    // UPDATE was attempted (the state-guard WHERE filtered it to no rows)
    expect(mockDbUpdateSet).toHaveBeenCalledTimes(1);
    // Only one INSERT — release_log_links; NO audit row (because flipped.length === 0)
    expect(mockDbInsertValues).toHaveBeenCalledTimes(1);
  });
});
