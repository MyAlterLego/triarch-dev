// /api/agents/projects
//
// GET — list projects with derived health summary.
//
// Sitting H — admin.triarch.dev agent API surface.
// Scope: read:projects.
//
// Response (snake_case):
// {
//   projects: [
//     { id, key, name, status, ecosystem, current_version, deployed_url,
//       health: 'green' | 'yellow' | 'red',
//       open_bugs: N, requested_features: N,
//       latest_dev_at, latest_prod_at }
//   ]
// }

import { NextRequest, NextResponse } from 'next/server';
import { asc, eq, and, ne, desc, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { projects, bugReports, featureRequests, releaseLogs, AGENT_SCOPES } from '@/db/schema';
import { withAgent, logAgentActivity } from '@/lib/agent-auth';
import { computeHealth } from './_health';

export const dynamic = 'force-dynamic';

export const GET = withAgent(
  [AGENT_SCOPES.READ_PROJECTS],
  async (request: NextRequest, { agent, sessionId, ipAddress }) => {
    const allProjects = await db.select().from(projects).orderBy(asc(projects.key));

    const summaries = await Promise.all(
      allProjects.map(async (p) => {
        const [{ openBugs }] = await db
          .select({ openBugs: sql<number>`count(*)::int` })
          .from(bugReports)
          .where(
            and(
              eq(bugReports.project, p.key),
              ne(bugReports.status, 'resolved'),
              ne(bugReports.status, 'wontfix'),
            ),
          );
        const openBugsN = Number(openBugs ?? 0);

        const [{ requestedFeatures }] = await db
          .select({ requestedFeatures: sql<number>`count(*)::int` })
          .from(featureRequests)
          .where(and(eq(featureRequests.project, p.key), eq(featureRequests.status, 'submitted')));
        const requestedFeaturesN = Number(requestedFeatures ?? 0);

        const [latestDev] = await db
          .select()
          .from(releaseLogs)
          .where(and(eq(releaseLogs.project, p.key), eq(releaseLogs.env, 'dev')))
          .orderBy(desc(releaseLogs.deployedAt))
          .limit(1);

        const [latestProd] = await db
          .select()
          .from(releaseLogs)
          .where(and(eq(releaseLogs.project, p.key), eq(releaseLogs.env, 'prod')))
          .orderBy(desc(releaseLogs.deployedAt))
          .limit(1);

        const health = computeHealth({
          openBugs: openBugsN,
          requestedFeatures: requestedFeaturesN,
          latestDev,
          latestProd,
        });

        return {
          id: p.id,
          key: p.key,
          name: p.name,
          status: p.status,
          ecosystem: p.ecosystem,
          current_version: p.currentVersion,
          deployed_url: p.deployedUrl,
          health: health.rollup,
          health_reasons: health.reasons,
          open_bugs: openBugsN,
          requested_features: requestedFeaturesN,
          latest_dev_at: latestDev?.deployedAt ?? null,
          latest_prod_at: latestProd?.deployedAt ?? null,
        };
      }),
    );

    await logAgentActivity({
      agent,
      sessionId,
      ipAddress,
      action: 'read',
      targetEntityType: 'projects',
      targetEntityId: '*',
      reason: 'list projects with health summary',
      tool: 'triarch_projects_list',
    });

    return NextResponse.json({ projects: summaries });
  },
);
