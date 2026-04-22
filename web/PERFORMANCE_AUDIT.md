# Frame Ops Web — 성능 진단 리포트
생성일: 2026-04-22

## 현재 스택 분석

현재 `frame_ops`는 Python Streamlit 기반 앱입니다. 이 Next.js 프로젝트는 네이티브 앱 수준 성능을 목표로 신규 구축되었습니다.

---

## 1. 번들 크기 (초기 목표)

| 구분                  | 목표           | 전략 |
|-----------------------|----------------|------|
| Initial JS (gzipped)  | < 200KB        | dynamic import + tree-shaking |
| CSS (gzipped)         | < 20KB         | Tailwind purge |
| 이미지 포맷           | AVIF/WebP      | next/image 자동 변환 |

**측정 방법**: `npm run analyze` (ANALYZE=true next build)

---

## 2. 렌더링 방식

| 페이지       | 방식   | 이유 |
|--------------|--------|------|
| `/`          | SSG    | 정적 대시보드 — 캐시 최적 |
| `/frames`    | CSR    | 실시간 재고 + SWR + IndexedDB |
| `/customers` | CSR    | 실시간 검색 |
| `/orders`    | CSR    | 실시간 매출 |
| `/pos`       | CSR    | POS는 완전 클라이언트 |

---

## 3. 이미지 최적화

- ✅ `next/image` 사용 — AVIF/WebP 자동 변환
- ✅ `priority` 속성: fold 이상 이미지에 적용
- ✅ `placeholder="blur"` — CLS 방지
- ✅ `sizes` 반응형 힌트 설정
- ✅ Supabase Storage CDN 활용

---

## 4. API 호출 패턴

| 전략                     | 구현                                                  |
|--------------------------|-------------------------------------------------------|
| IndexedDB 즉시 반환      | `useFramesData` — fallbackData로 IndexedDB 캐시 사용  |
| SWR stale-while-revalidate | 백그라운드 Supabase 동기화                            |
| Supabase RPC 배치 조회   | `get_customer_full_detail` — N+1 제거                 |
| 프리페칭                 | hover 시 상세 데이터 선제 로드                        |

---

## 5. 캐싱 전략

| 레이어           | 전략             | TTL |
|------------------|------------------|-----|
| Service Worker   | NetworkFirst (API) | 5분 |
| Service Worker   | CacheFirst (이미지) | 30일 |
| Service Worker   | StaleWhileRevalidate (JS/CSS) | — |
| IndexedDB        | 오프라인 전체 캐시 | 영구 (동기화) |
| SWR              | 메모리 캐시       | 5분 재검증 |
| HTTP Cache       | 정적 자원         | 1년 immutable |

---

## 6. 개선 우선순위 TOP 10

1. **IndexedDB 초기 데이터 로딩** — Streamlit 대비 즉시 렌더링 (0ms 지연)
2. **가상 스크롤** — 1000개+ 제품 목록 60fps 유지
3. **PWA Service Worker** — 오프라인 사용 가능
4. **next/dynamic 코드 스플리팅** — 초기 번들 < 200KB
5. **SWR + Supabase RPC** — N+1 쿼리 제거, API 왕복 최소화
6. **next/image AVIF** — 이미지 용량 50-60% 절감
7. **View Transitions API** — 페이지 전환 네이티브 앱 느낌
8. **터치 최적화 CSS** — 44pt 최소 타겟, 하이라이트 제거
9. **Vercel Analytics** — LCP/FID/CLS 자동 측정
10. **Prefetch on hover** — 체감 상세 페이지 로딩 0ms

---

## 7. 성능 목표

| 지표               | 목표       |
|--------------------|------------|
| Lighthouse Score   | ≥ 95       |
| FCP                | < 1.0s     |
| LCP                | < 1.5s     |
| TTI                | < 2.5s     |
| CLS                | < 0.1      |
| 초기 JS (gzip)     | < 200KB    |

---

*측정 명령어*
```bash
npm run build && npm run start
# 다른 터미널에서:
npm run lighthouse
npm run lighthouse:mobile
```
