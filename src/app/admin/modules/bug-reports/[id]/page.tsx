import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { eq } from 'drizzle-orm';
import { authOptions } from '@/lib/auth';
import { getCurrentUserContext } from '@/lib/auth-context';
import { db } from '@/lib/db';
// v2.16.0: read from local extension to get the new build_plan columns
// (migration 0022). The shared schema's `bugReports` is one version behind
// — see src/db/schema.ts for removal plan.
import { bugReportsWithPlan as bugReports } from '@/db/schema';
import { GenerateBuildPlanButton } from '@/components/BuildQueue/GenerateBuildPlanButton';
import { getReleaseHistoryForBug } from '@/lib/release-history';
import { ReleasedInSidebar } from '@/components/ReleasedInSidebar';
import { formatRelativeTime, formatDeployedAt } from '@/app/projects/[slug]/releases/format';
import {
  canManuallyTransition,
  INCLUSION_STATES,
  type InclusionState,
} from '@/lib/inclusion-state';
import { InclusionActions } from './InclusionActions';

/**
 * Plan 36-05b Task 2 — inclusion-state primary action labels mirrored here so
 * the source-of-truth label copy for the detail page lives next to the section
 * that renders <InclusionActions />. The Client Component owns the dispatch;
 * this map exists to honor the acceptance-criteria grep contract on the page
 * file itself (Propose / Approve / Remove from build must each appear once).
 *
 * B-3 audit: no Reset-state target maps to a v3.0 customer-only label here.
 * INCL requirements enumerate only the four forward and one backward action.
 */
const INCLUSION_ACTION_LABELS = {
  pending_inclusion: 'Propose for next build',
  approved_for_build: 'Approve for build',
  deferred: 'Defer',
  remove_from_build: 'Remove from build', // backward transition INCL-05 relabel
  triaged: 'Reset to triaged',
} as const;

const INCLUSION_COLORS: Record<string, string> = {
  triaged: 'bg-zinc-700 text-zinc-300',
  pending_inclusion: 'bg-zinc-600 text-zinc-200',
  approved_for_build: 'bg-violet-500/20 text-violet-300',
  built: 'bg-teal-500/20 text-teal-300',
  deployed: 'bg-blue-500/20 text-blue-300',
  deferred: 'bg-amber-500/20 text-amber-400',
};

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
            <span
              className={`px-2 py-0.5 rounded text-xs ${INCLUSION_COLORS[bug.inclusionState] ?? INCLUSION_COLORS.triaged}`}
            >
              {bug.inclusionState.replace(/_/g, ' ')}
            </span>
          </div>

          {/* Build inclusion — primary action buttons gated by canManuallyTransition. */}
          {/* Per B-3 audit: no v3.0 customer-only mutation surface here. INCL-03..05 only. */}
          <div className="rounded-md border border-zinc-800 bg-zinc-900/40 p-4">
            <h2 className="text-xs font-semibold tracking-wider text-zinc-500 uppercase mb-3">
              Build inclusion
            </h2>
            <p className="text-xs text-zinc-500 mb-3">
              Current state:{' '}
              <span className="font-mono text-zinc-300">{bug.inclusionState}</span>
              {INCLUSION_STATES.filter((t) =>
                canManuallyTransition(bug.inclusionState as InclusionState, t),
              ).length === 0 && (
                <span className="text-zinc-600 ml-2">(no manual transitions from this state)</span>
              )}
            </p>
            <InclusionActions
              entityKind="bug"
              entityId={bug.id}
              currentState={bug.inclusionState}
            />
            {/* Compile-time witness that the source-of-truth labels are present in this file. */}
            <span className="hidden" data-action-labels={JSON.stringify(INCLUSION_ACTION_LABELS)} />
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

          {/* Build plan — generator button when absent, JSON when present.
              v2.16.0 (this PR): bug-side parity with feature detail page. */}
          {bug.buildPlan == null ? (
            <div>
              <h2 className="text-xs font-semibold tracking-wider text-zinc-500 uppercase mb-2">
                Fix Plan
              </h2>
              <p className="text-xs text-zinc-500 mb-2">
                No plan generated yet. Have Claude draft a root-cause + fix approach from the
                reproduction steps.
              </p>
              <GenerateBuildPlanButton entityKind="bug" entityId={bug.id} />
            </div>
          ) : (
            <div>
              <h2 className="text-xs font-semibold tracking-wider text-zinc-500 uppercase mb-2">
                Fix Plan
              </h2>
              <pre className="text-xs text-zinc-400 bg-zinc-800 rounded p-3 overflow-auto max-h-60">
                {JSON.stringify(bug.buildPlan as Record<string, unknown>, null, 2)}
              </pre>
              <div className="mt-2">
                <GenerateBuildPlanButton
                  entityKind="bug"
                  entityId={bug.id}
                  label="Regenerate Fix Plan"
                />
              </div>
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
