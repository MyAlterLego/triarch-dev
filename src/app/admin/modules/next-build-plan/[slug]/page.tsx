/**
 * Next-build-plan admin page — Phase 36 INCL-05.
 *
 * Staff-only operational dashboard listing items in `approved_for_build` for
 * a project. Mixes bugs + features in a single table sorted by approval-event
 * timestamp (updatedAt desc, since the inclusion_state transition stamps it).
 *
 * Auth: staff-only via getCurrentUserContext + isStaff check. Non-staff and
 * unknown slugs both return 404 (no membership-existence leak per
 * CONTEXT D-Admin-UI parallel with PORTAL-03).
 *
 * Pitfall 9 (Next.js 16): params is awaited as an async Promise — see annotation below.
 */

import { notFound } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getCurrentUserContext } from '@/lib/auth-context';
import { db } from '@/lib/db';
import { bugReports, featureRequests, projects } from '@/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import type { BuildTriggerMode } from '@/lib/build-trigger-mode';
import NextBuildPlanClient, { type BuildPlanItem } from './NextBuildPlanClient';

export default async function NextBuildPlanPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  // ── Staff-only auth guard (no membership-existence leak: 404 for non-staff) ─
  const session = await getServerSession(authOptions);
  const ctx = await getCurrentUserContext(session);
  if (!ctx?.isStaff) notFound();

  // Pitfall 9 — Next.js 16 async params
  const { slug } = await params;

  // ── Project existence check ─────────────────────────────
  // Phase 37-05: select id + buildTriggerMode + localPath so the Generate Build
  // modal can wire its deep-link cwd and mode-based button visibility.
  const [project] = await db
    .select({
      id: projects.id,
      key: projects.key,
      name: projects.name,
      buildTriggerMode: projects.buildTriggerMode,
      localPath: projects.localPath,
    })
    .from(projects)
    .where(eq(projects.key, slug));
  if (!project) notFound();

  // ── approved_for_build bugs for this project ───────────
  const bugs = await db
    .select({
      id: bugReports.id,
      title: bugReports.title,
      severity: bugReports.severity,
      inclusionState: bugReports.inclusionState,
      updatedAt: bugReports.updatedAt,
    })
    .from(bugReports)
    .where(
      and(
        eq(bugReports.project, slug),
        eq(bugReports.inclusionState, 'approved_for_build'),
      ),
    )
    .orderBy(desc(bugReports.updatedAt));

  // ── approved_for_build features for this project ───────
  const features = await db
    .select({
      id: featureRequests.id,
      title: featureRequests.title,
      inclusionState: featureRequests.inclusionState,
      updatedAt: featureRequests.updatedAt,
    })
    .from(featureRequests)
    .where(
      and(
        eq(featureRequests.project, slug),
        eq(featureRequests.inclusionState, 'approved_for_build'),
      ),
    )
    .orderBy(desc(featureRequests.updatedAt));

  // ── Merge + sort by approval-event timestamp desc ──────
  const items: BuildPlanItem[] = [
    ...bugs.map((b) => ({
      id: b.id,
      type: 'bug' as const,
      title: b.title,
      severity: b.severity ?? null,
      inclusionState: b.inclusionState,
      updatedAt: b.updatedAt.toISOString(),
    })),
    ...features.map((f) => ({
      id: f.id,
      type: 'feature' as const,
      title: f.title,
      severity: null,
      inclusionState: f.inclusionState,
      updatedAt: f.updatedAt.toISOString(),
    })),
  ].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  return (
    <NextBuildPlanClient
      projectName={project.name}
      projectSlug={slug}
      initialItems={items}
      project={{
        id: project.id,
        key: project.key,
        name: project.name,
        buildTriggerMode: project.buildTriggerMode as BuildTriggerMode,
        localPath: project.localPath ?? null,
      }}
      approvedCount={items.length}
    />
  );
}
