import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getCurrentUserContext } from '@/lib/auth-context';
import { db } from '@/lib/db';
import { projects, releaseLogs, bugReports, featureRequests } from '@/db/schema';
import { eq, sql, and, inArray } from 'drizzle-orm';
import {
  FileText,
  Bug,
  Settings,
  Briefcase,
  Activity,
  Shield,
  Lightbulb,
  BookOpen,
  Wrench,
  Columns3,
} from 'lucide-react';
import Link from 'next/link';
import { getProjectPipelineSummaries, type PipelineSummary } from '@/lib/pipeline-summary';
import { formatRelativeTime } from '@/app/projects/[slug]/releases/format';

interface ProjectHealth {
  key: string;
  name: string;
  version: string | null;          // legacy currentVersion column — kept per CONTEXT.md specifics
  openBugs: number;
  pendingFeatures: number;
  status: string;
  // ── Phase 8 v2.1 additions ──
  prodVersion: string | null;
  prodDeployedAt: string | null;
  devVersion: string | null;
  devDeployedAt: string | null;
  pendingApprovalCount: number;
  pipelineState: 'parity' | 'dev-ahead' | 'inverted';
  whatChangedOneliner: string | null;
}

async function getDashboardStats(projectKeys: string[] | null) {
  if (projectKeys && projectKeys.length === 0) {
    return {
      projects: 0,
      releases: 0,
      openBugs: 0,
      pendingFeatures: 0,
      projectHealth: [] as ProjectHealth[],
    };
  }

  const projectFilter = projectKeys ? inArray(projects.key, projectKeys) : undefined;
  const releasesFilter = projectKeys ? inArray(releaseLogs.project, projectKeys) : undefined;
  const bugsFilter = projectKeys ? inArray(bugReports.project, projectKeys) : undefined;
  const featuresFilter = projectKeys ? inArray(featureRequests.project, projectKeys) : undefined;

  const openBugsCondition = sql`${bugReports.status} NOT IN ('closed', 'verified')`;
  const pendingFeaturesCondition = sql`${featureRequests.status} NOT IN ('shipped', 'closed', 'declined')`;

  const [
    projectCount,
    releaseCount,
    openBugs,
    pendingFeatures,
    projectList,
    bugsByProject,
    featuresByProject,
    pipelineSummaries,
  ] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(projects).where(projectFilter),
    db.select({ count: sql<number>`count(*)` }).from(releaseLogs).where(releasesFilter),
    db.select({ count: sql<number>`count(*)` }).from(bugReports)
      .where(bugsFilter ? and(bugsFilter, openBugsCondition) : openBugsCondition),
    db.select({ count: sql<number>`count(*)` }).from(featureRequests)
      .where(featuresFilter ? and(featuresFilter, pendingFeaturesCondition) : pendingFeaturesCondition),
    db.select({ key: projects.key, name: projects.name, currentVersion: projects.currentVersion, status: projects.status })
      .from(projects).where(projectFilter),
    db.select({ project: bugReports.project, count: sql<number>`count(*)` }).from(bugReports)
      .where(bugsFilter ? and(bugsFilter, openBugsCondition) : openBugsCondition)
      .groupBy(bugReports.project),
    db.select({ project: featureRequests.project, count: sql<number>`count(*)` }).from(featureRequests)
      .where(featuresFilter ? and(featuresFilter, pendingFeaturesCondition) : pendingFeaturesCondition)
      .groupBy(featureRequests.project),
    getProjectPipelineSummaries(projectKeys),
  ]);

  const bugMap = Object.fromEntries(bugsByProject.map(r => [r.project, Number(r.count)]));
  const featMap = Object.fromEntries(featuresByProject.map(r => [r.project, Number(r.count)]));

  const pipelineMap = Object.fromEntries(
    pipelineSummaries.map((s: PipelineSummary) => [s.projectKey, s]),
  );

  const projectHealth: ProjectHealth[] = projectList.map(p => {
    const pipeline = pipelineMap[p.key];
    return {
      key: p.key,
      name: p.name,
      version: p.currentVersion,
      openBugs: bugMap[p.key] || 0,
      pendingFeatures: featMap[p.key] || 0,
      status: p.status,
      // ── Phase 8 ──
      prodVersion: pipeline?.prodVersion ?? null,
      prodDeployedAt: pipeline?.prodDeployedAt ?? null,
      devVersion: pipeline?.devVersion ?? null,
      devDeployedAt: pipeline?.devDeployedAt ?? null,
      pendingApprovalCount: pipeline?.pendingApprovalCount ?? 0,
      pipelineState: pipeline?.pipelineState ?? 'parity',
      whatChangedOneliner: pipeline?.whatChangedOneliner ?? null,
    };
  });

  return {
    projects: Number(projectCount[0].count),
    releases: Number(releaseCount[0].count),
    openBugs: Number(openBugs[0].count),
    pendingFeatures: Number(pendingFeatures[0].count),
    projectHealth,
  };
}

