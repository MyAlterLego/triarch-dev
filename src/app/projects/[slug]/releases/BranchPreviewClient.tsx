'use client';

import React, { useState } from 'react';
import useSWR from 'swr';
import { GitBranch, Loader2, AlertCircle, CheckCircle2, ExternalLink } from 'lucide-react';
import Toast, { type ToastKind } from '@/components/Toast';
import { formatRelativeTime } from './format';
import type { UserRole } from './types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type StatusResponse = {
  branch: string | null;
  state:
    | 'idle'
    | 'PENDING'
    | 'BUILDING'
    | 'DEPLOYING'
    | 'SUCCEEDED'
    | 'FAILED'
    | 'CANCELLED'
    | 'timeout';
  locked_at: string | null;
  locked_by: string | null;
  started_at: string | null;
  terminal: boolean;
  errorMessage?: string;
  rolloutResourcePath?: string;
};

// Back-compat shim props (used by default export only)
type ShimProps = {
  projectSlug: string;
  userRole: UserRole;
  branches: string[];
  fahProjectId: string | null;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const IN_FLIGHT_STATES = new Set(['PENDING', 'BUILDING', 'DEPLOYING']);

// ---------------------------------------------------------------------------
// SWR fetcher
// ---------------------------------------------------------------------------

const fetcher = async (url: string): Promise<StatusResponse> => {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`status fetch failed: ${res.status}`);
  return res.json();
};

// ---------------------------------------------------------------------------
// Shared SWR hook (private to this module)
// Both BranchPreviewBanner and BranchPreviewButton use the same cache key
// so SWR deduplicates to a single poll across all mounts.
// ---------------------------------------------------------------------------

function usePreviewStatus(projectSlug: string) {
  return useSWR<StatusResponse>(
    `/api/projects/${projectSlug}/branch/preview/status`,
    fetcher,
    {
      refreshInterval: (latest) => (latest?.terminal ? 0 : 5000),
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      dedupingInterval: 2000,
    },
  );
}

// ---------------------------------------------------------------------------
// Export 1: BranchPreviewBanner
// Mounted ONCE at the top of ReleasesClient — informational, shown to both
// admin and viewer. No role gating.
// ---------------------------------------------------------------------------

export type BranchPreviewBannerProps = {
  projectSlug: string;
  fahProjectId: string | null;
};

