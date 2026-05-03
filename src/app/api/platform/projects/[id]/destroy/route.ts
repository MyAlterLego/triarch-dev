import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { projects } from '@/db/schema';
import { eq } from 'drizzle-orm';
import {
  dropCrdbDatabaseAndUser,
  removeDnsRecords,
  deleteGithubRepo,
  deleteFirebaseProject,
} from '@/lib/decommission';

/**
 * POST /api/platform/projects/[id]/destroy
 *
 * Cascading destruction for a project. Burns it all down: CRDB database +
 * user, GoDaddy DNS records, GitHub repo, Firebase project, registry row.
 *
 * Safety guard: body must include { confirmKey: "<project.key>" } that
 * matches the project's key field exactly. Otherwise 400.
 *
 * Each step is best-effort and reported individually so a partial failure
 * (e.g. missing GH delete_repo scope) doesn't abort the rest. Caller can
 * inspect the returned `steps` object to see what landed.
 *
 * Required env: DATABASE_URL (cluster admin), GODADDY_API_KEY,
 *   GODADDY_API_SECRET, GITHUB_TOKEN (with delete_repo scope),
 *   GCLOUD_ACCESS_TOKEN (or rely on workload identity at runtime).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireStaff();
  if (error) return error;

  const { id } = await params;
  const { confirmKey, dropDb = true, dropDns = true, dropRepo = true, dropFirebase = true } =
    await req.json();

  const [project] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  if (confirmKey !== project.key) {
    return NextResponse.json(
      {
        error: 'confirmKey must match project.key exactly',
        expected: project.key,
        received: confirmKey,
      },
      { status: 400 }
    );
  }

  const steps: Record<string, unknown> = { project: project.key };

  if (dropDb && project.crdbDatabase) {
    steps.crdb = await dropCrdbDatabaseAndUser(
      project.crdbDatabase,
      project.crdbUser,
      process.env.DATABASE_URL!
    );
  } else {
    steps.crdb = { skipped: !project.crdbDatabase ? 'no crdb_database on project' : 'opted out' };
  }

  if (dropDns && project.subdomain) {
    if (!process.env.GODADDY_API_KEY || !process.env.GODADDY_API_SECRET) {
      steps.dns = { skipped: 'GODADDY_API_KEY/SECRET not configured' };
    } else {
      steps.dns = await removeDnsRecords(
        project.subdomain,
        process.env.GODADDY_API_KEY,
        process.env.GODADDY_API_SECRET
      );
    }
  } else {
    steps.dns = { skipped: !project.subdomain ? 'no subdomain' : 'opted out' };
  }

  if (dropRepo && project.githubRepo) {
    if (!process.env.GITHUB_TOKEN) {
      steps.github = { skipped: 'GITHUB_TOKEN not configured' };
    } else {
      steps.github = await deleteGithubRepo(project.githubRepo, process.env.GITHUB_TOKEN);
    }
  } else {
    steps.github = { skipped: !project.githubRepo ? 'no github_repo' : 'opted out' };
  }

  if (dropFirebase && project.firebaseProjectId) {
    const tok = process.env.GCLOUD_ACCESS_TOKEN;
    if (!tok) {
      steps.firebase = { skipped: 'GCLOUD_ACCESS_TOKEN not configured' };
    } else {
      steps.firebase = await deleteFirebaseProject(project.firebaseProjectId, tok);
    }
  } else {
    steps.firebase = { skipped: !project.firebaseProjectId ? 'no firebase_project_id' : 'opted out' };
  }

  await db.delete(projects).where(eq(projects.id, id));
  steps.registry = { ok: true, detail: 'deleted projects row' };

  return NextResponse.json({ destroyed: true, steps });
}
