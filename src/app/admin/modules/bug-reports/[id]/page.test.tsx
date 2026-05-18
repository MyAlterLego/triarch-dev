/**
 * Plan 36-05b Task 2 (TDD RED → GREEN):
 * Bug-reports DETAIL page — primary action buttons for inclusion-state transitions.
 *
 * The detail page is a Server Component; the per-state action buttons live in a
 * Client Component (`InclusionActions`). We test the Client Component directly
 * because that's where the canManuallyTransition gating + PATCH wiring lives.
 * The RSC's job is to fetch the row and hand inclusionState + id down — nothing
 * to test about button rendering at the server layer.
 *
 * Coverage:
 *  1. triaged → renders "Propose for next build" → PATCH `{inclusionState: 'pending_inclusion'}`
 *  2. pending_inclusion → renders Approve + Defer; does NOT render any Reject button (B-3)
 *  3. approved_for_build → renders "Remove from build"
 *  4. built / deployed → no action buttons rendered (terminal manual states)
 *  5. Gating: rendered buttons exactly match canManuallyTransition allowed targets
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import {
  INCLUSION_STATES,
  canManuallyTransition,
  type InclusionState,
} from '@/lib/inclusion-state';

// Silence Next.js router (the Client Component calls router.refresh() after PATCH).
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

describe('BugDetailPage InclusionActions (Plan 36-05b Task 2)', () => {
  it('Test 1: triaged → renders "Propose for next build" + PATCHes pending_inclusion', async () => {
    const fetchMock = mockFetchOk();
    const { InclusionActions } = await import('./InclusionActions');

    render(
      <InclusionActions
        entityKind="bug"
        entityId="b-1"
        currentState="triaged"
      />,
    );

    const btn = screen.getByRole('button', { name: 'Propose for next build' });
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/platform/bug-reports/b-1',
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
        entityKind="bug"
        entityId="b-1"
        currentState="pending_inclusion"
      />,
    );

    expect(screen.getByRole('button', { name: 'Approve for build' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Defer' })).toBeInTheDocument();
    // B-3 enforcement: no Reject button anywhere
    expect(screen.queryByRole('button', { name: /reject/i })).toBeNull();
  });

  it('Test 3: approved_for_build → renders "Remove from build"', async () => {
    mockFetchOk();
    const { InclusionActions } = await import('./InclusionActions');

    render(
      <InclusionActions
        entityKind="bug"
        entityId="b-1"
        currentState="approved_for_build"
      />,
    );

    expect(screen.getByRole('button', { name: 'Remove from build' })).toBeInTheDocument();
  });

  it('Test 4: built and deployed → no action buttons (terminal manual states)', async () => {
    mockFetchOk();
    const { InclusionActions } = await import('./InclusionActions');

    const { rerender } = render(
      <InclusionActions entityKind="bug" entityId="b-1" currentState="built" />,
    );
    expect(screen.queryAllByRole('button')).toHaveLength(0);

    rerender(
      <InclusionActions entityKind="bug" entityId="b-1" currentState="deployed" />,
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
        <InclusionActions entityKind="bug" entityId="b-x" currentState={from} />,
      );
      const buttons = screen.queryAllByRole('button');
      expect(
        buttons.length,
        `state=${from} expected ${expectedTargets.length} buttons, got ${buttons.length}`,
      ).toBe(expectedTargets.length);
      unmount();
    }
  });
});
