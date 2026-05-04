import { NextRequest, NextResponse } from 'next/server';
import { requireSignedIn } from '@/lib/api-auth';
import { getCurrentUserContext } from '@/lib/auth-context';
import { db } from '@/lib/db';
import { releaseLogs, releaseApprovals, projects } from '@/db/schema';
import { eq, and, desc } from 'drizzle-orm';

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

  // 7. Idempotent short-circuit: already approved → return existing row, no new INSERT
  if (release.status === 'approved') {
    const [existingApproval] = await db
      .select()
      .from(releaseApprovals)
      .where(
        and(
          eq(releaseApprovals.releaseId, release.id),
          eq(releaseApprovals.decision, 'approved')
        )
      )
      .orderBy(desc(releaseApprovals.approvedAt))
      .limit(1);

    return NextResponse.json({
      ok: true,
      alreadyApproved: true,
      release: { id: release.id, status: release.status },
      approval: existingApproval
        ? {
            id: existingApproval.id,
            releaseId: existingApproval.releaseId,
            approverEmail: existingApproval.approverEmail,
            decision: existingApproval.decision,
            approvedAt: existingApproval.approvedAt?.toISOString() ?? null,
            reason: existingApproval.reason,
            ipAddress: existingApproval.ipAddress,
            userAgent: existingApproval.userAgent,
          }
        : null,
    });
  }

  // 8. Status precondition: only 'dev' (or null treated as 'dev') is approvable
  const currentStatus = release.status ?? 'dev';
  if (currentStatus !== 'dev') {
    return NextResponse.json(
      { error: `Cannot approve a release in status '${currentStatus}'` },
      { status: 409 }
    );
  }

  // 9. Capture audit context from request headers
  const ipAddress = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  const userAgent = req.headers.get('user-agent')?.slice(0, 512) ?? null;

  // 10. Atomic transaction: insert audit row + update release status
  const result = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(releaseApprovals)
      .values({
        releaseId: release.id,
        approverEmail: ctx.email,
        decision: 'approved',
        ipAddress,
        userAgent,
        reason: null,
      })
      .returning();

    const [updated] = await tx
      .update(releaseLogs)
      .set({ status: 'approved' })
      .where(eq(releaseLogs.id, release.id))
      .returning({ id: releaseLogs.id, status: releaseLogs.status });

    return { inserted, updated };
  });

  // 11. Return success response
  return NextResponse.json({
    ok: true,
    alreadyApproved: false,
    release: { id: result.updated.id, status: result.updated.status },
    approval: {
      id: result.inserted.id,
      releaseId: result.inserted.releaseId,
      approverEmail: result.inserted.approverEmail,
      decision: result.inserted.decision,
      approvedAt: result.inserted.approvedAt?.toISOString() ?? null,
      reason: result.inserted.reason,
      ipAddress: result.inserted.ipAddress,
      userAgent: result.inserted.userAgent,
    },
  });
}
