/**
 * Phase 37 TRIG-06 — staff-only audit endpoint surfacing approval_events rows.
 *
 * Reads the entity-agnostic approval_events table (added in Plan 37-01) so
 * the new /admin/platform/approval-audit page can render the trail of
 * Generate-Build clicks (and, in v3.0, customer approvals etc).
 *
 * W-3 simplification: single SELECT query — `total` is derived from
 * rows.length client-side. v2.4 TMI pilot row counts will be low (<100
 * events for months); pagination + true totals can be added later without
 * breaking the response contract (consumers see `total` either way).
 */
import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { requireStaff } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { approvalEvents } from '@/db/schema';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export async function GET(req: NextRequest) {
  const { error } = await requireStaff();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const subjectType = searchParams.get('subject_type');
  const projectKey = searchParams.get('project');
  const limitRaw = searchParams.get('limit');

  const parsedLimit = Number(limitRaw);
  const limit = Math.min(
    Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : DEFAULT_LIMIT,
    MAX_LIMIT,
  );

  const conditions = [
    subjectType ? eq(approvalEvents.subjectType, subjectType) : undefined,
    projectKey ? eq(approvalEvents.project, projectKey) : undefined,
  ].filter((c): c is NonNullable<typeof c> => c !== undefined);

  // Build the query — omit .where() entirely when there are no filters
  // (mirrors drizzle's recommended pattern and keeps the test mock simple).
  const rows = conditions.length
    ? await db
        .select()
        .from(approvalEvents)
        .where(and(...conditions))
        .orderBy(desc(approvalEvents.createdAt))
        .limit(limit)
    : await db
        .select()
        .from(approvalEvents)
        .orderBy(desc(approvalEvents.createdAt))
        .limit(limit);

  const events = rows.map((r) => ({
    id: r.id,
    subjectType: r.subjectType,
    subjectId: r.subjectId,
    decision: r.decision,
    surface: r.surface,
    actorEmail: r.actorEmail,
    comment: r.comment,
    metadata: r.metadata,
    project: r.project,
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
  }));

  return NextResponse.json({ events, total: events.length });
}
