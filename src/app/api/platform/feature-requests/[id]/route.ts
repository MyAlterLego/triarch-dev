import { NextRequest, NextResponse } from 'next/server';
import { requireSignedIn } from '@/lib/api-auth';
import { getCurrentUserContext } from '@/lib/auth-context';
import { db } from '@/lib/db';
import { featureRequests, workflowTransitions } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error, session } = await requireSignedIn();
  if (error) return error;

  const { id } = await params;
  const body = await req.json();
  const { status, priority, triarchNotes, estimatedEffort, targetVersion, shippedVersion, buildPlan, buildPlanStatus } = body;

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

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (status !== undefined) updates.status = status;
  if (priority !== undefined) updates.priority = priority;
  if (triarchNotes !== undefined) updates.triarchNotes = triarchNotes;
  if (estimatedEffort !== undefined) updates.estimatedEffort = estimatedEffort;
  if (targetVersion !== undefined) updates.targetVersion = targetVersion;
  if (shippedVersion !== undefined) updates.shippedVersion = shippedVersion;
  if (buildPlan !== undefined) updates.buildPlan = buildPlan;
  if (buildPlanStatus !== undefined) updates.buildPlanStatus = buildPlanStatus;

  const [updated] = await db.update(featureRequests).set(updates).where(eq(featureRequests.id, id)).returning();

  if (status && status !== current.status) {
    await db.insert(workflowTransitions).values({
      entityType: 'feature_request',
      entityId: id,
      fromStatus: current.status,
      toStatus: status,
      transitionedBy: session!.user?.email ?? 'admin',
    });
  }

  return NextResponse.json(updated);
}
