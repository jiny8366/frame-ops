// Frame Ops — 가상 스크롤 제품 목록
// react-window — 보이는 영역만 렌더링하여 1000개+ 제품도 60fps 유지

'use client';

import { useCallback, useRef } from 'react';
import { FixedSizeGrid } from 'react-window';
import InfiniteLoader from 'react-window-infinite-loader';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { prefetchHandlers, usePrefetchFrame } from '@/hooks/usePrefetch';
import type { Product } from '@/types';

interface VirtualFrameListProps {
  frames: Product[];
  onLoadMore?: () => void;
  hasMore?: boolean;
}

const COLUMN_COUNT = 2;
const ROW_HEIGHT = 220;   // px — 카드 높이
const CARD_GAP = 12;       // px — 카드 간격
const PADDING = 16;        // px — 양쪽 패딩

export function VirtualFrameList({
  frames,
  onLoadMore,
  hasMore = false,
}: VirtualFrameListProps) {
  const router = useRouter();
  const prefetch = usePrefetchFrame();
  const containerRef = useRef<HTMLDivElement>(null);

  const rowCount = Math.ceil(frames.length / COLUMN_COUNT) + (hasMore ? 1 : 0);
  const containerWidth = typeof window !== 'undefined'
    ? Math.min(window.innerWidth, 768) - PADDING * 2
    : 320;
  const columnWidth = (containerWidth - CARD_GAP) / COLUMN_COUNT;

  const isItemLoaded = useCallback(
    (index: number) => !hasMore || index < Math.ceil(frames.length / COLUMN_COUNT),
    [frames.length, hasMore]
  );

  // 그리드 셀 렌더러
  const Cell = useCallback(
    ({
      columnIndex,
      rowIndex,
      style,
    }: {
      columnIndex: number;
      rowIndex: number;
      style: React.CSSProperties;
    }) => {
      const frameIndex = rowIndex * COLUMN_COUNT + columnIndex;
      const frame = frames[frameIndex];
      if (!frame) return null;

      return (
        <div
          style={{
            ...style,
            paddingRight: columnIndex === 0 ? CARD_GAP / 2 : 0,
            paddingLeft: columnIndex === 1 ? CARD_GAP / 2 : 0,
            paddingBottom: CARD_GAP,
          }}
        >
          <FrameCard
            frame={frame}
            onClick={() => router.push(`/frames/${frame.id}`)}
            prefetchHandlers={prefetchHandlers(frame.id, prefetch)}
          />
        </div>
      );
    },
    [frames, router, prefetch]
  );

  return (
    <div ref={containerRef}>
      <InfiniteLoader
        isItemLoaded={isItemLoaded}
        itemCount={hasMore ? rowCount + 1 : rowCount}
        loadMoreItems={onLoadMore ?? (() => {})}
      >
        {({ onItemsRendered, ref }) => (
          <FixedSizeGrid
            ref={ref}
            columnCount={COLUMN_COUNT}
            columnWidth={columnWidth}
            height={typeof window !== 'undefined' ? window.innerHeight - 160 : 600}
            rowCount={rowCount}
            rowHeight={ROW_HEIGHT}
            width={containerWidth}
            onItemsRendered={({
              visibleRowStartIndex,
              visibleRowStopIndex,
              visibleColumnStartIndex,
              visibleColumnStopIndex,
            }) =>
              onItemsRendered({
                overscanStartIndex: visibleRowStartIndex * COLUMN_COUNT + visibleColumnStartIndex,
                overscanStopIndex: visibleRowStopIndex * COLUMN_COUNT + visibleColumnStopIndex,
                visibleStartIndex: visibleRowStartIndex * COLUMN_COUNT + visibleColumnStartIndex,
                visibleStopIndex: visibleRowStopIndex * COLUMN_COUNT + visibleColumnStopIndex,
              })
            }
          >
            {Cell}
          </FixedSizeGrid>
        )}
      </InfiniteLoader>
    </div>
  );
}

// ── 개별 카드 ─────────────────────────────────────────────────────────────────
function FrameCard({
  frame,
  onClick,
  prefetchHandlers: handlers,
}: {
  frame: Product;
  onClick: () => void;
  prefetchHandlers: ReturnType<typeof prefetchHandlers>;
}) {
  return (
    <button
      onClick={onClick}
      {...handlers}
      className="
        w-full rounded-xl border border-gray-100 bg-white p-3 text-left shadow-sm
        active:scale-95 active:shadow-none transition-transform duration-100
      "
    >
      {/* 제품 이미지 */}
      <div className="relative mb-2 h-28 w-full overflow-hidden rounded-lg bg-gray-50">
        {frame.image_url ? (
          <Image
            src={frame.image_url}
            alt={frame.display_name ?? frame.style_code}
            fill
            className="object-contain"
            sizes="(max-width: 768px) 50vw, 33vw"
            placeholder="blur"
            blurDataURL="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
          />
        ) : (
          <div className="flex h-full items-center justify-center text-3xl text-gray-300">
            👓
          </div>
        )}
      </div>

      {/* 브랜드 */}
      <p className="text-caption2 font-medium text-brand-600 truncate">
        {frame.brand?.name ?? ''}
      </p>
      {/* 스타일코드 / 컬러 */}
      <p className="text-footnote font-semibold text-gray-900 truncate">
        {frame.style_code}/{frame.color_code}
      </p>
      {/* 제품명 */}
      {frame.display_name && (
        <p className="text-caption1 text-gray-500 truncate">{frame.display_name}</p>
      )}
      {/* 가격 */}
      {frame.sale_price && (
        <p className="mt-1 text-subhead font-bold text-gray-900">
          {frame.sale_price.toLocaleString()}원
        </p>
      )}
    </button>
  );
}
