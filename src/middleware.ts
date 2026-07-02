import { NextRequest, NextResponse } from 'next/server';

const MARKETING_HOSTS = ['hostcfo.com', 'www.hostcfo.com'];
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? '';
const MARKETING_URL = process.env.NEXT_PUBLIC_MARKETING_URL ?? '';

export function middleware(request: NextRequest) {
  const host = request.headers.get('host') ?? '';
  const { pathname } = request.nextUrl;

  const isMarketingHost = MARKETING_HOSTS.includes(host);
  const isAppHost = host === 'app.hostcfo.com';

  if (isMarketingHost) {
    // Serve landing page at root
    if (pathname === '/') {
      return NextResponse.rewrite(new URL('/landing', request.url));
    }
    // Allow onboarding through
    if (pathname.startsWith('/onboarding') || pathname.startsWith('/landing')) {
      return NextResponse.next();
    }
    // All other routes → redirect to app subdomain
    if (APP_URL) {
      return NextResponse.redirect(new URL(`${APP_URL}${pathname}`, request.url));
    }
  }

  if (isAppHost) {
    // Redirect landing/root to marketing site
    if ((pathname === '/' || pathname === '/landing') && MARKETING_URL) {
      return NextResponse.redirect(new URL(MARKETING_URL, request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon\\.ico).*)'],
};
