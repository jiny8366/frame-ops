// Frame Ops Web — 인증 미들웨어
// 비로그인 사용자는 /login 으로 리다이렉트. /login, /api/auth/*, _next, 정적 자원은 통과.

import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySession } from '@/lib/auth/session';
import { isHqRole } from '@/lib/auth/permissions';

const PUBLIC_PATHS = ['/login'];
// 인증 불필요 — /api/auth/* (로그인 흐름) + /api/health (cold-start 방지 워머)
const PUBLIC_API_PREFIXES = ['/api/auth/', '/api/health'];
const HQ_PREFIXES = ['/hq', '/api/hq/'];

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  if (PUBLIC_API_PREFIXES.some((p) => pathname.startsWith(p))) return true;
  return false;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySession(token) : null;

  if (!session) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { data: null, error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 본사 전용 영역(/hq, /api/hq) 은 hq_* role 만 통과
  const isHqPath = HQ_PREFIXES.some((p) => pathname === p || pathname.startsWith(p));
  if (isHqPath && !isHqRole(session.role_code)) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { data: null, error: '본사 권한이 필요합니다.' },
        { status: 403 }
      );
    }
    // 비본사 사용자가 본사 URL 접근 시 홈으로
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = '/';
    homeUrl.search = '';
    return NextResponse.redirect(homeUrl);
  }

  return NextResponse.next();
}

// 미들웨어 매처: _next, 정적 파일, favicon, manifest, sw 제외
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|workbox-.*\\.js|icons/.*).*)',
  ],
};
