import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { projects } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { ensurePullRequest, mergeBranchToMain } from '@/lib/github-app';

/**
 * POST /api/platform/projects/[id]/promote
 *
 * Staff-only. Opens (or reuses) a dev→main PR on the project's github_repo
 * and merges it as a merge commit (preserves dev's commit hashes in main's
 * ancestry — required by the verify-dev-deployed gate on consumer repos).
 *
 * Used by the "Promote to Prod" button on /admin/platform/projects. The
 * same flow is exposed via `/triarch promote <project>` in Slack.
 *
 * Body (all optional):
 *   { headBranch?: string, baseBranch?: string }   // default 'dev' / 'main'
 *
 * Response:
 *   200 { merged: true, prNumber, sha, htmlUrl, wasCreated }
 *   200 { merged: false, reason: 'no_commits_ahead' | 'merge_failed' | ..., ... }
 *   400 { error: string }
 *   404 { error: 'project_not_found' }
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireStaff();
  if (error) return error;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const headBranch = (body.headBranch as string | undefined) ?? 'dev';
  const baseBranch = (body.baseBranch as string | undefined) ?? 'main';

  const [project] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
  if (!project) return NextResponse.json({ error: 'project_not_found' }, { status: 404 });

  if (!project.githubRepo || !project.githubRepo.includes('/')) {
    return NextResponse.json(
      { error: 'project_missing_github_repo', detail: `project ${project.key} has no github_repo set` },
      { status: 400 },
    );
  }
  const [owner, repo] = project.githubRepo.split('/');

  // 1. Open or reuse the dev→main PR.
  const ensured = await ensurePullRequest({
    owner,
    repo,
    headBranch,
    baseBranch,
    title: `Promote ${headBranch} → ${baseBranch}`,
    body: `Auto-opened by admin.triarch.dev "Promote to Prod" button for project \`${project.key}\`.\n\nMerge will use \`merge_method: merge\` (NOT squash) so dev's commit hashes survive in ${baseBranch}'s ancestry — needed for the \`verify-dev-deployed\` gate on consumer repos.`,
  });

  if ('ok' in ensured && ensured.ok === false) {
    return NextResponse.json(
      {
        merged: false,
        reason: ensured.reason,
        ...('statusCode' in ensured ? { statusCode: ensured.statusCode, message: ensured.message } : { headBranch, baseBranch }),
      },
      { status: 200 },
    );
  }

  const prNumber = 'prNumber' in ensured ? ensured.prNumber : null;
  const prUrl = 'htmlUrl' in ensured ? ensured.htmlUrl : null;
  const wasCreated = 'created' in ensured && ensured.created === true;

  // 2. Merge it.
  const result = await mergeBranchToMain({ owner, repo, headBranch, baseBranch });
  if (result.merged) {
    return NextResponse.json({
      merged: true,
      prNumber: result.prNumber,
      sha: result.sha,
      htmlUrl: result.htmlUrl,
      wasCreated,
    });
  }
  return NextResponse.json(
    {
      merged: false,
      reason: result.reason,
      ...(result.reason === 'merge_failed'
        ? { prNumber: result.prNumber, statusCode: result.statusCode, message: result.message }
        : { headBranch, baseBranch, prNumber, prUrl }),
    },
    { status: 200 },
  );
}
