'use client';

import { useEffect, useState } from 'react';
import { X, Plus, Bot, Hand, ExternalLink } from 'lucide-react';
import { sanitizeForRender } from '@/lib/sanitize-commit';

export type ReleaseLogLink = {
  id: string;
  releaseId: string;
  linkType: 'bug' | 'feature' | 'external';
  bugId: string | null;
  featureId: string | null;
  externalUrl: string | null;
  source: 'commit' | 'manual';
  createdAt: string;
  bugTitle?: string;
  featureTitle?: string;
};

interface LinksClientProps {
  releaseId: string;
  initialLinks: ReleaseLogLink[];
  project: string; // projects.key — for filtering bug/feature picker to current project
}

function chipText(link: ReleaseLogLink): string {
  const raw = link.bugTitle ?? link.featureTitle ?? link.externalUrl ?? link.bugId ?? link.featureId ?? 'link';
  const sanitized = sanitizeForRender(raw);
  return sanitized.length > 32 ? sanitized.slice(0, 29) + '...' : sanitized;
}

/**
 * Auto chip (source='commit'): blue gradient outline — DESIGN-REFERENCE.md v2.1 additions
 * Manual chip (source='manual'): teal gradient outline — DESIGN-REFERENCE.md v2.1 additions
 * Baseline: zinc-800 border on dark zinc-900 background
 */
function chipClasses(source: 'commit' | 'manual'): string {
  if (source === 'commit') {
    return [
      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs',
      'bg-zinc-900 text-blue-300',
      'border border-transparent',
      '[background-clip:padding-box]',
      'outline outline-1 outline-blue-500/60',
      // gradient outline via box-shadow simulation
      'shadow-[0_0_0_1px_theme(colors.blue.600/0.4),0_0_0_2px_theme(colors.cyan.500/0.2)]',
    ].join(' ');
  }
  // manual — teal gradient outline
  return [
    'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs',
    'bg-zinc-900 text-teal-300',
    'border border-transparent',
    '[background-clip:padding-box]',
    'outline outline-1 outline-teal-500/60',
    'shadow-[0_0_0_1px_theme(colors.teal.600/0.4),0_0_0_2px_theme(colors.emerald.500/0.2)]',
  ].join(' ');
}

const LINK_TYPES = ['bug', 'feature', 'external'] as const;
type LinkType = (typeof LINK_TYPES)[number];

