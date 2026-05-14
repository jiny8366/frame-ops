import { NextResponse, type NextRequest } from 'next/server';
import { verifySession } from '@/lib/auth/jwt';

const COOKIE_NAME = process.env.SESSION_COOKIE_NAME ?? 'funnyview_pickup_session';

const ROLE_PREFIX: Record<string, string[]> = {
  customer: ['/customer'],
  warehouse_staff: ['/warehouse'],
  store_staff: ['/store'],
  admin: ['/customer', '/warehouse', '/store'],
};

function loginUrlFor(pathname: string, search: string) {
  if (pathname.startsWith('/warehouse')) return `/login/warehouse?next=${encodeURIComponent(pathname + search)}`;
  if (pathname.startsWith('/store')) return `/login/store?next=${encodeURIComponent(pathname + search)}`;
  return `/login?next=${encodeURIComponent(pathname + search)}`;
}

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // 보호 영역: /customer, /warehouse, /store
  const isProtected =
    pathname.startsWith('/customer') ||
    pathname.startsWith('/warehouse') ||
    pathname.startsWith('/store');

  if (!isProtected) return NextResponse.next();

  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.redirect(new URL(loginUrlFor(pathname, search), req.url));
  }

  const session = await verifySession(token);
  if (!session) {
    return NextResponse.redirect(new URL(loginUrlFor(pathname, search), req.url));
  }

  // 역할별 접근 허용 경로 검사
  const allowed = ROLE_PREFIX[session.role] ?? [];
  const ok = allowed.some((p) => pathname === p || pathname.startsWith(p + '/'));
  if (!ok) {
    return NextResponse.redirect(new URL('/', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/customer/:path*', '/warehouse/:path*', '/store/:path*'],
};
