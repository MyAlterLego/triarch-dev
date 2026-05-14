import { NextRequest, NextResponse } from 'next/server';
import { requireApiKey } from '@/lib/api-key-auth';
import { getProjectPipelineSummaries } from '@/lib/pipeline-summary';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/platform/projects/{key}/versions
//
// Contract consumed by shared-workflows/gate-prod-version.yml@v8+.
// Returns the latest dev release and latest prod release for the project.
//
// Auth: per-project apiKey (Bearer). The path-param `key` must match the
// project resolved from the apiKey — a project token can only query itself.
//
// Implementation: reuses the existing getProjectPipelineSummaries lib (same
// data source the admin homepage uses), wrapped in try/catch so any DB hiccup
// returns a clean 500 JSON instead of crashing.

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  try {
    const { error, project } = await requireApiKey(req);
    if (error) return error;

    const { key } = await params;
    if (project!.key !== key) {
      return NextResponse.json(
        { error: 'API key does not match path project key' },
        { status: 403 },
      );
    }

    const summaries = await getProjectPipelineSummaries([project!.key]);
    const summary = summaries[0] ?? null;

    return NextResponse.json({
      project: project!.key,
      dev: summary && summary.devVersion
        ? {
            version: summary.devVersion,
            deployed_at: summary.devDeployedAt,
          }
        : null,
      prod: summary && summary.prodVersion
        ? {
            version: summary.prodVersion,
            deployed_at: summary.prodDeployedAt,
          }
        : null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[GET /api/platform/projects/[key]/versions] error:', msg);
    return NextResponse.json(
      { error: 'internal_error', detail: msg },
      { status: 500 },
    );
  }
}
