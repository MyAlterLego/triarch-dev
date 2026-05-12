// /api/agents/projects/[idOrKey]/features
//
// GET — feature request list for a project. Filters: status, priority, limit, offset.
// Scope: read:projects.

import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { featureRequests, AGENT_SCOPES } from '@/db/schema';
import { withAgent, logAgentActivity } from '@/lib/agent-auth';
import { projectFeature } from '@/lib/agent-projections';
import { findProject } from '../../_lookup';

export const dynamic = 'force-dynamic';

export const GET = withAgent(
  [AGENT_SCOPES.READ_PROJECTS],
  async (request: NextRequest, { agent, sessionId, ipAddress }) => {
    const segments = request.nextUrl.pathname.split('/');
    const idOrKey = decodeURIComponent(segments[segments.length - 2]);

    const project = await findProject(idOrKey);
    if (!project) {
      return NextResponse.json({ ok: false, error: 'project not found', idOrKey }, { status: 404 });
    }

    const url = request.nextUrl;
    const status = url.searchParams.get('status');
    const priority = url.searchParams.get('priority');
    const limitRaw = parseInt(url.searchParams.get('limit') ?? '50', 10);
    const limit = Math.min(Math.max(isNaN(limitRaw) ? 50 : limitRaw, 1), 200);
    const offsetRaw = parseInt(url.searchParams.get('offset') ?? '0', 10);
    const offset = Math.max(isNaN(offsetRaw) ? 0 : offsetRaw, 0);

    const conditions = [eq(featureRequests.project, project.key)];
    if (status) conditions.push(eq(featureRequests.status, status));
    if (priority) conditions.push(eq(featureRequests.priority, priority));

    const where = and(...conditions);

    const rows = await db
      .select()
      .from(featureRequests)
      .where(where)
      .orderBy(desc(featureRequests.upvotes), desc(featureRequests.createdAt))
      .limit(limit)
      .offset(offset);

    const [{ total }] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(featureRequests)
      .where(where);

    await logAgentActivity({
      agent,
      sessionId,
      ipAddress,
      action: 'read',
      targetEntityType: 'features',
      targetEntityId: project.id,
      targetEntityName: project.key,
      reason: `list features (status=${status ?? 'any'}, priority=${priority ?? 'any'})`,
      tool: 'triarch_project_features',
    });

    return NextResponse.json({
      project_key: project.key,
      features: rows.map(projectFeature),
      total,
      limit,
      offset,
    });
  },
);
