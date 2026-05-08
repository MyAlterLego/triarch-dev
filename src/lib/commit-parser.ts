/**
 * commit-parser.ts
 *
 * Pure regex parser that extracts bug/feature/external references from commit
 * messages. Zero I/O, zero DB calls — given identical input, returns identical
 * output. Consumed by link-stamper.ts (Plan 11-02) and validated against DB.
 *
 * Patterns (all case-insensitive, word-boundary anchored):
 *   A) Direct UUID refs:     BUG-{uuid}, #BUG-{uuid}, FEAT-{uuid}, #FEAT-{uuid}
 *   B) Verb-prefixed UUID:   closes/fixes/resolves/implements/adds + BUG/FEAT-{uuid}
 *   C) Verb-prefixed #N:     closes/fixes/resolves + #<integer> (external GitHub issues)
 *
 * Design note: Pattern B fires before Pattern A to prevent double-counting of
 * verb-prefixed UUID refs. All UUID output is lowercased for canonical DB lookup.
 */

export type ParsedRef =
  | { type: 'bug';      id:  string; source: 'commit' }
  | { type: 'feature';  id:  string; source: 'commit' }
  | { type: 'external'; ref: string; source: 'commit' };

// ─── UUID fragment (8-4-4-4-12 hex, case-insensitive) ──────────────────────
const UUID_FRAG = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

// ─── Pattern B: verb-prefixed UUID refs ────────────────────────────────────
// Verbs for BUG: closes?, fixes?, resolves?
// Verbs for FEAT: closes?, fixes?, resolves?, implements?, adds?
const VERB_BUG  = new RegExp(
  `\\b(?:closes?|fixes?|resolves?)\\s+#?BUG-(${UUID_FRAG})\\b`,
  'gi',
);
const VERB_FEAT = new RegExp(
  `\\b(?:closes?|fixes?|resolves?|implements?|adds?)\\s+#?FEAT-(${UUID_FRAG})\\b`,
  'gi',
);

// ─── Pattern A: direct UUID refs (applied AFTER stripping verb-prefixed regions) ─
const DIRECT_BUG  = new RegExp(`\\b#?BUG-(${UUID_FRAG})\\b`,  'gi');
const DIRECT_FEAT = new RegExp(`\\b#?FEAT-(${UUID_FRAG})\\b`, 'gi');

// ─── Pattern C: verb-prefixed bare integer (external GitHub issue) ──────────
const EXTERNAL_ISSUE = /\b(?:closes?|fixes?|resolves?)\s+#(\d+)\b/gi;

/**
 * Strips all regions matched by VERB_BUG and VERB_FEAT from the message so
 * that Pattern A cannot double-count a verb-prefixed UUID ref.
 */
function stripVerbPrefixedRegions(message: string): string {
  // Replace each verb-prefixed UUID hit with spaces of equal length so
  // remaining character offsets are preserved (makes other regexes safe).
  return message
    .replace(new RegExp(VERB_BUG.source,  'gi'), m => ' '.repeat(m.length))
    .replace(new RegExp(VERB_FEAT.source, 'gi'), m => ' '.repeat(m.length));
}

/**
 * parseCommitRefs — extract all bug/feature/external references from a commit
 * message. Returns a deduplicated array of ParsedRef objects.
 */
export function parseCommitRefs(message: string): ParsedRef[] {
  if (!message) return [];

  const results: ParsedRef[] = [];
  // Dedup key: "{type}:{id|ref}"
  const seen = new Set<string>();

  function addBug(id: string) {
    const canonical = id.toLowerCase();
    const key = `bug:${canonical}`;
    if (!seen.has(key)) {
      seen.add(key);
      results.push({ type: 'bug', id: canonical, source: 'commit' });
    }
  }

  function addFeature(id: string) {
    const canonical = id.toLowerCase();
    const key = `feature:${canonical}`;
    if (!seen.has(key)) {
      seen.add(key);
      results.push({ type: 'feature', id: canonical, source: 'commit' });
    }
  }

  function addExternal(ref: string) {
    const key = `external:${ref}`;
    if (!seen.has(key)) {
      seen.add(key);
      results.push({ type: 'external', ref, source: 'commit' });
    }
  }

  // ── Pattern B first ──────────────────────────────────────────────────────
  // Reset lastIndex (global regexes are stateful when reused).
  VERB_BUG.lastIndex  = 0;
  VERB_FEAT.lastIndex = 0;

  let m: RegExpExecArray | null;

  while ((m = VERB_BUG.exec(message)) !== null) {
    addBug(m[1]);
  }
  while ((m = VERB_FEAT.exec(message)) !== null) {
    addFeature(m[1]);
  }

  // ── Pattern A: scan message with verb-prefixed regions blanked out ───────
  const stripped = stripVerbPrefixedRegions(message);
  DIRECT_BUG.lastIndex  = 0;
  DIRECT_FEAT.lastIndex = 0;

  while ((m = DIRECT_BUG.exec(stripped)) !== null) {
    addBug(m[1]);
  }
  while ((m = DIRECT_FEAT.exec(stripped)) !== null) {
    addFeature(m[1]);
  }

  // ── Pattern C: verb-prefixed bare integers ───────────────────────────────
  // These are only matched when the # is preceded by a verb (closes/fixes/resolves).
  // Plain `#42` without a verb does NOT match.
  EXTERNAL_ISSUE.lastIndex = 0;

  // We must avoid matching an integer that is actually part of a UUID segment.
  // Since UUIDs are already consumed above, we scan the original message for
  // Pattern C but only capture groups that are purely digit sequences (no hyphens).
  const externalRe = new RegExp(EXTERNAL_ISSUE.source, 'gi');
  while ((m = externalRe.exec(message)) !== null) {
    // Confirm the captured group is entirely digits (not a UUID fragment).
    if (/^\d+$/.test(m[1])) {
      addExternal(m[1]);
    }
  }

  return results;
}
