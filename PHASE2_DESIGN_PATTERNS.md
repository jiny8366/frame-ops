# Phase 2 컴포넌트 설계 기준

**작성일**: 2026-04-23  
**대상**: TASK 8 에서 작성할 신규 POS 컴포넌트들  
**원칙**: 이 문서에 정의된 패턴을 위반한 컴포넌트는 TASK 9 검증(React Profiler 리렌더 범위 체크)을 통과할 수 없다.

---

## 1. State 격리 원칙 (TASK 2 핵심)

### 1.1 왜 격리가 필요한가

입력 중 state(키패드 디지트, 검색 타이핑 중, 수량 ± 버튼 누름)가 **상위 컴포넌트**에 있으면, 매 입력마다:
- 부모 컴포넌트 전체 리렌더
- 형제 컴포넌트(CartView, PriceSummary 등) 리렌더
- 무거운 자식(ProductGrid, Image 다수)도 리렌더

⇒ 사용자가 체감한 "숫자 한 키마다 화면 리로딩 느낌" 이 Next.js 측에서 재현됨.

### 1.2 절대 규칙

**입력 중 state 는 입력 UI 컴포넌트 내부에만 둔다. 부모에는 "확정값" 만 전달한다.**

### 1.3 계약 형태 (Contract)

입력 컴포넌트는 아래 prop 계약을 따른다:

```tsx
interface InputDialogProps<T> {
  initialValue: T;                 // 부모의 현재 확정값
  onConfirm: (value: T) => void;   // 확정 시에만 호출
  onCancel: () => void;            // 취소
  // 옵션: label, maxValue 등 제약
}
```

**금지**:
- `value: T` + `onChange: (v: T) => void` (매 입력마다 부모에 흘려보냄)
- `onDraftChange`, `onInput`, `onType` 같은 "진행 중" 콜백

### 1.4 올바른 구현 패턴

```tsx
// ✅ Good — state 격리
export const NumberKeypad = memo(function NumberKeypad({
  initialValue,
  onConfirm,
  onCancel,
}: Props) {
  // 로컬 state — 부모는 이 변화를 알 수 없음
  const [draft, setDraft] = useState(initialValue.toString());

  const handleDigit = useCallback((d: string) => {
    setDraft(prev => /* ... */);
  }, []);

  const handleConfirm = useCallback(() => {
    onConfirm(parseInt(draft, 10) || 0);
  }, [draft, onConfirm]);

  // 디스플레이도 로컬 draft 기반 — 부모 state 참조 안 함
  return (
    <div>
      <Display value={draft} />
      <DigitButtons onDigit={handleDigit} />
      <button onClick={handleConfirm}>확인</button>
    </div>
  );
});
```

```tsx
// ❌ Bad — 부모에 값을 흘림
export function NumberKeypad({ value, onChange, onConfirm }: Props) {
  const handleDigit = (d: string) => {
    onChange(value + d);  // ← 부모 리렌더 폭주
  };
  // ...
}
```

### 1.5 부모 측 패턴

```tsx
// ✅ Good — 확정값만 관리
export default function PosPage() {
  const [globalDiscount, setGlobalDiscount] = useState(0);  // 확정값
  const [discountOpen, setDiscountOpen] = useState(false);  // 모달 열림 여부
  
  return (
    <>
      <PriceSummary discount={globalDiscount} />  {/* 확정값으로만 렌더 */}
      
      {discountOpen && (
        <NumberKeypad
          initialValue={globalDiscount}
          onConfirm={value => {                      // 확정 시만 1회
            setGlobalDiscount(value);
            setDiscountOpen(false);
          }}
          onCancel={() => setDiscountOpen(false)}
        />
      )}
    </>
  );
}
```

### 1.6 TASK 9 검증 기준

```
React DevTools Profiler → "Highlight updates when components render" ON
→ NumberKeypad 내부에서 숫자 클릭 시:
   ✅ 통과: KeypadButton, NumberKeypad(본체), Display 에만 노란 테두리
   ❌ 실패: PosPage, CartView, PriceSummary 에 노란 테두리
```

---

## 2. memo + 안정 참조 (TASK 3)

### 2.1 인터랙티브 컴포넌트는 기본 memo

```tsx
export const KeypadButton = memo(function KeypadButton({
  digit, onPress, variant = 'primary',
}: KeypadButtonProps) {
  // ...
});
```

기준:
- 자주 클릭되는 UI (버튼, 입력기) → memo 필수
- 정적 레이아웃 (Header, Sidebar) → 선택적
- 무거운 자식을 가진 부모 → memo + prop 안정화

### 2.2 핸들러는 useCallback — 예외 없음

```tsx
// ❌ Bad — 매 렌더 새 함수
<Button onClick={() => handleClick(id)}>삭제</Button>

// ✅ Good — 안정 참조
const handleDelete = useCallback(() => handleClick(id), [id]);
<Button onClick={handleDelete}>삭제</Button>
```

