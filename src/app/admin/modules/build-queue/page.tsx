'use client';

/**
 * Build Queue Kanban page — /admin/modules/build-queue.
 *
 * Staff-only operational dashboard listing bugs + features grouped by
 * Kanban column (Backlog / Next Release / In Progress / Done) across all
 * projects, with project filter, version filter, bulk actions, and drag-
 * and-drop to move items between columns.
 *
 * Server data: GET /api/platform/build-queue (returns 403 to non-staff;
 * the layout's session gate already redirects unauthenticated users).
 * Mutations: PATCH /api/platform/{bug-reports|feature-requests}/{id}
 * with the new status/targetVersion fields.
 *
 * Ported from security-admin@7b133f1 with platform-friendly adaptations:
 *   - Page chrome simplified to match the other /admin/modules/* pages
 *     (no TopBar / SectionTabBarClient — those don't exist on platform).
 *   - Fetch hits /api/platform/build-queue on this app (same origin).
 */
import { useEffect, useState, useCallback } from 'react';
import { SkeletonLoader, EmptyState } from '@triarchsecurity/shared-ui';
import { KanbanBoard, BuildQueueResponse } from '@/components/BuildQueue/KanbanBoard';

// Inline SVG icons (no lucide dep for these two — keep the chunk small)
function AlertIcon({ className, size = 48 }: { className?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

function InboxIcon({ className, size = 48 }: { className?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
      <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </svg>
  );
}

export default function BuildQueuePage() {
  const [data, setData] = useState<BuildQueueResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedProject, setSelectedProject] = useState('all');
  const [selectedVersion, setSelectedVersion] = useState('');
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (project: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (project !== 'all') params.set('project', project);
      const res = await fetch(`/api/platform/build-queue?${params.toString()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Build queue request failed (${res.status})`);
      }
      const json = (await res.json()) as BuildQueueResponse;
      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load build queue');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(selectedProject);
  }, [selectedProject, fetchData]);

  // ── Mutators ───────────────────────────────────────────────────────────

  const patch = async (
    id: string,
    type: 'bug' | 'feature',
    body: Record<string, unknown>,
  ): Promise<Response> => {
    const url =
      type === 'bug'
        ? `/api/platform/bug-reports/${id}`
        : `/api/platform/feature-requests/${id}`;
    return fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  };

  const handleStatusChange = useCallback(
    async (id: string, type: 'bug' | 'feature', newStatus: string) => {
      await patch(id, type, { status: newStatus });
      fetchData(selectedProject);
    },
    [selectedProject, fetchData],
  );

  const handleVersionItemChange = useCallback(
    async (id: string, type: 'bug' | 'feature', version: string) => {
      await patch(id, type, { targetVersion: version });
      fetchData(selectedProject);
    },
    [selectedProject, fetchData],
  );

  const handleBulkStatusChange = useCallback(
    async (ids: string[], type: 'bug' | 'feature', status: string) => {
      await Promise.all(ids.map((id) => patch(id, type, { status })));
      fetchData(selectedProject);
    },
    [selectedProject, fetchData],
  );

  const handleBulkVersionChange = useCallback(
    async (ids: string[], type: 'bug' | 'feature', version: string) => {
      await Promise.all(ids.map((id) => patch(id, type, { targetVersion: version })));
      fetchData(selectedProject);
    },
    [selectedProject, fetchData],
  );

  const handleApprove = useCallback(
    async (item: { id: string; type: 'bug' | 'feature' }) => {
      const res = await patch(item.id, item.type, {
        status: 'approved',
        reason: 'Approved from Build Queue',
      });
      if (res.ok) fetchData(selectedProject);
    },
    [selectedProject, fetchData],
  );

  // ── Client-side version filter (server doesn't filter by version) ──────

  function filterByVersion(source: BuildQueueResponse | null): BuildQueueResponse | null {
    if (!source || !selectedVersion.trim()) return source;
    const v = selectedVersion.trim().toLowerCase();
    function filterBucket<T extends { targetVersion?: string | null }>(bucket: T[]): T[] {
      return bucket.filter((item) => (item.targetVersion ?? '').toLowerCase().includes(v));
    }
    return {
      backlog: filterBucket(source.backlog),
      next_release: filterBucket(source.next_release),
      in_progress: filterBucket(source.in_progress),
      done: filterBucket(source.done),
    };
  }

  const filteredData = filterByVersion(data);
  const totalItems = data
    ? data.backlog.length + data.next_release.length + data.in_progress.length + data.done.length
    : 0;

  return (
    <div className="p-8" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px' }}>
        <h1 className="text-xl font-bold text-white">Build Queue</h1>
        <span className="text-sm text-zinc-400">All projects — bugs and features</span>
      </div>

      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <SkeletonLoader variant="text" lines={3} />
        </div>
      )}

      {!loading && error && (
        <EmptyState icon={AlertIcon} title="Failed to load build queue" description={error} />
      )}

      {!loading && !error && filteredData && totalItems === 0 && (
        <EmptyState
          icon={InboxIcon}
          title="No items in the build queue"
          description="Bug reports and feature requests will appear here once submitted."
        />
      )}

      {!loading && !error && filteredData && totalItems > 0 && (
        <KanbanBoard
          data={filteredData}
          selectedProject={selectedProject}
          onProjectChange={setSelectedProject}
          selectedVersion={selectedVersion}
          onVersionChange={setSelectedVersion}
          onStatusChange={handleStatusChange}
          onVersionItemChange={handleVersionItemChange}
          onBulkStatusChange={handleBulkStatusChange}
          onBulkVersionChange={handleBulkVersionChange}
          onApprove={handleApprove}
        />
      )}
    </div>
  );
}
