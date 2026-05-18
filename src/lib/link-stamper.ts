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
import { releaseLogLinks, bugReports, featureRequests, projects, workflowTransitions } from '@/db/schema';
import { inArray, eq, and } from 'drizzle-orm';

export interface StampResult {
  stamped: number;
  dropped: number;
  autoFlipped: number;   // Phase 36 INCL-06 — count of approved_for_build → built transitions
  orphanLinks: number;   // Phase 36 INCL-06 / Pitfall 4 — refs that linked but had non-approved inclusion_state
}

export async function stampLinksFromCommit(input: {
  releaseId: string;
  commitMessage: string;
  projectKey: string;
  commitSha?: string;    // Phase 36 INCL-06 — optional for back-compat; used in audit row transitionedBy
}): Promise<StampResult> {
  const { releaseId, commitMessage, projectKey, commitSha } = input;

  // Fast path: empty message → nothing to parse, zero DB calls
  if (!commitMessage || commitMessage.trim().length === 0) {
    return { stamped: 0, dropped: 0, autoFlipped: 0, orphanLinks: 0 };
  }

  let parsedRefs = parseCommitRefs(commitMessage);

  // Fast path: no refs detected → zero DB calls
  if (parsedRefs.length === 0) {
    return { stamped: 0, dropped: 0, autoFlipped: 0, orphanLinks: 0 };
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
    // Phase 36 INCL-06: also project inclusionState so we can route between
    // auto-flip-eligible (approved_for_build) and orphan-link (anything else).
    const validBugIds = new Set<string>();
    const bugInclusionStates = new Map<string, string>();
    if (bugIds.length > 0) {
      const rows = await db
        .select({ id: bugReports.id, inclusionState: bugReports.inclusionState })
        .from(bugReports)
        .where(inArray(bugReports.id, bugIds));
      for (const row of rows) {
        validBugIds.add(row.id);
        bugInclusionStates.set(row.id, row.inclusionState);
      }
    }

    // ── 3. Batch-validate feature IDs ────────────────────────────────────
    const validFeatureIds = new Set<string>();
    const featureInclusionStates = new Map<string, string>();
    if (featureIds.length > 0) {
      const rows = await db
        .select({ id: featureRequests.id, inclusionState: featureRequests.inclusionState })
        .from(featureRequests)
        .where(inArray(featureRequests.id, featureIds));
      for (const row of rows) {
        validFeatureIds.add(row.id);
        featureInclusionStates.set(row.id, row.inclusionState);
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

    // ── 7. Phase 36 INCL-06: auto-flip approved_for_build → built ──────────
    // For every validated bug/feature ID, route into:
    //   - flip eligible (inclusionState === 'approved_for_build')
    //   - orphan link  (any other state — link still written above, no flip,
    //                   counted as observability signal per Pitfall 4)
    // The UPDATE WHERE clause re-checks inclusionState='approved_for_build'
    // as a state guard so re-runs of the same commit are idempotent (Pitfall 5).
    let autoFlipped = 0;
    let orphanLinks = 0;
    const auditSha = commitSha ?? 'unknown';

    const bugsToFlip: string[] = [];
    for (const id of validBugIds) {
      if (bugInclusionStates.get(id) === 'approved_for_build') {
        bugsToFlip.push(id);
      } else {
        orphanLinks++;
      }
    }
    const featuresToFlip: string[] = [];
    for (const id of validFeatureIds) {
      if (featureInclusionStates.get(id) === 'approved_for_build') {
        featuresToFlip.push(id);
      } else {
        orphanLinks++;
      }
    }

    if (bugsToFlip.length > 0) {
      const flipped = await db
        .update(bugReports)
        .set({ inclusionState: 'built', nextReleaseLogId: releaseId, updatedAt: new Date() })
        .where(and(
          inArray(bugReports.id, bugsToFlip),
          eq(bugReports.inclusionState, 'approved_for_build'),  // state guard — Pitfall 5
        ))
        .returning({ id: bugReports.id });
      autoFlipped += flipped.length;
      if (flipped.length > 0) {
        await db.insert(workflowTransitions).values(flipped.map(f => ({
          entityType: 'bug_report',
          entityId: f.id,
          fromStatus: 'approved_for_build',
          toStatus: 'built',
          transitionedBy: `commit-parser:${auditSha}`,
          reason: 'auto-flip from commit',
          metadata: { releaseLogId: releaseId },
        })));
      }
    }

    if (featuresToFlip.length > 0) {
      const flipped = await db
        .update(featureRequests)
        .set({ inclusionState: 'built', nextReleaseLogId: releaseId, updatedAt: new Date() })
        .where(and(
          inArray(featureRequests.id, featuresToFlip),
          eq(featureRequests.inclusionState, 'approved_for_build'),  // state guard — Pitfall 5
        ))
        .returning({ id: featureRequests.id });
      autoFlipped += flipped.length;
      if (flipped.length > 0) {
        await db.insert(workflowTransitions).values(flipped.map(f => ({
          entityType: 'feature_request',
          entityId: f.id,
          fromStatus: 'approved_for_build',
          toStatus: 'built',
          transitionedBy: `commit-parser:${auditSha}`,
          reason: 'auto-flip from commit',
          metadata: { releaseLogId: releaseId },
        })));
      }
    }

    return {
      stamped: insertRows.length,
      dropped: totalCandidates - insertRows.length,
      autoFlipped,
      orphanLinks,
    };
  } catch (err) {
    console.error('[link-stamper] failed', err);
    // Return 0 stamped; dropped = all candidates we attempted to process.
    // Re-parse to get the count if parsedRefs was set before the try block.
    const candidateCount =
      [...new Set(parsedRefs.filter(r => r.type === 'bug').map(r => (r as { type: 'bug'; id: string }).id))].length +
      [...new Set(parsedRefs.filter(r => r.type === 'feature').map(r => (r as { type: 'feature'; id: string }).id))].length +
      [...new Set(parsedRefs.filter(r => r.type === 'external').map(r => (r as { type: 'external'; ref: string }).ref))].length;
    return { stamped: 0, dropped: candidateCount, autoFlipped: 0, orphanLinks: 0 };
  }
}