export default function LinksClient({ releaseId, initialLinks, project: _project }: LinksClientProps) {
  const [links, setLinks] = useState<ReleaseLogLink[]>(initialLinks);
  const [showPicker, setShowPicker] = useState(false);

  // Mount-time fetch: hydrate chip list from the staff-only GET endpoint.
  // Skip if parent already provided links — server-provided wins (forward-compat
  // for any future page.tsx pre-fetch).
  useEffect(() => {
    if (initialLinks.length > 0) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/admin/release-logs/${releaseId}/links`);
        if (!res.ok) {
          console.error('[LinksClient] GET failed', res.status);
          return;
        }
        const data = (await res.json()) as { links: ReleaseLogLink[] };
        if (!cancelled && Array.isArray(data.links)) {
          setLinks(data.links);
        }
      } catch (err) {
        console.error('[LinksClient] GET error', err);
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [releaseId, initialLinks.length]);
  const [pickerType, setPickerType] = useState<LinkType>('bug');
  const [pickerValue, setPickerValue] = useState('');
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleRemove(link: ReleaseLogLink) {
    if (link.source === 'commit') {
      const confirmed = window.confirm(
        'Remove auto-detected link? This link was extracted from a commit message.',
      );
      if (!confirmed) return;
    }

    // Optimistic remove
    setLinks((prev) => prev.filter((l) => l.id !== link.id));

    const res = await fetch(
      `/api/admin/release-logs/${releaseId}/links/${link.id}`,
      { method: 'DELETE' },
    );

    if (!res.ok && res.status !== 204) {
      // Rollback: re-add the chip
      setLinks((prev) => [...prev, link]);
      console.error('[LinksClient] DELETE failed', res.status);
    }
  }

  async function handleSubmit() {
    const trimmed = pickerValue.trim();
    if (!trimmed) {
      setPickerError('Please enter a value.');
      return;
    }

    setPickerError(null);
    setSubmitting(true);

    const body =
      pickerType === 'bug'
        ? { linkType: 'bug', bugId: trimmed }
        : pickerType === 'feature'
        ? { linkType: 'feature', featureId: trimmed }
        : { linkType: 'external', externalUrl: trimmed };

    // Optimistic add
    const tempId = `pending-${Date.now()}`;
    const tempChip: ReleaseLogLink = {
      id: tempId,
      releaseId,
      linkType: pickerType,
      bugId: pickerType === 'bug' ? trimmed : null,
      featureId: pickerType === 'feature' ? trimmed : null,
      externalUrl: pickerType === 'external' ? trimmed : null,
      source: 'manual',
      createdAt: new Date().toISOString(),
    };
    setLinks((prev) => [...prev, tempChip]);
    setPickerValue('');
    setShowPicker(false);

    const res = await fetch(`/api/admin/release-logs/${releaseId}/links`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    setSubmitting(false);

    if (res.status === 201) {
      const { link } = await res.json() as { link: ReleaseLogLink };
      // Replace temp chip with server-returned link (includes title, real id)
      setLinks((prev) => prev.map((l) => (l.id === tempId ? link : l)));
    } else {
      // Rollback: remove temp chip, show error
      setLinks((prev) => prev.filter((l) => l.id !== tempId));
      let msg = `Error ${res.status}`;
      try {
        const err = await res.json() as { error?: string };
        if (err.error) msg = err.error;
      } catch { /* ignore */ }
      setPickerError(msg);
      setShowPicker(true);
      console.error('[LinksClient] POST failed', res.status, msg);
    }
  }

  const placeholderByType: Record<LinkType, string> = {
    bug: 'Bug UUID (e.g. 550e8400-e29b-41d4-a716-446655440000)',
    feature: 'Feature UUID (e.g. 550e8400-e29b-41d4-a716-446655440001)',
    external: 'URL (e.g. https://github.com/org/repo/issues/42)',
  };

  return (
    <div className="mt-3 pt-3 border-t border-zinc-800">
      <div className="flex items-center gap-1 mb-2">
        <span className="text-[10px] font-semibold tracking-wider uppercase text-zinc-500">Links</span>
        <span className="text-[10px] text-zinc-600 ml-1">({links.length})</span>
      </div>

      {/* Chip list */}
      <div className="flex flex-wrap gap-1.5 mb-2">
        {links.map((link) => (
          <span
            key={link.id}
            className={chipClasses(link.source)}
            title={link.source === 'commit' ? 'Auto-detected from commit' : 'Manually added'}
          >
            {link.source === 'commit' ? (
              <Bot size={10} className="text-blue-400 flex-shrink-0" />
            ) : (
              <Hand size={10} className="text-teal-400 flex-shrink-0" />
            )}
            {link.linkType === 'external' && (
              <ExternalLink size={10} className="flex-shrink-0 opacity-60" />
            )}
            <span>{chipText(link)}</span>
            {/* Pending chips (optimistic) show a subtle spinner rather than remove button */}
            {link.id.startsWith('pending-') ? (
              <span className="animate-pulse text-zinc-500 ml-0.5">…</span>
            ) : (
              <button
                onClick={() => handleRemove(link)}
                className="ml-0.5 text-zinc-500 hover:text-red-400 transition-colors"
                title="Remove link"
                aria-label={`Remove link ${chipText(link)}`}
              >
                <X size={10} />
              </button>
            )}
          </span>
        ))}

        {links.length === 0 && (
          <span className="text-[11px] text-zinc-600 italic">No links yet</span>
        )}
      </div>

      {/* Add link toggle */}
      {!showPicker && (
        <button
          onClick={() => setShowPicker(true)}
          className="flex items-center gap-1 text-[11px] text-zinc-500 hover:text-teal-400 transition-colors"
        >
          <Plus size={11} />
          Add link
        </button>
      )}

      {/* Picker */}
      {showPicker && (
        <div className="mt-2 p-3 rounded-md bg-zinc-800/60 border border-zinc-700">
          {/* Link type selector */}
          <div className="flex items-center gap-3 mb-2">
            {LINK_TYPES.map((lt) => (
              <label key={lt} className="flex items-center gap-1 cursor-pointer">
                <input
                  type="radio"
                  name={`link-type-${releaseId}`}
                  value={lt}
                  checked={pickerType === lt}
                  onChange={() => { setPickerType(lt); setPickerValue(''); setPickerError(null); }}
                  className="accent-teal-500"
                />
                <span className="text-xs text-zinc-300 capitalize">{lt}</span>
              </label>
            ))}
          </div>

          {/* Value input */}
          <div className="flex items-center gap-2">
            <input
              type={pickerType === 'external' ? 'url' : 'text'}
              value={pickerValue}
              onChange={(e) => setPickerValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); if (e.key === 'Escape') setShowPicker(false); }}
              placeholder={placeholderByType[pickerType]}
              className="flex-1 px-2 py-1.5 text-xs bg-zinc-900 border border-zinc-700 rounded text-zinc-200 focus:outline-none focus:border-teal-500"
            />
            <button
              onClick={handleSubmit}
              disabled={submitting || !pickerValue.trim()}
              className="px-3 py-1.5 text-xs bg-teal-600 text-white rounded hover:bg-teal-500 disabled:opacity-50 transition-colors"
            >
              {submitting ? '…' : 'Add'}
            </button>
            <button
              onClick={() => { setShowPicker(false); setPickerError(null); setPickerValue(''); }}
              className="px-2 py-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              Cancel
            </button>
          </div>

          {pickerError && (
            <p className="mt-1.5 text-[11px] text-red-400">{pickerError}</p>
          )}

          <p className="mt-1.5 text-[10px] text-zinc-600">
            {pickerType === 'bug' || pickerType === 'feature'
              ? 'Paste the UUID from the bug or feature tracker URL.'
              : 'Enter the full URL (GitHub issue, Jira ticket, etc.).'}
          </p>
        </div>
      )}
    </div>
  );
}
