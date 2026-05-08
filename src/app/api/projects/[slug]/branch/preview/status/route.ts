import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getCurrentUserContext } from '@/lib/auth-context';
import { db } from '@/lib/db';
import { projects } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { getFahRolloutState } from '@/lib/fah-rollout';

// 8-minute hard cap — Pitfall 2: FAH rollout stuck in PENDING/CREATING would permanently lock
// the project's preview slot if we don't force-clear after this threshold.
const TIMEOUT_MS = 8 * 60 * 1000; // 480_000 ms

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
// GET /api/projects/[slug]/branch/preview/status
//
// Polls FAH state for the current in-flight branch preview swap.
// Enforces 8-min timeout BEFORE FAH poll (Pitfall 2 hard cap).
// Auto-clears lock on terminal state using branch-guarded UPDATE (PREV-06).
// ---------------------------------------------------------------------------

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const auth = await authForProject(slug);
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status });

  // Read current project lock state
  const [project] = await db
    .select({
      previewBranchLocked: projects.previewBranchLocked,
      previewBranchLockedAt: projects.previewBranchLockedAt,
      metadata: projects.metadata,
    })
    .from(projects)
    .where(eq(projects.key, slug));

  if (!project) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  // No lock → idle (no swap in flight)
  if (!project.previewBranchLocked || !project.previewBranchLockedAt) {
    return NextResponse.json({
      branch: null,
      state: 'idle',
      locked_at: null,
      locked_by: null,
      started_at: null,
      terminal: true,
    });
  }

  const branch = project.previewBranchLocked;
  const lockedAt = project.previewBranchLockedAt;
  const md = (project.metadata ?? {}) as Record<string, unknown>;
  const rolloutResourcePath = typeof md.previewRolloutName === 'string' ? md.previewRolloutName : undefined;
  const lockedBy = typeof md.previewLockedBy === 'string' ? md.previewLockedBy : null;
  const ageMs = Date.now() - lockedAt.getTime();

  // 8-minute timeout — Pitfall 2 hard cap. Must run BEFORE FAH poll so a permanently
  // stuck rollout cannot hold the lock indefinitely and block the UI forever.
  if (ageMs > TIMEOUT_MS) {
    await db.update(projects)
      .set({ previewBranchLocked: null, previewBranchLockedAt: null })
      .where(and(eq(projects.key, slug), eq(projects.previewBranchLocked, branch)))
      .returning();
    return NextResponse.json({
      branch,
      state: 'timeout',
      locked_at: lockedAt.toISOString(),
      locked_by: lockedBy,
      started_at: lockedAt.toISOString(),
      terminal: true,
    });
  }

  // No rollout name in metadata yet — POST just acquired the lock but metadata update
  // hasn't landed yet (race window < 1s). Treat as early PENDING; next poll will have it.
  if (!rolloutResourcePath) {
    return NextResponse.json({
      branch,
      state: 'PENDING',
      locked_at: lockedAt.toISOString(),
      locked_by: lockedBy,
      started_at: lockedAt.toISOString(),
      terminal: false,
    });
  }

  // Poll FAH for current rollout state
  const result = await getFahRolloutState(rolloutResourcePath);
  if (!result.ok) {
    // FAH poll error: surface as degraded in-flight state; do NOT clear lock —
    // the next poll may succeed (transient FAH unavailability)
    return NextResponse.json({
      branch,
      state: 'PENDING',
      locked_at: lockedAt.toISOString(),
      locked_by: lockedBy,
      started_at: lockedAt.toISOString(),
      terminal: false,
      errorMessage: `FAH poll error: ${result.error}`,
      rolloutResourcePath,
    });
  }

  const terminal = ['SUCCEEDED', 'FAILED', 'CANCELLED'].includes(result.state);
  if (terminal) {
    // Branch-guarded lock clear — stale-poll guard (PREV-06).
    // If a new swap acquired a DIFFERENT lock since this GET started, the branch-guarded
    // WHERE (previewBranchLocked = $branch) will NOT match and the newer lock is preserved.
    await db.update(projects)
      .set({ previewBranchLocked: null, previewBranchLockedAt: null })
      .where(and(eq(projects.key, slug), eq(projects.previewBranchLocked, branch)))
      .returning();
  }

  return NextResponse.json({
    branch,
    state: result.state,
    locked_at: lockedAt.toISOString(),
    locked_by: lockedBy,
    started_at: lockedAt.toISOString(),
    terminal,
    ...(result.errorMessage ? { errorMessage: result.errorMessage } : {}),
    rolloutResourcePath,
  });
}
