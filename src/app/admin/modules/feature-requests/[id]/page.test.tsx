/**
 * Plan 36-05b Task 2 (TDD RED → GREEN):
 * Feature-requests DETAIL page — primary action buttons for inclusion-state transitions.
 *
 * Mirrors bug-reports/[id]/page.test.tsx; targets the entityKind='feature' branch
 * of InclusionActions which dispatches to /api/platform/feature-requests/[id].
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import {
  INCLUSION_STATES,
  canManuallyTransition,
  type InclusionState,
} from '@/lib/inclusion-state';

const refreshMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock, push: vi.fn() }),
}));

function mockFetchOk() {
  const fetchMock = vi.fn(
    async () => new Response(JSON.stringify({ ok: true }), { status: 200 }) as never,
  );
  global.fetch = fetchMock as never;
  return fetchMock;
}

beforeEach(() => {
  refreshMock.mockClear();
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('FeatureDetailPage InclusionActions (Plan 36-05b Task 2)', () => {
  it('Test 1: triaged → renders "Propose for next build" + PATCHes pending_inclusion', async () => {
    const fetchMock = mockFetchOk();
    const { InclusionActions } = await import('./InclusionActions');

    render(
      <InclusionActions
        entityKind="feature"
        entityId="f-1"
        currentState="triaged"
      />,
    );

    const btn = screen.getByRole('button', { name: 'Propose for next build' });
    fireEvent.click(btn);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/platform/feature-requests/f-1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ inclusionState: 'pending_inclusion' }),
        }),
      );
    });
  });

  it('Test 2 (B-3): pending_inclusion → Approve + Defer visible, NO Reject button', async () => {
    mockFetchOk();
    const { InclusionActions } = await import('./InclusionActions');

    render(
      <InclusionActions
        entityKind="feature"
        entityId="f-1"
        currentState="pending_inclusion"
      />,
    );

    expect(screen.getByRole('button', { name: 'Approve for build' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Defer' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /reject/i })).toBeNull();
  });

  it('Test 3: approved_for_build → renders "Remove from build"', async () => {
    mockFetchOk();
    const { InclusionActions } = await import('./InclusionActions');

    render(
      <InclusionActions
        entityKind="feature"
        entityId="f-1"
        currentState="approved_for_build"
      />,
    );

    expect(screen.getByRole('button', { name: 'Remove from build' })).toBeInTheDocument();
  });

  it('Test 4: built and deployed → no action buttons', async () => {
    mockFetchOk();
    const { InclusionActions } = await import('./InclusionActions');

    const { rerender } = render(
      <InclusionActions entityKind="feature" entityId="f-1" currentState="built" />,
    );
    expect(screen.queryAllByRole('button')).toHaveLength(0);

    rerender(
      <InclusionActions entityKind="feature" entityId="f-1" currentState="deployed" />,
    );
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('Test 5: gating — rendered button set exactly matches canManuallyTransition allowed targets', async () => {
    mockFetchOk();
    const { InclusionActions } = await import('./InclusionActions');

    for (const from of INCLUSION_STATES) {
      const expectedTargets = INCLUSION_STATES.filter((t) =>
        canManuallyTransition(from as InclusionState, t),
      );
      const { unmount } = render(
        <InclusionActions entityKind="feature" entityId="f-x" currentState={from} />,
      );
      const buttons = screen.queryAllByRole('button');
      expect(buttons.length).toBe(expectedTargets.length);
      unmount();
    }
  });
});
