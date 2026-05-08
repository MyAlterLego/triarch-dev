'use client';

import { useState } from 'react';
import Toast from '@/components/Toast';

// Phase machine for the promote flow
type Phase =
  | { kind: 'idle' }
  | { kind: 'confirming' }
  | { kind: 'dispatching' }
  | { kind: 'dispatched' }                               // terminal: dispatch succeeded
  | { kind: 'failed'; error: string; runUrl?: string };  // terminal: dispatch failed

export default function PromoteButton({
  releaseId,
  branch,
  version,
}: {
  releaseId: string;
  branch: string;
  version: string;
}) {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [toast, setToast] = useState<{
    kind: 'success' | 'error';
    message: string;
  } | null>(null);

  function reset() {
    setPhase({ kind: 'idle' });
  }

  async function confirmPromote() {
    setPhase({ kind: 'dispatching' });

    let res: Response;
    try {
      res = await fetch(`/api/admin/releases/${releaseId}/promote`, {
        method: 'POST',
      });
    } catch {
      setToast({ kind: 'error', message: 'Network error — try again' });
      setPhase({ kind: 'idle' });
      return;
    }

    let body: { ok?: boolean; error?: string; run_url?: string; dispatched_by?: string | null; dispatched_at?: string | null } = {};
    try {
      body = await res.json();
    } catch {
      body = {};
    }

    // 409: race-lost — someone else already promoted
    if (res.status === 409) {
      const who = body.dispatched_by ?? 'someone';
      setToast({ kind: 'error', message: `Already promoted by ${who}` });
      setPhase({ kind: 'dispatched' }); // terminal — show Dispatched pill
      return;
    }

    // 4xx / 5xx (other than 409): surface error toast, revert for retry
    if (!res.ok) {
      setToast({ kind: 'error', message: body.error ?? `HTTP ${res.status}` });
      setPhase({ kind: 'idle' });
      return;
    }

    // 200 with ok:false — dispatch was rejected by GitHub (captured in body)
    if (body.ok === false) {
      setPhase({
        kind: 'failed',
        error: body.error ?? 'unknown error',
        runUrl: body.run_url,
      });
      return;
    }

    // 200 { ok: true } — dispatch succeeded
    setPhase({ kind: 'dispatched' });
  }

  return (
    <>
      {/* Toast (fixed-position overlay — rendered outside the table cell flow) */}
      {toast && (
        <Toast
          kind={toast.kind}
          message={toast.message}
          onDismiss={() => setToast(null)}
        />
      )}

      {/* ── idle: flat teal Promote button (default affordance) ─────────── */}
      {phase.kind === 'idle' && (
        <button
          onClick={() => setPhase({ kind: 'confirming' })}
          className="px-3 py-1 text-xs rounded bg-emerald-700 hover:bg-emerald-600 text-white transition-colors"
        >
          Promote
        </button>
      )}

      {/* ── confirming: two-step inline confirm (no modal overlay) ────────── */}
      {phase.kind === 'confirming' && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-zinc-200 whitespace-nowrap">
            Promote {branch} {version} to production
          </span>
          <button
            onClick={confirmPromote}
            className="px-2 py-0.5 rounded bg-emerald-700 hover:bg-emerald-600 text-white transition-colors"
          >
            Confirm
          </button>
          <button
            onClick={reset}
            className="px-2 py-0.5 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-200 transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      {/* ── dispatching: violet in-flight spinner with halo (DESIGN-REFERENCE.md) ── */}
      {phase.kind === 'dispatching' && (
        <span
          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs text-violet-400 bg-violet-500/10 border border-violet-500/30"
          aria-label="Dispatching"
        >
          {/* SVG spinner */}
          <svg
            className="animate-spin h-3 w-3 text-violet-400"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          Dispatching...
        </span>
      )}

      {/* ── dispatched: terminal success pill (teal — semantic success token) ── */}
      {phase.kind === 'dispatched' && (
        <span className="px-2 py-0.5 rounded text-xs bg-teal-900/40 text-teal-300">
          Dispatched
        </span>
      )}

      {/* ── failed: terminal failure pill + optional GHA run link ───────── */}
      {phase.kind === 'failed' && (
        <span className="inline-flex items-center gap-1.5">
          <span className="px-2 py-0.5 rounded text-xs bg-red-900/40 text-red-300">
            Failed
          </span>
          {phase.runUrl && (
            <a
              href={phase.runUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-zinc-400 hover:text-zinc-200 underline transition-colors"
            >
              Actions run &rarr;
            </a>
          )}
        </span>
      )}
    </>
  );
}
