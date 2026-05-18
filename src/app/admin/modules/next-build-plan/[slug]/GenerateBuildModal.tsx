'use client';

/**
 * GenerateBuildModal — Phase 37-05 TRIG-02 + TRIG-03.
 *
 * Opened by the "Generate Build" button in NextBuildPlanClient. On mount,
 * POSTs to /api/admin/projects/{slug}/generate-build (37-03), then renders
 * the returned prompt in a readOnly textarea with mode-conditional action
 * buttons:
 *   - local_claude → Copy to clipboard + Open in Claude Code (deep-link)
 *   - manual       → Copy to clipboard only
 *   - managed_agent never reaches here (parent button is disabled)
 *
 * Deep-link: claude-code://open?prompt={enc}[&cwd={enc}]. The `cwd` param is
 * OMITTED when project.localPath is null (Claude Code falls back to last-used
 * directory). 2-second-after-Open we surface a fallback hint in case the URL
 * scheme is not registered on the user's machine — they can always copy.
 *
 * Locked strings (CONTEXT.md):
 *   - Fallback hint: "Did Claude Code open? If not, copy the prompt below."
 *   - Copy success toast: "Prompt copied"
 *   - Copy failure toast: "Couldn't copy — select the text manually below"
 *
 * W-4 pattern: buildDeepLink is exported as a pure helper so tests assert
 * URL shape directly without relying on JSDOM window.location proxying.
 */

import { useEffect, useRef, useState } from 'react';
import Toast from '@/components/Toast';
import type { BuildTriggerMode } from '@/lib/build-trigger-mode';
import { X, Copy, ExternalLink, Loader2 } from 'lucide-react';

export interface ProjectLite {
  id: string;
  key: string;
  name: string;
  buildTriggerMode: BuildTriggerMode;
  localPath: string | null;
}

interface Props {
  slug: string;
  project: ProjectLite;
  onClose: () => void;
}

// ── Pure helper: deep-link URL constructor ───────────────────────────────
// Extracted so tests can assert the URL contract directly (W-4 pattern).
export function buildDeepLink(prompt: string, localPath: string | null): string {
  const encoded = encodeURIComponent(prompt);
  let url = `claude-code://open?prompt=${encoded}`;
  if (localPath) {
    url += `&cwd=${encodeURIComponent(localPath)}`;
  }
  return url;
}

type Phase =
  | { kind: 'loading' }
  | { kind: 'ready'; prompt: string; itemCount: number }
  | { kind: 'error'; message: string };

export default function GenerateBuildModal({ slug, project, onClose }: Props) {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);
  const [showFallback, setShowFallback] = useState(false);
  const fallbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchedRef = useRef(false);

  // ── Fetch on mount, exactly once (StrictMode-safe via fetchedRef guard) ──
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    void runFetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Escape key closes ──
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // ── Clean up fallback timer on unmount ──
  useEffect(() => {
    return () => {
      if (fallbackTimer.current) clearTimeout(fallbackTimer.current);
    };
  }, []);

  async function runFetch() {
    setPhase({ kind: 'loading' });
    setShowFallback(false);
    let res: Response;
    try {
      res = await fetch(`/api/admin/projects/${slug}/generate-build`, { method: 'POST' });
    } catch (e) {
      setPhase({ kind: 'error', message: e instanceof Error ? e.message : 'network error' });
      return;
    }
    let body: { prompt?: string; mode?: string; item_count?: number; error?: string } = {};
    try {
      body = (await res.json()) as typeof body;
    } catch {
      /* response body wasn't JSON — fall through to res.ok check */
    }
    if (!res.ok) {
      setPhase({ kind: 'error', message: body.error ?? `HTTP ${res.status}` });
      return;
    }
    if (typeof body.prompt !== 'string') {
      setPhase({ kind: 'error', message: 'missing prompt in response' });
      return;
    }
    setPhase({ kind: 'ready', prompt: body.prompt, itemCount: body.item_count ?? 0 });
  }

  async function handleCopy() {
    if (phase.kind !== 'ready') return;
    try {
      await navigator.clipboard.writeText(phase.prompt);
      setToast({ kind: 'success', message: 'Prompt copied' });
    } catch {
      setToast({ kind: 'error', message: "Couldn't copy — select the text manually below" });
    }
  }

  function handleOpen() {
    if (phase.kind !== 'ready') return;
    // Side-effect: assign window.location.href to trigger the claude-code:// scheme.
    // URL construction is delegated to the pure buildDeepLink helper for testability.
    window.location.href = buildDeepLink(phase.prompt, project.localPath);
    if (fallbackTimer.current) clearTimeout(fallbackTimer.current);
    fallbackTimer.current = setTimeout(() => setShowFallback(true), 2000);
  }

  const showOpenButton = project.buildTriggerMode === 'local_claude';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="generate-build-title"
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/60"
      onClick={(e) => {
        // Backdrop click closes (but not clicks on the inner card).
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg w-full max-w-3xl mx-4 max-h-[85vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <h2 id="generate-build-title" className="text-sm font-semibold text-zinc-200">
            Generate Build for {project.name}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-zinc-500 hover:text-zinc-200"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-4">
          {phase.kind === 'loading' && (
            <div className="flex items-center gap-2 text-zinc-400 text-sm">
              <Loader2 size={14} className="animate-spin" />
              Generating build prompt...
            </div>
          )}

          {phase.kind === 'error' && (
            <div className="space-y-3">
              <div className="text-sm text-red-400">Error: {phase.message}</div>
              <button
                type="button"
                onClick={() => {
                  // Reset the fetched-once guard so Retry actually re-fires.
                  fetchedRef.current = false;
                  fetchedRef.current = true;
                  void runFetch();
                }}
                className="px-3 py-1 text-xs rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200"
              >
                Retry
              </button>
            </div>
          )}

          {phase.kind === 'ready' && (
            <div className="space-y-3">
              <div className="text-xs text-zinc-500">
                {phase.itemCount} item{phase.itemCount !== 1 ? 's' : ''} approved · mode:{' '}
                {project.buildTriggerMode}
              </div>
              <textarea
                readOnly
                value={phase.prompt}
                className="w-full h-80 px-3 py-2 text-xs font-mono bg-zinc-950 border border-zinc-800 rounded text-zinc-200"
              />
              {showFallback && (
                <div className="text-xs text-amber-400">
                  Did Claude Code open? If not, copy the prompt below.
                </div>
              )}
            </div>
          )}
        </div>

        {phase.kind === 'ready' && (
          <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-zinc-800">
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200"
            >
              <Copy size={12} />
              Copy to clipboard
            </button>
            {showOpenButton && (
              <button
                type="button"
                onClick={handleOpen}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded bg-violet-600 hover:bg-violet-500 text-white"
              >
                <ExternalLink size={12} />
                Open in Claude Code
              </button>
            )}
          </div>
        )}
      </div>

      {toast && <Toast kind={toast.kind} message={toast.message} onDismiss={() => setToast(null)} />}
    </div>
  );
}
