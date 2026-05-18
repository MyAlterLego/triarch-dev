'use client';

/**
 * Phase 37 TRIG-06 — staff audit page for approval_events.
 *
 * Mirrors the lightweight client-only pattern from
 * src/app/admin/modules/access-audit/page.tsx (the sibling audit surface):
 * useProjectOptions for the project filter; useEffect fetch on mount and
 * on filter change; URL search params kept in sync so deep-links + back
 * button work.
 *
 * Subject-type select is forward-compatible — only 'build_trigger' exists
 * in v2.4 but the dropdown shape is in place so v3.0 customer approvals
 * (or any new approval surface) can be added by extending one constant.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Shield, User, Clock } from 'lucide-react';
import { useProjectOptions } from '@/lib/use-projects';

interface ApprovalEventRow {
  id: string;
  subjectType: string;
  subjectId: string;
  decision: string;
  surface: string;
  actorEmail: string;
  comment: string | null;
  metadata: Record<string, unknown>;
  project: string;
  createdAt: string;
}

const SUBJECT_TYPE_OPTIONS = [
  { value: 'build_trigger', label: 'Build Trigger' },
  // future v3.0: { value: 'release_approval', label: 'Release Approval' }
];

const DECISION_COLORS: Record<string, string> = {
  triggered: 'bg-teal-500/10 text-teal-400 border-teal-500/20',
  approved: 'bg-green-500/10 text-green-400 border-green-500/20',
  rejected: 'bg-red-500/10 text-red-400 border-red-500/20',
};

const TRUNCATE_LEN = 60;

export default function ApprovalAuditClient() {
  const router = useRouter();
  const sp = useSearchParams();
  const PROJECTS = useProjectOptions();

  const [subjectType, setSubjectType] = useState<string>(
    sp?.get('subject_type') ?? 'build_trigger',
  );
  const [projectFilter, setProjectFilter] = useState<string>(
    sp?.get('project') ?? 'all',
  );
  const [events, setEvents] = useState<ApprovalEventRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: '50' });
    if (subjectType) params.set('subject_type', subjectType);
    if (projectFilter && projectFilter !== 'all') params.set('project', projectFilter);
    try {
      const res = await fetch(`/api/platform/approval-events?${params}`);
      const data = await res.json();
      setEvents(data.events ?? []);
      setTotal(data.total ?? 0);
    } catch {
      setEvents([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [subjectType, projectFilter]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Mirror state in URL so deep-link + back button work (no scroll on update).
  useEffect(() => {
    const next = new URLSearchParams();
    if (subjectType) next.set('subject_type', subjectType);
    if (projectFilter && projectFilter !== 'all') next.set('project', projectFilter);
    router.replace(`?${next.toString()}`, { scroll: false });
  }, [subjectType, projectFilter, router]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Shield size={24} className="text-violet-400" />
          <div>
            <h1 className="text-2xl font-bold text-white">Approval Audit</h1>
            <p className="text-sm text-zinc-500 mt-0.5">
              {total} event{total !== 1 ? 's' : ''} logged
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-6">
        <label className="text-xs text-zinc-500">
          <span className="block mb-1">Subject Type</span>
          <select
            aria-label="Subject Type"
            value={subjectType}
            onChange={(e) => setSubjectType(e.target.value)}
            className="px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-md text-sm text-zinc-200 focus:outline-none focus:border-violet-500"
          >
            {SUBJECT_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-zinc-500">
          <span className="block mb-1">Project</span>
          <select
            aria-label="Project"
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            className="px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-md text-sm text-zinc-200 focus:outline-none focus:border-violet-500"
          >
            {PROJECTS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-20 bg-zinc-800/50 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : events.length === 0 ? (
        <div className="p-12 text-center rounded-lg bg-zinc-900 border border-zinc-800">
          <Shield size={32} className="mx-auto text-zinc-600 mb-3" />
          <p className="text-zinc-500">No approval events recorded yet</p>
          <p className="text-xs text-zinc-600 mt-1">
            Events appear here when staff clicks &ldquo;Generate build&rdquo; on the Next Build Plan page.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {events.map((ev) => {
            const date = new Date(ev.createdAt);
            const comment = ev.comment ?? '';
            const isExpanded = expanded.has(ev.id);
            const shownComment =
              isExpanded || comment.length <= TRUNCATE_LEN
                ? comment
                : `${comment.slice(0, TRUNCATE_LEN)}...`;
            return (
              <div
                key={ev.id}
                className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4"
              >
                <div className="flex items-start gap-3">
                  <User size={16} className="text-zinc-500 mt-1" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-zinc-200">
                        {ev.actorEmail}
                      </span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] border ${
                          DECISION_COLORS[ev.decision] ??
                          'bg-zinc-800 text-zinc-400 border-zinc-700'
                        }`}
                      >
                        {ev.decision}
                      </span>
                      <span className="text-[10px] text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">
                        {ev.surface}
                      </span>
                      <span className="text-[10px] text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">
                        {ev.project}
                      </span>
                      <span className="text-xs text-zinc-500">
                        {ev.subjectType} : {ev.subjectId.slice(0, 8)}
                      </span>
                    </div>
                    {comment && (
                      <div className="text-xs text-zinc-400 mt-2 font-mono whitespace-pre-wrap break-all">
                        <span>{shownComment}</span>
                        {comment.length > TRUNCATE_LEN && (
                          <button
                            type="button"
                            onClick={() => toggle(ev.id)}
                            className="ml-2 text-violet-400 hover:text-violet-300"
                          >
                            {isExpanded ? 'Show less' : 'Show more'}
                          </button>
                        )}
                      </div>
                    )}
                    <div className="flex items-center gap-3 mt-2 text-[10px] text-zinc-600">
                      <span className="flex items-center gap-1">
                        <Clock size={10} />
                        {date.toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
