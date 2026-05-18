import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import BuildTriggerSection from './BuildTriggerSection';

afterEach(cleanup);

function makeProject(
  overrides: Partial<{ id: string; key: string; buildTriggerMode: string; localPath: string | null }> = {},
) {
  return {
    id: 'proj-1',
    key: 'tmi',
    buildTriggerMode: 'local_claude',
    localPath: null,
    ...overrides,
  };
}

describe('BuildTriggerSection (Phase 37 TRIG-05)', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'proj-1' }), { status: 200 }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  it('renders 3 radios with locked label text and selects the current mode', () => {
    render(
      <BuildTriggerSection project={makeProject({ buildTriggerMode: 'manual' })} onSaved={() => {}} />,
    );
    expect(screen.getByLabelText(/Local Claude Code \(default\)/)).toBeDefined();
    expect(screen.getByLabelText(/Managed Agent \(v2\.5\)/)).toBeDefined();
    expect(screen.getByLabelText(/Manual \(copy only\)/)).toBeDefined();
    const manualRadio = screen.getByLabelText(/Manual \(copy only\)/) as HTMLInputElement;
    expect(manualRadio.checked).toBe(true);
  });

  it('renders local_path input prefilled with project.localPath', () => {
    render(
      <BuildTriggerSection
        project={makeProject({ localPath: '/Users/mike/projects/tmi' })}
        onSaved={() => {}}
      />,
    );
    const pathInput = screen.getByLabelText(/Local Path/) as HTMLInputElement;
    expect(pathInput.value).toBe('/Users/mike/projects/tmi');
  });

  it('Save button is disabled when no changes', () => {
    render(<BuildTriggerSection project={makeProject()} onSaved={() => {}} />);
    const save = screen.getByRole('button', { name: /Save/ }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
  });

  it('changing radio enables Save and PUTs correct body on click', async () => {
    const onSaved = vi.fn();
    render(<BuildTriggerSection project={makeProject()} onSaved={onSaved} />);

    fireEvent.click(screen.getByLabelText(/Manual \(copy only\)/));
    const save = screen.getByRole('button', { name: /Save/ }) as HTMLButtonElement;
    expect(save.disabled).toBe(false);

    fireEvent.click(save);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/platform/projects/proj-1',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ buildTriggerMode: 'manual', localPath: null }),
        }),
      );
    });
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it('typing in local_path enables Save and PUTs path string', async () => {
    render(<BuildTriggerSection project={makeProject()} onSaved={() => {}} />);

    fireEvent.change(screen.getByLabelText(/Local Path/), { target: { value: '/tmp/x' } });
    const save = screen.getByRole('button', { name: /Save/ }) as HTMLButtonElement;
    expect(save.disabled).toBe(false);

    fireEvent.click(save);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/platform/projects/proj-1',
        expect.objectContaining({
          body: JSON.stringify({ buildTriggerMode: 'local_claude', localPath: '/tmp/x' }),
        }),
      );
    });
  });

  it('400 response surfaces error message in a status region', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'invalid_build_trigger_mode' }), { status: 400 }),
    );
    render(<BuildTriggerSection project={makeProject()} onSaved={() => {}} />);

    fireEvent.click(screen.getByLabelText(/Manual \(copy only\)/));
    fireEvent.click(screen.getByRole('button', { name: /Save/ }));

    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toMatch(/invalid_build_trigger_mode/i);
    });
  });

  it('locked managed_agent helper text contains "ships in v2.5"', () => {
    render(<BuildTriggerSection project={makeProject()} onSaved={() => {}} />);
    // The helper text is in the same label as the radio; query by partial text
    expect(screen.getByText(/Managed Agent variant ships in v2\.5/)).toBeDefined();
  });
});
