# Frame Ops Phase 2 FINAL — 안경원 특화 POS 전면 구축

> **작성일**: 2026-04-23  
> **대상**: Claude Code  
> **전제**: Phase 1 (TASK 1-8) 완료, `.env.local`이 Frame OPS Project(`abexvzqtpyqovytlcgst`)를 가리킴  
> **목표**: Streamlit을 완전히 대체하는 매장 실전 POS 플랫폼 완성

---

## 🎯 이번 Phase의 철학

**"안경원은 편의점이 아니다"**

- 재고 0이어도 판매 가능 (주문 후 매입)
- 영수증은 출력하지 않음 (디지털 기반)
- 모든 UI 반응은 100ms 이내
- 네트워크 없어도 판매는 계속

---

## 📋 확정된 설계 결정 사항

### DB 구조 변경
- ✅ `fo_sale_items` 신규 테이블 생성
- ✅ `fo_products.stock_quantity` 컬럼 추가 (NULL 허용, 음수 허용)
- ✅ 음수 재고 = 매입 대기 건수

### 재고 관리 철학
- 재고는 **"정보"**일 뿐, 판매 차단 용도 아님
- `stock_quantity < 0` = 발주 필요 상품
- `/inventory/pending` 페이지에서 발주 목록 확인

### 제거되는 기능
- ❌ 영수증 출력 (모든 프린터 연동 코드 제거)
- ❌ Sewoo 라벨 프린터 ESC/POS/ZPL II
- ❌ Bluetooth/USB 프린터 통신
- ❌ 재고 기반 판매 차단

### 추가되는 기능
- ✅ 품목별 판매 기록 (`fo_sale_items`)
- ✅ 자동 재고 차감 (음수 허용)
- ✅ 발주 대기 페이지 (`/inventory/pending`)
- ✅ 격리된 state의 키패드
- ✅ Optimistic UI 전면화

---

# 🚀 PART 0: DB 구조 정비 (필수 선행)

## TASK 0-1: fo_sale_items 테이블 및 재고 컬럼 생성

**목표**: Phase 2 진행 전 DB 구조 준비

### 실행 단계

#### 0-1-A. 마이그레이션 파일 생성

```bash
# 루트 supabase/migrations에 생성 (기존 관행 따름)
cd /Users/jinykim/Desktop/frame_ops
touch "supabase/migrations/$(date +%Y%m%d)_add_sale_items_and_stock.sql"
```

#### 0-1-B. SQL 작성

```sql
-- supabase/migrations/20260423_add_sale_items_and_stock.sql

begin;

-- ============================================================
-- 1. fo_sale_items 테이블 신규 생성
-- ============================================================
create table if not exists fo_sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references fo_sales(id) on delete cascade,
  product_id uuid not null references fo_products(id) on delete restrict,
  quantity int not null default 1 check (quantity > 0),
  unit_price int not null check (unit_price >= 0),
  discount_amount int not null default 0 check (discount_amount >= 0),
  line_note text,
  created_at timestamptz not null default now()
);

comment on table fo_sale_items is '판매 품목 상세';
comment on column fo_sale_items.quantity is '판매 수량 (양수)';
comment on column fo_sale_items.unit_price is '판매 시점 단가';
comment on column fo_sale_items.discount_amount is '품목별 개별 할인';
comment on column fo_sale_items.line_note is '라인별 메모 (옵션)';

-- 인덱스
create index if not exists idx_fo_sale_items_sale 
  on fo_sale_items(sale_id);
create index if not exists idx_fo_sale_items_product 
  on fo_sale_items(product_id);
create index if not exists idx_fo_sale_items_created 
  on fo_sale_items(created_at desc);

-- ============================================================
-- 2. fo_products에 재고 컬럼 추가
-- ============================================================
alter table fo_products 
  add column if not exists stock_quantity int default null;

comment on column fo_products.stock_quantity is 
  '재고 수량. NULL=추적 안 함, 양수=매장 보유, 0=없음, 음수=매입 대기 건수';

-- 음수 재고(발주 필요) 조회용 partial index
create index if not exists idx_fo_products_stock_negative
  on fo_products(stock_quantity, style_code)
  where stock_quantity is not null and stock_quantity < 0;

-- 재고 0 조회용
create index if not exists idx_fo_products_stock_zero
  on fo_products(style_code)
  where stock_quantity = 0;

commit;
```

#### 0-1-C. 사용자 안내

```
⚠️ 이 마이그레이션은 새 테이블 생성과 컬럼 추가를 포함합니다.
Supabase SQL Editor에서 수동 적용이 필요합니다:

1. https://app.supabase.com/project/abexvzqtpyqovytlcgst/sql/new 접속
2. 위 파일 내용 복사 붙여넣기
3. Run 클릭
4. Table Editor에서 fo_sale_items 생성 확인
5. 완료되면 "DB 마이그레이션 완료" 알려주세요
```

### 커밋 메시지
```
feat(db): fo_sale_items 테이블 및 stock_quantity 컬럼 추가

- 판매 품목 상세 기록용 fo_sale_items 신설
- fo_products.stock_quantity로 재고 추적 (NULL/음수 허용)
- 음수 재고는 "매입 대기" 의미 (안경원 실무 반영)
- 발주 조회용 partial index 2종

SQL 파일만 생성, Supabase SQL Editor 수동 적용 필요.
```

**⚠️ 중요**: 이 TASK는 SQL 파일 생성까지만. DB 적용은 JINY가 수동으로 하고 완료 보고 후 TASK 1부터 진행.

---

# 🚀 PART A: 프론트엔드 반응성

## TASK 1: 렌더링 폭주 진단 (코드 수정 없음)

**목표**: 추측 대신 실측으로 병목 특정

### 실행 단계

#### 1-A. POS 관련 기존 컴포넌트 스캔

```bash
# 키패드/금액 입력/모달 등 관련 파일 전부 찾기
find . -type f \( -name "*.tsx" -o -name "*.ts" \) \
  -not -path "*/node_modules/*" \
  -not -path "*/.next/*" \
  -not -path "*/.git/*" \
  -exec grep -l -iE "keypad|numpad|amount|결제|payment|checkout|cart|장바구니|modal|dialog" {} \;
```

