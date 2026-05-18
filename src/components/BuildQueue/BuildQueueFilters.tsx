'use client';

/**
 * BuildQueueFilters — top-bar filter chips + bulk action controls.
 *
 * Ported from security-admin@7b133f1. Platform-side differences:
 *   - Project list is sourced from the same `useProjectOptions` hook the
 *     feature-requests list page uses, so this component automatically
 *     stays in sync with the canonical project registry rather than the
 *     hand-coded list in the original. Falls back to a sensible default
 *     list while loading.
 *   - CSS tokens inlined (see KanbanCard for the same rationale).
 */
import React, { useState } from 'react';
import { useProjectOptions } from '@/lib/use-projects';

interface BuildQueueFiltersProps {
  selectedProject: string;
  onProjectChange: (project: string) => void;
  selectedVersion: string;
  onVersionChange: (version: string) => void;
  selectedItems: string[];
  onBulkStatusChange: (status: string) => void;
  onBulkVersionChange: (version: string) => void;
}

// Inlined colors — see KanbanCard for rationale.
const BG_ELEVATED = '#1a1a1e';
const BG_BASE = '#111114';
const BORDER = 'rgba(212, 160, 41, 0.2)';
const TEXT_PRIMARY = '#e8e6df';
const TEXT_SECONDARY = '#b8b4a6';
const ACCENT_TEAL = '#00e5b4';

const inp: React.CSSProperties = {
  padding: '7px 12px',
  background: BG_BASE,
  border: `1px solid ${BORDER}`,
  borderRadius: '6px',
  color: TEXT_PRIMARY,
  fontSize: '13px',
  outline: 'none',
};

const btn = (v: 'primary' | 'ghost' = 'primary'): React.CSSProperties => ({
  padding: '7px 14px',
  borderRadius: '6px',
  fontSize: '13px',
  fontWeight: 600,
  cursor: 'pointer',
  border: v === 'ghost' ? `1px solid ${BORDER}` : 'none',
  background: v === 'primary' ? ACCENT_TEAL : BG_ELEVATED,
  color: v === 'primary' ? '#000' : TEXT_SECONDARY,
});

export function BuildQueueFilters({
  selectedProject,
  onProjectChange,
  selectedVersion,
  onVersionChange,
  selectedItems,
  onBulkStatusChange,
  onBulkVersionChange,
}: BuildQueueFiltersProps) {
  const [bulkVersion, setBulkVersion] = useState('');
  const [bulkStatus, setBulkStatus] = useState('deferred');

  const projectOptions = useProjectOptions();

  return (
    <div
      style={{
        background: BG_ELEVATED,
        border: `1px solid ${BORDER}`,
        borderRadius: '8px',
        padding: '12px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
      }}
    >
      {/* Primary filter row */}
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
        <select
          value={selectedProject}
          onChange={(e) => onProjectChange(e.target.value)}
          style={{ ...inp, minWidth: '200px' }}
        >
          {/* useProjectOptions already prepends 'all' → 'All Projects' */}
          {projectOptions.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>

        <input
          type="text"
          placeholder="Filter by version..."
          value={selectedVersion}
          onChange={(e) => onVersionChange(e.target.value)}
          style={{ ...inp, minWidth: '160px' }}
        />

        {selectedItems.length > 0 && (
          <span style={{ fontSize: '13px', color: ACCENT_TEAL, marginLeft: 'auto' }}>
            {selectedItems.length} selected
          </span>
        )}
      </div>

      {/* Bulk actions bar — only shown when items are selected */}
      {selectedItems.length > 0 && (
        <div
          style={{
            display: 'flex',
            gap: '10px',
            alignItems: 'center',
            flexWrap: 'wrap',
            paddingTop: '8px',
            borderTop: `1px solid ${BORDER}`,
          }}
        >
          <input
            type="text"
            placeholder="Assign version..."
            value={bulkVersion}
            onChange={(e) => setBulkVersion(e.target.value)}
            style={{ ...inp, width: '140px' }}
          />
          <button
            onClick={() => {
              onBulkVersionChange(bulkVersion);
              setBulkVersion('');
            }}
            style={btn('primary')}
          >
            Apply Version
          </button>

          <div style={{ width: '1px', height: '24px', background: BORDER }} />

          <select value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)} style={inp}>
            <option value="deferred">Backlog</option>
            <option value="approved">Next Release</option>
            <option value="in_progress">In Progress</option>
            <option value="fixed">Done</option>
          </select>
          <button onClick={() => onBulkStatusChange(bulkStatus)} style={btn('ghost')}>
            Move To
          </button>
        </div>
      )}
    </div>
  );
}
