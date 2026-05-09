import { NextRequest, NextResponse } from 'next/server';
import { requireApiKey } from '@/lib/api-key-auth';
import { db } from '@/lib/db';
import { featureRequests, workflowTransitions } from '@/db/schema';

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
  const { requestedByUserId, requestedByName, requestedByEmail, title, description, useCase, priority } = body;

  if (!requestedByUserId || !title || !description) {
    return NextResponse.json({ error: 'requestedByUserId, title, and description are required' }, { status: 400 });
  }

  const [feature] = await db.insert(featureRequests).values({
    project: project!.key,
    requestedByUserId,
    requestedByName: requestedByName ?? null,
    requestedByEmail: requestedByEmail ?? null,
    title,
    description,
    useCase: useCase ?? null,
    priority: priority ?? 'normal',
  }).returning();

  await db.insert(workflowTransitions).values({
    entityType: 'feature_request',
    entityId: feature.id,
    fromStatus: null,
    toStatus: 'submitted',
    transitionedBy: `api:${project!.key}`,
  });

  return NextResponse.json(feature, { status: 201, headers: CORS_HEADERS });
}