const modules = [
  { title: 'Projects', description: 'Manage triarch.dev projects & infrastructure', icon: Briefcase, href: '/admin/platform/projects', color: 'text-teal-400' },
  { title: 'Work Tracker', description: 'Unified bugs & features with list + kanban', icon: Columns3, href: '/admin/modules/tracker', color: 'text-teal-400' },
  { title: 'Project Tools', description: 'CI/CD, Firebase, nav template generators', icon: Wrench, href: '/admin/platform/tools', color: 'text-emerald-400' },
  { title: 'Release Logs', description: 'Track releases across all projects', icon: FileText, href: '/admin/modules/release-logs', color: 'text-blue-400' },
  { title: 'Bug Reports', description: 'Triage and track bugs across projects', icon: Bug, href: '/admin/modules/bug-reports', color: 'text-red-400' },
  { title: 'Feature Requests', description: 'Review and prioritize feature requests', icon: Lightbulb, href: '/admin/modules/feature-requests', color: 'text-amber-400' },
  { title: 'Navigation', description: 'DB-driven menu editor', icon: Activity, href: '/admin/platform/navigation', color: 'text-green-400' },
  { title: 'Access Audit', description: 'Role assumption & access logs', icon: Shield, href: '/admin/modules/access-audit', color: 'text-purple-400' },
  { title: 'Service Offerings', description: 'Manage service offerings & pricing', icon: BookOpen, href: '/admin/modules/service-offerings', color: 'text-cyan-400' },
  { title: 'Reports', description: 'Build modular status reports', icon: FileText, href: '/admin/modules/reports', color: 'text-indigo-400' },
  { title: 'Settings', description: 'Module settings & configuration', icon: Settings, href: '/admin/settings', color: 'text-zinc-400' },
];

