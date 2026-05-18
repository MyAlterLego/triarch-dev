// GATE-12: prod-deploy round-trip ingest — closes the v1.14 gating workflow.
// Decision refs: 05-CONTEXT.md Area 1 (auth, idempotency, atomic write, required fields).
import { NextRequest, NextResponse } from 'next/server';
import { requireApiKey } from '@/lib/api-key-auth';
import { db } from '@/lib/db';
import { releaseLogs, bugReports, featureRequests, workflowTransitions } from '@/db/schema';
import { and, eq } from 'drizzle-orm';

export async function POST(req: NextRequest) {
  // Auth — reuses requireApiKey from api-key-auth (per-project Bearer token via projects.apiKey).
  const { error, project } = await requireApiKey(req);
  if (error) return error;

  // Parse and validate required payload fields (snake_case wire format from CI).
  const body = await req.json();
  const { version, commit_sha, deployed_at, deployed_by } = body as {
    version: unknown;
    commit_sha: unknown;
    deployed_at: unknown;
    deployed_by: unknown;
  };

  const missingFields: string[] = [];
  if (!version || typeof version !== 'string') missingFields.push('version');
  if (!commit_sha || typeof commit_sha !== 'string') missingFields.push('commit_sha');
  if (!deployed_at || typeof deployed_at !== 'string') missingFields.push('deployed_at');
  if (!deployed_by || typeof deployed_by !== 'string') missingFields.push('deployed_by');

  if (missingFields.length > 0) {
    return NextResponse.json(
      { error: `Missing required field(s): ${missingFields.join(', ')}` },
      { status: 400 }
    );
  }

  const parsedDate = new Date(deployed_at as string);
  if (isNaN(parsedDate.getTime())) {
    return NextResponse.json(
      { error: 'Missing required field(s): deployed_at (invalid ISO date)' },
      { status: 400 }
    );
  }

  // Look up the matching dev row (outside transaction — read determines write path).
  const [devRow] = await db
    .select()
    .from(releaseLogs)
    .where(
      and(
        eq(releaseLogs.project, project!.key),
        eq(releaseLogs.version, version as string),
        eq(releaseLogs.env, 'dev')
      )
    );

  if (!devRow) {
    return NextResponse.json(
      { error: `No dev release found for ${project!.key} ${version}` },
      { status: 404 }
    );
  }

  // Idempotency check (05-CONTEXT.md Area 1 — matches Phase 2 GATE-05 philosophy).
  // If a prod row already exists for (project, version, env=prod), return it — no second INSERT.
  const [existingProdRow] = await db
    .select()
    .from(releaseLogs)
    .where(
      and(
        eq(releaseLogs.project, project!.key),
        eq(releaseLogs.version, version as string),
        eq(releaseLogs.env, 'prod')
      )
    );

  if (existingProdRow) {
    return NextResponse.json(existingProdRow, { status: 200 });
  }

  // Atomic write: INSERT prod row + UPDATE dev row status in one transaction.
  const newProdRow = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(releaseLogs)
      .values({
        project: project!.key,
        version: version as string,
        releaseType: devRow.releaseType,
        env: 'prod',
        status: 'promoted',
        commitSha: commit_sha as string,
        deployedAt: parsedDate,
        releasedBy: deployed_by as string,
        summary: devRow.summary,
        entries: devRow.entries,
      })
      .returning();

    await tx
      .update(releaseLogs)
      .set({ status: 'promoted' })
      .where(eq(releaseLogs.id, devRow.id));

    // ── Phase 36 INCL-07: batch-flip built → deployed for items linked to this release ──
    // Idempotency (Pitfall 5): WHERE clause requires inclusion_state='built' so re-ingest
    // matches 0 rows. next_release_log_id stays anchored to devRow.id (CONTEXT.md D-13 —
    // dev row stamping preserves provenance; dev↔prod join via release_logs.version).
    const flippedBugs = await tx
      .update(bugReports)
      .set({ inclusionState: 'deployed', updatedAt: new Date() })
      .where(and(
        eq(bugReports.nextReleaseLogId, devRow.id),
        eq(bugReports.inclusionState, 'built'),
      ))
      .returning({ id: bugReports.id });

    const flippedFeats = await tx
      .update(featureRequests)
      .set({ inclusionState: 'deployed', updatedAt: new Date() })
      .where(and(
        eq(featureRequests.nextReleaseLogId, devRow.id),
        eq(featureRequests.inclusionState, 'built'),
      ))
      .returning({ id: featureRequests.id });

    // Combined audit insert — single INSERT to minimize round-trips, all rows in same tx
    // (Pitfall 3: audit must commit atomically with the state change).
    const auditRows = [
      ...flippedBugs.map((b) => ({
        entityType: 'bug_report' as const,
        entityId: b.id,
        fromStatus: 'built',
        toStatus: 'deployed',
        transitionedBy: `prod-ingest:${commit_sha as string}`,
        reason: 'auto-flip on prod deploy',
        metadata: { prodReleaseLogId: inserted.id },
      })),
      ...flippedFeats.map((f) => ({
        entityType: 'feature_request' as const,
        entityId: f.id,
        fromStatus: 'built',
        toStatus: 'deployed',
        transitionedBy: `prod-ingest:${commit_sha as string}`,
        reason: 'auto-flip on prod deploy',
        metadata: { prodReleaseLogId: inserted.id },
      })),
    ];
    if (auditRows.length > 0) {
      await tx.insert(workflowTransitions).values(auditRows);
    }

    return inserted;
  });

  return NextResponse.json(newProdRow, { status: 201 });
}
