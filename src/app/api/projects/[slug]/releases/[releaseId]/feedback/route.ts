import { NextRequest, NextResponse } from 'next/server';
import { requireSignedIn } from '@/lib/api-auth';
import { getCurrentUserContext } from '@/lib/auth-context';
import { db } from '@/lib/db';
import { releaseLogs, releaseFeedback, projects } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

const FEEDBACK_MAX_CHARS = 2000;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; releaseId: string }> }
) {
  const { error, session } = await requireSignedIn();
  if (error) return error;

  const { slug, releaseId } = await params;
  const ctx = await getCurrentUserContext(session);
  if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Look up project by slug (= projects.key)
  const [project] = await db
    .select({ key: projects.key })
    .from(projects)
    .where(eq(projects.key, slug));
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Membership check — 404-no-leak pattern (non-member gets same 404 as unknown project)
  const membership = ctx.memberships.find((m) => m.project_key === project.key);
  const isMember = ctx.isStaff || !!membership;
  if (!isMember) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Role check — only admin (or staff) may POST feedback per UI-SPEC State Matrix
  // Viewers are members but get 403 (not 404) — they exist in the project, just not privileged enough
  const isAdmin = ctx.isStaff || membership?.role === 'admin';
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Look up release by id and verify it belongs to this project
  const [release] = await db
    .select({ id: releaseLogs.id, project: releaseLogs.project })
    .from(releaseLogs)
    .where(and(eq(releaseLogs.id, releaseId), eq(releaseLogs.project, project.key)));
  if (!release) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Body validation
  const body = await req.json().catch(() => null);
  const text = typeof body?.body === 'string' ? body.body.trim() : '';
  if (!text) return NextResponse.json({ error: 'Comment body is required' }, { status: 400 });
  if (text.length > FEEDBACK_MAX_CHARS) {
    return NextResponse.json(
      { error: `Comment exceeds ${FEEDBACK_MAX_CHARS} characters` },
      { status: 400 }
    );
  }

  const [inserted] = await db
    .insert(releaseFeedback)
    .values({
      releaseId: release.id,
      authorEmail: ctx.email,
      body: text,
    })
    .returning();

  return NextResponse.json(
    {
      id: inserted.id,
      releaseId: inserted.releaseId,
      authorEmail: inserted.authorEmail,
      body: inserted.body,
      createdAt: inserted.createdAt.toISOString(),
    },
    { status: 201 }
  );
}
