'use client';

import React, { useState } from 'react';
import Toast from '@/components/Toast';
import { BUILD_TRIGGER_MODES, type BuildTriggerMode } from '@/lib/build-trigger-mode';

interface ProjectLite {
  id: string;
  key: string;
  buildTriggerMode?: string;
  localPath?: string | null;
}

interface Props {
  project: ProjectLite;
  onSaved: () => void;
}

const MODE_LABELS: Record<BuildTriggerMode, { label: string; helper: string }> = {
  local_claude: {
    label: 'Local Claude Code (default)',
    helper: 'Generate Build shows Copy + Open in Claude Code',
  },
  managed_agent: {
    label: 'Managed Agent (v2.5)',
    helper: 'Disabled placeholder — Managed Agent variant ships in v2.5',
  },
  manual: {
    label: 'Manual (copy only)',
    helper: 'Generate Build shows Copy only — paste anywhere',
  },
};

export default function BuildTriggerSection({ project, onSaved }: Props) {
  const initialMode = (project.buildTriggerMode ?? 'local_claude') as BuildTriggerMode;
  const initialPath = project.localPath ?? '';
  const [mode, setMode] = useState<BuildTriggerMode>(initialMode);
  const [path, setPath] = useState<string>(initialPath);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);

  const dirty = mode !== initialMode || path !== initialPath;

  async function save() {
    if (!dirty || saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/platform/projects/${project.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buildTriggerMode: mode, localPath: path === '' ? null : path }),
      });
      if (!res.ok) {
        let err = `HTTP ${res.status}`;
        try {
          const body = await res.json();
          if (typeof body?.error === 'string') err = body.error;
        } catch {
          /* ignore parse error — keep HTTP status as message */
        }
        setToast({ kind: 'error', message: err });
        return;
      }
      setToast({ kind: 'success', message: 'Build trigger saved' });
      onSaved();
    } catch (e) {
      setToast({ kind: 'error', message: e instanceof Error ? e.message : 'network error' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <fieldset className="pt-2 border-t border-zinc-800">
      <legend className="text-xs text-zinc-500 px-1">Build Trigger</legend>
      <div className="mt-2 space-y-2">
        {BUILD_TRIGGER_MODES.map((m) => {
          const { label, helper } = MODE_LABELS[m];
          const inputId = `${project.id}-mode-${m}`;
          return (
            <label key={m} htmlFor={inputId} className="flex items-start gap-2 cursor-pointer">
              <input
                id={inputId}
                type="radio"
                name={`${project.id}-build-trigger-mode`}
                value={m}
                checked={mode === m}
                onChange={() => setMode(m)}
                className="mt-1"
              />
              <span className="text-xs">
                <span className="text-zinc-200 block">{label}</span>
                <span className="text-zinc-500 block">{helper}</span>
              </span>
            </label>
          );
        })}
      </div>
      <div className="mt-3">
        <label
          htmlFor={`${project.id}-local-path`}
          className="text-xs text-zinc-500 block mb-1"
        >
          Local Path
          <span className="text-zinc-600 ml-1">
            (used as cwd for &quot;Open in Claude Code&quot; deep-link)
          </span>
        </label>
        <input
          id={`${project.id}-local-path`}
          type="text"
          value={path}
          onChange={(e) => setPath(e.target.value)}
          placeholder="/Users/.../projects/this-project"
          className="w-full px-2 py-1 text-xs bg-zinc-900 border border-zinc-700 rounded-md text-zinc-200 focus:outline-none focus:border-teal-500"
        />
      </div>
      <div className="mt-3">
        <button
          type="button"
          onClick={save}
          disabled={!dirty || saving}
          className="px-3 py-1 text-xs rounded bg-teal-700 hover:bg-teal-600 text-white disabled:bg-zinc-700 disabled:text-zinc-500 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
      {toast && (
        <Toast kind={toast.kind} message={toast.message} onDismiss={() => setToast(null)} />
      )}
    </fieldset>
  );
}
