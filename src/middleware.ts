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
  '/privacy(.*)',
  '/terms(.*)',
  '/security(.*)',
  '/api/welcome(.*)',
  '/api/direct-booking(.*)',
  '/api/calendar(.*)',
  '/api/notify-signup(.*)',
  '/__clerk(.*)',
  // Next's generated metadata routes. Crawlers fetch these unauthenticated, and
  // opengraph-image has no file extension so the static-file exclusion in the
  // matcher below does not cover it — without this a share preview would fetch
  // a sign-in redirect instead of the image.
  '/opengraph-image(.*)',
  '/twitter-image(.*)',
]);

export const middleware = clerkMiddleware(async (auth, request) => {
  const host = request.headers.get('host') ?? '';
  const { pathname } = request.nextUrl;

  const isMarketingHost = MARKETING_HOSTS.includes(host);
  const isAppHost = host === 'app.hostcfo.com';

  // Without APP_URL the marketing branch below cannot redirect onward, and the
  // request would fall through and serve the authenticated app on the marketing
  // domain — wrong content, no error, indefinitely. Fail where it can be seen.
  // Scoped to marketing hosts so local and app-host traffic are unaffected.
  if (isMarketingHost && !APP_URL) {
    throw new Error(
      `NEXT_PUBLIC_APP_URL is not set, so requests to ${host} cannot be routed. ` +
      `Set it in the deployment environment before serving the marketing domain.`,
    );
  }

  if (isMarketingHost) {
    if (pathname === '/') return NextResponse.rewrite(new URL('/landing', request.url));
    if (
      pathname.startsWith('/onboarding') || pathname.startsWith('/landing') || pathname.startsWith('/sign-') ||
      pathname.startsWith('/privacy') || pathname.startsWith('/terms') || pathname.startsWith('/security')
    ) {
      return NextResponse.next();
    }
    return NextResponse.redirect(new URL(`${APP_URL}${pathname}`, request.url));
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
    // Everything else still runs middleware, because the hostname routing above
    // decides what a marketing-domain request is even allowed to see — that has
    // to apply to page requests, /landing included.
    //
    // What is excluded is static files, which need neither auth nor host
    // routing. Previously only _next assets and the favicon were skipped, so an
    // image, font or robots.txt still invoked Clerk on every request.
    '/((?!_next/static|_next/image|.*\\.(?:ico|png|jpg|jpeg|gif|svg|webp|avif|woff|woff2|ttf|otf|css|js|map|txt|xml|webmanifest)$).*)',
  ],
};