#### 1-B. 각 컴포넌트의 state 위치 분석

보고서 `DIAGNOSIS_PHASE2.md` 작성:

```markdown
# Phase 2 진단 보고서

## 1. POS 관련 파일 인벤토리
| 파일 | 유형 | 라인 수 | state 위치 | 문제 |
|------|------|---------|-----------|------|
| app/pos/page.tsx | 페이지 | ??? | ??? | ??? |
| components/pos/Keypad.tsx | 키패드 | ??? | 상위 prop? 내부? | ??? |

## 2. 리렌더 폭주 의심 지점
- 파일:라인 형식으로 모든 의심 지점 명시
- 각 지점의 심각도: 🔴 Critical / 🟠 High / 🟡 Medium

## 3. CSS 안티패턴
- transition: all 사용처
- backdrop-filter 과다 사용
- box-shadow 애니메이션

## 4. 측정 권장 지점
- React Profiler로 확인할 컴포넌트 목록
- Paint Flashing으로 확인할 화면
```

#### 1-C. 현재 `/pos` 라우트 상태 확인

```bash
ls -la app/pos/ 2>/dev/null || echo "pos 디렉토리 없음"
cat app/pos/page.tsx 2>/dev/null || echo "pos/page.tsx 없음"
```

만약 `/pos` 라우트가 없으면 → TASK 8에서 **신규 작성**해야 함을 기록.

### 검증
- `DIAGNOSIS_PHASE2.md` 파일 생성 확인
- 각 문제점에 파일:라인 명시
- 코드는 한 줄도 수정하지 말 것

### 보고 후 대기
진단 완료 후 JINY 승인 받고 TASK 2부터 진행.

---

## TASK 2: State 격리 아키텍처 전면 도입

**목표**: "입력 중 state는 컴포넌트 내부, 확정 시에만 부모 전달" 패턴

### 핵심 패턴

```tsx
// ❌ 금지 패턴 (리렌더 폭주 원인)
function Parent() {
  const [amount, setAmount] = useState('');
  return (
    <div>
      <ExpensiveChild1 />       {/* amount 바뀌면 리렌더 */}
      <ExpensiveChild2 />       {/* 영향받음 */}
      <Keypad value={amount} onChange={setAmount} />
    </div>
  );
}

// ✅ 필수 패턴
function Parent() {
  const [confirmedAmount, setConfirmedAmount] = useState(0);
  return (
    <div>
      <ExpensiveChild1 />
      <ExpensiveChild2 />
      <KeypadDialog 
        initialValue={confirmedAmount}
        onConfirm={setConfirmedAmount}
      />
    </div>
  );
}

function KeypadDialog({ initialValue, onConfirm }) {
  const [localAmount, setLocalAmount] = useState(initialValue);
  return (
    <Modal>
      <Display value={localAmount} />
      <Keypad onPress={d => setLocalAmount(p => p + d)} />
      <ConfirmButton onClick={() => onConfirm(localAmount)} />
    </Modal>
  );
}
```

### 실행 단계

#### 2-A. TASK 1 진단 보고서 기반 대상 선정

DIAGNOSIS_PHASE2.md에서 🔴/🟠 심각도의 컴포넌트 목록 확정.

#### 2-B. 각 컴포넌트 재구조화

일반적 대상:
- 금액 입력 모달 (할인액, 결제액)
- 수량 입력 팝업
- 검색창 (타이핑 중 state)
- 필터 모달 (적용 전 선택값)

각 컴포넌트에 대해:
1. `initialValue` prop 수신
2. `useState(initialValue)`로 로컬 state 생성
3. `onConfirm(value)` / `onCancel()` 콜백만 부모에 노출
4. 부모는 확정값만 관리

### 커밋 메시지
```
perf(ui): 입력 컴포넌트 state 격리

- 숫자 키패드, 금액 입력, 수량 선택 등 입력 UI의 state를 
  컴포넌트 내부로 이동
- onConfirm 콜백 패턴으로 부모 리렌더 최소화
- 리렌더 범위: 화면 전체 → 입력 다이얼로그 내부로 한정
```

---

## TASK 3: memo + useCallback 전면화

**목표**: memo가 깨지지 않도록 모든 prop 참조 안정화

### 실행 단계

#### 3-A. 인터랙티브 컴포넌트 memo 적용

```tsx
// components/ui/Button.tsx
import { memo } from 'react';

export const Button = memo(function Button({ 
  onClick, children, variant = 'primary' 
}: ButtonProps) {
  return (
    <button onClick={onClick} data-variant={variant}>
      {children}
    </button>
  );
});
```

#### 3-B. 핸들러 안정화

```tsx
// ❌ 매 렌더마다 새 함수
<Button onClick={() => handleClick(id)}>Submit</Button>

// ✅ 안정 참조
const handleSubmit = useCallback(() => handleClick(id), [id]);
<Button onClick={handleSubmit}>Submit</Button>
```

#### 3-C. ESLint 규칙 강화

`.eslintrc.json` 또는 `eslint.config.js`에:

```json
{
  "rules": {
    "react-hooks/exhaustive-deps": "error",
    "react/jsx-no-bind": ["warn", {
      "allowArrowFunctions": false,
      "allowFunctions": false,
      "allowBind": false,
      "ignoreDOMComponents": true
    }]
  }
}
```

### 커밋 메시지
```
perf(ui): 버튼/인터랙티브 요소 memo + 핸들러 안정화

- 주요 UI 컴포넌트 React.memo 래핑
- 모든 이벤트 핸들러 useCallback 적용
- ESLint로 인라인 함수 prop 경고
```

---

## TASK 4: CSS 렌더링 비용 축소

**목표**: 브라우저 페인트/합성 비용 최소화

### 실행 단계

#### 4-A. transition 정밀화

```bash
# 전역 검색
grep -rn "transition:\s*all" --include="*.css" --include="*.tsx" .
```

발견된 모든 곳 교체:

```css
/* ❌ Before */
.button { transition: all 0.3s; }

/* ✅ After */
.button { 
  transition: transform 0.1s, opacity 0.1s;
  will-change: transform;
}
```

