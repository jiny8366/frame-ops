import { cn } from '@/lib/utils/cn';
import { ORDER_STATUS_LABEL, type OrderStatus } from '@/types/order';

const STATUS_COLOR: Record<OrderStatus, string> = {
  pending: 'bg-gray-100 text-gray-700',
  paid: 'bg-blue-100 text-blue-700',
  accepted: 'bg-cyan-100 text-cyan-700',
  picking: 'bg-indigo-100 text-indigo-700',
  shipped: 'bg-emerald-100 text-emerald-700',
  arrived: 'bg-amber-100 text-amber-700',
  ready: 'bg-orange-100 text-orange-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
};

export function StatusBadge({ status }: { status: OrderStatus | string }) {
  const color = STATUS_COLOR[status as OrderStatus] ?? 'bg-gray-100 text-gray-700';
  const label = ORDER_STATUS_LABEL[status as OrderStatus] ?? status;
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', color)}>
      {label}
    </span>
  );
}
