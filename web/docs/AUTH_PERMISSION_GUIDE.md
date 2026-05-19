# 권한 / 계정 시스템 응용 가이드

Frame Ops 의 인증·권한·계정 관리 구조를 **다른 프로젝트로 옮겨갈 수 있는 형태**로 정리한 문서입니다. 각 섹션은 *왜 이렇게 설계했는가* → *어떤 파일이 핵심인가* → *어떻게 적용할 것인가* 순서로 구성되어 있습니다.

> 작성 기준: 2026-05-19. 코드 경로는 `web/` 기준 상대 경로.

---

## 목차

1. [한눈에 보는 전체 그림](#1-한눈에-보는-전체-그림)
2. [데이터 모델 (DB 스키마)](#2-데이터-모델-db-스키마)
3. [권한 정의 — 키·역할·라우트 매핑](#3-권한-정의--키역할라우트-매핑)
4. [인증 흐름 (로그인 → 세션 → 로그아웃)](#4-인증-흐름)
5. [다층 권한 가드 (UI · Middleware · Page · API)](#5-다층-권한-가드)
6. [계정 생성·관리 UI](#6-계정-생성관리-ui)
7. [응용 체크리스트 — 새 프로젝트 적용 시](#7-응용-체크리스트)
8. [주의사항 / 안티패턴](#8-주의사항--안티패턴)

---

## 1. 한눈에 보는 전체 그림

```
┌─────────────────────────────────────────────────────────────────────┐
│                          DB (Supabase Postgres)                     │
│                                                                     │
│  fo_staff_profiles ──────── fo_staff_roles      fo_staff_job_titles │
│       │ user_id (PK)             │ role_code (PK)                   │
│       │ login_id                                                    │
│       │ password_hash (bcrypt)                                      │
│       │ role_code (FK)                                              │
│       │ permissions text[] ← 명시 권한 override (NULL = role 기본값)│
│       │                                                             │
│       └── fo_staff_store_scopes ──────── fo_stores                  │
│              (user_id, store_id)            store_code, name, …     │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
                           │ /api/auth/login (POST)
                           │   - 본사: login_id + password (bcrypt)
                           │   - 지점: store_code + password (bcrypt)
                           │   → 일치 시 JWT 발급
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  서버 미들웨어 (Edge runtime)                       │
│                                                                     │
│  middleware.ts                                                      │
│   1. 쿠키에서 JWT 추출 → jose 로 검증 (HS256, AUTH_SECRET)          │
│   2. 비로그인 → /login 리다이렉트                                   │
│   3. /hq 영역 → hq_* role 만 통과                                   │
│   4. route-permissions 매핑 → 권한 없으면 /forbidden 으로 redirect  │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
                           │ SessionPayload (JWT decoded)
                           │   staff_user_id, store_id, role_code,
                           │   display_name, permissions[]
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     클라이언트 (Next.js App Router)                 │
│                                                                     │
│  useSession()         hasPermission(perms, 'pos_sales')             │
│   └─ /api/auth/me      ├─ 홈 page.tsx — NAV_ITEMS 필터              │
│                        ├─ Header / BottomTabBar — 링크 필터         │
│                        ├─ UserMenu — 메뉴 항목 필터                 │
│                        └─ 각 페이지 — 액션 버튼 enable/disable      │
└─────────────────────────────────────────────────────────────────────┘
```

핵심 설계 원칙:

1. **권한 = 문자열 키 배열** — boolean 컬럼 N개가 아니라 `permissions text[]` 단일 컬럼. 추가/제거가 ALTER TABLE 없이 가능.
2. **role 은 기본값 묶음** — 사용자별 명시 권한 (`permissions`) 가 있으면 그것, 없으면 role 의 ROLE_DEFAULTS 적용. 둘을 효율적으로 결합하는 `effectivePermissions()` 함수.
3. **다층 가드** — UI(아이콘 숨김) · Middleware(라우트 차단) · Page(client guard) · API(라우트별 자체 가드) 4단계. 우회 방지 + 사용성 모두 확보.
4. **JWT in httpOnly cookie** — XSS 방어 + Edge runtime 호환 (jose 라이브러리).
5. **계정 생성 권한 분리** — 본사는 본사 화면(`/hq/staff`), 지점 매니저는 지점 화면(`/admin/staff`). 같은 매장 내 동일 비밀번호 차단 등 도메인 규칙 강제.

---

## 2. 데이터 모델 (DB 스키마)

### 2.1 fo_staff_profiles — 사용자 본체

```sql
CREATE TABLE fo_staff_profiles (
  user_id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  login_id             TEXT,                                 -- 본사: 고유, 지점: store_code 공유
  display_name         TEXT,
  role_code            TEXT NOT NULL REFERENCES fo_staff_roles(role_code),
  job_title_code       TEXT REFERENCES fo_staff_job_titles(code),
  email                TEXT,
  phone                TEXT,
  password_hash        TEXT,                                 -- bcrypt
  password_plain       TEXT,                                 -- 평문 (관리자가 분실 비번 조회 — 보안 trade-off)
  password_updated_at  TIMESTAMPTZ,
  permissions          TEXT[],                               -- NULL = role 기본값 사용, ARRAY = 명시 override
  active               BOOLEAN NOT NULL DEFAULT true,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**핵심 컬럼**:
- `login_id` — 본사 계정은 사용자 ID (예: `hq_admin`), 지점 계정은 매장 코드(`BKC01`) 를 공유. 지점에서는 비밀번호로 사람을 구별.
- `password_hash` — bcrypt(10 rounds). middleware 가 Edge runtime 이라 사용 못함 → API 라우트에서만 검증.
- `password_plain` — 의도적으로 평문 보관. *본사 관리자가 매장 매니저의 분실 비번을 조회해 안내*하는 운영 요구를 위한 trade-off. 보안 민감하다면 제거 가능.
- `permissions text[]` — NULL 이면 role 기본값. 명시 값이 있으면 그것 우선 (override). 핵심: ALTER TABLE 없이 권한 키만 코드에서 추가하면 끝.

### 2.2 fo_staff_roles — 역할 정의

```sql
CREATE TABLE fo_staff_roles (
  role_code   TEXT PRIMARY KEY,         -- 'hq_super' | 'hq_purchase' | 'store_manager' | …
  label       TEXT NOT NULL,
  sort_order  INT  NOT NULL DEFAULT 0
);
```

코드와 DB 양쪽에 존재. 동기화: `ROLE_DEFAULTS` (코드) 의 키들이 DB 의 role_code 와 일치해야 함.

### 2.3 fo_staff_store_scopes — 사용자 ↔ 매장 다대다

```sql
CREATE TABLE fo_staff_store_scopes (
  user_id   UUID NOT NULL REFERENCES fo_staff_profiles(user_id) ON DELETE CASCADE,
  store_id  UUID NOT NULL REFERENCES fo_stores(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, store_id)
);
```

용도:
- **본사 사용자**: 보통 1개 행 (primary 매장) 이지만 여러 매장 권한 부여 가능.
- **지점 사용자**: 정확히 1개 행 (근무지 매장).
- 로그인 시 store_code 매칭 → 이 테이블 join 으로 후보 직원 list → 비밀번호 매칭.

### 2.4 fo_stores — 매장 (도메인 단위)

```sql
CREATE TABLE fo_stores (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_code       TEXT NOT NULL UNIQUE,    -- 로그인 식별자
  name             TEXT NOT NULL,
  active           BOOLEAN NOT NULL DEFAULT true,
  -- GPS 출퇴근 검증 (옵션)
  lat              NUMERIC,
  lng              NUMERIC,
  geo_radius_m     INT NOT NULL DEFAULT 200,
  geo_required     BOOLEAN NOT NULL DEFAULT false,
  -- 사업자 정보
  business_reg_no  TEXT,
  address          TEXT,
  phone            TEXT
);
```

`store_code` 가 **로그인 ID 의 일부**로 동작하는 점이 특이. 같은 매장 직원들은 같은 ID, 다른 비밀번호로 식별.

---

## 3. 권한 정의 — 키·역할·라우트 매핑

### 3.1 `lib/auth/permissions.ts` — 권한 키 + 역할 기본값

핵심 코드 (요약):

```typescript
export interface PermissionDef {
  key: string;
  label: string;
  group: '운영' | '분석' | '마스터' | '지점관리' | '본사';
  scope: 'store' | 'hq' | 'both';
}

export const ALL_PERMISSIONS: PermissionDef[] = [
  { key: 'pos_sales',       label: 'POS 판매',    group: '운영', scope: 'store' },
  { key: 'inventory_view',  label: '재고 조회',   group: '운영', scope: 'store' },
  { key: 'orders_list',     label: '주문리스트',  group: '운영', scope: 'store' },
  { key: 'sales_stats',     label: '판매통계',    group: '분석', scope: 'store' },
  { key: 'settlement',      label: '정산',        group: '운영', scope: 'store' },
  // … (전체는 약 25개 키)
  { key: 'hq_dashboard',    label: '본사 대시보드', group: '본사', scope: 'hq' },
  { key: 'hq_stats',        label: '본사 통합 통계', group: '본사', scope: 'hq' },
];

export const ROLE_DEFAULTS: Record<string, string[]> = {
  hq_super:       PERMISSION_KEYS,      // 전권
  hq_purchase:    ['pos_sales', 'inventory_view', 'orders_list', 'master_products', 'master_suppliers', 'hq_dashboard', 'hq_stores_manage', 'hq_stats'],
  hq_view:        ['sales_stats', 'sales_search', 'hq_dashboard', 'hq_stats', 'hq_sales_search', 'hq_comparison'],
  store_manager:  ['pos_sales', 'inventory_view', 'inventory_edit_stock', 'orders_list', 'inbound_register', 'interstore_transfer', 'settlement', 'sales_stats', 'sales_search', 'store_staff_manage', 'store_info_edit', 'attendance_view'],
  store_salesperson: ['pos_sales', 'inventory_view', 'sales_search', 'attendance_view'],
  store_staff:    ['pos_sales', 'inventory_view', 'sales_search', 'attendance_view'],
};

export function effectivePermissions(roleCode: string, explicit: string[] | null | undefined): string[] {
  if (explicit && explicit.length > 0) return explicit;
  return ROLE_DEFAULTS[roleCode] ?? [];
}

export function hasPermission(perms: string[] | undefined | null, key: string): boolean {
  return Array.isArray(perms) && perms.includes(key);
}

export function isHqRole(roleCode: string): boolean {
  return roleCode.startsWith('hq_');
}
```

**왜 이 구조?**
- `ALL_PERMISSIONS` 가 **유일한 source of truth** — 새 권한 추가 시 여기 한 줄만 추가하면 staff form 에 자동 노출 + UI 가드 사용 가능.
- `ROLE_DEFAULTS` 는 신규 직원 생성 시 빠르게 표준 권한 세팅. 개인별 override 가 필요하면 `permissions` 컬럼에 직접 저장.
- `group` 필드는 staff form 의 권한 체크박스 그룹핑용. UX 향상 목적.
- `scope` 는 staff form 에서 \"본사 사용자에게 매장 권한 보이지 않게\" 같은 필터링용.

### 3.2 `lib/auth/route-permissions.ts` — 라우트 → 권한 매핑

```typescript
export const ROUTE_PERMISSIONS: Record<string, string> = {
  '/pos':                  'pos_sales',
  '/inventory':            'inventory_view',
  '/inventory/audit':      'inventory_edit_stock',  // 더 깊은 prefix 가 우선
  '/admin/orders':         'orders_list',
  '/admin/stats':          'sales_stats',
  '/admin/settlement':     'settlement',
  '/admin/sales-search':   'sales_search',
  '/hq':                   'hq_dashboard',
  '/hq/stats':             'hq_stats',
  // …
};

export function getRequiredPermission(pathname: string): string | null {
  const normalized = pathname.length > 1 && pathname.endsWith('/')
    ? pathname.slice(0, -1) : pathname;
  // longest-prefix match
  const sorted = Object.keys(ROUTE_PERMISSIONS).sort((a, b) => b.length - a.length);
  for (const route of sorted) {
    if (normalized === route || normalized.startsWith(route + '/')) {
      return ROUTE_PERMISSIONS[route];
    }
  }
  return null;
}
```

**핵심 트릭**: `longest-prefix match` — `/inventory/audit` 가 `/inventory` 보다 먼저 매칭되어 더 강한 권한(`inventory_edit_stock`) 요구. 단순 `startsWith` 만 쓰면 부모 권한으로 자식까지 통과되는 버그가 생김.

### 3.3 권한 키 명명 컨벤션

- `pos_*`, `inventory_*`, `orders_*` — 도메인_액션
- `hq_*` — 본사 전용
- `store_*` — 지점 전용 (지점 관리 영역 키)
- `master_*` — 마스터 데이터 (상품/매입처 등)
- 액션이 `view`, `edit`, `manage` 인 경우 권한이 누적되도록 설계 (예: `inventory_view` ⊂ `inventory_edit_stock`).

---

## 4. 인증 흐름

### 4.1 JWT 세션 (`lib/auth/session.ts`)

```typescript
import { jwtVerify, SignJWT } from 'jose';   // Edge runtime 호환

export interface SessionPayload {
  staff_user_id: string;
  store_id: string;
  store_code: string;
  display_name: string;
  role_code: string;
  permissions: string[];                     // ← effective permissions (이미 resolve 된 상태)
}

const ALG = 'HS256';
const ISSUER = 'frame-ops';
const EXPIRES_IN = '12h';                    // 매장 한 시프트 길이

export async function signSession(payload: SessionPayload) {
  return await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: ALG })
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(EXPIRES_IN)
    .sign(getSecret());
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      issuer: ISSUER, algorithms: [ALG],
    });
    // 필드 타입 검증 → 모두 통과해야 SessionPayload 반환
    return { /* … */ };
  } catch { return null; }
}

export const SESSION_COOKIE = 'fo_session';
```

**중요 결정**:
- `jose` 사용 — Node 의 `crypto` 가 아닌 Web Crypto API 기반이라 **Edge runtime (middleware) 와 Node runtime (API) 양쪽**에서 동작.
- 권한을 토큰에 **인라인** — DB 조회 없이 middleware 가 권한 체크 가능 (cold start 절감).
- 만료 12시간 — 매장 한 시프트 길이. 더 길면 보안 ↓, 짧으면 잦은 재로그인.
- `AUTH_SECRET` 환경변수 (최소 32자) — 누출 시 누구나 토큰 위조 가능.

### 4.2 쿠키 vs Authorization 헤더

쿠키 (`httpOnly + sameSite: 'lax' + secure`) 채택:
- ✅ XSS 로 토큰 탈취 불가 (JS 가 접근 못함)
- ✅ 자동 전송 — fetch 마다 헤더 붙일 필요 없음
- ⚠ CSRF 위험 → `sameSite: 'lax'` 로 막음. mutation 은 같은 origin POST 만 허용.

### 4.3 로그인 처리 (`/api/auth/login`)

두 모드 자동 분기:

```typescript
// 1) HQ 로그인 시도
const hq = await tryHqLogin(db, identifier, password);
//    - WHERE login_id = $1 AND role_code LIKE 'hq_%' AND active
//    - bcrypt.compare(password, password_hash)

if (hq.kind === 'success') return issueSession(hq.data);
if (hq.kind === 'error')   return error response;
// hq.kind === 'not_found' → 지점 로그인으로 fallback

// 2) 지점 로그인 시도
const store = await tryStoreLogin(db, identifier, password, ctx);
//    - WHERE store_code = $1 AND active (매장 단일)
//    - 매장 직원 후보 조회 (fo_staff_store_scopes → fo_staff_profiles)
//    - 각 후보의 password_hash 와 bcrypt.compare
//    - 정확히 1명 일치해야 통과 (0명: 로그인 실패, 2명+: 충돌 에러)
```

**지점 로그인의 특이점**:
- 모든 매장 직원이 같은 `login_id` (= store_code) 공유 → 비밀번호로 사람 구별
- 같은 매장에서 동일 비밀번호 중복 불가 (POST staff API 에서 사전 차단)
- 모바일 로그인 시 GPS 위치 검증 + `fo_attendance` 출근 기록

### 4.4 비밀번호 해싱 (`lib/auth/password.ts`)

```typescript
import bcrypt from 'bcryptjs';
const ROUNDS = 10;

export async function hashPassword(plain: string): Promise<string> {
  return await bcrypt.hash(plain, ROUNDS);
}
export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  if (!hash) return false;
  try { return await bcrypt.compare(plain, hash); }
  catch { return false; }
}
```

⚠ **middleware (Edge runtime) 에서는 import 금지** — bcryptjs 는 Node 전용. 로그인 검증은 반드시 API 라우트 (Node runtime) 에서.

### 4.5 세션 조회 — 서버 vs 클라이언트

**서버 (React Server Component, API route)**:
```typescript
import { getServerSession } from '@/lib/auth/server-session';

export default async function MyPage() {
  const session = await getServerSession();
  if (!session) redirect('/login');
  // … session.permissions 사용
}
```

**클라이언트 (Client Component, hook)**:
```typescript
import { useSession } from '@/hooks/useSession';

export function MyComponent() {
  const { session, isLoading } = useSession();
  // SWR 캐시 — 30s deduping, /api/auth/me
}
```

### 4.6 로그아웃

```typescript
// app/api/auth/logout/route.ts (간단)
export async function POST() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  return NextResponse.json({ data: { ok: true }, error: null });
}
```

클라이언트:
```typescript
await fetch('/api/auth/logout', { method: 'POST' });
await mutate('/api/auth/me');     // SWR 캐시 무효화
router.replace('/login');
```

---

## 5. 다층 권한 가드

> 한 군데만 막으면 우회 가능. **4개 레이어 모두** 적용 필요.

### 5.1 Layer 1 — Middleware (서버 deep guard)

```typescript
// middleware.ts (요지)
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublic(pathname)) return NextResponse.next();   // /login, /forbidden, /api/auth/*, /api/health

  const session = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) {
    // API → 401 JSON, 페이지 → /login 리다이렉트
    return pathname.startsWith('/api/')
      ? NextResponse.json({ error: '로그인 필요' }, { status: 401 })
      : NextResponse.redirect(new URL(`/login?next=${pathname}`, request.url));
  }

  // /hq 접두사는 hq_* role 만
  if (isHqPath(pathname) && !isHqRole(session.role_code)) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  // 라우트별 권한 매핑 검사 (페이지만)
  if (!pathname.startsWith('/api/')) {
    const required = getRequiredPermission(pathname);
    if (required && !session.permissions?.includes(required)) {
      return NextResponse.redirect(
        new URL(`/forbidden?from=${pathname}&need=${required}`, request.url)
      );
    }
  }

  return NextResponse.next();
}
```

**왜 미들웨어?**
- URL 직접 입력 차단의 **유일한 안전 지점**. 클라이언트 가드는 JS 로 우회 가능.
- Edge runtime — cold start 없이 빠름 (~10ms).
- API 보호는 **각 라우트가 자체 가드** (미들웨어에서 일률 강제하면 API 별 권한 차이 표현 불가).

### 5.2 Layer 2 — UI 메뉴/탭바 필터링 (사용성)

홈 page.tsx:
```typescript
const NAV_ITEMS = [
  { href: '/pos',        label: 'POS 판매',    permission: 'pos_sales' },
  { href: '/inventory',  label: '재고 조회',   permission: 'inventory_view' },
  // …
];

