import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { makeBranchSection, makeRelease, makeConflict } from './__fixtures__/releases';
import BranchSection from './BranchSection';

// Mock BranchPreviewButton so BranchSection tests don't depend on SWR
vi.mock('./BranchPreviewClient', () => ({
  BranchPreviewButton: ({ branch }: { branch: string }) => (
    <div data-testid="preview-btn" data-branch={branch} />
  ),
  BranchPreviewBanner: () => <div data-testid="preview-banner" />,
  default: () => null,
}));

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

// ---------------------------------------------------------------------------
// Phase 14: BranchPreviewButton integration tests
// ---------------------------------------------------------------------------

describe('BranchSection Phase 14: BranchPreviewButton integration', () => {
  const noopHandler = () => {};
  const baseProps = {
    projectDeployedUrl: null,
    isExpanded: false,
    userRole: 'admin' as const,
    currentUserEmail: 'mike@triarchsecurity.com',
    projectSlug: 'truthtreason',
    onToggleSection: noopHandler,
    onToggleRow: noopHandler,
    expandedRowIds: new Set<string>(),
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

  // Test A: branchPreviewEnabled=true + admin → BranchPreviewButton rendered in header
  it('Test A: renders BranchPreviewButton in header when branchPreviewEnabled=true and userRole=admin', () => {
    const section = makeBranchSection({
      branch: 'feat/audio',
      releases: [makeRelease({ branch: 'feat/audio', status: 'dev' })],
    });
    render(
      <BranchSection
        section={section}
        {...baseProps}
        branchPreviewEnabled={true}
      />,
    );
    const btn = screen.getByTestId('preview-btn');
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveAttribute('data-branch', 'feat/audio');
  });

  // Test B: branchPreviewEnabled=false → BranchPreviewButton NOT rendered
  it('Test B: does not render BranchPreviewButton when branchPreviewEnabled=false', () => {
    const section = makeBranchSection({
      branch: 'feat/audio',
      releases: [makeRelease({ branch: 'feat/audio', status: 'dev' })],
    });
    render(
      <BranchSection
        section={section}
        {...baseProps}
        branchPreviewEnabled={false}
      />,
    );
    expect(screen.queryByTestId('preview-btn')).not.toBeInTheDocument();
  });

  // Test C: clicking section toggle still works when BranchPreviewButton is present
  // (button-in-button regression check — toggle should fire independently)
  it('Test C: section toggle fires correctly when BranchPreviewButton is present', async () => {
    const user = userEvent.setup();
    const mockToggle = vi.fn();
    const section = makeBranchSection({
      branch: 'feat/audio',
      releases: [makeRelease({ branch: 'feat/audio', status: 'dev' })],
    });
    render(
      <BranchSection
        section={section}
        {...baseProps}
        branchPreviewEnabled={true}
        onToggleSection={mockToggle}
      />,
    );

    // Click the toggle button (not the preview button)
    // The toggle button has accessible name derived from its text content (branch + relative time)
    const toggleBtn = screen.getByRole('button', { name: /feat\/audio/i });
    await user.click(toggleBtn);
    expect(mockToggle).toHaveBeenCalledWith('feat/audio');
  });
});
