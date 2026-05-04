import { NextRequest, NextResponse } from 'next/server';
import { requireSignedIn } from '@/lib/api-auth';
import { getCurrentUserContext } from '@/lib/auth-context';
import { db } from '@/lib/db';
import { releaseLogs, releaseFeedback, projects } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

const DELETE_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string; releaseId: string; feedbackId: string }> }
) {
  const { error, session } = await requireSignedIn();
  if (error) return error;

  const { slug, releaseId, feedbackId } = await params;
  const ctx = await getCurrentUserContext(session);
  if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Project lookup
  const [project] = await db
    .select({ key: projects.key })
    .from(projects)
    .where(eq(projects.key, slug));
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Membership 404-no-leak — same pattern as POST route and release-logs canonical
  const membership = ctx.memberships.find((m) => m.project_key === project.key);
  const isMember = ctx.isStaff || !!membership;
  if (!isMember) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Verify the feedback row exists, belongs to the release, and the release belongs to the project.
  // Join through releaseLogs to prevent cross-project deletion via URL tampering.
  const [row] = await db
    .select({
      id: releaseFeedback.id,
      authorEmail: releaseFeedback.authorEmail,
      createdAt: releaseFeedback.createdAt,
      releaseProject: releaseLogs.project,
    })
    .from(releaseFeedback)
    .innerJoin(releaseLogs, eq(releaseLogs.id, releaseFeedback.releaseId))
    .where(
      and(
        eq(releaseFeedback.id, feedbackId),
        eq(releaseFeedback.releaseId, releaseId),
        eq(releaseLogs.project, project.key)
      )
    );
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Author check — case-insensitive per project-wide email convention
  const isAuthor = row.authorEmail.toLowerCase() === ctx.email.toLowerCase();
  if (!isAuthor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // 24h window check — CONTEXT: "Authors can DELETE their own comments within 24h"
  const ageMs = Date.now() - row.createdAt.getTime();
  if (ageMs > DELETE_WINDOW_MS) {
    return NextResponse.json(
      { error: 'Delete window has expired (24 hours)' },
      { status: 403 }
    );
  }

  // Hard delete — comment IDs not referenced elsewhere; no tombstone needed per CONTEXT
  await db.delete(releaseFeedback).where(eq(releaseFeedback.id, feedbackId));

  return NextResponse.json({ ok: true }, { status: 200 });
}
