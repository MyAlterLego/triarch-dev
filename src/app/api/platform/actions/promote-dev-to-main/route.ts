// POST /api/platform/actions/promote-dev-to-main
//
// v2.5 L1 (Phase 39). Staff-only admin-action endpoint.
// Looks up a project by `key`, parses its `github_repo` field, and opens a
// PR with base=main, head=dev. Idempotent: returns the existing open PR if
// one already exists (so a double-click is a no-op, not a 422).
//
// Body: { project_key: string, title?: string, body?: string }
// Returns:
//   201 { ok:true, created:true, pr_number, pr_url, sha }
//   200 { ok:true, created:false, reason:'already_open', pr_number, pr_url }
//   200 { ok:true, created:false, reason:'no_diff' }
//   400/401/403/404/500 on error
//
// Every call (success or fail) writes an `approval_events` row with
// subject_type='cicd_promote_dev_to_main' so the audit trail captures
// who clicked the button, when, and what happened.
//
// Pattern: mirrors src/lib/release-promotion.ts which already wraps
// github-app calls in an audit-then-act pattern.

import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { requireStaff } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { projects } from '@triarchsecurity/triarch-shared/schema';
import { approvalEvents } from '@/db/schema';
import { createPullRequest } from '@/lib/github-app';

const SUBJECT_TYPE = 'cicd_promote_dev_to_main';
const SURFACE = 'web';

interface RequestBody {
  project_key?: string;
  title?: string;
  body?: string;
}

function parseOwnerRepo(githubRepo: string | null): { owner: string; repo: string } | null {
  if (!githubRepo) return null;
  // Accept "owner/repo" or "https://github.com/owner/repo" or with .git suffix.
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
      subjectId:   `${args.projectKey}:dev-to-main`,
      decision:    args.decision,
      surface:     SURFACE,
      actorEmail:  args.actorEmail,
      comment:     args.comment ?? null,
      metadata:    args.metadata,
      project:     args.projectKey,
    });
  } catch (err) {
    // Audit failure must not break the action — log and continue.
    console.error('[promote-dev-to-main] audit insert failed:', err);
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
      metadata: { reason: 'no_github_repo', github_repo_raw: project.githubRepo },
    });
    return NextResponse.json(
      { ok: false, error: 'project has no github_repo configured', project_key: projectKey },
      { status: 400 }
    );
  }

  const title = body.title?.trim() || `Promote dev → main`;
  const prBody = body.body?.trim() || `Auto-opened from /admin/modules/ci-cd by ${actorEmail}.`;

  try {
    const result = await createPullRequest({
      owner: ownerRepo.owner,
      repo: ownerRepo.repo,
      headBranch: 'dev',
      baseBranch: 'main',
      title,
      body: prBody,
    });

    if (result.created) {
      await writeAudit({
        projectKey, actorEmail, decision: 'created',
        metadata: { ...ownerRepo, pr_number: result.prNumber, pr_url: result.htmlUrl, sha: result.sha },
      });
      return NextResponse.json(
        { ok: true, created: true, pr_number: result.prNumber, pr_url: result.htmlUrl, sha: result.sha },
        { status: 201 },
      );
    }

    if (result.reason === 'already_open') {
      await writeAudit({
        projectKey, actorEmail, decision: 'already_open',
        metadata: { ...ownerRepo, pr_number: result.prNumber, pr_url: result.htmlUrl },
      });
      return NextResponse.json(
        { ok: true, created: false, reason: 'already_open', pr_number: result.prNumber, pr_url: result.htmlUrl },
        { status: 200 },
      );
    }

    if (result.reason === 'no_diff') {
      await writeAudit({
        projectKey, actorEmail, decision: 'no_diff',
        metadata: { ...ownerRepo },
      });
      return NextResponse.json(
        { ok: true, created: false, reason: 'no_diff', message: 'dev is not ahead of main' },
        { status: 200 },
      );
    }

    // gh_error
    await writeAudit({
      projectKey, actorEmail, decision: 'failed',
      metadata: { ...ownerRepo, status_code: result.statusCode, message: result.message },
    });
    return NextResponse.json(
      { ok: false, error: 'github_error', status_code: result.statusCode, message: result.message },
      { status: 502 },
    );
  } catch (err) {
    const message = (err as Error)?.message ?? 'unknown error';
    await writeAudit({
      projectKey, actorEmail, decision: 'error',
      metadata: { ...ownerRepo, message },
    });
    return NextResponse.json(
      { ok: false, error: 'exception', message },
      { status: 500 },
    );
  }
}
