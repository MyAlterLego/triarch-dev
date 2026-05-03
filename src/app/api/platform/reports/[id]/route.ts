import { NextRequest, NextResponse } from 'next/server';
import { requireSignedIn, requireStaff } from '@/lib/api-auth';
import { getCurrentUserContext } from '@/lib/auth-context';
import { db } from '@/lib/db';
import { reports } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error, session } = await requireSignedIn();
  if (error) return error;

  const { id } = await params;
  const [report] = await db.select().from(reports).where(eq(reports.id, id));
  if (!report) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const ctx = await getCurrentUserContext(session);
  const isMember =
    !!ctx && (ctx.isStaff || ctx.memberships.some((m) => m.project_key === report.project));
  if (!isMember) {
    // Non-staff non-member: do NOT leak that the row exists — return same 404 as if the id was bogus.
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json(report);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error, session } = await requireSignedIn();
  if (error) return error;

  const { id } = await params;

  // Fetch row first to (a) confirm it exists, (b) know its project for membership check.
  const [current] = await db.select().from(reports).where(eq(reports.id, id));
  if (!current) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const ctx = await getCurrentUserContext(session);
  const isMember =
    !!ctx && (ctx.isStaff || ctx.memberships.some((m) => m.project_key === current.project));
  if (!isMember) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const body = await req.json();
  const { title, status, sections, periodStart, periodEnd, metadata } = body;

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (title !== undefined) updates.title = title;
  if (status !== undefined) updates.status = status;
  if (sections !== undefined) updates.sections = sections;
  if (periodStart !== undefined) updates.periodStart = periodStart ? new Date(periodStart) : null;
  if (periodEnd !== undefined) updates.periodEnd = periodEnd ? new Date(periodEnd) : null;
  if (metadata !== undefined) updates.metadata = metadata;

  const [updated] = await db.update(reports).set(updates).where(eq(reports.id, id)).returning();
  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // DELETE is staff-only: non-staff customers must not be able to delete reports.
  const { error } = await requireStaff();
  if (error) return error;

  const { id } = await params;
  const [deleted] = await db.delete(reports).where(eq(reports.id, id)).returning();
  if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({ success: true });
}
