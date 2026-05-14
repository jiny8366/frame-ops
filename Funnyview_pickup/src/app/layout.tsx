import type { Metadata, Viewport } from 'next';
import { ServiceWorkerRegister } from '@/components/pwa/sw-register';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Funnyview Pickup',
    template: '%s | Funnyview Pickup',
  },
  description: '콘택트렌즈 픽업서비스 - 주문하고 가까운 가맹점에서 픽업하세요',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'Funnyview Pickup',
    statusBarStyle: 'default',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#2563eb',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className="min-h-screen antialiased">
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  );
}
