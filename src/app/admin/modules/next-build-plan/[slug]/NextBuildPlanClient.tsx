'use client';

/**
 * NextBuildPlanClient — Phase 36 INCL-05 client component.
 *
 * Renders a single mixed table of `approved_for_build` bugs + features for a
 * project, with type-filter chips (?type=all|bug|feature) and an inline
 * "Remove from build" action per row.
 *
 * "Remove from build" calls PATCH /api/platform/{bug-reports|feature-requests}/{id}
 * with body {inclusionState: 'pending_inclusion'} per Plan 36-02 contract.
 *
 * Optimistic update: row disappears immediately on click; restores on PATCH
 * failure with an inline error indicator.
 *
 * Per CONTEXT D-Admin-UI: violet/teal/blue/zinc pill tokens; no bulk action.
 * FilterChips is duplicated locally (NextBuildPlanFilterChips) because the
 * upstream chip set is bound to 'all'|'fix'|'feature'|'other' — this surface
 * needs 'all'|'bug'|'feature'. Per CONTEXT <decisions> Claude's Discretion.
 */

import { useState, useMemo, useCallback } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';

// ── Public types ─────────────────────────────────────────────────────────
export type BuildPlanItemType = 'bug' | 'feature';
export type TypeFilter = 'all' | BuildPlanItemType;

export interface BuildPlanItem {
  id: string;
  type: BuildPlanItemType;
  title: string;
  severity: string | null; // bugs only; null for features
  inclusionState: string;
  updatedAt: string; // ISO timestamp (serializable from server)
}

interface Props {
  projectName: string;
  projectSlug: string;
  initialItems: BuildPlanItem[];
}

// ── Pill colors (CONTEXT D-Admin-UI: violet/teal/blue/zinc; type-pill differentiates rows) ──
const TYPE_PILL: Record<BuildPlanItemType, string> = {
  bug: 'bg-red-500/20 text-red-400 border border-red-500/30',
  feature: 'bg-teal-500/20 text-teal-400 border border-teal-500/30',
};

const SEVERITY_PILL: Record<string, string> = {
  critical: 'bg-red-500/20 text-red-400 border border-red-500/30',
  high: 'bg-orange-500/20 text-orange-400 border border-orange-500/30',
  medium: 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
  low: 'bg-zinc-700 text-zinc-400 border border-zinc-600',
};

// ── Local filter chips (per Discretion: duplicate not import — different chip set) ──
interface FilterChipDef {
  type: TypeFilter;
  label: string;
  count: number;
}

function NextBuildPlanFilterChips({
  active,
  counts,
  onChange,
}: {
  active: TypeFilter;
  counts: { all: number; bug: number; feature: number };
  onChange: (next: TypeFilter) => void;
}) {
  const chips: FilterChipDef[] = [
    { type: 'all', label: 'All', count: counts.all },
    { type: 'bug', label: 'Bugs', count: counts.bug },
    { type: 'feature', label: 'Features', count: counts.feature },
  ];

  return (
    <div className="flex flex-wrap gap-2 px-1">
      {chips.map(({ type, label, count }) => {
        const isActive = active === type;
        const isZero = count === 0;
        const baseClass = 'px-3 py-1.5 text-sm rounded-full border font-medium transition-colors cursor-pointer';
        const activeClass = 'border-violet-400 bg-gradient-to-r from-violet-500/10 to-blue-500/10 text-violet-300';
        const inactiveClass = 'border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600';
        const zeroClass = isZero ? 'opacity-50' : '';
        const className = [baseClass, isActive ? activeClass : inactiveClass, zeroClass]
          .filter(Boolean)
          .join(' ');

        return (
          <button
            key={type}
            type="button"
            aria-pressed={isActive}
            className={className}
            onClick={() => active !== type && onChange(type)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && active !== type) onChange(type);
            }}
          >
            {label} ({count})
          </button>
        );
      })}
    </div>
  );
}

// ── Relative time formatter (lightweight; no new dep needed) ──
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const sec = Math.round((now - then) / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.round(day / 30);
  return `${mo}mo ago`;
}

