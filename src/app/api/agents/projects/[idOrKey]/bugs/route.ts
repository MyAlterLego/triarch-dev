// /api/agents/projects/[idOrKey]/bugs
//
// GET — bug list for a project. Filters: status, priority, limit, offset.
// Scope: read:projects.

import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq, ne, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { bugReports, AGENT_SCOPES } from '@/db/schema';
import { withAgent, logAgentActivity } from '@/lib/agent-auth';
import { projectBug } from '@/lib/agent-projections';
import { findProject } from '../../_lookup';

export const dynamic = 'force-dynamic';

export const GET = withAgent(
  [AGENT_SCOPES.READ_PROJECTS],
  async (request: NextRequest, { agent, sessionId, ipAddress }) => {
    const segments = request.nextUrl.pathname.split('/');
    // .../projects/<idOrKey>/bugs → idOrKey is segments[length-2]
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

    const conditions = [eq(bugReports.project, project.key)];
    if (status === 'open') {
      conditions.push(ne(bugReports.status, 'resolved'));
      conditions.push(ne(bugReports.status, 'wontfix'));
    } else if (status) {
      conditions.push(eq(bugReports.status, status));
    }
    if (priority) conditions.push(eq(bugReports.priority, priority));

    const where = and(...conditions);

    const rows = await db
      .select()
      .from(bugReports)
      .where(where)
      .orderBy(desc(bugReports.createdAt))
      .limit(limit)
      .offset(offset);

    const [{ total }] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(bugReports)
      .where(where);

    await logAgentActivity({
      agent,
      sessionId,
      ipAddress,
      action: 'read',
      targetEntityType: 'bugs',
      targetEntityId: project.id,
      targetEntityName: project.key,
      reason: `list bugs (status=${status ?? 'any'}, priority=${priority ?? 'any'})`,
      tool: 'triarch_project_bugs',
    });

    return NextResponse.json({
      project_key: project.key,
      bugs: rows.map(projectBug),
      total: Number(total ?? 0),
      limit,
      offset,
    });
  },
);
