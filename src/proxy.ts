import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

const MARKETING_HOSTS = ['hostcfo.com', 'www.hostcfo.com'];
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? '';
const MARKETING_URL = process.env.NEXT_PUBLIC_MARKETING_URL ?? '';

// Routes accessible without logging in
const isPublicRoute = createRouteMatcher([
  '/landing(.*)',
  '/onboarding(.*)',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/welcome(.*)',
  '/book(.*)',
  '/book-direct(.*)',
  '/api/welcome(.*)',
  '/api/direct-booking(.*)',
  '/api/calendar(.*)',
  '/api/notify-signup(.*)',
]);

export const proxy = clerkMiddleware(async (auth, request) => {
  const host = request.headers.get('host') ?? '';
  const { pathname } = request.nextUrl;

  const isMarketingHost = !!APP_URL && MARKETING_HOSTS.includes(host);
  const isAppHost = host === 'app.hostcfo.com';

  if (isMarketingHost) {
    if (pathname === '/') return NextResponse.rewrite(new URL('/landing', request.url));
    if (pathname.startsWith('/onboarding') || pathname.startsWith('/landing') || pathname.startsWith('/sign-')) {
      return NextResponse.next();
    }
    if (APP_URL) return NextResponse.redirect(new URL(`${APP_URL}${pathname}`, request.url));
  }

  if (isAppHost) {
    if ((pathname === '/' || pathname === '/landing') && MARKETING_URL) {
      const { userId } = await auth();
      if (!userId) {
        return NextResponse.redirect(new URL(MARKETING_URL, request.url));
      }
    }
  }

  if (!isPublicRoute(request)) {
    await auth.protect();
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    '/(api|trpc)(.*)',
    '/__clerk/:path*',
    '/((?!_next/static|_next/image|favicon\\.ico).*)',
  ],
};
