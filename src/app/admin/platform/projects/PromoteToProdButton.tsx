'use client';

import React, { useState } from 'react';
import { Rocket, Loader2 } from 'lucide-react';
import Toast from '@/components/Toast';

interface Props {
  projectId: string;
  projectKey: string;
  githubRepo: string | null;
}

type Result =
  | { merged: true; prNumber: number; sha: string; htmlUrl: string; wasCreated: boolean }
  | { merged: false; reason: string; statusCode?: number; message?: string; prUrl?: string | null; prNumber?: number | null };

/**
 * Per-project button that opens (or reuses) the dev→main PR and merges it
 * as a merge commit. Same flow as `/triarch promote <project>` in Slack —
 * just surfaced where staff already is.
 *
 * Confirms before acting because this triggers a prod deploy on merge.
 */
export default function PromoteToProdButton({ projectId, projectKey, githubRepo }: Props) {
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ kind: 'success' | 'error' | 'info'; message: string; href?: string } | null>(null);

  const disabled = busy || !githubRepo || !githubRepo.includes('/');

  async function run() {
    if (disabled) return;
    const ok = window.confirm(
      `Promote ${projectKey} dev → main now?\n\n` +
        `This will open (or reuse) a dev→main PR on ${githubRepo} and merge it as a merge commit. ` +
        `That triggers a prod deploy. Continue?`,
    );
    if (!ok) return;

    setBusy(true);
    try {
      const res = await fetch(`/api/platform/projects/${projectId}/promote`, { method: 'POST' });
      const data: Result = await res.json();

      if (data.merged) {
        setToast({
          kind: 'success',
          message: `${data.wasCreated ? 'Opened + merged' : 'Merged'} PR #${data.prNumber} (sha ${data.sha.slice(0, 7)}).`,
          href: data.htmlUrl,
        });
      } else if (data.reason === 'no_commits_ahead') {
        setToast({ kind: 'info', message: 'Nothing to promote — dev has no commits ahead of main.' });
      } else if (data.reason === 'merge_failed') {
        setToast({
          kind: 'error',
          message: `Merge failed (HTTP ${data.statusCode}): ${data.message ?? 'see server logs'}`,
        });
      } else {
        setToast({ kind: 'error', message: `Promote failed: ${data.reason}` });
      }
    } catch (err) {
      setToast({ kind: 'error', message: `Network error: ${(err as Error).message}` });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={run}
        disabled={disabled}
        title={!githubRepo ? 'project has no github_repo configured' : `Promote ${projectKey} dev → main`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 12px',
          borderRadius: 6,
          border: '1px solid rgba(0,229,180,0.4)',
          background: disabled ? 'rgba(0,229,180,0.05)' : 'rgba(0,229,180,0.12)',
          color: disabled ? 'rgba(0,229,180,0.5)' : '#00e5b4',
          fontSize: 13,
          fontWeight: 500,
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Rocket size={14} />}
        {busy ? 'Promoting...' : 'Promote to Prod'}
      </button>
      {toast && (
        <Toast
          kind={toast.kind === 'info' ? 'success' : toast.kind}
          message={toast.href ? `${toast.message} View PR.` : toast.message}
          onDismiss={() => setToast(null)}
        />
      )}
    </>
  );
}
