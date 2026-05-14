/**
 * 카카오맵 · 네이버지도 · T맵 URL 생성기.
 * Store 에 저장된 URL 이 있으면 우선, 없으면 lat/lng + 명칭으로 생성.
 */

export interface StoreLocationLike {
  name: string;
  addressLine1?: string | null;
  latitude?: string | number | null;
  longitude?: string | number | null;
  kakaoMapUrl?: string | null;
  naverMapUrl?: string | null;
  tmapUrl?: string | null;
}

function asNumber(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === 'string' ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : null;
}

export function kakaoMapUrl(store: StoreLocationLike): string | null {
  if (store.kakaoMapUrl) return store.kakaoMapUrl;
  const lat = asNumber(store.latitude);
  const lng = asNumber(store.longitude);
  if (lat != null && lng != null) {
    return `https://map.kakao.com/link/map/${encodeURIComponent(store.name)},${lat},${lng}`;
  }
  if (store.addressLine1) {
    return `https://map.kakao.com/?q=${encodeURIComponent(store.addressLine1)}`;
  }
  return null;
}

export function naverMapUrl(store: StoreLocationLike): string | null {
  if (store.naverMapUrl) return store.naverMapUrl;
  const lat = asNumber(store.latitude);
  const lng = asNumber(store.longitude);
  if (lat != null && lng != null) {
    return `https://map.naver.com/v5/?c=${lng},${lat},15,0,0,0,dh`;
  }
  if (store.addressLine1) {
    return `https://map.naver.com/v5/search/${encodeURIComponent(store.addressLine1)}`;
  }
  return null;
}

export function tmapUrl(store: StoreLocationLike): string | null {
  if (store.tmapUrl) return store.tmapUrl;
  const lat = asNumber(store.latitude);
  const lng = asNumber(store.longitude);
  if (lat != null && lng != null) {
    return `tmap://route?goalname=${encodeURIComponent(store.name)}&goalx=${lng}&goaly=${lat}`;
  }
  return null;
}

export function mapLinks(store: StoreLocationLike) {
  return {
    kakao: kakaoMapUrl(store),
    naver: naverMapUrl(store),
    tmap: tmapUrl(store),
  };
}