#### 4-B. 버튼 active 상태 최적화

```css
/* ❌ 레이아웃/페인트 유발 */
.btn:active {
  background: #...;
  box-shadow: 0 4px 8px rgba(0,0,0,0.2);
  transform: translateY(1px);
}

/* ✅ 합성만 (GPU) */
.btn {
  transition: transform 0.05s, opacity 0.05s;
}
.btn:active {
  transform: scale(0.95);
  opacity: 0.8;
}
```

#### 4-C. 터치 이벤트 최적화

`app/globals.css` 상단에 추가:

```css
/* 터치 반응성 최적화 */
button, a, [role="button"], [role="radio"] {
  touch-action: manipulation;           /* 300ms 지연 제거 */
  -webkit-tap-highlight-color: transparent;
  user-select: none;
  -webkit-user-select: none;
}

/* 스크롤 최적화 */
.scrollable {
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
}

/* iOS 입력 필드 줌 방지 */
input, textarea, select {
  font-size: 16px;
}
```

#### 4-D. backdrop-filter 모바일 비활성화

```css
/* 모달 backdrop: 모바일은 단순화 */
.modal-backdrop {
  background: rgba(0, 0, 0, 0.4);
}

@media (min-width: 1024px) {
  /* 데스크톱/큰 iPad만 blur */
  .modal-backdrop--premium {
    backdrop-filter: blur(8px);
  }
}
```

### 커밋 메시지
```
perf(css): 렌더링 비용 축소 및 터치 반응성 향상

- transition: all 제거, transform/opacity만 애니메이션
- box-shadow 애니메이션 → scale/opacity (GPU 합성)
- touch-action: manipulation으로 iOS 300ms 지연 제거
- -webkit-tap-highlight 제거
- backdrop-filter 모바일 자동 비활성화
- iOS 줌 방지 위해 input font-size 16px
```

---

## TASK 5: Optimistic UI 전면 도입

**목표**: 사용자 액션 즉시 반영, 서버 통신 백그라운드

### 실행 단계

#### 5-A. SWR Optimistic 유틸

```tsx
// lib/optimistic.ts
import { mutate as globalMutate } from 'swr';

export async function optimisticMutation<T>(options: {
  key: string | readonly unknown[];
  optimisticData: T;
  mutation: () => Promise<T>;
  rollbackData: T;
  onError?: (err: Error) => void;
}) {
  const { key, optimisticData, mutation, rollbackData, onError } = options;
  
  // 1. 즉시 UI 반영
  await globalMutate(key, optimisticData, { revalidate: false });
  
  try {
    // 2. 백그라운드 서버 호출
    const result = await mutation();
    // 3. 서버 결과로 교체 (재검증 없음)
    await globalMutate(key, result, { revalidate: false });
    return result;
  } catch (err) {
    // 4. 롤백
    await globalMutate(key, rollbackData, { revalidate: false });
    onError?.(err as Error);
    throw err;
  }
}
```

#### 5-B. 결제 Optimistic (POS 핵심)

```tsx
// hooks/useCheckout.ts
export function useCheckout() {
  const router = useRouter();
  
  const submit = async (saleData: SaleInput) => {
    // 1. 즉시 "판매 완료" 토스트
    toast.success('판매 완료', { duration: 2000 });
    
    // 2. 바로 홈으로 이동 (다음 고객 준비)
    router.push('/');
    
    try {
      // 3. 백그라운드 저장
      const sale = await salesApi.create(saleData);
      
      // 4. IndexedDB에 백업
      await dbPut('sales', sale);
    } catch (err) {
      // 5. 실패 시 sync_queue (오프라인 복원력)
      await enqueueSync({
        id: `sale-${Date.now()}`,
        endpoint: '/api/sales',
        method: 'POST',
        payload: saleData,
      });
      
      toast.warning('네트워크 복구 시 자동 전송됩니다.');
    }
  };
  
  return { submit };
}
```

#### 5-C. 시각적 피드백 컴포넌트

```tsx
// components/ui/PressableButton.tsx
'use client';

import { memo, useCallback } from 'react';

interface Props {
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
}

export const PressableButton = memo(function PressableButton({
  onClick, children, className = '', disabled = false,
}: Props) {
  const handleClick = useCallback(() => {
    if (!disabled) onClick();
  }, [onClick, disabled]);
  
  return (
    <button
      onClick={handleClick}
      disabled={disabled}
      className={`pressable-btn ${className}`}
      // CSS transition: transform 0.05s로 시각적 즉시 반응
    >
      {children}
    </button>
  );
});
```

```css
.pressable-btn {
  transition: transform 0.05s ease-out, opacity 0.05s ease-out;
  will-change: transform;
}
.pressable-btn:active:not(:disabled) {
  transform: scale(0.95);
  opacity: 0.85;
}
```

### 커밋 메시지
```
feat(ux): Optimistic UI 전면 도입

- 결제 버튼 클릭 시 즉시 "판매 완료" 토스트 + 홈 이동
  (서버 저장은 백그라운드, 실패 시 sync_queue로 폴백)
- 장바구니 추가/수정 즉시 반영
- PressableButton으로 터치 시각 피드백 (50ms GPU 합성)
```

---

# 🚀 PART B: 백엔드 최적화

## TASK 6: Supabase RPC 3종 + 재고 차감 트리거

**목표**: 여러 번 왕복하는 쿼리를 단일 호출로, 재고 자동 관리

### 생성할 것

#### 6-A. 결제 RPC (핵심)

