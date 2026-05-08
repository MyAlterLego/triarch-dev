import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PromoteButton from './PromoteButton';

// Reset fetch mock before each test
beforeEach(() => {
  vi.restoreAllMocks();
});

describe('PromoteButton (PROM-01, PROM-02, PROM-05)', () => {
  it('renders Promote button when status is approved', () => {
    render(
      <PromoteButton releaseId="r1" branch="feat/audio" version="v1.4.2" />,
    );
    expect(screen.getByRole('button', { name: /promote/i })).toBeInTheDocument();
    expect(screen.queryByText(/confirm/i)).toBeNull();
    expect(screen.queryByText(/cancel/i)).toBeNull();
  });

  it('click → shows two-step confirm with exact label', async () => {
    render(
      <PromoteButton releaseId="r1" branch="feat/audio" version="v1.4.2" />,
    );
    const promoteBtn = screen.getByRole('button', { name: /^promote$/i });
    fireEvent.click(promoteBtn);

    // Confirm message must be the exact template string
    expect(screen.getByText('Promote feat/audio v1.4.2 to production')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^confirm$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^cancel$/i })).toBeInTheDocument();
    // Original flat Promote button gone
    expect(screen.queryByRole('button', { name: /^promote$/i })).toBeNull();
  });

  it('click then Cancel → returns to initial state', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch');
    render(
      <PromoteButton releaseId="r1" branch="feat/audio" version="v1.4.2" />,
    );
    fireEvent.click(screen.getByRole('button', { name: /^promote$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));

    // Back to initial Promote button
    expect(screen.getByRole('button', { name: /^promote$/i })).toBeInTheDocument();
    expect(screen.queryByText(/confirm/i)).toBeNull();
    // No fetch issued
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('click then Confirm → fetch + Dispatching... spinner → success pill', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    } as Response);

    render(
      <PromoteButton releaseId="r1" branch="feat/audio" version="v1.4.2" />,
    );
    fireEvent.click(screen.getByRole('button', { name: /^promote$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^confirm$/i }));

    // Verify fetch was called with correct URL and method
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/admin/releases/r1/promote',
      expect.objectContaining({ method: 'POST' }),
    );

    // After resolution: shows Dispatched terminal pill
    await waitFor(() => {
      expect(screen.getByText('Dispatched')).toBeInTheDocument();
    });
    // No promote or confirm buttons visible
    expect(screen.queryByRole('button', { name: /^promote$/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^confirm$/i })).toBeNull();
  });

  it('Confirm → 200 ok:false → failed pill with run_url link', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        ok: false,
        error: 'workflow_dispatch failed: 422',
        run_url: 'https://github.com/x/y/actions/runs/123',
      }),
    } as Response);

    render(
      <PromoteButton releaseId="r1" branch="feat/audio" version="v1.4.2" />,
    );
    fireEvent.click(screen.getByRole('button', { name: /^promote$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^confirm$/i }));

    await waitFor(() => {
      expect(screen.getByText('Failed')).toBeInTheDocument();
    });
    // Link to the GHA run URL
    const link = screen.getByRole('link', { name: /actions run/i });
    expect(link).toHaveAttribute('href', 'https://github.com/x/y/actions/runs/123');
  });

  it('Confirm → 409 already_promoted → toast surfaced + Dispatched pill', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({
        error: 'already_promoted',
        dispatched_by: 'mike@triarchsecurity.com',
        dispatched_at: '2026-05-07T12:00:00Z',
      }),
    } as Response);

    render(
      <PromoteButton releaseId="r1" branch="feat/audio" version="v1.4.2" />,
    );
    fireEvent.click(screen.getByRole('button', { name: /^promote$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^confirm$/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/Already promoted by mike@triarchsecurity\.com/i),
      ).toBeInTheDocument();
    });
    // Cell shows terminal Dispatched pill
    expect(screen.getByText('Dispatched')).toBeInTheDocument();
  });

  it('Confirm → 500 error → error toast + reverts to Promote button for retry', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Internal Server Error' }),
    } as Response);

    render(
      <PromoteButton releaseId="r1" branch="feat/audio" version="v1.4.2" />,
    );
    fireEvent.click(screen.getByRole('button', { name: /^promote$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^confirm$/i }));

    await waitFor(() => {
      // Error toast surfaced
      expect(screen.getByRole('status')).toBeInTheDocument();
    });
    // Reverts to Promote for retry
    expect(screen.getByRole('button', { name: /^promote$/i })).toBeInTheDocument();
  });
});
