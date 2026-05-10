import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { REQUIRED_ENV } from './env-schema';

function setAllRequired(): void {
  for (const name of REQUIRED_ENV) {
    process.env[name] = `test-value-for-${name}`;
  }
}

describe('assertEnv (admin)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    // Ensure no stale required var from the host environment skews tests.
    for (const name of REQUIRED_ENV) {
      delete process.env[name];
    }
    vi.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('passes when all REQUIRED_ENV vars are set', async () => {
    setAllRequired();
    const { assertEnv } = await import('./assertEnv');
    expect(() => assertEnv()).not.toThrow();
  });

  it('throws with the missing var name when one is unset', async () => {
    setAllRequired();
    delete process.env.DATABASE_URL;
    const { assertEnv } = await import('./assertEnv');
    expect(() => assertEnv()).toThrow(/DATABASE_URL/);
  });

  it('lists ALL missing names in error message (not just first)', async () => {
    setAllRequired();
    delete process.env.DATABASE_URL;
    delete process.env.NEXTAUTH_SECRET;
    const { assertEnv } = await import('./assertEnv');
    expect(() => assertEnv()).toThrow(/DATABASE_URL.*NEXTAUTH_SECRET/);
  });

  it('does NOT log secret VALUES, only NAMES', async () => {
    setAllRequired();
    const sentinel = 'super-secret-value-must-not-appear';
    process.env.NEXTAUTH_SECRET = sentinel;
    delete process.env.DATABASE_URL;

    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { assertEnv } = await import('./assertEnv');
    try {
      assertEnv();
    } catch {
      /* expected throw */
    }
    const calls = errSpy.mock.calls.flat().join(' ');
    expect(calls).not.toContain(sentinel);
    // Sanity: the missing NAME should still appear.
    expect(calls).toContain('DATABASE_URL');
  });
});