```sql
-- supabase/migrations/20260423_create_sale_rpc.sql
begin;

create or replace function create_sale_with_items(
  p_store_id uuid,
  p_items jsonb,
  p_cash_amount int,
  p_card_amount int,
  p_discount_total int,
  p_discount_type_code text default null,
  p_seller_user_id uuid default null,
  p_seller_code text default null,
  p_seller_label text default null,
  p_clerk_note text default null,
  p_idempotency_key text default null
)
returns table (
  sale_id uuid,
  sold_at timestamptz,
  total_amount bigint,
  items_created int
)
language plpgsql
as $$
declare
  v_sale_id uuid;
  v_existing_sale_id uuid;
  v_item_count int;
begin
  -- Idempotency 체크
  if p_idempotency_key is not null then
    select id into v_existing_sale_id
    from fo_sales 
    where idempotency_key = p_idempotency_key;
    
    if v_existing_sale_id is not null then
      return query
      select 
        s.id,
        s.sold_at,
        (s.cash_amount + s.card_amount - s.discount_total)::bigint,
        (select count(*)::int from fo_sale_items where sale_id = s.id)
      from fo_sales s
      where s.id = v_existing_sale_id;
      return;
    end if;
  end if;
  
  -- 판매 레코드 생성
  insert into fo_sales (
    store_id, sold_at, cash_amount, card_amount,
    discount_total, discount_type_code,
    seller_user_id, seller_code, seller_label,
    clerk_note, idempotency_key
  ) values (
    p_store_id, now(), p_cash_amount, p_card_amount,
    p_discount_total, p_discount_type_code,
    p_seller_user_id, p_seller_code, p_seller_label,
    p_clerk_note, p_idempotency_key
  )
  returning id into v_sale_id;
  
  -- 품목 일괄 삽입
  insert into fo_sale_items (
    sale_id, product_id, quantity, unit_price, discount_amount
  )
  select 
    v_sale_id,
    (item->>'product_id')::uuid,
    (item->>'quantity')::int,
    (item->>'unit_price')::int,
    coalesce((item->>'discount_amount')::int, 0)
  from jsonb_array_elements(p_items) as item;
  
  get diagnostics v_item_count = row_count;
  
  -- 재고 차감 (stock_quantity가 NULL이 아닌 제품만)
  -- ⚠️ 안경원 실무: 음수되어도 OK (매입 대기)
  update fo_products p
  set stock_quantity = p.stock_quantity - (item->>'quantity')::int
  from jsonb_array_elements(p_items) as item
  where p.id = (item->>'product_id')::uuid
    and p.stock_quantity is not null;
  
  return query
  select 
    v_sale_id,
    now()::timestamptz,
    (p_cash_amount + p_card_amount - p_discount_total)::bigint,
    v_item_count;
end;
$$;

grant execute on function create_sale_with_items to service_role;

commit;
```

#### 6-B. 제품 검색 RPC

```sql
-- supabase/migrations/20260423_search_products_rpc.sql
begin;

create extension if not exists pg_trgm;

create index if not exists idx_fo_products_style_code_trgm 
  on fo_products using gin (style_code gin_trgm_ops)
  where status = 'active';

create index if not exists idx_fo_products_display_name_trgm 
  on fo_products using gin (display_name gin_trgm_ops)
  where status = 'active';

create or replace function search_products_fast(
  p_query text default null,
  p_brand_id uuid default null,
  p_limit int default 50,
  p_offset int default 0
)
returns table (
  id uuid,
  brand_id uuid,
  style_code text,
  color_code text,
  display_name text,
  sale_price int,
  stock_quantity int,
  status text,
  brand_name text,
  match_score real
)
language sql
stable
as $$
  select 
    p.id,
    p.brand_id,
    p.style_code,
    p.color_code,
    p.display_name,
    p.sale_price,
    p.stock_quantity,
    p.status,
    b.name as brand_name,
    case 
      when p_query is null then 1.0
      else greatest(
        similarity(p.style_code, p_query),
        similarity(coalesce(p.display_name, ''), p_query) * 0.8,
        similarity(coalesce(p.color_code, ''), p_query) * 0.6
      )
    end as match_score
  from fo_products p
  inner join fo_brands b on b.id = p.brand_id
  where 
    p.status = 'active'
    and p.style_code not like '%:%'
    and (p_brand_id is null or p.brand_id = p_brand_id)
    and (
      p_query is null
      or p.style_code ilike '%' || p_query || '%'
      or p.display_name ilike '%' || p_query || '%'
      or p.color_code ilike '%' || p_query || '%'
      or similarity(p.style_code, p_query) > 0.3
    )
  order by match_score desc, p.style_code asc
  limit p_limit offset p_offset;
$$;

grant execute on function search_products_fast to service_role;

commit;
```

#### 6-C. 발주 대기 조회 RPC

```sql
-- supabase/migrations/20260423_pending_stock_rpc.sql
begin;

create or replace function get_pending_stock_items()
returns table (
  id uuid,
  style_code text,
  color_code text,
  display_name text,
  brand_name text,
  stock_quantity int,
  pending_count int  -- 매입 필요 수량 (abs value of negative)
)
language sql
stable
as $$
  select 
    p.id,
    p.style_code,
    p.color_code,
    p.display_name,
    b.name as brand_name,
    p.stock_quantity,
    abs(p.stock_quantity) as pending_count
  from fo_products p
  inner join fo_brands b on b.id = p.brand_id
  where 
    p.stock_quantity is not null 
    and p.stock_quantity < 0
    and p.status = 'active'
  order by p.stock_quantity asc, p.style_code asc;  -- 더 많이 부족한 것부터
$$;

grant execute on function get_pending_stock_items to service_role;

commit;
```

### 커밋 메시지
```
feat(backend): Supabase RPC 3종 추가

- create_sale_with_items: 판매+품목+재고차감 원자적 처리
  · idempotency로 중복 결제 방지
  · stock_quantity 자동 차감 (음수 허용 = 매입 대기)
- search_products_fast: trigram 퍼지 검색
- get_pending_stock_items: 발주 대기 목록 (음수 재고)

SQL 파일만 생성, DB 적용은 JINY가 수동.
```

**⚠️ 중요**: 이 SQL 파일들도 생성만 하고 적용은 JINY 수동. TASK 7부터는 이 RPC 호출 코드가 들어가므로, 실행 전 JINY의 DB 적용 완료 신호가 필요.

---

## TASK 7: API Route 최적화 + RPC 연동

**목표**: RPC 함수를 실제 API에서 호출, 캐싱 전면화

### 실행 단계

#### 7-A. `/api/products/search` 신규

