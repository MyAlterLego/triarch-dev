'use client';

/**
 * InclusionActions — Plan 36-05b Task 2 Client Component for feature-requests/[id]/page.
 *
 * Mirror of the bug-reports/[id] sibling. Same gating + label rules; the only
 * difference is the route path (/api/platform/feature-requests/...). Kept as a
 * sibling (not shared) to keep the per-page test surface colocated with each
 * detail page per the Phase 36 file-scope split — and because the plan
 * specifies a test file per page rather than a shared component test.
 *
 * B-3 enforcement: no Reject button rendered (ACTION_LABELS has no 'rejected'
 * entry; canManuallyTransition never targets 'rejected' from any non-rejected
 * state). v2.4 detail-page primary actions:
 *   Propose for next build / Approve for build / Defer / Remove from build / Reset to triaged
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  INCLUSION_STATES,
  canManuallyTransition,
  type InclusionState,
} from '@/lib/inclusion-state';

const ACTION_LABELS: Record<string, string> = {
  pending_inclusion: 'Propose for next build',
  approved_for_build: 'Approve for build',
  deferred: 'Defer',
  triaged: 'Reset to triaged',
};

function labelFor(from: string, target: string): string {
  if (from === 'approved_for_build' && target === 'pending_inclusion') return 'Remove from build';
  return ACTION_LABELS[target] ?? target.replace(/_/g, ' ');
}

function buttonClassFor(target: string): string {
  const base =
    'px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
  if (target === 'approved_for_build') {
    return `${base} bg-violet-500/20 text-violet-300 border border-violet-500/40 hover:bg-violet-500/30`;
  }
  if (target === 'deferred') {
    return `${base} bg-amber-500/20 text-amber-400 border border-amber-500/40 hover:bg-amber-500/30`;
  }
  if (target === 'pending_inclusion') {
    return `${base} bg-zinc-700 text-zinc-100 border border-zinc-600 hover:bg-zinc-600`;
  }
  return `${base} bg-zinc-800 text-zinc-300 border border-zinc-700 hover:bg-zinc-700`;
}

const ENTITY_PATH: Record<'bug' | 'feature', string> = {
  bug: 'bug-reports',
  feature: 'feature-requests',
};

export interface InclusionActionsProps {
  entityKind: 'bug' | 'feature';
  entityId: string;
  currentState: string;
}

export function InclusionActions({ entityKind, entityId, currentState }: InclusionActionsProps) {
  const router = useRouter();
  const [pendingTarget, setPendingTarget] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fromState = currentState as InclusionState;
  const validTargets = INCLUSION_STATES.filter((t) => canManuallyTransition(fromState, t));

  async function dispatch(target: string) {
    setPendingTarget(target);
    setError(null);
    try {
      const res = await fetch(`/api/platform/${ENTITY_PATH[entityKind]}/${entityId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inclusionState: target }),
      });
      if (!res.ok) {
        setError(`PATCH failed: ${res.status}`);
      } else {
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'PATCH failed');
    } finally {
      setPendingTarget(null);
    }
  }

  if (validTargets.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {validTargets.map((target) => (
        <button
          key={target}
          type="button"
          disabled={pendingTarget !== null}
          onClick={() => dispatch(target)}
          className={buttonClassFor(target)}
        >
          {pendingTarget === target ? 'Saving…' : labelFor(currentState, target)}
        </button>
      ))}
      {error && <span className="text-xs text-red-400 ml-2">{error}</span>}
    </div>
  );
}
