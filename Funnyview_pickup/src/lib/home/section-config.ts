/**
 * 각 섹션 kind 의 config JSON 스키마 타입.
 * 관리자 UI 와 렌더러 양쪽이 이 타입을 공유.
 */

export interface HeroConfig {
  headline: string;
  subline?: string;
  imageUrl?: string;
  videoUrl?: string;
  bgColor?: string; // 이미지 미설정 시 폴백
  textColor?: string;
  ctaLabel?: string;
  ctaHref?: string;
  align?: 'left' | 'center';
}

export interface ProductGridConfig {
  // 자동 큐레이션 모드
  mode: 'manual' | 'best' | 'new' | 'trending';
  // mode=manual 일 때 lens.id 배열
  lensIds?: string[];
  // 표시 개수 (자동 모드 시)
  limit?: number;
  layout?: 'grid' | 'carousel';
  showPrice?: boolean;
  cardTone?: 'minimal' | 'photo';
}

export interface CategoryChipsConfig {
  // 칩으로 노출할 항목들
  items: Array<{
    label: string;
    href: string;
    emoji?: string;
    badge?: string; // NEW / HOT
  }>;
}

export interface BannerStripConfig {
  message: string;
  href?: string;
  bgColor?: string;
  textColor?: string;
  dismissible?: boolean;
}

export interface CountdownConfig {
  headline: string;
  subline?: string;
  endsAt: string; // ISO datetime
  ctaLabel?: string;
  ctaHref?: string;
  bgColor?: string;
  textColor?: string;
}

export interface BrandStoryConfig {
  brand: string;
  headline: string;
  body: string;
  imageUrl?: string;
  ctaLabel?: string;
  ctaHref?: string;
  layout?: 'image-left' | 'image-right' | 'image-top';
}

export type SectionKind =
  | 'hero'
  | 'product_grid'
  | 'category_chips'
  | 'banner_strip'
  | 'countdown'
  | 'brand_story';

export type SectionConfig =
  | { kind: 'hero'; config: HeroConfig }
  | { kind: 'product_grid'; config: ProductGridConfig }
  | { kind: 'category_chips'; config: CategoryChipsConfig }
  | { kind: 'banner_strip'; config: BannerStripConfig }
  | { kind: 'countdown'; config: CountdownConfig }
  | { kind: 'brand_story'; config: BrandStoryConfig };

/**
 * 기본 config (관리자에서 신규 추가 시 시드).
 */
export function defaultConfig(kind: SectionKind): Record<string, unknown> {
  switch (kind) {
    case 'hero':
      return {
        headline: '오늘의 콘택트렌즈',
        subline: '도수 입력 → 가까운 가맹점 픽업',
        bgColor: '#2563eb',
        textColor: '#ffffff',
        ctaLabel: '주문하기',
        ctaHref: '/customer/order',
        align: 'left',
      } satisfies HeroConfig;
    case 'product_grid':
      return {
        mode: 'best',
        limit: 4,
        layout: 'grid',
        showPrice: true,
        cardTone: 'minimal',
      } satisfies ProductGridConfig;
    case 'category_chips':
      return {
        items: [
          { label: '원데이', href: '/customer/order?type=1day', emoji: '☀️' },
          { label: '난시용', href: '/customer/order?type=toric', emoji: '✨' },
          { label: '컬러', href: '/customer/order?type=color', emoji: '🎨', badge: 'HOT' },
          { label: '2주용', href: '/customer/order?type=2week', emoji: '📅' },
        ],
      } satisfies CategoryChipsConfig;
    case 'banner_strip':
      return {
        message: '💎 신규 회원 5,000원 할인 쿠폰 증정',
        href: '/customer/order',
        bgColor: '#fef3c7',
        textColor: '#92400e',
      } satisfies BannerStripConfig;
    case 'countdown':
      return {
        headline: '오늘 자정까지',
        subline: '주말 픽업 한정 무료 케이스 증정',
        endsAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        ctaLabel: '지금 주문',
        ctaHref: '/customer/order',
        bgColor: '#0f172a',
        textColor: '#fbbf24',
      } satisfies CountdownConfig;
    case 'brand_story':
      return {
        brand: 'Acuvue',
        headline: '오아시스 원데이로 산뜻하게',
        body: '하루 종일 촉촉함이 유지되는 산소투과율 1위 렌즈.',
        ctaLabel: '제품 보기',
        ctaHref: '/customer/order?brand=Acuvue',
        layout: 'image-right',
      } satisfies BrandStoryConfig;
  }
}