```tsx
// app/api/products/search/route.ts
import { NextResponse } from 'next/server';
import { getDB } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get('q') || null;
  const brandId = url.searchParams.get('brand') || null;
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100);
  const offset = parseInt(url.searchParams.get('offset') || '0');
  
  const db = getDB();
  const { data, error } = await db.rpc('search_products_fast', {
    p_query: query,
    p_brand_id: brandId,
    p_limit: limit,
    p_offset: offset,
  });
  
  if (error) {
    return NextResponse.json({ data: null, error: error.message }, { status: 500 });
  }
  
  return NextResponse.json(
    { data, error: null },
    {
      headers: {
        // 검색 결과는 짧게 캐싱
        'Cache-Control': 's-maxage=10, stale-while-revalidate=60',
      },
    }
  );
}
```

#### 7-B. `/api/sales/create` 신규 (POST)

```tsx
// app/api/sales/create/route.ts
import { NextResponse } from 'next/server';
import { getDB } from '@/lib/supabase/server';

interface CreateSalePayload {
  store_id: string;
  items: Array<{
    product_id: string;
    quantity: number;
    unit_price: number;
    discount_amount?: number;
  }>;
  cash_amount: number;
  card_amount: number;
  discount_total: number;
  discount_type_code?: string;
  seller_user_id?: string;
  seller_code?: string;
  seller_label?: string;
  clerk_note?: string;
  idempotency_key: string;  // 필수
}

export async function POST(request: Request) {
  try {
    const body: CreateSalePayload = await request.json();
    
    if (!body.idempotency_key) {
      return NextResponse.json(
        { data: null, error: 'idempotency_key는 필수입니다' },
        { status: 400 }
      );
    }
    
    const db = getDB();
    const { data, error } = await db.rpc('create_sale_with_items', {
      p_store_id: body.store_id,
      p_items: body.items,
      p_cash_amount: body.cash_amount,
      p_card_amount: body.card_amount,
      p_discount_total: body.discount_total,
      p_discount_type_code: body.discount_type_code ?? null,
      p_seller_user_id: body.seller_user_id ?? null,
      p_seller_code: body.seller_code ?? null,
      p_seller_label: body.seller_label ?? null,
      p_clerk_note: body.clerk_note ?? null,
      p_idempotency_key: body.idempotency_key,
    });
    
    if (error) {
      return NextResponse.json({ data: null, error: error.message }, { status: 500 });
    }
    
    return NextResponse.json({ data: data?.[0] ?? null, error: null });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ data: null, error: msg }, { status: 500 });
  }
}
```

#### 7-C. `/api/inventory/pending` 신규

```tsx
// app/api/inventory/pending/route.ts
import { NextResponse } from 'next/server';
import { getDB } from '@/lib/supabase/server';

export async function GET() {
  const db = getDB();
  const { data, error } = await db.rpc('get_pending_stock_items');
  
  if (error) {
    return NextResponse.json({ data: null, error: error.message }, { status: 500 });
  }
  
  return NextResponse.json(
    { data, error: null },
    {
      headers: {
        // 발주 대기는 실시간성 중요
        'Cache-Control': 's-maxage=5, stale-while-revalidate=30',
      },
    }
  );
}
```

#### 7-D. API 클라이언트 확장

```tsx
// lib/api-client.ts에 추가
export const salesApi = {
  async create(payload: CreateSalePayload): Promise<Sale> {
    const res = await fetch('/api/sales/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (json.error) throw new Error(json.error);
    return json.data;
  },
};

export const productsApi = {
  // 기존 list 유지...
  
  async search(query: string, brandId?: string): Promise<Product[]> {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (brandId) params.set('brand', brandId);
    params.set('limit', '50');
    
    const res = await fetch(`/api/products/search?${params}`);
    const json = await res.json();
    if (json.error) throw new Error(json.error);
    return json.data ?? [];
  },
};

export const inventoryApi = {
  // 기존 list 유지...
  
  async pending(): Promise<PendingStockItem[]> {
    const res = await fetch('/api/inventory/pending');
    const json = await res.json();
    if (json.error) throw new Error(json.error);
    return json.data ?? [];
  },
};
```

### 커밋 메시지
```
feat(api): RPC 기반 API 엔드포인트 3종 추가

- POST /api/sales/create: 원자적 결제 처리
- GET /api/products/search: 퍼지 검색 (trigram)
- GET /api/inventory/pending: 발주 대기 목록
- Cache-Control 헤더로 CDN 레벨 캐싱
- lib/api-client.ts에 salesApi, productsApi.search, inventoryApi.pending 추가
```

---

# 🚀 PART C: 실전 POS 구축

## TASK 8: POS 판매 화면 전면 구현

**목표**: Streamlit을 대체하는 완성도

### 파일 구조

```
app/pos/
├── page.tsx                      POS 메인 (2-column 레이아웃)
└── components/
    ├── ProductSearch.tsx          제품 검색 + 선택
    ├── ProductGrid.tsx            검색 결과 그리드 (가상 스크롤)
    ├── CartView.tsx               장바구니 (좌측)
    ├── CartItem.tsx               장바구니 행 (memo)
    ├── PriceSummary.tsx           소계/할인/합계
    ├── NumberKeypad.tsx           ⭐ 격리된 state 키패드
    ├── DiscountDialog.tsx         할인 입력 다이얼로그
    ├── PaymentDialog.tsx          결제 (현금/카드 분할)
    └── QuantityDialog.tsx         수량 변경 다이얼로그

hooks/
├── useCart.ts                    장바구니 상태
├── useCheckout.ts                결제 로직
└── useDebounce.ts                검색 debounce
```

### 8-A. useCart 훅

