# Funnyview Pickup

콘택트렌즈 픽업서비스 플랫폼.
고객이 온라인에서 콘택트렌즈를 주문하면 픽업서비스 업체가 패킹/출고하고,
지정된 가맹점에서 고객이 픽업·결제하여 마감하는 3자(고객 / 픽업서비스 업체 / 픽업가맹점) 워크플로우를 제공한다.

> 이 프로젝트는 같은 저장소 안의 `frame_ops` (안경원 CRM)와 **완전히 독립적으로 관리**된다.
> 코드, 의존성, DB, 환경변수, 배포 환경 모두 분리되어 있다.

---

## 기술 스택

| 영역 | 선택 | 비고 |
| --- | --- | --- |
| 프레임워크 | Next.js 14 (App Router) | RSC + API Routes |
| 언어 | TypeScript (strict) | |
| DB | PostgreSQL | 대용량 OLTP, 파티셔닝 지원 |
| ORM | Drizzle ORM | 경량 · SQL-first · 타입 안전 |
| 캐시/실시간 | Redis (ioredis) | 캐싱 + Pub/Sub 알림 |
| 스타일 | Tailwind CSS | |
| 인증 | JWT (jose) | 세션 쿠키 |

## 역할 (Role)

| 역할 | 라우트 | 핵심 화면 |
| --- | --- | --- |
| 고객 (customer) | `/customer` | 주문하기, 내 주문 상태 |
| 픽업서비스 업체 (warehouse) | `/warehouse` | 주문 접수, 픽리스트, 출고 |
| 픽업가맹점 (store) | `/store` | 입고/배송 중, 픽업 처리 |

## 주문 상태(Flow)

```
pending(주문완료)
  → accepted(접수)
  → picking(패킹 중)
  → shipped(출고/배송 중) ── 고객·가맹점 화면 "배송 중"
  → arrived(가맹점 입고)
  → completed(처리완료) ── 고객 픽업 + 결제 마감
```

## 디렉토리 구조

```
src/
├── app/
│   ├── api/                # API Routes (auth, orders, lenses, stores, health)
│   ├── customer/           # 고객 포털
│   ├── warehouse/          # 픽업서비스 업체 포털
│   ├── store/              # 픽업가맹점 포털
│   ├── layout.tsx
│   └── page.tsx            # 역할 선택 랜딩
├── components/
│   ├── layout/             # RoleHeader 등 공용 레이아웃
│   └── ui/                 # 버튼/카드 등 UI primitives
├── db/
│   ├── client.ts           # Drizzle + postgres.js (schema 주입)
│   └── schema/             # 테이블 스키마 (도메인별 분리)
│       ├── enums.ts
│       ├── users.ts
│       ├── customers.ts
│       ├── stores.ts
│       ├── lenses.ts
│       ├── inventory.ts
│       ├── orders.ts
│       ├── payments.ts
│       ├── notifications.ts
│       ├── relations.ts
│       └── index.ts
├── lib/
│   ├── auth/               # JWT, 세션
│   ├── redis/              # Redis 클라이언트 + Pub/Sub 채널
│   └── utils/              # cn, sku, order-number, map-url
├── types/
└── styles/

drizzle/
├── 0000_0000_initial.sql   # 초기 테이블 마이그레이션 (drizzle-kit 자동 생성)
├── 0001_sales_views.sql    # 매출/영업이익/안전재고 뷰 (수동)
└── meta/                   # 스냅샷
```

## DB 스키마 (Phase 1)

### 테이블 목록 (14개)

| 테이블 | 역할 |
| --- | --- |
| `users` | 인증 통합 사용자 (customer/warehouse/store/admin) |
| `customers` | 고객 정보 (이름·성별·생년월일·연락처·주소·추천인) |
| `customer_prescriptions` | 고객 도수 이력 (재주문 편의용) |
| `stores` | 픽업가맹점 (가맹점명·전화·주소·카카오/네이버/T맵 URL·수수료율) |
| `lenses` | 콘택트렌즈 마스터 (브랜드·제품군·BC·DIA·도수범위·가격·원가) |
| `lens_variants` | 도수별 SKU (sphere·cylinder·axis·add_power) |
| `lens_barcodes` | 바코드 (SKU 1:N — 제조사/유통 분리) |
| `inventory` | 중앙 창고 SKU별 현재고 (on_hand·reserved·safety·reorder) |
| `inventory_movements` | 입출고 이력 (append-only) |
| `orders` | 주문 마스터 (상태·금액·전이 타임스탬프) |
| `order_items` | 주문 라인 (좌/우/양안 별, 스냅샷 보존) |
| `order_status_history` | 상태 전이 감사 로그 |
| `payments` | 결제 (온라인/매장, 부분 환불 지원) |
| `notifications` | 알림 (도착알림·배송시작·안전재고 부족) |