export default async function AdminDashboard() {
  const session = await getServerSession(authOptions);
  const ctx = await getCurrentUserContext(session);

  // null = staff or DB-error fallback (full view)
  // []   = non-staff, no memberships (empty view)
  // [..] = non-staff, scoped view
  const projectKeys: string[] | null =
    !ctx || ctx.isStaff
      ? null
      : ctx.memberships
          .filter((m) => m.project_key !== '*')
          .map((m) => m.project_key);

  const stats = await getDashboardStats(projectKeys);

  return (
    <div className="p-8 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white tracking-wide">
          Central Management Dashboard
        </h1>
        <p className="text-sm text-zinc-500 mt-1">
          Welcome back, {session?.user?.name ?? 'Admin'}
        </p>
      </div>

      {/* Live stats */}
      <div className="mb-8 grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Projects', value: stats.projects, color: 'text-teal-400', href: '/admin/platform/projects' },
          { label: 'Releases', value: stats.releases, color: 'text-blue-400', href: '/admin/modules/release-logs' },
          { label: 'Open Bugs', value: stats.openBugs, color: stats.openBugs > 0 ? 'text-red-400' : 'text-green-400', href: '/admin/modules/bug-reports' },
          { label: 'Pending Features', value: stats.pendingFeatures, color: 'text-amber-400', href: '/admin/modules/feature-requests' },
        ].map((stat) => (
          <Link key={stat.label} href={stat.href}
            className="p-4 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition-colors">
            <div className={`text-3xl font-bold ${stat.color}`}>{stat.value}</div>
            <div className="text-xs text-zinc-500 font-medium mt-1">{stat.label}</div>
          </Link>
        ))}
      </div>

      {/* Module grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {modules.map((mod) => {
          const Icon = mod.icon;
          return (
            <Link
              key={mod.href}
              href={mod.href}
              className="group block p-5 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition-colors"
            >
              <div className="flex items-start gap-3">
                <div className={`mt-0.5 ${mod.color}`}>
                  <Icon size={20} />
                </div>
                <div>
                  <h3 className="font-medium text-white group-hover:text-teal-400 transition-colors">
                    {mod.title}
                  </h3>
                  <p className="text-xs text-zinc-500 mt-1">{mod.description}</p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Project Health */}
      <div className="mt-8">
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">Project Health</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {stats.projectHealth.map((p) => (
            <Link
              key={p.key}
              href={`/admin/modules/pipeline/${p.key}`}
              className="relative block p-4 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-600 hover:bg-zinc-900/80 transition-colors"
            >
              {/* PIPE-02: pending approval pill — top-right corner; absent when count is 0 */}
              {p.pendingApprovalCount > 0 && (
                <span className="absolute top-2 right-2 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/15 text-amber-300 border border-amber-500/30">
                  {p.pendingApprovalCount} pending
                </span>
              )}

              {/* Project name */}
              <div className="mb-3 pr-16">
                <span className="text-sm font-medium text-zinc-200">{p.name}</span>
              </div>

              {/* PIPE-01 + PIPE-03: prod row (top) and dev row (below); mono version + relative timestamp */}
              <div className="space-y-1 mb-3 text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-zinc-500 w-10 shrink-0">prod</span>
                  <span className="font-mono text-zinc-200">{p.prodVersion ?? '—'}</span>
                  {p.prodDeployedAt && (
                    <span className="text-zinc-500">· {formatRelativeTime(p.prodDeployedAt)}</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-zinc-500 w-10 shrink-0">dev</span>
                  <span className={`font-mono ${p.devVersion ? 'text-zinc-200' : 'text-zinc-600'}`}>
                    {p.devVersion ?? '—'}
                  </span>
                  {p.devDeployedAt && (
                    <span className="text-zinc-500">· {formatRelativeTime(p.devDeployedAt)}</span>
                  )}
                </div>
              </div>

              {/* Existing data preserved: bug count, feature count, status pill */}
              <div className="flex gap-4 text-xs">
                <span className={p.openBugs > 0 ? 'text-red-400' : 'text-zinc-600'}>
                  {p.openBugs} bug{p.openBugs !== 1 ? 's' : ''}
                </span>
                <span className={p.pendingFeatures > 0 ? 'text-amber-400' : 'text-zinc-600'}>
                  {p.pendingFeatures} feature{p.pendingFeatures !== 1 ? 's' : ''}
                </span>
                <span className={`ml-auto ${p.status === 'active' ? 'text-green-500' : 'text-zinc-500'}`}>
                  {p.status}
                </span>
              </div>

              {/* PIPE-06: what-changed one-liner — hidden on parity, sentinel on inversion, full breakdown on dev-ahead */}
              {p.pipelineState === 'dev-ahead' && p.whatChangedOneliner && (
                <div className="mt-2 text-xs text-zinc-500">{p.whatChangedOneliner}</div>
              )}
              {p.pipelineState === 'inverted' && (
                <div className="mt-2 text-xs text-zinc-500">dev behind prod</div>
              )}
              {/* parity case: render nothing — per CONTEXT.md "When dev = prod (no delta), hide the row entirely" */}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
