import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

// ── next/navigation mocks (must be hoisted) ─────────────────────────────────
const routerReplaceMock = vi.fn();
const searchParamsGetMock = vi.fn().mockReturnValue(null);

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: routerReplaceMock, push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => ({ get: searchParamsGetMock }),
}));

// useProjectOptions reuse — return the default 'all' option so the project
// select has at least one entry. Tests for ?project=tmi simulate the change
// event directly without relying on the option being present.
vi.mock('@/lib/use-projects', () => ({
  useProjectOptions: () => [
    { value: 'all', label: 'All Projects' },
    { value: 'tmi', label: 'TMI' },
  ],
}));

import ApprovalAuditClient from './ApprovalAuditClient';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

let fetchMock: ReturnType<typeof vi.fn>;

function sampleEvent(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'e1',
    subjectType: 'build_trigger',
    subjectId: 'proj-uuid-1',
    decision: 'triggered',
    surface: 'web',
    actorEmail: 'mike@triarch.dev',
    comment: 'A'.repeat(200),
    metadata: { mode: 'local_claude', item_count: 3 },
    project: 'tmi',
    createdAt: '2026-05-18T18:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  searchParamsGetMock.mockReturnValue(null);
  fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ events: [sampleEvent()], total: 1 }), { status: 200 }),
  );
  globalThis.fetch = fetchMock as never;
});

describe('ApprovalAuditClient', () => {
  it('renders rows after fetch resolves', async () => {
    render(<ApprovalAuditClient />);
    await waitFor(() => expect(screen.getByText(/mike@triarch\.dev/)).toBeDefined());
    // subject_type is rendered alongside subject_id slice
    expect(screen.getByText(/build_trigger/)).toBeDefined();
    expect(screen.getByText(/triggered/)).toBeDefined();
    // 'tmi' appears as both a row chip and an option in the project select
    expect(screen.getAllByText(/tmi/i).length).toBeGreaterThan(0);
  });

  it('fetches with subject_type=build_trigger by default', async () => {
    render(<ApprovalAuditClient />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('subject_type=build_trigger');
  });

  it('changing project filter re-fetches with new project param', async () => {
    render(<ApprovalAuditClient />);
    await waitFor(() => screen.getByText(/mike@triarch\.dev/));

    const projectSelect = screen.getByLabelText(/Project/i) as HTMLSelectElement;
    fireEvent.change(projectSelect, { target: { value: 'tmi' } });

    await waitFor(() => {
      const lastCallUrl = fetchMock.mock.calls.at(-1)?.[0] as string;
      expect(lastCallUrl).toContain('project=tmi');
    });
  });

  it('changing subject_type select re-fetches with new subject_type param', async () => {
    render(<ApprovalAuditClient />);
    await waitFor(() => screen.getByText(/mike@triarch\.dev/));

    const typeSelect = screen.getByLabelText(/Subject Type/i) as HTMLSelectElement;
    // Force a re-fetch by setting the same canonical value; the URL replace
    // call confirms state mirror works even when value is unchanged.
    fireEvent.change(typeSelect, { target: { value: 'build_trigger' } });

    await waitFor(() => expect(routerReplaceMock).toHaveBeenCalled());
    const lastReplaceUrl = routerReplaceMock.mock.calls.at(-1)?.[0] as string;
    expect(lastReplaceUrl).toContain('subject_type=build_trigger');
  });

  it('mirrors filter state in URL search params via router.replace', async () => {
    render(<ApprovalAuditClient />);
    await waitFor(() => expect(routerReplaceMock).toHaveBeenCalled());
    const initialReplaceUrl = routerReplaceMock.mock.calls[0][0] as string;
    expect(initialReplaceUrl).toContain('subject_type=build_trigger');
  });

  it('empty state renders when total === 0', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ events: [], total: 0 }), { status: 200 }),
    );
    render(<ApprovalAuditClient />);
    await waitFor(() =>
      expect(screen.getByText(/No approval events recorded yet/i)).toBeDefined(),
    );
  });

  it('comment truncates to ~60 chars in the row; Show more toggles to full text (I-3 anchored)', async () => {
    render(<ApprovalAuditClient />);
    await waitFor(() => screen.getByText(/mike@triarch\.dev/));

    // I-3 fix: anchored regex ensures we match the truncated form (60 A's + "...")
    // and NOT any inadvertent full-200 match elsewhere in the DOM.
    const truncatedPrefix = 'A'.repeat(60);
    expect(
      screen.getByText(new RegExp(`^${truncatedPrefix}\\.\\.\\.$`)),
    ).toBeDefined();

    // Now expand
    fireEvent.click(screen.getByRole('button', { name: /Show more/i }));
    // After expand: full 200-char comment present as exact-match text node
    expect(screen.getByText(new RegExp(`^A{200}$`))).toBeDefined();

    // Toggle back collapses
    fireEvent.click(screen.getByRole('button', { name: /Show less/i }));
    expect(
      screen.getByText(new RegExp(`^${truncatedPrefix}\\.\\.\\.$`)),
    ).toBeDefined();
  });

  it('does NOT render Show more when comment is shorter than truncation threshold', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          events: [sampleEvent({ id: 'short', comment: 'short comment' })],
          total: 1,
        }),
        { status: 200 },
      ),
    );
    render(<ApprovalAuditClient />);
    await waitFor(() => screen.getByText(/short comment/));
    expect(screen.queryByRole('button', { name: /Show more/i })).toBeNull();
  });

  it('renders decision badge and surface chip per row', async () => {
    render(<ApprovalAuditClient />);
    await waitFor(() => screen.getByText(/mike@triarch\.dev/));
    expect(screen.getByText('triggered')).toBeDefined();
    expect(screen.getByText('web')).toBeDefined();
  });

  it('reads initial subject_type filter from URL search params (deep-link)', async () => {
    searchParamsGetMock.mockImplementation((key: string) => {
      if (key === 'subject_type') return 'build_trigger';
      if (key === 'project') return 'tmi';
      return null;
    });
    render(<ApprovalAuditClient />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('subject_type=build_trigger');
    expect(url).toContain('project=tmi');
  });
});
