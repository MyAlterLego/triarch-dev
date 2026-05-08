import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import WhatsComingCard from './WhatsComingCard';
import type { WhatsComingSummary } from './types';

const DELTA_SUMMARY: WhatsComingSummary = {
  totalEntries: 4,
  fixes: 2,
  features: 1,
  other: 1,
  hasDelta: true,
  oneliner: '4 entries since prod: 2 fixes, 1 feature, 1 other',
};

describe('WhatsComingCard', () => {
  it('Test 1 (hidden): renders null when whatsComing=null', () => {
    const { container } = render(<WhatsComingCard whatsComing={null} entries={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('Test 2 (hidden when no delta): renders null when hasDelta=false', () => {
    const summary: WhatsComingSummary = {
      ...DELTA_SUMMARY,
      hasDelta: false,
      oneliner: null,
    };
    const { container } = render(<WhatsComingCard whatsComing={summary} entries={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('Test 3 (collapsed default): renders header with oneliner and chevron when hasDelta=true', () => {
    render(<WhatsComingCard whatsComing={DELTA_SUMMARY} entries={[]} />);

    // Section label
    expect(screen.getByText("WHAT'S COMING TO PROD")).toBeInTheDocument();

    // The oneliner parts should be visible
    // "4 entries" prefix is in its own span, and the rest of oneliner should show
    expect(screen.getByText(/4 entries/)).toBeInTheDocument();
    expect(screen.getByText(/since prod:/)).toBeInTheDocument();
  });

  it('Test 4 (expand toggle): clicking header toggles expanded state and chevron flips', () => {
    render(<WhatsComingCard whatsComing={DELTA_SUMMARY} entries={[]} />);

    const toggleButton = screen.getByRole('button');
    expect(toggleButton).toHaveAttribute('aria-expanded', 'false');

    // Click to expand
    fireEvent.click(toggleButton);
    expect(toggleButton).toHaveAttribute('aria-expanded', 'true');

    // Click to collapse
    fireEvent.click(toggleButton);
    expect(toggleButton).toHaveAttribute('aria-expanded', 'false');
  });

  it('Test 5 (count gradient): the count prefix uses bg-clip-text text-transparent gradient class', () => {
    render(<WhatsComingCard whatsComing={DELTA_SUMMARY} entries={[]} />);

    // The prefix span with gradient text
    const gradientSpan = document.querySelector('.bg-clip-text.text-transparent');
    expect(gradientSpan).toBeInTheDocument();
    expect(gradientSpan!.textContent).toMatch(/4 entries/);
  });

  it('Test 6 (section header label): renders "WHAT\'S COMING TO PROD" uppercase tracking-wider', () => {
    render(<WhatsComingCard whatsComing={DELTA_SUMMARY} entries={[]} />);
    const label = screen.getByText("WHAT'S COMING TO PROD");
    expect(label.className).toMatch(/tracking-wider/);
    expect(label.className).toMatch(/uppercase/);
  });

  it('Test 7 (expanded with no entries[]): shows placeholder link when entries empty', () => {
    render(<WhatsComingCard whatsComing={DELTA_SUMMARY} entries={[]} />);

    const toggleButton = screen.getByRole('button');
    fireEvent.click(toggleButton); // expand

    // Expanded view shows placeholder for no entries
    expect(
      screen.getByText(/available in admin pipeline page/i),
    ).toBeInTheDocument();
  });

  it('Test 8 (aria-expanded): button has correct aria-expanded matching state', () => {
    render(<WhatsComingCard whatsComing={DELTA_SUMMARY} entries={[]} />);

    const button = screen.getByRole('button');

    // Initially collapsed
    expect(button).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
  });
});
