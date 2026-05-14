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
│   ├── client.ts           # Drizzle + postgres.js
│   └── schema/             # 테이블 스키마
├── lib/
│   ├── auth/               # JWT, 세션
│   ├── redis/              # Redis 클라이언트 + Pub/Sub 채널
│   └── utils/              # cn() 등 공용 유틸
├── types/
└── styles/
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
- [ ] **Phase 1** — DB 스키마 (users, stores, lenses, orders…)
- [ ] **Phase 2** — 인증 (3-role JWT)
- [ ] **Phase 3** — 고객 주문 플로우 (렌즈 선택 → 가맹점 선택 → 결제)
- [ ] **Phase 4** — 픽업서비스 업체 워크플로우 (주문 접수 → 픽리스트 → 출고)
- [ ] **Phase 5** — 픽업가맹점 워크플로우 (입고 → 픽업 → 결제 → 처리완료)
- [ ] **Phase 6** — 실시간 알림 (Redis Pub/Sub + SSE)
- [ ] **Phase 7** — 결제 PG 연동, SMS/카카오 알림
- [ ] **Phase 8** — 운영 대시보드, 통계

## frame_ops 와의 분리 원칙

- 의존성: `node_modules`, `package.json` 완전 분리
- DB: 별도 PostgreSQL DB (`funnyview_pickup`)
- 포트: dev `3001`, frame_ops web `3000`
- 환경변수: `.env.local` 자체 보유, 공유 금지
- 빌드/배포: 독립 파이프라인
