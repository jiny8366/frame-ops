// Frame Ops — 개별 프레임 카드
// React.memo + 커스텀 비교로 SWR revalidate 시 불필요한 리렌더 차단

'use client';

import { memo } from 'react';
import Image from 'next/image';
import type { Product } from '@/types';

interface FrameCardProps {
  frame: Product;
  index: number;
  onClick: (frame: Product) => void;
  onPrefetch: (id: string) => void;
}

function FrameCardComponent({ frame, index, onClick, onPrefetch }: FrameCardProps) {
  const handleClick = () => onClick(frame);
  const handleMouseEnter = () => onPrefetch(frame.id);
  const handleFocus = () => onPrefetch(frame.id);

  return (
    <button
      type="button"
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onFocus={handleFocus}
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
            priority={index < 8}
            loading={index < 8 ? 'eager' : 'lazy'}
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

// 커스텀 비교: 내용 동일성만 확인 (image_url 등 표시 필드는 updated_at에 반영됨)
export const FrameCard = memo(FrameCardComponent, (prev, next) => {
  return (
    prev.frame.id === next.frame.id &&
    prev.frame.updated_at === next.frame.updated_at &&
    prev.frame.status === next.frame.status &&
    prev.index === next.index &&
    prev.onClick === next.onClick &&
    prev.onPrefetch === next.onPrefetch
  );
});
