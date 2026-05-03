import { NextRequest, NextResponse } from 'next/server';
import { requireSignedIn } from '@/lib/api-auth';
import { getCurrentUserContext } from '@/lib/auth-context';
import { db } from '@/lib/db';
import { bugReports, workflowTransitions } from '@/db/schema';
import { eq } from 'drizzle-orm';

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
  const { status, priority, triarchNotes, fixCommitSha, fixVersion, severity } = body;

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

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (status !== undefined) updates.status = status;
  if (priority !== undefined) updates.priority = priority;
  if (triarchNotes !== undefined) updates.triarchNotes = triarchNotes;
  if (fixCommitSha !== undefined) updates.fixCommitSha = fixCommitSha;
  if (fixVersion !== undefined) updates.fixVersion = fixVersion;
  if (severity !== undefined) updates.severity = severity;
  if (status === 'closed' || status === 'verified') updates.resolvedAt = new Date();

  const [updated] = await db.update(bugReports).set(updates).where(eq(bugReports.id, id)).returning();

  // Log status transition
  if (status && status !== current.status) {
    await db.insert(workflowTransitions).values({
      entityType: 'bug_report',
      entityId: id,
      fromStatus: current.status,
      toStatus: status,
      transitionedBy: session!.user?.email ?? 'admin',
    });
  }

  return NextResponse.json(updated);
}
