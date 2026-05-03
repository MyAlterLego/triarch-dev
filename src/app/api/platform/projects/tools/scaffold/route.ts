import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { projects } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { generateScaffoldFiles } from '@/lib/scaffold-template';

/**
 * Returns a map of filename → content for the scaffold (preview / copy).
 * Actual repo population happens in /api/platform/projects/scaffold-repo.
 */
export async function POST(req: NextRequest) {
  const { error } = await requireStaff();
  if (error) return error;

  const { projectKey } = await req.json();
  if (!projectKey) {
    return NextResponse.json({ error: 'projectKey is required' }, { status: 400 });
  }

  const rows = await db.select().from(projects).where(eq(projects.key, projectKey));
  if (!rows.length) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  const project = rows[0];

  const files = generateScaffoldFiles(project);
  return NextResponse.json({ files, projectName: project.name });
}
