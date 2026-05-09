import { NextRequest, NextResponse } from 'next/server';
import { requireApiKey } from '@/lib/api-key-auth';
import { db } from '@/lib/db';
import { bugReports, workflowTransitions } from '@/db/schema';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  const { error, project } = await requireApiKey(req);
  if (error) return error;

  const body = await req.json();
  const { reportedByUserId, reportedByName, reportedByEmail, title, description, stepsToReproduce, expectedBehavior, actualBehavior, severity, priority, pageUrl, browserInfo } = body;

  if (!reportedByUserId || !title || !description) {
    return NextResponse.json({ error: 'reportedByUserId, title, and description are required' }, { status: 400 });
  }

  const [bug] = await db.insert(bugReports).values({
    project: project!.key,
    reportedByUserId,
    reportedByName: reportedByName ?? null,
    reportedByEmail: reportedByEmail ?? null,
    title,
    description,
    stepsToReproduce: stepsToReproduce ?? null,
    expectedBehavior: expectedBehavior ?? null,
    actualBehavior: actualBehavior ?? null,
    severity: severity ?? 'medium',
    priority: priority ?? 'fix_later',
    pageUrl: pageUrl ?? null,
    browserInfo: browserInfo ?? {},
  }).returning();

  await db.insert(workflowTransitions).values({
    entityType: 'bug_report',
    entityId: bug.id,
    fromStatus: null,
    toStatus: 'submitted',
    transitionedBy: `api:${project!.key}`,
  });

  return NextResponse.json(bug, { status: 201, headers: CORS_HEADERS });
}
