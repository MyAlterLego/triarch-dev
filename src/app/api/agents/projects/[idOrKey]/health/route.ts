// /api/agents/projects/[idOrKey]/health
//
// GET — derived health for a project: dev/prod env state, bug severity
// breakdown, requested feature count, rollup green/yellow/red.
// Scope: read:projects.

import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq, ne, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { bugReports, featureRequests, releaseLogs, AGENT_SCOPES } from '@/db/schema';
import { withAgent, logAgentActivity } from '@/lib/agent-auth';
import { projectRelease } from '@/lib/agent-projections';
import { findProject } from '../../_lookup';
import { computeHealth } from '../../_health';

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

    const [latestDev] = await db
      .select()
      .from(releaseLogs)
      .where(and(eq(releaseLogs.project, project.key), eq(releaseLogs.env, 'dev')))
      .orderBy(desc(releaseLogs.deployedAt))
      .limit(1);

    const [latestProd] = await db
      .select()
      .from(releaseLogs)
      .where(and(eq(releaseLogs.project, project.key), eq(releaseLogs.env, 'prod')))
      .orderBy(desc(releaseLogs.deployedAt))
      .limit(1);

    const severityBreakdown = await db
      .select({
        severity: bugReports.severity,
        count: sql<number>`count(*)::int`,
      })
      .from(bugReports)
      .where(
        and(
          eq(bugReports.project, project.key),
          ne(bugReports.status, 'resolved'),
          ne(bugReports.status, 'wontfix'),
        ),
      )
      .groupBy(bugReports.severity);

    const bySev: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0 };
    let openBugsTotal = 0;
    for (const row of severityBreakdown) {
      const n = Number(row.count ?? 0);
      if (row.severity) bySev[row.severity] = n;
      openBugsTotal += n;
    }

    const [{ requestedFeatures }] = await db
      .select({ requestedFeatures: sql<number>`count(*)::int` })
      .from(featureRequests)
      .where(and(eq(featureRequests.project, project.key), eq(featureRequests.status, 'submitted')));
    const requestedFeaturesN = Number(requestedFeatures ?? 0);

    const health = computeHealth({
      openBugs: openBugsTotal,
      requestedFeatures: requestedFeaturesN,
      latestDev,
      latestProd,
      criticalBugsOpen: bySev.critical,
      highBugsOpen: bySev.high,
    });

    await logAgentActivity({
      agent,
      sessionId,
      ipAddress,
      action: 'read',
      targetEntityType: 'health',
      targetEntityId: project.id,
      targetEntityName: project.key,
      reason: `derived health (rollup=${health.rollup})`,
      tool: 'triarch_project_health',
    });

    return NextResponse.json({
      project_key: project.key,
      env: {
        dev: latestDev ? projectRelease(latestDev) : null,
        prod: latestProd ? projectRelease(latestProd) : null,
      },
      open_bugs: bySev,
      open_bugs_total: openBugsTotal,
      requested_features: requestedFeaturesN,
      health: health.rollup,
      reasons: health.reasons,
    });
  },
);
