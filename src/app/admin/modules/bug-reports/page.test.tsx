/**
 * Plan 36-05b Task 1 (TDD RED → GREEN):
 * Bug-reports LIST page — Inclusion column + dropdown action + inclusion filter.
 *
 * Coverage:
 *  1. Inclusion column renders with color-coded pills.
 *  2. Dropdown action triggers PATCH with `{inclusionState: 'pending_inclusion'}`.
 *  3. Dropdown gates by canManuallyTransition (bug in 'built' has no actions).
 *  4. Dropdown EXCLUDES 'rejected' option (B-3 enforcement via canManuallyTransition).
 *  5. Inclusion filter dropdown sends `?inclusion_state=` URL param.
 *  6. Back-compat: existing status filter still works alongside inclusion filter.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import React from 'react';

vi.mock('@/lib/use-projects', () => ({
  useProjectOptions: () => [
    { value: 'all', label: 'All Projects' },
    { value: 'tmi', label: 'TMI' },
  ],
}));

interface FakeBug {
  id: string;
  project: string;
  reportedByName: string | null;
  reportedByEmail: string | null;
  title: string;
  description: string;
  stepsToReproduce: string | null;
  severity: string;
  priority: string;
  status: string;
  triarchNotes: string | null;
  fixVersion: string | null;
  createdAt: string;
  updatedAt: string;
  inclusionState: string;
}

const makeBug = (overrides: Partial<FakeBug> = {}): FakeBug => ({
  id: 'bug-1',
  project: 'tmi',
  reportedByName: 'Reporter',
  reportedByEmail: 'reporter@example.com',
  title: 'Test bug',
  description: 'Repro',
  stepsToReproduce: null,
  severity: 'high',
  priority: 'fix_later',
  status: 'triaged',
  triarchNotes: null,
  fixVersion: null,
  createdAt: '2026-05-18T00:00:00Z',
  updatedAt: '2026-05-18T00:00:00Z',
  inclusionState: 'triaged',
  ...overrides,
});

function mockFetchWithBugs(bugs: FakeBug[]) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (init?.method === 'PATCH') {
      return new Response(JSON.stringify({ ok: true }), { status: 200 }) as never;
    }
    if (url.startsWith('/api/platform/bug-reports')) {
      return {
        ok: true,
        json: async () => ({ bugs, total: bugs.length }),
      } as never;
    }
    return { ok: true, json: async () => ({}) } as never;
  });
  global.fetch = fetchMock as never;
  return fetchMock;
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('BugReportsPage — Inclusion column + dropdown + filter (Plan 36-05b Task 1)', () => {
  it('Test 1: renders Inclusion column with color-coded pills per row', async () => {
    mockFetchWithBugs([
      makeBug({ id: 'b-triaged', title: 'Triaged bug', inclusionState: 'triaged' }),
      makeBug({ id: 'b-approved', title: 'Approved bug', inclusionState: 'approved_for_build' }),
      makeBug({ id: 'b-built', title: 'Built bug', inclusionState: 'built' }),
    ]);

    const { default: Page } = await import('./page');
    render(<Page />);

    await waitFor(() => {
      expect(screen.getByText('Triaged bug')).toBeInTheDocument();
    });

    // Inclusion pills present with palette classes from CONTEXT D-UI.
    // Disambiguate "approved for build" (which also appears as a dropdown option label)
    // by filtering to <span> elements that carry the pill palette class.
    const approvedMatches = screen
      .getAllByText('approved for build')
      .filter((el) => el.tagName === 'SPAN' && /violet-500\/20/.test(el.className));
    expect(approvedMatches.length).toBeGreaterThanOrEqual(1);

    const builtMatches = screen
      .getAllByText('built')
      .filter((el) => el.tagName === 'SPAN' && /teal-500\/20/.test(el.className));
    expect(builtMatches.length).toBeGreaterThanOrEqual(1);
  });

  it('Test 2: dropdown action on triaged bug PATCHes with {inclusionState: "pending_inclusion"}', async () => {
    const bugs = [makeBug({ id: 'b-1', inclusionState: 'triaged' })];
    const fetchMock = mockFetchWithBugs(bugs);

    const { default: Page } = await import('./page');
    render(<Page />);

    await waitFor(() => expect(screen.getByText('Test bug')).toBeInTheDocument());

    // The per-row inclusion action dropdown — find by aria-label
    const dropdown = screen.getByLabelText('Set inclusion state for bug b-1') as HTMLSelectElement;
    fireEvent.change(dropdown, { target: { value: 'pending_inclusion' } });

    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find(
        (c) => (c[1] as RequestInit | undefined)?.method === 'PATCH',
      );
      expect(patchCall).toBeDefined();
      expect(patchCall![0]).toBe('/api/platform/bug-reports/b-1');
      expect(JSON.parse((patchCall![1] as RequestInit).body as string)).toEqual({
        inclusionState: 'pending_inclusion',
      });
    });
  });

  it('Test 3: dropdown for built bug shows no manual transition targets', async () => {
    mockFetchWithBugs([makeBug({ id: 'b-built', inclusionState: 'built' })]);

    const { default: Page } = await import('./page');
    render(<Page />);

    await waitFor(() => expect(screen.getByText('Test bug')).toBeInTheDocument());

    const dropdown = screen.getByLabelText('Set inclusion state for bug b-built') as HTMLSelectElement;
    // Only placeholder option present (no transitions allowed from 'built')
    const targets = within(dropdown).queryAllByRole('option')
      .map((o) => (o as HTMLOptionElement).value)
      .filter((v) => v !== '');
    expect(targets).toEqual([]);
  });

  it('Test 4 (B-3): dropdown for pending_inclusion does NOT include rejected option', async () => {
    mockFetchWithBugs([makeBug({ id: 'b-pi', inclusionState: 'pending_inclusion' })]);

    const { default: Page } = await import('./page');
    render(<Page />);

    await waitFor(() => expect(screen.getByText('Test bug')).toBeInTheDocument());

    const dropdown = screen.getByLabelText('Set inclusion state for bug b-pi') as HTMLSelectElement;
    const targets = within(dropdown).queryAllByRole('option')
      .map((o) => (o as HTMLOptionElement).value)
      .filter((v) => v !== '');
    expect(targets).toContain('approved_for_build');
    expect(targets).toContain('deferred');
    expect(targets).not.toContain('rejected');
  });

  it('Test 5: inclusion filter dropdown sends ?inclusion_state= URL param', async () => {
    const fetchMock = mockFetchWithBugs([]);

    const { default: Page } = await import('./page');
    render(<Page />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const filter = screen.getByLabelText('Filter by inclusion state') as HTMLSelectElement;
    fireEvent.change(filter, { target: { value: 'approved_for_build' } });

    await waitFor(() => {
      const filterCall = fetchMock.mock.calls.find((c) => {
        const url = typeof c[0] === 'string' ? c[0] : c[0].toString();
        return url.includes('inclusion_state=approved_for_build');
      });
      expect(filterCall).toBeDefined();
    });
  });

  it('Test 6: status filter still works alongside the new inclusion filter (back-compat)', async () => {
    const fetchMock = mockFetchWithBugs([]);

    const { default: Page } = await import('./page');
    render(<Page />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const statusFilter = screen.getByLabelText('Filter by status') as HTMLSelectElement;
    fireEvent.change(statusFilter, { target: { value: 'triaged' } });

    await waitFor(() => {
      const statusCall = fetchMock.mock.calls.find((c) => {
        const url = typeof c[0] === 'string' ? c[0] : c[0].toString();
        return url.includes('status=triaged');
      });
      expect(statusCall).toBeDefined();
    });
  });
});
