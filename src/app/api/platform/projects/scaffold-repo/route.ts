import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { projects } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { generateScaffoldFiles } from '@/lib/scaffold-template';
import { pushFilesToRepo, registerDeployWebhook } from '@/lib/github-push';

/**
 * Creates a private GitHub repo for the project AND populates it with the
 * generated scaffold in a single atomic commit. Also registers a
 * github-deploy webhook so the admin can track future deploys.
 */
export async function POST(req: NextRequest) {
  const { error } = await requireStaff();
  if (error) return error;

  const { projectKey, repoName, isPrivate = true } = await req.json();
  if (!projectKey) {
    return NextResponse.json({ error: 'projectKey is required' }, { status: 400 });
  }

  const rows = await db.select().from(projects).where(eq(projects.key, projectKey));
  if (!rows.length) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  const project = rows[0];

  if (project.githubRepo) {
    return NextResponse.json(
      { error: 'Project already has a GitHub repo', repo: project.githubRepo },
      { status: 409 }
    );
  }

  const ghToken = process.env.GITHUB_TOKEN;
  if (!ghToken) {
    return NextResponse.json({ error: 'GITHUB_TOKEN not configured' }, { status: 500 });
  }

  const name = repoName || projectKey;
  const org = 'MyAlterLego';

  // MyAlterLego is a User account, not an Org. POST /orgs/.../repos returns
  // 404 for user accounts. POST /user/repos creates under the authenticated
  // user, which is what we want as long as GITHUB_TOKEN is authed as
  // MyAlterLego.
  const createRes = await fetch(`https://api.github.com/user/repos`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ghToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/vnd.github+json',
    },
    body: JSON.stringify({
      name,
      description: project.description || `${project.name} — triarch.dev project`,
      private: isPrivate,
      auto_init: true,
    }),
  });

  if (!createRes.ok) {
    const ghError = await createRes.json().catch(() => ({}));
    return NextResponse.json(
      { error: `GitHub: ${ghError.message || createRes.statusText}` },
      { status: createRes.status }
    );
  }

  const repo = await createRes.json();
  const fullName = repo.full_name as string;

  let commitInfo: { commitSha: string; commitUrl: string } | null = null;
  let pushError: string | null = null;
  try {
    const files = generateScaffoldFiles(project);
    commitInfo = await pushFilesToRepo({
      owner: org,
      repo: name,
      branch: 'main',
      files,
      commitMessage: `v0.1.0: scaffold ${project.name} from triarch-dev admin`,
      ghToken,
    });
  } catch (err) {
    pushError = err instanceof Error ? err.message : String(err);
    console.error('Scaffold push failed:', pushError);
  }

  let webhookRegistered = false;
  const webhookUrl = process.env.DEPLOY_WEBHOOK_URL;
  const webhookSecret = process.env.DEPLOY_WEBHOOK_SECRET;
  if (webhookUrl && webhookSecret) {
    try {
      const hook = await registerDeployWebhook({
        owner: org,
        repo: name,
        webhookUrl,
        secret: webhookSecret,
        ghToken,
      });
      webhookRegistered = !!hook;
    } catch (err) {
      console.error('Webhook registration failed:', err);
    }
  }

  await db
    .update(projects)
    .set({ githubRepo: fullName, updatedAt: new Date() })
    .where(eq(projects.id, project.id));

  return NextResponse.json(
    {
      repo: fullName,
      url: repo.html_url,
      cloneUrl: repo.clone_url,
      scaffoldCommit: commitInfo,
      scaffoldPushError: pushError,
      webhookRegistered,
    },
    { status: 201 }
  );
}
