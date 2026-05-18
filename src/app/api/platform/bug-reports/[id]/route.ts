import { NextRequest, NextResponse } from 'next/server';
import { requireSignedIn } from '@/lib/api-auth';
import { getCurrentUserContext } from '@/lib/auth-context';
import { db } from '@/lib/db';
import { bugReports, workflowTransitions } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { canManuallyTransition, type InclusionState } from '@/lib/inclusion-state';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error, session } = await requireSignedIn();
  if (error) return error;

  const { id } = await params;
  const [bug] = await db.select().from(bugReports).where(eq(bugReports.id, id));
  if (!bug) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const ctx = await getCurrentUserContext(session);
  const isMember =
    !!ctx && (ctx.isStaff || ctx.memberships.some((m) => m.project_key === bug.project));
  if (!isMember) {
    // Non-staff non-member: do NOT leak that the row exists — return same 404 as if the id was bogus.
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json(bug);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error, session } = await requireSignedIn();
  if (error) return error;

  const { id } = await params;
  const body = await req.json();
  const { status, priority, triarchNotes, fixCommitSha, fixVersion, severity, inclusionState } = body;

  // Existing fetch — do not duplicate. Also used for transition logging below.
  const [current] = await db.select().from(bugReports).where(eq(bugReports.id, id));
  if (!current) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Membership gate using the row we just fetched.
  const ctx = await getCurrentUserContext(session);
  const isMember =
    !!ctx && (ctx.isStaff || ctx.memberships.some((m) => m.project_key === current.project));
  if (!isMember) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // ── Phase 36 INCL-03/04: validate inclusion_state transition ──
  if (inclusionState !== undefined && inclusionState !== current.inclusionState) {
    if (!canManuallyTransition(current.inclusionState as InclusionState, inclusionState as InclusionState)) {
      return NextResponse.json({ error: 'invalid_transition' }, { status: 400 });
    }
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (status !== undefined) updates.status = status;
  if (priority !== undefined) updates.priority = priority;
  if (triarchNotes !== undefined) updates.triarchNotes = triarchNotes;
  if (fixCommitSha !== undefined) updates.fixCommitSha = fixCommitSha;
  if (fixVersion !== undefined) updates.fixVersion = fixVersion;
  if (severity !== undefined) updates.severity = severity;
  if (inclusionState !== undefined) updates.inclusionState = inclusionState;
  if (status === 'closed' || status === 'verified') updates.resolvedAt = new Date();

  // ── Phase 36 INCL-03/04: UPDATE + audit rows in the SAME tx (Pitfall 3) ──
  const updated = await db.transaction(async (tx) => {
    const [row] = await tx.update(bugReports).set(updates).where(eq(bugReports.id, id)).returning();

    // Existing status audit (moved INSIDE tx for atomicity bonus).
    if (status && status !== current.status) {
      await tx.insert(workflowTransitions).values({
        entityType: 'bug_report',
        entityId: id,
        fromStatus: current.status,
        toStatus: status,
        transitionedBy: session!.user?.email ?? 'admin',
      });
    }

    // ── Phase 36 INCL-03/04: inclusion_state audit (same tx) ──
    if (inclusionState !== undefined && inclusionState !== current.inclusionState) {
      await tx.insert(workflowTransitions).values({
        entityType: 'bug_report',
        entityId: id,
        fromStatus: current.inclusionState,
        toStatus: inclusionState,
        transitionedBy: session!.user?.email ?? 'admin',
        reason: body.reason ?? null,
      });
    }

    return row;
  });

  return NextResponse.json(updated);
}