const visibleItems = NAV_ITEMS.filter((item) =>
  item.permission ? hasPermission(session.permissions, item.permission) : true
);
```

Header.tsx (데스크탑 nav) + BottomTabBar (모바일):
```typescript
const NAV_LINKS = [
  { href: '/pos',          label: 'POS 판매', permission: 'pos_sales' },
  { href: '/inventory',    label: '재고',     permission: 'inventory_view' },
  { href: '/admin/orders', label: '주문',     permission: 'orders_list' },
];

{NAV_LINKS.filter((l) => hasPermission(session?.permissions, l.permission)).map(/* … */)}
```

**원칙**: 사용자가 클릭 못하는 메뉴는 **보이지 않게**. 보이는데 클릭하면 forbidden → UX 나쁨.

### 5.3 Layer 3 — Page-level guard (Client)

특정 페이지 안에서 액션 버튼만 조건부 표시:

```typescript
'use client';
import { useSession } from '@/hooks/useSession';
import { hasPermission } from '@/lib/auth/permissions';

export default function InventoryPage() {
  const { session } = useSession();
  const canEditStock = hasPermission(session?.permissions, 'inventory_edit_stock');

  return (
    <main>
      {canEditStock && <a href="/inventory/audit">📋 재고조사 업로드</a>}
      {/* 페이지 자체는 inventory_view 권한자 모두 접근 가능 */}
    </main>
  );
}
```

권한 없는 사용자가 직접 진입한 경우 — 안내 화면:
```typescript
if (!canEdit) {
  return <p>재고조사 권한이 없습니다.</p>;
}
```

### 5.4 Layer 4 — API 라우트 가드 (필수)

```typescript
// app/api/admin/some-action/route.ts
export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: '로그인 필요' }, { status: 401 });
  }
  if (!session.permissions?.includes('some_perm_key')) {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 });
  }
  // … 본 로직
}
```

**왜 미들웨어가 아니라 라우트 자체에서?**
- 한 라우트가 여러 액션을 분기 (GET/POST/DELETE) 하는 경우 메서드별 권한이 다를 수 있음
- 본문 검사 후 결정해야 하는 권한 (예: 본사 권한 보유자만 마감된 정산 수정) 표현 가능
- middleware 로 일률 매핑하면 새 API 추가 시 매번 매핑 수정 — 휴면

### 5.5 /forbidden 페이지

```typescript
// app/forbidden/page.tsx
export default async function ForbiddenPage({ searchParams }: {
  searchParams: Promise<{ from?: string; need?: string }>;
}) {
  const { from, need } = await searchParams;
  const permLabel = ALL_PERMISSIONS.find((p) => p.key === need)?.label ?? need;

  return (
    <main>
      🔒 접근 권한이 없습니다
      필요 권한: {permLabel}
      요청 경로: {from}
      → 관리자에게 권한 부여를 요청하세요.
      [홈으로]
    </main>
  );
}
```

---

## 6. 계정 생성·관리 UI

### 6.1 페이지 분리

| 경로 | 대상 | 관리할 수 있는 역할 |
|---|---|---|
| `/admin/staff` | 지점 매니저 | `store_salesperson`, `store_staff` (본인 매장만) |
| `/hq/staff` | 본사 관리자 | 본사 직원 전체 (`hq_*`) |
| `/hq/store-accounts` | 본사 관리자 | 매장 매니저(`store_manager`) — 매장별 계정 생성 |

### 6.2 권한 편집 UI 패턴 (`StaffFormDialog`)

핵심 동작:
1. 사용자가 `role_code` 선택 → `setPerms(new Set(ROLE_DEFAULTS[roleCode]))` 로 기본값 자동 적용
2. \"사용자 지정 권한\" 체크박스 활성화 시 — 각 권한 키 체크박스 노출 (group 별로 묶음)
3. 저장 시:
   - 체크박스가 role 기본값과 동일하면 → API 에 `permissions: null` 전송 (role 따름)
   - 다르면 → 실제 체크된 키 배열 전송 (override)

```tsx
// StaffFormDialog.tsx (요지)
const [roleCode, setRoleCode] = useState(initial?.role_code ?? 'store_staff');
const [useCustomPerms, setUseCustomPerms] = useState(
  Array.isArray(initial?.permissions) && initial.permissions.length > 0
);
const [perms, setPerms] = useState<Set<string>>(
  () => new Set(initial?.permissions ?? effectivePermissions(initial?.role_code ?? 'store_staff', null))
);

