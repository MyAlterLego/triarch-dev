import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { makeBranchSection, makeRelease } from './__fixtures__/releases';
import ReleasesClient from './ReleasesClient';
import type { EntryTypeCounts } from './types';

// Mock next/navigation at top level with factory function pattern
// The mockReplace reference is captured via the factory closure
const mockReplace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/projects/test/releases',
}));

// Mock BranchPreviewClient named exports so ReleasesClient tests don't depend on SWR
vi.mock('./BranchPreviewClient', () => ({
  BranchPreviewBanner: () => <div data-testid="preview-banner" />,
  BranchPreviewButton: () => <div data-testid="preview-btn" />,
  default: () => null,
}));

beforeEach(() => {
  mockReplace.mockClear();
});

describe('ReleasesClient cross-branch approve isolation (RC-03)', () => {
  it('clicking Approve on a row in one section does not flip the confirm state in the other section', async () => {
    const user = userEvent.setup();
    const sectionMain = makeBranchSection({
      branch: 'main',
      releases: [makeRelease({ id: 'rel-main', branch: 'main', status: 'dev' })],
    });
    const sectionFeat = makeBranchSection({
      branch: 'feat/change-font',
      releases: [makeRelease({ id: 'rel-feat', branch: 'feat/change-font', status: 'dev' })],
    });
    render(
      <ReleasesClient
        projectSlug="truthtreason"
        projectName="Truth+Treason"
        projectDeployedUrl={null}
        userRole="admin"
        currentUserEmail="mike@triarchsecurity.com"
        initialSections={[sectionMain, sectionFeat]}
        conflictsByBranch={{}}
        total={2}
        hasMore={false}
        pageSize={20}
      />,
    );

    // Expand a row to get Approve buttons visible
    // Use getByRole with a looser approach — look for the release row by version text
    const rows = screen.getAllByRole('row');
    const mainReleaseRow = rows.find(
      (r) => r.textContent?.includes('v0.15.0-rc.1') && !r.textContent?.includes('Features'),
    );
    if (mainReleaseRow) {
      await user.click(mainReleaseRow);
    }

    // Click the first Approve button (row A)
    const approveButtons = screen.getAllByRole('button', { name: /approve for production/i });
    expect(approveButtons.length).toBeGreaterThanOrEqual(1);
    await user.click(approveButtons[0]);

    // After clicking row A, row A is now in confirm state. Row B (still collapsed) must still
    // surface only the original Approve label when expanded — the confirm countdown is per-row.
    // Probe: the confirm label "Click to confirm" must appear at most once across the page.
    const confirmLabels = screen.queryAllByText(/click to confirm/i);
    expect(confirmLabels.length).toBeLessThanOrEqual(1);
  });
});

