import Link from 'next/link';
import type { ReleaseHistoryRow } from '@/lib/release-history';
import { formatRelativeTime } from '@/app/projects/[slug]/releases/format';

// ── ReleasedInSidebar ─────────────────────────────────────────────────────────
//
// Shared server component used by bug detail (12-02) and feature detail (12-03).
// Renders the "Released in" section showing which release versions (dev / prod)
// include the linked bug or feature.
//
// Design: DESIGN-REFERENCE.md sidebar accent rule — version numbers in mono with
// `text-violet-300` (NOT full headline gradient, sidebar accent only).
//
// Rendering rules (per 12-CONTEXT.md decisions):
//   - Empty (no rows): "Not released yet" in zinc-500 italic
//   - Dev rows present + prod empty: dev rows + muted prod "—" row
//   - Prod rows present + dev empty: prod rows + muted dev "—" row (hotfix case)
//   - Both present: all rows per env, most-recent first (already ordered by helper)
//
// Version Link: /admin/modules/pipeline/<projectKey>?release=<version>
//   The ?release= param is informational; pipeline page can add anchor-scroll later.

interface ReleasedInSidebarProps {
  releaseHistory: ReleaseHistoryRow[];
}

export function ReleasedInSidebar({ releaseHistory }: ReleasedInSidebarProps) {
  const devRows = releaseHistory.filter((r) => r.env === 'dev');
  const prodRows = releaseHistory.filter((r) => r.env === 'prod');
  const totalRows = releaseHistory.length;

  return (
    <aside className="rounded-lg bg-zinc-900 border border-zinc-800 p-4">
      {/* Section header — ALL CAPS per DESIGN-REFERENCE.md section header rule */}
      <h2 className="text-xs font-semibold tracking-wider text-zinc-500 uppercase mb-3">
        Released In
      </h2>

      {totalRows === 0 ? (
        // Empty state — no release_log_links rows for this item
        <p className="text-zinc-500 italic text-sm">Not released yet</p>
      ) : (
        <div className="space-y-3">
          {/* ── Dev rows ──────────────────────────────────────────────── */}
          {devRows.length > 0 ? (
            <div className="space-y-1">
              {devRows.map((row) => (
                <div key={row.releaseLogId} className="flex items-center gap-1 text-sm">
                  <span className="text-zinc-500 w-8 flex-shrink-0">dev:</span>
                  <Link
                    href={`/admin/modules/pipeline/${row.projectKey}?release=${encodeURIComponent(row.version)}`}
                    className="font-mono text-violet-300 hover:text-violet-200 transition-colors"
                  >
                    {row.version}
                  </Link>
                  <span className="text-zinc-500 mx-1">·</span>
                  <span className="text-zinc-400 text-xs">
                    {formatRelativeTime(row.deployedAt ?? row.releasedAt)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            // Dev-empty case — item is prod-only (hotfix shipped directly to prod)
            <div className="text-sm text-zinc-600">
              <span className="w-8 inline-block">dev:</span>
              <span>— · no dev row</span>
            </div>
          )}

          {/* ── Prod rows ─────────────────────────────────────────────── */}
          {prodRows.length > 0 ? (
            <div className="space-y-1">
              {prodRows.map((row) => (
                <div key={row.releaseLogId} className="flex items-center gap-1 text-sm">
                  <span className="text-zinc-500 w-8 flex-shrink-0">prod:</span>
                  <Link
                    href={`/admin/modules/pipeline/${row.projectKey}?release=${encodeURIComponent(row.version)}`}
                    className="font-mono text-violet-300 hover:text-violet-200 transition-colors"
                  >
                    {row.version}
                  </Link>
                  <span className="text-zinc-500 mx-1">·</span>
                  <span className="text-zinc-400 text-xs">
                    {formatRelativeTime(row.deployedAt ?? row.releasedAt)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            // Prod-empty case — fix is in dev but hasn't reached prod yet
            <div className="text-sm text-zinc-600">
              <span className="w-8 inline-block">prod:</span>
              <span>— · not yet in prod</span>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
