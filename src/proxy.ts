import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PASSTHROUGH_PREFIXES = ['/api/', '/login', '/_next/', '/favicon.ico'];

/**
 * Known-host allowlist. Admin only serves requests on:
 *   - admin.triarch.dev (production)
 *   - admin-dev.triarch.dev (dev backend custom domain)
 *   - admin-dev--triarch-dev-website.us-central1.hosted.app (FAH internal hostname for dev)
 *   - localhost:3000 / localhost:3001 (local dev)
 *
 * FAH proxies through Cloud Run, so the `host` header is the internal Cloud Run
 * hostname (e.g. `t-XXXX---triarch-dev-website-uc.a.run.app`). Cloud Run also
 * sets `x-forwarded-host` to the public domain. We accept either pointing at a
 * known admin host. See .planning/host-guard-inventory.md and PITFALLS.md Pitfall 5.
 */
const KNOWN_EXACT_HOSTS = new Set<string>([
  'admin.triarch.dev',
  'admin-dev.triarch.dev',
  'admin-dev--triarch-dev-website.us-central1.hosted.app',
  'localhost:3000',
  'localhost:3001',
]);

function isKnownHost(host: string | null, xForwardedHost: string | null): boolean {
  // Prefer x-forwarded-host (FAH/Cloud Run public domain); fall back to host.
  const candidates = [xForwardedHost, host]
    .filter((h): h is string => !!h)
    .map((h) => h.toLowerCase().split(',')[0].trim());

  for (const candidate of candidates) {
    if (KNOWN_EXACT_HOSTS.has(candidate)) return true;
    // FAH internal hostnames look like `t-XXXX---triarch-dev-website-uc.a.run.app`.
    // Accept them ONLY if x-forwarded-host already validated to a known admin host.
    // (We loop in order: x-forwarded-host first, host second. If we got here on the host
    // candidate without x-forwarded-host having matched, the request is suspicious.)
  }

  // Accept Cloud Run internal hostname only when the public domain (x-forwarded-host)
  // independently matches a known admin host. This prevents a raw curl-to-Cloud-Run
  // bypass while preserving normal FAH traffic.
  if (xForwardedHost) {
    const xfh = xForwardedHost.toLowerCase().split(',')[0].trim();
    if (KNOWN_EXACT_HOSTS.has(xfh) && host && /\.run\.app$/i.test(host.split(':')[0])) {
      return true;
    }
  }

  return false;
}

export default function proxy(request: NextRequest) {
  const host = request.headers.get('host');
  const xForwardedHost = request.headers.get('x-forwarded-host');
  const { pathname } = request.nextUrl;

  // Fail closed: any host not in the allowlist gets a flat 404 BEFORE any route is touched.
  // This is the Phase 17 / HOST-02 hardening — see PITFALLS.md Pitfall 5.
  if (!isKnownHost(host, xForwardedHost)) {
    return new NextResponse(null, { status: 404 });
  }

  // From here on, host is known. Preserve existing v2.1 admin-routing behavior.
  const effectiveHost = (xForwardedHost ?? host ?? '').toLowerCase().split(',')[0].trim();

  // Only apply admin-subdomain routing on the admin host.
  // localhost in dev gets straight passthrough — Next dev server handles its own routing.
  if (!effectiveHost.startsWith('admin.triarch') && !effectiveHost.startsWith('admin-dev')) {
    return NextResponse.next();
  }

  // Let API, login, static assets, and admin paths through
  if (
    pathname.startsWith('/admin') ||
    PASSTHROUGH_PREFIXES.some((p) => pathname.startsWith(p))
  ) {
    return NextResponse.next();
  }

  // Root path: redirect to /admin (browser URL changes)
  if (pathname === '/') {
    return NextResponse.redirect(new URL('/admin', request.url));
  }

  // Any other path on admin subdomain (e.g. marketing pages): rewrite to /admin
  return NextResponse.rewrite(new URL('/admin', request.url));
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico).*)'],
};
