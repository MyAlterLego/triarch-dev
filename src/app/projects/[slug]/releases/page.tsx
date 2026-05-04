import { notFound, redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getCurrentUserContext } from '@/lib/auth-context';
import { db } from '@/lib/db';
import { projects, releaseLogs } from '@/db/schema';
import { eq, desc, sql, and, inArray } from 'drizzle-orm';
import CustomerHeader from '@/app/projects/CustomerHeader';
import ReleasesClient from './ReleasesClient';
import type { ReleaseRow, UserRole } from './types';

const PAGE_SIZE = 20;

export default async function ReleasesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect('/login');
  const ctx = await getCurrentUserContext(session);

  const { slug } = await params;

  // Look up project by slug = projects.key
  const [project] = await db
    .select({ key: projects.key, name: projects.name })
    .from(projects)
    .where(eq(projects.key, slug));

  if (!project) notFound();

  // Membership check: 404 to non-members (no project-existence leak per GATE-01)
  const membership = ctx?.memberships.find((m) => m.project_key === project.key);
  const isMember = !!ctx && (ctx.isStaff || !!membership);
  if (!isMember) notFound();

  // userRole: staff sees admin actions everywhere; otherwise role from membership
  const userRole: UserRole =
    ctx!.isStaff || membership?.role === 'admin' ? 'admin' : 'viewer';

  // Fetch first page of releases with feedback + approvals via Drizzle relational query
  const rows = await db.query.releaseLogs.findMany({
    where: eq(releaseLogs.project, project.key),
    with: {
      feedback: { orderBy: (f, { asc }) => [asc(f.createdAt)] },
      approvals: { orderBy: (a, { desc }) => [desc(a.approvedAt)] },
    },
    orderBy: [desc(sql`coalesce(${releaseLogs.deployedAt}, ${releaseLogs.releasedAt})`)],
    limit: PAGE_SIZE + 1,  // fetch +1 to detect hasMore without separate count query
  });

  const hasMore = rows.length > PAGE_SIZE;
  const pageRows = hasMore ? rows.slice(0, PAGE_SIZE) : rows;

  // Fetch paired prod rows for dev releases — one query covers all versions on the page
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

  // Serialise dates for client (Drizzle returns Date objects)
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

  // Total count for header subtext
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(releaseLogs)
    .where(eq(releaseLogs.project, project.key));

  return (
    <>
      <CustomerHeader projectName={project.name} />
      <main className="flex-1 overflow-auto">
        <ReleasesClient
          projectSlug={project.key}
          projectName={project.name}
          userRole={userRole}
          currentUserEmail={ctx!.email}
          initialReleases={releases}
          total={Number(total)}
          hasMore={hasMore}
          pageSize={PAGE_SIZE}
        />
      </main>
    </>
  );
}
