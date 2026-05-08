'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useProjectOptions } from '@/lib/use-projects';
import { Bug, ChevronDown, ChevronRight, Search } from 'lucide-react';

interface BugReport {
  id: string;
  project: string;
  reportedByName: string | null;
  reportedByEmail: string | null;
  title: string;
  description: string;
  stepsToReproduce: string | null;
  severity: string;
  priority: string;
  status: string;
  triarchNotes: string | null;
  fixVersion: string | null;
  createdAt: string;
  updatedAt: string;
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-red-500/20 text-red-400 border-red-500/30',
  high: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  medium: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  low: 'bg-zinc-700 text-zinc-400 border-zinc-600',
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

const STATUSES = ['all', 'submitted', 'triaged', 'approved', 'in_progress', 'fixed', 'verified', 'closed', 'deferred'];

export default function BugReportsPage() {
  const PROJECTS = useProjectOptions();
  const [bugs, setBugs] = useState<BugReport[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [projectFilter, setProjectFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const fetchBugs = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: '50' });
    if (projectFilter !== 'all') params.set('project', projectFilter);
    if (statusFilter !== 'all') params.set('status', statusFilter);

    const res = await fetch(`/api/platform/bug-reports?${params}`);
    const data = await res.json();
    setBugs(data.bugs);
    setTotal(data.total);
    setLoading(false);
  }, [projectFilter, statusFilter]);

  useEffect(() => { fetchBugs(); }, [fetchBugs]);

  async function updateBug(id: string, updates: Record<string, unknown>) {
    setUpdatingId(id);
    await fetch(`/api/platform/bug-reports/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    await fetchBugs();
    setUpdatingId(null);
  }

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center gap-3 mb-6">
        <Bug size={24} className="text-red-400" />
        <div>
          <h1 className="text-2xl font-bold text-white">Bug Reports</h1>
          <p className="text-sm text-zinc-500 mt-0.5">{total} report{total !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-6">
        <select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}
          className="px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-md text-sm text-zinc-200 focus:outline-none focus:border-teal-500">
          {PROJECTS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-md text-sm text-zinc-200 focus:outline-none focus:border-teal-500">
          {STATUSES.map((s) => <option key={s} value={s}>{s === 'all' ? 'All Statuses' : s.replace('_', ' ')}</option>)}
        </select>
      </div>

      {/* Bug list */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <div key={i} className="h-16 bg-zinc-800/50 rounded-lg animate-pulse" />)}
        </div>
      ) : bugs.length === 0 ? (
        <div className="p-12 text-center rounded-lg bg-zinc-900 border border-zinc-800">
          <Bug size={32} className="mx-auto text-zinc-600 mb-3" />
          <p className="text-zinc-500">No bug reports found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {bugs.map((bug) => {
            const expanded = expandedId === bug.id;
            return (
              <div key={bug.id} className="rounded-lg border border-zinc-800 bg-zinc-900/50 overflow-hidden">
                <button
                  onClick={() => setExpandedId(expanded ? null : bug.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-zinc-800/30 transition-colors"
                >
                  {expanded ? <ChevronDown size={14} className="text-zinc-500" /> : <ChevronRight size={14} className="text-zinc-500" />}
                  <span className={`px-1.5 py-0.5 rounded text-[10px] border ${SEVERITY_COLORS[bug.severity] ?? ''}`}>
                    {bug.severity}
                  </span>
                  <Link
                    href={`/admin/modules/bug-reports/${bug.id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="text-sm text-zinc-200 flex-1 truncate hover:text-violet-300 transition-colors cursor-pointer"
                  >
                    {bug.title}
                  </Link>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] ${STATUS_COLORS[bug.status] ?? 'bg-zinc-700 text-zinc-400'}`}>
                    {bug.status.replace('_', ' ')}
                  </span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] ${bug.priority === 'fix_now' ? 'bg-red-500/20 text-red-400' : 'bg-zinc-700 text-zinc-400'}`}>
                    {bug.priority.replace('_', ' ')}
                  </span>
                  <span className="text-[10px] text-zinc-600">{bug.project}</span>
                  <span className="text-[10px] text-zinc-600">{new Date(bug.createdAt).toLocaleDateString()}</span>
                </button>

                {expanded && (
                  <div className="border-t border-zinc-800 p-4 space-y-3">
                    <div>
                      <span className="text-xs text-zinc-500">Reported by: </span>
                      <span className="text-sm text-zinc-300">{bug.reportedByName ?? bug.reportedByEmail ?? 'Unknown'}</span>
                    </div>
                    <div>
                      <span className="text-xs text-zinc-500 block mb-1">Description</span>
                      <p className="text-sm text-zinc-300 whitespace-pre-wrap">{bug.description}</p>
                    </div>
                    {bug.stepsToReproduce && (
                      <div>
                        <span className="text-xs text-zinc-500 block mb-1">Steps to Reproduce</span>
                        <p className="text-sm text-zinc-400 whitespace-pre-wrap">{bug.stepsToReproduce}</p>
                      </div>
                    )}

                    {/* Quick actions */}
                    <div className="flex items-center gap-2 pt-2 border-t border-zinc-800">
                      <span className="text-xs text-zinc-500">Status:</span>
                      <select
                        value={bug.status}
                        onChange={(e) => updateBug(bug.id, { status: e.target.value })}
                        disabled={updatingId === bug.id}
                        className="px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-300 focus:outline-none focus:border-teal-500"
                      >
                        {STATUSES.filter((s) => s !== 'all').map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                      </select>

                      <span className="text-xs text-zinc-500 ml-4">Priority:</span>
                      <button
                        onClick={() => updateBug(bug.id, { priority: bug.priority === 'fix_now' ? 'fix_later' : 'fix_now' })}
                        disabled={updatingId === bug.id}
                        className={`px-2 py-1 rounded text-xs border transition-colors ${
                          bug.priority === 'fix_now'
                            ? 'bg-red-500/20 text-red-400 border-red-500/30 hover:bg-red-500/30'
                            : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:bg-zinc-700'
                        }`}
                      >
                        {bug.priority === 'fix_now' ? 'Fix Now' : 'Fix Later'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
