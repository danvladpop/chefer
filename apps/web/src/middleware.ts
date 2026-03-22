import { NextResponse, type NextRequest } from 'next/server';

const PROTECTED_ROUTES = [
  '/dashboard',
  '/meal-plan',
  '/preferences',
  '/onboarding',
  '/tracker',
  '/history',
  '/recipes',
  '/progress',
  '/shopping-list',
  '/profile',
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
  matcher: [
    '/dashboard/:path*',
    '/meal-plan/:path*',
    '/preferences/:path*',
    '/onboarding/:path*',
    '/tracker/:path*',
    '/history/:path*',
    '/recipes/:path*',
    '/progress/:path*',
    '/shopping-list/:path*',
    '/profile/:path*',
  ],
};
