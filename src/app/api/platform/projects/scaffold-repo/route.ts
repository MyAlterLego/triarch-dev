import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { projects } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function POST(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { projectKey, repoName, isPrivate = true } = await req.json();
  if (!projectKey) {
    return NextResponse.json({ error: 'projectKey is required' }, { status: 400 });
  }

  const rows = await db.select().from(projects).where(eq(projects.key, projectKey));
  if (!rows.length) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  const project = rows[0];

  if (project.githubRepo) {
    return NextResponse.json({ error: 'Project already has a GitHub repo', repo: project.githubRepo }, { status: 409 });
  }

  const name = repoName || projectKey;
  const org = 'MyAlterLego';

  try {
    // Create repo via GitHub API
    const ghToken = process.env.GITHUB_TOKEN;
    if (!ghToken) {
      return NextResponse.json({ error: 'GITHUB_TOKEN not configured' }, { status: 500 });
    }

    const createRes = await fetch(`https://api.github.com/orgs/${org}/repos`, {
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
      const ghError = await createRes.json();
      return NextResponse.json({ error: `GitHub: ${ghError.message || createRes.statusText}` }, { status: createRes.status });
    }

    const repo = await createRes.json();
    const fullName = repo.full_name as string;

    // Update project record
    await db.update(projects)
      .set({ githubRepo: fullName, updatedAt: new Date() })
      .where(eq(projects.id, project.id));

    return NextResponse.json({
      repo: fullName,
      url: repo.html_url,
      cloneUrl: repo.clone_url,
    }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