### 주문 상태 전이

```
pending(주문완료/결제전) → paid(결제완료)
  → accepted(접수)        ── warehouse 수락
  → picking(패킹 중)      ── 픽리스트 출력
  → shipped(출고/배송 중) ── 고객·가맹점 화면 "배송 중"
  → arrived(가맹점 입고)  ── 가맹점에서 입고 확인
  → ready(픽업 준비)      ── 고객에게 도착알림 발송
  → completed(처리완료)   ── 픽업 + 매장 결제 완료
[cancelled] 어느 단계에서든 가능
```

### 핵심 설계 결정

- **SKU 결정성**: `lens_variants.sku` 는 `(productCode, sphere, cylinder, axis, addPower)` 에서 결정적으로 생성 (`src/lib/utils/sku.ts`) → 중복 자동 방지
- **금액**: 정수(원) 저장 (소수점 회피)
- **상태 이력**: `orders.{paid_at,shipped_at,...}` 컬럼으로 빠른 조회, `order_status_history` 로 감사
- **재고 무결성**: `CHECK quantity_on_hand >= 0` + `inventory_movements` append-only
- **결제 무결성**: 1 주문 N 결제 (부분 환불·복합 결제 대응)
- **알림 통합**: 도착알림·배송시작·안전재고 부족 모두 `notifications` 1테이블
- **삭제 정책**: 마스터 데이터(`users`, `customers`, `stores`, `lenses`)는 soft delete

### SQL 뷰 (`0001_sales_views.sql`)

| 뷰 | 용도 |
| --- | --- |
| `v_sales_daily` | 일별·가맹점별 매출·영업이익 |
| `v_sales_monthly` | 월별·가맹점별 매출·영업이익 |
| `v_store_settlement` | 픽업가맹점 정산 (수수료율 적용) |
| `v_low_stock_alerts` | 안전재고/발주점 미달 SKU |

### 마이그레이션 적용

```bash
# 1. Drizzle 자동 생성분
npm run db:migrate

# 2. 매출 뷰 (수동)
psql $DATABASE_URL -f drizzle/0001_sales_views.sql
```

## 로컬 개발

```bash
# 1. 의존성 설치
npm install

# 2. 환경변수 준비
cp .env.example .env.local
# DATABASE_URL, REDIS_URL, JWT_SECRET 채우기

# 3. DB 스키마 (스키마 작성 후)
npm run db:generate   # SQL 마이그레이션 생성
npm run db:migrate    # 적용

# 4. 개발 서버 (포트 3001 - frame_ops와 충돌 방지)
npm run dev
```

| 명령 | 설명 |
| --- | --- |
| `npm run dev` | 개발 서버 (port 3001) |
| `npm run build` | 프로덕션 빌드 |
| `npm run start` | 프로덕션 서버 |
| `npm run lint` | ESLint |
| `npm run type-check` | tsc --noEmit |
| `npm run db:generate` | Drizzle 마이그레이션 생성 |
| `npm run db:migrate` | 마이그레이션 적용 |
| `npm run db:push` | 스키마 즉시 반영 (개발) |
| `npm run db:studio` | Drizzle Studio |

## 개발 로드맵

- [x] **Phase 0** — 프로젝트 셋업, 역할별 라우팅 골격
- [x] **Phase 1** — DB 스키마 (14 테이블 + 4 뷰)
- [x] **Phase 2** — 인증 (3-role JWT, 미들웨어, 로그인/회원가입 페이지)
- [x] **Phase 3** — 고객 주문 플로우 (4단계 + 5초 폴링 상세)
- [x] **Phase 4** — 픽업서비스 업체 (대시보드, 일괄 처리, 픽리스트, 재고)
- [x] **Phase 5** — 픽업가맹점 (입고, 도착알림, 결제 다이얼로그, 처리완료)
- [x] **Phase 6** — 실시간 알림 (SSE + Redis Pub/Sub, NotificationBell)
- [x] **Phase 7** — 시드 데이터 + 빌드 검증
- [x] **Phase 8** — 소셜 로그인 (Naver / Kakao / Google) + 전화번호 온보딩
- [x] **Phase 9** — 홈화면 CMS (6 섹션 유형 + 분석 + 관리자 콘솔)
- [x] **Phase 10** — 알림 채널 (SMS/카카오 알림톡 Solapi 어댑터 + 통합 dispatcher)
- [x] **Phase 11** — CMS 비주얼 편집기 (kind별 폼 위젯 + JSON 고급 토글)
- [x] **Phase 12** — 자동 큐레이션 고도화 (best/trending/new/manual + Redis 캐시)
- [x] **Phase 13** — 이미지 업로드 (StorageAdapter + ImagePicker + 로컬 FS)
- [x] **Phase 14** — PWA + 웹 푸시 (manifest/SW/VAPID/구독 토글)
- [x] **Phase 15** — 운영 대시보드 (KPI/매출 차트/가맹점 정산/추천인 리워드)
- [ ] **Phase 16** — 결제 PG 실연동 (Toss / Nice / PortOne)
- [ ] **Phase 17** — 모바일 최적화 + i18n + SEO 강화

