import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { projects } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { syncFromGithub, diff, SyncResult } from '@/lib/sync-project-state';

/**
 * POST /api/platform/projects/sync-state
 *
 * Backfills currentVersion + status for every project (or one, when ?key=)
 * by polling GitHub for latest release / last main-branch workflow run.
 *
 * Body (optional): { key?: string, dryRun?: boolean }
 *   - key: sync only this project (default: all)
 *   - dryRun: report what would change but do not write
 *
 * Returns: { results: SyncResult[], updated: number }
 */
export async function POST(req: NextRequest) {
  const { error } = await requireStaff();
  if (error) return error;

  const ghToken = process.env.GITHUB_TOKEN;
  if (!ghToken) {
    return NextResponse.json({ error: 'GITHUB_TOKEN not configured' }, { status: 500 });
  }

  const body = await req.json().catch(() => ({}));
  const { key, dryRun = false } = body as { key?: string; dryRun?: boolean };

  const rows = key
    ? await db.select().from(projects).where(eq(projects.key, key))
    : await db.select().from(projects);

  if (key && rows.length === 0) {
    return NextResponse.json({ error: `No project with key=${key}` }, { status: 404 });
  }

  const results: SyncResult[] = [];
  let updatedCount = 0;

  for (const project of rows) {
    try {
      const synced = await syncFromGithub(project, ghToken);
      const result = diff(project, synced);
      results.push(result);

      if (result.changed && !dryRun) {
        await db
          .update(projects)
          .set({
            currentVersion: result.after.currentVersion,
            status: result.after.status,
            updatedAt: new Date(),
          })
          .where(eq(projects.id, project.id));
        updatedCount++;
      }
    } catch (err) {
      results.push({
        key: project.key,
        ok: false,
        changed: false,
        before: { currentVersion: project.currentVersion, status: project.status },
        after: { currentVersion: project.currentVersion, status: project.status },
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({ results, updated: updatedCount, dryRun });
}
