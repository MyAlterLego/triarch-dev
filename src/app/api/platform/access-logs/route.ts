import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { accessAuditLogs } from '@/db/schema';
import { eq, desc, and, sql } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  const { error } = await requireStaff();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const project = searchParams.get('project');
  const limit = parseInt(searchParams.get('limit') ?? '50', 10);
  const offset = parseInt(searchParams.get('offset') ?? '0', 10);

  const conditions = [];
  if (project && project !== 'all') {
    conditions.push(eq(accessAuditLogs.project, project));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select()
    .from(accessAuditLogs)
    .where(where)
    .orderBy(desc(accessAuditLogs.createdAt))
    .limit(limit)
    .offset(offset);

  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(accessAuditLogs)
    .where(where);

  return NextResponse.json({
    logs: rows,
    total: Number(countResult.count),
    limit,
    offset,
  });
}

export async function POST(req: NextRequest) {
  const { error } = await requireStaff();
  if (error) return error;

  const body = await req.json();
  const { project, actorUserId, actorEmail, targetEntityType, targetEntityId, targetEntityName, action, reason, sessionId, ipAddress, metadata } = body;

  if (!project || !actorUserId || !targetEntityType || !targetEntityId || !action || !reason) {
    return NextResponse.json({ error: 'project, actorUserId, targetEntityType, targetEntityId, action, and reason are required' }, { status: 400 });
  }

  const [log] = await db.insert(accessAuditLogs).values({
    project,
    actorUserId,
    actorEmail: actorEmail ?? null,
    targetEntityType,
    targetEntityId,
    targetEntityName: targetEntityName ?? null,
    action,
    reason,
    sessionId: sessionId ?? null,
    ipAddress: ipAddress ?? null,
    metadata: metadata ?? {},
  }).returning();

  return NextResponse.json(log, { status: 201 });
}
