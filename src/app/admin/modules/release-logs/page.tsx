'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useProjectOptions } from '@/lib/use-projects';
import LinksClient, { type ReleaseLogLink } from './LinksClient';
import {
  FileText,
  Bug,
  Wrench,
  BookOpen,
  Shield,
  Zap,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Plus,
  Search,
  X,
} from 'lucide-react';

interface ReleaseEntry {
  type: string;
  description: string;
  isc_ids?: string[];
  commit_sha?: string;
  bug_report_id?: string;
  files_changed?: number;
}

interface ReleaseLog {
  id: string;
  project: string;
  version: string;
  releaseType: string;
  releasedAt: string;
  releasedBy: string | null;
  summary: string | null;
  entries: ReleaseEntry[];
  metadata: Record<string, unknown>;
  links?: ReleaseLogLink[];
}

const ENTRY_TYPE_ICONS: Record<string, React.ReactNode> = {
  feature: <Zap size={13} className="text-teal-400" />,
  bugfix: <Bug size={13} className="text-red-400" />,
  refactor: <Wrench size={13} className="text-amber-400" />,
  docs: <BookOpen size={13} className="text-blue-400" />,
  security: <Shield size={13} className="text-purple-400" />,
  performance: <Zap size={13} className="text-green-400" />,
  breaking: <AlertTriangle size={13} className="text-orange-400" />,
};

const RELEASE_TYPE_COLORS: Record<string, string> = {
  patch: 'bg-zinc-700 text-zinc-300',
  minor: 'bg-blue-500/20 text-blue-400',
  major: 'bg-purple-500/20 text-purple-400',
};

