import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import FilterChips, { type FilterType } from './FilterChips';

const DEFAULT_COUNTS = { fix: 4, feature: 2, other: 3, total: 9 };

describe('FilterChips', () => {
  it('Test 1: renders 4 chips with correct labels and counts', () => {
    const onChange = vi.fn();
    render(
      <FilterChips active="all" counts={DEFAULT_COUNTS} onChange={onChange} />,
    );

    expect(screen.getByText('All (9)')).toBeInTheDocument();
    expect(screen.getByText('Bug fixes (4)')).toBeInTheDocument();
    expect(screen.getByText('Features (2)')).toBeInTheDocument();
    expect(screen.getByText('Other (3)')).toBeInTheDocument();
  });

  it('Test 2: active chip has aria-pressed=true and gradient class; inactive chips have aria-pressed=false', () => {
    const onChange = vi.fn();
    render(
      <FilterChips active="fix" counts={DEFAULT_COUNTS} onChange={onChange} />,
    );

    const bugButton = screen.getByText('Bug fixes (4)').closest('button')!;
    const allButton = screen.getByText('All (9)').closest('button')!;
    const featureButton = screen.getByText('Features (2)').closest('button')!;
    const otherButton = screen.getByText('Other (3)').closest('button')!;

    expect(bugButton).toHaveAttribute('aria-pressed', 'true');
    expect(bugButton.className).toMatch(/border-violet-400|from-violet-500/);

    expect(allButton).toHaveAttribute('aria-pressed', 'false');
    expect(featureButton).toHaveAttribute('aria-pressed', 'false');
    expect(otherButton).toHaveAttribute('aria-pressed', 'false');
  });

  it('Test 3: clicking a non-active chip calls onChange with the corresponding FilterType', () => {
    const onChange = vi.fn();
    render(
      <FilterChips active="all" counts={DEFAULT_COUNTS} onChange={onChange} />,
    );

    fireEvent.click(screen.getByText('Bug fixes (4)'));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('fix');

    fireEvent.click(screen.getByText('Features (2)'));
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenCalledWith('feature');

    fireEvent.click(screen.getByText('Other (3)'));
    expect(onChange).toHaveBeenCalledTimes(3);
    expect(onChange).toHaveBeenCalledWith('other');
  });

  it('Test 4: clicking the already-active chip does NOT call onChange', () => {
    const onChange = vi.fn();
    render(
      <FilterChips active="all" counts={DEFAULT_COUNTS} onChange={onChange} />,
    );

    fireEvent.click(screen.getByText('All (9)'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('Test 5: chips with count=0 render with opacity-50 class but remain clickable', () => {
    const onChange = vi.fn();
    const counts = { fix: 0, feature: 2, other: 3, total: 5 };
    render(
      <FilterChips active="all" counts={counts} onChange={onChange} />,
    );

    const bugButton = screen.getByText('Bug fixes (0)').closest('button')!;
    expect(bugButton.className).toContain('opacity-50');
    // Still clickable — no pointer-events-none
    expect(bugButton.className).not.toContain('pointer-events-none');

    // Click should still work
    fireEvent.click(bugButton);
    expect(onChange).toHaveBeenCalledWith('fix');
  });

  it('Test 6: "All" chip displays counts.total ("All (9)")', () => {
    const onChange = vi.fn();
    render(
      <FilterChips active="all" counts={{ fix: 4, feature: 2, other: 3, total: 9 }} onChange={onChange} />,
    );

    expect(screen.getByText('All (9)')).toBeInTheDocument();
  });

  it('Test 7: pressing Enter on focused chip triggers onChange', () => {
    const onChange = vi.fn();
    render(
      <FilterChips active="all" counts={DEFAULT_COUNTS} onChange={onChange} />,
    );

    const featureButton = screen.getByText('Features (2)').closest('button')!;
    featureButton.focus();
    fireEvent.keyDown(featureButton, { key: 'Enter', code: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('feature');
  });
});
