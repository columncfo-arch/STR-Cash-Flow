import { NextRequest, NextResponse } from 'next/server';

const MARKETING_HOSTS = ['hostcfo.com', 'www.hostcfo.com'];
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
const MARKETING_URL = process.env.NEXT_PUBLIC_MARKETING_URL ?? 'http://localhost:3000';

export function middleware(request: NextRequest) {
  const host = request.headers.get('host') ?? '';
  const { pathname } = request.nextUrl;

  const isMarketingHost = MARKETING_HOSTS.includes(host);
  // In dev (localhost) or on Vercel preview URLs, don't redirect — serve everything normally
  const isProd = MARKETING_HOSTS.includes(host) || host === 'app.hostcfo.com';

  if (!isProd) return NextResponse.next();

  if (isMarketingHost) {
    // Root and /onboarding are valid on the marketing site
    if (pathname === '/' || pathname === '/landing') {
      return NextResponse.rewrite(new URL('/landing', request.url));
    }
    if (pathname.startsWith('/onboarding')) {
      return NextResponse.next();
    }
    // Everything else (app routes) → redirect to app subdomain
    return NextResponse.redirect(new URL(`${APP_URL}${pathname}`, request.url));
  }

  // app.hostcfo.com — redirect marketing paths to root domain
  if (pathname === '/landing' || pathname === '/') {
    return NextResponse.redirect(new URL(MARKETING_URL, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon\\.ico).*)'],
};
