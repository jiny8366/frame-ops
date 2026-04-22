// Frame Ops — 제품 카드 스켈레톤

export function FrameCardSkeleton() {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm animate-pulse">
      {/* 이미지 영역 */}
      <div className="mb-3 h-40 w-full rounded-lg bg-gray-200" />
      {/* 브랜드 */}
      <div className="mb-1 h-3 w-16 rounded bg-gray-200" />
      {/* 제품명 */}
      <div className="mb-2 h-4 w-3/4 rounded bg-gray-200" />
      {/* 스타일 코드 */}
      <div className="mb-3 h-3 w-1/2 rounded bg-gray-200" />
      {/* 가격 */}
      <div className="h-5 w-24 rounded bg-gray-200" />
    </div>
  );
}

/** 카드 그리드 스켈레톤 (n개) */
export function FrameCardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <FrameCardSkeleton key={i} />
      ))}
    </div>
  );
}
