import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { makeBranchSection, makeRelease, makeConflict } from './__fixtures__/releases';
// INTENTIONAL RED: ./BranchSection does not exist until Plan 05-04
import BranchSection from './BranchSection';

describe('BranchSection conflict state (RC-07)', () => {
  const noopHandler = () => {};
  const baseProps = {
    projectDeployedUrl: null,
    isExpanded: true,
    userRole: 'admin' as const,
    currentUserEmail: 'mike@triarchsecurity.com',
    projectSlug: 'truthtreason',
    onToggleSection: noopHandler,
    onToggleRow: noopHandler,
    expandedRowIds: new Set<string>(),
    // All per-row action props can be no-op stubs for these RC-07 assertions
    approveStep: {} as Record<string, 'idle' | 'confirm'>,
    countdownState: {} as Record<string, number>,
    feedbackDrafts: {} as Record<string, string>,
    submittingFeedback: {} as Record<string, boolean>,
    showRejectForm: {} as Record<string, boolean>,
    rejectReasons: {} as Record<string, string>,
    rejecting: {} as Record<string, boolean>,
    onApproveStep1: vi.fn(),
    onApproveConfirm: vi.fn(),
    onShowRejectForm: noopHandler,
    onHideRejectForm: noopHandler,
    onRejectReasonChange: noopHandler,
    onReject: noopHandler,
    onFeedbackDraftChange: noopHandler,
    onPostFeedback: noopHandler,
    onDeleteFeedback: noopHandler,
    approveConfirmRef: () => {},
    rejectButtonRef: () => {},
    renderExpandedPanel: (_release: unknown, _isConflict: unknown) => null,
  };

  it('shows "Conflict — N file(s)" badge when section.conflict is populated', () => {
    const section = makeBranchSection({
      branch: 'feat/change-font',
      releases: [makeRelease({ branch: 'feat/change-font', status: 'dev' })],
      conflict: makeConflict({ files: ['src/foo.ts'] }),
    });
    render(<BranchSection section={section} {...baseProps} />);
    expect(screen.getByText(/conflict — 1 file/i)).toBeInTheDocument();
  });

  it('hides Approve button when section.conflict is populated', () => {
    const section = makeBranchSection({
      branch: 'feat/change-font',
      releases: [makeRelease({ branch: 'feat/change-font', status: 'dev' })],
      conflict: makeConflict({ files: ['src/foo.ts'] }),
    });
    render(<BranchSection section={section} {...baseProps} />);
    expect(screen.queryByRole('button', { name: /approve for production/i })).toBeNull();
  });

  it('shows "Resolve conflict to enable approval" helper text on conflicted branches', () => {
    const section = makeBranchSection({
      branch: 'feat/change-font',
      releases: [makeRelease({ branch: 'feat/change-font', status: 'dev' })],
      conflict: makeConflict({ files: ['src/foo.ts'] }),
    });
    render(<BranchSection section={section} {...baseProps} />);
    expect(screen.getByText(/resolve conflict to enable approval/i)).toBeInTheDocument();
  });
});
