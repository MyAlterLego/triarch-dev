import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ---------------------------------------------------------------------------
// Mock SWR
// ---------------------------------------------------------------------------

vi.mock('swr', () => ({
  default: vi.fn(),
}));

import useSWR from 'swr';

// ---------------------------------------------------------------------------
// Mock global.fetch
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();
global.fetch = mockFetch;

// ---------------------------------------------------------------------------
// Import named exports under test (split components)
// ---------------------------------------------------------------------------

import { BranchPreviewBanner, BranchPreviewButton } from './BranchPreviewClient';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SLUG = 'tmi';
const FAH_PROJECT_ID = 'triarch-dev-tmi';
const BRANCH = 'feat/audio';

function idleStatus() {
  return {
    branch: null,
    state: 'idle' as const,
    locked_at: null,
    locked_by: null,
    started_at: null,
    terminal: true,
  };
}

function pendingStatus(branch = 'feat/audio', lockedByEmail = 'mike@x.com', minutesAgo = 2) {
  const lockedAt = new Date(Date.now() - minutesAgo * 60 * 1000).toISOString();
  return {
    branch,
    state: 'PENDING' as const,
    locked_at: lockedAt,
    locked_by: lockedByEmail,
    started_at: lockedAt,
    terminal: false,
  };
}

function succeededStatus(branch = 'feat/audio') {
  return {
    branch,
    state: 'SUCCEEDED' as const,
    locked_at: new Date(Date.now() - 60000).toISOString(),
    locked_by: 'mike@x.com',
    started_at: null,
    terminal: true,
  };
}

function failedStatus(branch = 'feat/audio', errorMessage = 'docker build failed') {
  return {
    branch,
    state: 'FAILED' as const,
    locked_at: new Date(Date.now() - 90000).toISOString(),
    locked_by: 'mike@x.com',
    started_at: null,
    terminal: true,
    errorMessage,
  };
}

function timeoutStatus(branch = 'feat/audio') {
  return {
    branch,
    state: 'timeout' as const,
    locked_at: new Date(Date.now() - 9 * 60 * 1000).toISOString(),
    locked_by: 'mike@x.com',
    started_at: null,
    terminal: true,
  };
}

function mockSWR(data: object | null, extra: Record<string, unknown> = {}) {
  const mutate = vi.fn();
  (useSWR as ReturnType<typeof vi.fn>).mockReturnValue({
    data,
    error: null,
    mutate,
    isLoading: false,
    ...extra,
  });
  return mutate;
}

// ---------------------------------------------------------------------------
// BranchPreviewBanner tests
// ---------------------------------------------------------------------------

