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
// Import component under test
// ---------------------------------------------------------------------------

import BranchPreviewClient from './BranchPreviewClient';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BRANCHES = ['main', 'feat/audio', 'feat/font'];
const SLUG = 'tmi';
const FAH_PROJECT_ID = 'triarch-dev-tmi';

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
// Tests
// ---------------------------------------------------------------------------

describe('BranchPreviewClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  // 1. Idle render with N branches — admin sees N enabled Preview buttons, no banner
  it('renders N enabled Preview buttons for each branch in idle state (admin)', () => {
    mockSWR(idleStatus());
    render(
      <BranchPreviewClient
        projectSlug={SLUG}
        userRole="admin"
        branches={BRANCHES}
        fahProjectId={FAH_PROJECT_ID}
      />,
    );

    const buttons = screen.getAllByRole('button', { name: /preview this branch/i });
    expect(buttons).toHaveLength(BRANCHES.length);
    buttons.forEach((btn) => expect(btn).not.toBeDisabled());
    // No in-flight banner
    expect(screen.queryByText(/currently previewing/i)).not.toBeInTheDocument();
  });

  // 2. PENDING all-disabled + banner
  it('shows in-flight banner and disables all Preview buttons when PENDING', () => {
    mockSWR(pendingStatus('feat/audio', 'mike@x.com', 2));
    render(
      <BranchPreviewClient
        projectSlug={SLUG}
        userRole="admin"
        branches={BRANCHES}
        fahProjectId={FAH_PROJECT_ID}
      />,
    );

    // Banner should mention the branch name, the locker email, and a relative time
    expect(screen.getByText(/feat\/audio currently previewing/i)).toBeInTheDocument();
    expect(screen.getByText(/mike@x\.com/i)).toBeInTheDocument();
    expect(screen.getByText(/2 min ago/i)).toBeInTheDocument();

    // ALL Preview buttons must be disabled
    const buttons = screen.getAllByRole('button', { name: /preview this branch/i });
    expect(buttons).toHaveLength(BRANCHES.length);
    buttons.forEach((btn) => {
      expect(btn).toBeDisabled();
      expect(btn).toHaveAttribute('title', 'A preview swap is in flight; please wait');
    });
  });

  // 3. SUCCEEDED transient pill — success pill visible + buttons re-enabled
  it('shows success pill and re-enables buttons when SUCCEEDED', () => {
    mockSWR(succeededStatus('feat/audio'));
    render(
      <BranchPreviewClient
        projectSlug={SLUG}
        userRole="admin"
        branches={BRANCHES}
        fahProjectId={FAH_PROJECT_ID}
      />,
    );

    expect(screen.getByText(/preview ready/i)).toBeInTheDocument();
    expect(screen.getByText(/feat\/audio/i)).toBeInTheDocument();

    // Buttons re-enabled (terminal state)
    const buttons = screen.getAllByRole('button', { name: /preview this branch/i });
    buttons.forEach((btn) => expect(btn).not.toBeDisabled());
  });

  // 4. FAILED pill with FAH console deep-link
  it('shows error pill with errorMessage and FAH console link when FAILED', () => {
    mockSWR(failedStatus('feat/audio', 'docker build failed'));
    render(
      <BranchPreviewClient
        projectSlug={SLUG}
        userRole="admin"
        branches={BRANCHES}
        fahProjectId={FAH_PROJECT_ID}
      />,
    );

    expect(screen.getByText(/docker build failed/i)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /view in firebase console/i });
    expect(link).toHaveAttribute(
      'href',
      `https://console.firebase.google.com/project/${FAH_PROJECT_ID}/apphosting`,
    );
  });

  // 5. Timeout pill
  it('shows timeout pill when state is timeout', () => {
    mockSWR(timeoutStatus('feat/audio'));
    render(
      <BranchPreviewClient
        projectSlug={SLUG}
        userRole="admin"
        branches={BRANCHES}
        fahProjectId={FAH_PROJECT_ID}
      />,
    );

    expect(
      screen.getByText(/preview did not complete in 8 minutes — preview slot was reset/i),
    ).toBeInTheDocument();

    // Buttons re-enabled (terminal state)
    const buttons = screen.getAllByRole('button', { name: /preview this branch/i });
    buttons.forEach((btn) => expect(btn).not.toBeDisabled());
  });

  // 6. Click → POST → mutate (202 happy path)
  it('fires POST and calls mutate after successful 202 response', async () => {
    const user = userEvent.setup();
    const mutate = mockSWR(idleStatus());
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 202,
      json: async () => ({ rolloutName: 'projects/p/rollouts/r1', state: 'PENDING' }),
    });

    render(
      <BranchPreviewClient
        projectSlug={SLUG}
        userRole="admin"
        branches={BRANCHES}
        fahProjectId={FAH_PROJECT_ID}
      />,
    );

    // Find and click the Preview button for 'feat/audio'
    const buttons = screen.getAllByRole('button', { name: /preview this branch/i });
    // Button index 1 corresponds to 'feat/audio' (second branch)
    await user.click(buttons[1]);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        `/api/projects/${SLUG}/branch/preview`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ branch: 'feat/audio' }),
        }),
      );
      expect(mutate).toHaveBeenCalled();
    });
  });

  // 7. 409 toast — lock_held → toast 'Another preview is already in flight'
  it('surfaces a 409 toast when another preview is already in flight', async () => {
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
      <BranchPreviewClient
        projectSlug={SLUG}
        userRole="admin"
        branches={BRANCHES}
        fahProjectId={FAH_PROJECT_ID}
      />,
    );

    const buttons = screen.getAllByRole('button', { name: /preview this branch/i });
    await user.click(buttons[0]);

    await waitFor(() => {
      expect(
        screen.getByText(/another preview is already in flight/i),
      ).toBeInTheDocument();
    });
  });

  // 8. Non-admin (viewer) — no Preview buttons rendered; banner still shows if in-flight
  it('renders no Preview buttons for viewer role', () => {
    mockSWR(idleStatus());
    render(
      <BranchPreviewClient
        projectSlug={SLUG}
        userRole="viewer"
        branches={BRANCHES}
        fahProjectId={FAH_PROJECT_ID}
      />,
    );

    const buttons = screen.queryAllByRole('button', { name: /preview this branch/i });
    expect(buttons).toHaveLength(0);
  });

  it('shows informational banner for viewer when a swap is in flight (PREV-04)', () => {
    mockSWR(pendingStatus('feat/audio', 'mike@x.com', 1));
    render(
      <BranchPreviewClient
        projectSlug={SLUG}
        userRole="viewer"
        branches={BRANCHES}
        fahProjectId={FAH_PROJECT_ID}
      />,
    );

    // Banner still renders (informational for viewer)
    expect(screen.getByText(/feat\/audio currently previewing/i)).toBeInTheDocument();
    // But NO action buttons
    expect(screen.queryAllByRole('button', { name: /preview this branch/i })).toHaveLength(0);
  });

  // 9. 502 toast
  it('surfaces a 502 toast with dispatch failed message', async () => {
    const user = userEvent.setup();
    mockSWR(idleStatus());
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 502,
      json: async () => ({ error: 'fah_dispatch_failed', detail: 'build error' }),
    });

    render(
      <BranchPreviewClient
        projectSlug={SLUG}
        userRole="admin"
        branches={BRANCHES}
        fahProjectId={FAH_PROJECT_ID}
      />,
    );

    const buttons = screen.getAllByRole('button', { name: /preview this branch/i });
    await user.click(buttons[0]);

    await waitFor(() => {
      expect(screen.getByText(/preview dispatch failed/i)).toBeInTheDocument();
    });
  });

  // 10. 400 toast — invalid_branch
  it('surfaces a 400 toast with branch-not-allowed message', async () => {
    const user = userEvent.setup();
    mockSWR(idleStatus());
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: 'invalid_branch' }),
    });

    render(
      <BranchPreviewClient
        projectSlug={SLUG}
        userRole="admin"
        branches={BRANCHES}
        fahProjectId={FAH_PROJECT_ID}
      />,
    );

    const buttons = screen.getAllByRole('button', { name: /preview this branch/i });
    await user.click(buttons[0]);

    await waitFor(() => {
      expect(screen.getByText(/branch name not allowed/i)).toBeInTheDocument();
    });
  });
});