// ── Main component ────────────────────────────────────────────────────────
export default function NextBuildPlanClient({
  projectName,
  projectSlug,
  initialItems,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const initialTypeFromUrl = (searchParams?.get('type') ?? 'all') as TypeFilter;
  const validInitialType: TypeFilter = ['all', 'bug', 'feature'].includes(initialTypeFromUrl)
    ? initialTypeFromUrl
    : 'all';

  const [items, setItems] = useState<BuildPlanItem[]>(initialItems);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>(validInitialType);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // ── Filter chip click → update local state + URL ────────
  const handleFilterChange = useCallback(
    (next: TypeFilter) => {
      setTypeFilter(next);
      const params = new URLSearchParams(searchParams?.toString() ?? '');
      if (next === 'all') {
        params.delete('type');
      } else {
        params.set('type', next);
      }
      const qs = params.toString();
      const url = qs ? `${pathname}?${qs}` : pathname;
      router.replace(url);
    },
    [pathname, router, searchParams],
  );

  // ── Counts (derived) ─────────────────────────────────────
  const counts = useMemo(() => {
    const bugCount = items.filter((i) => i.type === 'bug').length;
    const featureCount = items.filter((i) => i.type === 'feature').length;
    return { all: items.length, bug: bugCount, feature: featureCount };
  }, [items]);

  // ── Visible items after applying filter ──────────────────
  const visibleItems = useMemo(() => {
    if (typeFilter === 'all') return items;
    return items.filter((i) => i.type === typeFilter);
  }, [items, typeFilter]);

  // ── Remove-from-build action ─────────────────────────────
  async function handleRemoveFromBuild(item: BuildPlanItem) {
    setRemovingId(item.id);
    setErrorMessage(null);

    // Optimistic: drop the row immediately
    const previous = items;
    setItems((cur) => cur.filter((i) => i.id !== item.id));

    const endpoint =
      item.type === 'bug'
        ? `/api/platform/bug-reports/${item.id}`
        : `/api/platform/feature-requests/${item.id}`;

    try {
      const res = await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inclusionState: 'pending_inclusion' }),
      });
      if (!res.ok) {
        // Rollback
        setItems(previous);
        let detail = '';
        try {
          const j = (await res.json()) as { error?: string };
          detail = j?.error ? `: ${j.error}` : '';
        } catch {
          // body not JSON — fall through
        }
        setErrorMessage(`Failed to remove "${item.title}" from build${detail}`);
      }
    } catch (e) {
      // Network/etc — also rollback
      setItems(previous);
      const msg = e instanceof Error ? e.message : 'network error';
      setErrorMessage(`Failed to remove "${item.title}" from build: ${msg}`);
    } finally {
      setRemovingId(null);
    }
  }

  // ── Render ───────────────────────────────────────────────
  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-zinc-100 mb-1">Next build plan</h1>
        <p className="text-sm text-zinc-500">
          {projectName} · items approved for the next build
        </p>
      </div>

      {/* Filter chips */}
      <div className="mb-6">
        <NextBuildPlanFilterChips
          active={typeFilter}
          counts={counts}
          onChange={handleFilterChange}
        />
      </div>

      {/* Error indicator */}
      {errorMessage && (
        <div
          role="alert"
          className="mb-4 px-4 py-2 rounded-md border border-red-500/30 bg-red-500/10 text-sm text-red-300"
        >
          {errorMessage}
        </div>
      )}

      {/* Table or empty state */}
      {items.length === 0 ? (
        <div className="p-12 text-center rounded-lg bg-zinc-900 border border-zinc-800">
          <p className="text-zinc-400 text-sm">
            No items approved for build for{' '}
            <span className="text-zinc-200 font-medium">{projectName}</span> yet — use
            Bug Reports / Feature Requests to propose and approve.
          </p>
        </div>
      ) : visibleItems.length === 0 ? (
        <div className="p-12 text-center rounded-lg bg-zinc-900 border border-zinc-800">
          <p className="text-zinc-400 text-sm">
            No {typeFilter === 'bug' ? 'bugs' : 'features'} match the current filter.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900/50">
              <tr className="border-b border-zinc-800">
                <th className="text-left px-3 py-2 text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
                  Type
                </th>
                <th className="text-left px-3 py-2 text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
                  Title
                </th>
                <th className="text-left px-3 py-2 text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
                  Severity
                </th>
                <th className="text-left px-3 py-2 text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
                  Approved
                </th>
                <th className="text-right px-3 py-2 text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50 bg-zinc-900">
              {visibleItems.map((item) => (
                <tr key={item.id} className="hover:bg-zinc-800/40 transition-colors">
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${TYPE_PILL[item.type]}`}
                    >
                      {item.type}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-zinc-100 max-w-md truncate">{item.title}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {item.type === 'bug' && item.severity ? (
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${SEVERITY_PILL[item.severity] ?? 'bg-zinc-700 text-zinc-400'}`}
                      >
                        {item.severity}
                      </span>
                    ) : (
                      <span className="text-zinc-600 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-zinc-400 text-xs whitespace-nowrap tabular-nums">
                    {relativeTime(item.updatedAt)}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <button
                      type="button"
                      aria-label={`Remove from build: ${item.title}`}
                      disabled={removingId === item.id}
                      onClick={() => handleRemoveFromBuild(item)}
                      className="px-2 py-1 rounded text-xs border border-zinc-700 text-zinc-300 hover:border-red-500/50 hover:text-red-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Remove from build
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