// role 바뀌면 권한도 재설정 (자동)
useEffect(() => {
  if (!useCustomPerms) setPerms(new Set(ROLE_DEFAULTS[roleCode] ?? []));
}, [roleCode, useCustomPerms]);

// 저장 시
const permissionsPayload = useCustomPerms ? Array.from(perms) : null;
await fetch('/api/admin/staff', {
  method: 'POST',
  body: JSON.stringify({ display_name, role_code: roleCode, password, permissions: permissionsPayload }),
});
```

### 6.3 서버 측 권한 가드 (계정 생성)

```typescript
// app/api/admin/staff/route.ts POST
const callerIsHq      = session.role_code.startsWith('hq_');
const callerIsManager = session.role_code === 'store_manager';

if (!callerIsHq && !callerIsManager) {
  return NextResponse.json({ error: '계정 추가 권한 없음' }, { status: 403 });
}

// 지점 매니저는 store_salesperson / store_staff 만 생성 가능 (강제)
if (!callerIsHq && !STORE_MANAGEABLE_ROLES.includes(roleCode)) {
  return NextResponse.json({ error: '권한 없음' }, { status: 403 });
}

// 지점 매니저는 본인 매장으로 store_id 강제 (클라이언트 위조 무시)
const targetStoreId = callerIsManager ? session.store_id : (body.store_id || session.store_id);
```

**원칙**:
- **모든 권한 결정은 서버에서 다시 검증**. 클라이언트가 보낸 role_code/store_id 를 그대로 믿지 않음.
- 같은 매장 내 동일 비밀번호 중복 차단 (로그인 충돌 방지)
- login_id 는 본사만 임의 지정, 지점은 store_code 로 강제 (위조 차단)

---

## 7. 응용 체크리스트

새 프로젝트에 이 시스템을 옮길 때 순서:

### 7.1 환경 변수
```bash
AUTH_SECRET=<32자 이상 랜덤>   # openssl rand -base64 48
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=…
```

### 7.2 의존성
```json
{
  "jose": "^5.x",         // JWT
  "bcryptjs": "^2.x",     // 비밀번호 해싱
  "@supabase/supabase-js": "^2.x",
  "swr": "^2.x"           // 클라이언트 세션 캐시
}
```

### 7.3 마이그레이션 순서
1. `fo_stores` (또는 도메인에 맞게 `organizations`, `tenants` 등) 테이블
2. `fo_staff_roles` 테이블 + 기본 role 행 insert
3. `fo_staff_job_titles` (선택)
4. `fo_staff_profiles` 테이블
5. `fo_staff_store_scopes` (사용자-매장 매핑)
6. (선택) `fo_attendance` — GPS 출근 기록 시

### 7.4 코드 이식 순서
1. **`lib/auth/`** 전체 디렉터리 복사:
   - `session.ts` (JWT)
   - `server-session.ts` (서버 헬퍼)
   - `password.ts` (bcrypt)
   - `permissions.ts` — **권한 키만 도메인에 맞게 수정**
   - `route-permissions.ts` — **라우트 매핑만 도메인에 맞게 수정**
   - `accessible-stores.ts` (멀티 매장 사용 시)
2. **`middleware.ts`** 복사 — PUBLIC_PATHS / HQ_PREFIXES 만 수정
3. **`hooks/useSession.ts`** 복사
4. **`app/api/auth/`** 라우트 복사 — login/logout/me 흐름
5. **`app/login/page.tsx`** 복사 — 폼만 도메인 라벨에 맞게
6. **`app/forbidden/page.tsx`** 복사
7. **`app/admin/staff/`** + **`StaffFormDialog`** 복사 → 권한 키 그룹/라벨만 수정
8. **`Header.tsx` / `BottomTabBar`** 의 NAV_LINKS 도메인에 맞게 작성
9. **각 페이지 / API 라우트**에 `hasPermission` 체크 추가

### 7.5 권한 키 디자인 — 새 도메인 적용 시

새 권한 추가 절차 (예: 'reports_export' 권한 신설):
1. `lib/auth/permissions.ts` 의 `ALL_PERMISSIONS` 에 한 줄 추가
2. 필요한 role 의 `ROLE_DEFAULTS` 에 키 추가 (기본 부여할 역할)
3. 라우트가 있다면 `lib/auth/route-permissions.ts` 에 매핑 추가
4. 사용처에서 `hasPermission(perms, 'reports_export')` 또는 미들웨어가 자동 차단
5. DB 변경 **불필요** (text[] 컬럼이라 즉시 사용 가능)

권한 키 명명 규칙:
- 한 단어 두 단어 (`<domain>_<action>`)
- 영어 소문자 + 언더스코어
- 액션이 누적되는 경우 view → edit → manage 순으로 단계 표현

---

## 8. 주의사항 / 안티패턴

### ⚠ 절대 하지 말 것

1. **클라이언트만 가드 두지 말 것**
   - 메뉴 숨기는 것만으로 보안 됐다고 착각 금지. URL 직접 입력 = 통과.
   - 항상 middleware (페이지) + API 라우트 (액션) 두 곳 모두 가드.

2. **JWT 안에 민감 정보 넣지 말 것**
   - JWT 는 단순 base64 encode — 누구나 디코드 가능 (단지 서명 위조 불가).
   - 비밀번호, 결제 정보, PII 절대 금지. user_id + role + permissions 정도만.

3. **bcrypt 를 Edge runtime 에서 import 금지**
   - middleware (Edge) 에서 `bcryptjs` import 하면 빌드 실패 또는 런타임 에러.
   - 비밀번호 검증은 Node runtime API 라우트에서만.

4. **권한 체크를 미들웨어에 다 몰지 말 것**
   - API 별로 권한이 미세하게 다른 경우 표현 불가.
   - 각 API 라우트의 첫 줄에 `if (!session.permissions.includes(...))` 가 더 명료.

5. **role 별 권한을 DB 에 넣지 말 것**
   - `ROLE_DEFAULTS` 는 코드에 둬야 PR 리뷰로 변경 추적 가능.
   - DB 에 넣으면 환경별 불일치 + 마이그레이션 복잡도 증가.

### ✅ 권장 패턴

1. **권한 변경은 코드 PR로** — 누가 언제 왜 변경했는지 git log 에 기록됨
2. **새 페이지 추가 시** route-permissions 매핑 함께 추가 → 미들웨어 자동 보호
3. **테스트 계정** 도 ROLE_DEFAULTS 와 동일하게 부여 → 실제 사용자와 같은 경험
4. **password_plain 컬럼** 사용 여부는 보안/운영 trade-off — *없으면* 분실 비번 = 재발급만, *있으면* 평문 노출 위험. Frame Ops 는 매장 매니저 분실 잦아 보관 채택.
5. **세션 만료** — 도메인 특성에 맞게. 12시간(매장 시프트), 1시간(금융), 24시간(B2B 일반).
6. **/api/auth/me** 캐싱 — 30초 deduping. 권한 변경 즉시 반영 원하면 짧게(5초), 트래픽 우선이면 길게(2분).

### 🧪 검증 시나리오

신규 적용 후 반드시 확인:
- [ ] 비로그인 → 보호 페이지 접근 → /login 으로 리다이렉트
- [ ] 권한 없는 사용자 → URL 직접 입력 → /forbidden 으로 리다이렉트
- [ ] 권한 없는 사용자 → 홈 화면에 해당 메뉴 아이콘 안 보임
- [ ] 권한 없는 사용자 → API POST 직접 호출 → 403
- [ ] JWT 만료 → 자동 로그아웃 + /login 으로 이동
- [ ] AUTH_SECRET 변경 → 모든 사용자 강제 로그아웃 (의도된 동작)
- [ ] 권한 매핑 추가 시 새 사용자 권한도 정상 동작
- [ ] 같은 매장 동일 비밀번호 → 생성 단계에서 차단 (지점 모드만)

---

## 부록 A — 참조 파일 빠른 인덱스

| 파일 | 역할 |
|---|---|
| `lib/auth/session.ts` | JWT sign/verify (jose, Edge 호환) |
| `lib/auth/server-session.ts` | RSC/API 라우트용 헬퍼 |
| `lib/auth/password.ts` | bcrypt (Node 전용) |
| `lib/auth/permissions.ts` | 권한 키 + 역할 기본값 |
| `lib/auth/route-permissions.ts` | 라우트 → 권한 매핑 |
| `lib/auth/accessible-stores.ts` | 사용자별 접근 가능 매장 |
| `middleware.ts` | 모든 요청의 가드 (Edge) |
| `hooks/useSession.ts` | 클라이언트 세션 hook |
| `app/api/auth/login/route.ts` | 로그인 (HQ + 지점 양쪽 모드) |
| `app/api/auth/logout/route.ts` | 쿠키 삭제 |
| `app/api/auth/me/route.ts` | 현재 세션 + 매장명 |
| `app/api/auth/switch-store/route.ts` | 본사 사용자 매장 전환 |
| `app/api/auth/verify-staff-password/route.ts` | 결제 시 담당자 비번 재확인 |
| `app/forbidden/page.tsx` | 권한 부족 안내 |
| `app/login/page.tsx` | 로그인 폼 |
| `app/admin/staff/page.tsx` + `StaffFormDialog.tsx` | 지점 직원 관리 |
| `app/hq/staff/page.tsx` | 본사 직원 관리 |
| `app/hq/store-accounts/page.tsx` | 매장 매니저 계정 관리 |
| `components/layout/Header.tsx` | 데스크탑 nav + 모바일 탭바 |
| `components/layout/UserMenu.tsx` | 우측 사용자 드롭다운 |

## 부록 B — 흐름도 (한 요청의 전체 path)

```
사용자가 https://app.com/admin/orders 클릭
   │
   ▼
1. middleware.ts 진입 (Edge)
   ├─ isPublic('/admin/orders')? → false
   ├─ verifySession(cookie) → SessionPayload | null
   │     ├─ null → redirect('/login?next=/admin/orders')
   │     └─ {role: 'store_manager', permissions: [...]}
   ├─ isHqPath('/admin/orders')? → false
   ├─ getRequiredPermission('/admin/orders') → 'orders_list'
   ├─ session.permissions.includes('orders_list') → true
   └─ NextResponse.next()
   │
   ▼
2. Page renders (RSC or Client)
   ├─ const session = await getServerSession()    // RSC 의 경우
   ├─ useSession()                                  // Client 의 경우
   └─ JSX 그리기 (이미 권한 체크 후라 신뢰 가능)
   │
   ▼
3. 페이지 안에서 액션 (예: 발주 처리) 클릭
   │
   ▼
4. POST /api/admin/orders/place
   ├─ middleware 가 또 검사 (= 1과 동일)
   ├─ API 라우트 진입:
   │   const session = await getServerSession()
   │   if (!session.permissions.includes('orders_list')) return 403
   ├─ 비즈니스 로직 실행
   └─ JSON 응답
```

---

문의 / 개선 제안은 PR 로 부탁드립니다.
