'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useProjectOptions } from '@/lib/use-projects';
import { Lightbulb, ChevronDown, ChevronRight, ThumbsUp } from 'lucide-react';

interface FeatureRequest {
  id: string;
  project: string;
  requestedByName: string | null;
  requestedByEmail: string | null;
  title: string;
  description: string;
  useCase: string | null;
  priority: string;
  status: string;
  buildPlan: Record<string, unknown> | null;
  buildPlanStatus: string | null;
  estimatedEffort: string | null;
  targetVersion: string | null;
  shippedVersion: string | null;
  triarchNotes: string | null;
  upvotes: number;
  createdAt: string;
}

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

const EFFORT_COLORS: Record<string, string> = {
  small: 'text-green-400',
  medium: 'text-amber-400',
  large: 'text-orange-400',
  epic: 'text-red-400',
};

export default function FeatureRequestsPage() {
  const PROJECTS = useProjectOptions();
  const [features, setFeatures] = useState<FeatureRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [projectFilter, setProjectFilter] = useState('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const fetchFeatures = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: '50' });
    if (projectFilter !== 'all') params.set('project', projectFilter);

    const res = await fetch(`/api/platform/feature-requests?${params}`);
    const data = await res.json();
    setFeatures(data.features);
    setTotal(data.total);
    setLoading(false);
  }, [projectFilter]);

  useEffect(() => { fetchFeatures(); }, [fetchFeatures]);

  async function updateFeature(id: string, updates: Record<string, unknown>) {
    setUpdatingId(id);
    await fetch(`/api/platform/feature-requests/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    await fetchFeatures();
    setUpdatingId(null);
  }

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center gap-3 mb-6">
        <Lightbulb size={24} className="text-amber-400" />
        <div>
          <h1 className="text-2xl font-bold text-white">Feature Requests</h1>
          <p className="text-sm text-zinc-500 mt-0.5">{total} request{total !== 1 ? 's' : ''}</p>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-6">
        <select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}
          className="px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-md text-sm text-zinc-200 focus:outline-none focus:border-teal-500">
          {PROJECTS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <div key={i} className="h-16 bg-zinc-800/50 rounded-lg animate-pulse" />)}
        </div>
      ) : features.length === 0 ? (
        <div className="p-12 text-center rounded-lg bg-zinc-900 border border-zinc-800">
          <Lightbulb size={32} className="mx-auto text-zinc-600 mb-3" />
          <p className="text-zinc-500">No feature requests yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {features.map((feat) => {
            const expanded = expandedId === feat.id;
            return (
              <div key={feat.id} className="rounded-lg border border-zinc-800 bg-zinc-900/50 overflow-hidden">
                <button
                  onClick={() => setExpandedId(expanded ? null : feat.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-zinc-800/30 transition-colors"
                >
                  {expanded ? <ChevronDown size={14} className="text-zinc-500" /> : <ChevronRight size={14} className="text-zinc-500" />}
                  <Link
                    href={`/admin/modules/feature-requests/${feat.id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="text-sm text-zinc-200 flex-1 truncate hover:text-violet-300 transition-colors cursor-pointer"
                  >
                    {feat.title}
                  </Link>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] ${STATUS_COLORS[feat.status] ?? 'bg-zinc-700 text-zinc-400'}`}>
                    {feat.status.replace('_', ' ')}
                  </span>
                  {feat.estimatedEffort && (
                    <span className={`text-[10px] font-medium ${EFFORT_COLORS[feat.estimatedEffort] ?? 'text-zinc-400'}`}>
                      {feat.estimatedEffort}
                    </span>
                  )}
                  <span className="flex items-center gap-0.5 text-[10px] text-zinc-500">
                    <ThumbsUp size={10} /> {feat.upvotes}
                  </span>
                  <span className="text-[10px] text-zinc-600">{feat.project}</span>
                  <span className="text-[10px] text-zinc-600">{new Date(feat.createdAt).toLocaleDateString()}</span>
                </button>

                {expanded && (
                  <div className="border-t border-zinc-800 p-4 space-y-3">
                    <div>
                      <span className="text-xs text-zinc-500">Requested by: </span>
                      <span className="text-sm text-zinc-300">{feat.requestedByName ?? feat.requestedByEmail ?? 'Unknown'}</span>
                    </div>
                    <div>
                      <span className="text-xs text-zinc-500 block mb-1">Description</span>
                      <p className="text-sm text-zinc-300 whitespace-pre-wrap">{feat.description}</p>
                    </div>
                    {feat.useCase && (
                      <div>
                        <span className="text-xs text-zinc-500 block mb-1">Use Case</span>
                        <p className="text-sm text-zinc-400 whitespace-pre-wrap">{feat.useCase}</p>
                      </div>
                    )}
                    {feat.buildPlan && (
                      <div>
                        <span className="text-xs text-zinc-500 block mb-1">Build Plan</span>
                        <pre className="text-xs text-zinc-400 bg-zinc-800 rounded p-3 overflow-auto max-h-60">
                          {JSON.stringify(feat.buildPlan, null, 2)}
                        </pre>
                      </div>
                    )}

                    <div className="flex items-center gap-2 pt-2 border-t border-zinc-800 flex-wrap">
                      <span className="text-xs text-zinc-500">Status:</span>
                      <select
                        value={feat.status}
                        onChange={(e) => updateFeature(feat.id, { status: e.target.value })}
                        disabled={updatingId === feat.id}
                        className="px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-300 focus:outline-none focus:border-teal-500"
                      >
                        {Object.keys(STATUS_COLORS).map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                      </select>

                      <span className="text-xs text-zinc-500 ml-3">Effort:</span>
                      <select
                        value={feat.estimatedEffort ?? ''}
                        onChange={(e) => updateFeature(feat.id, { estimatedEffort: e.target.value || null })}
                        disabled={updatingId === feat.id}
                        className="px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-300 focus:outline-none focus:border-teal-500"
                      >
                        <option value="">Unestimated</option>
                        <option value="small">Small</option>
                        <option value="medium">Medium</option>
                        <option value="large">Large</option>
                        <option value="epic">Epic</option>
                      </select>

                      <span className="text-xs text-zinc-500 ml-3">Target:</span>
                      <input
                        value={feat.targetVersion ?? ''}
                        onChange={(e) => updateFeature(feat.id, { targetVersion: e.target.value || null })}
                        placeholder="vX.Y.Z"
                        className="px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-300 w-20 focus:outline-none focus:border-teal-500"
                      />
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
