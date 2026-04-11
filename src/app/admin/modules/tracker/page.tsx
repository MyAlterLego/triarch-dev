'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useProjectOptions } from '@/lib/use-projects';
import {
  Bug,
  Lightbulb,
  List,
  Columns3,
  ChevronDown,
  ChevronRight,
  Settings2,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────

interface TrackerItem {
  id: string;
  type: 'bug' | 'feature';
  project: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  severity?: string;
  estimatedEffort?: string | null;
  createdAt: string;
  updatedAt: string;
  reportedByName?: string | null;
  reportedByEmail?: string | null;
  requestedByName?: string | null;
  requestedByEmail?: string | null;
  stepsToReproduce?: string | null;
  useCase?: string | null;
  triarchNotes?: string | null;
  fixVersion?: string | null;
  targetVersion?: string | null;
}

// ── Status Mapping ───────────────────────────────────────────────────

const KANBAN_COLUMNS = [
  { key: 'backlog', label: 'Backlog', statuses: ['submitted', 'plan_generated'] },
  { key: 'triaged', label: 'Triaged', statuses: ['triaged', 'reviewed'] },
  { key: 'ready', label: 'Ready', statuses: ['approved', 'queued'] },
  { key: 'in_progress', label: 'In Progress', statuses: ['in_progress'] },
  { key: 'done', label: 'Done', statuses: ['fixed', 'verified', 'shipped', 'closed'] },
  { key: 'rejected', label: 'Rejected', statuses: ['deferred', 'declined'] },
];

const DONE_STATUSES = new Set(['fixed', 'verified', 'shipped', 'closed', 'deferred', 'declined']);

const ALL_STATUSES = KANBAN_COLUMNS.flatMap((c) => c.statuses);

const TYPE_ICON: Record<string, React.ReactNode> = {
  bug: <Bug size={12} className="text-red-400" />,
  feature: <Lightbulb size={12} className="text-amber-400" />,
};

const STATUS_COLORS: Record<string, string> = {
  submitted: 'bg-zinc-700 text-zinc-300',
  plan_generated: 'bg-blue-500/20 text-blue-400',
  triaged: 'bg-blue-500/20 text-blue-400',
  reviewed: 'bg-amber-500/20 text-amber-400',
  approved: 'bg-teal-500/20 text-teal-400',
  queued: 'bg-purple-500/20 text-purple-400',
  in_progress: 'bg-amber-500/20 text-amber-400',
  fixed: 'bg-green-500/20 text-green-400',
  verified: 'bg-green-600/20 text-green-300',
  shipped: 'bg-green-500/20 text-green-400',
  closed: 'bg-zinc-800 text-zinc-500',
  deferred: 'bg-purple-500/20 text-purple-400',
  declined: 'bg-red-500/20 text-red-400',
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-red-500/20 text-red-400 border-red-500/30',
  high: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  medium: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  low: 'bg-zinc-700 text-zinc-400 border-zinc-600',
};

const PRIORITY_COLORS: Record<string, string> = {
  fix_now: 'bg-red-500/20 text-red-400 border-red-500/30',
  fix_later: 'bg-zinc-700 text-zinc-400 border-zinc-600',
  high: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  normal: 'bg-zinc-700 text-zinc-400 border-zinc-600',
  low: 'bg-zinc-700 text-zinc-500 border-zinc-700',
};

const COLUMN_COLORS: Record<string, string> = {
  backlog: 'border-zinc-600',
  triaged: 'border-blue-500/50',
  ready: 'border-teal-500/50',
  in_progress: 'border-amber-500/50',
  done: 'border-green-500/50',
  rejected: 'border-red-500/50',
};

function StatusSelect({
  value,
  onChange,
  disabled,
  className = '',
}: {
  value: string;
  onChange: (status: string) => void;
  disabled: boolean;
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={`bg-zinc-800 border border-zinc-700 rounded text-zinc-300 focus:outline-none focus:border-teal-500 ${className}`}
    >
      {ALL_STATUSES.map((s) => (
        <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
      ))}
    </select>
  );
}

// ── Component ────────────────────────────────────────────────────────

export default function TrackerPage() {
  const PROJECTS = useProjectOptions();
  const [items, setItems] = useState<TrackerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'list' | 'kanban'>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('tracker-view') as 'list' | 'kanban') || 'list';
    }
    return 'list';
  });
  const [projectFilter, setProjectFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'bug' | 'feature'>('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [kanbanThreshold, setKanbanThreshold] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      return parseInt(localStorage.getItem('tracker-kanban-threshold') ?? '15', 10);
    }
    return 15;
  });
  const [showSettings, setShowSettings] = useState(false);

  // Persist view preference
  useEffect(() => {
    localStorage.setItem('tracker-view', view);
  }, [view]);

  useEffect(() => {
    localStorage.setItem('tracker-kanban-threshold', String(kanbanThreshold));
  }, [kanbanThreshold]);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    const bugParams = new URLSearchParams({ limit: '200' });
    const featureParams = new URLSearchParams({ limit: '200' });
    if (projectFilter !== 'all') {
      bugParams.set('project', projectFilter);
      featureParams.set('project', projectFilter);
    }

    const [bugRes, featureRes] = await Promise.all([
      fetch(`/api/platform/bug-reports?${bugParams}`),
      fetch(`/api/platform/feature-requests?${featureParams}`),
    ]);

    const bugData = bugRes.ok ? await bugRes.json() : { bugs: [] };
    const featureData = featureRes.ok ? await featureRes.json() : { features: [] };

    const bugs: TrackerItem[] = (bugData.bugs ?? []).map((b: Record<string, unknown>) => ({
      ...b,
      type: 'bug' as const,
    }));
    const features: TrackerItem[] = (featureData.features ?? []).map((f: Record<string, unknown>) => ({
      ...f,
      type: 'feature' as const,
    }));

    const merged = [...bugs, ...features].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    setItems(merged);
    setLoading(false);
  }, [projectFilter]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  async function updateItem(item: TrackerItem, updates: Record<string, unknown>) {
    setUpdatingId(item.id);
    try {
      const endpoint = item.type === 'bug'
        ? `/api/platform/bug-reports/${item.id}`
        : `/api/platform/feature-requests/${item.id}`;
      const res = await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) console.error('Update failed:', res.status);
      await fetchItems();
    } finally {
      setUpdatingId(null);
    }
  }

  // Shared type-filtered base for both views
  const typeFilteredItems = useMemo(() => {
    if (typeFilter === 'all') return items;
    return items.filter((item) => item.type === typeFilter);
  }, [items, typeFilter]);

  // List view adds status filtering
  const filteredItems = useMemo(() => {
    if (statusFilter === 'all') return typeFilteredItems;
    return typeFilteredItems.filter((item) => item.status === statusFilter);
  }, [typeFilteredItems, statusFilter]);

  // Kanban view hides completed/rejected items older than threshold
  const kanbanItems = useMemo(() => {
    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() - kanbanThreshold);

    return typeFilteredItems.filter((item) => {
      if (DONE_STATUSES.has(item.status)) {
        const updatedAt = new Date(item.updatedAt);
        if (updatedAt < thresholdDate) return false;
      }
      return true;
    });
  }, [typeFilteredItems, kanbanThreshold]);

  return (
    <div className="p-8 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Columns3 size={24} className="text-teal-400" />
          <div>
            <h1 className="text-2xl font-bold text-white">Work Tracker</h1>
            <p className="text-sm text-zinc-500 mt-0.5">
              {items.length} item{items.length !== 1 ? 's' : ''} across all projects
            </p>
          </div>
        </div>

        {/* View Toggle */}
        <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-700 rounded-lg p-1">
          <button
            onClick={() => setView('list')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 ${
              view === 'list' ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <List size={14} /> List
          </button>
          <button
            onClick={() => setView('kanban')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 ${
              view === 'kanban' ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Columns3 size={14} /> Kanban
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <select
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
          className="px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-md text-sm text-zinc-200 focus:outline-none focus:border-teal-500"
        >
          {PROJECTS.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as 'all' | 'bug' | 'feature')}
          className="px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-md text-sm text-zinc-200 focus:outline-none focus:border-teal-500"
        >
          <option value="all">All Types</option>
          <option value="bug">Bugs</option>
          <option value="feature">Features</option>
        </select>

        {view === 'list' && (
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-md text-sm text-zinc-200 focus:outline-none focus:border-teal-500"
          >
            <option value="all">All Statuses</option>
            {ALL_STATUSES.map((s) => (
              <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
            ))}
          </select>
        )}

        {view === 'kanban' && (
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="p-2 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
              title="Kanban settings"
            >
              <Settings2 size={16} />
            </button>
            {showSettings && (
              <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-700 rounded-md px-3 py-1.5">
                <label className="text-xs text-zinc-400">Hide done older than</label>
                <input
                  type="number"
                  value={kanbanThreshold}
                  onChange={(e) => setKanbanThreshold(Math.max(1, parseInt(e.target.value) || 15))}
                  className="w-12 px-2 py-1 bg-zinc-800 border border-zinc-600 rounded text-xs text-zinc-200 text-center focus:outline-none focus:border-teal-500"
                  min={1}
                />
                <span className="text-xs text-zinc-400">days</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Loading */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-16 bg-zinc-800/50 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : view === 'list' ? (
        <ListView
          items={filteredItems}
          expandedId={expandedId}
          setExpandedId={setExpandedId}
          updatingId={updatingId}
          updateItem={updateItem}
        />
      ) : (
        <KanbanView items={kanbanItems} updateItem={updateItem} updatingId={updatingId} />
      )}
    </div>
  );
}

// ── List View ────────────────────────────────────────────────────────

function ListView({
  items,
  expandedId,
  setExpandedId,
  updatingId,
  updateItem,
}: {
  items: TrackerItem[];
  expandedId: string | null;
  setExpandedId: (id: string | null) => void;
  updatingId: string | null;
  updateItem: (item: TrackerItem, updates: Record<string, unknown>) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="p-12 text-center rounded-lg bg-zinc-900 border border-zinc-800">
        <Columns3 size={32} className="mx-auto text-zinc-600 mb-3" />
        <p className="text-zinc-500">No items found</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((item) => {
        const expanded = expandedId === item.id;
        return (
          <div key={item.id} className="rounded-lg border border-zinc-800 bg-zinc-900/50 overflow-hidden">
            <button
              onClick={() => setExpandedId(expanded ? null : item.id)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-zinc-800/30 transition-colors"
            >
              {expanded ? <ChevronDown size={14} className="text-zinc-500" /> : <ChevronRight size={14} className="text-zinc-500" />}
              <span className="flex items-center gap-1">{TYPE_ICON[item.type]}</span>
              {item.type === 'bug' && item.severity && (
                <span className={`px-1.5 py-0.5 rounded text-[10px] border ${SEVERITY_COLORS[item.severity] ?? 'bg-zinc-700 text-zinc-400 border-zinc-600'}`}>
                  {item.severity}
                </span>
              )}
              <span className="text-sm text-zinc-200 flex-1 truncate">{item.title}</span>
              <span className={`px-1.5 py-0.5 rounded text-[10px] ${STATUS_COLORS[item.status] ?? 'bg-zinc-700 text-zinc-400'}`}>
                {item.status.replace(/_/g, ' ')}
              </span>
              <span className={`px-1.5 py-0.5 rounded text-[10px] border ${PRIORITY_COLORS[item.priority] ?? 'bg-zinc-700 text-zinc-400 border-zinc-600'}`}>
                {item.priority.replace(/_/g, ' ')}
              </span>
              <span className="text-[10px] text-zinc-600 w-20 text-right">{item.project}</span>
              <span className="text-[10px] text-zinc-600">{new Date(item.createdAt).toLocaleDateString()}</span>
            </button>

            {expanded && (
              <div className="border-t border-zinc-800 p-4 space-y-3">
                <div>
                  <span className="text-xs text-zinc-500">
                    {item.type === 'bug' ? 'Reported' : 'Requested'} by:{' '}
                  </span>
                  <span className="text-sm text-zinc-300">
                    {item.reportedByName ?? item.requestedByName ?? item.reportedByEmail ?? item.requestedByEmail ?? 'Unknown'}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-zinc-500 block mb-1">Description</span>
                  <p className="text-sm text-zinc-300 whitespace-pre-wrap">{item.description}</p>
                </div>
                {item.stepsToReproduce && (
                  <div>
                    <span className="text-xs text-zinc-500 block mb-1">Steps to Reproduce</span>
                    <p className="text-sm text-zinc-400 whitespace-pre-wrap">{item.stepsToReproduce}</p>
                  </div>
                )}
                {item.useCase && (
                  <div>
                    <span className="text-xs text-zinc-500 block mb-1">Use Case</span>
                    <p className="text-sm text-zinc-400 whitespace-pre-wrap">{item.useCase}</p>
                  </div>
                )}
                {item.triarchNotes && (
                  <div>
                    <span className="text-xs text-zinc-500 block mb-1">Notes</span>
                    <p className="text-sm text-zinc-400 whitespace-pre-wrap">{item.triarchNotes}</p>
                  </div>
                )}

                {/* Inline controls */}
                <div className="flex items-center gap-2 pt-2 border-t border-zinc-800 flex-wrap">
                  <span className="text-xs text-zinc-500">Status:</span>
                  <StatusSelect
                    value={item.status}
                    onChange={(status) => updateItem(item, { status })}
                    disabled={updatingId === item.id}
                    className="px-2 py-1 text-xs"
                  />

                  {item.type === 'bug' && (
                    <>
                      <span className="text-xs text-zinc-500 ml-3">Priority:</span>
                      <button
                        onClick={() => updateItem(item, { priority: item.priority === 'fix_now' ? 'fix_later' : 'fix_now' })}
                        disabled={updatingId === item.id}
                        className={`px-2 py-1 rounded text-xs border transition-colors ${
                          item.priority === 'fix_now'
                            ? 'bg-red-500/20 text-red-400 border-red-500/30 hover:bg-red-500/30'
                            : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:bg-zinc-700'
                        }`}
                      >
                        {item.priority === 'fix_now' ? 'Fix Now' : 'Fix Later'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Kanban View ──────────────────────────────────────────────────────

function KanbanView({
  items,
  updateItem,
  updatingId,
}: {
  items: TrackerItem[];
  updateItem: (item: TrackerItem, updates: Record<string, unknown>) => void;
  updatingId: string | null;
}) {
  const columnItems = useMemo(() => {
    const map: Record<string, TrackerItem[]> = {};
    for (const col of KANBAN_COLUMNS) {
      map[col.key] = items.filter((item) => col.statuses.includes(item.status));
    }
    return map;
  }, [items]);

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {KANBAN_COLUMNS.map((col) => (
        <div
          key={col.key}
          className={`flex-shrink-0 w-64 border-t-2 ${COLUMN_COLORS[col.key]} bg-zinc-900/30 rounded-lg`}
        >
          <div className="px-3 py-2 flex items-center justify-between">
            <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">{col.label}</h3>
            <span className="text-[10px] text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded-full">
              {columnItems[col.key].length}
            </span>
          </div>
          <div className="px-2 pb-2 space-y-2 max-h-[calc(100vh-280px)] overflow-y-auto">
            {columnItems[col.key].length === 0 ? (
              <div className="p-4 text-center text-[10px] text-zinc-600">No items</div>
            ) : (
              columnItems[col.key].map((item) => (
                <KanbanCard key={item.id} item={item} updateItem={updateItem} updatingId={updatingId} />
              ))
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function KanbanCard({
  item,
  updateItem,
  updatingId,
}: {
  item: TrackerItem;
  updateItem: (item: TrackerItem, updates: Record<string, unknown>) => void;
  updatingId: string | null;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-900 p-2.5 hover:border-zinc-700 transition-colors">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left"
      >
        <div className="flex items-start gap-2">
          <span className="mt-0.5">{TYPE_ICON[item.type]}</span>
          <span className="text-xs text-zinc-200 leading-tight flex-1">{item.title}</span>
        </div>
        <div className="flex items-center gap-1.5 mt-2">
          <span className="text-[9px] text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">
            {item.project}
          </span>
          <span className={`text-[9px] px-1.5 py-0.5 rounded border ${PRIORITY_COLORS[item.priority] ?? 'bg-zinc-700 text-zinc-400 border-zinc-600'}`}>
            {item.priority.replace(/_/g, ' ')}
          </span>
          {item.type === 'bug' && item.severity && (
            <span className={`text-[9px] px-1.5 py-0.5 rounded border ${SEVERITY_COLORS[item.severity] ?? 'bg-zinc-700 text-zinc-500 border-zinc-600'}`}>
              {item.severity}
            </span>
          )}
        </div>
      </button>

      {expanded && (
        <div className="mt-2 pt-2 border-t border-zinc-800 space-y-2">
          <p className="text-[11px] text-zinc-400 line-clamp-3">{item.description}</p>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-zinc-500">Status:</span>
            <StatusSelect
              value={item.status}
              onChange={(status) => updateItem(item, { status })}
              disabled={updatingId === item.id}
              className="px-1.5 py-0.5 text-[10px]"
            />
          </div>
          <div className="text-[9px] text-zinc-600">
            {new Date(item.createdAt).toLocaleDateString()}
          </div>
        </div>
      )}
    </div>
  );
}
