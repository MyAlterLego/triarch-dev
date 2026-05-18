import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NextBuildPlanClient, { type BuildPlanItem } from './NextBuildPlanClient';

// ── Mock next/navigation for URL state management ─────────────────────────
const mockReplace = vi.fn();
const mockSearchParams = { value: new URLSearchParams() };

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: vi.fn() }),
  useSearchParams: () => mockSearchParams.value,
  usePathname: () => '/admin/modules/next-build-plan/tmi',
}));

// ── Test fixtures ─────────────────────────────────────────────────────────
const bug1: BuildPlanItem = {
  id: 'bug-1-uuid',
  type: 'bug',
  title: 'Login button misaligned on mobile',
  severity: 'high',
  inclusionState: 'approved_for_build',
  updatedAt: new Date('2026-05-18T10:00:00Z').toISOString(),
};

const bug2: BuildPlanItem = {
  id: 'bug-2-uuid',
  type: 'bug',
  title: 'CSV export drops trailing column',
  severity: 'medium',
  inclusionState: 'approved_for_build',
  updatedAt: new Date('2026-05-17T09:00:00Z').toISOString(),
};

const feature1: BuildPlanItem = {
  id: 'feat-1-uuid',
  type: 'feature',
  title: 'Add dark mode toggle',
  severity: null,
  inclusionState: 'approved_for_build',
  updatedAt: new Date('2026-05-18T08:00:00Z').toISOString(),
};

const ALL_ITEMS = [bug1, feature1, bug2]; // mixed order

// ── Phase 37-05: shared project fixture for the new required props ────────
// (Existing Phase 36-05a tests still pass the original 3 props; the new
// `project` + `approvedCount` are accepted but unused by the 36-05a paths.)
const defaultProject = {
  id: 'project-uuid-tmi',
  key: 'tmi',
  name: 'TMI',
  buildTriggerMode: 'local_claude' as const,
  localPath: null as string | null,
};

