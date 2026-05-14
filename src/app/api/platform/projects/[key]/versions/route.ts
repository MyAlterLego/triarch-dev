import { NextRequest, NextResponse } from 'next/server';
import { requireApiKey } from '@/lib/api-key-auth';
import { db } from '@/lib/db';
import { releaseLogs } from '@/db/schema';
import { and, eq, desc, sql, ne, isNull, or } from 'drizzle-orm';

// GET /api/platform/projects/{key}/versions
//
// Contract consumed by shared-workflows/gate-prod-version.yml@v8+. Returns the
// latest dev release and latest prod release for the project. Either side can
// be null if the project has never recorded a release in that environment.
//
// Auth: per-project apiKey (Bearer). The path-param `key` must match the
// project resolved from the apiKey — projects can only query themselves.
// Staff/cross-project queries should use the human-auth endpoint at
// /api/projects/[slug]/versions instead.
//
// Status filter: rejected releases are skipped so a rejected prod doesn't
// block subsequent prod deploys. Pending/approved/promoted are all
// considered "the latest" of their env.

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  const { error, project } = await requireApiKey(req);
  if (error) return error;

  const { key } = await params;
  if (project!.key !== key) {
    return NextResponse.json(
      { error: 'API key does not match path project key' },
      { status: 403 },
    );
  }

  const [dev, prod] = await Promise.all([
    db
      .select({
        version: releaseLogs.version,
        deployed_at: sql<string>`coalesce(${releaseLogs.deployedAt}, ${releaseLogs.releasedAt})`,
        commit_sha: releaseLogs.commitSha,
        released_by: releaseLogs.releasedBy,
        status: releaseLogs.status,
      })
      .from(releaseLogs)
      .where(
        and(
          eq(releaseLogs.project, project!.key),
          eq(releaseLogs.env, 'dev'),
          or(isNull(releaseLogs.status), ne(releaseLogs.status, 'rejected')),
        ),
      )
      .orderBy(desc(sql`coalesce(${releaseLogs.deployedAt}, ${releaseLogs.releasedAt})`))
      .limit(1),
    db
      .select({
        version: releaseLogs.version,
        deployed_at: sql<string>`coalesce(${releaseLogs.deployedAt}, ${releaseLogs.releasedAt})`,
        commit_sha: releaseLogs.commitSha,
        released_by: releaseLogs.releasedBy,
        status: releaseLogs.status,
      })
      .from(releaseLogs)
      .where(
        and(
          eq(releaseLogs.project, project!.key),
          eq(releaseLogs.env, 'prod'),
          or(isNull(releaseLogs.status), ne(releaseLogs.status, 'rejected')),
        ),
      )
      .orderBy(desc(sql`coalesce(${releaseLogs.deployedAt}, ${releaseLogs.releasedAt})`))
      .limit(1),
  ]);

  const serialise = (row: typeof dev[number] | undefined) => {
    if (!row) return null;
    const deployedAtRaw = row.deployed_at as unknown;
    const deployedAtIso =
      deployedAtRaw instanceof Date
        ? deployedAtRaw.toISOString()
        : new Date(String(deployedAtRaw)).toISOString();
    return {
      version: row.version,
      deployed_at: deployedAtIso,
      commit_sha: row.commit_sha,
      released_by: row.released_by,
      status: row.status,
    };
  };

  return NextResponse.json({
    project: project!.key,
    dev: serialise(dev[0]),
    prod: serialise(prod[0]),
  });
}
