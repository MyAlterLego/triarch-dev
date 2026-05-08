import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getCurrentUserContext } from '@/lib/auth-context';
import { db } from '@/lib/db';
import { projects } from '@/db/schema';
import { eq, and, isNull, sql } from 'drizzle-orm';
import { createFahRollout } from '@/lib/fah-rollout';

const BRANCH_REGEX = /^[a-zA-Z0-9/_.\-]{1,256}$/;
const FAH_LOCATION = 'us-central1';

// ---------------------------------------------------------------------------
// Auth helper — customer admin OR staff
// Per GATE-01 precedent: non-members get 404 (no project-existence leak),
// members-but-not-admin get 403.
// ---------------------------------------------------------------------------

async function authForProject(slug: string): Promise<
  | { ok: true; email: string; isStaff: boolean }
  | { ok: false; status: 401 | 403 | 404; body: { error: string } }
> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { ok: false, status: 401, body: { error: 'unauthorized' } };
  const ctx = await getCurrentUserContext(session);
  if (!ctx) return { ok: false, status: 401, body: { error: 'unauthorized' } };

  const [project] = await db.select({ key: projects.key }).from(projects).where(eq(projects.key, slug));
  if (!project) return { ok: false, status: 404, body: { error: 'not_found' } };

  const membership = ctx.memberships.find(m => m.project_key === slug);
  const isAdmin = ctx.isStaff || membership?.role === 'admin';
  if (!isAdmin) {
    // Per GATE-01 precedent (no project-existence leak): non-members get 404, members-but-not-admin get 403
    if (!membership && !ctx.isStaff) return { ok: false, status: 404, body: { error: 'not_found' } };
    return { ok: false, status: 403, body: { error: 'forbidden' } };
  }

  return { ok: true, email: ctx.email, isStaff: ctx.isStaff };
}

// ---------------------------------------------------------------------------
// POST /api/projects/[slug]/branch/preview
//
// Acquires a DB lock and dispatches a FAH rollout for the given branch.
// Uses atomic UPDATE-with-WHERE-IS-NULL race guard (Pitfall 1 / PROM-04 mirror).
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const auth = await authForProject(slug);
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status });

  // Parse body
  let body: { branch?: unknown };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const branch = typeof body.branch === 'string' ? body.branch : '';

  // Branch validation — BEFORE any DB or FAH call (security guard)
  if (!BRANCH_REGEX.test(branch)) {
    return NextResponse.json({ error: 'invalid_branch' }, { status: 400 });
  }

  // Atomic lock acquisition — Pitfall 1 / mirror PROM-04 pattern from plan 09-03
  // Exactly one of two concurrent callers receives a row back; the other's UPDATE returns [].
  const now = new Date();
  const locked = await db
    .update(projects)
    .set({ previewBranchLocked: branch, previewBranchLockedAt: now })
    .where(and(eq(projects.key, slug), isNull(projects.previewBranchLocked)))
    .returning({ key: projects.key, firebaseProjectId: projects.firebaseProjectId });

  if (locked.length === 0) {
    // Race lost — re-read to surface current lock holder
    const [current] = await db
      .select({
        previewBranchLocked: projects.previewBranchLocked,
        previewBranchLockedAt: projects.previewBranchLockedAt,
        metadata: projects.metadata,
      })
      .from(projects)
      .where(eq(projects.key, slug));
    const md = (current?.metadata ?? {}) as Record<string, unknown>;
    return NextResponse.json({
      error: 'lock_held',
      current_branch: current?.previewBranchLocked ?? null,
      locked_at: current?.previewBranchLockedAt?.toISOString() ?? null,
      locked_by: typeof md.previewLockedBy === 'string' ? md.previewLockedBy : null,
    }, { status: 409 });
  }

  const [project] = locked;
  const projectId = project.firebaseProjectId;
  if (!projectId) {
    // Defensive: no Firebase project ID on row → release lock + 500
    await db.update(projects)
      .set({ previewBranchLocked: null, previewBranchLockedAt: null })
      .where(eq(projects.key, slug))
      .returning();
    return NextResponse.json({ error: 'project_misconfigured', detail: 'firebaseProjectId is null' }, { status: 500 });
  }

  // Backend ID convention: <slug>-dev (e.g. tmi → tmi-dev)
  const backendId = `${slug}-dev`;

  // Dispatch FAH rollout
  const result = await createFahRollout({ projectId, location: FAH_LOCATION, backendId, branch });
  if (!result.ok) {
    // Release the lock — branch-guarded so we don't clear a different lock
    await db.update(projects)
      .set({ previewBranchLocked: null, previewBranchLockedAt: null })
      .where(and(eq(projects.key, slug), eq(projects.previewBranchLocked, branch)))
      .returning();
    return NextResponse.json({ error: 'fah_dispatch_failed', detail: result.error }, { status: 502 });
  }

  // Stamp metadata with rolloutName + lockedBy via jsonb_set
  // Uses nested jsonb_set to update two keys without overwriting the entire column (Pitfall 11)
  await db.update(projects)
    .set({
      metadata: sql`jsonb_set(jsonb_set(coalesce(${projects.metadata}, '{}'::jsonb), '{previewRolloutName}', ${JSON.stringify(result.rolloutName)}::jsonb, true), '{previewLockedBy}', ${JSON.stringify(auth.email)}::jsonb, true)`,
    })
    .where(eq(projects.key, slug))
    .returning();

  return NextResponse.json({
    rolloutName: result.rolloutName,
    state: result.state,
    locked_at: now.toISOString(),
    locked_by: auth.email,
  }, { status: 202 });
}
