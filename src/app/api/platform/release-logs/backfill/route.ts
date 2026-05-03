import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { projects } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { syncProject, SyncProjectResult } from '@/lib/release-sync';

/**
 * POST /api/platform/release-logs/backfill
 *
 * One-shot historical backfill of release_logs from GitHub for every
 * registered project (or one, when ?key=). Reads:
 *   1. GitHub Releases (formal release/tag pairs)
 *   2. main-branch commits with `vX.Y.Z` prefix (the actual pattern used)
 *
 * Idempotent — re-runnable. Only inserts (project, version) pairs that
 * don't already exist.
 *
 * Body: { key?: string, limit?: number }
 *   - key:   sync only this project (default: all)
 *   - limit: per-source page size (default 100)
 */
export async function POST(req: NextRequest) {
  const { error } = await requireStaff();
  if (error) return error;

  const ghToken = process.env.GITHUB_TOKEN;
  if (!ghToken) {
    return NextResponse.json({ error: 'GITHUB_TOKEN not configured' }, { status: 500 });
  }

  const body = await req.json().catch(() => ({}));
  const { key, limit = 100 } = body as { key?: string; limit?: number };

  const rows = key
    ? await db.select().from(projects).where(eq(projects.key, key))
    : await db.select().from(projects);

  if (key && rows.length === 0) {
    return NextResponse.json({ error: `No project with key=${key}` }, { status: 404 });
  }

  const results: SyncProjectResult[] = [];
  let totalInserted = 0;

  for (const project of rows) {
    const result = await syncProject(project, ghToken, limit);
    results.push(result);
    totalInserted += result.inserted;
  }

  return NextResponse.json({ results, totalInserted });
}
