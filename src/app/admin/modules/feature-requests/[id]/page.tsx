import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { eq } from 'drizzle-orm';
import { authOptions } from '@/lib/auth';
import { getCurrentUserContext } from '@/lib/auth-context';
import { db } from '@/lib/db';
import { featureRequests } from '@/db/schema';
import { getReleaseHistoryForFeature } from '@/lib/release-history';
import { ReleasedInSidebar } from '@/components/ReleasedInSidebar';
import { formatRelativeTime, formatDeployedAt } from '@/app/projects/[slug]/releases/format';

// ── Color tokens (matches feature list page — reused inline per plan; no shared util yet) ──────
const STATUS_COLORS: Record<string, string> = {
  submitted: 'bg-zinc-700 text-zinc-300',
  plan_generated: 'bg-blue-500/20 text-blue-400',
  reviewed: 'bg-amber-500/20 text-amber-400',
  approved: 'bg-teal-500/20 text-teal-400',
  queued: 'bg-purple-500/20 text-purple-400',
  in_progress: 'bg-amber-500/20 text-amber-400',
  shipped: 'bg-green-500/20 text-green-400',
  declined: 'bg-red-500/20 text-red-400',
  closed: 'bg-zinc-800 text-zinc-500',
};

const PRIORITY_COLORS: Record<string, string> = {
  low: 'bg-zinc-700 text-zinc-400 border border-zinc-600',
  normal: 'bg-blue-500/20 text-blue-400',
  high: 'bg-amber-500/20 text-amber-400',
  critical: 'bg-red-500/20 text-red-400 border border-red-500/30',
};

const EFFORT_COLORS: Record<string, string> = {
  small: 'text-green-400',
  medium: 'text-amber-400',
  large: 'text-orange-400',
  epic: 'text-red-400',
};

export default async function FeatureDetailPage({
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

  // ── Parallel data fetching — feature row + release history ──────────────
  const [featRows, history] = await Promise.all([
    db.select().from(featureRequests).where(eq(featureRequests.id, id)),
    getReleaseHistoryForFeature(id),
  ]);

  if (featRows.length === 0) notFound();
  const feat = featRows[0];

  return (
    <div className="p-8 max-w-5xl">
      {/* Breadcrumb */}
      <Link
        href="/admin/modules/feature-requests"
        className="text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
      >
        ← Feature requests
      </Link>

      {/* Two-column grid — main (2/3) + sidebar (1/3) */}
      <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Main content ─────────────────────────────────────────────── */}
        <article className="lg:col-span-2 rounded-lg bg-zinc-900 border border-zinc-800 p-6 space-y-5">
          {/* Title */}
          <div>
            <h1 className="text-xl font-bold text-white leading-snug">{feat.title}</h1>
            <p className="text-xs text-zinc-500 mt-1">
              ID: <span className="font-mono">{feat.id}</span>
            </p>
          </div>

          {/* Pills row */}
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[feat.status] ?? 'bg-zinc-700 text-zinc-400'}`}
            >
              {feat.status.replace(/_/g, ' ')}
            </span>
            {feat.priority && (
              <span
                className={`px-2 py-0.5 rounded text-xs ${PRIORITY_COLORS[feat.priority] ?? 'bg-zinc-700 text-zinc-400 border border-zinc-600'}`}
              >
                {feat.priority}
              </span>
            )}
            {feat.estimatedEffort && (
              <span
                className={`px-2 py-0.5 rounded text-xs font-medium ${EFFORT_COLORS[feat.estimatedEffort] ?? 'text-zinc-400'}`}
              >
                {feat.estimatedEffort}
              </span>
            )}
            {feat.upvotes != null && feat.upvotes > 0 && (
              <span className="px-2 py-0.5 rounded text-xs bg-zinc-800 text-zinc-400">
                {feat.upvotes} upvote{feat.upvotes !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {/* Project + timestamps */}
          <div className="flex flex-wrap gap-4 text-xs text-zinc-500">
            <div>
              <span>Project: </span>
              <Link
                href={`/admin/modules/pipeline/${feat.project}`}
                className="text-teal-400 hover:text-teal-300 transition-colors font-mono"
              >
                {feat.project}
              </Link>
            </div>
            <div>
              <span>Requested: </span>
              <span className="text-zinc-400" title={formatDeployedAt(null, feat.createdAt.toISOString())}>
                {formatRelativeTime(feat.createdAt.toISOString())}
              </span>
            </div>
          </div>

          {/* Requester */}
          <div className="text-xs">
            <span className="text-zinc-500">Requested by: </span>
            <span className="text-zinc-300">
              {feat.requestedByName ?? feat.requestedByEmail ?? 'Unknown'}
            </span>
            {feat.requestedByEmail && feat.requestedByName && (
              <span className="text-zinc-600 ml-1">({feat.requestedByEmail})</span>
            )}
          </div>

          {/* Description */}
          <div>
            <h2 className="text-xs font-semibold tracking-wider text-zinc-500 uppercase mb-2">
              Description
            </h2>
            <p className="text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed">
              {feat.description}
            </p>
          </div>

          {/* Use case (optional) */}
          {feat.useCase && (
            <div>
              <h2 className="text-xs font-semibold tracking-wider text-zinc-500 uppercase mb-2">
                Use Case
              </h2>
              <p className="text-sm text-zinc-400 whitespace-pre-wrap leading-relaxed">
                {feat.useCase}
              </p>
            </div>
          )}

          {/* Build plan (optional) */}
          {feat.buildPlan != null && (
            <div>
              <h2 className="text-xs font-semibold tracking-wider text-zinc-500 uppercase mb-2">
                Build Plan
              </h2>
              <pre className="text-xs text-zinc-400 bg-zinc-800 rounded p-3 overflow-auto max-h-60">
                {JSON.stringify(feat.buildPlan as Record<string, unknown>, null, 2)}
              </pre>
            </div>
          )}

          {/* Version info (target / shipped) */}
          {(feat.targetVersion || feat.shippedVersion) && (
            <div className="flex flex-wrap gap-4 text-xs">
              {feat.targetVersion && (
                <div>
                  <span className="text-zinc-500">Target version: </span>
                  <span className="font-mono text-violet-300">{feat.targetVersion}</span>
                </div>
              )}
              {feat.shippedVersion && (
                <div>
                  <span className="text-zinc-500">Shipped version: </span>
                  <span className="font-mono text-violet-300">{feat.shippedVersion}</span>
                </div>
              )}
            </div>
          )}

          {/* Triarch notes (staff internal) */}
          {feat.triarchNotes && (
            <div className="rounded-md bg-zinc-800 border border-zinc-700 p-3">
              <h2 className="text-xs font-semibold tracking-wider text-zinc-500 uppercase mb-1">
                Staff Notes
              </h2>
              <p className="text-sm text-zinc-300 whitespace-pre-wrap">{feat.triarchNotes}</p>
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
