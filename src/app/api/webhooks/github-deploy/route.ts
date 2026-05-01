import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { db } from '@/lib/db';
import { projects, releaseLogs } from '@/db/schema';
import { and, eq } from 'drizzle-orm';

/**
 * GitHub webhook listener for deploy / release events.
 *
 * Registered automatically per-project by /api/platform/projects/scaffold-repo
 * (events: workflow_run, release). Updates `projects.currentVersion`,
 * `projects.deployedUrl`, and `projects.status` so the admin dashboard
 * reflects live deploy state.
 *
 * Security: HMAC-SHA256 signature in `x-hub-signature-256` header verified
 * against DEPLOY_WEBHOOK_SECRET. Reject if missing or mismatched.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.DEPLOY_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'DEPLOY_WEBHOOK_SECRET not configured' }, { status: 500 });
  }

  const sig = req.headers.get('x-hub-signature-256');
  if (!sig) return NextResponse.json({ error: 'Missing signature' }, { status: 401 });

  const raw = await req.text();
  const expected =
    'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const event = req.headers.get('x-github-event');
  const payload = JSON.parse(raw);
  const repoFullName: string | undefined = payload?.repository?.full_name;
  if (!repoFullName) return NextResponse.json({ ignored: 'no repo' });

  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.githubRepo, repoFullName))
    .limit(1);
  if (!project) return NextResponse.json({ ignored: 'unknown repo', repo: repoFullName });

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  let action: string | null = null;
  let releaseLogged: { version: string; type: string } | null = null;

  async function logReleaseIfNew(version: string, releaseType: string, releasedBy: string, summary: string, metadata: Record<string, unknown>) {
    const existing = await db
      .select({ id: releaseLogs.id })
      .from(releaseLogs)
      .where(and(eq(releaseLogs.project, project.key), eq(releaseLogs.version, version)))
      .limit(1);
    if (existing.length > 0) return;
    await db.insert(releaseLogs).values({
      project: project.key,
      version,
      releaseType,
      releasedAt: new Date(),
      releasedBy,
      summary,
      entries: [],
      metadata: { source: 'github_webhook', ...metadata },
    });
    releaseLogged = { version, type: releaseType };
  }

  if (event === 'release' && payload.action === 'published') {
    const tagName: string | undefined = payload.release?.tag_name;
    if (tagName) {
      const version = tagName.startsWith('v') ? tagName : `v${tagName}`;
      updates.currentVersion = version;
      action = `release ${tagName}`;
      await logReleaseIfNew(
        version,
        'unknown',
        payload.release?.author?.login ?? 'github',
        payload.release?.name || tagName,
        { html_url: payload.release?.html_url, body: payload.release?.body ?? '' }
      );
    }
  } else if (event === 'workflow_run' && payload.action === 'completed') {
    const run = payload.workflow_run;
    const conclusion: string | undefined = run?.conclusion;
    const headBranch: string | undefined = run?.head_branch;
    const commitMsg: string | undefined = run?.head_commit?.message;

    if (headBranch === 'main') {
      if (conclusion === 'success') {
        updates.status = 'active';
        const versionMatch = commitMsg?.match(/^v(\d+\.\d+\.\d+(?:[\w.-]+)?)/);
        if (versionMatch) {
          const version = `v${versionMatch[1]}`;
          updates.currentVersion = version;
          const summary = (commitMsg ?? '').split('\n')[0].replace(/^v[\d.]+(?:[\w.-]+)?[:\s-]+/, '').trim() || version;
          await logReleaseIfNew(
            version,
            'unknown',
            run?.head_commit?.author?.name ?? 'unknown',
            summary,
            { sha: run?.head_sha, run_url: run?.html_url, run_id: run?.id }
          );
        }
        action = `deploy success${versionMatch ? ` (${versionMatch[0]})` : ''}`;
      } else if (conclusion === 'failure') {
        updates.status = 'deploy_failed';
        action = 'deploy failure';
      }
    }
  }

  if (action) {
    await db.update(projects).set(updates).where(eq(projects.id, project.id));
  }

  return NextResponse.json({
    received: true,
    event,
    repo: repoFullName,
    project: project.key,
    action: action ?? 'no-op',
    releaseLogged,
  });
}
