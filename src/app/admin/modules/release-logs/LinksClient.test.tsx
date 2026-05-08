/**
 * LinksClient — mount-fetch hydration tests (Plan 11-05 RED → GREEN)
 *
 * Covers:
 * 1. Mount-time fetch hydrates chips from GET /api/admin/release-logs/[id]/links
 * 2. Non-empty initialLinks bypasses the mount fetch (server-provided wins)
 * 3. Fetch failure leaves state untouched and logs console.error
 * 4. Optimistic-add flow still works after mount fetch settles
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';

import type { ReleaseLogLink } from './LinksClient';

// Silence window.confirm (used in handleRemove for commit-source chips)
Object.defineProperty(window, 'confirm', { value: () => true, writable: true });

const makeLink = (overrides: Partial<ReleaseLogLink> = {}): ReleaseLogLink => ({
  id: 'l1',
  releaseId: 'r1',
  linkType: 'bug',
  bugId: 'b1',
  featureId: null,
  externalUrl: null,
  source: 'commit',
  createdAt: '2026-05-08T00:00:00Z',
  bugTitle: 'login crash',
  ...overrides,
});

describe('LinksClient', () => {
  beforeEach(() => {
    // Default: GET returns empty links list
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ links: [] }),
    }) as never;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches existing links on mount and renders them as chips', async () => {
    const link = makeLink({ bugTitle: 'login crash' });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ links: [link] }),
    }) as never;

    const { default: LinksClient } = await import('./LinksClient');
    render(<LinksClient releaseId="r1" initialLinks={[]} project="triarch-dev" />);

    // fetch should be called for the GET endpoint
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/admin/release-logs/r1/links');
    });

    // chip text should appear after fetch resolves
    await waitFor(() => {
      expect(screen.getByText('login crash')).toBeInTheDocument();
    });
  });

  it('does not refetch when initialLinks is non-empty (server-provided wins)', async () => {
    const preloaded = makeLink({ id: 'pre1', source: 'manual', bugTitle: 'preloaded' });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ links: [] }),
    }) as never;

    const { default: LinksClient } = await import('./LinksClient');
    render(<LinksClient releaseId="r1" initialLinks={[preloaded]} project="triarch-dev" />);

    // preloaded chip is visible immediately
    expect(screen.getByText('preloaded')).toBeInTheDocument();

    // fetch should NOT have been called with the links GET URL
    // give a moment for any async effects to run
    await new Promise((r) => setTimeout(r, 50));
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    const getCalls = fetchMock.mock.calls.filter(
      (call) => typeof call[0] === 'string' && (call[0] as string).includes('/api/admin/release-logs/'),
    );
    expect(getCalls.length).toBe(0);
  });

  it('fetch failure leaves state untouched and logs to console', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    }) as never;

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { default: LinksClient } = await import('./LinksClient');
    render(<LinksClient releaseId="r1" initialLinks={[]} project="triarch-dev" />);

    // After fetch settles, should still show "No links yet"
    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalled();
    });

    const errorArgs = consoleSpy.mock.calls.flat().join(' ');
    expect(errorArgs).toMatch(/LinksClient|GET/i);
    expect(screen.getByText('No links yet')).toBeInTheDocument();

    consoleSpy.mockRestore();
  });

  it('optimistic-add flow still works after mount fetch settles', async () => {
    // Initial GET returns empty
    const getMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ links: [] }),
    });

    // POST returns the new link
    const serverLink: ReleaseLogLink = makeLink({
      id: 'srv1',
      source: 'manual',
      bugTitle: 'manual bug',
    });
    const postMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ link: serverLink }),
    });

    global.fetch = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      if (method === 'POST') return postMock(url, init);
      return getMock(url, init);
    }) as never;

    const { default: LinksClient } = await import('./LinksClient');
    render(<LinksClient releaseId="r1" initialLinks={[]} project="triarch-dev" />);

    // Wait for mount fetch to complete
    await waitFor(() => {
      expect(getMock).toHaveBeenCalled();
    });

    // Open picker and submit
    const addButton = screen.getByRole('button', { name: /add link/i });
    fireEvent.click(addButton);

    // Type a UUID in the input
    const input = screen.getByPlaceholderText(/bug uuid/i);
    fireEvent.change(input, { target: { value: 'b1b1b1b1-e29b-41d4-a716-446655440000' } });

    // Click Add
    const submitButton = screen.getByRole('button', { name: /^add$/i });
    fireEvent.click(submitButton);

    // After POST resolves, chip "manual bug" should appear
    await waitFor(() => {
      expect(screen.getByText('manual bug')).toBeInTheDocument();
    });
  });
});
