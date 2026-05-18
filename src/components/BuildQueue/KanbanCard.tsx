'use client';

/**
 * KanbanCard — Build Queue board card.
 *
 * Ported from security-admin@7b133f1 (`src/components/BuildQueue/KanbanCard.tsx`).
 * Platform-side differences from the original:
 *   - StatusBadge import from `@triarchsecurity/shared-ui` (platform-scoped)
 *     instead of `@triarch/shared-ui` (legacy security-admin scope).
 *   - CSS tokens that don't exist in platform's globals.css
 *     (e.g. --accent-teal, --warning, --success, --danger, --bg-base,
 *     --border, --font-body, --text-primary, --text-secondary) are inlined
 *     with literal hex / rgba so the port works standalone. Globals.css
 *     can be extended later if Mike wants a tokenized theme — for now
 *     keep the blast radius small.
 *   - Removed legacy 'admin' project from PROJECT_COLORS map; added
 *     entries for current platform projects.
 */
import React from 'react';
import { useDraggable } from '@dnd-kit/core';
import { StatusBadge } from '@triarchsecurity/shared-ui';

export interface BuildQueueItem {
  type: 'bug' | 'feature';
  id: string;
  project: string;
  title: string;
  status: string;
  // Bug-specific
  severity?: 'critical' | 'high' | 'medium' | 'low' | string | null;
  priority?: 'fix_now' | 'fix_later' | string | null;
  // Feature-specific
  importance?: 'urgent' | 'nice_to_have' | 'just_an_idea' | string | null;
  estimatedEffort?: string | null;
  // Shared
  reportedByName?: string | null;
  requestedByName?: string | null;
  targetVersion?: string | null;
  createdAt: string;
  upvotes?: number | null;
}

interface KanbanCardProps {
  item: BuildQueueItem;
  selected: boolean;
  onSelect: (id: string, checked: boolean) => void;
  onVersionChange: (id: string, version: string) => void;
  onApprove?: (item: BuildQueueItem) => void;
}

// ── Constants ──────────────────────────────────────────────────────────────

// Platform palette — inline hex so the port doesn't depend on CSS vars
// that don't exist on this app's globals.css. Map covers the projects
// the platform currently tracks via feature_requests/bug_reports.
const PROJECT_COLORS: Record<string, string> = {
  'triarch-dev': '#d4a029',          // platform amber (matches existing tokens)
  'triarchsecurity-admin': '#a78bfa', // violet
  'triarchsecurity-portal': '#60a5fa', // blue
  'darksouls-rpg': '#fb923c',         // orange
  'tmi': '#34d399',                    // teal
  'truthtreason': '#f472b6',           // pink
  // legacy / fall-through
  'admin': '#9a8e6b',
};

const TEXT_MUTED = '#9a8e6b';
const TEXT_PRIMARY = '#e8e6df';
const TEXT_SECONDARY = '#b8b4a6';
const BG_ELEVATED = '#1a1a1e';
const BG_BASE = '#111114';
const BORDER = 'rgba(212, 160, 41, 0.2)';
const ACCENT_TEAL = '#00e5b4';
const WARNING = '#f59e0b';
const DANGER = '#ef4444';

function getProjectColor(project: string): string {
  return PROJECT_COLORS[project] ?? TEXT_MUTED;
}

function getDaysAgo(createdAt: string): string {
  const days = Math.floor((Date.now() - new Date(createdAt).getTime()) / 86_400_000);
  if (days === 0) return 'today';
  return `${days}d ago`;
}

const SEVERITY_VARIANT: Record<string, 'danger' | 'warning' | 'neutral' | 'info'> = {
  critical: 'danger',
  high: 'warning',
  medium: 'info',
  low: 'neutral',
};

const IMPORTANCE_VARIANT: Record<string, 'danger' | 'warning' | 'info' | 'neutral'> = {
  urgent: 'danger',
  nice_to_have: 'info',
  just_an_idea: 'neutral',
};

// ── Component ──────────────────────────────────────────────────────────────