```tsx
// hooks/useCart.ts
'use client';

import { useState, useCallback, useMemo } from 'react';
import type { Product } from '@/types';

export interface CartItem {
  id: string;              // 로컬 임시 ID
  product_id: string;
  style_code: string;
  display_name: string;
  unit_price: number;
  quantity: number;
  discount_amount: number;
}

export function useCart() {
  const [items, setItems] = useState<CartItem[]>([]);
  
  const addItem = useCallback((product: Product) => {
    setItems(prev => {
      // 동일 제품 이미 있으면 수량만 증가
      const existing = prev.find(i => i.product_id === product.id);
      if (existing) {
        return prev.map(i =>
          i.product_id === product.id 
            ? { ...i, quantity: i.quantity + 1 }
            : i
        );
      }
      return [...prev, {
        id: `cart-${Date.now()}-${product.id}`,
        product_id: product.id,
        style_code: product.style_code ?? '',
        display_name: product.display_name ?? product.style_code ?? '',
        unit_price: product.sale_price ?? 0,
        quantity: 1,
        discount_amount: 0,
      }];
    });
  }, []);
  
  const removeItem = useCallback((cartItemId: string) => {
    setItems(prev => prev.filter(i => i.id !== cartItemId));
  }, []);
  
  const updateQuantity = useCallback((cartItemId: string, quantity: number) => {
    if (quantity <= 0) {
      setItems(prev => prev.filter(i => i.id !== cartItemId));
      return;
    }
    setItems(prev => prev.map(i =>
      i.id === cartItemId ? { ...i, quantity } : i
    ));
  }, []);
  
  const updateItemDiscount = useCallback((cartItemId: string, discount: number) => {
    setItems(prev => prev.map(i =>
      i.id === cartItemId ? { ...i, discount_amount: discount } : i
    ));
  }, []);
  
  const clear = useCallback(() => setItems([]), []);
  
  const totals = useMemo(() => {
    const subtotal = items.reduce(
      (sum, i) => sum + i.unit_price * i.quantity, 0
    );
    const itemDiscounts = items.reduce(
      (sum, i) => sum + i.discount_amount, 0
    );
    return { subtotal, itemDiscounts };
  }, [items]);
  
  return {
    items,
    addItem,
    removeItem,
    updateQuantity,
    updateItemDiscount,
    clear,
    ...totals,
  };
}
```

### 8-B. NumberKeypad (핵심!)

```tsx
// app/pos/components/NumberKeypad.tsx
'use client';

import { memo, useCallback, useState } from 'react';

interface Props {
  initialValue?: number;
  label?: string;
  maxValue?: number;
  onConfirm: (value: number) => void;
  onCancel: () => void;
}

export const NumberKeypad = memo(function NumberKeypad({
  initialValue = 0,
  label = '금액 입력',
  maxValue,
  onConfirm,
  onCancel,
}: Props) {
  // ⭐ state는 여기에만! 부모 리렌더 안 됨
  const [value, setValue] = useState(initialValue.toString());
  
  const handleDigit = useCallback((digit: string) => {
    setValue(prev => {
      const next = prev === '0' ? digit : prev + digit;
      if (next.length > 10) return prev;
      if (maxValue && parseInt(next, 10) > maxValue) return prev;
      return next;
    });
  }, [maxValue]);
  
  const handleBackspace = useCallback(() => {
    setValue(prev => prev.length <= 1 ? '0' : prev.slice(0, -1));
  }, []);
  
  const handleClear = useCallback(() => setValue('0'), []);
  
  const handleConfirm = useCallback(() => {
    onConfirm(parseInt(value, 10) || 0);
  }, [value, onConfirm]);
  
  const numericValue = parseInt(value, 10) || 0;
  
  return (
    <div className="keypad">
      <div className="keypad-display">
        <span className="keypad-label">{label}</span>
        <span className="keypad-amount">
          ₩{numericValue.toLocaleString()}
        </span>
      </div>
      
      <div className="keypad-grid">
        {['1','2','3','4','5','6','7','8','9'].map(d => (
          <KeypadButton key={d} digit={d} onPress={handleDigit} />
        ))}
        <KeypadButton label="지움" onPress={handleClear} variant="secondary" />
        <KeypadButton digit="0" onPress={handleDigit} />
        <KeypadButton label="⌫" onPress={handleBackspace} variant="secondary" />
      </div>
      
      <div className="keypad-quick">
        {[10000, 50000, 100000].map(amount => (
          <button 
            key={amount}
            className="keypad-quick-btn"
            onClick={() => setValue(String(numericValue + amount))}
          >
            +{(amount / 10000).toFixed(0)}만
          </button>
        ))}
      </div>
      
      <div className="keypad-actions">
        <button className="btn-cancel" onClick={onCancel}>취소</button>
        <button className="btn-confirm" onClick={handleConfirm}>확인</button>
      </div>
    </div>
  );
});

// 개별 버튼도 memo (인라인 함수 금지)
interface KeypadButtonProps {
  digit?: string;
  label?: string;
  onPress: (digit: string) => void;
  variant?: 'primary' | 'secondary';
}

const KeypadButton = memo(function KeypadButton({
  digit, label, onPress, variant = 'primary',
}: KeypadButtonProps) {
  const handleClick = useCallback(() => {
    onPress(digit ?? label ?? '');
  }, [digit, label, onPress]);
  
  return (
    <button
      className={`keypad-btn keypad-btn--${variant}`}
      onClick={handleClick}
    >
      {digit ?? label}
    </button>
  );
});
```

### 8-C. POS 메인 화면

