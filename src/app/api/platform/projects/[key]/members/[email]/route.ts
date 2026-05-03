import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getCurrentUserContext } from '@/lib/auth-context';
import { db } from '@/lib/db';
import { projectMembers } from '@/db/schema';
import { and, eq, sql } from 'drizzle-orm';

async function requireStaff() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  const ctx = await getCurrentUserContext(session);
  if (!ctx || !ctx.isStaff) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { error: null, ctx };
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ key: string; email: string }> }
) {
  const guard = await requireStaff();
  if (guard.error) return guard.error;

  const { key, email: rawEmail } = await params;
  const email = decodeURIComponent(rawEmail);

  // Defense in depth: never let staff rows be deleted via the UI/API.
  // Staff membership is managed via SQL only per CONTEXT.md.
  const [target] = await db
    .select({ id: projectMembers.id, role: projectMembers.role })
    .from(projectMembers)
    .where(
      and(
        eq(projectMembers.projectKey, key),
        sql`lower(${projectMembers.email}) = lower(${email})`
      )
    );

  if (!target) {
    return NextResponse.json({ error: 'Member not found' }, { status: 404 });
  }
  if (target.role === 'staff') {
    return NextResponse.json(
      { error: 'Staff membership is managed via SQL only.' },
      { status: 403 }
    );
  }

  await db.delete(projectMembers).where(eq(projectMembers.id, target.id));

  return NextResponse.json({ success: true, email });
}