// ── Test setup ────────────────────────────────────────────────────────────
beforeEach(() => {
  mockReplace.mockClear();
  mockSearchParams.value = new URLSearchParams();
  // Mock global.fetch for PATCH calls
  global.fetch = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ id: 'updated' }),
  }) as unknown as Response);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('NextBuildPlanClient', () => {
  it('Test 1: renders a table row for each approved_for_build item with type pill, title, severity (bugs only), and Remove button', () => {
    render(
      <NextBuildPlanClient
        projectName="TMI"
        projectSlug="tmi"
        initialItems={ALL_ITEMS}
        project={defaultProject}
        approvedCount={ALL_ITEMS.length}
      />,
    );

    // 3 rows visible by default (all filter)
    expect(screen.getByText('Login button misaligned on mobile')).toBeInTheDocument();
    expect(screen.getByText('CSV export drops trailing column')).toBeInTheDocument();
    expect(screen.getByText('Add dark mode toggle')).toBeInTheDocument();

    // Severity pill renders for bugs
    expect(screen.getByText('high')).toBeInTheDocument();
    expect(screen.getByText('medium')).toBeInTheDocument();

    // Type pills present (text 'bug' appears in pills; can be multiple)
    expect(screen.getAllByText(/^bug$/i).length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText(/^feature$/i).length).toBeGreaterThanOrEqual(1);

    // Remove buttons — one per row
    const removeButtons = screen.getAllByRole('button', { name: /remove from build/i });
    expect(removeButtons).toHaveLength(3);
  });

  it('Test 2: clicking the "bug" filter chip filters out feature rows and updates URL', async () => {
    const user = userEvent.setup();
    render(
      <NextBuildPlanClient
        projectName="TMI"
        projectSlug="tmi"
        initialItems={ALL_ITEMS}
        project={defaultProject}
        approvedCount={ALL_ITEMS.length}
      />,
    );

    // Click the "Bugs" chip — find chip by text
    const bugChip = screen.getByRole('button', { name: /^bugs\b/i });
    await user.click(bugChip);

    // URL update via router.replace called with ?type=bug
    expect(mockReplace).toHaveBeenCalled();
    const lastCall = mockReplace.mock.calls.at(-1)?.[0] as string;
    expect(lastCall).toMatch(/type=bug/);

    // Both bug titles still visible, feature filtered out
    expect(screen.getByText('Login button misaligned on mobile')).toBeInTheDocument();
    expect(screen.getByText('CSV export drops trailing column')).toBeInTheDocument();
    expect(screen.queryByText('Add dark mode toggle')).not.toBeInTheDocument();
  });

  it('Test 3: clicking the "feature" filter chip filters out bug rows', async () => {
    const user = userEvent.setup();
    render(
      <NextBuildPlanClient
        projectName="TMI"
        projectSlug="tmi"
        initialItems={ALL_ITEMS}
        project={defaultProject}
        approvedCount={ALL_ITEMS.length}
      />,
    );

    const featureChip = screen.getByRole('button', { name: /^features\b/i });
    await user.click(featureChip);

    expect(screen.queryByText('Login button misaligned on mobile')).not.toBeInTheDocument();
    expect(screen.queryByText('CSV export drops trailing column')).not.toBeInTheDocument();
    expect(screen.getByText('Add dark mode toggle')).toBeInTheDocument();
  });

  it('Test 4: the default ("all") filter shows both bugs and features', () => {
    render(
      <NextBuildPlanClient
        projectName="TMI"
        projectSlug="tmi"
        initialItems={ALL_ITEMS}
        project={defaultProject}
        approvedCount={ALL_ITEMS.length}
      />,
    );

    // "All" chip is active by default
    const allChip = screen.getByRole('button', { name: /^all\b/i });
    expect(allChip).toHaveAttribute('aria-pressed', 'true');

    // All 3 items visible
    expect(screen.getByText('Login button misaligned on mobile')).toBeInTheDocument();
    expect(screen.getByText('Add dark mode toggle')).toBeInTheDocument();
    expect(screen.getByText('CSV export drops trailing column')).toBeInTheDocument();
  });

  it('Test 5: clicking "Remove from build" on a bug calls PATCH /api/platform/bug-reports/{id} with inclusionState=pending_inclusion and removes the row optimistically', async () => {
    const user = userEvent.setup();
    render(
      <NextBuildPlanClient
        projectName="TMI"
        projectSlug="tmi"
        initialItems={ALL_ITEMS}
        project={defaultProject}
        approvedCount={ALL_ITEMS.length}
      />,
    );

    // Find Remove button on the bug1 row by locating row containing bug1 title
    const bug1Row = screen.getByText('Login button misaligned on mobile').closest('tr')!;
    const removeBtn = bug1Row.querySelector('button[aria-label*="Remove from build"]')!;
    expect(removeBtn).toBeTruthy();

    await user.click(removeBtn);

    // fetch called with correct URL + body
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/platform/bug-reports/bug-1-uuid',
      expect.objectContaining({
        method: 'PATCH',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ inclusionState: 'pending_inclusion' }),
      }),
    );

    // Optimistic removal: row gone from DOM after click
    await waitFor(() => {
      expect(screen.queryByText('Login button misaligned on mobile')).not.toBeInTheDocument();
    });

    // Other rows still visible
    expect(screen.getByText('Add dark mode toggle')).toBeInTheDocument();
    expect(screen.getByText('CSV export drops trailing column')).toBeInTheDocument();
  });

  it('Test 6: when PATCH returns non-ok, the row is restored and an error indicator surfaces', async () => {
    // Override fetch to return 400
    global.fetch = vi.fn(async () => ({
      ok: false,
      status: 400,
      json: async () => ({ error: 'invalid_transition' }),
    }) as unknown as Response);

    const user = userEvent.setup();
    render(
      <NextBuildPlanClient
        projectName="TMI"
        projectSlug="tmi"
        initialItems={ALL_ITEMS}
        project={defaultProject}
        approvedCount={ALL_ITEMS.length}
      />,
    );

    const bug1Row = screen.getByText('Login button misaligned on mobile').closest('tr')!;
    const removeBtn = bug1Row.querySelector('button[aria-label*="Remove from build"]') as HTMLButtonElement;
    await user.click(removeBtn);

    // Wait for the row to be restored (rollback) and error indicator to appear
    await waitFor(() => {
      expect(screen.getByText('Login button misaligned on mobile')).toBeInTheDocument();
    });

    // Error surface: alert role OR inline error text
    const errorIndicator =
      screen.queryByRole('alert') ?? screen.queryByText(/failed|error|could not/i);
    expect(errorIndicator).toBeTruthy();
  });

  it('Test 7: empty state — when initialItems is empty, render an explanatory empty-state message that references the project name', () => {
    render(
      <NextBuildPlanClient
        projectName="TMI"
        projectSlug="tmi"
        initialItems={[]}
        project={defaultProject}
        approvedCount={0}
      />,
    );

    // No table rows
    expect(screen.queryByRole('button', { name: /remove from build/i })).not.toBeInTheDocument();

    // Empty state copy mentions project name + "approved for build"
    expect(screen.getByText(/no items approved for build/i)).toBeInTheDocument();
    // Project name appears at least once (subtitle + empty-state span both render it)
    expect(screen.getAllByText(/TMI/).length).toBeGreaterThanOrEqual(1);
  });

  it('Test 8: clicking Remove on a feature row hits the feature-requests endpoint (not bug-reports)', async () => {
    const user = userEvent.setup();
    render(
      <NextBuildPlanClient
        projectName="TMI"
        projectSlug="tmi"
        initialItems={ALL_ITEMS}
        project={defaultProject}
        approvedCount={ALL_ITEMS.length}
      />,
    );

    const featureRow = screen.getByText('Add dark mode toggle').closest('tr')!;
    const removeBtn = featureRow.querySelector('button[aria-label*="Remove from build"]') as HTMLButtonElement;
    await user.click(removeBtn);

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/platform/feature-requests/feat-1-uuid',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ inclusionState: 'pending_inclusion' }),
      }),
    );
  });
});