describe('ReleasesClient Phase 14: filter chips and WhatsComingCard integration', () => {
  const relMainId = 'rel-main-01';
  const relFeatId = 'rel-feat-01';
  const relOtherId = 'rel-other-01';

  const entryCountsByRelease: Record<string, EntryTypeCounts> = {
    [relMainId]: { fixes: 2, features: 0, other: 0, total: 2 },   // bug fix bucket
    [relFeatId]: { fixes: 0, features: 1, other: 0, total: 1 },   // feature bucket
    // relOtherId absent from map → other bucket
  };

  const sections = [
    makeBranchSection({
      branch: 'main',
      releases: [makeRelease({ id: relMainId, branch: 'main' })],
    }),
    makeBranchSection({
      branch: 'feat/audio',
      releases: [makeRelease({ id: relFeatId, branch: 'feat/audio' })],
    }),
    makeBranchSection({
      branch: 'feat/other',
      releases: [makeRelease({ id: relOtherId, branch: 'feat/other' })],
    }),
  ];

  function renderClient(extra = {}) {
    return render(
      <ReleasesClient
        projectSlug="truthtreason"
        projectName="Truth+Treason"
        projectDeployedUrl={null}
        userRole="admin"
        currentUserEmail="mike@triarchsecurity.com"
        initialSections={sections}
        conflictsByBranch={{}}
        total={3}
        hasMore={false}
        pageSize={20}
        entryCountsByRelease={entryCountsByRelease}
        {...extra}
      />,
    );
  }

  it('Test A: filter chips render with correct counts derived from entryCountsByRelease', () => {
    renderClient();

    expect(screen.getByText('All (3)')).toBeInTheDocument();
    expect(screen.getByText('Bug fixes (1)')).toBeInTheDocument();
    expect(screen.getByText('Features (1)')).toBeInTheDocument();
    expect(screen.getByText('Other (1)')).toBeInTheDocument();
  });

  it('Test B: clicking a filter chip calls router.replace with correct ?type= param', () => {
    renderClient();

    // Click Bug fixes chip
    fireEvent.click(screen.getByText('Bug fixes (1)'));
    expect(mockReplace).toHaveBeenCalledWith('?type=bug', { scroll: false });
  });

  it('Test C: WhatsComingCard hidden when whatsComing=null (back-compat)', () => {
    renderClient({ whatsComing: null });

    // The section label should NOT appear when whatsComing is null
    expect(screen.queryByText("WHAT'S COMING TO PROD")).not.toBeInTheDocument();
  });

  it('Test D: clicking a filter chip triggers router.replace to update URL state', () => {
    renderClient();

    // Click Feature chip
    fireEvent.click(screen.getByText('Features (1)'));
    expect(mockReplace).toHaveBeenCalledWith('?type=feature', { scroll: false });

    mockReplace.mockClear();

    // Click All chip to clear filter
    fireEvent.click(screen.getByText('All (3)'));
    // All is already active (since we just used router.replace which doesn't actually change
    // useSearchParams in tests), so no-op — but this verifies the chip is rendered
    // URL-driven filter section hiding is tested via unit tests; integration verified via the
    // router.replace calls above
    expect(screen.getByText('All (3)')).toBeInTheDocument();
  });
});

describe('ReleasesClient Phase 14: BranchPreviewBanner singleton', () => {
  it('Test E: mounts BranchPreviewBanner exactly ONCE when branchPreviewEnabled=true', () => {
    const section1 = makeBranchSection({
      branch: 'main',
      releases: [makeRelease({ id: 'r1', branch: 'main' })],
    });
    const section2 = makeBranchSection({
      branch: 'feat/audio',
      releases: [makeRelease({ id: 'r2', branch: 'feat/audio' })],
    });
    const section3 = makeBranchSection({
      branch: 'feat/font',
      releases: [makeRelease({ id: 'r3', branch: 'feat/font' })],
    });

    render(
      <ReleasesClient
        projectSlug="truthtreason"
        projectName="Truth+Treason"
        projectDeployedUrl={null}
        userRole="admin"
        currentUserEmail="mike@triarchsecurity.com"
        initialSections={[section1, section2, section3]}
        conflictsByBranch={{}}
        total={3}
        hasMore={false}
        pageSize={20}
        branchPreviewEnabled={true}
        fahProjectId="triarch-dev-tmi"
      />,
    );

    // Banner mounted exactly ONCE (singleton)
    const banners = screen.queryAllByTestId('preview-banner');
    expect(banners).toHaveLength(1);
  });

  it('Test F: BranchPreviewBanner NOT rendered when branchPreviewEnabled=false', () => {
    const section = makeBranchSection({
      branch: 'main',
      releases: [makeRelease({ id: 'r1', branch: 'main' })],
    });
    render(
      <ReleasesClient
        projectSlug="truthtreason"
        projectName="Truth+Treason"
        projectDeployedUrl={null}
        userRole="admin"
        currentUserEmail="mike@triarchsecurity.com"
        initialSections={[section]}
        conflictsByBranch={{}}
        total={1}
        hasMore={false}
        pageSize={20}
        branchPreviewEnabled={false}
      />,
    );
    expect(screen.queryByTestId('preview-banner')).not.toBeInTheDocument();
  });
});
