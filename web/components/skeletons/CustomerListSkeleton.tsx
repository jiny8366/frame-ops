// Frame Ops — 고객 목록 스켈레톤

export function CustomerRowSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white px-4 py-3 animate-pulse">
      {/* 아바타 */}
      <div className="h-10 w-10 shrink-0 rounded-full bg-gray-200" />
      <div className="flex-1 space-y-1.5">
        {/* 이름 */}
        <div className="h-4 w-24 rounded bg-gray-200" />
        {/* 전화번호 */}
        <div className="h-3 w-32 rounded bg-gray-200" />
      </div>
      {/* 날짜 */}
      <div className="h-3 w-16 rounded bg-gray-200" />
    </div>
  );
}

export function CustomerListSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <CustomerRowSkeleton key={i} />
      ))}
    </div>
  );
}
