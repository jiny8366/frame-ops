// Frame Ops — 처방전 스켈레톤

export function PrescriptionSkeleton() {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-5 animate-pulse">
      {/* 날짜 헤더 */}
      <div className="mb-4 flex items-center justify-between">
        <div className="h-4 w-28 rounded bg-gray-200" />
        <div className="h-3 w-16 rounded bg-gray-200" />
      </div>

      {/* 처방 테이블 헤더 */}
      <div className="mb-2 grid grid-cols-6 gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-3 rounded bg-gray-200" />
        ))}
      </div>

      {/* 우안 행 */}
      <div className="mb-2 grid grid-cols-6 gap-2">
        <div className="h-4 w-6 rounded bg-gray-200" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-4 rounded bg-gray-200" />
        ))}
      </div>

      {/* 좌안 행 */}
      <div className="grid grid-cols-6 gap-2">
        <div className="h-4 w-6 rounded bg-gray-200" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-4 rounded bg-gray-200" />
        ))}
      </div>

      {/* 메모 */}
      <div className="mt-4 h-3 w-3/4 rounded bg-gray-200" />
    </div>
  );
}

export function PrescriptionListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <PrescriptionSkeleton key={i} />
      ))}
    </div>
  );
}
