// Frame Ops — 가상 스크롤 제품 목록
// react-window — 보이는 영역만 렌더링하여 1000개+ 제품도 60fps 유지

'use client';

import { useCallback, useMemo } from 'react';
import { FixedSizeGrid, type GridChildComponentProps } from 'react-window';
import InfiniteLoader from 'react-window-infinite-loader';
import { useRouter } from 'next/navigation';
import { FrameCard } from './FrameCard';
import { usePrefetchFrame } from '@/hooks/usePrefetch';
import { useContainerSize } from '@/hooks/useContainerSize';
import type { Product } from '@/types';

interface VirtualFrameListProps {
  frames: Product[];
  onLoadMore?: () => void;
  hasMore?: boolean;
}

const COLUMN_COUNT = 2;
const ROW_HEIGHT = 220;            // px — 카드 높이
const CARD_GAP = 12;               // px — 카드 간격
const MAX_CONTENT_WIDTH = 768;     // px — 상한 (iPad 포트레이트 기준)
const HEADER_FOOTER_OFFSET = 160;  // px — 상단 헤더 + 하단 탭바

// Cell이 사용할 데이터 뭉치 — itemData 패턴으로 frames 참조 변경 영향 격리
interface CellData {
  frames: Product[];
  onCardClick: (frame: Product) => void;
  onPrefetch: (id: string) => void;
}

// Cell은 컴포넌트 외부에 선언 — 부모 렌더마다 클로저 재생성 방지
function Cell({
  columnIndex,
  rowIndex,
  style,
  data,
}: GridChildComponentProps<CellData>) {
  const { frames, onCardClick, onPrefetch } = data;
  const index = rowIndex * COLUMN_COUNT + columnIndex;
  const frame = frames[index];
  if (!frame) return <div style={style} />;

  const adjustedStyle: React.CSSProperties = {
    ...style,
    paddingRight: columnIndex === 0 ? CARD_GAP / 2 : 0,
    paddingLeft: columnIndex === 1 ? CARD_GAP / 2 : 0,
    paddingBottom: CARD_GAP,
  };

  return (
    <div style={adjustedStyle}>
      <FrameCard
        frame={frame}
        index={index}
        onClick={onCardClick}
        onPrefetch={onPrefetch}
      />
    </div>
  );
}

export function VirtualFrameList({
  frames,
  onLoadMore,
  hasMore = false,
}: VirtualFrameListProps) {
  const router = useRouter();
  const prefetch = usePrefetchFrame();
  const {
    ref: containerRef,
    width: measuredWidth,
    height: gridHeight,
  } = useContainerSize<HTMLDivElement>(HEADER_FOOTER_OFFSET);

  const rowCount = Math.ceil(frames.length / COLUMN_COUNT) + (hasMore ? 1 : 0);
  const containerWidth = Math.min(measuredWidth, MAX_CONTENT_WIDTH);
  const columnWidth = containerWidth > 0
    ? (containerWidth - CARD_GAP) / COLUMN_COUNT
    : 0;

  // 클릭 핸들러 메모이제이션 — router 변경 시에만 재생성
  const handleCardClick = useCallback((frame: Product) => {
    router.push(`/frames/${frame.id}`);
  }, [router]);

  // itemData 메모이제이션 — frames / 핸들러 참조 변경 시에만 재생성
  const itemData = useMemo<CellData>(() => ({
    frames,
    onCardClick: handleCardClick,
    onPrefetch: prefetch,
  }), [frames, handleCardClick, prefetch]);

  const isItemLoaded = useCallback(
    (rowIdx: number) => !hasMore || rowIdx < Math.ceil(frames.length / COLUMN_COUNT),
    [frames.length, hasMore]
  );

  // InfiniteLoader의 itemCount가 행 단위이므로 인덱스도 행 단위 유지
  const makeRowOnItemsRendered = useCallback(
    (
      innerOnItemsRendered: (props: {
        overscanStartIndex: number;
        overscanStopIndex: number;
        visibleStartIndex: number;
        visibleStopIndex: number;
      }) => void,
    ) =>
      ({
        overscanRowStartIndex,
        overscanRowStopIndex,
        visibleRowStartIndex,
        visibleRowStopIndex,
      }: {
        overscanRowStartIndex: number;
        overscanRowStopIndex: number;
        visibleRowStartIndex: number;
        visibleRowStopIndex: number;
      }) => {
        innerOnItemsRendered({
          overscanStartIndex: overscanRowStartIndex,
          overscanStopIndex: overscanRowStopIndex,
          visibleStartIndex: visibleRowStartIndex,
          visibleStopIndex: visibleRowStopIndex,
        });
      },
    []
  );

  return (
    <div ref={containerRef} className="w-full">
      {containerWidth > 0 && gridHeight > 0 && (
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
              height={gridHeight}
              rowCount={rowCount}
              rowHeight={ROW_HEIGHT}
              width={containerWidth}
              itemData={itemData}
              onItemsRendered={makeRowOnItemsRendered(onItemsRendered)}
              overscanRowCount={2}
            >
              {Cell}
            </FixedSizeGrid>
          )}
        </InfiniteLoader>
      )}
    </div>
  );
}
