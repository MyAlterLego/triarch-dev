// /api/agents/projects/[idOrKey]
//
// GET — single project full detail. Accepts UUID id OR project key slug.
// Scope: read:projects.

import { NextRequest, NextResponse } from 'next/server';
import { and, eq, ne, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { bugReports, featureRequests, releaseLogs, AGENT_SCOPES } from '@/db/schema';
import { withAgent, logAgentActivity } from '@/lib/agent-auth';
import { projectProject } from '@/lib/agent-projections';
import { findProject } from '../_lookup';

export const dynamic = 'force-dynamic';

export const GET = withAgent(
  [AGENT_SCOPES.READ_PROJECTS],
  async (request: NextRequest, { agent, sessionId, ipAddress }) => {
    const segments = request.nextUrl.pathname.split('/');
    const idOrKey = decodeURIComponent(segments[segments.length - 1]);

    const project = await findProject(idOrKey);
    if (!project) {
      return NextResponse.json({ ok: false, error: 'project not found', idOrKey }, { status: 404 });
    }

    const [{ totalBugs }] = await db
      .select({ totalBugs: sql<number>`count(*)::int` })
      .from(bugReports)
      .where(eq(bugReports.project, project.key));

    const [{ openBugs }] = await db
      .select({ openBugs: sql<number>`count(*)::int` })
      .from(bugReports)
      .where(
        and(
          eq(bugReports.project, project.key),
          ne(bugReports.status, 'resolved'),
          ne(bugReports.status, 'wontfix'),
        ),
      );

    const [{ totalFeatures }] = await db
      .select({ totalFeatures: sql<number>`count(*)::int` })
      .from(featureRequests)
      .where(eq(featureRequests.project, project.key));

    const [{ openFeatures }] = await db
      .select({ openFeatures: sql<number>`count(*)::int` })
      .from(featureRequests)
      .where(and(eq(featureRequests.project, project.key), eq(featureRequests.status, 'submitted')));

    const [{ totalReleases }] = await db
      .select({ totalReleases: sql<number>`count(*)::int` })
      .from(releaseLogs)
      .where(eq(releaseLogs.project, project.key));

    await logAgentActivity({
      agent,
      sessionId,
      ipAddress,
      action: 'read',
      targetEntityType: 'project',
      targetEntityId: project.id,
      targetEntityName: project.name,
      reason: 'get single project detail',
      tool: 'triarch_project_get',
    });

    return NextResponse.json({
      project: projectProject(project),
      counts: {
        bugs_total: totalBugs,
        bugs_open: openBugs,
        features_total: totalFeatures,
        features_open: openFeatures,
        releases_total: totalReleases,
      },
    });
  },
);