## 홈화면 CMS (Phase 9)

`/admin/home` 에서 비코드로 홈 화면 구성 — 6 섹션 유형:

| 유형 | 용도 |
| --- | --- |
| `hero` | 풀와이드 메인 배너 (이미지/비디오 + CTA) |
| `product_grid` | 추천 상품 (수동 선택 또는 best/new/trending 자동) |
| `category_chips` | 빠른 필터 칩 (브랜드/유형, 배지) |
| `banner_strip` | 띠 배너 (쿠폰·공지) |
| `countdown` | 카운트다운 (한정 프로모션) |
| `brand_story` | 브랜드 스토리 (이미지 + 텍스트 + CTA) |

- 노출 일정 (`startsAt` / `endsAt`)
- A/B variant 지원 (`variant` 컬럼)
- 자동 임프레션 추적 (IntersectionObserver 40%)
- 클릭/전환 이벤트 일괄 전송 (1초 배치)
- `/admin/home/analytics` 에서 일/주/월별 CTR · CVR 모니터링

## 소셜 로그인 설정 (Phase 8)

각 provider 개발자 콘솔에서 OAuth 앱 등록 후 환경변수 설정:

| Provider | 발급처 | Redirect URI |
| --- | --- | --- |
| Naver | https://developers.naver.com/apps | `{NEXT_PUBLIC_APP_URL}/api/auth/oauth/naver/callback` |
| Kakao | https://developers.kakao.com | `{NEXT_PUBLIC_APP_URL}/api/auth/oauth/kakao/callback` |
| Google | https://console.cloud.google.com | `{NEXT_PUBLIC_APP_URL}/api/auth/oauth/google/callback` |

환경변수가 설정된 provider 만 로그인/가입 화면에 버튼이 노출됩니다. 미설정 시 전화번호 가입만 가능.

## 빠른 시작 (Demo)

```bash
# 1. 환경
cp .env.example .env.local
# DATABASE_URL, REDIS_URL, JWT_SECRET 설정

# 2. DB 마이그레이션
npm run db:migrate
psql $DATABASE_URL -f drizzle/0001_sales_views.sql   # 뷰

# 3. 시드 (가맹점 3 + 렌즈 4종 + 직원 4명 + 초기재고)
npm run db:seed

# 4. 개발 서버
npm run dev   # http://localhost:3001

# 테스트 계정 (비밀번호: pickup1234!)
#   픽업서비스 업체   : 01000000001  /login/warehouse
#   강남 본점 직원     : 01000000002  /login/store
#   홍대 지점 직원     : 01000000003  /login/store
#   판교 지점 직원     : 01000000004  /login/store
#   고객              : /register 에서 신규 가입
```

## End-to-End 시나리오

1. **고객**: `/register` → 가입 → `/customer/order` → 렌즈/도수/가맹점/결제 선택 → 주문 생성
2. **픽업서비스 업체**: 🔔 신규 알림 → `/warehouse/orders` 접수/패킹 → `/warehouse/picklist` 픽리스트 출력 → 출고 처리
3. **고객**: 대시보드에 "배송 중" 자동 반영
4. **픽업가맹점**: 🔔 알림 → `/store/incoming` 입고 → 도착알림 발송
5. **고객**: 🔔 "픽업 가능" 알림 → 가맹점 방문
6. **픽업가맹점**: `/store/pickup` → 결제 + 처리완료 → 매출 집계 반영

## frame_ops 와의 분리 원칙

- 의존성: `node_modules`, `package.json` 완전 분리
- DB: 별도 PostgreSQL DB (`funnyview_pickup`)
- 포트: dev `3001`, frame_ops web `3000`
- 환경변수: `.env.local` 자체 보유, 공유 금지
- 빌드/배포: 독립 파이프라인