// ── Phase 37-05: Generate Build button + modal integration ────────────────
// The button is rendered in the page header; clicking opens GenerateBuildModal.
// Disabled states cover (a) zero approved items and (b) managed_agent mode (v2.5
// placeholder). Locked tooltip strings per CONTEXT.md.
describe('Phase 37 — Generate Build button + modal', () => {
  it('renders Generate Build button enabled when approvedCount > 0 and mode === local_claude', () => {
    render(
      <NextBuildPlanClient
        projectName="TMI"
        projectSlug="tmi"
        initialItems={ALL_ITEMS}
        project={defaultProject}
        approvedCount={3}
      />,
    );
    const btn = screen.getByRole('button', { name: /^Generate Build$/ });
    expect(btn).toBeInTheDocument();
    expect((btn as HTMLButtonElement).disabled).toBe(false);
  });

  it('disables Generate Build button when approvedCount === 0 with the locked tooltip', () => {
    render(
      <NextBuildPlanClient
        projectName="TMI"
        projectSlug="tmi"
        initialItems={[]}
        project={defaultProject}
        approvedCount={0}
      />,
    );
    const btn = screen.getByRole('button', { name: /^Generate Build$/ });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    expect(btn).toHaveAttribute('title', 'Approve at least one item to generate a build');
  });

  it('disables Generate Build button when buildTriggerMode === managed_agent with the v2.5 tooltip', () => {
    render(
      <NextBuildPlanClient
        projectName="TMI"
        projectSlug="tmi"
        initialItems={ALL_ITEMS}
        project={{ ...defaultProject, buildTriggerMode: 'managed_agent' }}
        approvedCount={2}
      />,
    );
    const btn = screen.getByRole('button', { name: /^Generate Build$/ });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    expect(btn).toHaveAttribute('title', 'Managed Agent variant ships in v2.5');
  });

  it('clicking Generate Build opens the modal (role=dialog appears)', () => {
    render(
      <NextBuildPlanClient
        projectName="TMI"
        projectSlug="tmi"
        initialItems={ALL_ITEMS}
        project={defaultProject}
        approvedCount={2}
      />,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^Generate Build$/ }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('closing the modal via the X button removes it from the DOM', async () => {
    // Modal mounts and fires fetch; the global beforeEach fetch mock returns
    // ok:true with a json body that has no `prompt` field, but the modal will
    // surface an error message in that case — that's fine for this assertion
    // which only checks the dialog mounts and then unmounts on close click.
    render(
      <NextBuildPlanClient
        projectName="TMI"
        projectSlug="tmi"
        initialItems={ALL_ITEMS}
        project={defaultProject}
        approvedCount={2}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /^Generate Build$/ }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/^Close$/));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
