import { describe, it, expect, afterEach } from 'vitest';
import {
  customerProjectUrl,
  customerReleaseUrl,
  customerBugUrl,
  customerFeatureUrl,
} from './urls';

describe('customer URL helpers', () => {
  const originalEnv = process.env.PORTAL_BASE_URL;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.PORTAL_BASE_URL;
    } else {
      process.env.PORTAL_BASE_URL = originalEnv;
    }
  });

  it('customerProjectUrl defaults to https://portal.triarch.dev when PORTAL_BASE_URL unset', () => {
    delete process.env.PORTAL_BASE_URL;
    expect(customerProjectUrl('triarchsecurity')).toBe(
      'https://portal.triarch.dev/projects/triarchsecurity',
    );
  });

  it('customerReleaseUrl defaults to https://portal.triarch.dev/.../releases', () => {
    delete process.env.PORTAL_BASE_URL;
    expect(customerReleaseUrl('triarchsecurity')).toBe(
      'https://portal.triarch.dev/projects/triarchsecurity/releases',
    );
  });

  it('customerBugUrl interpolates slug + id under /bugs/', () => {
    delete process.env.PORTAL_BASE_URL;
    expect(customerBugUrl('triarchsecurity', 'abc-123')).toBe(
      'https://portal.triarch.dev/projects/triarchsecurity/bugs/abc-123',
    );
  });

  it('customerFeatureUrl interpolates slug + id under /features/', () => {
    delete process.env.PORTAL_BASE_URL;
    expect(customerFeatureUrl('triarchsecurity', 'abc-123')).toBe(
      'https://portal.triarch.dev/projects/triarchsecurity/features/abc-123',
    );
  });

  it('reads PORTAL_BASE_URL at call time (not module load) — localhost dev override works', () => {
    process.env.PORTAL_BASE_URL = 'http://localhost:3002';
    expect(customerProjectUrl('foo')).toBe('http://localhost:3002/projects/foo');
    expect(customerReleaseUrl('foo')).toBe('http://localhost:3002/projects/foo/releases');
  });

  it('handles trailing-slash-free base URL (no double slashes)', () => {
    process.env.PORTAL_BASE_URL = 'https://portal-dev.triarch.dev';
    expect(customerReleaseUrl('foo')).toBe('https://portal-dev.triarch.dev/projects/foo/releases');
  });
});
