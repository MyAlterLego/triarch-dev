'use client';

/**
 * GenerateBuildPlanButton — invokes the /generate-plan route for either
 * entity type and refreshes the page on success.
 *
 * Used by:
 *   /admin/modules/feature-requests/[id]/page.tsx
 *   /admin/modules/bug-reports/[id]/page.tsx
 *
 * Both detail pages are Server Components; this is the small Client
 * Component island that owns the click + fetch + error-toast UX.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  entityKind: 'bug' | 'feature';
  entityId: string;
  /** Render label override — defaults to "Generate Build Plan". */
  label?: string;
}

export function GenerateBuildPlanButton({ entityKind, entityId, label }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleClick() {
    setBusy(true);
    setErr(null);
    try {
      const path =
        entityKind === 'bug'
          ? `/api/platform/bug-reports/${entityId}/generate-plan`
          : `/api/platform/feature-requests/${entityId}/generate-plan`;
      const res = await fetch(path, { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Generate plan failed (${res.status})`);
      }
      // Force the Server Component to re-render with the new buildPlan jsonb.
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to generate plan');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        className={
          'px-4 py-2 rounded-md text-sm font-medium transition-colors ' +
          'bg-violet-500/20 text-violet-300 hover:bg-violet-500/30 ' +
          'disabled:opacity-50 disabled:cursor-not-allowed border border-violet-500/30'
        }
      >
        {busy ? 'Generating…' : (label ?? 'Generate Build Plan')}
      </button>
      {err && <p className="text-xs text-red-400">{err}</p>}
    </div>
  );
}
