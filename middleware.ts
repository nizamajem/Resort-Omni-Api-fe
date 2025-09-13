import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PUBLIC_PATHS = ['/login'];

function isPublic(pathname: string) {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  if (pathname.startsWith('/_next')) return true;
  return false;
}

const isSuper = (r?: string | null) => r === 'superadmin';
const isTenant = (r?: string | null) => r === 'tenant' || r === 'resort';

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow public
  if (isPublic(pathname)) {
    if (pathname === '/login') {
      const role = req.cookies.get('role')?.value;
      if (isSuper(role)) return NextResponse.redirect(new URL('/history', req.url));
      if (isTenant(role)) return NextResponse.redirect(new URL('/dashboard', req.url));
    }
    return NextResponse.next();
  }

  // Allow static assets and favicon quickly
  if (pathname.startsWith('/favicon.ico') || pathname.startsWith('/assets') || pathname.startsWith('/images') || pathname.startsWith('/_next')) {
    return NextResponse.next();
  }

  // Require auth
  // const role = req.cookies.get('role')?.value;
  // if (!role) {
  //   const url = new URL('/login', req.url);
  //   url.searchParams.set('next', pathname);
  //   return NextResponse.redirect(url);
  // }

  // Restrict admin to superadmin
  // if (pathname.startsWith('/admin') && !isSuper(role)) {
  //   return NextResponse.redirect(new URL('/dashboard', req.url));
  // }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};