배열 map 내부에서 버튼 렌더링하는 경우:

```tsx
// ❌ Bad — 각 행마다 새 함수, memo 깨짐
{items.map(item => (
  <CartItem
    key={item.id}
    item={item}
    onRemove={() => removeItem(item.id)}     // ← 새 함수
    onQuantityChange={(q) => updateQty(item.id, q)}  // ← 새 함수
  />
))}

// ✅ Good — 핸들러를 자식이 받아 내부에서 id 바인딩
{items.map(item => (
  <CartItem
    key={item.id}
    item={item}
    onRemove={removeItem}            // (cartItemId: string) => void
    onQuantityChange={updateQuantity} // (cartItemId: string, q: number) => void
  />
))}

// CartItem 내부:
const CartItem = memo(function CartItem({ item, onRemove, onQuantityChange }) {
  const handleRemove = useCallback(() => onRemove(item.id), [item.id, onRemove]);
  const handleInc = useCallback(() => onQuantityChange(item.id, item.quantity + 1), [item.id, item.quantity, onQuantityChange]);
  // ...
});
```

### 2.3 객체·배열 prop 은 useMemo

```tsx
// ❌ Bad
<ProductGrid filter={{ brand: brandId, status: 'active' }} />  // 매 렌더 새 객체

// ✅ Good
const filter = useMemo(() => ({ brand: brandId, status: 'active' as const }), [brandId]);
<ProductGrid filter={filter} />
```

### 2.4 ESLint 강화 (TASK 3 에서 설정)

`.eslintrc.json` 에 추가:
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

기존 코드 경고 처리 원칙:
- 가능하면 고친다
- 디자인상 인라인이 자연스러운 극소수만 disable 주석으로 억제
- 형식: `// eslint-disable-next-line react/jsx-no-bind -- Phase 2-Legacy: <사유>, Phase 3에서 정리 예정`

---

## 3. CSS 원칙 (TASK 4)

### 3.1 Apple HIG 베이스 이미 세팅됨
- touch-action: manipulation ✓
- -webkit-tap-highlight-color: transparent ✓
- user-select: none (버튼), text (입력) ✓
- overscroll-behavior ✓
- safe-area insets ✓
- 44pt 터치 타겟 ✓

### 3.2 TASK 4 에서 신규 추가할 것 3가지

```css
/* 1. iOS 입력 필드 줌 방지 — input font-size ≥ 16px 필수 */
input, textarea, select {
  font-size: 16px;
}

/* 2. 터치 피드백 — GPU 합성만 (transform + opacity) */
.pressable {
  transition: transform 0.05s ease-out, opacity 0.05s ease-out;
  will-change: transform;
}
.pressable:active:not(:disabled) {
  transform: scale(0.95);
  opacity: 0.85;
}

/* 3. 모달 backdrop — 모바일은 단순화 */
.modal-backdrop {
  background: rgba(0, 0, 0, 0.4);
  /* 기본값은 blur 없음 */
}
@media (min-width: 1024px) {
  .modal-backdrop--blur {
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
  }
}
```

### 3.3 금지 목록

- `transition: all` (페인트 전체 유발)
- `box-shadow` 애니메이션 (레이아웃 재계산)
- `backdrop-filter` 를 모바일에 무조건 적용 (GPU 버젓)
- `top`/`left`/`width`/`height` 애니메이션 (레이아웃). `transform` 으로 대체.

---

## 4. Optimistic UI 패턴 (TASK 5)

### 4.1 핵심 철학

**"결제 버튼 클릭 → 사용자는 1초 내로 다음 고객 준비 가능해야 한다."**

네트워크 왕복(수백 ms~수 초) 을 기다리게 하지 않는다. UI 는 즉시 "완료" 로 보여주고, 서버 저장은 백그라운드.

### 4.2 안전장치

1. 즉시 토스트 + 라우팅
2. 서버 저장 성공 → IndexedDB 백업
3. 서버 저장 실패 → `sync_queue` 로 오프라인 폴백 (Phase 1 TASK 8 의 DLQ 재활용)
4. `idempotency_key` 필수 — 중복 제출 차단

### 4.3 예시 흐름 (TASK 5 에서 구현)

```tsx
const submit = async (saleData: SaleInput) => {
  // ① 즉시 UI 반영
  toast.success('판매 완료', { duration: 2000 });
  router.push('/');  // 다음 고객 화면

  try {
    // ② 백그라운드 저장
    const sale = await salesApi.create(saleData);
    await dbPut('sales', sale);
  } catch (err) {
    // ③ 실패 시 sync_queue 폴백
    await enqueueSync({
      table: 'orders',
      operation: 'insert',
      payload: saleData,
      created_at: new Date().toISOString(),
      retry_count: 0,
    });
    toast.warning('네트워크 복구 시 자동 전송됩니다.');
  }
};
```

---

## 5. CartItem 타입 설계 방침 (TASK 8)

### 5.1 기존 `types/index.ts`의 CartItem 한계