describe('BranchPreviewBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  // Test 1: idle — no banner rendered
  it('Test 1: returns null (no banner rendered) when state is idle', () => {
    mockSWR(idleStatus());
    const { container } = render(
      <BranchPreviewBanner projectSlug={SLUG} fahProjectId={FAH_PROJECT_ID} />,
    );
    // Nothing visible
    expect(container.firstChild).toBeNull();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  // Test 2: PENDING — violet halo banner with branch + locked_by + relative time
  it('Test 2: renders violet halo banner with branch, locked_by, and relative time when PENDING', () => {
    mockSWR(pendingStatus('feat/audio', 'mike@x.com', 2));
    render(<BranchPreviewBanner projectSlug={SLUG} fahProjectId={FAH_PROJECT_ID} />);

    const bannerEl = screen.getByRole('status');
    expect(bannerEl.textContent).toMatch(/feat\/audio/i);
    expect(bannerEl.textContent).toMatch(/currently previewing/i);
    expect(bannerEl.textContent).toMatch(/mike@x\.com/i);
    expect(bannerEl.textContent).toMatch(/2 min ago/i);
  });

  // Test 3: SUCCEEDED — emerald success pill
  it('Test 3: renders emerald success pill when SUCCEEDED', () => {
    mockSWR(succeededStatus('feat/audio'));
    render(<BranchPreviewBanner projectSlug={SLUG} fahProjectId={FAH_PROJECT_ID} />);

    const pill = screen.getByText(/preview ready/i).closest('div')!;
    expect(pill).toBeTruthy();
    expect(pill.textContent).toMatch(/feat\/audio/i);
  });

  // Test 4: FAILED — red error pill with FAH console link when fahProjectId provided
  it('Test 4: renders red error pill with errorMessage and FAH console link when FAILED', () => {
    mockSWR(failedStatus('feat/audio', 'docker build failed'));
    render(<BranchPreviewBanner projectSlug={SLUG} fahProjectId={FAH_PROJECT_ID} />);

    expect(screen.getByText(/docker build failed/i)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /view in firebase console/i });
    expect(link).toHaveAttribute(
      'href',
      `https://console.firebase.google.com/project/${FAH_PROJECT_ID}/apphosting`,
    );
  });

  // Test 5: timeout — amber timeout pill
  it('Test 5: renders amber timeout pill when state is timeout', () => {
    mockSWR(timeoutStatus('feat/audio'));
    render(<BranchPreviewBanner projectSlug={SLUG} fahProjectId={FAH_PROJECT_ID} />);

    expect(
      screen.getByText(/preview did not complete in 8 minutes — preview slot was reset/i),
    ).toBeInTheDocument();
  });

  // Test 6: banner shown to BOTH admin and viewer (no role prop on Banner)
  it('Test 6: banner is informational — renders identically regardless of caller (no role gating)', () => {
    // Banner has no userRole prop — renders identically for any consumer
    // Confirm it renders the pending banner with no role-based hiding
    mockSWR(pendingStatus('feat/audio', 'mike@x.com', 1));
    const { container } = render(
      <BranchPreviewBanner projectSlug={SLUG} fahProjectId={null} />,
    );
    // Banner renders (role-agnostic)
    expect(container.firstChild).not.toBeNull();
    const bannerEl = screen.getByRole('status');
    expect(bannerEl).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// BranchPreviewButton tests
// ---------------------------------------------------------------------------

describe('BranchPreviewButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  // Test 7: admin idle — renders "Preview {branch}" button enabled
  it('Test 7: renders enabled Preview button for admin in idle state', () => {
    mockSWR(idleStatus());
    render(
      <BranchPreviewButton projectSlug={SLUG} branch={BRANCH} userRole="admin" />,
    );

    const btn = screen.getByRole('button', { name: /preview this branch/i });
    expect(btn).toBeInTheDocument();
    expect(btn).not.toBeDisabled();
    expect(btn.textContent).toMatch(/feat\/audio/i);
  });

  // Test 8: admin in-flight — button disabled with tooltip
  it('Test 8: disables button with tooltip when a swap is in flight', () => {
    mockSWR(pendingStatus('feat/audio', 'mike@x.com', 1));
    render(
      <BranchPreviewButton projectSlug={SLUG} branch={BRANCH} userRole="admin" />,
    );

    const btn = screen.getByRole('button', { name: /preview this branch/i });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('title', 'A preview swap is in flight; please wait');
  });

  // Test 9: admin clicks button — POSTs to /api/projects/{slug}/branch/preview then mutates SWR
  it('Test 9: fires POST and calls mutate after successful 202 response', async () => {
    const user = userEvent.setup();
    const mutate = mockSWR(idleStatus());
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 202,
      json: async () => ({ rolloutName: 'projects/p/rollouts/r1', state: 'PENDING' }),
    });

    render(
      <BranchPreviewButton projectSlug={SLUG} branch={BRANCH} userRole="admin" />,
    );

    const btn = screen.getByRole('button', { name: /preview this branch/i });
    await user.click(btn);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        `/api/projects/${SLUG}/branch/preview`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ branch: BRANCH }),
        }),
      );
      expect(mutate).toHaveBeenCalled();
    });
  });

  // Test 10: viewer — button NOT rendered
  it('Test 10: returns null for viewer role', () => {
    mockSWR(idleStatus());
    const { container } = render(
      <BranchPreviewButton projectSlug={SLUG} branch={BRANCH} userRole="viewer" />,
    );
    expect(container.firstChild).toBeNull();
    expect(screen.queryByRole('button', { name: /preview this branch/i })).not.toBeInTheDocument();
  });

  // Test 11: 409 conflict — toast surfaces "Another preview is already in flight"
  it('Test 11: surfaces 409 toast "Another preview is already in flight"', async () => {
    const user = userEvent.setup();
    mockSWR(idleStatus());
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({
        error: 'lock_held',
        current_branch: 'feat/font',
        locked_by: 'other@x.com',
      }),
    });

    render(
      <BranchPreviewButton projectSlug={SLUG} branch={BRANCH} userRole="admin" />,
    );

    const btn = screen.getByRole('button', { name: /preview this branch/i });
    await user.click(btn);

    await waitFor(() => {
      expect(screen.getByText(/another preview is already in flight/i)).toBeInTheDocument();
    });
  });

  // Test 12: 502 dispatch failed — toast surfaces "Preview dispatch failed: {detail}"
  it('Test 12: surfaces 502 toast "Preview dispatch failed: {detail}"', async () => {
    const user = userEvent.setup();
    mockSWR(idleStatus());
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 502,
      json: async () => ({ error: 'fah_dispatch_failed', detail: 'build error' }),
    });

    render(
      <BranchPreviewButton projectSlug={SLUG} branch={BRANCH} userRole="admin" />,
    );

    const btn = screen.getByRole('button', { name: /preview this branch/i });
    await user.click(btn);

    await waitFor(() => {
      expect(screen.getByText(/preview dispatch failed/i)).toBeInTheDocument();
    });
  });

  // Test 13: SWR deduplication — mounting two BranchPreviewButton + one BranchPreviewBanner
  // does NOT cause more than one fetch in a single tick (SWR dedup via shared cache key)
  it('Test 13: mounting BranchPreviewBanner + 2 BranchPreviewButton instances calls useSWR with same key', () => {
    // All three components should call useSWR with the same cache key
    mockSWR(idleStatus());

    render(
      <>
        <BranchPreviewBanner projectSlug={SLUG} fahProjectId={null} />
        <BranchPreviewButton projectSlug={SLUG} branch="feat/audio" userRole="admin" />
        <BranchPreviewButton projectSlug={SLUG} branch="feat/font" userRole="admin" />
      </>,
    );

    // useSWR should have been called 3 times (once per component)
    // but always with the SAME cache key — ensuring SWR deduplication applies
    const swrCalls = (useSWR as ReturnType<typeof vi.fn>).mock.calls;
    expect(swrCalls.length).toBe(3);

    const keys = swrCalls.map((call: unknown[]) => call[0]);
    const uniqueKeys = new Set(keys);
    expect(uniqueKeys.size).toBe(1);
    expect(uniqueKeys.has(`/api/projects/${SLUG}/branch/preview/status`)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Back-compat: default export BranchPreviewClient shim
// ---------------------------------------------------------------------------

import BranchPreviewClientDefault from './BranchPreviewClient';

describe('BranchPreviewClient default export (back-compat shim)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without error (shim composes Banner + Buttons)', () => {
    mockSWR(idleStatus());
    render(
      <BranchPreviewClientDefault
        projectSlug={SLUG}
        userRole="admin"
        branches={['main', 'feat/audio']}
        fahProjectId={FAH_PROJECT_ID}
      />,
    );
    // Admin + 2 branches → 2 preview buttons
    const buttons = screen.getAllByRole('button', { name: /preview this branch/i });
    expect(buttons).toHaveLength(2);
  });
});
