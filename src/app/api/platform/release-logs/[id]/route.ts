import { NextRequest, NextResponse } from 'next/server';
import { requireSignedIn } from '@/lib/api-auth';
import { getCurrentUserContext } from '@/lib/auth-context';
import { db } from '@/lib/db';
import { releaseLogs } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error, session } = await requireSignedIn();
  if (error) return error;

  const { id } = await params;
  const [release] = await db
    .select()
    .from(releaseLogs)
    .where(eq(releaseLogs.id, id));

  if (!release) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const ctx = await getCurrentUserContext(session);
  const isMember =
    !!ctx && (ctx.isStaff || ctx.memberships.some((m) => m.project_key === release.project));
  if (!isMember) {
    // Non-staff non-member: do NOT leak that the row exists — return same 404 as if the id was bogus.
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json(release);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error, session } = await requireSignedIn();
  if (error) return error;

  const { id } = await params;

  // Fetch row first to (a) confirm it exists, (b) know its project for membership check.
  const [current] = await db.select().from(releaseLogs).where(eq(releaseLogs.id, id));
  if (!current) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const ctx = await getCurrentUserContext(session);
  const isMember =
    !!ctx && (ctx.isStaff || ctx.memberships.some((m) => m.project_key === current.project));
  if (!isMember) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const body = await req.json();
  const { summary, entries, metadata, releaseType, releasedBy } = body;

  const [updated] = await db.update(releaseLogs)
    .set({
      ...(summary !== undefined && { summary }),
      ...(entries !== undefined && { entries }),
      ...(metadata !== undefined && { metadata }),
      ...(releaseType !== undefined && { releaseType }),
      ...(releasedBy !== undefined && { releasedBy }),
    })
    .where(eq(releaseLogs.id, id))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json(updated);
}
