import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getCurrentUserContext } from '@/lib/auth-context';
import { getProjectPipelineDetail } from '@/lib/pipeline-summary';
import { formatRelativeTime } from '@/app/projects/[slug]/releases/format';
import PromoteButton from './PromoteButton';

// ── Status pill color tokens (semantic — do NOT replace with gradient per DESIGN-REFERENCE.md) ──
const STATUS_PILL: Record<string, string> = {
  dev: 'bg-zinc-800 text-zinc-300',
  pending_approval: 'bg-amber-900/40 text-amber-300',
  approved: 'bg-emerald-900/40 text-emerald-300',
  promoted: 'bg-teal-900/40 text-teal-300',
  rejected: 'bg-red-900/40 text-red-300',
};

// ── What's-changed type pill — v2.1 gradient accents (DESIGN-REFERENCE.md Phase 9 specifics) ──
// Bug fix → red-rose gradient; Feature → teal-emerald gradient; Other → zinc mute
const TYPE_PILL: Record<'fix' | 'feature' | 'other', { label: string; cls: string }> = {
  fix: {
    label: 'Bug fix',
    cls: 'bg-gradient-to-r from-red-900/50 to-rose-900/50 text-red-300 border border-red-700/30',
  },
  feature: {
    label: 'Feature',
    cls: 'bg-gradient-to-r from-teal-900/50 to-emerald-900/50 text-teal-300 border border-teal-700/30',
  },
  other: {
    label: 'Other',
    cls: 'bg-zinc-800 text-zinc-400 border border-zinc-700/30',
  },
};