```tsx
// 현재 types/index.ts
export interface CartItem {
  product: Product;
  quantity: number;
  unit_price: number;
  discount_amount: number;
  total_price: number;
}
```

문제:
- `product: Product` — 전체 Product 객체 임베드. 카트 1줄마다 20+개 컬럼 복제.
- `total_price` — 파생값인데 상태로 저장 → 동기화 리스크 (`unit_price * quantity - discount_amount` 와 어긋날 수 있음).
- `fo_sale_items` DB 스키마와 1:1 대응 안 됨.

### 5.2 Phase 2 의 재설계 (TASK 8 `useCart` 에서 정의)

```tsx
// Phase 2 의 CartItem — fo_sale_items DB 스키마와 1:1 대응
export interface CartItem {
  id: string;                    // 로컬 임시 ID (카트 행 식별용, DB 저장 시 버려짐)
  product_id: string;            // FK
  style_code: string;            // 표시용 캐시 (DB 저장은 product_id 만)
  display_name: string;          // 표시용 캐시
  unit_price: number;            // 판매 시점 단가 고정
  quantity: number;
  discount_amount: number;
  // total_price 없음 — useMemo 로 화면에서만 계산
}
```

하위 호환성 불필요. 기존 `types/index.ts` 의 `CartItem`·`PosState` 는 TASK 8 에서 **교체**(삭제 후 새 shape 로 재작성).

### 5.3 Partial Hydration 원칙

검색 결과 `Product` 에서 카트 `CartItem` 으로 변환 시 필요한 컬럼만 복사:

```tsx
function productToCartItem(p: Product): CartItem {
  return {
    id: `cart-${Date.now()}-${p.id}`,
    product_id: p.id,
    style_code: p.style_code ?? '',
    display_name: p.display_name ?? p.style_code ?? '',
    unit_price: p.sale_price ?? 0,
    quantity: 1,
    discount_amount: 0,
  };
}
```

**전체 Product 객체를 카트에 담지 말 것** — 검색 결과가 revalidate 되거나 뷰가 변하면 카트의 stale 데이터 발생. "판매 시점 스냅샷" 만 유지.

---

## 6. `/api/orders` 처리 방침 (TASK 7)

### 6.1 기존 `/api/orders`
- GET: 매출 목록 (`fo_sales` 조회)
- POST: 단순 `insert` (품목·재고 처리 없음)

### 6.2 Phase 2 대체
- 새 `/api/sales/create` POST — RPC `create_sale_with_items` 호출, 품목 · 재고 차감 · idempotency 포함.
- 기존 `/api/orders` POST 는 **deprecate** 주석 추가 후 **유지**:
  - 이유: `sync_queue` 에 쌓인 레거시 레코드가 `/api/orders` 를 호출할 수 있음 (Phase 1 TASK 8 sync.ts 의 `TABLE_TO_ENDPOINT` 참조).
  - 언제 삭제: sync_queue 비어있고 모든 pending item drained 됐을 때 (Phase 3 이후).

### 6.3 deprecate 주석 형식

```tsx
// Frame Ops Web — /api/orders (→ fo_sales 테이블)
//
// ⚠️ DEPRECATED (Phase 2): 신규 코드는 /api/sales/create 를 사용할 것.
//   이 엔드포인트는 sync_queue 의 레거시 호환을 위해 유지되며,
//   품목(fo_sale_items) 저장 및 재고 차감을 수행하지 않는다.
//   Phase 3에서 sync_queue drain 확인 후 삭제 예정.
```

---

## 7. 검증 프로토콜 요약 (TASK 9 에서 엄격 적용)

| 지점 | 방법 | 통과 기준 |
|---|---|---|
| NumberKeypad 리렌더 범위 | React DevTools Profiler, Highlight updates | KeypadButton + NumberKeypad + Display 만 |
| 프레임당 JS 실행 시간 | Chrome DevTools Performance | 16ms 이내 |
| 페인트 범위 | DevTools Rendering → Paint flashing | LCD 영역만 초록 깜빡임 |
| 결제 → 홈 복귀 | 스톱워치 | < 500ms |
| 키패드 → 숫자 반영 | 스톱워치 | 즉각 (< 16ms) |
| 오프라인 결제 | 네트워크 차단 후 결제 | sync_queue 에 pending 쌓임, 복구 시 자동 전송 |

---

## 8. 이 문서의 역할

- TASK 8 에서 각 컴포넌트를 작성할 때 이 문서의 규칙을 **복사해서 따르지 말고 참조한다**.
- "기존이 이미 잘하던 것"(Phase 1 패턴)과 일관되게. 과잉 복사 금지.
- TASK 9 검증 시 이 문서의 "통과 기준" 을 체크리스트로 사용.
- 위반이 발견되면 해당 컴포넌트로 돌아가 재작성. "예외"는 허용하지 않는다 (Phase 2 성공 기준이 "체감 속도" 이므로).
