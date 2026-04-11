import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PASSTHROUGH_PREFIXES = ['/api/', '/login', '/_next/', '/favicon.ico'];

export function middleware(request: NextRequest) {
  const hostname = request.headers.get('host') ?? '';
  const { pathname } = request.nextUrl;

  // Only apply domain-based routing to admin.triarch.dev
  if (!hostname.startsWith('admin.triarch')) {
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
