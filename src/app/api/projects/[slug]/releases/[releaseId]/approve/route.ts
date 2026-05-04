import { NextRequest, NextResponse } from 'next/server';
import { requireSignedIn } from '@/lib/api-auth';
import { getCurrentUserContext } from '@/lib/auth-context';
import { db } from '@/lib/db';
import { releaseLogs, projects, releaseFeedback } from '@/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { approveRelease } from '@/lib/release-actions';
import { notifyReleaseApproved } from '@/lib/slack';

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

  // Fire-and-forget Slack notification — only on fresh approve, not on idempotent re-approval.
  // Per CONTEXT.md Area 1: log + continue on failure; do NOT roll back the approval.
  if (!result.alreadyApproved) {
    try {
      // Most-recent feedback comment for excerpt; count overflow.
      const feedbackRows = await db
        .select({ body: releaseFeedback.body })
        .from(releaseFeedback)
        .where(eq(releaseFeedback.releaseId, release.id))
        .orderBy(desc(releaseFeedback.createdAt));

      const latest = feedbackRows[0]?.body ?? '';
      const excerpt = latest.length > 200 ? latest.slice(0, 200) + '…' : latest;
      const overflow = Math.max(0, feedbackRows.length - 1);

      const slackResult = await notifyReleaseApproved({
        releaseId: release.id,
        project: release.project,
        version: release.version,
        approverEmail: ctx.email,
        status: result.release.status ?? 'approved',
        feedbackExcerpt: excerpt,
        feedbackOverflowCount: overflow,
      });
      if (!slackResult.ok) {
        console.warn('[slack] notifyReleaseApproved failed', { releaseId: release.id, error: slackResult.error });
      }
    } catch (err) {
      console.warn('[slack] notifyReleaseApproved threw', { releaseId: release.id, error: String(err) });
    }
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
