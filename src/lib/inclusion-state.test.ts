import { describe, it, expect } from 'vitest';
import { INCLUSION_STATES, canManuallyTransition, type InclusionState } from './inclusion-state';

describe('INCLUSION_STATES', () => {
  it('exports exactly 7 values in canonical order', () => {
    expect(INCLUSION_STATES).toEqual([
      'triaged', 'pending_inclusion', 'approved_for_build',
      'built', 'deployed', 'deferred', 'rejected'
    ]);
  });
});

describe('canManuallyTransition', () => {
  // Forward manual paths (allowed)
  it('triaged → pending_inclusion = true', () => {
    expect(canManuallyTransition('triaged', 'pending_inclusion')).toBe(true);
  });
  it('triaged → deferred = true', () => {
    expect(canManuallyTransition('triaged', 'deferred')).toBe(true);
  });
  it('pending_inclusion → approved_for_build = true', () => {
    expect(canManuallyTransition('pending_inclusion', 'approved_for_build')).toBe(true);
  });
  it('pending_inclusion → deferred = true', () => {
    expect(canManuallyTransition('pending_inclusion', 'deferred')).toBe(true);
  });

  // B-3 fix: 'rejected' is NOT reachable via any Phase 36 UI surface
  it('triaged → rejected = false (no UI path — B-3 fix per CONTEXT amendments)', () => {
    expect(canManuallyTransition('triaged', 'rejected')).toBe(false);
  });
  it('pending_inclusion → rejected = false (INCL-04 only enumerates approved_for_build OR deferred)', () => {
    expect(canManuallyTransition('pending_inclusion', 'rejected')).toBe(false);
  });

  // INCL-05 "Remove from build" backward (the only manual backward)
  it('approved_for_build → pending_inclusion = true (INCL-05)', () => {
    expect(canManuallyTransition('approved_for_build', 'pending_inclusion')).toBe(true);
  });

  // Recovery paths
  it('deferred → triaged = true', () => {
    expect(canManuallyTransition('deferred', 'triaged')).toBe(true);
  });
  it('rejected → triaged = true (recovery path kept for back-compat)', () => {
    expect(canManuallyTransition('rejected', 'triaged')).toBe(true);
  });

  // Auto-only states (no manual entry)
  it('approved_for_build → built = false (auto-only via commit-parser)', () => {
    expect(canManuallyTransition('approved_for_build', 'built')).toBe(false);
  });
  it('built → deployed = false (auto-only via prod-ingest)', () => {
    expect(canManuallyTransition('built', 'deployed')).toBe(false);
  });

  // Forbidden skips
  it('triaged → built = false (cannot skip states)', () => {
    expect(canManuallyTransition('triaged', 'built')).toBe(false);
  });
  it('triaged → approved_for_build = false (must go through pending_inclusion)', () => {
    expect(canManuallyTransition('triaged', 'approved_for_build')).toBe(false);
  });

  // Terminal states
  it('built → anything-else = false', () => {
    for (const to of INCLUSION_STATES) {
      expect(canManuallyTransition('built', to)).toBe(false);
    }
  });
  it('deployed → anything = false (terminal for manual surface)', () => {
    for (const to of INCLUSION_STATES) {
      expect(canManuallyTransition('deployed', to)).toBe(false);
    }
  });
});
