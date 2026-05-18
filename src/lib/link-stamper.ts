/**
 * link-stamper.ts
 *
 * Validates parsed commit refs against the DB and writes confirmed rows into
 * release_log_links with source='commit'.
 *
 * Design:
 *  - Calls parseCommitRefs() (pure, no I/O) to extract candidate refs
 *  - Validates bug and feature IDs in a single inArray() query each
 *  - Constructs external GitHub URLs only when projects.github_repo is non-null
 *  - Deduplicates before INSERT — no duplicate rows for same id/url in one call
 *  - Wraps entire body in try/catch — stamper is FORGIVING; a stamper failure
 *    must never block a release ingest. Caller (ingest route) also wraps in
 *    try/catch as defense-in-depth (Pitfall 5 / LINK-02 best-effort principle).
 */

import { parseCommitRefs } from '@/lib/commit-parser';
import { db } from '@/lib/db';
import { releaseLogLinks, bugReports, featureRequests, projects } from '@/db/schema';
import { inArray, eq } from 'drizzle-orm';

export interface StampResult {
  stamped: number;
  dropped: number;
}

export async function stampLinksFromCommit(input: {
  releaseId: string;
  commitMessage: string;
  projectKey: string;
}): Promise<StampResult> {
  const { releaseId, commitMessage, projectKey } = input;

  // Fast path: empty message → nothing to parse, zero DB calls
  if (!commitMessage || commitMessage.trim().length === 0) {
    return { stamped: 0, dropped: 0 };
  }

  let parsedRefs = parseCommitRefs(commitMessage);

  // Fast path: no refs detected → zero DB calls
  if (parsedRefs.length === 0) {
    return { stamped: 0, dropped: 0 };
  }

  try {
    // ── 1. Bucket refs by type ────────────────────────────────────────────
    // Use Sets for dedup at the ID/ref level before any DB call.
    const bugIds     = [...new Set(parsedRefs.filter(r => r.type === 'bug').map(r => (r as { type: 'bug'; id: string }).id))];
    const featureIds = [...new Set(parsedRefs.filter(r => r.type === 'feature').map(r => (r as { type: 'feature'; id: string }).id))];
    const externalRefs = [...new Set(parsedRefs.filter(r => r.type === 'external').map(r => (r as { type: 'external'; ref: string }).ref))];

    // Track total candidates for dropped count
    const totalCandidates = bugIds.length + featureIds.length + externalRefs.length;

    // ── 2. Batch-validate bug IDs ─────────────────────────────────────────
    const validBugIds = new Set<string>();
    if (bugIds.length > 0) {
      const rows = await db
        .select({ id: bugReports.id, inclusionState: bugReports.inclusionState })
        .from(bugReports)
        .where(inArray(bugReports.id, bugIds));
      for (const row of rows) {
        validBugIds.add(row.id);
      }
    }

    // ── 3. Batch-validate feature IDs ────────────────────────────────────
    const validFeatureIds = new Set<string>();
    if (featureIds.length > 0) {
      const rows = await db
        .select({ id: featureRequests.id, inclusionState: featureRequests.inclusionState })
        .from(featureRequests)
        .where(inArray(featureRequests.id, featureIds));
      for (const row of rows) {
        validFeatureIds.add(row.id);
      }
    }

    // ── 4. Resolve external GitHub URLs ──────────────────────────────────
    let githubRepo: string | null = null;
    if (externalRefs.length > 0) {
      const [proj] = await db
        .select({ githubRepo: projects.githubRepo })
        .from(projects)
        .where(eq(projects.key, projectKey));
      githubRepo = proj?.githubRepo ?? null;
    }

    // ── 5. Build INSERT rows ──────────────────────────────────────────────
    const insertRows: Array<{
      releaseId: string;
      linkType: string;
      bugId: string | null;
      featureId: string | null;
      externalUrl: string | null;
      source: string;
    }> = [];

    // Bug rows
    for (const id of bugIds) {
      if (validBugIds.has(id)) {
        insertRows.push({
          releaseId,
          linkType: 'bug',
          bugId: id,
          featureId: null,
          externalUrl: null,
          source: 'commit',
        });
      }
    }

    // Feature rows
    for (const id of featureIds) {
      if (validFeatureIds.has(id)) {
        insertRows.push({
          releaseId,
          linkType: 'feature',
          bugId: null,
          featureId: id,
          externalUrl: null,
          source: 'commit',
        });
      }
    }

    // External rows — only when github_repo is non-null
    if (githubRepo !== null) {
      const base = `https://github.com/${githubRepo}`;
      for (const ref of externalRefs) {
        insertRows.push({
          releaseId,
          linkType: 'external',
          bugId: null,
          featureId: null,
          externalUrl: `${base}/issues/${ref}`,
          source: 'commit',
        });
      }
    }

    // ── 6. INSERT (batched, single call) ──────────────────────────────────
    if (insertRows.length > 0) {
      await db.insert(releaseLogLinks).values(insertRows);
    }

    return {
      stamped: insertRows.length,
      dropped: totalCandidates - insertRows.length,
    };
  } catch (err) {
    console.error('[link-stamper] failed', err);
    // Return 0 stamped; dropped = all candidates we attempted to process.
    // Re-parse to get the count if parsedRefs was set before the try block.
    const candidateCount =
      [...new Set(parsedRefs.filter(r => r.type === 'bug').map(r => (r as { type: 'bug'; id: string }).id))].length +
      [...new Set(parsedRefs.filter(r => r.type === 'feature').map(r => (r as { type: 'feature'; id: string }).id))].length +
      [...new Set(parsedRefs.filter(r => r.type === 'external').map(r => (r as { type: 'external'; ref: string }).ref))].length;
    return { stamped: 0, dropped: candidateCount };
  }
}
