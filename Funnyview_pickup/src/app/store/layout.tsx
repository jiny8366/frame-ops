import { RoleHeader } from '@/components/layout/role-header';

const NAV = [
  { href: '/store', label: '대시보드' },
  { href: '/store/incoming', label: '배송 중' },
  { href: '/store/pickup', label: '픽업 처리' },
] as const;

export default function StoreLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      <RoleHeader role="store" nav={[...NAV]} />
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
