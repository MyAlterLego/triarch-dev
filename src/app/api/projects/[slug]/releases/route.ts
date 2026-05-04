import { NextRequest, NextResponse } from 'next/server';
import { requireSignedIn } from '@/lib/api-auth';
import { getCurrentUserContext } from '@/lib/auth-context';
import { db } from '@/lib/db';
import { projects, releaseLogs } from '@/db/schema';
import { eq, desc, sql, and, inArray } from 'drizzle-orm';
import type { ReleaseRow } from '@/app/projects/[slug]/releases/types';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { error, session } = await requireSignedIn();
  if (error) return error;

  const ctx = await getCurrentUserContext(session);
  if (!ctx) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { slug } = await params;

  // Look up project by slug = projects.key
  const [project] = await db
    .select({ key: projects.key, name: projects.name })
    .from(projects)
    .where(eq(projects.key, slug));

  if (!project) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Membership 404-no-leak: staff see everything; non-staff must be a member
  const isMember = ctx.isStaff || ctx.memberships.some((m) => m.project_key === project.key);
  if (!isMember) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Parse pagination params — clamp to safe bounds
  const searchParams = new URL(req.url).searchParams;
  const rawLimit = parseInt(searchParams.get('limit') ?? '20', 10);
  const rawOffset = parseInt(searchParams.get('offset') ?? '0', 10);
  const limit = Math.max(1, Math.min(100, isNaN(rawLimit) ? 20 : rawLimit));
  const offset = Math.max(0, isNaN(rawOffset) ? 0 : rawOffset);

  // Fetch using same sort as page.tsx: coalesce(deployedAt, releasedAt) DESC
  const rows = await db.query.releaseLogs.findMany({
    where: eq(releaseLogs.project, project.key),
    with: {
      feedback: { orderBy: (f, { asc }) => [asc(f.createdAt)] },
      approvals: { orderBy: (a, { desc: descFn }) => [descFn(a.approvedAt)] },
    },
    orderBy: [desc(sql`coalesce(${releaseLogs.deployedAt}, ${releaseLogs.releasedAt})`)],
    limit: limit + 1, // fetch +1 to detect hasMore without a separate count query
    offset,
  });

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;

  // Fetch paired prod rows for dev releases
  const versions = pageRows.map((r) => r.version);
  const prodRows = versions.length === 0 ? [] : await db
    .select({
      id: releaseLogs.id,
      version: releaseLogs.version,
      deployedAt: releaseLogs.deployedAt,
      releasedAt: releaseLogs.releasedAt,
      releasedBy: releaseLogs.releasedBy,
      commitSha: releaseLogs.commitSha,
    })
    .from(releaseLogs)
    .where(and(
      eq(releaseLogs.project, project.key),
      eq(releaseLogs.env, 'prod'),
      inArray(releaseLogs.version, versions),
    ));
  const prodByVersion = new Map(prodRows.map((p) => [p.version, p]));

  // Serialise dates for the client (Drizzle returns Date objects from node-postgres)
  const releases: ReleaseRow[] = pageRows.map((r) => ({
    id: r.id,
    project: r.project,
    version: r.version,
    env: (r.env as 'dev' | 'prod' | null) ?? null,
    status: (r.status as ReleaseRow['status']) ?? null,
    commitSha: r.commitSha,
    deployedAt: r.deployedAt ? r.deployedAt.toISOString() : null,
    releasedAt: r.releasedAt.toISOString(),
    releasedBy: r.releasedBy,
    summary: r.summary,
    feedback: r.feedback.map((f) => ({
      id: f.id,
      releaseId: f.releaseId,
      authorEmail: f.authorEmail,
      body: f.body,
      createdAt: f.createdAt.toISOString(),
    })),
    approvals: r.approvals.map((a) => ({
      id: a.id,
      releaseId: a.releaseId,
      approverEmail: a.approverEmail,
      decision: a.decision as 'approved' | 'rejected',
      approvedAt: a.approvedAt.toISOString(),
      reason: a.reason,
      ipAddress: a.ipAddress,
      userAgent: a.userAgent,
    })),
    promotionDispatchedAt: r.promotionDispatchedAt?.toISOString() ?? null,
    promotionDispatchedBy: r.promotionDispatchedBy ?? null,
    pairedProd: (() => {
      if (r.env !== 'dev') return null;
      const prod = prodByVersion.get(r.version);
      if (!prod) return null;
      return {
        id: prod.id,
        deployedAt: prod.deployedAt?.toISOString() ?? null,
        releasedAt: prod.releasedAt.toISOString(),
        releasedBy: prod.releasedBy ?? null,
        commitSha: prod.commitSha ?? null,
      };
    })(),
  }));

  return NextResponse.json({ releases, hasMore });
}
