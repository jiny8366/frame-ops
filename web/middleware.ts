// Frame Ops Web — 인증 + 권한 미들웨어 (deep guard)
// 비로그인 사용자는 /login 으로 리다이렉트.
// 로그인했어도 라우트별 필요 권한이 없으면 /forbidden 으로 리다이렉트.
// /login, /api/auth/*, _next, 정적 자원은 통과.

import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySession } from '@/lib/auth/session';
import { isHqRole } from '@/lib/auth/permissions';
import { getRequiredPermission } from '@/lib/auth/route-permissions';

const PUBLIC_PATHS = ['/login', '/forbidden'];
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
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = '/';
    homeUrl.search = '';
    return NextResponse.redirect(homeUrl);
  }

  // 라우트별 권한 매핑 검사 (페이지에만 적용 — API 는 각 라우트가 자체 가드)
  if (!pathname.startsWith('/api/')) {
    const required = getRequiredPermission(pathname);
    if (required && !session.permissions?.includes(required)) {
      const forbiddenUrl = request.nextUrl.clone();
      forbiddenUrl.pathname = '/forbidden';
      forbiddenUrl.search = '';
      forbiddenUrl.searchParams.set('from', pathname);
      forbiddenUrl.searchParams.set('need', required);
      return NextResponse.redirect(forbiddenUrl);
    }
  }

  return NextResponse.next();
}

// 미들웨어 매처: _next, 정적 파일, favicon, manifest, sw 제외
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|workbox-.*\\.js|icons/.*).*)',
  ],
};