```tsx
// app/pos/page.tsx
'use client';

import { useState, useMemo, useCallback } from 'react';
import { ProductSearch } from './components/ProductSearch';
import { CartView } from './components/CartView';
import { PriceSummary } from './components/PriceSummary';
import { NumberKeypad } from './components/NumberKeypad';
import { PaymentDialog } from './components/PaymentDialog';
import { useCart } from '@/hooks/useCart';
import { useCheckout } from '@/hooks/useCheckout';

export default function PosPage() {
  const cart = useCart();
  const { submit } = useCheckout();
  
  const [discountOpen, setDiscountOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [globalDiscount, setGlobalDiscount] = useState(0);
  
  const total = useMemo(() => 
    cart.subtotal - cart.itemDiscounts - globalDiscount,
    [cart.subtotal, cart.itemDiscounts, globalDiscount]
  );
  
  const handleApplyDiscount = useCallback((amount: number) => {
    setGlobalDiscount(amount);
    setDiscountOpen(false);
  }, []);
  
  const handleCheckout = useCallback(async (payment: PaymentInput) => {
    setPaymentOpen(false);
    
    await submit({
      items: cart.items.map(i => ({
        product_id: i.product_id,
        quantity: i.quantity,
        unit_price: i.unit_price,
        discount_amount: i.discount_amount,
      })),
      cash_amount: payment.cash,
      card_amount: payment.card,
      discount_total: cart.itemDiscounts + globalDiscount,
      idempotency_key: `sale-${Date.now()}-${Math.random()}`,
    });
    
    cart.clear();
    setGlobalDiscount(0);
  }, [cart, globalDiscount, submit]);
  
  return (
    <div className="pos-layout">
      {/* 좌측: 장바구니 */}
      <div className="pos-left">
        <CartView
          items={cart.items}
          onRemove={cart.removeItem}
          onQuantityChange={cart.updateQuantity}
          onDiscountChange={cart.updateItemDiscount}
        />
        <PriceSummary 
          subtotal={cart.subtotal}
          discount={cart.itemDiscounts + globalDiscount}
          total={total}
        />
        <div className="pos-actions">
          <button 
            className="btn btn-secondary"
            onClick={() => setDiscountOpen(true)}
            disabled={cart.items.length === 0}
          >
            전체 할인
          </button>
          <button 
            className="btn btn-primary"
            onClick={() => setPaymentOpen(true)}
            disabled={cart.items.length === 0 || total < 0}
          >
            결제 ({total.toLocaleString()}원)
          </button>
        </div>
      </div>
      
      {/* 우측: 제품 검색 */}
      <div className="pos-right">
        <ProductSearch onSelect={cart.addItem} />
      </div>
      
      {/* 다이얼로그들: 내부 state 격리 */}
      {discountOpen && (
        <Modal onClose={() => setDiscountOpen(false)}>
          <NumberKeypad
            initialValue={globalDiscount}
            label="전체 할인 금액"
            maxValue={cart.subtotal}
            onConfirm={handleApplyDiscount}
            onCancel={() => setDiscountOpen(false)}
          />
        </Modal>
      )}
      
      {paymentOpen && (
        <PaymentDialog
          total={total}
          onConfirm={handleCheckout}
          onCancel={() => setPaymentOpen(false)}
        />
      )}
    </div>
  );
}
```

### 8-D. 발주 대기 페이지

```tsx
// app/inventory/pending/page.tsx
'use client';

import useSWR from 'swr';
import { inventoryApi } from '@/lib/api-client';

export default function PendingStockPage() {
  const { data: items = [], isLoading, mutate } = useSWR(
    'pending-stock',
    () => inventoryApi.pending(),
    { refreshInterval: 30000 }
  );
  
  if (isLoading) return <div>로딩 중...</div>;
  
  return (
    <div className="pending-page">
      <header>
        <h1>발주 필요 제품</h1>
        <p>{items.length}개 상품 · 총 {items.reduce((s, i) => s + i.pending_count, 0)}개 매입 대기</p>
      </header>
      
      {items.length === 0 ? (
        <div className="empty-state">
          발주할 제품이 없습니다. 모든 재고가 충분합니다.
        </div>
      ) : (
        <table className="pending-table">
          <thead>
            <tr>
              <th>브랜드</th>
              <th>스타일</th>
              <th>색상</th>
              <th>제품명</th>
              <th className="right">매입 필요</th>
            </tr>
          </thead>
          <tbody>
            {items.map(item => (
              <tr key={item.id}>
                <td>{item.brand_name}</td>
                <td>{item.style_code}</td>
                <td>{item.color_code}</td>
                <td>{item.display_name}</td>
                <td className="right pending-count">
                  {item.pending_count}개
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

### 커밋 메시지
```
feat(pos): 매장 실전 POS 화면 + 발주 대기 페이지

- /pos: 장바구니 + 제품 검색 + 할인/결제 다이얼로그
- NumberKeypad: 완전 격리된 state로 리렌더 폭주 해결
- /inventory/pending: 음수 재고 제품 = 발주 대기 목록
- 영수증 출력 없음, 결제 후 즉시 홈 복귀
- Optimistic UI로 네트워크 대기 제거
```

---

## TASK 9: 성능 실측 + 하단 탭바에 POS 추가

**목표**: 측정 없는 최적화는 무의미

### 실행 단계

#### 9-A. Header/Navigation에 POS 메뉴 추가

```tsx
// components/layout/Header.tsx 또는 하단 탭바
const navItems = [
  { href: '/', label: '홈', icon: '🏠' },
  { href: '/frames', label: '재고', icon: '👓' },
  { href: '/pos', label: 'POS', icon: '💳' },                // 신규
  { href: '/inventory/pending', label: '발주', icon: '📦' },  // 신규
];
```

#### 9-B. 간단 성능 측정 스크립트

```typescript
// tools/measure-keypad.ts
// 개발 서버 실행 후 이 스크립트로 측정
// npx tsx tools/measure-keypad.ts

import { chromium } from 'playwright';

async function measure() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  await page.goto('http://localhost:3000/pos');
  await page.waitForLoadState('networkidle');
  
  // 제품 하나 추가해야 결제 버튼 활성화됨
  // (테스트용 seed 데이터가 있다고 가정)
  
  console.log('⚠️ 수동 테스트: Chrome DevTools에서 Performance 탭 열고 측정');
  console.log('목표: 숫자 키 입력 시 16ms 이내 프레임 렌더');
  console.log('측정 방법: React DevTools Profiler → Highlight updates');
  
  await browser.close();
}

measure();
```

#### 9-C. 검증 체크리스트 문서화

`PHASE2_VERIFICATION.md`:

```markdown
# Phase 2 검증 체크리스트

## 정량 검증

### 1. Chrome DevTools Performance 탭
- [ ] Record 시작 → POS에서 숫자 10개 입력 → Record 중지
- [ ] FPS 그래프 60 FPS 유지 확인
- [ ] 각 입력당 메인 스레드 블로킹 < 16ms

### 2. React DevTools Profiler
- [ ] Components 탭 → "Highlight updates when components render" ON
- [ ] 숫자 하나 입력 시 노란 테두리 범위:
  - ✅ KeypadButton, NumberKeypad 내부만
  - ❌ 상위 PosPage, CartView까지 → 실패

