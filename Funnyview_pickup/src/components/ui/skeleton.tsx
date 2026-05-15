import { cn } from '@/lib/utils/cn';

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-lg bg-gray-200/70',
        className,
      )}
    />
  );
}

export function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="mt-2 h-5 w-3/4" />
      <Skeleton className="mt-3 h-3 w-full" />
      <Skeleton className="mt-2 h-3 w-1/2" />
    </div>
  );
}
