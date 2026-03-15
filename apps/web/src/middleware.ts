import { type NextRequest, NextResponse } from 'next/server';

const PROTECTED_ROUTES = [
  '/dashboard',
  '/meal-plan',
  '/preferences',
  '/onboarding',
  '/tracker',
  '/history',
  '/cookbook',
  '/progress',
  '/shopping-list',
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
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('from', pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  /*
   * Match only the protected route prefixes directly.
   * This avoids running middleware on every request (_next, static, api, etc.)
   */
  matcher: [
    '/dashboard/:path*',
    '/meal-plan/:path*',
    '/preferences/:path*',
    '/onboarding/:path*',
    '/tracker/:path*',
    '/history/:path*',
    '/cookbook/:path*',
    '/progress/:path*',
    '/shopping-list/:path*',
  ],
};
