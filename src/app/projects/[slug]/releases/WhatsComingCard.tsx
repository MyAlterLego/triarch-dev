'use client';

import { useState } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import type { WhatsComingSummary } from './types';

// Shape of a "what changed" entry - minimal for now, Plan 02 decision:
// expanded view shows placeholder; full entry table deferred to a follow-up plan
interface WhatChangedEntry {
  id: string;
  type: 'fix' | 'feature' | 'other';
  title: string;
  branch?: string | null;
  author?: string | null;
  date?: string | null;
}

interface Props {
  whatsComing: WhatsComingSummary | null;
  entries?: WhatChangedEntry[];
}

/**
 * Split oneliner into gradient prefix and plain suffix.
 * Input: "4 entries since prod: 2 fixes, 1 feature, 1 other"
 * Output: prefix="4 entries", suffix=" since prod: 2 fixes, 1 feature, 1 other"
 */
function splitOneliner(oneliner: string): { prefix: string; suffix: string } {
  // Match "N entry" or "N entries" at the start
  const match = oneliner.match(/^(\d+ entr(?:y|ies))(.*)/);
  if (match) {
    return { prefix: match[1], suffix: match[2] };
  }
  return { prefix: oneliner, suffix: '' };
}

function TypePill({ type }: { type: 'fix' | 'feature' | 'other' }) {
  const classes: Record<string, string> = {
    fix: 'bg-gradient-to-r from-red-500/20 to-rose-500/20 text-rose-400 border border-rose-500/30',
    feature: 'bg-gradient-to-r from-teal-500/20 to-emerald-500/20 text-teal-400 border border-teal-500/30',
    other: 'bg-zinc-700/50 text-zinc-400 border border-zinc-600',
  };
  const labels: Record<string, string> = {
    fix: 'Fix',
    feature: 'Feature',
    other: 'Other',
  };
  return (
    <span className={`px-1.5 py-0.5 text-[10px] rounded font-medium ${classes[type]}`}>
      {labels[type]}
    </span>
  );
}

export default function WhatsComingCard({ whatsComing, entries = [] }: Props) {
  const [expanded, setExpanded] = useState(false);

  // Hidden when no data or no delta
  if (!whatsComing || !whatsComing.hasDelta) {
    return null;
  }

  const oneliner = whatsComing.oneliner ?? '';
  const { prefix, suffix } = splitOneliner(oneliner);

  return (
    <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-4 mb-4">
      {/* Section label */}
      <span className="text-xs font-semibold tracking-wider text-zinc-500 uppercase block mb-2">
        WHAT'S COMING TO PROD
      </span>

      {/* Toggle button (full-width header row) */}
      <button
        type="button"
        aria-expanded={expanded}
        className="w-full flex items-center justify-between text-left gap-2"
        onClick={() => setExpanded((prev) => !prev)}
      >
        <span className="flex-1 text-sm">
          {/* Gradient headline count */}
          <span className="bg-gradient-to-r from-violet-400 to-blue-400 bg-clip-text text-transparent font-mono font-bold">
            {prefix}
          </span>
          <span className="text-zinc-400">{suffix}</span>
        </span>
        {/* Chevron icon */}
        <span className="text-zinc-500 flex-shrink-0">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
      </button>

      {/* Expanded panel */}
      {expanded && (
        <div className="mt-3 pt-3 border-t border-zinc-800">
          {entries.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-zinc-400">
                <thead>
                  <tr className="text-zinc-500 uppercase tracking-wider">
                    <th className="text-left pb-2 pr-3 font-semibold">Type</th>
                    <th className="text-left pb-2 pr-3 font-semibold">Title</th>
                    <th className="text-left pb-2 pr-3 font-semibold">Branch</th>
                    <th className="text-left pb-2 pr-3 font-semibold">Author</th>
                    <th className="text-left pb-2 font-semibold">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <tr key={entry.id} className="border-t border-zinc-800/50">
                      <td className="py-1.5 pr-3">
                        <TypePill type={entry.type} />
                      </td>
                      <td className="py-1.5 pr-3 text-zinc-300">{entry.title}</td>
                      <td className="py-1.5 pr-3 font-mono text-zinc-500">
                        {entry.branch ?? '—'}
                      </td>
                      <td className="py-1.5 pr-3 font-mono text-zinc-500">
                        {entry.author ?? '—'}
                      </td>
                      <td className="py-1.5 font-mono text-zinc-500">
                        {entry.date ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-zinc-500">
              Detailed entry list available in admin pipeline page
            </p>
          )}
        </div>
      )}
    </div>
  );
}