export function KanbanCard({ item, selected, onSelect, onVersionChange, onApprove }: KanbanCardProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: item.id });

  const projectColor = getProjectColor(item.project);
  const reporter = item.reportedByName ?? item.requestedByName ?? 'Unknown';

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{
        background: BG_ELEVATED,
        border: `1px solid ${selected ? ACCENT_TEAL : BORDER}`,
        borderRadius: '8px',
        padding: '12px',
        marginBottom: '8px',
        cursor: 'grab',
        opacity: isDragging ? 0.4 : 1,
        boxShadow: isDragging ? '0 8px 24px rgba(0,0,0,0.3)' : undefined,
        transition: 'box-shadow 0.15s, opacity 0.15s',
        userSelect: 'none',
      }}
      onMouseEnter={(e) => {
        if (!isDragging) (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = '';
      }}
    >
      {/* Header row: checkbox + title + badges */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '8px' }}>
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => {
            e.stopPropagation();
            onSelect(item.id, e.target.checked);
          }}
          onPointerDown={(e) => e.stopPropagation()}
          style={{ accentColor: ACCENT_TEAL, marginTop: '2px', flexShrink: 0, cursor: 'pointer' }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: TEXT_PRIMARY,
              lineHeight: 1.4,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              marginBottom: '6px',
            }}
          >
            {item.title}
          </p>
          {/* Badges row */}
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
            {/* Project badge */}
            <span
              style={{
                fontSize: '10px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                padding: '1px 6px',
                borderRadius: '4px',
                background: `${projectColor}22`,
                color: projectColor,
              }}
            >
              {item.project}
            </span>
            {/* Type badge */}
            <span
              style={{
                fontSize: '10px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                padding: '1px 6px',
                borderRadius: '4px',
                background: item.type === 'bug' ? 'rgba(239,68,68,0.1)' : 'rgba(251,191,36,0.1)',
                color: item.type === 'bug' ? DANGER : WARNING,
                border: `1px solid ${item.type === 'bug' ? DANGER : WARNING}`,
              }}
            >
              {item.type === 'bug' ? 'Bug' : 'Feature'}
            </span>
            {/* Severity (bugs) */}
            {item.type === 'bug' && item.severity && (
              <StatusBadge variant={SEVERITY_VARIANT[item.severity as string] ?? 'neutral'} size="sm">
                {item.severity}
              </StatusBadge>
            )}
            {/* Importance (features) — not currently in DB schema, kept for forward-compat */}
            {item.type === 'feature' && item.importance && (
              <StatusBadge variant={IMPORTANCE_VARIANT[item.importance as string] ?? 'neutral'} size="sm">
                {item.importance.replace(/_/g, ' ')}
              </StatusBadge>
            )}
          </div>
        </div>
      </div>

      {/* Meta row: reporter + age */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '8px' }}>
        <span style={{ fontSize: '11px', color: TEXT_MUTED }}>{reporter}</span>
        <span style={{ fontSize: '11px', color: TEXT_MUTED }}>{getDaysAgo(item.createdAt)}</span>
      </div>

      {/* Status + target version row */}
      <div
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <span style={{ fontSize: '10px', color: TEXT_MUTED, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {item.status.replace(/_/g, ' ')}
        </span>
        <input
          defaultValue={item.targetVersion ?? ''}
          placeholder="v0.0.0"
          onBlur={(e) => onVersionChange(item.id, e.target.value)}
          onClick={(e) => e.stopPropagation()}
          style={{
            width: '72px',
            padding: '2px 6px',
            fontSize: '11px',
            background: BG_BASE,
            border: `1px solid ${BORDER}`,
            borderRadius: '4px',
            color: TEXT_SECONDARY,
            outline: 'none',
            cursor: 'text',
          }}
        />
      </div>

      {/* Approve button — hidden once already approved or in a terminal state */}
      {onApprove && !['approved', 'in_progress', 'fixed', 'shipped', 'verified', 'closed', 'declined'].includes(item.status) && (
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onApprove(item);
          }}
          style={{
            marginTop: '8px',
            width: '100%',
            padding: '6px 12px',
            fontSize: '11px',
            fontWeight: 600,
            textAlign: 'left',
            color: ACCENT_TEAL,
            background: 'rgba(0, 229, 180, 0.08)',
            border: '1px solid rgba(0, 229, 180, 0.3)',
            borderRadius: '6px',
            cursor: 'pointer',
            transition: 'background 0.15s',
          }}
        >
          {item.type === 'bug' ? 'Approve Fix →' : 'Approve for Build →'}
        </button>
      )}
    </div>
  );
}
