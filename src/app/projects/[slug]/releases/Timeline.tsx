'use client';

import { GitCommit, MessageSquare, ShieldCheck, XCircle, Rocket, Server } from 'lucide-react';
import type { ReleaseRow } from './types';
import { formatRelativeTime } from './format';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type EventKind = 'deployed-dev' | 'feedback' | 'approved' | 'rejected' | 'promoted' | 'deployed-prod';

interface TimelineEvent {
  kind: EventKind;
  title: string;
  actor: string | null;
  at: string;       // ISO
  detail?: string;  // optional inline detail (feedback body excerpt, rejection reason)
}

// ---------------------------------------------------------------------------
// Icon mapping — one lucide icon per event kind, color-keyed to Phase 2 palette
// ---------------------------------------------------------------------------

function EventIcon({ kind }: { kind: EventKind }) {
  switch (kind) {
    case 'deployed-dev':
      return <GitCommit size={14} className="text-zinc-400" />;
    case 'feedback':
      return <MessageSquare size={14} className="text-zinc-500" />;
    case 'approved':
      return <ShieldCheck size={14} className="text-teal-400" />;
    case 'rejected':
      return <XCircle size={14} className="text-red-400" />;
    case 'promoted':
      return <Rocket size={14} className="text-amber-400" />;
    case 'deployed-prod':
      return <Server size={14} className="text-blue-400" />;
  }
}

// ---------------------------------------------------------------------------
// Event builder
// ---------------------------------------------------------------------------

function buildEvents(release: ReleaseRow): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  // 1. deployed-dev — always present
  events.push({
    kind: 'deployed-dev',
    title: 'Deployed to dev',
    actor: release.releasedBy ?? null,
    at: release.deployedAt ?? release.releasedAt,
  });

  // 2. feedback events — chronological ASC (server already sorts asc by createdAt)
  const sortedFeedback = [...release.feedback].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  for (const item of sortedFeedback) {
    events.push({
      kind: 'feedback',
      title: 'Feedback posted',
      actor: item.authorEmail,
      at: item.createdAt,
      detail: item.body.length > 80 ? item.body.slice(0, 80) + '…' : item.body,
    });
  }

  // 3. approval decision — use approvals[0] (most-recent, per Phase 2 sort)
  const approval = release.approvals[0] ?? null;
  if (approval) {
    if (approval.decision === 'approved') {
      events.push({
        kind: 'approved',
        title: 'Approved for production',
        actor: approval.approverEmail,
        at: approval.approvedAt,
      });
    } else if (approval.decision === 'rejected') {
      events.push({
        kind: 'rejected',
        title: 'Rejected',
        actor: approval.approverEmail,
        at: approval.approvedAt,
        detail: approval.reason ?? undefined,
      });
    }
  }

  // 4. promoted — only when promotion was dispatched
  if (release.promotionDispatchedAt != null) {
    events.push({
      kind: 'promoted',
      title: 'Promotion dispatched',
      actor: release.promotionDispatchedBy ?? null,
      at: release.promotionDispatchedAt,
    });
  }

  // 5. deployed-prod — only when paired prod row exists
  if (release.pairedProd != null) {
    events.push({
      kind: 'deployed-prod',
      title: 'Deployed to production',
      actor: release.pairedProd.releasedBy ?? null,
      at: release.pairedProd.deployedAt ?? release.pairedProd.releasedAt,
    });
  }

  // Sort by timestamp ASC — defensive guard for any out-of-order entries
  return events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface Props {
  release: ReleaseRow;
}

export default function Timeline({ release }: Props) {
  const events = buildEvents(release);

  if (events.length === 0) return null;

  return (
    <div>
      <h3 className="text-[10px] uppercase tracking-wide text-zinc-500 mb-3">Timeline</h3>
      <div className="space-y-3">
        {events.map((event, index) => {
          const isLast = index === events.length - 1;
          return (
            <div key={`${event.kind}-${event.at}`} className="flex gap-3">
              {/* Left gutter: icon + connector line */}
              <div className="flex flex-col items-center w-4 shrink-0">
                <div className="flex items-center justify-center w-4 h-4 shrink-0">
                  <EventIcon kind={event.kind} />
                </div>
                {!isLast && (
                  <div className="w-px flex-1 mt-1 bg-zinc-700 min-h-[12px]" />
                )}
              </div>

              {/* Right body */}
              <div className="pb-1 min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-sm text-zinc-200">{event.title}</span>
                  <span
                    className="text-[10px] text-zinc-500 cursor-default"
                    title={event.at}
                  >
                    {formatRelativeTime(event.at)}
                  </span>
                </div>
                {event.actor && (
                  <p className="text-[10px] font-mono text-zinc-500 mt-0.5 truncate">
                    {event.actor}
                  </p>
                )}
                {event.detail && (
                  <p className="text-xs text-zinc-400 mt-0.5">{event.detail}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
