import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { eq } from 'drizzle-orm';
import { authOptions } from '@/lib/auth';
import { getCurrentUserContext } from '@/lib/auth-context';
import { db } from '@/lib/db';
import { bugReports } from '@/db/schema';
import { getReleaseHistoryForBug } from '@/lib/release-history';
import { ReleasedInSidebar } from '@/components/ReleasedInSidebar';
import { formatRelativeTime, formatDeployedAt } from '@/app/projects/[slug]/releases/format';

// ── Color tokens (matches bug list page — reused inline per plan; no shared util yet) ─────────
const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-red-500/20 text-red-400 border border-red-500/30',
  high: 'bg-orange-500/20 text-orange-400 border border-orange-500/30',
  medium: 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
  low: 'bg-zinc-700 text-zinc-400 border border-zinc-600',
};

const STATUS_COLORS: Record<string, string> = {
  submitted: 'bg-zinc-700 text-zinc-300',
  triaged: 'bg-blue-500/20 text-blue-400',
  approved: 'bg-teal-500/20 text-teal-400',
  in_progress: 'bg-amber-500/20 text-amber-400',
  fixed: 'bg-green-500/20 text-green-400',
  verified: 'bg-green-600/20 text-green-300',
  closed: 'bg-zinc-800 text-zinc-500',
  deferred: 'bg-purple-500/20 text-purple-400',
};

const PRIORITY_COLORS: Record<string, string> = {
  fix_now: 'bg-red-500/20 text-red-400 border border-red-500/30',
  fix_later: 'bg-zinc-700 text-zinc-400 border border-zinc-600',
};

export default async function BugDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // ── Staff-only auth guard (layout only validates session, not role) ──────
  const session = await getServerSession(authOptions);
  const ctx = await getCurrentUserContext(session);
  if (!ctx?.isStaff) {
    redirect('/login');
  }

  const { id } = await params;

  // ── Parallel data fetching — bug row + release history ──────────────────
  const [bugRows, history] = await Promise.all([
    db.select().from(bugReports).where(eq(bugReports.id, id)),
    getReleaseHistoryForBug(id),
  ]);

  if (bugRows.length === 0) notFound();
  const bug = bugRows[0];

  return (
    <div className="p-8 max-w-5xl">
      {/* Breadcrumb */}
      <Link
        href="/admin/modules/bug-reports"
        className="text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
      >
        ← Bug reports
      </Link>

      {/* Two-column grid — main (2/3) + sidebar (1/3) */}
      <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Main content ─────────────────────────────────────────────── */}
        <article className="lg:col-span-2 rounded-lg bg-zinc-900 border border-zinc-800 p-6 space-y-5">
          {/* Title */}
          <div>
            <h1 className="text-xl font-bold text-white leading-snug">{bug.title}</h1>
            <p className="text-xs text-zinc-500 mt-1">
              ID: <span className="font-mono">{bug.id}</span>
            </p>
          </div>

          {/* Pills row */}
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`px-2 py-0.5 rounded text-xs ${SEVERITY_COLORS[bug.severity] ?? 'bg-zinc-700 text-zinc-400 border border-zinc-600'}`}
            >
              {bug.severity}
            </span>
            <span
              className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[bug.status] ?? 'bg-zinc-700 text-zinc-400'}`}
            >
              {bug.status.replace(/_/g, ' ')}
            </span>
            <span
              className={`px-2 py-0.5 rounded text-xs ${PRIORITY_COLORS[bug.priority] ?? 'bg-zinc-700 text-zinc-400 border border-zinc-600'}`}
            >
              {bug.priority.replace(/_/g, ' ')}
            </span>
          </div>

          {/* Project + timestamps */}
          <div className="flex flex-wrap gap-4 text-xs text-zinc-500">
            <div>
              <span>Project: </span>
              <Link
                href={`/admin/modules/pipeline/${bug.project}`}
                className="text-teal-400 hover:text-teal-300 transition-colors font-mono"
              >
                {bug.project}
              </Link>
            </div>
            <div>
              <span>Reported: </span>
              <span className="text-zinc-400" title={formatDeployedAt(null, bug.createdAt.toISOString())}>
                {formatRelativeTime(bug.createdAt.toISOString())}
              </span>
            </div>
            <div>
              <span>Updated: </span>
              <span className="text-zinc-400" title={formatDeployedAt(null, bug.updatedAt.toISOString())}>
                {formatRelativeTime(bug.updatedAt.toISOString())}
              </span>
            </div>
          </div>

          {/* Reporter */}
          <div className="text-xs">
            <span className="text-zinc-500">Reported by: </span>
            <span className="text-zinc-300">
              {bug.reportedByName ?? bug.reportedByEmail ?? 'Unknown'}
            </span>
            {bug.reportedByEmail && bug.reportedByName && (
              <span className="text-zinc-600 ml-1">({bug.reportedByEmail})</span>
            )}
          </div>

          {/* Description */}
          <div>
            <h2 className="text-xs font-semibold tracking-wider text-zinc-500 uppercase mb-2">
              Description
            </h2>
            <p className="text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed">
              {bug.description}
            </p>
          </div>

          {/* Steps to reproduce (optional) */}
          {bug.stepsToReproduce && (
            <div>
              <h2 className="text-xs font-semibold tracking-wider text-zinc-500 uppercase mb-2">
                Steps to Reproduce
              </h2>
              <p className="text-sm text-zinc-400 whitespace-pre-wrap leading-relaxed">
                {bug.stepsToReproduce}
              </p>
            </div>
          )}

          {/* Expected / actual behavior (optional) */}
          {bug.expectedBehavior && (
            <div>
              <h2 className="text-xs font-semibold tracking-wider text-zinc-500 uppercase mb-2">
                Expected Behavior
              </h2>
              <p className="text-sm text-zinc-400 whitespace-pre-wrap leading-relaxed">
                {bug.expectedBehavior}
              </p>
            </div>
          )}
          {bug.actualBehavior && (
            <div>
              <h2 className="text-xs font-semibold tracking-wider text-zinc-500 uppercase mb-2">
                Actual Behavior
              </h2>
              <p className="text-sm text-zinc-400 whitespace-pre-wrap leading-relaxed">
                {bug.actualBehavior}
              </p>
            </div>
          )}

          {/* Triarch notes (staff internal) */}
          {bug.triarchNotes && (
            <div className="rounded-md bg-zinc-800 border border-zinc-700 p-3">
              <h2 className="text-xs font-semibold tracking-wider text-zinc-500 uppercase mb-1">
                Staff Notes
              </h2>
              <p className="text-sm text-zinc-300 whitespace-pre-wrap">{bug.triarchNotes}</p>
            </div>
          )}

          {/* Fix version (if stamped) */}
          {bug.fixVersion && (
            <div className="text-xs">
              <span className="text-zinc-500">Fix version: </span>
              <span className="font-mono text-violet-300">{bug.fixVersion}</span>
            </div>
          )}
        </article>

        {/* ── Sidebar ──────────────────────────────────────────────────── */}
        <aside className="lg:col-span-1">
          <ReleasedInSidebar releaseHistory={history} />
        </aside>
      </div>
    </div>
  );
}
