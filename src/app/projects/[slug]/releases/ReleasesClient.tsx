'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  CheckCircle,
  XCircle,
  GitBranch,
  MessageSquare,
  ChevronDown,
  ChevronRight,
  Trash2,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import type {
  ReleaseRow,
  FeedbackItem,
  ApprovalItem,
  ReleaseStatus,
  UserRole,
  BranchSection,
  ConflictState,
} from './types';
import Toast, { type ToastKind } from '@/components/Toast';
import { formatDeployedAt, formatRelativeTime } from './format';
import Timeline from './Timeline';
import { groupIntoSections } from './group-sections';
import BranchSectionComponent from './BranchSection';

// ---------------------------------------------------------------------------
// Constants
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

const DELETE_WINDOW_MS = 24 * 60 * 60 * 1000;
const FEEDBACK_MAX_CHARS = 2000;
const REASON_MAX_CHARS = 500;
const COUNTDOWN_SECONDS = 5;
const SHORT_SHA_LEN = 7;

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

function canDeleteFeedback(item: FeedbackItem, currentUserEmail: string): boolean {
  return (
    item.authorEmail.toLowerCase() === currentUserEmail.toLowerCase() &&
    Date.now() - new Date(item.createdAt).getTime() < DELETE_WINDOW_MS
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  projectSlug: string;
  projectName: string;
  projectDeployedUrl: string | null;       // NEW (D-06): prod URL fallback for main rows
  userRole: UserRole;
  currentUserEmail: string;
  initialSections: BranchSection[];        // NEW: replaces initialReleases
  conflictsByBranch: Record<string, ConflictState>;  // NEW: snapshot for client-side load-more re-group
  total: number;
  hasMore: boolean;
  pageSize: number;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ErrorBanner({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      role="alert"
      aria-live="assertive"
      className="mb-6 p-4 rounded-md bg-red-500/10 border border-red-500/20 text-sm text-red-400 flex items-center justify-between"
    >
      <div className="flex items-center gap-2">
        <AlertCircle size={14} />
        <span>{message}</span>
      </div>
      <button
        onClick={onRetry}
        className="text-xs text-red-400 hover:text-red-300 underline ml-4"
      >
        Retry
      </button>
    </div>
  );
}

function EmptyState({ projectName }: { projectName: string }) {
  return (
    <div className="p-12 text-center">
      <GitBranch size={32} className="mx-auto text-zinc-700 mb-3" />
      <p className="text-sm text-zinc-500">No releases yet</p>
      <p className="text-xs text-zinc-600 mt-1">
        Once a dev deploy completes for {projectName}, releases will appear here for review.
      </p>
    </div>
  );
}

function LoadMoreButton({
  loadingMore,
  onClick,
}: {
  loadingMore: boolean;
  onClick: () => void;
}) {
  return (
    <div className="mt-4 flex justify-center">
      <button
        onClick={onClick}
        disabled={loadingMore}
        className="flex items-center gap-1.5 px-4 py-2 text-sm border border-zinc-700 text-zinc-400 rounded-md hover:bg-zinc-800 disabled:opacity-50"
      >
        {loadingMore ? <Loader2 size={14} className="animate-spin" /> : null}
        {loadingMore ? 'Loading…' : 'Load more'}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function ReleasesClient({
  projectSlug,
  projectName,
  projectDeployedUrl,
  userRole,
  currentUserEmail,
  initialSections,
  conflictsByBranch,
  total,
  hasMore,
  pageSize,
}: Props) {
  // -- Core state -----------------------------------------------------------
  const [sections, setSections] = useState<BranchSection[]>(initialSections);
  // SSR-safe: lazy initializer using server-computed isActive flag (pitfall 2)
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    () => new Set(initialSections.filter((s) => s.isActive).map((s) => s.branch)),
  );
  // Stable snapshot of conflicts for client-side load-more re-grouping (pitfall 7)
  const conflictsByBranchRef = useRef(conflictsByBranch);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [hasMoreState, setHasMoreState] = useState(hasMore);
  const [offset, setOffset] = useState(pageSize);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: ToastKind; message: string; key: number } | null>(null);

  // -- Per-release ephemeral state ------------------------------------------
  const [feedbackDrafts, setFeedbackDrafts] = useState<Record<string, string>>({});
  const [submittingFeedback, setSubmittingFeedback] = useState<Record<string, boolean>>({});
  const [approveStep, setApproveStep] = useState<Record<string, 'idle' | 'confirm'>>({});
  const [countdownState, setCountdownState] = useState<Record<string, number>>({});
  const [showRejectForm, setShowRejectForm] = useState<Record<string, boolean>>({});
  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>({});
  const [rejecting, setRejecting] = useState<Record<string, boolean>>({});

  // -- Refs for focus management --------------------------------------------
  const approveConfirmRefs = useRef<Map<string, HTMLButtonElement | null>>(new Map());
  const rejectButtonRefs = useRef<Map<string, HTMLButtonElement | null>>(new Map());

  // -- Toast auto-dismiss ---------------------------------------------------
  useEffect(() => {
    if (toast?.kind === 'success') {
      const timer = setTimeout(() => setToast(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // -- Approve countdown ----------------------------------------------------
  useEffect(() => {
    const confirmingIds = Object.entries(approveStep)
      .filter(([, step]) => step === 'confirm')
      .map(([id]) => id);

    if (confirmingIds.length === 0) return;

    const intervals: ReturnType<typeof setInterval>[] = [];

    for (const id of confirmingIds) {
      const interval = setInterval(() => {
        setCountdownState((prev) => {
          const current = prev[id] ?? COUNTDOWN_SECONDS;
          if (current <= 1) {
            // Countdown expired — reset to idle
            setApproveStep((prevStep) => ({ ...prevStep, [id]: 'idle' }));
            clearInterval(interval);
            return { ...prev, [id]: COUNTDOWN_SECONDS };
          }
          return { ...prev, [id]: current - 1 };
        });
      }, 1000);
      intervals.push(interval);
    }

    return () => intervals.forEach((i) => clearInterval(i));
  }, [approveStep]);

  // -- Focus management: move to confirm button when step transitions -------
  useEffect(() => {
    for (const [id, step] of Object.entries(approveStep)) {
      if (step === 'confirm') {
        const btn = approveConfirmRefs.current.get(id);
        if (btn) btn.focus();
      }
    }
  }, [approveStep]);

  // -- Helpers --------------------------------------------------------------

  function showToast(kind: ToastKind, message: string) {
    setToast({ kind, message, key: Date.now() });
  }

  function toggleExpanded(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleSection(branch: string) {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(branch)) {
        next.delete(branch);
      } else {
        next.add(branch);
      }
      return next;
    });
  }

  // findRelease: flat lookup across all sections
  const findRelease = useCallback(
    (id: string): ReleaseRow | undefined =>
      sections.flatMap((s) => s.releases).find((r) => r.id === id),
    [sections],
  );

  function updateReleaseInState(releaseId: string, patch: Partial<ReleaseRow>) {
    setSections((prev) =>
      prev.map((section) => ({
        ...section,
        releases: section.releases.map((r) =>
          r.id === releaseId ? { ...r, ...patch } : r,
        ),
      })),
    );
  }

  // -- Handlers -------------------------------------------------------------

  async function handleApprove(releaseId: string, version: string) {
    try {
      const res = await fetch(
        `/api/projects/${projectSlug}/releases/${releaseId}/approve`,
        { method: 'POST' },
      );
      const data = await res.json();

      if (!res.ok) {
        showToast('error', 'Could not approve release. Please try again.');
      } else if (data.alreadyApproved) {
        showToast('success', 'This release was already approved.');
        updateReleaseInState(releaseId, { status: data.release.status });
      } else {
        showToast('success', `Release ${version} approved for production.`);
        updateReleaseInState(releaseId, {
          status: 'approved',
          approvals: [
            data.approval as ApprovalItem,
            ...(findRelease(releaseId)?.approvals ?? []),
          ],
        });
      }
    } catch {
      showToast('error', 'Could not approve release. Please try again.');
    } finally {
      setApproveStep((prev) => ({ ...prev, [releaseId]: 'idle' }));
      setCountdownState((prev) => ({ ...prev, [releaseId]: COUNTDOWN_SECONDS }));
    }
  }

  async function handleReject(releaseId: string, version: string) {
    const reason = rejectReasons[releaseId]?.trim();
    if (!reason) return;

    setRejecting((prev) => ({ ...prev, [releaseId]: true }));
    try {
      const res = await fetch(
        `/api/projects/${projectSlug}/releases/${releaseId}/reject`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason }),
        },
      );
      const data = await res.json();

      if (res.ok) {
        showToast('success', `Release ${version} rejected.`);
        updateReleaseInState(releaseId, {
          status: 'rejected',
          approvals: [
            data.approval as ApprovalItem,
            ...(findRelease(releaseId)?.approvals ?? []),
          ],
        });
        setShowRejectForm((prev) => ({ ...prev, [releaseId]: false }));
        setRejectReasons((prev) => ({ ...prev, [releaseId]: '' }));
      } else {
        showToast('error', data.error ?? 'Could not submit rejection. Please try again.');
      }
    } catch {
      showToast('error', 'Could not submit rejection. Please try again.');
    } finally {
      setRejecting((prev) => ({ ...prev, [releaseId]: false }));
    }
  }

  async function handlePostFeedback(releaseId: string) {
    const body = feedbackDrafts[releaseId]?.trim();
    if (!body) return;

    setSubmittingFeedback((prev) => ({ ...prev, [releaseId]: true }));
    try {
      const res = await fetch(
        `/api/projects/${projectSlug}/releases/${releaseId}/feedback`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body }),
        },
      );
      const data = await res.json();

      if (res.status === 201) {
        const newItem = data as FeedbackItem;
        updateReleaseInState(releaseId, {
          feedback: [
            ...(findRelease(releaseId)?.feedback ?? []),
            newItem,
          ],
        });
        setFeedbackDrafts((prev) => ({ ...prev, [releaseId]: '' }));
        showToast('success', 'Comment posted.');
      } else {
        showToast('error', 'Could not post comment. Please try again.');
      }
    } catch {
      showToast('error', 'Could not post comment. Please try again.');
    } finally {
      setSubmittingFeedback((prev) => ({ ...prev, [releaseId]: false }));
    }
  }

  async function handleDeleteFeedback(releaseId: string, feedbackId: string) {
    try {
      const res = await fetch(
        `/api/projects/${projectSlug}/releases/${releaseId}/feedback/${feedbackId}`,
        { method: 'DELETE' },
      );

      if (res.ok) {
        updateReleaseInState(releaseId, {
          feedback: (findRelease(releaseId)?.feedback ?? []).filter(
            (f) => f.id !== feedbackId,
          ),
        });
        showToast('success', 'Comment deleted.');
      } else {
        showToast('error', 'Could not delete comment. Please try again.');
      }
    } catch {
      showToast('error', 'Could not delete comment. Please try again.');
    }
  }

  const handleLoadMore = useCallback(async () => {
    setLoadingMore(true);
    try {
      const res = await fetch(
        `/api/projects/${projectSlug}/releases?limit=${pageSize}&offset=${offset}`,
      );
      if (!res.ok) throw new Error('fetch failed');
      const data = await res.json();
      const newReleases = data.releases as ReleaseRow[];
      setSections((prev) => {
        const flat = [...prev.flatMap((s) => s.releases), ...newReleases];
        // Rebuild conflicts Map from stable snapshot ref (pitfall 7)
        const conflictsMap = new Map(Object.entries(conflictsByBranchRef.current));
        return groupIntoSections(flat, conflictsMap, projectDeployedUrl);
      });
      setOffset((prev) => prev + pageSize);
      setHasMoreState(data.hasMore);
      setPageError(null);
    } catch {
      setPageError('Failed to load releases. Check your connection and try again.');
    } finally {
      setLoadingMore(false);
    }
  }, [projectSlug, pageSize, offset, projectDeployedUrl]);

  // -- Render ---------------------------------------------------------------

  return (
    <>
      {toast && (
        <Toast
          key={toast.key}
          kind={toast.kind}
          message={toast.message}
          onDismiss={() => setToast(null)}
        />
      )}

      <div className="p-8 max-w-5xl">
        {/* Error banner */}
        {pageError && (
          <ErrorBanner message={pageError} onRetry={handleLoadMore} />
        )}

        {/* Page header */}
        <div className="flex items-center gap-3 mb-6">
          <GitBranch size={24} className="text-teal-400" />
          <div>
            <h1 className="text-2xl font-bold text-white">{projectName} Releases</h1>
            <p className="text-sm text-zinc-500 mt-0.5">
              {total} release{total !== 1 ? 's' : ''} &middot; {projectName}
            </p>
          </div>
        </div>

        {/* Branch sections (Phase 05-04) */}
        {sections.length === 0 ? (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 overflow-hidden">
            <EmptyState projectName={projectName} />
          </div>
        ) : (
          <div className="space-y-4">
            {sections.map((section) => (
              <BranchSectionComponent
                key={section.branch}
                section={section}
                projectDeployedUrl={projectDeployedUrl}
                isExpanded={expandedSections.has(section.branch)}
                expandedRowIds={expandedIds}
                userRole={userRole}
                currentUserEmail={currentUserEmail}
                projectSlug={projectSlug}
                onToggleSection={toggleSection}
                onToggleRow={toggleExpanded}
                approveStep={approveStep}
                countdownState={countdownState}
                feedbackDrafts={feedbackDrafts}
                submittingFeedback={submittingFeedback}
                showRejectForm={showRejectForm}
                rejectReasons={rejectReasons}
                rejecting={rejecting}
                onApproveStep1={(releaseId) => {
                  setApproveStep((prev) => ({ ...prev, [releaseId]: 'confirm' }));
                  setCountdownState((prev) => ({
                    ...prev,
                    [releaseId]: COUNTDOWN_SECONDS,
                  }));
                }}
                onApproveConfirm={(releaseId, version) => handleApprove(releaseId, version)}
                onShowRejectForm={(releaseId) =>
                  setShowRejectForm((prev) => ({ ...prev, [releaseId]: true }))
                }
                onHideRejectForm={(releaseId) => {
                  setShowRejectForm((prev) => ({ ...prev, [releaseId]: false }));
                  setRejectReasons((prev) => ({ ...prev, [releaseId]: '' }));
                  const btn = rejectButtonRefs.current.get(releaseId);
                  if (btn) btn.focus();
                }}
                onRejectReasonChange={(releaseId, val) =>
                  setRejectReasons((prev) => ({ ...prev, [releaseId]: val }))
                }
                onReject={(releaseId, version) => handleReject(releaseId, version)}
                onFeedbackDraftChange={(releaseId, val) =>
                  setFeedbackDrafts((prev) => ({ ...prev, [releaseId]: val }))
                }
                onPostFeedback={(releaseId) => handlePostFeedback(releaseId)}
                onDeleteFeedback={(releaseId, fId) => handleDeleteFeedback(releaseId, fId)}
                approveConfirmRef={(releaseId, btn) =>
                  approveConfirmRefs.current.set(releaseId, btn)
                }
                rejectButtonRef={(releaseId, btn) =>
                  rejectButtonRefs.current.set(releaseId, btn)
                }
                renderExpandedPanel={(release, isConflict) => (
                  <ExpandedPanel
                    release={release}
                    status={(release.status ?? 'dev') as ReleaseStatus}
                    userRole={userRole}
                    currentUserEmail={currentUserEmail}
                    projectSlug={projectSlug}
                    isConflict={isConflict}
                    feedbackDraft={feedbackDrafts[release.id] ?? ''}
                    onFeedbackDraftChange={(val) =>
                      setFeedbackDrafts((prev) => ({ ...prev, [release.id]: val }))
                    }
                    submitting={submittingFeedback[release.id] ?? false}
                    onPostFeedback={() => handlePostFeedback(release.id)}
                    onDeleteFeedback={(fId) => handleDeleteFeedback(release.id, fId)}
                    approveStep={approveStep[release.id] ?? 'idle'}
                    countdown={countdownState[release.id] ?? COUNTDOWN_SECONDS}
                    onApproveStep1={() => {
                      setApproveStep((prev) => ({ ...prev, [release.id]: 'confirm' }));
                      setCountdownState((prev) => ({
                        ...prev,
                        [release.id]: COUNTDOWN_SECONDS,
                      }));
                    }}
                    onApproveConfirm={() => handleApprove(release.id, release.version)}
                    approveConfirmRef={(btn) =>
                      approveConfirmRefs.current.set(release.id, btn)
                    }
                    showRejectForm={showRejectForm[release.id] ?? false}
                    onShowRejectForm={() =>
                      setShowRejectForm((prev) => ({ ...prev, [release.id]: true }))
                    }
                    onHideRejectForm={() => {
                      setShowRejectForm((prev) => ({ ...prev, [release.id]: false }));
                      setRejectReasons((prev) => ({ ...prev, [release.id]: '' }));
                      const btn = rejectButtonRefs.current.get(release.id);
                      if (btn) btn.focus();
                    }}
                    rejectReason={rejectReasons[release.id] ?? ''}
                    onRejectReasonChange={(val) =>
                      setRejectReasons((prev) => ({ ...prev, [release.id]: val }))
                    }
                    rejecting={rejecting[release.id] ?? false}
                    onReject={() => handleReject(release.id, release.version)}
                    rejectButtonRef={(btn) => rejectButtonRefs.current.set(release.id, btn)}
                  />
                )}
              />
            ))}
          </div>
        )}

        {/* Load more */}
        {hasMoreState && (
          <LoadMoreButton loadingMore={loadingMore} onClick={handleLoadMore} />
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// ExpandedPanel sub-component
// ---------------------------------------------------------------------------

interface ExpandedPanelProps {
  release: ReleaseRow;
  status: ReleaseStatus;
  userRole: UserRole;
  currentUserEmail: string;
  projectSlug: string;
  isConflict: boolean;   // D-17: when true, hides approve/reject area and shows resolve helper
  feedbackDraft: string;
  onFeedbackDraftChange: (val: string) => void;
  submitting: boolean;
  onPostFeedback: () => void;
  onDeleteFeedback: (feedbackId: string) => void;
  approveStep: 'idle' | 'confirm';
  countdown: number;
  onApproveStep1: () => void;
  onApproveConfirm: () => void;
  approveConfirmRef: (btn: HTMLButtonElement | null) => void;
  showRejectForm: boolean;
  onShowRejectForm: () => void;
  onHideRejectForm: () => void;
  rejectReason: string;
  onRejectReasonChange: (val: string) => void;
  rejecting: boolean;
  onReject: () => void;
  rejectButtonRef: (btn: HTMLButtonElement | null) => void;
}

function ExpandedPanel({
  release,
  status,
  userRole,
  currentUserEmail,
  isConflict,
  feedbackDraft,
  onFeedbackDraftChange,
  submitting,
  onPostFeedback,
  onDeleteFeedback,
  approveStep,
  countdown,
  onApproveStep1,
  onApproveConfirm,
  approveConfirmRef,
  showRejectForm,
  onShowRejectForm,
  onHideRejectForm,
  rejectReason,
  onRejectReasonChange,
  rejecting,
  onReject,
  rejectButtonRef,
}: ExpandedPanelProps) {
  const auditApproval = release.approvals[0] ?? null;
  const hasAuditLine = status === 'approved' || status === 'rejected' || status === 'promoted';

  const reasonExcerpt = auditApproval?.reason
    ? auditApproval.reason.length > 80
      ? auditApproval.reason.slice(0, 80) + '…'
      : auditApproval.reason
    : null;

  return (
    <div className="px-4 py-4 space-y-4">
      {/* Audit trail line */}
      {hasAuditLine && auditApproval && (
        <p className="text-xs text-zinc-500">
          {status === 'approved' && (
            <>
              approved by <span className="font-mono">{auditApproval.approverEmail}</span> on{' '}
              {formatDeployedAt(auditApproval.approvedAt, auditApproval.approvedAt)}
            </>
          )}
          {status === 'rejected' && (
            <>
              rejected by <span className="font-mono">{auditApproval.approverEmail}</span>
              {reasonExcerpt ? `: ${reasonExcerpt}` : ''}
            </>
          )}
          {status === 'promoted' && (
            <>
              approved by <span className="font-mono">{auditApproval.approverEmail}</span> on{' '}
              {formatDeployedAt(auditApproval.approvedAt, auditApproval.approvedAt)}
            </>
          )}
        </p>
      )}

      {/* Release lifecycle timeline */}
      <Timeline release={release} />

      {/* Feedback list */}
      <div className="space-y-3">
        {release.feedback.map((item) => (
          <div key={item.id} className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono text-zinc-500">
                {item.authorEmail} &middot; {formatRelativeTime(item.createdAt)}
              </span>
              {canDeleteFeedback(item, currentUserEmail) && (
                <button
                  onClick={() => onDeleteFeedback(item.id)}
                  className="text-zinc-700 hover:text-red-400 transition-colors"
                  aria-label="Delete comment"
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
            <p className="text-sm text-zinc-300">{item.body}</p>
          </div>
        ))}
        {release.feedback.length === 0 && (
          <p className="text-xs text-zinc-600">No feedback yet.</p>
        )}
      </div>

      {/* Feedback compose — admin only */}
      {userRole === 'admin' && (
        <div className="flex flex-col gap-2">
          <textarea
            value={feedbackDraft}
            onChange={(e) => onFeedbackDraftChange(e.target.value)}
            placeholder="Leave a comment for the Triarch team…"
            rows={3}
            aria-label="Leave a comment"
            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-md text-sm text-zinc-200 focus:outline-none focus:border-teal-500 disabled:opacity-50 resize-y min-h-[80px]"
            disabled={submitting}
            maxLength={FEEDBACK_MAX_CHARS}
          />
          <div className="flex items-center justify-between">
            <span
              className={`text-[10px] ${
                feedbackDraft.length >= 1900 ? 'text-amber-400' : 'text-zinc-600'
              }`}
            >
              {feedbackDraft.length}/2000
            </span>
            <button
              onClick={onPostFeedback}
              disabled={!feedbackDraft.trim() || submitting}
              aria-label={`Post comment for release ${release.version}`}
              className="flex items-center gap-1.5 px-3 py-2 text-sm bg-teal-600 text-white rounded-md hover:bg-teal-500 disabled:opacity-50"
            >
              {submitting ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <MessageSquare size={14} />
              )}
              Post Comment
            </button>
          </div>
        </div>
      )}

      {/* Action buttons row — admin only, status='dev' only, not conflicted (D-17) */}
      {userRole === 'admin' && status === 'dev' && !isConflict && (
        <div className="flex items-center gap-3 pt-2 border-t border-zinc-800">
          {/* Approve button */}
          {approveStep === 'idle' ? (
            <button
              onClick={onApproveStep1}
              aria-label="Approve for Production"
              className="flex items-center gap-1.5 px-3 py-2 text-sm bg-teal-600 text-white rounded-md hover:bg-teal-500"
            >
              <CheckCircle size={14} /> Approve for Production
            </button>
          ) : (
            <button
              ref={approveConfirmRef}
              onClick={onApproveConfirm}
              aria-label={`Confirm promotion of ${release.branch ?? 'main'} ${release.version}`}
              className="flex items-center gap-1.5 px-3 py-2 text-sm bg-teal-700 text-white rounded-md border border-teal-500 min-w-[320px] justify-center whitespace-nowrap"
              title={`Click to confirm — promote ${release.branch ?? 'main'} ${release.version}`}
            >
              <span>
                Click to confirm — promote{' '}
                <span className="font-mono">{release.branch ?? 'main'}</span>{' '}
                <span className="font-mono">{release.version}</span>{' '}
                (<span aria-live="polite">{countdown}s</span>)
              </span>
            </button>
          )}

          {/* Reject button or reject form */}
          {!showRejectForm ? (
            <button
              ref={rejectButtonRef}
              onClick={onShowRejectForm}
              aria-label={`Reject release ${release.version}`}
              className="px-3 py-2 text-sm border border-red-500/40 text-red-400 rounded-md hover:bg-red-500/10"
            >
              Reject Release
            </button>
          ) : (
            <div className="mt-3 p-4 rounded-md bg-zinc-900 border border-red-500/20 space-y-3 w-full">
              <p className="text-xs text-zinc-500">
                Provide a reason for rejection. This will be recorded in the audit trail.
              </p>
              <textarea
                value={rejectReason}
                onChange={(e) => onRejectReasonChange(e.target.value)}
                placeholder="e.g. Performance regression in checkout flow — needs investigation before prod."
                rows={3}
                aria-label="Rejection reason"
                aria-required="true"
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-md text-sm text-zinc-200 focus:outline-none focus:border-red-500 disabled:opacity-50 resize-y min-h-[80px]"
                disabled={rejecting}
                maxLength={REASON_MAX_CHARS}
                autoFocus
              />
              <div className="flex items-center justify-between">
                <span
                  className={`text-[10px] ${
                    rejectReason.length >= 450 ? 'text-amber-400' : 'text-zinc-600'
                  }`}
                >
                  {rejectReason.length}/500
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={onHideRejectForm}
                    className="text-xs text-zinc-500 hover:text-zinc-300 px-2 py-1.5"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={onReject}
                    disabled={!rejectReason.trim() || rejecting}
                    className="flex items-center gap-1.5 px-3 py-2 text-sm bg-red-600 text-white rounded-md hover:bg-red-500 disabled:opacity-50"
                  >
                    {rejecting ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <XCircle size={14} />
                    )}
                    Confirm Rejection
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Conflict resolution helper — replaces approve/reject area when branch is in conflict (D-17) */}
      {userRole === 'admin' && status === 'dev' && isConflict && (
        <div className="pt-2 border-t border-zinc-800">
          <p className="text-xs text-zinc-500 italic">Resolve conflict to enable approval</p>
        </div>
      )}
    </div>
  );
}
