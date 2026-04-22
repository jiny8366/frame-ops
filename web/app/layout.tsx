// Frame Ops — 루트 레이아웃
// PWA 메타태그 + Vercel Analytics + SWR Providers

import type { Metadata, Viewport } from 'next';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { Providers } from './providers';
import { Header, BottomTabBar } from '@/components/layout/Header';
import './globals.css';

// ── 메타데이터 ────────────────────────────────────────────────────────────────
export const metadata: Metadata = {
  title: {
    template: '%s | Frame Ops',
    default: 'Frame Ops — 안경 프레임 운영 관리',
  },
  description: '안경 프레임 재고, 고객, 처방전, 판매를 한 곳에서 관리하는 시스템',
  applicationName: 'Frame Ops',
  authors: [{ name: 'JINY (GENIUS OPTICAL)' }],
  keywords: ['안경', '프레임', '재고관리', 'POS', '처방전'],

  // PWA manifest
  manifest: '/manifest.json',

  // Apple 관련 메타태그
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Frame Ops',
  },

  // Open Graph
  openGraph: {
    type: 'website',
    siteName: 'Frame Ops',
    title: 'Frame Ops',
    description: '안경 프레임 운영 관리 시스템',
  },

  // 아이콘
  icons: {
    icon: [
      { url: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
    ],
  },
};

// ── 뷰포트 설정 ───────────────────────────────────────────────────────────────
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)',  color: '#1a1a1a' },
  ],
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',  // iPhone 노치 대응
};

// ── FOUC 방지 인라인 스크립트 ─────────────────────────────────────────────────
// React 렌더링 전에 실행 → 테마 깜빡임 없음
// dangerouslySetInnerHTML 사용 (Next.js Script beforeInteractive는 App Router 미지원)
const FOUC_PREVENTION_SCRIPT = `
(function() {
  try {
    var stored = localStorage.getItem('frameops-theme') || 'system';
    var systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var resolved = stored === 'system' ? (systemDark ? 'dark' : 'light') : stored;
    document.documentElement.setAttribute('data-theme', resolved);
    document.documentElement.style.colorScheme = resolved;
  } catch(e) {
    // SSR or privacy mode — 기본 라이트 모드 유지
  }
})();
`.trim();

// ── 루트 레이아웃 ─────────────────────────────────────────────────────────────
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        {/*
          FOUC 방지: <head> 최상단에서 즉시 실행
          React hydration 전에 data-theme 속성 주입 → 흰 화면 깜빡임 없음
        */}
        <script dangerouslySetInnerHTML={{ __html: FOUC_PREVENTION_SCRIPT }} />

        {/* Apple Web App 관련 */}
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-touch-fullscreen" content="yes" />
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
        <link rel="apple-touch-icon" sizes="192x192" href="/icons/icon-192x192.png" />
        <link rel="apple-touch-icon" sizes="512x512" href="/icons/icon-512x512.png" />

        {/* Splash screen 컬러 */}
        <meta name="msapplication-TileColor" content="#1a1a1a" />
        <meta name="msapplication-tap-highlight" content="no" />
      </head>
      <body
        className="antialiased"
        style={{ backgroundColor: 'var(--color-bg-primary)', color: 'var(--color-label-primary)' }}
      >
        <Providers>
          {/* 상단 헤더 (데스크톱 + 모바일) */}
          <Header />

          {/* 메인 콘텐츠 영역 — 모바일에서 하단 탭바 여백 확보 */}
          <main className="min-h-screen pb-[calc(49px+env(safe-area-inset-bottom))] md:pb-0">
            {children}
          </main>

          {/* 모바일 하단 탭바 */}
          <BottomTabBar />
        </Providers>

        {/* Vercel Analytics — Web Vitals 자동 수집 */}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
