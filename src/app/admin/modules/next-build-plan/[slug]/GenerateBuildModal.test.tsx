/**
 * GenerateBuildModal — Phase 37-05 TRIG-02 + TRIG-03 client modal.
 *
 * Tests:
 *  1. dialog + aria-modal + single fetch on mount
 *  2. loading → readOnly textarea with prompt
 *  3. local_claude mode → Copy + Open buttons
 *  4. manual mode → Copy only (Open hidden)
 *  5. Copy click writes full prompt via navigator.clipboard.writeText
 *  6. buildDeepLink pure helper: with localPath → cwd param
 *  7. buildDeepLink pure helper: null localPath → no cwd param
 *  8. buildDeepLink pure helper: special-char path is URL-encoded
 *  9. Open click invokes buildDeepLink + assigns window.location.href once (smoke)
 * 10. 2-second fallback hint after Open
 * 11. 4xx error → error message + Retry button
 * 12. Escape key closes
 * 13. Close button (X) closes
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import GenerateBuildModal, { buildDeepLink } from './GenerateBuildModal';

afterEach(cleanup);

const project = {
  id: 'p1',
  key: 'tmi',
  name: 'TMI',
  buildTriggerMode: 'local_claude' as const,
  localPath: '/Users/m/tmi' as string | null,
};

let fetchMock: ReturnType<typeof vi.fn>;
let writeTextMock: ReturnType<typeof vi.fn>;
let hrefAssignments: string[];
let originalLocation: Location;

beforeEach(() => {
  hrefAssignments = [];
  fetchMock = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({ prompt: 'FAKE PROMPT BODY', mode: 'local_claude', item_count: 3 }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ),
  );
  globalThis.fetch = fetchMock as unknown as typeof fetch;

  writeTextMock = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: writeTextMock },
    configurable: true,
  });

  // Stub window.location.href setter to record assignments rather than navigate.
  originalLocation = window.location;
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: new Proxy({ ...originalLocation, href: '' } as Location, {
      set(_t, prop, val) {
        if (prop === 'href') hrefAssignments.push(String(val));
        return true;
      },
      get(_t, prop) {
        if (prop === 'href') return hrefAssignments.at(-1) ?? '';
        return (originalLocation as unknown as Record<string, unknown>)[prop as string];
      },
    }),
  });
});

afterEach(() => {
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: originalLocation,
  });
});

describe('GenerateBuildModal', () => {
  it('renders dialog with aria-modal and fetches on mount exactly once', async () => {
    render(<GenerateBuildModal slug="tmi" project={project} onClose={() => {}} />);
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/projects/tmi/generate-build',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('shows loading state then renders the prompt in a readOnly textarea', async () => {
    render(<GenerateBuildModal slug="tmi" project={project} onClose={() => {}} />);
    expect(screen.getByText(/Generating/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByDisplayValue('FAKE PROMPT BODY')).toBeInTheDocument());
    const ta = screen.getByDisplayValue('FAKE PROMPT BODY') as HTMLTextAreaElement;
    expect(ta.readOnly).toBe(true);
  });

  it('renders Copy + Open buttons in local_claude mode', async () => {
    render(<GenerateBuildModal slug="tmi" project={project} onClose={() => {}} />);
    await waitFor(() => screen.getByDisplayValue('FAKE PROMPT BODY'));
    expect(screen.getByRole('button', { name: /Copy to clipboard/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Open in Claude Code/i })).toBeInTheDocument();
  });

  it('hides Open button in manual mode', async () => {
    const manualProject = { ...project, buildTriggerMode: 'manual' as const };
    render(<GenerateBuildModal slug="tmi" project={manualProject} onClose={() => {}} />);
    await waitFor(() => screen.getByDisplayValue('FAKE PROMPT BODY'));
    expect(screen.getByRole('button', { name: /Copy to clipboard/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Open in Claude Code/i })).toBeNull();
  });

  it('Copy click calls navigator.clipboard.writeText with the full prompt', async () => {
    render(<GenerateBuildModal slug="tmi" project={project} onClose={() => {}} />);
    await waitFor(() => screen.getByRole('button', { name: /Copy to clipboard/i }));
    fireEvent.click(screen.getByRole('button', { name: /Copy to clipboard/i }));
    await waitFor(() => expect(writeTextMock).toHaveBeenCalledWith('FAKE PROMPT BODY'));
  });

  // ── W-4 fix: assert the pure helper directly (not the side effect) ──
  it('buildDeepLink: with localPath produces claude-code://open?prompt=...&cwd=...', () => {
    const url = buildDeepLink('hello world', '/Users/m/tmi');
    expect(url.startsWith('claude-code://open?prompt=')).toBe(true);
    expect(url).toContain(`prompt=${encodeURIComponent('hello world')}`);
    expect(url).toContain(`cwd=${encodeURIComponent('/Users/m/tmi')}`);
  });

  it('buildDeepLink: without localPath omits cwd param', () => {
    const url = buildDeepLink('hello world', null);
    expect(url.startsWith('claude-code://open?prompt=')).toBe(true);
    expect(url).not.toContain('cwd=');
  });

  // ── I-1: special-char path encoding ──
  it('buildDeepLink: special-character path is URL-encoded correctly', () => {
    const url = buildDeepLink(
      'p',
      '/Users/mike/my projects/triarch & co/dev (work)/path with #hash',
    );
    expect(url).toContain('cwd=');
    expect(url).toContain(
      encodeURIComponent('/Users/mike/my projects/triarch & co/dev (work)/path with #hash'),
    );
    // sanity: spaces become %20, ampersand becomes %26, # becomes %23
    expect(url).toContain('%20');
    expect(url).toContain('%26');
    expect(url).toContain('%23');
  });

  // ── Side-effect smoke test: helper above does the heavy lifting on URL shape ──
  it('Open click invokes buildDeepLink and assigns window.location.href once', async () => {
    render(<GenerateBuildModal slug="tmi" project={project} onClose={() => {}} />);
    await waitFor(() => screen.getByRole('button', { name: /Open in Claude Code/i }));
    fireEvent.click(screen.getByRole('button', { name: /Open in Claude Code/i }));
    expect(hrefAssignments.length).toBe(1);
    expect(hrefAssignments[0]).toBe(buildDeepLink('FAKE PROMPT BODY', '/Users/m/tmi'));
  });

  it('after 2 seconds following Open click, renders fallback hint', async () => {
    // Real-timer end-to-end: simplest reliable approach for fetch+setTimeout+setState.
    render(<GenerateBuildModal slug="tmi" project={project} onClose={() => {}} />);
    await waitFor(() => screen.getByRole('button', { name: /Open in Claude Code/i }));
    fireEvent.click(screen.getByRole('button', { name: /Open in Claude Code/i }));
    expect(screen.queryByText(/Did Claude Code open\?/)).toBeNull();
    // Fallback fires at 2000ms — wait up to 3s before failing to allow setTimeout + state flush.
    await waitFor(
      () => expect(screen.getByText(/Did Claude Code open\?/)).toBeInTheDocument(),
      { timeout: 3000 },
    );
  });

  it('renders error message + Retry on 4xx', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'no_approved_items' }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    render(<GenerateBuildModal slug="tmi" project={project} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText(/no_approved_items/i)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument();
  });

  it('Escape key calls onClose', async () => {
    const onClose = vi.fn();
    render(<GenerateBuildModal slug="tmi" project={project} onClose={onClose} />);
    await waitFor(() => screen.getByDisplayValue('FAKE PROMPT BODY'));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('Close (X) button calls onClose', async () => {
    const onClose = vi.fn();
    render(<GenerateBuildModal slug="tmi" project={project} onClose={onClose} />);
    await waitFor(() => screen.getByDisplayValue('FAKE PROMPT BODY'));
    fireEvent.click(screen.getByLabelText(/^Close$/));
    expect(onClose).toHaveBeenCalled();
  });
});
