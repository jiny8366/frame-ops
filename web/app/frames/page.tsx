// Frame Ops — 프레임 재고 목록 (가상 스크롤)
'use client';

import dynamic from 'next/dynamic';
import type { Metadata } from 'next';
import { useState } from 'react';
import { useFramesData } from '@/hooks/useFramesData';
import { FrameCardGridSkeleton } from '@/components/skeletons';

// 가상 스크롤 — 초기 번들에서 제외 (ssr: false)
const VirtualFrameList = dynamic(
  () => import('@/components/frames/VirtualFrameList').then((m) => m.VirtualFrameList),
  {
    ssr: false,
    loading: () => <FrameCardGridSkeleton count={6} />,
  }
);

export default function FramesPage() {
  const [search, setSearch] = useState('');
  const { frames, isLoading, isValidating } = useFramesData({ search });

  return (
    <main className="min-h-screen bg-surface-secondary safe-padding">
      {/* 헤더 */}
      <div className="sticky top-0 z-10 bg-surface-secondary/95 backdrop-blur-sm px-4 pt-4 pb-3 border-b border-gray-100">
        <h1 className="text-title2 font-bold mb-3">재고 조회</h1>
        <div className="relative">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="스타일코드, 제품명 검색..."
            className="
              w-full rounded-xl border border-gray-200 bg-white
              px-4 py-3 text-body placeholder:text-gray-400
              focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100
            "
          />
          {isValidating && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
            </div>
          )}
        </div>
        <p className="mt-2 text-caption1 text-gray-400">
          {frames.length.toLocaleString()}개 제품
        </p>
      </div>

      {/* 목록 */}
      <div className="p-4">
        {isLoading ? (
          <FrameCardGridSkeleton count={6} />
        ) : (
          <VirtualFrameList frames={frames} />
        )}
      </div>
    </main>
  );
}
