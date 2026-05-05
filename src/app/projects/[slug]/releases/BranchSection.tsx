'use client';

import React from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type {
  ReleaseRow,
  BranchSection as BranchSectionType,
  ReleaseStatus,
  UserRole,
} from './types';
import PreviewLink from './PreviewLink';
import { resolvePreviewUrl } from './group-sections';
import { formatDeployedAt, formatRelativeTime } from './format';

// ---------------------------------------------------------------------------
// Constants — keep in sync with ReleasesClient.tsx
// ---------------------------------------------------------------------------

const STATUS_BADGE_COLORS: Record<string, string> = {
  dev: 'bg-zinc-700 text-zinc-300 border-zinc-600',
  pending_approval: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  approved: 'bg-teal-500/20 text-teal-400 border-teal-500/30',
  rejected: 'bg-red-500/20 text-red-400 border-red-500/30',
  promoted: 'bg-amber-400/20 text-amber-300 border-amber-400/30',
};

const ENV_BADGE_COLORS: Record<string, string> = {
  dev: 'bg-zinc-700 text-zinc-400 border-zinc-600',
  prod: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
};

const SHORT_SHA_LEN = 7;
const MAX_CONFLICT_FILES_RENDERED = 50; // pitfall 6 — defensive cap

function sanitiseDomId(branch: string): string {
  return branch.replace(/[^a-z0-9]/gi, '-');
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  section: BranchSectionType;
  projectDeployedUrl: string | null;
  isExpanded: boolean;
  expandedRowIds: Set<string>;
  userRole: UserRole;
  currentUserEmail: string;
  projectSlug: string;
  onToggleSection: (branch: string) => void;
  onToggleRow: (id: string) => void;

  // Per-row state passthrough (kept on parent ReleasesClient — branch grouping is structural, not stateful)
  approveStep: Record<string, 'idle' | 'confirm'>;
  countdownState: Record<string, number>;
  feedbackDrafts: Record<string, string>;
  submittingFeedback: Record<string, boolean>;
  showRejectForm: Record<string, boolean>;
  rejectReasons: Record<string, string>;
  rejecting: Record<string, boolean>;

  // Per-row handlers
  onApproveStep1: (releaseId: string) => void;
  onApproveConfirm: (releaseId: string, version: string) => void;
  onShowRejectForm: (releaseId: string) => void;
  onHideRejectForm: (releaseId: string) => void;
  onRejectReasonChange: (releaseId: string, val: string) => void;
  onReject: (releaseId: string, version: string) => void;
  onFeedbackDraftChange: (releaseId: string, val: string) => void;
  onPostFeedback: (releaseId: string) => void;
  onDeleteFeedback: (releaseId: string, feedbackId: string) => void;
  approveConfirmRef: (releaseId: string, btn: HTMLButtonElement | null) => void;
  rejectButtonRef: (releaseId: string, btn: HTMLButtonElement | null) => void;

  // The actual ExpandedPanel renderer is owned by ReleasesClient.tsx (so all per-row state lives there).
  // BranchSection passes the `isConflict` flag to it via the `renderExpandedPanel` callback.
  renderExpandedPanel: (release: ReleaseRow, isConflict: boolean) => React.ReactNode;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function BranchSection({
  section,
  projectDeployedUrl,
  isExpanded,
  expandedRowIds,
  onToggleSection,
  onToggleRow,
  renderExpandedPanel,
}: Props) {
  const branchId = sanitiseDomId(section.branch);
  const panelId = `branch-panel-${branchId}`;
  const isConflict = section.conflict !== null;
  const conflictFiles = section.conflict
    ? (section.conflict.files as string[]).slice(0, MAX_CONFLICT_FILES_RENDERED)
    : [];
  const conflictTruncated = section.conflict
    ? section.conflict.files.length > MAX_CONFLICT_FILES_RENDERED
    : false;

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 overflow-hidden">
      {/* Section header */}
      <button
        type="button"
        onClick={() => onToggleSection(section.branch)}
        aria-expanded={isExpanded}
        aria-controls={panelId}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-zinc-800/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          {isExpanded ? (
            <ChevronDown size={14} className="text-zinc-500" />
          ) : (
            <ChevronRight size={14} className="text-zinc-500" />
          )}
          <span className="text-sm font-mono text-zinc-200">{section.branch}</span>
          {section.maxDeployedAt && (
            <span className="text-xs text-zinc-500">
              {formatRelativeTime(section.maxDeployedAt)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {section.aggregate.pending > 0 && (
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] border ${STATUS_BADGE_COLORS.pending_approval}`}
            >
              {section.aggregate.pending} pending
            </span>
          )}
          {section.aggregate.promoted > 0 && (
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] border ${STATUS_BADGE_COLORS.promoted}`}
            >
              {section.aggregate.promoted} promoted
            </span>
          )}
          {section.conflict && (
            <span
              role="status"
              className={`px-1.5 py-0.5 rounded text-[10px] border ${STATUS_BADGE_COLORS.rejected}`}
            >
              Conflict — {section.conflict.files.length} file(s)
            </span>
          )}
        </div>
      </button>

      {/* Section panel — `hidden` attribute, not display:none, per RESEARCH.md pitfall 5 */}
      <div id={panelId} hidden={!isExpanded}>
        {/* Conflict expansion: file list + rebase hint, shown above table when conflict present */}
        {section.conflict && (
          <div className="px-4 py-3 border-t border-red-500/20 bg-red-500/5 text-xs text-zinc-300">
            <p className="font-medium text-red-400 mb-2">
              Cannot promote {section.branch} — conflicts with main:
            </p>
            <ul className="font-mono text-[11px] text-zinc-400 space-y-0.5 mb-2">
              {conflictFiles.map((f) => (
                <li key={f}>{f}</li>
              ))}
              {conflictTruncated && (
                <li className="italic text-zinc-500">
                  + {section.conflict.files.length - MAX_CONFLICT_FILES_RENDERED} more
                </li>
              )}
            </ul>
            <p className="text-zinc-500">Rebase manually on main, push as a new RC to retry.</p>
            {section.conflict.rebaseError && (
              <details className="mt-2">
                <summary className="cursor-pointer text-zinc-500 hover:text-zinc-300 text-[10px]">
                  Show error details
                </summary>
                <pre className="mt-1 p-2 bg-zinc-900 border border-zinc-800 rounded text-[10px] text-zinc-400 overflow-x-auto whitespace-pre-wrap">
                  {section.conflict.rebaseError}
                </pre>
              </details>
            )}
          </div>
        )}

        {/* Per-section table (Pitfall 5 — separate table per section, not one big table) */}
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="text-[10px] text-zinc-500 uppercase tracking-wide text-left px-4 py-2 border-b border-zinc-800 w-8" />
              <th className="text-[10px] text-zinc-500 uppercase tracking-wide text-left px-4 py-2 border-b border-zinc-800 w-32">
                Version
              </th>
              <th className="text-[10px] text-zinc-500 uppercase tracking-wide text-left px-4 py-2 border-b border-zinc-800 w-16">
                Env
              </th>
              <th className="text-[10px] text-zinc-500 uppercase tracking-wide text-left px-4 py-2 border-b border-zinc-800 w-40">
                Status
              </th>
              <th className="text-[10px] text-zinc-500 uppercase tracking-wide text-left px-4 py-2 border-b border-zinc-800 w-24">
                Commit
              </th>
              <th className="text-[10px] text-zinc-500 uppercase tracking-wide text-left px-4 py-2 border-b border-zinc-800 w-36">
                Deployed
              </th>
              <th className="text-[10px] text-zinc-500 uppercase tracking-wide text-left px-4 py-2 border-b border-zinc-800">
                Approver
              </th>
            </tr>
          </thead>
          <tbody>
            {section.releases.map((release) => {
              const expanded = expandedRowIds.has(release.id);
              const status = (release.status ?? 'dev') as ReleaseStatus;
              const approver = release.approvals[0]?.approverEmail ?? '—';
              const previewUrl = resolvePreviewUrl(release, projectDeployedUrl);

              return (
                <React.Fragment key={release.id}>
                  <tr
                    className="border-b border-zinc-800 last:border-0 cursor-pointer hover:bg-zinc-800/30 transition-colors"
                    onClick={() => onToggleRow(release.id)}
                    aria-expanded={expanded}
                    aria-controls={`panel-${release.id}`}
                    aria-label={`Release ${release.id}`}
                  >
                    <td className="px-4 py-3 w-8">
                      {expanded ? (
                        <ChevronDown size={14} className="text-zinc-500" />
                      ) : (
                        <ChevronRight size={14} className="text-zinc-500" />
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-sm font-bold text-teal-400">
                          {release.version}
                        </span>
                        <PreviewLink url={previewUrl} />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] border ${
                          ENV_BADGE_COLORS[release.env ?? 'dev']
                        }`}
                      >
                        {release.env ?? 'dev'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] border ${
                            STATUS_BADGE_COLORS[status] ?? STATUS_BADGE_COLORS.dev
                          }`}
                          aria-label={`${status} status`}
                        >
                          {status}
                        </span>
                        {isConflict && (
                          <span
                            role="status"
                            className={`px-1.5 py-0.5 rounded text-[10px] border ${STATUS_BADGE_COLORS.rejected}`}
                          >
                            Conflict
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[10px] font-mono text-zinc-500">
                        {release.commitSha?.slice(0, SHORT_SHA_LEN) ?? '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-zinc-400">
                        {formatDeployedAt(release.deployedAt, release.releasedAt)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[10px] font-mono text-zinc-500">
                        {approver}
                      </span>
                    </td>
                  </tr>

                  {expanded && (
                    <tr id={`panel-${release.id}`}>
                      <td colSpan={7} className="border-b border-zinc-800 bg-zinc-900/30">
                        {renderExpandedPanel(release, isConflict)}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}

            {/* Conflict-state branches: helper text replaces the approve area for dev rows */}
            {isConflict && section.releases.some((r) => (r.status ?? 'dev') === 'dev') && (
              <tr>
                <td colSpan={7} className="px-4 py-2 text-xs text-zinc-500 italic">
                  Resolve conflict to enable approval
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
