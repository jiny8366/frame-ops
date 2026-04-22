// Frame Ops — 루트 레이아웃
// PWA 메타태그 + Vercel Analytics + SWR Providers

import type { Metadata, Viewport } from 'next';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { Providers } from './providers';
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

// ── 루트 레이아웃 ─────────────────────────────────────────────────────────────
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
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
      <body className="bg-surface text-gray-900 antialiased">
        <Providers>
          {children}
        </Providers>

        {/* Vercel Analytics — Web Vitals 자동 수집 */}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
