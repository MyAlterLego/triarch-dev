/**
 * Plan 36-05b Task 1 (TDD RED → GREEN):
 * Feature-requests LIST page — Inclusion column + dropdown action + inclusion filter.
 *
 * Mirrors bug-reports/page.test.tsx with featureRequests substitutions.
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

interface FakeFeature {
  id: string;
  project: string;
  requestedByName: string | null;
  requestedByEmail: string | null;
  title: string;
  description: string;
  useCase: string | null;
  priority: string;
  status: string;
  buildPlan: Record<string, unknown> | null;
  buildPlanStatus: string | null;
  estimatedEffort: string | null;
  targetVersion: string | null;
  shippedVersion: string | null;
  triarchNotes: string | null;
  upvotes: number;
  createdAt: string;
  inclusionState: string;
}

const makeFeature = (overrides: Partial<FakeFeature> = {}): FakeFeature => ({
  id: 'feat-1',
  project: 'tmi',
  requestedByName: 'Requester',
  requestedByEmail: 'requester@example.com',
  title: 'Test feature',
  description: 'Desc',
  useCase: null,
  priority: 'normal',
  status: 'submitted',
  buildPlan: null,
  buildPlanStatus: null,
  estimatedEffort: 'small',
  targetVersion: null,
  shippedVersion: null,
  triarchNotes: null,
  upvotes: 0,
  createdAt: '2026-05-18T00:00:00Z',
  inclusionState: 'triaged',
  ...overrides,
});

function mockFetchWithFeatures(features: FakeFeature[]) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (init?.method === 'PATCH') {
      return new Response(JSON.stringify({ ok: true }), { status: 200 }) as never;
    }
    if (url.startsWith('/api/platform/feature-requests')) {
      return {
        ok: true,
        json: async () => ({ features, total: features.length }),
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

describe('FeatureRequestsPage — Inclusion column + dropdown + filter (Plan 36-05b Task 1)', () => {
  it('Test 1: renders Inclusion column with color-coded pills per row', async () => {
    mockFetchWithFeatures([
      makeFeature({ id: 'f-triaged', title: 'Triaged feat', inclusionState: 'triaged' }),
      makeFeature({ id: 'f-approved', title: 'Approved feat', inclusionState: 'approved_for_build' }),
      makeFeature({ id: 'f-deployed', title: 'Deployed feat', inclusionState: 'deployed' }),
    ]);

    const { default: Page } = await import('./page');
    render(<Page />);

    await waitFor(() => expect(screen.getByText('Triaged feat')).toBeInTheDocument());

    // Disambiguate against dropdown-option text with same string.
    const approvedMatches = screen
      .getAllByText('approved for build')
      .filter((el) => el.tagName === 'SPAN' && /violet-500\/20/.test(el.className));
    expect(approvedMatches.length).toBeGreaterThanOrEqual(1);

    const deployedMatches = screen
      .getAllByText('deployed')
      .filter((el) => el.tagName === 'SPAN' && /blue-500\/20/.test(el.className));
    expect(deployedMatches.length).toBeGreaterThanOrEqual(1);
  });

  it('Test 2: dropdown action on triaged feature PATCHes with {inclusionState: "pending_inclusion"}', async () => {
    const features = [makeFeature({ id: 'f-1', inclusionState: 'triaged' })];
    const fetchMock = mockFetchWithFeatures(features);

    const { default: Page } = await import('./page');
    render(<Page />);

    await waitFor(() => expect(screen.getByText('Test feature')).toBeInTheDocument());

    const dropdown = screen.getByLabelText('Set inclusion state for feature f-1') as HTMLSelectElement;
    fireEvent.change(dropdown, { target: { value: 'pending_inclusion' } });

    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find(
        (c) => (c[1] as RequestInit | undefined)?.method === 'PATCH',
      );
      expect(patchCall).toBeDefined();
      expect(patchCall![0]).toBe('/api/platform/feature-requests/f-1');
      expect(JSON.parse((patchCall![1] as RequestInit).body as string)).toEqual({
        inclusionState: 'pending_inclusion',
      });
    });
  });

  it('Test 3: dropdown for built feature shows no manual transition targets', async () => {
    mockFetchWithFeatures([makeFeature({ id: 'f-built', inclusionState: 'built' })]);

    const { default: Page } = await import('./page');
    render(<Page />);

    await waitFor(() => expect(screen.getByText('Test feature')).toBeInTheDocument());

    const dropdown = screen.getByLabelText('Set inclusion state for feature f-built') as HTMLSelectElement;
    const targets = within(dropdown).queryAllByRole('option')
      .map((o) => (o as HTMLOptionElement).value)
      .filter((v) => v !== '');
    expect(targets).toEqual([]);
  });

  it('Test 4 (B-3): dropdown for pending_inclusion does NOT include rejected option', async () => {
    mockFetchWithFeatures([makeFeature({ id: 'f-pi', inclusionState: 'pending_inclusion' })]);

    const { default: Page } = await import('./page');
    render(<Page />);

    await waitFor(() => expect(screen.getByText('Test feature')).toBeInTheDocument());

    const dropdown = screen.getByLabelText('Set inclusion state for feature f-pi') as HTMLSelectElement;
    const targets = within(dropdown).queryAllByRole('option')
      .map((o) => (o as HTMLOptionElement).value)
      .filter((v) => v !== '');
    expect(targets).toContain('approved_for_build');
    expect(targets).toContain('deferred');
    expect(targets).not.toContain('rejected');
  });

  it('Test 5: inclusion filter dropdown sends ?inclusion_state= URL param', async () => {
    const fetchMock = mockFetchWithFeatures([]);

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

  it('Test 6: project filter still works alongside the new inclusion filter (back-compat)', async () => {
    const fetchMock = mockFetchWithFeatures([]);

    const { default: Page } = await import('./page');
    render(<Page />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const projectFilter = screen.getByLabelText('Filter by project') as HTMLSelectElement;
    fireEvent.change(projectFilter, { target: { value: 'tmi' } });

    await waitFor(() => {
      const projectCall = fetchMock.mock.calls.find((c) => {
        const url = typeof c[0] === 'string' ? c[0] : c[0].toString();
        return url.includes('project=tmi');
      });
      expect(projectCall).toBeDefined();
    });
  });
});