export function BranchPreviewBanner({ projectSlug, fahProjectId }: BranchPreviewBannerProps) {
  const { data } = usePreviewStatus(projectSlug);
  const inFlight = data ? IN_FLIGHT_STATES.has(data.state) : false;

  // Renders nothing when idle (avoids empty card)
  if (!data || data.state === 'idle') return null;

  function renderBanner() {
    if (!data || !inFlight) return null;

    const lockedTime = data.locked_at ? formatRelativeTime(data.locked_at) : 'just now';

    return (
      <div
        role="status"
        aria-live="polite"
        className="flex items-center gap-3 px-4 py-3 rounded-md bg-violet-500/10 border border-violet-500/30 text-violet-300 text-sm mb-3"
      >
        <Loader2 size={14} className="animate-spin text-violet-400 flex-shrink-0" />
        <span>
          <span className="font-mono font-semibold">{data.branch}</span>
          {' currently previewing'}
          {data.locked_by && (
            <>
              {' — set '}
              {lockedTime}
              {' by '}
              <span className="font-mono">{data.locked_by}</span>
            </>
          )}
        </span>
      </div>
    );
  }

  function renderSucceededPill() {
    if (!data || data.state !== 'SUCCEEDED') return null;

    return (
      <div className="flex items-center gap-2 px-4 py-3 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm mb-3">
        <CheckCircle2 size={14} className="flex-shrink-0" />
        <span>
          {'Preview ready — branch '}
          <span className="font-mono font-semibold">{data.branch}</span>
          {' deployed'}
        </span>
      </div>
    );
  }

  function renderFailedPill() {
    if (!data || data.state !== 'FAILED') return null;

    return (
      <div className="flex items-center gap-2 px-4 py-3 rounded-md bg-red-500/10 border border-red-500/30 text-red-300 text-sm mb-3">
        <AlertCircle size={14} className="flex-shrink-0" />
        <span className="flex-1">
          {'Preview failed'}
          {data.errorMessage ? ` — ${data.errorMessage}` : ''}
        </span>
        {fahProjectId && (
          <a
            href={`https://console.firebase.google.com/project/${fahProjectId}/apphosting`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-red-400 hover:text-red-200 ml-2 flex-shrink-0"
          >
            View in Firebase console
            <ExternalLink size={11} />
          </a>
        )}
      </div>
    );
  }

  function renderTimeoutPill() {
    if (!data || data.state !== 'timeout') return null;

    return (
      <div className="flex items-center gap-2 px-4 py-3 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-300 text-sm mb-3">
        <AlertCircle size={14} className="flex-shrink-0" />
        <span>Preview did not complete in 8 minutes — preview slot was reset</span>
      </div>
    );
  }

  // Wrap in card container only when there is content to show
  const content = renderBanner() ?? renderSucceededPill() ?? renderFailedPill() ?? renderTimeoutPill();
  if (!content) return null;

  return (
    <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-4 mb-4">
      {/* Section header */}
      <div className="flex items-center gap-2 mb-3">
        <GitBranch size={14} className="text-violet-400" />
        <span className="text-xs font-semibold tracking-wider text-zinc-500 uppercase">
          Branch Preview
        </span>
      </div>
      {renderBanner()}
      {renderSucceededPill()}
      {renderFailedPill()}
      {renderTimeoutPill()}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Export 2: BranchPreviewButton
// Mounted per-BranchSection header. Admin only. Shares SWR cache key with
// BranchPreviewBanner so only ONE poll runs (SWR deduplication).
// ---------------------------------------------------------------------------

export type BranchPreviewButtonProps = {
  projectSlug: string;
  branch: string;
  userRole: UserRole;
};

export function BranchPreviewButton({ projectSlug, branch, userRole }: BranchPreviewButtonProps) {
  // Viewer sees no button
  if (userRole !== 'admin') return null;

  const { data, mutate } = usePreviewStatus(projectSlug);
  const [dispatching, setDispatching] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: ToastKind; message: string; key: number } | null>(
    null,
  );

  const inFlight = data ? IN_FLIGHT_STATES.has(data.state) : false;
  const isDisabled = inFlight || dispatching === branch;

  async function handlePreview() {
    setDispatching(branch);
    try {
      const res = await fetch(`/api/projects/${projectSlug}/branch/preview`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch }),
      });
      const payload = await res.json().catch(() => ({}));

      if (res.status === 202) {
        mutate();
      } else if (res.status === 400) {
        setToast({ kind: 'error', message: 'Branch name not allowed', key: Date.now() });
      } else if (res.status === 409) {
        setToast({
          kind: 'error',
          message: 'Another preview is already in flight',
          key: Date.now(),
        });
        mutate();
      } else if (res.status === 502) {
        const detail = (payload as { detail?: string }).detail;
        setToast({
          kind: 'error',
          message: `Preview dispatch failed${detail ? `: ${detail}` : ''}`,
          key: Date.now(),
        });
      } else {
        setToast({ kind: 'error', message: 'Could not start preview swap', key: Date.now() });
      }
    } catch {
      setToast({ kind: 'error', message: 'Network error during preview swap', key: Date.now() });
    } finally {
      setDispatching(null);
    }
  }

  const isSpinning = dispatching === branch;

  return (
    <>
      {toast && (
        <Toast
          key={toast.key}
          kind={toast.kind}
          message={toast.message}
          onDismiss={() => setToast(null)}
        />
      )}
      <button
        type="button"
        onClick={handlePreview}
        disabled={isDisabled}
        title={inFlight ? 'A preview swap is in flight; please wait' : undefined}
        aria-label="Preview this branch"
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-violet-500/30 text-violet-300 hover:bg-violet-500/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isSpinning ? (
          <Loader2 size={11} className="animate-spin" />
        ) : (
          <GitBranch size={11} />
        )}
        <span className="font-mono">{branch}</span>
      </button>
    </>
  );
}

// ---------------------------------------------------------------------------
// Default export: BranchPreviewClient — backward-compatibility SHIM
// Not used by ReleasesClient after Plan 14-03, but preserved so any import
// of the default export continues to work without modification.
// ---------------------------------------------------------------------------

export default function BranchPreviewClient({
  projectSlug,
  userRole,
  branches,
  fahProjectId,
}: ShimProps) {
  return (
    <div>
      <BranchPreviewBanner projectSlug={projectSlug} fahProjectId={fahProjectId} />
      {userRole === 'admin' && branches.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {branches.map((branch) => (
            <BranchPreviewButton
              key={branch}
              projectSlug={projectSlug}
              branch={branch}
              userRole={userRole}
            />
          ))}
        </div>
      )}
    </div>
  );
}