export default async function PipelinePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  // ── staff-only auth guard (layout only validates session, not role) ──────
  const session = await getServerSession(authOptions);
  const ctx = await getCurrentUserContext(session);
  if (!ctx?.isStaff) {
    redirect('/login');
  }

  const { slug } = await params;
  const detail = await getProjectPipelineDetail(slug);
  if (!detail) notFound();

  const { project, summary, rcs, whatChanged, deployHistory } = detail;

  // Group RCs by branch (preserving the sorted order from the helper)
  const rcBranches: string[] = [];
  const rcByBranch = new Map<string, typeof rcs>();
  for (const rc of rcs) {
    if (!rcByBranch.has(rc.branch)) {
      rcBranches.push(rc.branch);
      rcByBranch.set(rc.branch, []);
    }
    rcByBranch.get(rc.branch)!.push(rc);
  }

  return (
    <div className="p-8 max-w-5xl">
      {/* ── 1. Header ───────────────────────────────────────────────── */}
      <div className="mb-8">
        {/* Breadcrumb */}
        <div className="flex items-center justify-between mb-4">
          <Link
            href="/admin"
            className="text-zinc-400 hover:text-zinc-200 text-sm transition-colors"
          >
            &#8592; Admin home
          </Link>
          <Link
            href={`/projects/${slug}/releases`}
            className="text-sm text-zinc-500 hover:text-zinc-300 underline transition-colors"
          >
            Customer view
          </Link>
        </div>

        {/* Project name */}
        <h1 className="text-2xl font-semibold text-zinc-100 mb-3">{project.name}</h1>

        {/* v2.1 violet-gradient version display (DESIGN-REFERENCE.md Phase 9: big violet-gradient prod/dev version display) */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-zinc-500 text-xs uppercase tracking-wider">prod</span>
            <span className="font-mono text-base font-semibold bg-gradient-to-r from-violet-400 to-blue-400 bg-clip-text text-transparent">
              {summary.prodVersion ?? '—'}
            </span>
            {summary.prodDeployedAt && (
              <span className="text-zinc-500 text-xs">
                · {formatRelativeTime(summary.prodDeployedAt)}
              </span>
            )}
          </div>
          <span className="text-zinc-700 hidden sm:inline">/</span>
          <div className="flex items-center gap-2">
            <span className="text-zinc-500 text-xs uppercase tracking-wider">dev</span>
            <span className="font-mono text-base font-semibold bg-gradient-to-r from-violet-400 to-blue-400 bg-clip-text text-transparent">
              {summary.devVersion ?? '—'}
            </span>
            {summary.devDeployedAt && (
              <span className="text-zinc-500 text-xs">
                · {formatRelativeTime(summary.devDeployedAt)}
              </span>
            )}
          </div>
          {summary.whatChangedOneliner && (
            <span className="text-zinc-500 text-xs italic">{summary.whatChangedOneliner}</span>
          )}
        </div>
      </div>

      {/* ── 2. Branch RC list ─────────────────────────────────────────── */}
      <section className="mb-8 rounded-lg bg-zinc-900 border border-zinc-800 p-4">
        <h2 className="text-xs font-semibold tracking-wider text-zinc-500 uppercase mb-4">
          Release candidates{rcs.length > 0 ? ` · ${rcs.length}` : ''}
        </h2>

        {rcs.length === 0 ? (
          <p className="text-zinc-500 italic text-sm">
            No release candidates yet — push to a feature branch and tag a version
          </p>
        ) : (
          <div className="space-y-5">
            {rcBranches.map((branch) => {
              const branchRcs = rcByBranch.get(branch)!;
              return (
                <div key={branch}>
                  {/* Branch sub-header */}
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-mono text-xs font-medium text-zinc-300">{branch}</span>
                    <span className="text-zinc-600 text-xs">· {branchRcs.length} RC{branchRcs.length !== 1 ? 's' : ''}</span>
                  </div>

                  {/* RC rows */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <tbody className="divide-y divide-zinc-800/50">
                        {branchRcs.map((rc) => (
                          <tr
                            key={rc.id}
                            className="group bg-zinc-900 hover:bg-zinc-800 transition-colors"
                          >
                            {/* Branch (mono) */}
                            <td className="py-2 pr-4 font-mono text-xs text-zinc-200 whitespace-nowrap">
                              {rc.branch}
                            </td>
                            {/* Version (mono) */}
                            <td className="py-2 pr-4 font-mono text-zinc-100 whitespace-nowrap tabular-nums">
                              {rc.version}
                            </td>
                            {/* Status pill */}
                            <td className="py-2 pr-4 whitespace-nowrap">
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${STATUS_PILL[rc.status ?? ''] ?? STATUS_PILL.dev}`}
                              >
                                {rc.status ?? 'dev'}
                              </span>
                            </td>
                            {/* Author */}
                            <td className="py-2 pr-4 text-zinc-300 text-xs whitespace-nowrap">
                              {rc.author ?? '—'}
                            </td>
                            {/* Timestamp */}
                            <td className="py-2 pr-4 text-zinc-400 text-xs whitespace-nowrap tabular-nums">
                              {formatRelativeTime(rc.deployedAt ?? rc.releasedAt)}
                            </td>
                            {/* Promote button slot */}
                            <td className="py-2 text-right whitespace-nowrap">
                              {rc.status === 'approved' ? (
                                <PromoteButton
                                  releaseId={rc.id}
                                  branch={rc.branch}
                                  version={rc.version}
                                />
                              ) : null}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── 3. What's changed since prod (DIFF-01) ────────────────────── */}
      <section className="mb-8 rounded-lg bg-zinc-900 border border-zinc-800 p-4">
        {/* Collapsible via <details> — default expanded, no client component needed */}
        <details open>
          <summary className="cursor-pointer list-none">
            <h2 className="text-xs font-semibold tracking-wider text-zinc-500 uppercase inline-flex items-center gap-2">
              What&apos;s changed since prod
              <span className="text-zinc-600 text-[10px] font-normal normal-case tracking-normal">
                (click to collapse)
              </span>
            </h2>
          </summary>

          <div className="mt-4">
            {whatChanged.length === 0 ? (
              <p className="text-zinc-500 italic text-sm">Dev is in sync with prod</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800">
                      <th className="text-left py-2 pr-4 text-[10px] font-medium text-zinc-500 uppercase tracking-wider">Type</th>
                      <th className="text-left py-2 pr-4 text-[10px] font-medium text-zinc-500 uppercase tracking-wider">Title</th>
                      <th className="text-left py-2 pr-4 text-[10px] font-medium text-zinc-500 uppercase tracking-wider">Branch</th>
                      <th className="text-left py-2 pr-4 text-[10px] font-medium text-zinc-500 uppercase tracking-wider">Author</th>
                      <th className="text-left py-2 text-[10px] font-medium text-zinc-500 uppercase tracking-wider">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/50">
                    {whatChanged.map((entry, i) => {
                      const pill = TYPE_PILL[entry.type];
                      return (
                        <tr key={`${entry.releaseId}-${i}`} className="hover:bg-zinc-800/40 transition-colors">
                          <td className="py-2 pr-4 whitespace-nowrap">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${pill.cls}`}>
                              {pill.label}
                            </span>
                          </td>
                          <td className="py-2 pr-4 text-zinc-100 max-w-xs truncate">
                            {entry.title || '—'}
                          </td>
                          <td className="py-2 pr-4 font-mono text-zinc-300 text-xs whitespace-nowrap">
                            {entry.branch}
                          </td>
                          <td className="py-2 pr-4 text-zinc-400 text-xs whitespace-nowrap">
                            {entry.author ?? '—'}
                          </td>
                          <td className="py-2 text-zinc-400 text-xs whitespace-nowrap tabular-nums">
                            {formatRelativeTime(entry.date)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </details>
      </section>

      {/* ── 4. Deploy history ─────────────────────────────────────────── */}
      <section className="rounded-lg bg-zinc-900 border border-zinc-800 p-4">
        <h2 className="text-xs font-semibold tracking-wider text-zinc-500 uppercase mb-4">
          Recent deploys
        </h2>

        {deployHistory.length === 0 ? (
          <p className="text-zinc-500 italic text-sm">No deploy history</p>
        ) : (
          <div className="space-y-1">
            {deployHistory.map((row) => (
              <div
                key={row.id}
                className="flex items-center gap-3 py-2 border-b border-zinc-800/50 last:border-0 text-sm"
              >
                {/* Env tag */}
                <span
                  className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-medium shrink-0 ${
                    row.env === 'prod'
                      ? 'bg-emerald-900/40 text-emerald-300'
                      : 'bg-zinc-800 text-zinc-400'
                  }`}
                >
                  {row.env}
                </span>
                {/* Version */}
                <span className="font-mono text-zinc-100 text-xs tabular-nums">{row.version}</span>
                {/* Author */}
                <span className="text-zinc-400 text-xs truncate flex-1">{row.releasedBy ?? '—'}</span>
                {/* Timestamp */}
                <span className="text-zinc-500 text-xs whitespace-nowrap tabular-nums">
                  {formatRelativeTime(row.deployedAt ?? row.releasedAt)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