export default function ReleaseLogsPage() {
  const [releases, setReleases] = useState<ReleaseLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [projectFilter, setProjectFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const PROJECTS = useProjectOptions();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [showAddForm, setShowAddForm] = useState(false);
  const [newRelease, setNewRelease] = useState({
    project: 'triarch-dev',
    version: '',
    releaseType: 'patch',
    summary: '',
    releasedBy: 'mike',
    entries: [] as ReleaseEntry[],
  });
  const [newEntry, setNewEntry] = useState({ type: 'feature', description: '' });

  const fetchReleases = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: '50' });
    if (projectFilter !== 'all') params.set('project', projectFilter);
    if (searchQuery) params.set('search', searchQuery);

    const res = await fetch(`/api/platform/release-logs?${params}`);
    const data = await res.json();
    setReleases(data.releases);
    setTotal(data.total);
    setLoading(false);
  }, [projectFilter, searchQuery]);

  useEffect(() => { fetchReleases(); }, [fetchReleases]);

  function toggleExpanded(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function addEntryToNew() {
    if (!newEntry.description) return;
    setNewRelease((prev) => ({
      ...prev,
      entries: [...prev.entries, { ...newEntry }],
    }));
    setNewEntry({ type: 'feature', description: '' });
  }

  async function submitRelease() {
    if (!newRelease.version || !newRelease.project) return;
    await fetch('/api/platform/release-logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newRelease),
    });
    setShowAddForm(false);
    setNewRelease({ project: 'triarch-dev', version: '', releaseType: 'patch', summary: '', releasedBy: 'mike', entries: [] });
    await fetchReleases();
  }

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Release Logs</h1>
          <p className="text-sm text-zinc-500 mt-1">
            {total} release{total !== 1 ? 's' : ''} tracked
          </p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center gap-1.5 px-3 py-2 text-sm bg-teal-600 text-white rounded-md hover:bg-teal-500"
        >
          <Plus size={14} /> Add Release
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-6">
        <select
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
          className="px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-md text-sm text-zinc-200 focus:outline-none focus:border-teal-500"
        >
          {PROJECTS.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search releases..."
            className="w-full pl-9 pr-3 py-2 bg-zinc-900 border border-zinc-700 rounded-md text-sm text-zinc-200 focus:outline-none focus:border-teal-500"
          />
        </div>
      </div>

      {/* Add Release Form */}
      {showAddForm && (
        <div className="mb-6 p-5 rounded-lg bg-zinc-900 border border-zinc-700">
          <h3 className="text-sm font-semibold text-white mb-4">New Release Entry</h3>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Project</label>
              <select
                value={newRelease.project}
                onChange={(e) => setNewRelease({ ...newRelease, project: e.target.value })}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-md text-sm text-zinc-200 focus:outline-none focus:border-teal-500"
              >
                {PROJECTS.filter((p) => p.value !== 'all').map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Version</label>
              <input
                value={newRelease.version}
                onChange={(e) => setNewRelease({ ...newRelease, version: e.target.value })}
                placeholder="v0.3.0"
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-md text-sm text-zinc-200 focus:outline-none focus:border-teal-500"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Release Type</label>
              <select
                value={newRelease.releaseType}
                onChange={(e) => setNewRelease({ ...newRelease, releaseType: e.target.value })}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-md text-sm text-zinc-200 focus:outline-none focus:border-teal-500"
              >
                <option value="patch">Patch</option>
                <option value="minor">Minor</option>
                <option value="major">Major</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Released By</label>
              <input
                value={newRelease.releasedBy}
                onChange={(e) => setNewRelease({ ...newRelease, releasedBy: e.target.value })}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-md text-sm text-zinc-200 focus:outline-none focus:border-teal-500"
              />
            </div>
          </div>
          <div className="mb-3">
            <label className="block text-xs text-zinc-500 mb-1">Summary</label>
            <input
              value={newRelease.summary}
              onChange={(e) => setNewRelease({ ...newRelease, summary: e.target.value })}
              placeholder="One-line release summary"
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-md text-sm text-zinc-200 focus:outline-none focus:border-teal-500"
            />
          </div>

          {/* Entries */}
          <div className="mb-3">
            <label className="block text-xs text-zinc-500 mb-2">Changelog Entries</label>
            {newRelease.entries.map((entry, i) => (
              <div key={i} className="flex items-center gap-2 mb-1 text-sm">
                <span className="flex-shrink-0">{ENTRY_TYPE_ICONS[entry.type] ?? <FileText size={13} className="text-zinc-400" />}</span>
                <span className="text-zinc-300 flex-1">{entry.description}</span>
                <span className="text-[10px] text-zinc-600">{entry.type}</span>
                <button
                  onClick={() => setNewRelease((prev) => ({ ...prev, entries: prev.entries.filter((_, j) => j !== i) }))}
                  className="text-zinc-600 hover:text-red-400"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
            <div className="flex items-center gap-2 mt-2">
              <select
                value={newEntry.type}
                onChange={(e) => setNewEntry({ ...newEntry, type: e.target.value })}
                className="px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-300 focus:outline-none focus:border-teal-500"
              >
                {Object.keys(ENTRY_TYPE_ICONS).map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <input
                value={newEntry.description}
                onChange={(e) => setNewEntry({ ...newEntry, description: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && addEntryToNew()}
                placeholder="Entry description"
                className="flex-1 px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-sm text-zinc-200 focus:outline-none focus:border-teal-500"
              />
              <button onClick={addEntryToNew} className="text-teal-400 hover:text-teal-300 text-xs px-2 py-1.5">
                Add
              </button>
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => setShowAddForm(false)} className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200">Cancel</button>
            <button
              onClick={submitRelease}
              disabled={!newRelease.version}
              className="px-4 py-2 text-sm bg-teal-600 text-white rounded-md hover:bg-teal-500 disabled:opacity-50"
            >
              Save Release
            </button>
          </div>
        </div>
      )}

      {/* Timeline */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-20 bg-zinc-800/50 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : releases.length === 0 ? (
        <div className="p-12 text-center rounded-lg bg-zinc-900 border border-zinc-800">
          <FileText size={32} className="mx-auto text-zinc-600 mb-3" />
          <p className="text-zinc-500">No releases found</p>
          <p className="text-xs text-zinc-600 mt-1">Click &ldquo;Add Release&rdquo; to log one manually, or push a version to populate automatically.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {releases.map((release) => {
            const entries = release.entries as ReleaseEntry[];
            const expanded = expandedIds.has(release.id);
            const date = new Date(release.releasedAt);
            return (
              <div key={release.id} className="rounded-lg border border-zinc-800 bg-zinc-900/50 overflow-hidden">
                <button
                  onClick={() => toggleExpanded(release.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-zinc-800/30 transition-colors"
                >
                  {entries.length > 0 ? (
                    expanded ? <ChevronDown size={14} className="text-zinc-500" /> : <ChevronRight size={14} className="text-zinc-500" />
                  ) : (
                    <span className="w-3.5" />
                  )}

                  <span className="font-mono text-sm font-semibold text-teal-400">{release.version}</span>

                  <span className={`px-1.5 py-0.5 rounded text-[10px] ${RELEASE_TYPE_COLORS[release.releaseType] ?? 'bg-zinc-700 text-zinc-400'}`}>
                    {release.releaseType}
                  </span>

                  <span className="text-sm text-zinc-400 flex-1">{release.summary}</span>

                  <span className="text-[10px] text-zinc-600 font-mono">
                    {release.project !== 'triarch-dev' && <span className="mr-2">{release.project}</span>}
                    {date.toLocaleDateString()}
                  </span>

                  {release.releasedBy && (
                    <span className="text-[10px] text-zinc-600">{release.releasedBy}</span>
                  )}
                </button>

                {expanded && (
                  <div className="border-t border-zinc-800 px-4 py-3 space-y-1.5">
                    {entries.map((entry, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm">
                        <span className="mt-0.5 flex-shrink-0">
                          {ENTRY_TYPE_ICONS[entry.type] ?? <FileText size={13} className="text-zinc-400" />}
                        </span>
                        <span className="text-zinc-300">{entry.description}</span>
                        {entry.commit_sha && (
                          <span className="text-[10px] text-zinc-600 font-mono ml-auto">{entry.commit_sha.slice(0, 7)}</span>
                        )}
                      </div>
                    ))}
                    <LinksClient
                      releaseId={release.id}
                      initialLinks={release.links ?? []}
                      project={release.project}
                    />
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
