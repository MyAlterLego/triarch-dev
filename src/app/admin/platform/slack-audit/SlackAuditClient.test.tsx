/**
 * Wave 0 RED stubs for SlackAuditClient component.
 * Source SlackAuditClient.tsx does NOT exist yet; tests must fail until plan 07-05 lands.
 *
 * Covers:
 * - Renders rows with action_id, actor_email, response_status, latency_ms columns
 * - Filter input change updates URL search params
 * - Load-more button appends rows; hidden when hasMore=false
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

const pushMock = vi.fn();
const useSearchParamsMock = vi.fn(() => new URLSearchParams());

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: pushMock }),
  useSearchParams: () => useSearchParamsMock(),
}));

beforeEach(() => {
  pushMock.mockReset();
  useSearchParamsMock.mockReset();
  useSearchParamsMock.mockReturnValue(new URLSearchParams());
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ rows: [], hasMore: false }),
  }) as never;
});

const sampleRows = [
  {
    id: 'r1',
    actionId: 'slack_promote',
    actorEmail: 'mike@triarchsecurity.com',
    actorSlackId: 'U_STAFF',
    payloadHash: 'a'.repeat(64),
    responseStatus: 200,
    latencyMs: 42,
    createdAt: new Date('2026-05-05T10:00:00Z').toISOString(),
  },
];

describe('SlackAuditClient', () => {
  it('renders row data with action_id, actor_email, response_status, latency_ms', async () => {
    const { default: SlackAuditClient } = await import('@/app/admin/platform/slack-audit/SlackAuditClient');
    render(<SlackAuditClient initialRows={sampleRows} initialHasMore={false} />);
    expect(screen.getByText('slack_promote')).toBeInTheDocument();
    expect(screen.getByText(/mike@triarchsecurity\.com/)).toBeInTheDocument();
    expect(screen.getByText(/200/)).toBeInTheDocument();
    expect(screen.getByText(/42/)).toBeInTheDocument();
  });

  it('typing in actor_email filter updates URL search params', async () => {
    const { default: SlackAuditClient } = await import('@/app/admin/platform/slack-audit/SlackAuditClient');
    render(<SlackAuditClient initialRows={sampleRows} initialHasMore={false} />);
    const emailInput = screen.getByLabelText(/email|actor/i);
    fireEvent.change(emailInput, { target: { value: 'mike' } });
    await waitFor(() => {
      expect(pushMock).toHaveBeenCalled();
    });
    const calledWith = String(pushMock.mock.calls[pushMock.mock.calls.length - 1][0]);
    expect(calledWith).toMatch(/email=mike/);
  });

  it('hides load-more button when initialHasMore is false', async () => {
    const { default: SlackAuditClient } = await import('@/app/admin/platform/slack-audit/SlackAuditClient');
    render(<SlackAuditClient initialRows={sampleRows} initialHasMore={false} />);
    expect(screen.queryByRole('button', { name: /load more/i })).toBeNull();
  });

  it('shows load-more button when initialHasMore is true and appends rows on click', async () => {
    const newRows = [
      { ...sampleRows[0], id: 'r2', actionId: 'slack_reject' },
    ];
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ rows: newRows, hasMore: false }),
    }) as never;

    const { default: SlackAuditClient } = await import('@/app/admin/platform/slack-audit/SlackAuditClient');
    render(<SlackAuditClient initialRows={sampleRows} initialHasMore={true} />);
    const btn = screen.getByRole('button', { name: /load more/i });
    fireEvent.click(btn);
    await waitFor(() => {
      expect(screen.getByText('slack_reject')).toBeInTheDocument();
    });
  });
});
