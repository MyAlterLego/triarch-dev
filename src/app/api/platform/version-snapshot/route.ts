import { NextRequest, NextResponse } from 'next/server';
import { requireApiKey } from '@/lib/api-key-auth';
import { getProjectPipelineSummaries } from '@/lib/pipeline-summary';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/platform/version-snapshot
//
// Contract consumed by shared-workflows/gate-prod-version.yml@v8.1+.
// Returns the latest dev release and latest prod release for the project
// IDENTIFIED BY THE BEARER apiKey. No URL path param — the apiKey is the
// project's identity.
//
// Previous attempt (/api/platform/projects/[key]/versions) crashed FAH at
// runtime; suspected route-conflict between the dynamic [key] segment and
// the existing static siblings (tools/, provision-db/, etc.) in the same
// directory. Static-path version avoids that entirely.
//
// Response shape:
//   {
//     project: "<key>",
//     dev:  { version, deployed_at } | null,
//     prod: { version, deployed_at } | null,
//   }

export async function GET(req: NextRequest) {
  try {
    const { error, project } = await requireApiKey(req);
    if (error) return error;

    const summaries = await getProjectPipelineSummaries([project!.key]);
    const summary = summaries[0] ?? null;

    return NextResponse.json({
      project: project!.key,
      dev: summary && summary.devVersion
        ? { version: summary.devVersion, deployed_at: summary.devDeployedAt }
        : null,
      prod: summary && summary.prodVersion
        ? { version: summary.prodVersion, deployed_at: summary.prodDeployedAt }
        : null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[GET /api/platform/version-snapshot] error:', msg);
    return NextResponse.json(
      { error: 'internal_error', detail: msg },
      { status: 500 },
    );
  }
}
