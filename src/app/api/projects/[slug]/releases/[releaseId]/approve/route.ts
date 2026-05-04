import { NextRequest, NextResponse } from 'next/server';
import { requireSignedIn } from '@/lib/api-auth';
import { getCurrentUserContext } from '@/lib/auth-context';
import { db } from '@/lib/db';
import { releaseLogs, projects } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { approveRelease } from '@/lib/release-actions';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; releaseId: string }> }
) {
  // 1. Require authenticated session
  const { error, session } = await requireSignedIn();
  if (error) return error;

  // 2. Resolve params + get user context
  const { slug, releaseId } = await params;
  const ctx = await getCurrentUserContext(session);
  if (!ctx) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // 3. Look up project by slug (project.key)
  const [project] = await db
    .select({ key: projects.key })
    .from(projects)
    .where(eq(projects.key, slug));

  if (!project) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // 4. Membership check — non-members get 404 (no-leak)
  const membership = ctx.memberships.find((m) => m.project_key === project.key);
  const isMember = ctx.isStaff || !!membership;
  if (!isMember) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // 5. Role check — viewers get 403 (distinguishable from 404)
  const isAdmin = ctx.isStaff || membership?.role === 'admin';
  if (!isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // 6. Look up release and verify it belongs to this project
  const [release] = await db
    .select()
    .from(releaseLogs)
    .where(and(eq(releaseLogs.id, releaseId), eq(releaseLogs.project, project.key)));

  if (!release) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // 7. Header capture
  const ipAddress = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  const userAgent = req.headers.get('user-agent')?.slice(0, 512) ?? null;

  // 8. Delegate to shared helper
  const result = await approveRelease({ release, approverEmail: ctx.email, ipAddress, userAgent });

  if (!result.ok) {
    // Only invalid_status is possible from approveRelease
    return NextResponse.json({ error: result.message }, { status: 409 });
  }

  return NextResponse.json({
    ok: true,
    alreadyApproved: result.alreadyApproved,
    release: result.release,
    approval: result.approval
      ? {
          id: result.approval.id,
          releaseId: result.approval.releaseId,
          approverEmail: result.approval.approverEmail,
          decision: result.approval.decision,
          approvedAt: result.approval.approvedAt?.toISOString() ?? null,
          reason: result.approval.reason,
          ipAddress: result.approval.ipAddress,
          userAgent: result.approval.userAgent,
        }
      : null,
  });
}
