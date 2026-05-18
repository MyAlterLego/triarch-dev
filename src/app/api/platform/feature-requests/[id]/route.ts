import { NextRequest, NextResponse } from 'next/server';
import { requireSignedIn } from '@/lib/api-auth';
import { getCurrentUserContext } from '@/lib/auth-context';
import { db } from '@/lib/db';
import { featureRequests, workflowTransitions } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { canManuallyTransition, type InclusionState } from '@/lib/inclusion-state';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error, session } = await requireSignedIn();
  if (error) return error;

  const { id } = await params;
  const body = await req.json();
  const {
    status,
    priority,
    triarchNotes,
    estimatedEffort,
    targetVersion,
    shippedVersion,
    buildPlan,
    buildPlanStatus,
    inclusionState,
  } = body;

  // Existing fetch — do not duplicate. Also used for transition logging below.
  const [current] = await db.select().from(featureRequests).where(eq(featureRequests.id, id));
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
  if (estimatedEffort !== undefined) updates.estimatedEffort = estimatedEffort;
  if (targetVersion !== undefined) updates.targetVersion = targetVersion;
  if (shippedVersion !== undefined) updates.shippedVersion = shippedVersion;
  if (buildPlan !== undefined) updates.buildPlan = buildPlan;
  if (buildPlanStatus !== undefined) updates.buildPlanStatus = buildPlanStatus;
  if (inclusionState !== undefined) updates.inclusionState = inclusionState;

  // ── Phase 36 INCL-03/04: UPDATE + audit rows in the SAME tx (Pitfall 3) ──
  const updated = await db.transaction(async (tx) => {
    const [row] = await tx.update(featureRequests).set(updates).where(eq(featureRequests.id, id)).returning();

    // Existing status audit (moved INSIDE tx for atomicity bonus).
    if (status && status !== current.status) {
      await tx.insert(workflowTransitions).values({
        entityType: 'feature_request',
        entityId: id,
        fromStatus: current.status,
        toStatus: status,
        transitionedBy: session!.user?.email ?? 'admin',
      });
    }

    // ── Phase 36 INCL-03/04: inclusion_state audit (same tx) ──
    if (inclusionState !== undefined && inclusionState !== current.inclusionState) {
      await tx.insert(workflowTransitions).values({
        entityType: 'feature_request',
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
