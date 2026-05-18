/**
 * POST /api/admin/projects/[slug]/generate-build — Phase 37 TRIG-06.
 *
 * Staff-only endpoint. Loads project + all approved_for_build items, generates a
 * Claude Code-ready prompt via buildPrompt(), writes a single approval_events
 * audit row, returns {prompt, mode, item_count}.
 *
 * Audit row spec (CONTEXT.md TRIG-06):
 *   subject_type='build_trigger' | subject_id=project.id | decision='triggered'
 *   surface='web' | actor_email=session.user.email
 *   comment=prompt.slice(0,200) | metadata={mode, item_count} | project=project.key
 *
 * Pitfall 9 (Next.js 16): params is a Promise — must `await` before destructure.
 */
import { NextRequest, NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { requireStaff } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { projects, bugReports, featureRequests, approvalEvents } from '@/db/schema';
import { buildPrompt, type BuildPromptItem } from '@/lib/build-prompt';
import type { BuildTriggerMode } from '@/lib/build-trigger-mode';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { error, session } = await requireStaff();
  if (error) return error;

  const { slug } = await params;

  // ── Project lookup ──
  const projectRows = await db
    .select()
    .from(projects)
    .where(eq(projects.key, slug))
    .limit(1);
  const project = projectRows[0];
  if (!project) {
    return NextResponse.json({ error: 'project_not_found' }, { status: 404 });
  }

  // ── Block managed_agent placeholder (v2.5 — Phase 38 RFC) ──
  if (project.buildTriggerMode === 'managed_agent') {
    return NextResponse.json(
      { error: 'managed_agent_not_available' },
      { status: 400 },
    );
  }

  // ── Load both entity types in parallel ──
  const [bugs, features] = await Promise.all([
    db
      .select()
      .from(bugReports)
      .where(
        and(
          eq(bugReports.project, slug),
          eq(bugReports.inclusionState, 'approved_for_build'),
        ),
      ),
    db
      .select()
      .from(featureRequests)
      .where(
        and(
          eq(featureRequests.project, slug),
          eq(featureRequests.inclusionState, 'approved_for_build'),
        ),
      ),
  ]);

  const items: BuildPromptItem[] = [
    ...bugs.map((b) => ({
      id: b.id,
      type: 'bug' as const,
      title: b.title,
      description: b.description ?? '',
      buildPlan: null, // bugReports has no buildPlan column today
      severity: b.severity ?? null,
    })),
    ...features.map((f) => ({
      id: f.id,
      type: 'feature' as const,
      title: f.title,
      description: f.description ?? '',
      buildPlan: f.buildPlan ?? null, // jsonb on featureRequests
    })),
  ];

  if (items.length === 0) {
    // Defensive: UI button is supposed to be disabled at 0 items.
    return NextResponse.json({ error: 'no_approved_items' }, { status: 409 });
  }

  const prompt = buildPrompt({
    project: {
      key: project.key,
      name: project.name,
      currentVersion: project.currentVersion ?? null,
      githubRepo: project.githubRepo ?? null,
      deployedUrl: project.deployedUrl ?? null,
    },
    items,
  });

  const mode = project.buildTriggerMode as BuildTriggerMode;
  const actorEmail = session?.user?.email ?? 'unknown';

  await db.insert(approvalEvents).values({
    subjectType: 'build_trigger',
    subjectId: project.id,
    decision: 'triggered',
    surface: 'web',
    actorEmail,
    comment: prompt.slice(0, 200), // TRIG-06: first 200 chars
    metadata: { mode, item_count: items.length },
    project: project.key,
  });

  return NextResponse.json({ prompt, mode, item_count: items.length });
}