### 3. Paint Flashing
- [ ] Rendering 패널에서 Paint Flashing ON
- [ ] 숫자 입력 시 초록 깜빡임 범위:
  - ✅ 키패드 디스플레이 영역만
  - ❌ 화면 절반 이상 → 실패

## 정성 검증 (매장 현장)

- [ ] iPad에서 숫자 누를 때 즉각적 반응
- [ ] 결제 버튼 → 1초 이내 홈 복귀
- [ ] 네트워크 꺼도 판매 진행 가능
- [ ] 판매 후 `/inventory/pending`에서 해당 제품 확인 (stock_quantity가 세팅된 경우)
```

### 커밋 메시지
```
feat(nav): POS/발주 페이지 네비게이션 추가 + 성능 검증 도구

- 하단 탭바에 POS, 발주 대기 메뉴 추가
- tools/measure-keypad.ts 성능 측정 스크립트
- PHASE2_VERIFICATION.md 검증 체크리스트
```

---

# 📊 PHASE 2 자동 실행 마스터 명령어

## Claude Code에 붙여넣을 내용

```
Frame Ops Phase 2 자동 실행을 시작한다.

## 사전 확인 (필수)

먼저 다음을 확인하라:
1. PHASE2_WORK_ORDER_FINAL.md 파일이 프로젝트 루트에 있는가?
2. Phase 1의 11개 커밋이 git log에 있는가?
3. 현재 브랜치가 claude/friendly-knuth-81d7db 또는 동등한 worktree 브랜치인가?
4. .env.local의 SUPABASE_URL이 abexvzqtpyqovytlcgst를 가리키는가?

하나라도 이상하면 즉시 중단하고 보고하라.

## 실행 원칙

1. TASK 0부터 순서대로 진행
2. 각 TASK의 "커밋 메시지"를 그대로 사용
3. SQL 파일 생성은 수행하되 DB 적용은 절대 자동 실행 금지
4. 타입 에러 또는 빌드 실패 시 즉시 중단
5. TASK별 완료 후 진행 보고

## 중단 조건 (명시적)

다음 시점에서 작업을 중단하고 사용자 확인을 받는다:

- TASK 0-1 완료 후: "DB 마이그레이션 수동 적용 완료" 신호 대기
- TASK 1 완료 후: 진단 보고서 승인 대기
- TASK 6 완료 후: RPC SQL 수동 적용 완료 신호 대기
- TASK 7 진입 시: RPC가 DB에 적용되어 있어야 함

## 진행 흐름

### Phase 2-A: 진단 및 DB 준비 (JINY 개입 필요)
- TASK 0-1: fo_sale_items + stock_quantity SQL 생성
  → SQL 파일 생성 후 JINY가 수동 적용
  → "DB 마이그레이션 완료" 신호 대기
- TASK 1: 렌더링 폭주 진단
  → DIAGNOSIS_PHASE2.md 작성
  → JINY 승인 대기

### Phase 2-B: 프론트엔드 최적화 (자동 진행)
- TASK 2: State 격리 아키텍처
- TASK 3: memo + useCallback 전면화
- TASK 4: CSS 렌더링 비용 축소
- TASK 5: Optimistic UI

### Phase 2-C: 백엔드 RPC (JINY 개입 필요)
- TASK 6: RPC 3종 SQL 생성
  → JINY가 수동 적용
  → "RPC 마이그레이션 완료" 신호 대기

### Phase 2-D: POS 구현 및 검증 (자동 진행)
- TASK 7: API Route + RPC 연동
- TASK 8: POS 화면 + 발주 대기 페이지
- TASK 9: 네비게이션 + 성능 검증 도구

### 마지막: PHASE2_FINAL_REPORT.md 생성

## 특별 지침

- 영수증 출력 관련 코드는 절대 추가하지 말 것
- 프린터 연동 관련 코드(Sewoo, ESC/POS, Bluetooth)는 절대 추가하지 말 것
- 재고 기반 판매 차단 로직은 절대 추가하지 말 것 (stock_quantity는 정보용)
- 한국어 주석 유지
- 작업 중 사용자 지시와 실제 코드가 어긋나면 즉시 보고

## 지금 시작

TASK 0-1부터 시작하라.
사전 확인 4가지 후 SQL 파일 생성부터 진행하고,
JINY가 SQL을 Supabase에 적용할 때까지 대기하라.
```

---

# 🎯 Phase 2 완료 후 달성 목표

## 정량 지표

| 지표 | 목표 |
|------|------|
| 키패드 입력 지연 | < 16ms (60 FPS 한 프레임) |
| 결제 → 홈 복귀 | < 500ms |
| 제품 검색 응답 | < 150ms |
| /pos First Load JS | < 150KB |

## 정성 지표

- [ ] 숫자 키 누를 때 화면 깜빡거림 **전혀 없음**
- [ ] 매장 직원이 "Streamlit보다 빠르다"고 느낌
- [ ] 네트워크 끊겨도 판매 진행 가능
- [ ] 영수증 출력 없이도 판매 기록 완전
- [ ] 발주 필요 제품이 `/inventory/pending`에 자동 집계

---

## 📌 최종 체크리스트

**Part 0: DB 준비**
- [ ] TASK 0-1: fo_sale_items + stock_quantity SQL 생성 및 적용

**Part A: 프론트엔드**
- [ ] TASK 1: 진단 (DIAGNOSIS_PHASE2.md)
- [ ] TASK 2: State 격리
- [ ] TASK 3: memo + useCallback
- [ ] TASK 4: CSS 렌더링 비용 축소
- [ ] TASK 5: Optimistic UI

**Part B: 백엔드**
- [ ] TASK 6: RPC 3종 SQL 생성 및 적용
- [ ] TASK 7: API Route + RPC 연동

**Part C: POS 구현**
- [ ] TASK 8: POS 화면 + 발주 대기 페이지
- [ ] TASK 9: 네비게이션 + 성능 검증

---

**작성자**: Claude (Anthropic)  
**예상 소요**: 4-6시간  
**핵심 차별점**: 안경원 업의 본질을 반영한 POS
- 재고 차단 없음 (주문 매입 지원)
- 영수증 없음 (디지털 기반)
- 음수 재고 = 발주 대기 (실무 통찰)
