// POST /api/platform/actions/merge-pr
//
// v2.5 L1 (Phase 39). Staff-only admin-action endpoint.
// Looks up a project by `key`, parses its `github_repo`, and merges the
// open dev → main PR if one exists. Reuses the existing
// `mergeBranchToMain` helper in src/lib/github-app.ts (originally added
// for the round-trip promote flow); the v2.5 button just exposes it
// behind a per-project staff-gated audit-logged surface.
//
// Body: { project_key: string }
// Returns:
//   200 { ok:true, merged:true, pr_number, sha, pr_url }
//   200 { ok:true, merged:false, reason:'no_open_pr' }
//   200 { ok:true, merged:false, reason:'merge_failed', pr_number, status_code, message }
//   400/401/403/404/500 on error
//
// Every call writes to approval_events with subject_type='cicd_merge_pr'.

import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { requireStaff } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { projects } from '@triarchsecurity/triarch-shared/schema';
import { approvalEvents } from '@/db/schema';
import { mergeBranchToMain } from '@/lib/github-app';

const SUBJECT_TYPE = 'cicd_merge_pr';
const SURFACE = 'web';

interface RequestBody {
  project_key?: string;
  head_branch?: string;  // defaults to 'dev' — exposed for callers who want to merge a different branch
}

function parseOwnerRepo(githubRepo: string | null): { owner: string; repo: string } | null {
  if (!githubRepo) return null;
  const m = githubRepo
    .replace(/^https?:\/\/github\.com\//i, '')
    .replace(/\.git$/i, '')
    .match(/^([^\/]+)\/([^\/]+)$/);
  if (!m) return null;
  return { owner: m[1], repo: m[2] };
}

async function writeAudit(args: {
  projectKey: string;
  actorEmail: string;
  decision: string;
  metadata: Record<string, unknown>;
  comment?: string | null;
}): Promise<void> {
  try {
    await db.insert(approvalEvents).values({
      subjectType: SUBJECT_TYPE,
      subjectId:   `${args.projectKey}:${(args.metadata.head_branch ?? 'dev')}-to-main`,
      decision:    args.decision,
      surface:     SURFACE,
      actorEmail:  args.actorEmail,
      comment:     args.comment ?? null,
      metadata:    args.metadata,
      project:     args.projectKey,
    });
  } catch (err) {
    console.error('[merge-pr] audit insert failed:', err);
  }
}

export async function POST(req: NextRequest) {
  const { error, session } = await requireStaff();
  if (error) return error;
  const actorEmail = session?.user?.email ?? 'unknown';

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const projectKey = body.project_key?.trim();
  if (!projectKey) {
    return NextResponse.json({ ok: false, error: 'project_key is required' }, { status: 400 });
  }
  const headBranch = body.head_branch?.trim() || 'dev';

  const [project] = await db
    .select({ key: projects.key, name: projects.name, githubRepo: projects.githubRepo })
    .from(projects)
    .where(eq(projects.key, projectKey))
    .limit(1);

  if (!project) {
    return NextResponse.json({ ok: false, error: `project not found: ${projectKey}` }, { status: 404 });
  }

  const ownerRepo = parseOwnerRepo(project.githubRepo);
  if (!ownerRepo) {
    await writeAudit({
      projectKey, actorEmail, decision: 'failed',
      metadata: { reason: 'no_github_repo', github_repo_raw: project.githubRepo, head_branch: headBranch },
    });
    return NextResponse.json(
      { ok: false, error: 'project has no github_repo configured', project_key: projectKey },
      { status: 400 }
    );
  }

  try {
    const result = await mergeBranchToMain({
      owner:      ownerRepo.owner,
      repo:       ownerRepo.repo,
      headBranch,
      baseBranch: 'main',
    });

    if (result.merged) {
      await writeAudit({
        projectKey, actorEmail, decision: 'merged',
        metadata: { ...ownerRepo, head_branch: headBranch, pr_number: result.prNumber, sha: result.sha, pr_url: result.htmlUrl },
      });
      return NextResponse.json(
        { ok: true, merged: true, pr_number: result.prNumber, sha: result.sha, pr_url: result.htmlUrl },
        { status: 200 },
      );
    }

    if (result.reason === 'no_open_pr') {
      await writeAudit({
        projectKey, actorEmail, decision: 'no_open_pr',
        metadata: { ...ownerRepo, head_branch: headBranch },
      });
      return NextResponse.json(
        { ok: true, merged: false, reason: 'no_open_pr', head_branch: headBranch },
        { status: 200 },
      );
    }

    // merge_failed
    await writeAudit({
      projectKey, actorEmail, decision: 'merge_failed',
      metadata: { ...ownerRepo, head_branch: headBranch, pr_number: result.prNumber, status_code: result.statusCode, message: result.message },
    });
    return NextResponse.json(
      { ok: true, merged: false, reason: 'merge_failed', pr_number: result.prNumber, status_code: result.statusCode, message: result.message },
      { status: 200 },
    );
  } catch (err) {
    const message = (err as Error)?.message ?? 'unknown error';
    await writeAudit({
      projectKey, actorEmail, decision: 'error',
      metadata: { ...ownerRepo, head_branch: headBranch, message },
    });
    return NextResponse.json(
      { ok: false, error: 'exception', message },
      { status: 500 },
    );
  }
}
