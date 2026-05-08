import { describe, it, expect } from 'vitest';
import { parseCommitRefs, type ParsedRef } from './commit-parser';

// Real-looking UUIDs used throughout
const BUG_UUID_1 = '01234567-89ab-cdef-0123-456789abcdef';
const BUG_UUID_2 = 'aabbccdd-eeff-0011-2233-445566778899';
const FEAT_UUID_1 = 'fedcba98-7654-3210-fedc-ba9876543210';
const FEAT_UUID_2 = '11223344-5566-7788-99aa-bbccddeeff00';
const UUID_3     = 'deadbeef-cafe-babe-f00d-0123456789ab';

describe('parseCommitRefs', () => {

  // ─── Pattern A: Direct BUG/FEAT UUID refs ────────────────────────────────

  it('plain BUG-{uuid} matches (no leading #)', () => {
    const result = parseCommitRefs(`fix bug in auth module BUG-${BUG_UUID_1}`);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ type: 'bug', id: BUG_UUID_1, source: 'commit' });
  });

  it('plain #BUG-{uuid} matches', () => {
    const result = parseCommitRefs(`fix auth issue #BUG-${BUG_UUID_1}`);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ type: 'bug', id: BUG_UUID_1, source: 'commit' });
  });

  it('plain FEAT-{uuid} matches', () => {
    const result = parseCommitRefs(`add new dashboard FEAT-${FEAT_UUID_1}`);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ type: 'feature', id: FEAT_UUID_1, source: 'commit' });
  });

  it('plain #FEAT-{uuid} matches', () => {
    const result = parseCommitRefs(`implement new UI #FEAT-${FEAT_UUID_1}`);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ type: 'feature', id: FEAT_UUID_1, source: 'commit' });
  });

  it('mixed-case #bug-{uuid} matches case-insensitively', () => {
    const result = parseCommitRefs(`fix: #bug-${BUG_UUID_1}`);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ type: 'bug', id: BUG_UUID_1.toLowerCase(), source: 'commit' });
  });

  // ─── Pattern B: Verb-prefixed UUID refs ──────────────────────────────────

  it('`closes #BUG-{uuid}` matches as bug', () => {
    const result = parseCommitRefs(`closes #BUG-${BUG_UUID_1}`);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ type: 'bug', id: BUG_UUID_1, source: 'commit' });
  });

  it('`fixes BUG-{uuid}` matches as bug (no #)', () => {
    const result = parseCommitRefs(`fixes BUG-${BUG_UUID_1}`);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ type: 'bug', id: BUG_UUID_1, source: 'commit' });
  });

  it('`resolves FEAT-{uuid}` matches as feature', () => {
    const result = parseCommitRefs(`resolves FEAT-${FEAT_UUID_1}`);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ type: 'feature', id: FEAT_UUID_1, source: 'commit' });
  });

  it('`implements #FEAT-{uuid}` matches as feature', () => {
    const result = parseCommitRefs(`implements #FEAT-${FEAT_UUID_1}`);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ type: 'feature', id: FEAT_UUID_1, source: 'commit' });
  });

  it('`adds FEAT-{uuid}` matches as feature', () => {
    const result = parseCommitRefs(`adds FEAT-${FEAT_UUID_1}`);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ type: 'feature', id: FEAT_UUID_1, source: 'commit' });
  });

  it('`Closes` (capitalized) matches case-insensitively', () => {
    const result = parseCommitRefs(`Closes BUG-${BUG_UUID_1}`);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ type: 'bug', id: BUG_UUID_1, source: 'commit' });
  });

  // ─── Pattern C: Bare GitHub #N issue refs ────────────────────────────────

  it('`fixes #99` matches as external with ref="99"', () => {
    const result = parseCommitRefs('fixes #99');
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ type: 'external', ref: '99', source: 'commit' });
  });

  it('`closes #1234` matches as external', () => {
    const result = parseCommitRefs('closes #1234');
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ type: 'external', ref: '1234', source: 'commit' });
  });

  it('plain `#42` (no verb) does NOT match (avoid false positives on PR refs)', () => {
    const result = parseCommitRefs('see PR #42 for context');
    expect(result).toHaveLength(0);
  });

  // ─── Edge cases / negative cases ─────────────────────────────────────────

  it('malformed UUID with wrong length is rejected (`BUG-1234-5678` → no match)', () => {
    const result = parseCommitRefs('BUG-1234-5678');
    expect(result).toHaveLength(0);
  });

  it('malformed UUID with non-hex chars is rejected', () => {
    const result = parseCommitRefs('BUG-zzzzzzzz-aaaa-bbbb-cccc-dddddddddddd');
    expect(result).toHaveLength(0);
  });

  it('7-digit commit-hash-like number does NOT match', () => {
    const result = parseCommitRefs('commit abc1234 fixed the issue');
    expect(result).toHaveLength(0);
  });

  it('version tag `v1.2.3` does NOT match', () => {
    const result = parseCommitRefs('bump version to v1.2.3');
    expect(result).toHaveLength(0);
  });

  it('PR number in URL `/pull/42` does NOT match (no leading verb)', () => {
    const result = parseCommitRefs('see github.com/org/repo/pull/42 for details');
    expect(result).toHaveLength(0);
  });

  it('empty string returns []', () => {
    const result = parseCommitRefs('');
    expect(result).toHaveLength(0);
  });

  it('message with only prose returns []', () => {
    const result = parseCommitRefs('refactor authentication module to improve code clarity');
    expect(result).toHaveLength(0);
  });

  // ─── Dedupe + multi-match ─────────────────────────────────────────────────

  it('same BUG-{uuid} appearing twice in one message is returned once', () => {
    const result = parseCommitRefs(`fixes BUG-${BUG_UUID_1} and also BUG-${BUG_UUID_1}`);
    const bugRefs = result.filter(r => r.type === 'bug');
    expect(bugRefs).toHaveLength(1);
  });

  it('different BUG and FEAT in same message both returned', () => {
    const result = parseCommitRefs(`BUG-${BUG_UUID_1} FEAT-${FEAT_UUID_1}`);
    expect(result).toHaveLength(2);
    const types = result.map(r => r.type);
    expect(types).toContain('bug');
    expect(types).toContain('feature');
  });

  it('three different refs (BUG, FEAT, external) all returned', () => {
    const result = parseCommitRefs(
      `fixes BUG-${BUG_UUID_2} and resolves FEAT-${FEAT_UUID_2} closes #77`
    );
    expect(result).toHaveLength(3);
    const types = result.map(r => r.type);
    expect(types).toContain('bug');
    expect(types).toContain('feature');
    expect(types).toContain('external');
  });

  // ─── Source field ─────────────────────────────────────────────────────────

  it('every returned ParsedRef has source="commit"', () => {
    const result = parseCommitRefs(
      `BUG-${BUG_UUID_1} FEAT-${FEAT_UUID_1} fixes #55`
    );
    expect(result.length).toBeGreaterThan(0);
    for (const ref of result) {
      expect(ref.source).toBe('commit');
    }
  });

  // ─── Additional coverage for UUID_3 ──────────────────────────────────────

  it('`resolves #BUG-{uuid}` with alternate UUID matches correctly', () => {
    const result = parseCommitRefs(`resolves #BUG-${UUID_3}`);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ type: 'bug', id: UUID_3, source: 'commit' });
  });

  it('verb-prefixed BUG ref not double-counted with bare Pattern A match', () => {
    // "fixes BUG-{uuid}" should produce exactly ONE result, not two
    const result = parseCommitRefs(`fixes BUG-${BUG_UUID_1}`);
    expect(result).toHaveLength(1);
  });
});
