import { describe, it, expect } from 'vitest';
import { BUILD_TRIGGER_MODES, isValidBuildTriggerMode, type BuildTriggerMode } from './build-trigger-mode';

describe('BUILD_TRIGGER_MODES', () => {
  it('exports exactly 3 values in canonical order', () => {
    expect(BUILD_TRIGGER_MODES).toEqual(['local_claude', 'managed_agent', 'manual']);
  });
});

describe('isValidBuildTriggerMode', () => {
  it("'local_claude' = true", () => {
    expect(isValidBuildTriggerMode('local_claude')).toBe(true);
  });
  it("'managed_agent' = true", () => {
    expect(isValidBuildTriggerMode('managed_agent')).toBe(true);
  });
  it("'manual' = true", () => {
    expect(isValidBuildTriggerMode('manual')).toBe(true);
  });
  it("'invalid_mode' = false", () => {
    expect(isValidBuildTriggerMode('invalid_mode')).toBe(false);
  });
  it("'' = false", () => {
    expect(isValidBuildTriggerMode('')).toBe(false);
  });
  it('null = false', () => {
    expect(isValidBuildTriggerMode(null)).toBe(false);
  });
  it('undefined = false', () => {
    expect(isValidBuildTriggerMode(undefined)).toBe(false);
  });
  it('42 (number) = false', () => {
    expect(isValidBuildTriggerMode(42)).toBe(false);
  });

  it('narrows the type when true', () => {
    const v: unknown = 'local_claude';
    if (isValidBuildTriggerMode(v)) {
      // TypeScript should narrow v to BuildTriggerMode here.
      const _check: BuildTriggerMode = v;
      expect(_check).toBe('local_claude');
    }
  });
});
