import { RoleHeader } from '@/components/layout/role-header';

const NAV = [
  { href: '/warehouse', label: '대시보드' },
  { href: '/warehouse/orders', label: '주문 처리' },
  { href: '/warehouse/picklist', label: '픽리스트' },
  { href: '/warehouse/shipments', label: '출고 관리' },
  { href: '/warehouse/inventory', label: '재고' },
] as const;

export default function WarehouseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      <RoleHeader role="warehouse" nav={[...NAV]} />
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
