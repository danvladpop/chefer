import { NextResponse, type NextRequest } from 'next/server';
import { loginPathFor, signedOutInvitePath } from '@/features/coaching/lib/next-path';
import { isMobileUserAgent } from '@/features/coaching/lib/open-in-app';

const PROTECTED_ROUTES = [
  '/dashboard',
  '/meal-plan',
  '/preferences',
  '/onboarding',
  '/tracker',
  '/history',
  '/my-weeks',
  '/recipes',
  '/ingredients',
  '/progress',
  '/shopping-list',
  '/profile',
  '/admin',
  '/premium',
  '/gym',
  '/trainer',
  '/coaching',
  '/household',
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isProtected = PROTECTED_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );

  if (!isProtected) {
    return NextResponse.next();
  }

  const session = request.cookies.get('chefer_session');
  if (!session?.value) {
    // A coaching or household invite on a phone: offer the app (and the stores)
    // before any sign-in. A rewrite, so the address stays the invite link.
    const invitePage = signedOutInvitePath(pathname);
    if (invitePage && isMobileUserAgent(request.headers.get('user-agent'))) {
      const url = request.nextUrl.clone();
      url.pathname = invitePage;
      return NextResponse.rewrite(url);
    }
    // An invite link: sign in (or register) and come straight back to it.
    return NextResponse.redirect(new URL(loginPathFor(pathname), request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/meal-plan/:path*',
    '/preferences/:path*',
    '/onboarding/:path*',
    '/tracker/:path*',
    '/history/:path*',
    '/my-weeks/:path*',
    '/recipes/:path*',
    '/ingredients/:path*',
    '/progress/:path*',
    '/shopping-list/:path*',
    '/admin/:path*',
    '/profile/:path*',
    '/premium/:path*',
    '/gym/:path*',
    '/trainer/:path*',
    '/coaching/:path*',
    '/household/:path*',
  ],
};
