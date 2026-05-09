import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import proxy from './proxy';

function makeRequest(opts: {
  url?: string;
  host?: string;
  xForwardedHost?: string;
}) {
  const url = opts.url ?? 'https://admin.triarch.dev/admin';
  const headers = new Headers();
  if (opts.host !== undefined) headers.set('host', opts.host);
  if (opts.xForwardedHost) headers.set('x-forwarded-host', opts.xForwardedHost);
  return new NextRequest(url, { headers });
}

describe('proxy middleware host allowlist', () => {
  describe('known hosts pass through', () => {
    it('admin.triarch.dev passes through', () => {
      const res = proxy(makeRequest({ host: 'admin.triarch.dev' }));
      expect(res.status).not.toBe(404);
    });

    it('admin-dev.triarch.dev passes through', () => {
      const res = proxy(makeRequest({ host: 'admin-dev.triarch.dev' }));
      expect(res.status).not.toBe(404);
    });

    it('localhost:3000 passes through', () => {
      const res = proxy(makeRequest({ url: 'http://localhost:3000/admin', host: 'localhost:3000' }));
      expect(res.status).not.toBe(404);
    });

    it('localhost:3001 passes through', () => {
      const res = proxy(makeRequest({ url: 'http://localhost:3001/admin', host: 'localhost:3001' }));
      expect(res.status).not.toBe(404);
    });

    it('FAH internal hostname with x-forwarded-host: admin.triarch.dev passes through', () => {
      const res = proxy(makeRequest({
        host: 't-abc---triarch-dev-website-uc.a.run.app',
        xForwardedHost: 'admin.triarch.dev',
      }));
      expect(res.status).not.toBe(404);
    });

    it('www.triarch.dev passes through', () => {
      const res = proxy(makeRequest({ url: 'https://www.triarch.dev/', host: 'www.triarch.dev' }));
      expect(res.status).not.toBe(404);
    });

    it('FAH internal hostname with x-forwarded-host: www.triarch.dev passes through', () => {
      const res = proxy(makeRequest({
        url: 'https://www.triarch.dev/',
        host: 't-abc---triarch-dev-website-uc.a.run.app',
        xForwardedHost: 'www.triarch.dev',
      }));
      expect(res.status).not.toBe(404);
    });
  });

  describe('unknown hosts fail closed with 404', () => {
    it('portal.triarch.dev returns 404 (the primary guard)', () => {
      const res = proxy(makeRequest({ host: 'portal.triarch.dev' }));
      expect(res.status).toBe(404);
    });

    it('evil.example.com returns 404', () => {
      const res = proxy(makeRequest({ host: 'evil.example.com' }));
      expect(res.status).toBe(404);
    });

    it('missing host returns 404', () => {
      const res = proxy(makeRequest({ host: undefined }));
      expect(res.status).toBe(404);
    });
  });
});
